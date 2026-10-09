//! Disk-backed Apple FLAC and AAC export; no redistributed codec dependency.
use crate::{
    apple::{attempt, Backend},
    Result,
};
use serde_json::Value;
use std::{fs::File, io::Read, path::Path};

enum Codec {
    Flac,
    Aac(u32),
}
pub fn render_flac(doc: &Value, output: &str) -> Result<()> {
    render_encoded(doc, output, Codec::Flac)
}
pub fn render_aac(doc: &Value, output: &str, bitrate_kbps: u32) -> Result<()> {
    if ![96, 128, 192, 256, 320].contains(&bitrate_kbps) {
        return Err("AAC bitrate must be 96, 128, 192, 256 or 320 kbps".into());
    }
    render_encoded(doc, output, Codec::Aac(bitrate_kbps))
}
fn render_encoded(doc: &Value, output: &str, codec: Codec) -> Result<()> {
    let extension = match codec {
        Codec::Flac => "flac",
        Codec::Aac(_)
            if Path::new(output)
                .extension()
                .is_some_and(|e| e.to_string_lossy().eq_ignore_ascii_case("m4a")) =>
        {
            "m4a"
        }
        Codec::Aac(_) => "aac",
    };
    if Path::new(output).exists() {
        return Err("Output already exists; choose a new filename".into());
    }
    if !Path::new(output)
        .extension()
        .is_some_and(|e| e.to_string_lossy().eq_ignore_ascii_case(extension))
    {
        return Err(format!(
            "Native audio export requires a .{extension} filename"
        ));
    }
    if Backend::configured()? == Backend::Ffmpeg {
        return Err("Native compressed audio export requires --backend apple or auto".into());
    }
    if !cfg!(target_os = "macos") {
        return Err("Native compressed audio export requires macOS".into());
    }
    let parent = Path::new(output)
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let folder = tempfile::tempdir_in(parent).map_err(|e| e.to_string())?;
    let mix = folder.path().join("mix.wav");
    crate::audio_mix::render(doc, mix.to_str().ok_or("Invalid mix path")?)?;
    let frames = hound::WavReader::open(&mix)
        .map_err(|e| e.to_string())?
        .duration() as u64;
    let staging = folder.path().join(format!("mix.{extension}"));
    let operation = match codec {
        Codec::Flac => "encode-flac",
        Codec::Aac(_) => "encode-aac",
    };
    let mut args = vec![
        operation.into(),
        mix.to_string_lossy().into_owned(),
        staging.to_string_lossy().into_owned(),
    ];
    if let Codec::Aac(bitrate) = codec {
        args.push(bitrate.to_string());
    }
    attempt(Backend::Apple, &args, None)?.ok_or("Native audio encoder unavailable")?;
    match codec {
        Codec::Flac => {
            let mut header = [0u8; 42];
            File::open(&staging)
                .map_err(|e| e.to_string())?
                .read_exact(&mut header)
                .map_err(|e| e.to_string())?;
            validate_streaminfo(&header, frames)?;
        }
        Codec::Aac(_) if extension == "m4a" => {
            let bytes = attempt(
                Backend::Apple,
                &[
                    "validate-m4a".into(),
                    staging.to_string_lossy().into_owned(),
                ],
                None,
            )?
            .ok_or("Native M4A validation unavailable")?;
            validate_m4a_metadata(
                &serde_json::from_slice(&bytes).map_err(|e| e.to_string())?,
                frames,
            )?;
        }
        Codec::Aac(_) => {
            validate_adts(File::open(&staging).map_err(|e| e.to_string())?, frames)?;
        }
    }
    if crate::jobs::cancelled() {
        return Err("Operation cancelled".into());
    }
    std::fs::hard_link(staging, output)
        .map_err(|e| format!("Cannot publish compressed audio: {e}"))?;
    Ok(())
}
fn validate_m4a_metadata(info: &Value, frames: u64) -> Result<()> {
    let valid = info["validFrames"]
        .as_u64()
        .ok_or("Missing M4A frame count")?;
    let priming = info["primingFrames"]
        .as_u64()
        .ok_or("Missing M4A priming")?;
    let remainder = info["remainderFrames"]
        .as_u64()
        .ok_or("Missing M4A padding")?;
    let packets = info["packets"].as_u64().ok_or("Missing M4A packet count")?;
    if info["sampleRate"].as_f64() != Some(48000.0)
        || info["channels"] != 2
        || info["framesPerPacket"] != 1024
        || info["codec"] != "aac-lc"
        || valid != frames
        || frames == 0
        || priming > 4096
        || remainder > 1023
        || packets.checked_mul(1024)
            != valid
                .checked_add(priming)
                .and_then(|n| n.checked_add(remainder))
    {
        return Err(
            "M4A packet table must preserve stereo 48 kHz AAC-LC and the source frame count".into(),
        );
    }
    Ok(())
}
// ADTS has no gapless metadata. Validate real packet duration instead of a
// bitrate-derived estimate, allowing at most one AAC priming/padding envelope.
fn validate_adts(input: impl Read, source_frames: u64) -> Result<u64> {
    let mut input = std::io::BufReader::new(input);
    let mut header = [0u8; 7];
    let mut payload = [0u8; 8192];
    let mut packets = 0u64;
    loop {
        if crate::jobs::cancelled() {
            return Err("Operation cancelled".into());
        }
        match input.read(&mut header[..1]).map_err(|e| e.to_string())? {
            0 => break,
            _ => {}
        }
        input
            .read_exact(&mut header[1..])
            .map_err(|_| "Truncated ADTS header")?;
        if header[0] != 255
            || header[1] & 0xf6 != 0xf0
            || header[2] >> 6 != 1
            || (header[2] >> 2) & 15 != 3
            || ((header[2] & 1) << 2) | (header[3] >> 6) != 2
            || header[6] & 3 != 0
        {
            return Err("AAC export must contain stereo 48 kHz AAC-LC ADTS packets".into());
        }
        let length = (((header[3] & 3) as usize) << 11)
            | ((header[4] as usize) << 3)
            | (header[5] as usize >> 5);
        let minimum = if header[1] & 1 == 1 { 7 } else { 9 };
        if length <= minimum {
            return Err("Invalid ADTS packet length".into());
        }
        input
            .read_exact(&mut payload[..length - 7])
            .map_err(|_| "Truncated ADTS packet")?;
        packets += 1;
        if packets * 1024 > source_frames + 4096 {
            return Err("AAC output exceeded its priming/padding bound".into());
        }
    }
    let frames = packets * 1024;
    if frames < source_frames || frames > source_frames + 4096 || packets == 0 {
        return Err(
            "AAC packet duration does not cover the mix within its priming/padding bound".into(),
        );
    }
    Ok(frames)
}
fn validate_streaminfo(header: &[u8; 42], frames: u64) -> Result<()> {
    if &header[..4] != b"fLaC" || header[4] & 127 != 0 || header[5..8] != [0, 0, 34] {
        return Err("Invalid FLAC STREAMINFO".into());
    }
    let info = u64::from_be_bytes(header[18..26].try_into().unwrap());
    if info >> 44 != 48000
        || (info >> 41 & 7) + 1 != 2
        || (info >> 36 & 31) + 1 != 24
        || info & ((1 << 36) - 1) != frames
        || header[26..42].iter().all(|b| *b == 0)
    {
        return Err("FLAC finalisation did not preserve rate, depth, frames or checksum".into());
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn adts_rejects_truncated_wrong_layout_and_wrong_duration() {
        let packet = [255, 241, 76, 128, 1, 31, 252, 0];
        assert_eq!(validate_adts(&packet[..], 1024).unwrap(), 1024);
        assert!(validate_adts(&packet[..7], 1024).is_err());
        let mut wrong = packet;
        wrong[2] = 72;
        assert!(validate_adts(&wrong[..], 1024).is_err());
        assert!(validate_adts(&packet[..], 2048).is_err());
        assert!(validate_adts(&[][..], 0).is_err());
    }
    #[test]
    #[ignore = "Requires macOS AAC encoding and FFmpeg reference decoding"]
    #[cfg(target_os = "macos")]
    fn native_aac_bitrates_preserve_stereo_signal_and_packet_clock() {
        use hound::{SampleFormat, WavSpec, WavWriter};
        use serde_json::json;
        let folder = tempfile::tempdir().unwrap();
        let source = folder.path().join("source.wav");
        let mut writer = WavWriter::create(
            &source,
            WavSpec {
                channels: 2,
                sample_rate: 48000,
                bits_per_sample: 32,
                sample_format: SampleFormat::Float,
            },
        )
        .unwrap();
        let mut reference = Vec::new();
        for i in 0..24000 {
            let t = i as f32 / 48000.0;
            let envelope = if (0.07..0.14).contains(&t) {
                0.3
            } else if (0.2..0.38).contains(&t) {
                0.15
            } else {
                0.0
            };
            let pair = [
                envelope * (std::f32::consts::TAU * 500.0 * t).sin(),
                envelope * (std::f32::consts::TAU * 2200.0 * t).sin(),
            ];
            for sample in pair {
                writer.write_sample(sample).unwrap();
            }
            reference.push(pair);
        }
        writer.finalize().unwrap();
        let doc = json!({"project":{"duration":0.5,"tracks":[{"volume":1,"pan":0,"segments":[{"sourceId":"s","startTime":0,"sourceOffset":0,"duration":0.5,"gain":1}]}]},"sources":[{"id":"s","path":source}]});
        for bitrate in [96, 128, 192, 256, 320] {
            let target = folder.path().join(format!("mix-{bitrate}.aac"));
            render_aac(&doc, target.to_str().unwrap(), bitrate).unwrap();
            let frames = validate_adts(File::open(&target).unwrap(), 24000).unwrap();
            let decoded = std::process::Command::new("ffmpeg")
                .args(["-v", "error", "-i"])
                .arg(&target)
                .args(["-f", "f32le", "pipe:1"])
                .output()
                .unwrap();
            assert!(decoded.status.success());
            let samples: Vec<f32> = decoded
                .stdout
                .chunks_exact(4)
                .map(|b| f32::from_le_bytes(b.try_into().unwrap()))
                .collect();
            assert_eq!(samples.len() as u64, frames * 2);
            let error = |lag: usize| {
                let mut sum = 0.0f64;
                for i in (0..24000).step_by(32) {
                    for ch in 0..2 {
                        let difference =
                            samples[(i + lag) * 2 + ch] as f64 - reference[i][ch] as f64;
                        sum += difference * difference;
                    }
                }
                sum / 1500.0
            };
            let limit = (frames - 24000) as usize;
            let coarse = (0..=limit)
                .step_by(16)
                .min_by(|a, b| error(*a).total_cmp(&error(*b)))
                .unwrap();
            let lag = (coarse.saturating_sub(16)..=(coarse + 16).min(limit))
                .min_by(|a, b| error(*a).total_cmp(&error(*b)))
                .unwrap();
            assert!(
                lag <= 4096 && error(lag) < 0.0002,
                "{bitrate} kbps: lag {lag}, error {}",
                error(lag)
            );
            println!(
                "AAC {bitrate} kbps: {} packets, priming {lag} frames, aligned RMS error {}",
                frames / 1024,
                error(lag).sqrt()
            );
            assert!(render_aac(&doc, target.to_str().unwrap(), bitrate).is_err());
        }
        let bad = folder.path().join("invalid.aac");
        assert!(render_aac(&doc, bad.to_str().unwrap(), 12).is_err());
        assert!(!bad.exists());
    }
    #[test]
    fn m4a_metadata_requires_exact_clock_and_consistent_packet_table() {
        let mut info = serde_json::json!({"codec":"aac-lc","sampleRate":48000.0,"channels":2,"framesPerPacket":1024,"validFrames":24000,"primingFrames":2112,"remainderFrames":512,"packets":26});
        assert!(validate_m4a_metadata(&info, 24000).is_ok());
        assert!(validate_m4a_metadata(&info, 23999).is_err());
        info["primingFrames"] = serde_json::json!(-1);
        assert!(validate_m4a_metadata(&info, 24000).is_err());
        info["primingFrames"] = serde_json::json!(2112);
        info["packets"] = serde_json::json!(27);
        assert!(validate_m4a_metadata(&info, 24000).is_err());
    }
    #[test]
    #[ignore = "Requires macOS M4A encoding and FFmpeg reference decoding"]
    #[cfg(target_os = "macos")]
    fn native_m4a_preserves_gapless_signal_and_boundary_frame_counts() {
        use hound::{SampleFormat, WavSpec, WavWriter};
        use serde_json::json;
        let folder = tempfile::tempdir().unwrap();
        for (frames, bitrate) in [
            (24000, 96),
            (24000, 128),
            (24000, 192),
            (24000, 256),
            (24000, 320),
            (1, 192),
            (1023, 192),
            (1024, 192),
            (24001, 192),
        ] {
            let source = folder.path().join(format!("source-{frames}-{bitrate}.wav"));
            let mut writer = WavWriter::create(
                &source,
                WavSpec {
                    channels: 2,
                    sample_rate: 48000,
                    bits_per_sample: 32,
                    sample_format: SampleFormat::Float,
                },
            )
            .unwrap();
            let mut reference = Vec::new();
            for i in 0..frames {
                let t = i as f32 / 48000.0;
                let amplitude = if (0.07..0.14).contains(&t) || (0.2..0.38).contains(&t) {
                    0.2
                } else {
                    0.0
                };
                for hz in [500.0, 2200.0] {
                    let sample = amplitude * (std::f32::consts::TAU * hz * t).sin();
                    writer.write_sample(sample).unwrap();
                    reference.push(sample);
                }
            }
            writer.finalize().unwrap();
            let doc = json!({"project":{"duration":frames as f64 / 48000.0,"tracks":[{"volume":1,"pan":0,"segments":[{"sourceId":"s","startTime":0,"sourceOffset":0,"duration":frames as f64 / 48000.0,"gain":1}]}]},"sources":[{"id":"s","path":source}]});
            let target = folder.path().join(format!("mix-{frames}-{bitrate}.m4a"));
            render_aac(&doc, target.to_str().unwrap(), bitrate).unwrap();
            let decoded = std::process::Command::new("ffmpeg")
                .args(["-v", "error", "-i"])
                .arg(&target)
                .args(["-f", "f32le", "pipe:1"])
                .output()
                .unwrap();
            assert!(decoded.status.success());
            assert_eq!(
                decoded.stdout.len(),
                frames * 8,
                "{frames} frames at {bitrate} kbps"
            );
            let error: f64 = decoded
                .stdout
                .chunks_exact(4)
                .zip(&reference)
                .map(|(b, source)| {
                    let sample = f32::from_le_bytes(b.try_into().unwrap());
                    let diff = sample as f64 - *source as f64;
                    diff * diff
                })
                .sum::<f64>()
                / reference.len() as f64;
            assert!(
                error < 0.0002,
                "{frames} frames at {bitrate} kbps, unshifted error {error}"
            );
            println!(
                "M4A {frames} frames at {bitrate} kbps: exact decoded length, unshifted RMS {}",
                error.sqrt()
            );
            assert!(render_aac(&doc, target.to_str().unwrap(), bitrate).is_err());
        }
    }
    #[test]
    fn streaminfo_rejects_unfinalised_or_wrong_layout() {
        let mut header = [0u8; 42];
        header[..4].copy_from_slice(b"fLaC");
        header[7] = 34;
        let info = (48000u64 << 44) | (1 << 41) | (23 << 36) | 4800;
        header[18..26].copy_from_slice(&info.to_be_bytes());
        assert!(validate_streaminfo(&header, 4800).is_err());
        header[26] = 1;
        assert!(validate_streaminfo(&header, 4800).is_ok());
        assert!(validate_streaminfo(&header, 4799).is_err());
        header[18] = 0;
        assert!(validate_streaminfo(&header, 4800).is_err());
    }
    #[test]
    #[ignore = "Requires macOS FLAC encoder and FFmpeg reference decoding"]
    #[cfg(target_os = "macos")]
    fn native_flac_preserves_exact_quantised_pcm_and_checksum() {
        use hound::{SampleFormat, WavSpec, WavWriter};
        use serde_json::json;
        let folder = tempfile::tempdir().unwrap();
        let source = folder.path().join("source.wav");
        let mut writer = WavWriter::create(
            &source,
            WavSpec {
                channels: 2,
                sample_rate: 48000,
                bits_per_sample: 32,
                sample_format: SampleFormat::Float,
            },
        )
        .unwrap();
        let values = [
            0.0f32,
            -0.5,
            0.5,
            -1.0,
            1.0,
            -2.0,
            2.0,
            -0.5 / 8388608.0,
            0.5 / 8388608.0,
        ];
        let mut expected = Vec::new();
        for i in 0..9600 {
            let v = values[i % values.len()];
            writer.write_sample(v).unwrap();
            let integer = ((v as f64 * 8388608.0 + 0.5)
                .floor()
                .clamp(-8388608.0, 8388607.0)) as i32;
            expected.extend_from_slice(&integer.to_le_bytes()[..3]);
        }
        writer.finalize().unwrap();
        let doc = json!({"project":{"duration":0.1,"tracks":[{"volume":1,"pan":0,"segments":[{"sourceId":"s","startTime":0,"sourceOffset":0,"duration":0.1,"gain":1}]}]},"sources":[{"id":"s","path":source}]});
        let target = folder.path().join("mix.flac");
        render_flac(&doc, target.to_str().unwrap()).unwrap();
        let decoded = std::process::Command::new("ffmpeg")
            .args(["-v", "error", "-i"])
            .arg(&target)
            .args(["-f", "s24le", "pipe:1"])
            .output()
            .unwrap();
        assert!(decoded.status.success());
        assert_eq!(decoded.stdout, expected);
        // FFmpeg's FLAC decoder checks frame integrity; compare the stored MD5 using
        // the platform's independent digest utility without linking another crate.
        use std::io::Write;
        let mut child = std::process::Command::new("md5")
            .arg("-q")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        child.stdin.take().unwrap().write_all(&expected).unwrap();
        let digest = child.wait_with_output().unwrap();
        assert!(digest.status.success());
        let bytes = std::fs::read(&target).unwrap();
        let stored: String = bytes[26..42].iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(stored, String::from_utf8(digest.stdout).unwrap().trim());
        assert!(render_flac(&doc, target.to_str().unwrap()).is_err());
    }
}
