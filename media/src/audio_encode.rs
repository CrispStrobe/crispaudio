//! Disk-backed Apple FLAC export; no redistributed codec dependency.
use crate::{
    apple::{attempt, Backend},
    Result,
};
use serde_json::Value;
use std::{fs::File, io::Read, path::Path};

pub fn render_flac(doc: &Value, output: &str) -> Result<()> {
    if Path::new(output).exists() {
        return Err("Output already exists; choose a new filename".into());
    }
    if !Path::new(output)
        .extension()
        .is_some_and(|e| e.to_string_lossy().eq_ignore_ascii_case("flac"))
    {
        return Err("FLAC export requires a .flac filename".into());
    }
    if Backend::configured()? == Backend::Ffmpeg {
        return Err("Native FLAC export requires --backend apple or auto".into());
    }
    if !cfg!(target_os = "macos") {
        return Err("Native FLAC export requires macOS".into());
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
    let staging = folder.path().join("mix.flac");
    attempt(
        Backend::Apple,
        &[
            "encode-flac".into(),
            mix.to_string_lossy().into_owned(),
            staging.to_string_lossy().into_owned(),
        ],
        None,
    )?
    .ok_or("Native FLAC encoder unavailable")?;
    let mut header = [0u8; 42];
    File::open(&staging)
        .map_err(|e| e.to_string())?
        .read_exact(&mut header)
        .map_err(|e| e.to_string())?;
    validate_streaminfo(&header, frames)?;
    if crate::jobs::cancelled() {
        return Err("Operation cancelled".into());
    }
    std::fs::hard_link(staging, output).map_err(|e| format!("Cannot publish FLAC: {e}"))?;
    Ok(())
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
