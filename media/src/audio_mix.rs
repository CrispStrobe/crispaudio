//! Bounded-memory linked-project mixer. Own MIT DSP; hound Apache-2.0 WAV I/O.
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
        let mut out = [0.0; 2];
        for ch in 0..2 {
            out[ch] = self.b[0] * input[ch] + self.state[ch][0];
            self.state[ch][0] = self.b[1] * input[ch] - self.a[0] * out[ch] + self.state[ch][1];
            self.state[ch][1] = self.b[2] * input[ch] - self.a[1] * out[ch];
        }
        out
    }
}
fn filters(effects: &Value) -> Result<Vec<Biquad>> {
    let mut out = Vec::new();
    if effects.is_null() {
        return Ok(out);
    }
    let effects = effects.as_array().ok_or("Invalid effect rack")?;
    for effect in effects.iter().filter(|e| e["enabled"] == true) {
        let low=match effect["type"].as_str(){Some("lowpass")=>true,Some("highpass")=>false,_=>return Err("Native CLI supports low/high-pass filters only; render other enabled effects in the GUI".into())};
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
        out.push(Biquad {
            b: b.map(|v| v / denominator),
            a: [-2.0 * cosine / denominator, (1.0 - alpha) / denominator],
            state: [[0.0; 2]; 2],
        });
    }
    Ok(out)
}
fn process(filters: &mut [Biquad], mut sample: [f64; 2]) -> [f64; 2] {
    for f in filters {
        sample = f.at(sample);
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
    filters: Vec<Biquad>,
}
struct Track {
    clips: Vec<Clip>,
    start: f64,
    gain: f64,
    pan: f64,
    mono: bool,
    envelope: Envelope,
    automation: Automation,
    filters: Vec<Biquad>,
}
/// Streams blocks to an owned staging file, with atomic no-overwrite publication.
pub fn render(doc: &Value, output: &str) -> Result<()> {
    if Path::new(output).exists() {
        return Err("Output already exists".into());
    }
    let project = &doc["project"];
    let duration = positive(project, "duration", None)?;
    let total = frames(duration)?;
    if total == 0 || total as u64 * 8 + 128 > u32::MAX as u64 {
        return Err("Empty arrangement or output exceeds standard WAV size limits".into());
    }
    let tracks = project["tracks"].as_array().ok_or("Missing tracks")?;
    let sources = doc["sources"].as_array().ok_or("Missing sources")?;
    let parent = Path::new(output)
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let directory = tempfile::tempdir_in(parent).map_err(|e| e.to_string())?;
    let mut master_filters = filters(&project["masterEffects"])?;
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
        let track_filters = filters(&track["effects"])?;
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
            let clip_filters = filters(&c["effects"])?;
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
            bits_per_sample: 32,
            sample_format: SampleFormat::Float,
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
                    if frame < clip.start || (frame >= clip.end && clip.filters.is_empty()) {
                        continue;
                    }
                    let raw = if frame < clip.end && clip.remaining > 0 {
                        clip.remaining -= 1;
                        sample(&mut clip.reader)?.map(|v| v * clip.gain)
                    } else {
                        [0.0; 2]
                    };
                    let gain = clip.envelope.at((frame - clip.start) as f64 / RATE);
                    let raw = process(&mut clip.filters, raw);
                    for ch in 0..2 {
                        value[ch] += raw[ch] * gain;
                    }
                }
                let factor = bus.envelope.at(time - bus.start) * bus.automation.at(time);
                value = process(&mut bus.filters, value.map(|v| v * factor));
                value = pan(value.map(|v| v * bus.gain), bus.pan, bus.mono);
                for ch in 0..2 {
                    master[i as usize][ch] += value[ch];
                }
            }
        }
        for frame in master {
            for value in process(&mut master_filters, frame) {
                let value = value as f32;
                if !value.is_finite() {
                    return Err("Audio mix exceeded finite float range".into());
                }
                writer.write_sample(value).map_err(|e| e.to_string())?;
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
        doc["project"]["masterEffects"] = json!([{"type":"compressor","enabled":true,"params":{}}]);
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
