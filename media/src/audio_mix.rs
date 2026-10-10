//! Bounded-memory linked-project mixer. MIT DSP and BSD-3-Clause oversampling;
//! hound Apache-2.0 WAV I/O.
//! Apple only supplies float PCM decoding/resampling for other input layouts.
use crate::Result;
use hound::{SampleFormat, WavReader, WavSpec, WavWriter};
use serde_json::Value;
use std::{
    collections::HashMap,
    fs::File,
    io::BufReader,
    path::{Path, PathBuf},
};
const RATE: f64 = 48000.0;
const BLOCK: usize = 1024;
fn finite(v: &Value, key: &str, default: Option<f64>) -> Result<f64> {
    let x = if v.get(key).is_none() {
        default.ok_or_else(|| format!("Missing {key}"))?
    } else {
        v[key].as_f64().ok_or_else(|| format!("Invalid {key}"))?
    };
    if !x.is_finite() {
        return Err(format!("Non-finite {key}"));
    }
    Ok(x)
}
fn positive(v: &Value, key: &str, default: Option<f64>) -> Result<f64> {
    let x = finite(v, key, default)?;
    if x < 0.0 {
        return Err(format!("Negative {key}"));
    }
    Ok(x)
}
fn frames(seconds: f64) -> Result<u32> {
    let x = (seconds * RATE).round();
    if x < 0.0 || x > u32::MAX as f64 {
        return Err("Audio position exceeds WAV frame limits".into());
    }
    Ok(x as u32)
}
#[derive(Clone, Copy)]
enum Curve {
    Linear,
    Exponential,
    Scurve,
}
impl Curve {
    fn parse(v: &Value, key: &str) -> Result<Self> {
        match v.get(key).and_then(Value::as_str).unwrap_or("linear") {
            "linear" => Ok(Self::Linear),
            "exponential" => Ok(Self::Exponential),
            "scurve" => Ok(Self::Scurve),
            _ => Err("Invalid fade curve".into()),
        }
    }
    fn value(self, p: f64) -> f64 {
        let p = p.clamp(0.0, 1.0);
        match self {
            Self::Linear => p,
            Self::Exponential => (6.0 * p).exp_m1() / 6.0f64.exp_m1(),
            Self::Scurve => p * p * (3.0 - 2.0 * p),
        }
    }
}
struct Envelope {
    duration: f64,
    fade_in: f64,
    fade_out: f64,
    in_curve: Curve,
    out_curve: Curve,
}
impl Envelope {
    fn parse(v: &Value, duration: f64) -> Result<Self> {
        let fade_in = positive(v, "fadeInDuration", Some(0.0))?;
        let fade_out = positive(v, "fadeOutDuration", Some(0.0))?;
        if fade_in > duration || fade_out > duration {
            return Err("Fade exceeds audio extent".into());
        }
        Ok(Self {
            duration,
            fade_in,
            fade_out,
            in_curve: Curve::parse(v, "fadeInCurve")?,
            out_curve: Curve::parse(v, "fadeOutCurve")?,
        })
    }
    fn exact(&self, t: f64) -> f64 {
        (if self.fade_in > 0.0 {
            self.in_curve.value(t / self.fade_in)
        } else {
            1.0
        }) * (if self.fade_out > 0.0 {
            self.out_curve.value((self.duration - t) / self.fade_out)
        } else {
            1.0
        })
    }
    // Match scheduleEnvelope's 100 Hz linear ramps, including overlapping curves
    // and the 4096-step cap per interval. Hold the final gain during filter tails.
    fn at(&self, t: f64) -> f64 {
        let t = t.clamp(0.0, self.duration);
        let mut boundaries = [
            0.0,
            self.fade_in,
            self.duration - self.fade_out,
            self.duration,
        ];
        boundaries.sort_by(f64::total_cmp);
        for interval in boundaries.windows(2) {
            let (a, b) = (interval[0], interval[1]);
            if b <= a || t < a || t > b {
                continue;
            }
            let fading = a < self.fade_in || b > self.duration - self.fade_out;
            let steps = if fading {
                ((b - a) * 100.0).ceil().clamp(1.0, 4096.0)
            } else {
                1.0
            };
            let index = ((t - a) / (b - a) * steps).clamp(0.0, steps);
            let lower = index.floor();
            let upper = (lower + 1.0).min(steps);
            let av = self.exact(a + (b - a) * lower / steps);
            let bv = self.exact(a + (b - a) * upper / steps);
            return av + (bv - av) * (index - lower);
        }
        self.exact(t)
    }
}
struct Automation {
    points: Vec<(f64, f64)>,
    cursor: usize,
}
impl Automation {
    fn parse(v: &Value) -> Result<Self> {
        let mut points = Vec::new();
        if let Some(v) = v.as_array() {
            for p in v {
                points.push((positive(p, "time", None)?, positive(p, "value", None)?));
            }
        } else if !v.is_null() {
            return Err("Invalid automation".into());
        }
        points.sort_by(|a, b| a.0.total_cmp(&b.0));
        Ok(Self { points, cursor: 0 })
    }
    fn at(&mut self, t: f64) -> f64 {
        if self.points.is_empty() {
            return 1.0;
        }
        if t <= self.points[0].0 {
            return self.points[0].1;
        }
        while self.cursor + 1 < self.points.len() && t >= self.points[self.cursor + 1].0 {
            self.cursor += 1;
        }
        let a = self.points[self.cursor];
        if self.cursor + 1 == self.points.len() {
            return a.1;
        }
        let b = self.points[self.cursor + 1];
        a.1 + (b.1 - a.1) * (t - a.0) / (b.0 - a.0)
    }
}
struct Biquad {
    b: [f64; 3],
    a: [f64; 2],
    state: [[f64; 2]; 2],
}
impl Biquad {
    fn at(&mut self, input: [f64; 2]) -> [f64; 2] {
        let input = input.map(|v| v as f32 as f64);
        let mut out = [0.0; 2];
        for ch in 0..2 {
            out[ch] = self.b[0] * input[ch] + self.state[ch][0];
            self.state[ch][0] = self.b[1] * input[ch] - self.a[0] * out[ch] + self.state[ch][1];
            self.state[ch][1] = self.b[2] * input[ch] - self.a[1] * out[ch];
        }
        // Web Audio carries float32 buffers between biquad nodes; internal state is double.
        out.map(|v| v as f32 as f64)
    }
}
// State allocation is independent of project duration and capped across all racks.
const MAX_EFFECT_STATE: usize = 64 * 1024 * 1024;
struct EffectBudget {
    bytes: usize,
    count: usize,
}
impl EffectBudget {
    fn reserve(&mut self, bytes: usize) -> Result<()> {
        if self.count >= 1024 || bytes > MAX_EFFECT_STATE - self.bytes {
            return Err("Native effect rack exceeds 1024 effects or 64 MiB state budget".into());
        }
        self.count += 1;
        self.bytes += bytes;
        Ok(())
    }
}
struct Delay {
    history: Vec<[f32; 2]>,
    cursor: usize,
    frames: f64,
    feedback_history: [[f32; 2]; 128],
    feedback_cursor: usize,
    feedback: f64,
    mix: f64,
}
impl Delay {
    fn at(&mut self, input: [f64; 2]) -> [f64; 2] {
        let whole = self.frames.floor() as usize;
        let fraction = self.frames - whole as f64;
        let length = self.history.len();
        // WebKit feeds the cyclic branch from the preceding render quantum.
        // Its direct input still uses the requested delay, including zero.
        for ch in 0..2 {
            self.history[self.cursor][ch] = (input[ch]
                + self.feedback_history[self.feedback_cursor][ch] as f64 * self.feedback)
                as f32;
        }
        let near = self.history[(self.cursor + length - whole) % length];
        let far = self.history[(self.cursor + length - whole - 1) % length];
        let mut output = [0.0; 2];
        for ch in 0..2 {
            let delayed = (near[ch] as f64 + (far[ch] as f64 - near[ch] as f64) * fraction) as f32;
            self.feedback_history[self.feedback_cursor][ch] = delayed;
            output[ch] = input[ch] * (1.0 - self.mix) + delayed as f64 * self.mix;
        }
        self.feedback_cursor = (self.feedback_cursor + 1) % 128;
        self.cursor = (self.cursor + 1) % length;
        output
    }
}
struct Chorus {
    history: Vec<[f32; 2]>,
    cursor: usize,
    rates: [f64; 2],
    depth: f32,
    mix: f64,
}
impl Chorus {
    fn at(&mut self, input: [f64; 2], frame: u32) -> [f64; 2] {
        self.history[self.cursor] = input.map(|v| v as f32);
        let mut wet = [0.0; 2];
        for (rate, base) in self.rates.into_iter().zip([0.02f32, 0.03f32]) {
            let phase = std::f64::consts::TAU * rate * frame as f64 / RATE;
            let seconds = base + phase.sin() as f32 * self.depth;
            let delay = seconds.clamp(0.0, 0.1) as f64 * RATE;
            let whole = delay.floor() as usize;
            let fraction = delay - whole as f64;
            let length = self.history.len();
            let near = self.history[(self.cursor + length - whole) % length];
            let far = self.history[(self.cursor + length - whole - 1) % length];
            for ch in 0..2 {
                wet[ch] += near[ch] as f64 + (far[ch] as f64 - near[ch] as f64) * fraction;
            }
        }
        self.cursor = (self.cursor + 1) % self.history.len();
        std::array::from_fn(|ch| input[ch] * (1.0 - self.mix) + wet[ch] * self.mix)
    }
}
enum Effect {
    Filter(Biquad),
    Compressor(Box<crate::compressor::Compressor>),
    Delay(Box<Delay>),
    Distortion(Box<crate::distortion::Distortion>),
    Reverb(Box<crate::reverb::Reverb>),
    Chorus(Chorus),
    BitCrush { levels: f64, mix: f64 },
    RingMod { frequency: f64, mix: f64 },
}
impl Effect {
    fn at(&mut self, input: [f64; 2], frame: u32) -> [f64; 2] {
        match self {
            Self::Filter(filter) => filter.at(input),
            Self::Compressor(comp) => comp.at(input, frame),
            Self::Delay(delay) => delay.at(input),
            Self::Distortion(distortion) => distortion.at(input),
            Self::Reverb(reverb) => reverb.at(input),
            Self::Chorus(chorus) => chorus.at(input, frame),
            Self::BitCrush { levels, mix } => input.map(|v| {
                // Web Audio interpolates the 65536-entry Float32 waveshaper
                // table; rounding the input directly gives different edges.
                let index = (v.clamp(-1.0, 1.0) + 1.0) * 32767.5;
                let left = index.floor();
                let right = (left + 1.0).min(65535.0);
                let table = |i: f64| {
                    (((i * 2.0 / 65535.0 - 1.0) * *levels).round() / *levels) as f32 as f64
                };
                let wet = table(left) + (table(right) - table(left)) * (index - left);
                v * (1.0 - *mix) + wet * *mix
            }),
            Self::RingMod { frequency, mix } => {
                // Oscillators start at context time zero, even for a later clip.
                let phase = std::f64::consts::TAU * *frequency * frame as f64 / RATE;
                input.map(|v| v * (1.0 - *mix + *mix * phase.sin()))
            }
        }
    }
}
fn filters(effects: &Value, budget: &mut EffectBudget) -> Result<Vec<Effect>> {
    let mut out = Vec::new();
    if effects.is_null() {
        return Ok(out);
    }
    let effects = effects.as_array().ok_or("Invalid effect rack")?;
    for effect in effects.iter().filter(|e| e["enabled"] == true) {
        let params = &effect["params"];
        let kind = effect["type"].as_str().ok_or("Missing effect type")?;
        if kind == "compressor" {
            budget.reserve(std::mem::size_of::<crate::compressor::Compressor>())?;
            out.push(Effect::Compressor(Box::new(
                crate::compressor::Compressor::new(
                    finite(params, "threshold", Some(-24.0))?,
                    finite(params, "knee", Some(5.0))?,
                    finite(params, "ratio", Some(4.0))?,
                    finite(params, "attack", Some(0.003))?,
                    finite(params, "release", Some(0.25))?,
                ),
            )));
            continue;
        }
        if kind == "distortion" {
            let drive = finite(params, "drive", Some(0.5))?.clamp(0.0, 1.0);
            let mix = finite(params, "mix", Some(0.5))?.clamp(0.0, 1.0);
            budget.reserve(std::mem::size_of::<crate::distortion::Distortion>())?;
            out.push(Effect::Distortion(Box::new(
                crate::distortion::Distortion::new(drive, mix),
            )));
            continue;
        }
        if kind == "reverb" {
            let size = finite(params, "size", Some(0.5))?.clamp(0.0, 1.0);
            let decay = finite(params, "decay", Some(1.5))?.max(0.01);
            let mix = finite(params, "mix", Some(0.3))?.clamp(0.0, 1.0);
            budget.reserve(crate::reverb::Reverb::state_bytes(
                crate::reverb::Reverb::length(size),
            ))?;
            out.push(Effect::Reverb(Box::new(crate::reverb::Reverb::new(
                size, decay, mix,
            )?)));
            continue;
        }
        if kind == "chorus" {
            let length = (RATE * 0.1) as usize + 2;
            budget.reserve(length * std::mem::size_of::<[f32; 2]>())?;
            let rate = finite(params, "rate", Some(1.5))?;
            out.push(Effect::Chorus(Chorus {
                history: vec![[0.0; 2]; length],
                cursor: 0,
                rates: [
                    rate.clamp(-RATE / 2.0, RATE / 2.0) as f32 as f64,
                    (rate * 1.2).clamp(-RATE / 2.0, RATE / 2.0) as f32 as f64,
                ],
                depth: (finite(params, "depth", Some(0.5))?.clamp(0.0, 1.0) * 0.01) as f32,
                mix: finite(params, "mix", Some(0.3))?.clamp(0.0, 1.0) as f32 as f64,
            }));
            continue;
        }
        if kind == "delay" {
            // Match measured WebKit direct delay and cyclic feedback latency.
            let time = finite(params, "time", Some(0.3))?.clamp(0.0, 2.0) as f32 as f64;
            let frames = time * RATE;
            let length = frames.ceil() as usize + 2;
            budget.reserve((length + 128) * std::mem::size_of::<[f32; 2]>())?;
            out.push(Effect::Delay(Box::new(Delay {
                history: vec![[0.0; 2]; length],
                cursor: 0,
                frames,
                feedback_history: [[0.0; 2]; 128],
                feedback_cursor: 0,
                feedback: finite(params, "feedback", Some(0.4))?.clamp(0.0, 0.95) as f32 as f64,
                mix: finite(params, "mix", Some(0.3))?.clamp(0.0, 1.0) as f32 as f64,
            })));
            continue;
        }
        budget.reserve(0)?;
        if kind == "bitcrush" || kind == "ringmod" {
            let mix = finite(params, "mix", Some(0.5))?.clamp(0.0, 1.0) as f32 as f64;
            out.push(if kind == "bitcrush" {
                let bits = finite(params, "bits", Some(8.0))?.round().clamp(1.0, 16.0);
                Effect::BitCrush {
                    levels: 2.0f64.powf(bits - 1.0),
                    mix,
                }
            } else {
                Effect::RingMod {
                    frequency: finite(params, "freq", Some(200.0))?.clamp(0.1, RATE / 2.0) as f32
                        as f64,
                    mix,
                }
            });
            continue;
        }
        if matches!(kind, "peaking" | "lowshelf" | "highshelf") {
            let default_freq = match kind {
                "lowshelf" => 200.0,
                "highshelf" => 4000.0,
                _ => 1000.0,
            };
            let freq = finite(params, "freq", Some(default_freq))?.clamp(20.0, 22000.0);
            let gain = finite(params, "gain", Some(0.0))?.clamp(-24.0, 24.0);
            let q = finite(params, "q", Some(1.0))?.clamp(0.1, 20.0);
            let w = std::f64::consts::TAU * freq / RATE;
            let (s, c) = w.sin_cos();
            let amp = 10.0f64.powf(gain / 40.0);
            let (b, a) = if kind == "peaking" {
                let alpha = s / (2.0 * q);
                (
                    [1.0 + alpha * amp, -2.0 * c, 1.0 - alpha * amp],
                    [1.0 + alpha / amp, -2.0 * c, 1.0 - alpha / amp],
                )
            } else {
                // Web Audio shelves use slope S=1 and ignore Q.
                let beta = (2.0 * amp).sqrt() * s;
                if kind == "lowshelf" {
                    (
                        [
                            amp * ((amp + 1.0) - (amp - 1.0) * c + beta),
                            2.0 * amp * ((amp - 1.0) - (amp + 1.0) * c),
                            amp * ((amp + 1.0) - (amp - 1.0) * c - beta),
                        ],
                        [
                            (amp + 1.0) + (amp - 1.0) * c + beta,
                            -2.0 * ((amp - 1.0) + (amp + 1.0) * c),
                            (amp + 1.0) + (amp - 1.0) * c - beta,
                        ],
                    )
                } else {
                    (
                        [
                            amp * ((amp + 1.0) + (amp - 1.0) * c + beta),
                            -2.0 * amp * ((amp - 1.0) + (amp + 1.0) * c),
                            amp * ((amp + 1.0) + (amp - 1.0) * c - beta),
                        ],
                        [
                            (amp + 1.0) - (amp - 1.0) * c + beta,
                            2.0 * ((amp - 1.0) - (amp + 1.0) * c),
                            (amp + 1.0) - (amp - 1.0) * c - beta,
                        ],
                    )
                }
            };
            out.push(Effect::Filter(Biquad {
                b: b.map(|v| v / a[0]),
                a: [a[1] / a[0], a[2] / a[0]],
                state: [[0.0; 2]; 2],
            }));
            continue;
        }
        let low = match kind {
            "lowpass" => true,
            "highpass" => false,
            _ => return Err(format!("Native CLI does not support enabled effect '{kind}'; render this effect in the GUI")),
        };
        let freq = finite(
            &effect["params"],
            "freq",
            Some(if low { 8000.0 } else { 200.0 }),
        )?
        .clamp(
            if low { 20.0 } else { 10.0 },
            if low { 22050.0 } else { 20000.0 },
        );
        // Web Audio defines low/high-pass Q in dB, not linear resonance.
        let q = finite(&effect["params"], "q", Some(1.0))?.clamp(0.0001, 1000.0);
        let omega = 2.0 * std::f64::consts::PI * freq / RATE;
        let cosine = omega.cos();
        let alpha = omega.sin() / (2.0 * 10.0f64.powf(q / 20.0));
        let denominator = 1.0 + alpha;
        let b = if low {
            [(1.0 - cosine) / 2.0, 1.0 - cosine, (1.0 - cosine) / 2.0]
        } else {
            [(1.0 + cosine) / 2.0, -(1.0 + cosine), (1.0 + cosine) / 2.0]
        };
        out.push(Effect::Filter(Biquad {
            b: b.map(|v| v / denominator),
            a: [-2.0 * cosine / denominator, (1.0 - alpha) / denominator],
            state: [[0.0; 2]; 2],
        }));
    }
    Ok(out)
}
fn process(filters: &mut [Effect], mut sample: [f64; 2], frame: u32) -> [f64; 2] {
    for f in filters {
        sample = f.at(sample, frame);
    }
    sample
}
fn pan(sample: [f64; 2], pan: f64, mono: bool) -> [f64; 2] {
    if pan == 0.0 {
        return sample;
    }
    let p = if mono {
        (pan + 1.0) / 2.0
    } else if pan <= 0.0 {
        pan + 1.0
    } else {
        pan
    };
    let angle = p * std::f64::consts::FRAC_PI_2;
    if mono {
        [sample[0] * angle.cos(), sample[0] * angle.sin()]
    } else if pan <= 0.0 {
        [sample[0] + sample[1] * angle.cos(), sample[1] * angle.sin()]
    } else {
        [sample[0] * angle.cos(), sample[1] + sample[0] * angle.sin()]
    }
}
type Reader = WavReader<BufReader<File>>;
fn supported(reader: &Reader) -> bool {
    let s = reader.spec();
    s.sample_rate == RATE as u32
        && (s.channels == 1 || s.channels == 2)
        && match s.sample_format {
            SampleFormat::Float => s.bits_per_sample == 32,
            SampleFormat::Int => [8, 16, 24, 32].contains(&s.bits_per_sample),
        }
}
fn sample(reader: &mut Reader) -> Result<[f64; 2]> {
    let spec = reader.spec();
    let mut next = || -> Result<f64> {
        let value = if spec.sample_format == SampleFormat::Float {
            reader
                .samples::<f32>()
                .next()
                .ok_or("Unexpected end of PCM source")?
                .map_err(|e| e.to_string())? as f64
        } else {
            reader
                .samples::<i32>()
                .next()
                .ok_or("Unexpected end of PCM source")?
                .map_err(|e| e.to_string())? as f64
                / 2.0f64.powi(spec.bits_per_sample as i32 - 1)
        };
        if !value.is_finite() {
            return Err("Non-finite PCM source sample".into());
        }
        Ok(value)
    };
    let l = next()?;
    Ok([l, if spec.channels == 1 { l } else { next()? }])
}
struct Clip {
    reader: Reader,
    remaining: u32,
    start: u32,
    end: u32,
    gain: f64,
    envelope: Envelope,
    filters: Vec<Effect>,
}
struct Track {
    clips: Vec<Clip>,
    start: f64,
    gain: f64,
    pan: f64,
    mono: bool,
    envelope: Envelope,
    automation: Automation,
    filters: Vec<Effect>,
}
/// Streams blocks to an owned staging file, with atomic no-overwrite publication.
pub fn render(doc: &Value, output: &str) -> Result<()> {
    render_wav(doc, output, None)
}
/// Integer PCM export matching Timeline's worker quantisation. Float CLI/video
/// intermediates keep the existing render() endpoint and preserve headroom.
pub fn render_pcm(doc: &Value, output: &str, bit_depth: u16) -> Result<()> {
    if ![8, 16, 24, 32].contains(&bit_depth) {
        return Err("WAV PCM bit depth must be 8, 16, 24 or 32".into());
    }
    if !Path::new(output)
        .extension()
        .is_some_and(|e| e.to_string_lossy().eq_ignore_ascii_case("wav"))
    {
        return Err("PCM audio export requires a .wav filename".into());
    }
    render_wav(doc, output, Some(bit_depth))
}
fn pcm_sample(value: f32, bit_depth: u16) -> i32 {
    let value = value.clamp(-1.0, 1.0) as f64;
    if bit_depth == 8 {
        ((value + 1.0) * 127.5 + 0.5).floor() as i32 - 128
    } else {
        (value * ((1u64 << (bit_depth - 1)) - 1) as f64 + 0.5).floor() as i32
    }
}
fn render_wav(doc: &Value, output: &str, pcm_depth: Option<u16>) -> Result<()> {
    if Path::new(output).exists() {
        return Err("Output already exists".into());
    }
    let project = &doc["project"];
    let duration = positive(project, "duration", None)?;
    // Render from zero to preserve delay/reverb/filter/automation history;
    // publish only the requested sample interval. Export bounds are transient.
    let (first, total) = if let Some(range) = doc.get("renderRange") {
        let start = positive(range, "start", None)?;
        let end = positive(range, "end", None)?;
        if end <= start || end > duration {
            return Err("Invalid audio export range".into());
        }
        (frames(start)?, frames(end)?)
    } else {
        (0, frames(duration)?)
    };
    if total <= first
        || (total - first) as u64 * 2 * (pcm_depth.unwrap_or(32) as u64 / 8) + 128 > u32::MAX as u64
    {
        return Err("Empty arrangement or output exceeds standard WAV size limits".into());
    }
    let tracks = project["tracks"].as_array().ok_or("Missing tracks")?;
    let sources = doc["sources"].as_array().ok_or("Missing sources")?;
    let parent = Path::new(output)
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let directory = tempfile::tempdir_in(parent).map_err(|e| e.to_string())?;
    let mut effect_budget = EffectBudget { bytes: 0, count: 0 };
    let master_gain = positive(project, "masterVolume", Some(1.0))?;
    let mut limiter = if let Some(config) = project.get("outputLimiter") {
        if !config.is_object() || !config["enabled"].is_boolean() {
            return Err("Invalid output limiter".into());
        }
        let ceiling = finite(config, "ceiling", Some(-1.0))?;
        let release = finite(config, "release", Some(0.1))?;
        if config["enabled"] == true {
            Some(crate::limiter::Limiter::new(RATE, ceiling, release))
        } else {
            None
        }
    } else {
        None
    };
    let mut master_filters = filters(&project["masterEffects"], &mut effect_budget)?;
    let solo = tracks.iter().any(|t| t["solo"] == true);
    let mut buses = Vec::new();
    let mut prepared: HashMap<String, (PathBuf, bool, u32)> = HashMap::new();
    let mut clip_count = 0;
    for track in tracks {
        if if solo {
            track["solo"] != true
        } else {
            track["muted"] == true
        } {
            continue;
        }
        let segments = track["segments"].as_array().ok_or("Missing audio clips")?;
        if segments.is_empty() {
            continue;
        }
        let gain = positive(track, "volume", Some(1.0))?;
        let p = finite(track, "pan", Some(0.0))?.clamp(-1.0, 1.0);
        let mut clips = Vec::new();
        let mut start = f64::INFINITY;
        let mut stop = 0.0f64;
        let mut mono = true;
        let track_filters = filters(&track["effects"], &mut effect_budget)?;
        if track_filters
            .iter()
            .any(|e| matches!(e, Effect::Reverb(_) | Effect::Compressor(_)))
        {
            mono = false;
        }
        let automation = Automation::parse(&track["automation"])?;
        for c in segments {
            clip_count += 1;
            if clip_count > 256 {
                return Err(
                    "Native CLI mixer supports at most 256 audible clips per render".into(),
                );
            }
            if crate::jobs::cancelled() {
                return Err("Operation cancelled".into());
            }
            let length = positive(c, "duration", None)?;
            let position = positive(c, "startTime", None)?;
            let offset = positive(c, "sourceOffset", None)?;
            if length == 0.0 || position + length > duration + 1.0 / RATE {
                return Err("Clip exceeds project duration or is empty".into());
            }
            let start_frame = frames(position)?;
            let end_frame = frames(position + length)?;
            if end_frame <= start_frame {
                return Err("Audio clip is shorter than one sample".into());
            }
            let envelope = Envelope::parse(c, length)?;
            let clip_filters = filters(&c["effects"], &mut effect_budget)?;
            if clip_filters
                .iter()
                .any(|e| matches!(e, Effect::Reverb(_) | Effect::Compressor(_)))
            {
                mono = false;
            }
            let clip_gain = positive(c, "gain", Some(1.0))?;
            let source_id = c["sourceId"].as_str().ok_or("Missing audio source ID")?;
            if !prepared.contains_key(source_id) {
                let source = sources
                    .iter()
                    .find(|s| s["id"] == source_id)
                    .ok_or("Missing audio source")?;
                let path=source["path"].as_str().ok_or("CLI render requires linked audio paths; save a linked project in the desktop app")?;
                let direct = WavReader::open(path).ok().filter(supported);
                let (pcm, is_mono, source_end) = if let Some(reader) = direct {
                    (
                        PathBuf::from(path),
                        reader.spec().channels == 1,
                        reader.duration(),
                    )
                } else {
                    let info = crate::probe(path)?;
                    if info.channels < 1 || info.channels > 2 {
                        return Err("Native CLI supports mono/stereo sources; multichannel input needs GUI export".into());
                    }
                    let pcm = directory
                        .path()
                        .join(format!("source-{}.wav", prepared.len()));
                    // Explicit Apple-only decode: never silently delegate inside the native mixer.
                    if crate::apple::attempt(
                        crate::apple::Backend::Apple,
                        &[
                            "audio-f32".into(),
                            path.into(),
                            pcm.to_string_lossy().into_owned(),
                        ],
                        None,
                    )?
                    .is_none()
                    {
                        return Err("Native audio decode unavailable".into());
                    }
                    (pcm, info.channels == 1, frames(info.duration)?)
                };
                prepared.insert(source_id.into(), (pcm, is_mono, source_end));
            }
            let (pcm, is_mono, source_end) = &prepared[source_id];
            mono &= *is_mono;
            let mut reader = WavReader::open(pcm).map_err(|e| e.to_string())?;
            if !supported(&reader) {
                return Err("Unexpected native PCM format".into());
            }
            let source_start = frames(offset)?;
            let requested_end = source_start as u64 + (end_frame - start_frame) as u64;
            // Apple resampling can omit a short final converter tail. Pad at most
            // one millisecond, within the original source's measured extent.
            let tail_budget = if *source_end == reader.duration() {
                1
            } else {
                48
            };
            if requested_end > *source_end as u64 + 1
                || requested_end > reader.duration() as u64 + tail_budget
            {
                return Err("Clip exceeds decoded audio source".into());
            }
            let remaining = reader.duration().saturating_sub(source_start);
            reader.seek(source_start).map_err(|e| e.to_string())?;
            clips.push(Clip {
                reader,
                remaining,
                start: start_frame,
                end: end_frame,
                gain: clip_gain,
                envelope,
                filters: clip_filters,
            });
            start = start.min(position);
            stop = stop.max(position + length);
        }
        buses.push(Track {
            clips,
            start,
            gain,
            pan: p,
            mono,
            envelope: Envelope::parse(track, stop - start)?,
            automation,
            filters: track_filters,
        });
    }
    let staged = directory.path().join("mix.wav");
    let mut writer = WavWriter::create(
        &staged,
        WavSpec {
            channels: 2,
            sample_rate: RATE as u32,
            bits_per_sample: pcm_depth.unwrap_or(32),
            sample_format: if pcm_depth.is_some() {
                SampleFormat::Int
            } else {
                SampleFormat::Float
            },
        },
    )
    .map_err(|e| e.to_string())?;
    for block in (0..total).step_by(BLOCK) {
        if crate::jobs::cancelled() {
            return Err("Operation cancelled".into());
        }
        let length = (total - block).min(BLOCK as u32);
        let mut master = vec![[0.0f64; 2]; length as usize];
        for bus in &mut buses {
            for i in 0..length {
                let frame = block + i;
                let time = frame as f64 / RATE;
                let mut value = [0.0; 2];
                for clip in &mut bus.clips {
                    if (frame < clip.start
                        && !clip
                            .filters
                            .iter()
                            .any(|e| matches!(e, Effect::Compressor(_))))
                        || (frame >= clip.end && clip.filters.is_empty())
                    {
                        continue;
                    }
                    let raw = if frame >= clip.start && frame < clip.end && clip.remaining > 0 {
                        clip.remaining -= 1;
                        sample(&mut clip.reader)?.map(|v| v * clip.gain)
                    } else {
                        [0.0; 2]
                    };
                    let gain = clip
                        .envelope
                        .at(frame.saturating_sub(clip.start) as f64 / RATE);
                    let raw = process(&mut clip.filters, raw, frame);
                    for ch in 0..2 {
                        value[ch] += raw[ch] * gain;
                    }
                }
                let factor = bus.envelope.at(time - bus.start) * bus.automation.at(time);
                value = process(&mut bus.filters, value.map(|v| v * factor), frame);
                value = pan(value.map(|v| v * bus.gain), bus.pan, bus.mono);
                for ch in 0..2 {
                    master[i as usize][ch] += value[ch];
                }
            }
        }
        for (i, sample) in master.into_iter().enumerate() {
            let value =
                process(&mut master_filters, sample, block + i as u32).map(|v| v * master_gain);
            let value = if let Some(limiter) = &mut limiter {
                limiter.at(value)
            } else {
                value
            };
            for value in value {
                let value = value as f32;
                if !value.is_finite() {
                    return Err("Audio mix exceeded finite float range".into());
                }
                if block + (i as u32) < first {
                    continue;
                }
                if let Some(depth) = pcm_depth {
                    writer
                        .write_sample(pcm_sample(value, depth))
                        .map_err(|e| e.to_string())?;
                } else {
                    writer.write_sample(value).map_err(|e| e.to_string())?;
                }
            }
        }
    }
    writer.finalize().map_err(|e| e.to_string())?;
    if crate::jobs::cancelled() {
        return Err("Operation cancelled".into());
    }
    std::fs::hard_link(&staged, output)
        .map_err(|e| format!("Cannot publish native audio mix: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn source(folder: &Path, channels: u16, value: &[f32]) -> PathBuf {
        let path = folder.join("source.wav");
        let mut writer = WavWriter::create(
            &path,
            WavSpec {
                channels,
                sample_rate: 48000,
                bits_per_sample: 32,
                sample_format: SampleFormat::Float,
            },
        )
        .unwrap();
        for _ in 0..4800 {
            for v in value {
                writer.write_sample(*v).unwrap();
            }
        }
        writer.finalize().unwrap();
        path
    }
    fn project(path: &Path) -> Value {
        json!({"project":{"duration":0.08,"tracks":[{"id":"t","volume":1,"pan":0,"segments":[{"sourceId":"s","startTime":0,"sourceOffset":0,"duration":0.08,"gain":1}]}]},"sources":[{"id":"s","path":path}]})
    }
    fn output(path: &Path) -> Vec<f32> {
        WavReader::open(path)
            .unwrap()
            .samples::<f32>()
            .map(|v| v.unwrap())
            .collect()
    }
    #[test]
    fn output_limiter_follows_master_gain_and_preserves_range_history() {
        let folder = tempfile::tempdir().unwrap();
        let input = source(folder.path(), 2, &[0.8, -0.4]);
        let mut doc = project(&input);
        doc["project"]["masterVolume"] = json!(8);
        doc["project"]["outputLimiter"] = json!({"enabled":true,"ceiling":-1,"release":0.1});
        let full = folder.path().join("limited.wav");
        render(&doc, full.to_str().unwrap()).unwrap();
        let samples = output(&full);
        let ceiling = 10.0f64.powf(-1.0 / 20.0) as f32;
        assert!(samples.iter().all(|v| v.abs() <= ceiling + 1e-7));
        assert!(samples[0] > 0.8);
        for pair in samples.chunks(2) {
            assert!((pair[0] + 2.0 * pair[1]).abs() < 1e-6);
        }
        doc["renderRange"] = json!({"start":0.03,"end":0.06});
        let range = folder.path().join("range.wav");
        render(&doc, range.to_str().unwrap()).unwrap();
        assert_eq!(output(&range), samples[2880..5760]);
    }
    #[test]
    fn equalizer_unity_and_reciprocal_bells_preserve_audio() {
        let folder = tempfile::tempdir().unwrap();
        let input = source(folder.path(), 1, &[0.2]);
        let mut doc = project(&input);
        let unity = folder.path().join("unity.wav");
        render(&doc, unity.to_str().unwrap()).unwrap();
        let expected = output(&unity);
        for kind in ["peaking", "lowshelf", "highshelf"] {
            doc["project"]["masterEffects"] =
                json!([{"type":kind,"enabled":true,"params":{"freq":1000,"gain":0,"q":1}}]);
            let filtered = folder.path().join(format!("{kind}.wav"));
            render(&doc, filtered.to_str().unwrap()).unwrap();
            for (a, b) in output(&filtered).iter().zip(&expected) {
                assert!((a - b).abs() < 0.000001);
            }
        }
        doc["project"]["masterEffects"] = json!([{"type":"peaking","enabled":true,"params":{"freq":1000,"gain":12,"q":2}},{"type":"peaking","enabled":true,"params":{"freq":1000,"gain":-12,"q":2}}]);
        let cancel = folder.path().join("cancel.wav");
        render(&doc, cancel.to_str().unwrap()).unwrap();
        for (a, b) in output(&cancel).iter().zip(&expected) {
            assert!((a - b).abs() < 0.000001);
        }
    }
    #[test]
    fn project_master_gain_scales_final_output_and_rejects_negative() {
        let folder = tempfile::tempdir().unwrap();
        let input = source(folder.path(), 1, &[0.2]);
        let mut doc = project(&input);
        let full = folder.path().join("unity.wav");
        render(&doc, full.to_str().unwrap()).unwrap();
        doc["project"]["masterVolume"] = json!(0.5);
        let half = folder.path().join("half.wav");
        render(&doc, half.to_str().unwrap()).unwrap();
        assert_eq!(
            output(&half),
            output(&full).iter().map(|v| v * 0.5).collect::<Vec<_>>()
        );
        doc["project"]["masterVolume"] = json!(-1);
        assert!(render(&doc, half.to_str().unwrap()).is_err());
    }
    #[test]
    fn range_matches_full_mix_slice_including_effect_history() {
        let folder = tempfile::tempdir().unwrap();
        let input = source(folder.path(), 1, &[0.2]);
        let mut doc = project(&input);
        doc["project"]["tracks"][0]["automation"] =
            json!([{"time":0,"value":0.1},{"time":0.08,"value":0.9}]);
        doc["project"]["masterEffects"] = json!([{"type":"delay","enabled":true,"params":{"time":0.01,"feedback":0.4,"mix":0.5}},{"type":"compressor","enabled":true,"params":{"threshold":-24,"ratio":3,"attack":0.005,"release":0.1,"knee":6}}]);
        let full = folder.path().join("full.wav");
        render(&doc, full.to_str().unwrap()).unwrap();
        doc["renderRange"] = json!({"start":0.03001,"end":0.07001});
        let range = folder.path().join("range.wav");
        render(&doc, range.to_str().unwrap()).unwrap();
        assert_eq!(
            output(&range),
            output(&full)
                [frames(0.03001).unwrap() as usize * 2..frames(0.07001).unwrap() as usize * 2]
        );
        for bounds in [
            json!({"start":-1,"end":0.07}),
            json!({"start":0.04,"end":0.03}),
            json!({"start":0,"end":0.2}),
            json!({"start":0.03,"end":0.030001}),
        ] {
            doc["renderRange"] = bounds;
            let target = folder.path().join("invalid.wav");
            assert!(render(&doc, target.to_str().unwrap()).is_err());
            assert!(!target.exists());
        }
    }
    #[test]
    fn pcm_depths_preserve_gui_rounding_silence_polarity_and_clip_headroom() {
        let folder = tempfile::tempdir().unwrap();
        let input = source(folder.path(), 1, &[0.0, -0.5, 0.5, -2.0, 2.0]);
        let expected: [(u16, [i32; 5]); 4] = [
            (8, [0, -64, 63, -128, 127]),
            (16, [0, -16383, 16384, -32767, 32767]),
            (24, [0, -4194303, 4194304, -8388607, 8388607]),
            (32, [0, -1073741823, 1073741824, -2147483647, 2147483647]),
        ];
        for (depth, values) in expected {
            let target = folder.path().join(format!("pcm-{depth}.wav"));
            render_pcm(&project(&input), target.to_str().unwrap(), depth).unwrap();
            let mut reader = WavReader::open(&target).unwrap();
            assert_eq!(reader.spec().sample_format, SampleFormat::Int);
            assert_eq!(reader.spec().bits_per_sample, depth);
            assert_eq!(reader.spec().channels, 2);
            let samples: Vec<i32> = reader.samples::<i32>().map(|v| v.unwrap()).collect();
            for (i, v) in values.into_iter().enumerate() {
                assert_eq!(&samples[i * 2..i * 2 + 2], &[v, v]);
            }
            assert_eq!(samples.len(), 7680);
            assert!(render_pcm(&project(&input), target.to_str().unwrap(), depth).is_err());
        }
        let bad = folder.path().join("invalid.wav");
        assert!(render_pcm(&project(&input), bad.to_str().unwrap(), 12).is_err());
        assert!(!bad.exists());
    }
    fn impulse(folder: &Path) -> PathBuf {
        let path = source(folder, 2, &[0.0, 0.0]);
        let mut writer = WavWriter::create(
            &path,
            WavSpec {
                channels: 2,
                sample_rate: 48000,
                bits_per_sample: 32,
                sample_format: SampleFormat::Float,
            },
        )
        .unwrap();
        writer.write_sample(1.0f32).unwrap();
        writer.write_sample(-0.5f32).unwrap();
        for _ in 1..4800 {
            writer.write_sample(0.0f32).unwrap();
            writer.write_sample(0.0f32).unwrap();
        }
        writer.finalize().unwrap();
        path
    }
    #[test]
    fn delay_retains_stereo_echo_tails_after_a_one_frame_clip() {
        let folder = tempfile::tempdir().unwrap();
        let input = impulse(folder.path());
        for (time, first, next) in [(0.0, 0, 128), (0.001, 48, 224)] {
            let mut doc = project(&input);
            let clip = &mut doc["project"]["tracks"][0]["segments"][0];
            clip["duration"] = json!(1.0 / RATE);
            clip["effects"] = json!([{"type":"delay","enabled":true,"params":{"time":time,"feedback":0.5,"mix":1}}]);
            let target = folder.path().join(format!("delay-{time}.wav"));
            render(&doc, target.to_str().unwrap()).unwrap();
            let pcm = output(&target);
            assert!((pcm[first * 2] - 1.0).abs() < 1e-5);
            assert!((pcm[next * 2] - 0.5).abs() < 1e-5);
            assert!((pcm[next * 2 + 1] + 0.25).abs() < 1e-5);
            assert_eq!(pcm.len(), 7680); // tails stay within the chosen canvas
        }
    }
    #[test]
    fn reverb_keeps_stereo_tail_after_clip_and_finishes_inside_canvas() {
        let folder = tempfile::tempdir().unwrap();
        let input = impulse(folder.path());
        let mut doc = project(&input);
        doc["project"]["duration"] = json!(0.15);
        let clip = &mut doc["project"]["tracks"][0]["segments"][0];
        clip["duration"] = json!(1.0 / RATE);
        clip["effects"] =
            json!([{"type":"reverb","enabled":true,"params":{"size":0,"decay":1.5,"mix":1}}]);
        let target = folder.path().join("reverb.wav");
        render(&doc, target.to_str().unwrap()).unwrap();
        let pcm = output(&target);
        assert!(pcm[0] > 0.3); // GUI retains 30% dry even at mix=1
        assert!(pcm[64].abs() > 0.0001);
        assert!(pcm[65] < 0.0);
        assert!(pcm[4799 * 2].abs() > 0.0001);
        assert!(pcm[6000 * 2..].iter().all(|v| v.abs() < 1e-7));
        assert_eq!(pcm.len(), 14400);
    }
    #[test]
    fn oversampled_distortion_keeps_the_wet_tail_after_a_one_frame_clip() {
        let folder = tempfile::tempdir().unwrap();
        let input = impulse(folder.path());
        let mut doc = project(&input);
        let clip = &mut doc["project"]["tracks"][0]["segments"][0];
        clip["duration"] = json!(1.0 / RATE);
        clip["effects"] =
            json!([{"type":"distortion","enabled":true,"params":{"drive":0.5,"mix":1}}]);
        let target = folder.path().join("distortion.wav");
        render(&doc, target.to_str().unwrap()).unwrap();
        let pcm = output(&target);
        assert!(pcm[192 * 2] > 0.01);
        assert!(pcm[192 * 2 + 1] < -0.01);
        assert!(pcm[600 * 2..].iter().all(|v| v.abs() < 1e-7));
        assert_eq!(pcm.len(), 7680);
    }
    #[test]
    fn fractional_delay_interpolates_impulses() {
        let folder = tempfile::tempdir().unwrap();
        let input = impulse(folder.path());
        let mut doc = project(&input);
        doc["project"]["masterEffects"] =
            json!([{"type":"delay","enabled":true,"params":{"time":0.0001,"feedback":0,"mix":1}}]);
        let target = folder.path().join("fractional.wav");
        render(&doc, target.to_str().unwrap()).unwrap();
        let pcm = output(&target);
        assert!((pcm[8] - 0.2).abs() < 1e-6);
        assert!((pcm[10] - 0.8).abs() < 1e-6);
        assert_eq!(pcm[12], 0.0);
    }
    #[test]
    fn chorus_has_two_delay_lines_and_preserves_dry_endpoint() {
        let folder = tempfile::tempdir().unwrap();
        let input = impulse(folder.path());
        for mix in [0.0, 1.0] {
            let mut doc = project(&input);
            let clip = &mut doc["project"]["tracks"][0]["segments"][0];
            clip["duration"] = json!(1.0 / RATE);
            clip["effects"] =
                json!([{"type":"chorus","enabled":true,"params":{"rate":0,"depth":0,"mix":mix}}]);
            let target = folder.path().join(format!("chorus-{mix}.wav"));
            render(&doc, target.to_str().unwrap()).unwrap();
            let pcm = output(&target);
            assert_eq!(pcm[0], 1.0 - mix as f32);
            for frame in [960, 1440] {
                assert!((pcm[frame * 2] - mix as f32).abs() < 1e-4);
                assert!((pcm[frame * 2 + 1] + mix as f32 * 0.5).abs() < 1e-4);
            }
        }
    }
    #[test]
    fn effect_state_and_count_limits_fail_before_allocating() {
        let delay = json!([{"type":"delay","enabled":true,"params":{"time":2}}]);
        let mut budget = EffectBudget {
            bytes: MAX_EFFECT_STATE - 100,
            count: 0,
        };
        assert!(filters(&delay, &mut budget).is_err());
        assert_eq!(budget.bytes, MAX_EFFECT_STATE - 100);
        assert_eq!(budget.count, 0);
        let reverb = json!([{ "type": "reverb", "enabled": true, "params": { "size": 1 } }]);
        assert!(filters(&reverb, &mut budget).is_err());
        assert_eq!(budget.bytes, MAX_EFFECT_STATE - 100);
        assert_eq!(budget.count, 0);
        let mut budget = EffectBudget {
            bytes: 0,
            count: 1024,
        };
        assert!(filters(&delay, &mut budget).is_err());
        assert_eq!(budget.bytes, 0);
        assert!(filters(
            &json!([{"type":"delay","enabled":false,"params":{"time":"invalid"}}]),
            &mut budget
        )
        .unwrap()
        .is_empty());
    }
    #[test]
    fn bitcrusher_preserves_silence_and_blends_quantized_pcm() {
        let folder = tempfile::tempdir().unwrap();
        for (value, mix, expected) in [
            (0.0f32, 1.0, 0.0),
            (0.22, 1.0, 0.25),
            (-0.22, 1.0, -0.25),
            (0.22, 0.5, 0.235),
            (0.22, 0.0, 0.22),
        ] {
            let input = source(folder.path(), 1, &[value]);
            let mut doc = project(&input);
            doc["project"]["tracks"][0]["segments"][0]["effects"] =
                json!([{"type":"bitcrush","enabled":true,"params":{"bits":4,"mix":mix}}]);
            let target = folder.path().join(format!("mix-{value}-{mix}.wav"));
            render(&doc, target.to_str().unwrap()).unwrap();
            assert!((output(&target)[200] - expected).abs() < 1e-6);
        }
    }
    #[test]
    fn ring_modulation_uses_project_clock_and_wet_dry_mix() {
        let folder = tempfile::tempdir().unwrap();
        let input = source(folder.path(), 1, &[0.25]);
        for mix in [0.0, 0.5, 1.0] {
            let mut doc = project(&input);
            let clip = &mut doc["project"]["tracks"][0]["segments"][0];
            clip["startTime"] = json!(0.01);
            clip["duration"] = json!(0.05);
            clip["effects"] =
                json!([{"type":"ringmod","enabled":true,"params":{"freq":100,"mix":mix}}]);
            let target = folder.path().join(format!("ring-{mix}.wav"));
            render(&doc, target.to_str().unwrap()).unwrap();
            let pcm = output(&target);
            assert_eq!(pcm[100], 0.0);
            for (frame, carrier) in [(480, 0.0), (600, 1.0), (840, -1.0)] {
                assert!((pcm[frame * 2] as f64 - 0.25 * (1.0 - mix + mix * carrier)).abs() < 1e-6);
            }
        }
    }
    #[test]
    fn overlapping_clips_solo_pan_fades_automation_and_silent_tail() {
        let folder = tempfile::tempdir().unwrap();
        let input = source(folder.path(), 1, &[0.25]);
        let mut doc = project(&input);
        doc["project"]["tracks"] = json!([
            {"solo":true,"muted":true,"volume":0.8,"pan":1,"fadeInDuration":0.02,"fadeOutDuration":0.02,"automation":[{"time":0.02,"value":0},{"time":0.04,"value":0.8},{"time":0.06,"value":0}],"segments":[
                {"sourceId":"s","startTime":0.02,"sourceOffset":0,"duration":0.04,"gain":0.5},
                {"sourceId":"s","startTime":0.03,"sourceOffset":0.005,"duration":0.02,"gain":0.25}]},
            {"solo":false,"volume":100,"segments":[{"sourceId":"s","startTime":0,"sourceOffset":0,"duration":0.08}]}]);
        let target = folder.path().join("mix.wav");
        render(&doc, target.to_str().unwrap()).unwrap();
        let pcm = output(&target);
        assert_eq!(pcm.len(), 7680);
        let at = |frame: usize| [pcm[frame * 2], pcm[frame * 2 + 1]];
        assert_eq!(at(480), [0.0, 0.0]);
        assert!((at(1440)[1] - 0.03).abs() < 1e-6);
        assert!((at(1920)[1] - 0.12).abs() < 1e-6);
        assert!(at(1920)[0].abs() < 1e-8);
        assert_eq!(at(3360), [0.0, 0.0]);
    }
    #[test]
    fn stereo_pan_sums_channels_without_clipping_and_never_overwrites() {
        let folder = tempfile::tempdir().unwrap();
        let input = source(folder.path(), 2, &[0.75, 0.5]);
        let mut doc = project(&input);
        doc["project"]["tracks"][0]["pan"] = json!(-1);
        let target = folder.path().join("mix.wav");
        render(&doc, target.to_str().unwrap()).unwrap();
        let pcm = output(&target);
        assert_eq!(&pcm[200..202], &[1.25, 0.0]);
        let original = std::fs::read(&target).unwrap();
        assert!(render(&doc, target.to_str().unwrap()).is_err());
        assert_eq!(std::fs::read(target).unwrap(), original);
    }
    #[test]
    fn source_offset_selects_real_pcm_frames() {
        let folder = tempfile::tempdir().unwrap();
        let input = source(folder.path(), 1, &[0.25]);
        let mut writer = WavWriter::create(
            &input,
            WavSpec {
                channels: 1,
                sample_rate: 48000,
                bits_per_sample: 32,
                sample_format: SampleFormat::Float,
            },
        )
        .unwrap();
        for i in 0..4800 {
            writer
                .write_sample(if i < 1000 { 0.1f32 } else { 0.3f32 })
                .unwrap();
        }
        writer.finalize().unwrap();
        let mut doc = project(&input);
        doc["project"]["tracks"][0]["segments"][0]["sourceOffset"] = json!(1000.0 / 48000.0);
        doc["project"]["tracks"][0]["segments"][0]["duration"] = json!(0.07);
        let target = folder.path().join("mix.wav");
        render(&doc, target.to_str().unwrap()).unwrap();
        assert!((output(&target)[0] - 0.3).abs() < 1e-7);
    }
    #[test]
    fn integer_pcm_depths_are_normalized_without_quantizing_to_16_bit() {
        let folder = tempfile::tempdir().unwrap();
        for bits in [8u16, 16, 24, 32] {
            let source = folder.path().join(format!("int-{bits}.wav"));
            let mut writer = WavWriter::create(
                &source,
                WavSpec {
                    channels: 1,
                    sample_rate: 48000,
                    bits_per_sample: bits,
                    sample_format: SampleFormat::Int,
                },
            )
            .unwrap();
            let amplitude = -(1i32 << (bits - 2));
            for _ in 0..4800 {
                writer.write_sample(amplitude).unwrap();
            }
            writer.finalize().unwrap();
            let target = folder.path().join(format!("float-{bits}.wav"));
            render(&project(&source), target.to_str().unwrap()).unwrap();
            assert_eq!(output(&target)[0], -0.5, "{bits}-bit normalization");
        }
    }
    #[test]
    fn unsupported_effects_bad_bounds_and_cancellation_leave_no_output() {
        let folder = tempfile::tempdir().unwrap();
        let input = source(folder.path(), 1, &[0.25]);
        let mut doc = project(&input);
        let target = folder.path().join("mix.wav");
        doc["project"]["masterEffects"] =
            json!([{"type":"unsupported-test-effect","enabled":true,"params":{}}]);
        assert!(render(&doc, target.to_str().unwrap())
            .unwrap_err()
            .contains("GUI"));
        assert!(!target.exists());
        doc["project"]["masterEffects"] = json!([]);
        doc["project"]["tracks"][0]["segments"][0]["sourceOffset"] = json!(1.0);
        assert!(render(&doc, target.to_str().unwrap())
            .unwrap_err()
            .contains("source"));
        assert!(!target.exists());
        doc["project"]["tracks"][0]["segments"][0]["sourceOffset"] = json!(0.0);
        let id = format!("mix-cancel-{}", std::process::id());
        let inside = id.clone();
        assert!(crate::jobs::run(Some(id), || {
            assert!(crate::jobs::cancel(&inside));
            render(&doc, target.to_str().unwrap())
        })
        .unwrap_err()
        .contains("cancelled"));
        assert!(!target.exists());
        assert_eq!(std::fs::read_dir(folder.path()).unwrap().count(), 1);
    }
}

#[cfg(all(test, target_os = "macos"))]
mod native_integration {
    use super::*;
    use serde_json::json;
    use std::process::Command;
    #[test]
    #[ignore = "Requires Apple audio resampling/video export and FFmpeg reference tools"]
    fn apple_resampled_float_mix_and_complete_section_video() {
        let folder = tempfile::tempdir().unwrap();
        let input = folder.path().join("mono-44100.wav");
        let picture = folder.path().join("picture.mp4");
        assert!(Command::new("ffmpeg")
            .args([
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:sample_rate=44100:duration=1",
                "-c:a",
                "pcm_s24le"
            ])
            .arg(&input)
            .status()
            .unwrap()
            .success());
        assert!(Command::new("ffmpeg")
            .args([
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=red:s=128x72:r=25:d=1",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p"
            ])
            .arg(&picture)
            .status()
            .unwrap()
            .success());
        let doc = json!({"format":"crispaudio-project","version":3,"project":{"duration":1,"tracks":[{"id":"t","volume":0.5,"pan":0,"segments":[{"id":"c","trackId":"t","sourceId":"s","startTime":0.05,"sourceOffset":0.1,"duration":0.9,"gain":1}]}],"video":{"path":picture,"backend":"apple","duration":1,"inPoint":0.2,"outPoint":0.8}},"sources":[{"id":"s","path":input}]});
        let mix = folder.path().join("mix.wav");
        render(&doc, mix.to_str().unwrap()).unwrap();
        let reader = WavReader::open(&mix).unwrap();
        assert_eq!(reader.spec().sample_format, SampleFormat::Float);
        assert_eq!(reader.duration(), 48000);
        let samples = reader
            .into_samples::<f32>()
            .map(|v| v.unwrap())
            .collect::<Vec<_>>();
        assert!(samples[..4800].iter().all(|v| *v == 0.0));
        assert!(samples[10000..20000].iter().any(|v| v.abs() > 0.04));
        assert!(samples[91200..].iter().all(|v| *v == 0.0));
        let output = folder.path().join("section.mp4");
        crate::project_edit::render_project(&doc, output.to_str().unwrap(), true).unwrap();
        let probe = Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-show_streams",
                "-show_format",
                "-of",
                "json",
            ])
            .arg(&output)
            .output()
            .unwrap();
        assert!(probe.status.success());
        let info: Value = serde_json::from_slice(&probe.stdout).unwrap();
        assert!(
            (info["format"]["duration"]
                .as_str()
                .unwrap()
                .parse::<f64>()
                .unwrap()
                - 0.6)
                .abs()
                < 0.05
        );
        assert!(info["streams"]
            .as_array()
            .unwrap()
            .iter()
            .any(|s| s["codec_name"] == "aac"));
        let decoded = Command::new("ffmpeg")
            .args(["-v", "error", "-i"])
            .arg(output)
            .args(["-t", "0.1", "-vn", "-f", "f32le", "pipe:1"])
            .output()
            .unwrap();
        assert!(decoded.status.success());
        assert!(decoded
            .stdout
            .chunks_exact(4)
            .any(|v| f32::from_le_bytes(v.try_into().unwrap()).abs() > 0.03));
    }
}
