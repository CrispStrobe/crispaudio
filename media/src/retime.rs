//! Non-destructive derived media. The arrangement still renders ordinary sources.
use crate::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub offset: f64,
    pub duration: f64,
    pub rate: f64,
    pub reverse: bool,
    pub preserve_pitch: bool,
    pub semitones: f64,
    pub video: bool,
    pub frame_rate: f64,
}
impl Settings {
    pub fn validate(&self) -> Result<()> {
        if ![
            self.offset,
            self.duration,
            self.rate,
            self.semitones,
            self.frame_rate,
        ]
        .iter()
        .all(|n| n.is_finite())
            || self.offset < 0.0
            || self.duration <= 0.0
            || !(0.25..=4.0).contains(&self.rate)
            || !(-24.0..=24.0).contains(&self.semitones)
            || !(1.0..=120.0).contains(&self.frame_rate)
        {
            return Err("Invalid retime settings (rate 0.25..4, pitch -24..24)".into());
        }
        Ok(())
    }
}
/// Stereo-linked WSOLA: a single correlation-selected splice preserves channel phase.
/// A bounded 21 ms window / 5 ms hop is suited to voiceovers, not archival mastering.
fn stretch(input: &[[f32; 2]], length: usize) -> Result<Vec<[f32; 2]>> {
    if input.len() == length {
        return Ok(input.to_vec());
    }
    let mut output = vec![[0.0; 2]; length];
    if input.is_empty() || length == 0 {
        return Ok(output);
    }
    let window = 1024usize.min(input.len());
    let hop = (window / 4).max(1);
    let search = 256usize.min(window / 2);
    let mut weight = vec![0f32; length];
    let ratio = input.len() as f64 / length as f64;
    let mut previous = 0usize;
    for target in (0..length).step_by(hop) {
        if crate::jobs::cancelled() {
            return Err("Operation cancelled".into());
        }
        let expected =
            ((target as f64 * ratio).round() as usize).min(input.len().saturating_sub(window));
        let mut chosen = expected;
        if target > 0 && window > hop {
            let low = expected
                .saturating_sub(search)
                .max(previous.saturating_sub(hop));
            let high = (expected + search).min(input.len().saturating_sub(window));
            let mut best = f64::NEG_INFINITY;
            for candidate in (low..=high).step_by(4) {
                let mut dot = 0.0;
                let mut a = 0.0;
                let mut b = 0.0;
                for i in (0..window - hop).step_by(4) {
                    if target + i >= length {
                        break;
                    }
                    let w = weight[target + i];
                    if w <= 1e-8 {
                        continue;
                    }
                    for ch in 0..2 {
                        let x = (output[target + i][ch] / w) as f64;
                        let y = input[candidate + i][ch] as f64;
                        dot += x * y;
                        a += x * x;
                        b += y * y;
                    }
                }
                let score = if a * b > 1e-16 {
                    dot / (a * b).sqrt()
                } else {
                    0.0
                } - 1e-7 * (candidate.abs_diff(expected) as f64);
                if score > best {
                    best = score;
                    chosen = candidate;
                }
            }
        }
        previous = chosen;
        for i in 0..window {
            if target + i >= length {
                break;
            }
            let w = (std::f64::consts::PI * (i as f64 + 0.5) / window as f64)
                .sin()
                .powi(2) as f32;
            for ch in 0..2 {
                output[target + i][ch] += input[chosen + i][ch] * w;
            }
            weight[target + i] += w;
        }
    }
    for (frame, w) in output.iter_mut().zip(weight) {
        if w > 0.0 {
            frame[0] /= w;
            frame[1] /= w;
        }
    }
    Ok(output)
}
pub fn process(input: &[[f32; 2]], settings: &Settings) -> Result<Vec<[f32; 2]>> {
    settings.validate()?;
    if input.is_empty() {
        return Err("Empty retime input".into());
    }
    let length = (input.len() as f64 / settings.rate).round() as usize;
    if length.saturating_mul(8) > 256 * 1024 * 1024 {
        return Err("Retimed audio exceeds the 256 MiB buffer budget".into());
    }
    let pitch = 2f64.powf(settings.semitones / 12.0);
    let step = if settings.preserve_pitch {
        pitch
    } else {
        settings.rate * pitch
    };
    let samples = (input.len() as f64 / step).round() as usize;
    if samples.saturating_mul(8) > 256 * 1024 * 1024 {
        return Err("Pitch intermediate exceeds the 256 MiB buffer budget".into());
    }
    let mut resampled = Vec::with_capacity(samples);
    for i in 0..samples {
        let p = i as f64 * step;
        let a = (p.floor() as usize).min(input.len().saturating_sub(1));
        let b = (a + 1).min(input.len().saturating_sub(1));
        let f = (p - p.floor()) as f32;
        let at = |n: usize| {
            if settings.reverse {
                input[input.len() - 1 - n]
            } else {
                input[n]
            }
        };
        let x = at(a);
        let y = at(b);
        resampled.push([x[0] + (y[0] - x[0]) * f, x[1] + (y[1] - x[1]) * f]);
    }
    stretch(&resampled, length)
}
/// Publication is no-clobber; failed/cancelled processing owns only its staging file.
pub fn derive(path: &str, output: &str, settings: &Settings) -> Result<()> {
    settings.validate()?;
    if Path::new(output).exists() {
        return Err("Output already exists".into());
    }
    let parent = Path::new(output)
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let directory = tempfile::tempdir_in(parent).map_err(|e| e.to_string())?;
    let stage = directory.path().join(if settings.video {
        "retimed.mp4"
    } else {
        "retimed.wav"
    });
    let info = crate::probe(path)?;
    if !settings.video && !(1..=2).contains(&info.channels) {
        return Err("Retiming supports mono/stereo sources".into());
    }
    if settings.offset + settings.duration > info.duration + 1.0 / 48000.0 {
        return Err("Retime interval exceeds source".into());
    }
    if settings.video {
        let args = vec![
            "retime-video".into(),
            path.into(),
            stage.to_string_lossy().into_owned(),
            serde_json::to_string(settings).map_err(|e| e.to_string())?,
        ];
        if crate::apple::attempt(crate::apple::Backend::configured()?, &args, None)?.is_none() {
            let speed = format!(
                "setpts=(PTS-STARTPTS)/{},fps={}",
                settings.rate, settings.frame_rate
            );
            let filter = if settings.reverse {
                format!("reverse,{speed}")
            } else {
                speed
            };
            crate::run(
                "ffmpeg",
                &vec![
                    "-v".into(),
                    "error".into(),
                    "-nostdin".into(),
                    "-n".into(),
                    "-ss".into(),
                    settings.offset.to_string(),
                    "-t".into(),
                    settings.duration.to_string(),
                    "-i".into(),
                    path.into(),
                    "-an".into(),
                    "-vf".into(),
                    filter,
                    "-c:v".into(),
                    "libx264".into(),
                    "-threads".into(),
                    "2".into(),
                    "-pix_fmt".into(),
                    "yuv420p".into(),
                    stage.to_string_lossy().into_owned(),
                ],
            )?;
        }
    } else {
        let decoded = directory.path().join("decoded.wav");
        if !crate::apple::prepare("audio-f32", path, &decoded.to_string_lossy())? {
            crate::run(
                "ffmpeg",
                &vec![
                    "-v".into(),
                    "error".into(),
                    "-nostdin".into(),
                    "-n".into(),
                    "-i".into(),
                    path.into(),
                    "-vn".into(),
                    "-ar".into(),
                    "48000".into(),
                    "-ac".into(),
                    "2".into(),
                    "-c:a".into(),
                    "pcm_f32le".into(),
                    decoded.to_string_lossy().into_owned(),
                ],
            )?;
        }
        let mut reader = hound::WavReader::open(decoded).map_err(|e| e.to_string())?;
        let count = (settings.duration * 48000.0).round() as usize;
        if count.saturating_mul(8) > 256 * 1024 * 1024 {
            return Err("Retime input exceeds the 256 MiB buffer budget".into());
        }
        reader
            .seek((settings.offset * 48000.0).round() as u32)
            .map_err(|e| e.to_string())?;
        let mut samples = reader.samples::<f32>();
        let mut input = Vec::with_capacity(count);
        for _ in 0..count {
            let left = samples
                .next()
                .transpose()
                .map_err(|e| e.to_string())?
                .unwrap_or(0.0);
            let right = samples
                .next()
                .transpose()
                .map_err(|e| e.to_string())?
                .unwrap_or(0.0);
            if !left.is_finite() || !right.is_finite() {
                return Err("Non-finite source samples".into());
            }
            input.push([left, right]);
        }
        let output = process(&input, settings)?;
        let mut writer = hound::WavWriter::create(
            &stage,
            hound::WavSpec {
                channels: if info.channels == 1 { 1 } else { 2 },
                sample_rate: 48000,
                bits_per_sample: 32,
                sample_format: hound::SampleFormat::Float,
            },
        )
        .map_err(|e| e.to_string())?;
        for frame in output {
            writer.write_sample(frame[0]).map_err(|e| e.to_string())?;
            if info.channels != 1 {
                writer.write_sample(frame[1]).map_err(|e| e.to_string())?;
            }
        }
        writer.finalize().map_err(|e| e.to_string())?;
    }
    if crate::jobs::cancelled() {
        return Err("Operation cancelled".into());
    }
    std::fs::hard_link(stage, output).map_err(|e| format!("Cannot publish retimed source: {e}"))?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn settings() -> Settings {
        Settings {
            offset: 0.0,
            duration: 1.0,
            rate: 1.0,
            reverse: false,
            preserve_pitch: true,
            semitones: 0.0,
            video: false,
            frame_rate: 25.0,
        }
    }
    fn frequency(samples: &[[f32; 2]]) -> f64 {
        let a = 4800;
        let b = samples.len() - 4800;
        let crossings = samples[a..b]
            .windows(2)
            .filter(|p| p[0][0] <= 0.0 && p[1][0] > 0.0)
            .count();
        crossings as f64 * 48000.0 / (b - a) as f64
    }
    #[test]
    fn duration_pitch_and_stereo_phase() {
        let source: Vec<_> = (0..48000)
            .map(|i| {
                let x = (i as f64 * std::f64::consts::TAU * 440.0 / 48000.0).sin() as f32;
                [x, -x]
            })
            .collect();
        let mut s = settings();
        s.rate = 2.0;
        let stretched = process(&source, &s).unwrap();
        assert_eq!(stretched.len(), 24000);
        assert!((frequency(&stretched) - 440.0).abs() < 4.0);
        assert!(stretched.iter().all(|p| (p[0] + p[1]).abs() < 1e-6));
        s.preserve_pitch = false;
        let fast = process(&source, &s).unwrap();
        assert!((frequency(&fast) - 880.0).abs() < 4.0);
        s.rate = 1.0;
        s.preserve_pitch = true;
        s.semitones = 12.0;
        let pitched = process(&source, &s).unwrap();
        assert_eq!(pitched.len(), 48000);
        assert!((frequency(&pitched) - 880.0).abs() < 4.0);
    }
    #[test]
    fn identity_reverse_and_bounds() {
        let input = vec![[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]];
        let mut s = settings();
        assert_eq!(process(&input, &s).unwrap(), input);
        s.reverse = true;
        assert_eq!(
            process(&input, &s).unwrap(),
            input.into_iter().rev().collect::<Vec<_>>()
        );
        s.rate = 0.0;
        assert!(s.validate().is_err());
    }
}
