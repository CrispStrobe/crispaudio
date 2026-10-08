//! Internal CrispAudio desktop media operations. No GUI or ASR dependency.
pub mod jobs;
pub mod project_edit;
pub mod video_edit;
use rustfft::{num_complex::Complex, FftPlanner};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

pub type Result<T> = std::result::Result<T, String>;
const ANALYSIS_RATE: usize = 4000;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MediaInfo {
    pub path: String,
    pub duration: f64,
    pub channels: usize,
    pub sample_rate: usize,
    pub has_video: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Anchor {
    pub video_time: f64,
    pub source_time: f64,
    pub correlation: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Alignment {
    /// source_time = offset + rate * video_time
    pub offset: f64,
    pub rate: f64,
    pub confidence: f64,
    pub residual_ms: f64,
    pub reliable: bool,
    #[serde(default)]
    pub manual: bool,
    pub anchors: Vec<Anchor>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Track {
    pub source: MediaInfo,
    pub alignment: Alignment,
    #[serde(default)]
    pub aligned_path: Option<String>,
    #[serde(default)]
    pub levels: Option<Levels>,
    #[serde(default)]
    pub rendered_rate: Option<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Levels {
    pub peak_db: f64,
    pub rms_db: f64,
    /// P80 RMS over 100 ms windows; an activity proxy, not SNR or intelligibility.
    pub activity_db: f64,
    /// Constant gain toward -24 dBFS activity, constrained by -1.5 dBFS sample peak.
    pub suggested_gain_db: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Session {
    pub format: String,
    pub version: u32,
    pub video: MediaInfo,
    pub tracks: Vec<Track>,
    #[serde(default)]
    pub camera_path: Option<String>,
    #[serde(default)]
    pub camera_levels: Option<Levels>,
}

fn tool(name: &str) -> PathBuf {
    if let Some(path) = std::env::var_os(format!("CRISPAUDIO_{}", name.to_uppercase())) {
        return path.into();
    }
    // Finder-launched apps do not normally inherit Homebrew's PATH.
    for root in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"] {
        let path = Path::new(root).join(name);
        if path.is_file() {
            return path;
        }
    }
    name.into()
}

fn run(name: &str, args: &[String]) -> Result<Vec<u8>> {
    let out = run_command(Command::new(tool(name)).args(args))?;
    if !out.status.success() {
        return Err(format!(
            "{name} failed: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(out.stdout)
}

fn strings(args: &[&str]) -> Vec<String> {
    args.iter().map(|s| s.to_string()).collect()
}

pub fn probe(path: &str) -> Result<MediaInfo> {
    let path = fs::canonicalize(path).map_err(|e| format!("Cannot open {path}: {e}"))?;
    let path = path.to_string_lossy().into_owned();
    let out = run(
        "ffprobe",
        &strings(&[
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            &path,
        ]),
    )?;
    let value: serde_json::Value = serde_json::from_slice(&out).map_err(|e| e.to_string())?;
    let streams = value["streams"].as_array().ok_or("No media streams")?;
    let has_video = streams.iter().any(|s| s["codec_type"] == "video");
    let audio = streams.iter().find(|s| s["codec_type"] == "audio");
    if audio.is_none() && !has_video {
        return Err("Media has no audio or video stream".into());
    }
    let empty = serde_json::Value::Null;
    let audio = audio.unwrap_or(&empty);
    let duration = value["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .ok_or("Unknown media duration")?;
    if !duration.is_finite() || duration <= 0.0 {
        return Err("Invalid media duration".into());
    }
    Ok(MediaInfo {
        path,
        duration,
        has_video,
        channels: audio["channels"].as_u64().unwrap_or(0) as usize,
        sample_rate: audio["sample_rate"]
            .as_str()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0),
    })
}

fn decode_analysis(path: &str) -> Result<Vec<f32>> {
    let out = run(
        "ffmpeg",
        &strings(&[
            "-v",
            "error",
            "-nostdin",
            "-i",
            path,
            "-map",
            "0:a:0",
            "-vn",
            "-ac",
            "1",
            "-ar",
            "4000",
            "-af",
            "highpass=f=250,lowpass=f=1600",
            "-f",
            "f32le",
            "pipe:1",
        ]),
    )?;
    Ok(out
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes(b.try_into().unwrap()))
        .collect())
}

fn median(mut values: Vec<f64>) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    values.sort_by(f64::total_cmp);
    let n = values.len();
    if n % 2 == 0 {
        (values[n / 2 - 1] + values[n / 2]) / 2.0
    } else {
        values[n / 2]
    }
}

/// FFT normalized correlation, invariant to gain and polarity. Window means and
/// energies are computed from prefix sums; quiet windows cannot win by loudness.
fn match_template(source: &[f32], template: &[f32], separation: usize) -> Option<(usize, f64)> {
    let m = template.len();
    if m == 0 || source.len() < m {
        return None;
    }
    let mean = template.iter().map(|&x| x as f64).sum::<f64>() / m as f64;
    let centered: Vec<f32> = template.iter().map(|&x| (x as f64 - mean) as f32).collect();
    let energy = centered.iter().map(|&x| (x as f64).powi(2)).sum::<f64>();
    if energy < 1e-12 {
        return None;
    }
    let n = (source.len() + m - 1).next_power_of_two();
    let mut a = vec![Complex::new(0.0, 0.0); n];
    let mut b = a.clone();
    for (z, &x) in a.iter_mut().zip(source) {
        z.re = x;
    }
    for (z, &x) in b.iter_mut().zip(centered.iter().rev()) {
        z.re = x;
    }
    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(n);
    fft.process(&mut a);
    fft.process(&mut b);
    for (x, y) in a.iter_mut().zip(b) {
        *x *= y;
    }
    planner.plan_fft_inverse(n).process(&mut a);
    let mut sum = 0.0_f64;
    let mut squares = 0.0_f64;
    for &v in &source[..m] {
        sum += v as f64;
        squares += (v as f64).powi(2);
    }
    let mut best = (0, 0.0_f64);
    let mut scores = vec![0.0_f32; source.len() - m + 1];
    for i in 0..=source.len() - m {
        if i > 0 {
            let old = source[i - 1] as f64;
            let new = source[i + m - 1] as f64;
            sum += new - old;
            squares += new * new - old * old;
        }
        let variance = (squares - sum * sum / m as f64).max(0.0);
        let denom = (variance * energy).sqrt();
        if denom > 1e-12 {
            let score = ((a[i + m - 1].re as f64 / n as f64) / denom).abs().min(1.0);
            scores[i] = score as f32;
            if score > best.1 {
                best = (i, score);
            }
        }
    }
    // A distant, nearly equal peak is an ambiguous offset, even when a
    // platform's FFT rounding happens to choose consistent winning positions.
    // Ignore the neighbourhood of one peak (speech autocorrelation is broad).
    let alternative = scores
        .iter()
        .enumerate()
        .filter(|(i, _)| i.abs_diff(best.0) > separation.max(1))
        .map(|(_, score)| *score as f64)
        .fold(0.0_f64, f64::max);
    if best.1 <= 0.0 || alternative >= best.1 * 0.98 {
        return None;
    }
    Some(best)
}

pub fn estimate(reference: &[f32], source: &[f32], sample_rate: usize) -> Result<Alignment> {
    let length = reference.len().min(source.len());
    if sample_rate == 0 || length < sample_rate {
        return Err("At least one second of audio is required".into());
    }
    let window = (sample_rate * 6).min(length / 3).max(sample_rate / 2);
    let available = reference.len() - window;
    let mut anchors = Vec::new();
    for i in 0..9 {
        let start = available * (i + 1) / 10;
        if let Some((position, score)) =
            match_template(source, &reference[start..start + window], sample_rate / 10)
        {
            anchors.push(Anchor {
                video_time: start as f64 / sample_rate as f64,
                source_time: position as f64 / sample_rate as f64,
                correlation: score,
            });
        }
    }
    let usable: Vec<_> = anchors.iter().filter(|a| a.correlation >= 0.20).collect();
    if usable.is_empty() {
        return Ok(Alignment {
            offset: 0.0,
            rate: 1.0,
            confidence: 0.0,
            residual_ms: 0.0,
            reliable: false,
            manual: false,
            anchors,
        });
    }
    let center = median(
        usable
            .iter()
            .map(|a| a.source_time - a.video_time)
            .collect(),
    );
    let clustered: Vec<_> = usable
        .into_iter()
        .filter(|a| {
            (a.source_time - a.video_time - center).abs()
                < 0.5 + reference.len() as f64 / sample_rate as f64 * 0.001
        })
        .collect();
    let mut slopes = Vec::new();
    for (i, a) in clustered.iter().enumerate() {
        for b in clustered.iter().skip(i + 1) {
            if b.video_time - a.video_time > 1.0 {
                let slope = (b.source_time - a.source_time) / (b.video_time - a.video_time);
                if (slope - 1.0).abs() <= 0.001 {
                    slopes.push(slope);
                }
            }
        }
    }
    let initial_rate = if slopes.is_empty() {
        1.0
    } else {
        median(slopes)
    };
    let initial_offset = median(
        clustered
            .iter()
            .map(|a| a.source_time - initial_rate * a.video_time)
            .collect(),
    );
    let inliers: Vec<_> = clustered
        .into_iter()
        .filter(|a| (a.source_time - initial_offset - initial_rate * a.video_time).abs() <= 0.025)
        .collect();
    let (mut offset, mut rate) = (initial_offset, initial_rate);
    if inliers.len() >= 3 {
        let x = inliers.iter().map(|a| a.video_time).sum::<f64>() / inliers.len() as f64;
        let y = inliers.iter().map(|a| a.source_time).sum::<f64>() / inliers.len() as f64;
        let denominator = inliers
            .iter()
            .map(|a| (a.video_time - x).powi(2))
            .sum::<f64>();
        if denominator > 0.0 {
            rate = inliers
                .iter()
                .map(|a| (a.video_time - x) * (a.source_time - y))
                .sum::<f64>()
                / denominator;
            offset = y - rate * x;
        }
    }
    let confidence = median(inliers.iter().map(|a| a.correlation).collect());
    let residual_ms = inliers
        .iter()
        .map(|a| (a.source_time - offset - rate * a.video_time).abs() * 1000.0)
        .fold(0.0_f64, f64::max);
    let coverage = match (inliers.first(), inliers.last()) {
        (Some(a), Some(b)) => {
            (b.video_time - a.video_time + window as f64 / sample_rate as f64)
                / (reference.len() as f64 / sample_rate as f64)
        }
        _ => 0.0,
    };
    let reliable = inliers.len() >= 3
        && confidence >= 0.25
        && coverage >= 0.4
        && residual_ms <= 20.0
        && (rate - 1.0).abs() <= 0.001;
    Ok(Alignment {
        offset,
        rate,
        confidence,
        residual_ms,
        reliable,
        manual: false,
        anchors,
    })
}

pub fn analyze(video: &str, audio: &[String]) -> Result<Session> {
    let video = probe(video)?;
    if !video.has_video || video.channels == 0 {
        return Err("Reference must contain video and camera audio".into());
    }
    let reference = if audio.is_empty() {
        Vec::new()
    } else {
        decode_analysis(&video.path)?
    };
    let mut tracks = Vec::new();
    for path in audio {
        let source = probe(path)?;
        let samples = decode_analysis(&source.path)?;
        let alignment = estimate(&reference, &samples, ANALYSIS_RATE)?;
        tracks.push(Track {
            source,
            alignment,
            aligned_path: None,
            levels: None,
            rendered_rate: None,
        });
    }
    Ok(Session {
        format: "crispaudio-sync".into(),
        version: 1,
        video,
        tracks,
        camera_path: None,
        camera_levels: None,
    })
}

pub fn measure(path: &str) -> Result<Levels> {
    let info = probe(path)?;
    let out = run(
        "ffmpeg",
        &strings(&[
            "-v", "error", "-nostdin", "-i", path, "-map", "0:a:0", "-vn", "-ar", "48000", "-f",
            "f32le", "pipe:1",
        ]),
    )?;
    let samples: Vec<f32> = out
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes(b.try_into().unwrap()))
        .collect();
    Ok(measure_samples(&samples, 4800 * info.channels))
}

fn measure_samples(samples: &[f32], window: usize) -> Levels {
    let db = |linear: f64| 20.0 * linear.max(1e-8).log10();
    let peak = samples
        .iter()
        .map(|&x| (x as f64).abs())
        .fold(0.0_f64, f64::max);
    let energy = samples.iter().map(|&x| (x as f64).powi(2)).sum::<f64>();
    let rms = (energy / samples.len().max(1) as f64).sqrt();
    let mut windows: Vec<f64> = samples
        .chunks(window.max(1))
        .map(|w| (w.iter().map(|&x| (x as f64).powi(2)).sum::<f64>() / w.len() as f64).sqrt())
        .collect();
    windows.sort_by(f64::total_cmp);
    let activity = windows
        .get(windows.len().saturating_sub(1) * 4 / 5)
        .copied()
        .unwrap_or(0.0);
    let suggested_gain_db = if activity > 1e-8 {
        (-24.0 - db(activity))
            .min(-1.5 - db(peak))
            .clamp(-60.0, 40.0)
    } else {
        0.0
    };
    Levels {
        peak_db: db(peak),
        rms_db: db(rms),
        activity_db: db(activity),
        suggested_gain_db,
    }
}

pub fn validate(session: &Session, allow_uncertain: bool) -> Result<()> {
    if session.format != "crispaudio-sync" || session.version != 1 {
        return Err("Unsupported sync session".into());
    }
    if !session.video.has_video
        || !session.video.duration.is_finite()
        || session.video.duration <= 0.0
    {
        return Err("Invalid sync session".into());
    }
    for track in &session.tracks {
        let a = &track.alignment;
        if !a.offset.is_finite() || !a.rate.is_finite() || !(0.99..=1.01).contains(&a.rate) {
            return Err("Invalid alignment offset or clock rate".into());
        }
        if !allow_uncertain && !a.reliable && !a.manual {
            return Err(format!("Uncertain alignment for {}. Review the offset and set manual=true, or explicitly allow uncertain results.", track.source.path));
        }
        let end = a.offset + a.rate * session.video.duration;
        if end <= 0.0 || a.offset >= track.source.duration {
            return Err("Audio does not overlap video".into());
        }
    }
    Ok(())
}

/// Generate 48 kHz / 24-bit WAVs; retain each original recording's channels.
/// Clock correction is resampling, not a speech/music time-stretch algorithm.
pub fn align(session: &Session, output_dir: &str, allow_uncertain: bool) -> Result<Session> {
    validate(session, allow_uncertain)?;
    if Path::new(output_dir).exists()
        && fs::read_dir(output_dir)
            .map_err(|e| e.to_string())?
            .next()
            .is_some()
    {
        return Err("Alignment output directory must be empty; choose a new folder".into());
    }
    fs::create_dir_all(output_dir).map_err(|e| e.to_string())?;
    let root = fs::canonicalize(output_dir).map_err(|e| e.to_string())?;
    let mut result = session.clone();
    let camera = root.join("camera.aligned.wav");
    run(
        "ffmpeg",
        &strings(&[
            "-v",
            "error",
            "-nostdin",
            "-n",
            "-i",
            &result.video.path,
            "-map",
            "0:a:0",
            "-vn",
            "-ar",
            "48000",
            "-c:a",
            "pcm_s24le",
            &camera.to_string_lossy(),
        ]),
    )?;
    result.camera_path = Some(camera.to_string_lossy().into_owned());
    result.camera_levels = Some(measure(&camera.to_string_lossy())?);
    for (i, track) in result.tracks.iter_mut().enumerate() {
        let output = root.join(format!("track-{:02}.aligned.wav", i + 1));
        let a = &track.alignment;
        // asetrate accepts an INTEGER. An intermediate 384 kHz clock bounds
        // rounding to 1.303 ppm instead of the 10.417 ppm error at 48 kHz.
        let clock = (384000.0 * a.rate).round();
        let rendered_rate = clock / 384000.0;
        let delay = (-a.offset / rendered_rate).max(0.0);
        let delay_samples = (delay * 48000.0).round() as u64;
        let filter = format!("aresample=384000,atrim=start={:.9},asetpts=PTS-STARTPTS,asetrate={:.0},aresample=48000,adelay={}S:all=1,apad,atrim=duration={:.9}",
            a.offset.max(0.0), clock, delay_samples, result.video.duration);
        run(
            "ffmpeg",
            &strings(&[
                "-v",
                "error",
                "-nostdin",
                "-n",
                "-i",
                &track.source.path,
                "-map",
                "0:a:0",
                "-vn",
                "-af",
                &filter,
                "-c:a",
                "pcm_s24le",
                &output.to_string_lossy(),
            ]),
        )?;
        track.aligned_path = Some(output.to_string_lossy().into_owned());
        track.levels = Some(measure(&output.to_string_lossy())?);
        track.rendered_rate = Some(rendered_rate);
    }
    save_session(&root.join("session.json"), &result)?;
    Ok(result)
}

/// Replace/add audio while preserving the compressed picture and original
/// camera audio. When supplied, mix is the GUI's edited timeline at video t=0.
pub fn export(
    session: &Session,
    output: &str,
    mix: Option<&str>,
    allow_uncertain: bool,
    match_levels: bool,
) -> Result<()> {
    export_impl(
        session,
        output,
        mix,
        allow_uncertain,
        match_levels,
        None,
        false,
    )
}

/// Exact section export: encode the selected picture and camera audio so the
/// start need not fall on a keyframe. GUI mixes may already begin at range.start.
pub fn export_segment(
    session: &Session,
    output: &str,
    mix: Option<&str>,
    range: std::ops::Range<f64>,
    allow_uncertain: bool,
    match_levels: bool,
    mix_is_trimmed: bool,
) -> Result<()> {
    if !range.start.is_finite()
        || !range.end.is_finite()
        || range.start < 0.0
        || range.end <= range.start
        || range.end > session.video.duration + 1e-6
    {
        return Err("Invalid video in/out range".into());
    }
    let range = if range.start == 0.0 && (range.end - session.video.duration).abs() < 1e-6 {
        None
    } else {
        Some(range)
    };
    export_impl(
        session,
        output,
        mix,
        allow_uncertain,
        match_levels,
        range,
        mix_is_trimmed,
    )
}

fn export_impl(
    session: &Session,
    output: &str,
    mix: Option<&str>,
    allow_uncertain: bool,
    match_levels: bool,
    range: Option<std::ops::Range<f64>>,
    mix_is_trimmed: bool,
) -> Result<()> {
    validate(session, allow_uncertain)?;
    if Path::new(output).exists() {
        return Err("Output already exists; choose a new filename".into());
    }
    let start = range.as_ref().map_or(0.0, |r| r.start);
    let duration = range
        .as_ref()
        .map_or(session.video.duration, |r| r.end - r.start);
    if let Some(path) = mix {
        let required = if mix_is_trimmed {
            duration
        } else {
            start + duration
        };
        if probe(path)?.duration + 0.01 < required {
            return Err("Edited mix does not cover the selected video range".into());
        }
    }
    let mut args = strings(&["-v", "error", "-nostdin", "-n"]);
    if range.is_some() {
        args.extend(strings(&["-ss", &start.to_string()]));
    }
    args.extend(strings(&["-i", &session.video.path]));
    let paths: Vec<&str> = if let Some(mix) = mix {
        vec![mix]
    } else {
        session
            .tracks
            .iter()
            .map(|t| t.aligned_path.as_deref().ok_or("Run align before export"))
            .collect::<std::result::Result<_, _>>()?
    };
    for path in &paths {
        if range.is_some() && !(mix.is_some() && mix_is_trimmed) {
            args.extend(strings(&["-ss", &start.to_string()]));
        }
        args.extend(strings(&["-i", path]));
    }
    args.extend(strings(&["-map", "0:v:0"]));
    for i in 0..paths.len() {
        args.extend(strings(&["-map", &format!("{}:a:0", i + 1)]));
    }
    args.extend(strings(&["-map", "0:a:0", "-c:a", "aac", "-b:a", "192k"]));
    if range.is_some() {
        args.extend(strings(&[
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
        ]));
    } else {
        args.extend(strings(&["-c:v", "copy"]));
    }
    for i in 0..paths.len() {
        if mix.is_none() && match_levels {
            let levels = session.tracks[i]
                .levels
                .as_ref()
                .ok_or("Session lacks levels; rerun align")?;
            args.extend(strings(&[
                &format!("-filter:a:{i}"),
                &format!("volume={}dB", levels.suggested_gain_db),
            ]));
        }
        args.extend(strings(&[
            &format!("-metadata:s:a:{i}"),
            &format!(
                "title={}",
                if mix.is_some() {
                    "Edited mix".into()
                } else {
                    format!("External recording {}", i + 1)
                }
            ),
            &format!("-disposition:a:{i}"),
            if i == 0 { "default" } else { "0" },
        ]));
    }
    args.extend(strings(&[
        &format!("-c:a:{}", paths.len()),
        if range.is_some() { "aac" } else { "copy" },
        &format!("-metadata:s:a:{}", paths.len()),
        "title=Original camera audio",
        &format!("-disposition:a:{}", paths.len()),
        "0",
        "-t",
        &duration.to_string(),
        "-movflags",
        "+faststart",
        output,
    ]));
    run("ffmpeg", &args)?;
    Ok(())
}

pub fn save_session(path: &Path, session: &Session) -> Result<()> {
    if path.exists() {
        return Err(format!("Session already exists: {}", path.display()));
    }
    let json = serde_json::to_string_pretty(session).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

pub fn read_session(path: &str) -> Result<Session> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn noise(n: usize) -> Vec<f32> {
        let mut state = 1234567_u32;
        (0..n)
            .map(|_| {
                state ^= state << 13;
                state ^= state >> 17;
                state ^= state << 5;
                (state as f64 / u32::MAX as f64 * 2.0 - 1.0) as f32
            })
            .collect()
    }
    #[test]
    fn gui_section_does_not_seek_its_already_trimmed_mix_twice() {
        let root = std::env::temp_dir().join(format!(
            "crispaudio-range-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        let video = root.join("video.mp4").to_string_lossy().into_owned();
        let mix = root.join("mix.wav").to_string_lossy().into_owned();
        let output = root.join("section.mp4").to_string_lossy().into_owned();
        run(
            "ffmpeg",
            &strings(&[
                "-v",
                "error",
                "-nostdin",
                "-n",
                "-f",
                "lavfi",
                "-i",
                "color=s=160x90:r=25:d=4",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=200:sample_rate=48000:duration=4",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-c:a",
                "aac",
                &video,
            ]),
        )
        .unwrap();
        run(
            "ffmpeg",
            &strings(&[
                "-v",
                "error",
                "-nostdin",
                "-n",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=777:sample_rate=48000:duration=2",
                &mix,
            ]),
        )
        .unwrap();
        let session = Session {
            format: "crispaudio-sync".into(),
            version: 1,
            video: probe(&video).unwrap(),
            tracks: vec![Track {
                source: probe(&mix).unwrap(),
                aligned_path: Some(mix.clone()),
                levels: None,
                rendered_rate: None,
                alignment: Alignment {
                    offset: 0.0,
                    rate: 1.0,
                    confidence: 1.0,
                    residual_ms: 0.0,
                    reliable: true,
                    manual: false,
                    anchors: vec![],
                },
            }],
            camera_path: None,
            camera_levels: None,
        };
        export_segment(&session, &output, Some(&mix), 1.0..3.0, false, false, true).unwrap();
        let samples = run(
            "ffmpeg",
            &strings(&[
                "-v", "error", "-i", &output, "-map", "0:a:0", "-ac", "1", "-ar", "48000", "-f",
                "f32le", "pipe:1",
            ]),
        )
        .unwrap();
        assert!(
            samples.len() / 4 >= 95000,
            "Trimmed mix was sought again and lost audio"
        );
        let wrong = root.join("wrong.mp4").to_string_lossy().into_owned();
        assert!(
            export_segment(&session, &wrong, Some(&mix), 1.0..3.0, false, false, false).is_err(),
            "CLI full-clock mix must cover the selected end"
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn detects_offset_and_inverted_quiet_audio() {
        let source = noise(50000);
        let reference: Vec<_> = source[1250..31250].iter().map(|x| -x * 0.03).collect();
        let a = estimate(&reference, &source, 1000).unwrap();
        assert!(a.reliable, "{a:?}");
        assert!((a.offset - 1.25).abs() < 0.002);
        assert!((a.rate - 1.0).abs() < 1e-5);
    }
    #[test]
    fn silence_is_not_a_confident_match() {
        let a = estimate(&vec![0.0; 10000], &noise(20000), 1000).unwrap();
        assert!(!a.reliable);
        assert_eq!(a.confidence, 0.0);
    }
    #[test]
    fn detects_clock_drift() {
        // Band-limited input tolerates the fractional sample interpolation.
        let raw = noise(150000);
        let source: Vec<f32> = raw
            .windows(5)
            .map(|w| w.iter().sum::<f32>() / 5.0)
            .collect();
        let reference: Vec<_> = (0..120000)
            .map(|i| {
                let p = 3500.0 + i as f64 * 1.0002;
                let j = p.floor() as usize;
                source[j] + (source[j + 1] - source[j]) * p.fract() as f32
            })
            .collect();
        let a = estimate(&reference, &source, 1000).unwrap();
        assert!(a.reliable, "{a:?}");
        assert!((a.offset - 3.5).abs() < 0.002);
        assert!((a.rate - 1.0002).abs() < 0.00002);
    }
    #[test]
    fn repeated_broadband_material_requires_review() {
        let pattern = noise(1000);
        let repeated: Vec<_> = (0..30000).map(|i| pattern[i % pattern.len()]).collect();
        let alignment = estimate(&repeated[..20000], &repeated, 1000).unwrap();
        assert!(!alignment.reliable, "{alignment:?}");
    }
    #[test]
    fn repeated_tone_requires_review() {
        let tone: Vec<_> = (0..30000).map(|i| (i as f32 * 0.1).sin()).collect();
        assert!(!estimate(&tone[..20000], &tone, 1000).unwrap().reliable);
    }
    #[test]
    fn level_matching_respects_peak_headroom_and_silence() {
        let quiet = measure_samples(&[0.01; 100], 10);
        assert!((quiet.suggested_gain_db - 16.0).abs() < 0.001);
        let mut transient = vec![0.01; 100];
        transient[0] = 0.9;
        assert!(measure_samples(&transient, 10).suggested_gain_db < 0.0);
        assert_eq!(measure_samples(&[0.0; 100], 10).suggested_gain_db, 0.0);
    }
}

/// Reusable desktop preparation. Cache ownership and filenames belong to the caller.
pub fn prepare_asset(path: &str, output: &str, proxy: bool) -> Result<()> {
    if Path::new(output).exists() {
        return Err("Output already exists".into());
    }
    if proxy {
        run("ffmpeg", &strings(&["-v","error","-nostdin","-n","-threads","1","-i",path,"-an","-vf","scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2","-c:v","libx264","-preset","ultrafast","-crf","26","-threads","2","-movflags","+faststart",output]))?;
    } else {
        run(
            "ffmpeg",
            &strings(&[
                "-v",
                "error",
                "-nostdin",
                "-n",
                "-threads",
                "1",
                "-i",
                path,
                "-vn",
                "-ac",
                "2",
                "-ar",
                "48000",
                "-c:a",
                "pcm_s16le",
                output,
            ]),
        )?;
    }
    Ok(())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Loudness {
    pub integrated_lufs: f64,
    pub true_peak_db: f64,
    pub gain_db: f64,
}
/// Measurement only: does not rewrite or normalize the original recording.
pub fn loudness(path: &str) -> Result<Loudness> {
    let output = run_command(Command::new(tool("ffmpeg")).args([
        "-hide_banner",
        "-nostdin",
        "-threads",
        "1",
        "-i",
        path,
        "-vn",
        "-af",
        "loudnorm=I=-16:TP=-1:LRA=11:print_format=json",
        "-f",
        "null",
        "-",
    ]))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    let text = String::from_utf8_lossy(&output.stderr);
    let start = text.rfind('{').ok_or("Missing loudness measurement")?;
    let doc: serde_json::Value = serde_json::from_str(
        &text[start..=text.rfind('}').ok_or("Incomplete loudness measurement")?],
    )
    .map_err(|e| e.to_string())?;
    let read = |key: &str| -> Result<f64> {
        let value = doc[key]
            .as_str()
            .ok_or("Missing loudness field")?
            .parse::<f64>()
            .map_err(|e| e.to_string())?;
        if value.is_finite() {
            Ok(value)
        } else {
            Err("Cannot normalize silence".into())
        }
    };
    let integrated_lufs = read("input_i")?;
    let true_peak_db = read("input_tp")?;
    Ok(Loudness {
        integrated_lufs,
        true_peak_db,
        gain_db: (-16.0 - integrated_lufs)
            .min(-1.0 - true_peak_db)
            .clamp(-60.0, 20.0),
    })
}

fn run_command(command: &mut Command) -> Result<std::process::Output> {
    use std::{io::Read, process::Stdio, time::Duration};
    if jobs::cancelled() {
        return Err("Operation cancelled".into());
    }
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Cannot start media tool: {e}. Install FFmpeg and FFprobe."))?;
    let mut stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();
    let out = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout.read_to_end(&mut bytes).map(|_| bytes)
    });
    let err = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stderr.read_to_end(&mut bytes).map(|_| bytes)
    });
    let status = loop {
        if jobs::cancelled() {
            let _ = child.kill();
            break child.wait().map_err(|e| e.to_string())?;
        }
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        std::thread::sleep(Duration::from_millis(50));
    };
    let stdout = out
        .join()
        .map_err(|_| "Media stdout reader failed")?
        .map_err(|e| e.to_string())?;
    let stderr = err
        .join()
        .map_err(|_| "Media stderr reader failed")?
        .map_err(|e| e.to_string())?;
    if jobs::cancelled() {
        return Err("Operation cancelled".into());
    }
    Ok(std::process::Output {
        status,
        stdout,
        stderr,
    })
}

pub fn clean_audio(path: &str, output: &str, noise_floor: f64) -> Result<()> {
    if !noise_floor.is_finite() || !(-80.0..=-20.0).contains(&noise_floor) {
        return Err("Noise floor must be between -80 and -20 dB".into());
    }
    if Path::new(output).exists() {
        return Err("Output already exists".into());
    }
    let filter = format!("highpass=f=70,afftdn=nr=10:nf={noise_floor}:tn=1");
    run(
        "ffmpeg",
        &strings(&[
            "-v",
            "error",
            "-nostdin",
            "-n",
            "-threads",
            "1",
            "-i",
            path,
            "-vn",
            "-af",
            &filter,
            "-ar",
            "48000",
            "-c:a",
            "pcm_s24le",
            output,
        ]),
    )?;
    Ok(())
}

/// A first tile independent of WKWebView's first canvas-frame readiness.
pub fn first_thumbnail(path: &str, output: &str) -> Result<()> {
    if Path::new(output).exists() {
        return Err("Output already exists".into());
    }
    let duration = probe(path)?.duration;
    let at = 0.12f64.min(duration / 2.0).to_string();
    run(
        "ffmpeg",
        &strings(&[
            "-v",
            "error",
            "-nostdin",
            "-n",
            "-threads",
            "1",
            "-ss",
            &at,
            "-i",
            path,
            "-frames:v",
            "1",
            "-vf",
            "scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2",
            "-q:v",
            "4",
            "-threads",
            "1",
            "-update",
            "1",
            output,
        ]),
    )?;
    Ok(())
}
