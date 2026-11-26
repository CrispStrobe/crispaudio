//! Unsigned, removable application receipts for known speech regeneration.
//! These are not C2PA signatures or evidence about the original recording.
use serde_json::{json, Value};
use std::fs::OpenOptions;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;

pub const SCHEMA: &str = "urn:crispaudio:ai-audio-provenance:1";

pub fn speech_receipt(model: &Path, duration: f64) -> crate::Result<Value> {
    let name = model.to_string_lossy();
    // Arbitrary local filenames can contain identities or credentials. Only
    // retain an exact public catalog name; other configurations stay generic.
    let name = match name.rsplit(['/', '\\']).next().unwrap_or("") {
        "sidon-v0.1-q8_0.gguf" => "sidon-v0.1-q8_0.gguf",
        _ => "configured-local-speech-model",
    };
    let generated = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?.as_millis();
    Ok(json!({"schema":SCHEMA,"generator":"CrispAudio",
        "contentType":"audio-derived-from-regenerated-speech","scope":"contributing-source-lineage",
        "originalSourceOrigin":"not-asserted","signature":"unsigned",
        "regions":[{"operation":"speech-regeneration","engine":"CrispASR","provider":"local","basis":"observed-operation",
            "model":name,"generatedAtUnixMs":generated,"start":0.0,"end":duration}]}))
}

fn chunk(id: &[u8; 4], data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(8 + data.len() + data.len() % 2);
    out.extend(id); out.extend((data.len() as u32).to_le_bytes()); out.extend(data);
    if data.len() % 2 != 0 { out.push(0); }
    out
}

/// Append to a newly encoded WAV stage, leaving PCM unchanged. Refuse to alter
/// an existing native C2PA carrier: even a RIFF-size change can break its claim.
pub fn append_receipt(path: &Path, receipt: &Value) -> crate::Result<()> {
    if receipt.get("schema").and_then(Value::as_str) != Some(SCHEMA)
        || receipt.get("signature").and_then(Value::as_str) != Some("unsigned") {
        return Err("Invalid application provenance receipt".into());
    }
    let payload = serde_json::to_vec(receipt).map_err(|e| e.to_string())?;
    if payload.len() > 1024 * 1024 { return Err("Application receipt is too large".into()); }
    let mut file = OpenOptions::new().read(true).write(true).open(path).map_err(|e| e.to_string())?;
    let length = file.metadata().map_err(|e| e.to_string())?.len();
    let mut header = [0u8; 12]; file.read_exact(&mut header).map_err(|e| e.to_string())?;
    if &header[..4] != b"RIFF" || &header[8..] != b"WAVE"
        || u32::from_le_bytes(header[4..8].try_into().unwrap()) as u64 + 8 != length {
        return Err("Invalid WAV stage".into());
    }
    let mut at = 12;
    while at + 8 <= length {
        let mut h = [0u8; 8]; file.seek(SeekFrom::Start(at)).map_err(|e| e.to_string())?;
        file.read_exact(&mut h).map_err(|e| e.to_string())?;
        if &h[..4] == b"c2pa" { return Err("Preserve the existing signed WAV; use a provenance sidecar".into()); }
        let n = u32::from_le_bytes(h[4..8].try_into().unwrap()) as u64;
        let end = at + 8 + n;
        if end > length { return Err("Truncated WAV chunk".into()); }
        // Some PCM writers omit the terminal odd chunk's padding byte.
        at = if end == length { end } else { end + n % 2 };
    }
    if at != length { return Err("Truncated WAV chunk".into()); }
    let mut info = b"INFO".to_vec();
    info.extend(chunk(b"ICMT", b"Audio derived from AI-regenerated speech; see unsigned capr metadata.\0"));
    let mut extra = vec![0; (length % 2) as usize];
    extra.extend(chunk(b"LIST", &info)); extra.extend(chunk(b"capr", &payload));
    let size = length + extra.len() as u64 - 8;
    if size > u32::MAX as u64 { return Err("Provenance requires RIFF below 4 GiB".into()); }
    file.seek(SeekFrom::End(0)).and_then(|_| file.write_all(&extra))
        .and_then(|_| file.seek(SeekFrom::Start(4)).map(|_| ()))
        .and_then(|_| file.write_all(&(size as u32).to_le_bytes()))
        .and_then(|_| file.sync_all()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn wav_receipt_preserves_samples_and_omits_model_directory() {
        let file = tempfile::NamedTempFile::new().unwrap();
        let spec = hound::WavSpec { channels: 1, sample_rate: 16000, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
        let mut writer = hound::WavWriter::create(file.path(), spec).unwrap();
        for x in [0i16, 123, -456] { writer.write_sample(x).unwrap(); } writer.finalize().unwrap();
        let receipt = speech_receipt(Path::new("/private/person/model.gguf"), 3.0 / 16000.0).unwrap();
        append_receipt(file.path(), &receipt).unwrap();
        assert!(!receipt.to_string().contains("/private/person"));
        assert_eq!(receipt["regions"][0]["model"], "configured-local-speech-model");
        let samples: Vec<i16> = hound::WavReader::open(file.path()).unwrap().samples().map(Result::unwrap).collect();
        assert_eq!(samples, vec![0, 123, -456]);
        let mut signed = std::fs::read(file.path()).unwrap(); signed.extend(chunk(b"c2pa", &[0, 1, 2, 3]));
        let size = signed.len() as u32 - 8; signed[4..8].copy_from_slice(&size.to_le_bytes());
        std::fs::write(file.path(), &signed).unwrap();
        assert!(append_receipt(file.path(), &receipt).is_err());
        assert_eq!(std::fs::read(file.path()).unwrap(), signed);
    }
    #[test]
    fn odd_terminal_pcm_receives_padding_without_changed_samples() {
        for bits in [8u16, 24] {
            let file = tempfile::NamedTempFile::new().unwrap();
            let align = bits / 8;
            let mut fmt = Vec::new();
            fmt.extend(1u16.to_le_bytes()); fmt.extend(1u16.to_le_bytes());
            fmt.extend(16000u32.to_le_bytes()); fmt.extend((16000u32 * align as u32).to_le_bytes());
            fmt.extend(align.to_le_bytes()); fmt.extend(bits.to_le_bytes());
            let samples = vec![1u8; 3 * align as usize];
            let mut wav = b"RIFF\0\0\0\0WAVE".to_vec(); wav.extend(chunk(b"fmt ", &fmt));
            wav.extend(b"data"); wav.extend((samples.len() as u32).to_le_bytes()); wav.extend(&samples);
            let length = wav.len() as u32 - 8; wav[4..8].copy_from_slice(&length.to_le_bytes());
            std::fs::write(file.path(), &wav).unwrap();
            append_receipt(file.path(), &speech_receipt(Path::new("sidon-v0.1-q8_0.gguf"), 3.0 / 16000.0).unwrap()).unwrap();
            let marked = std::fs::read(file.path()).unwrap();
            assert_eq!(&marked[44..44 + samples.len()], &samples);
            assert_eq!(marked[wav.len()], 0);
            assert_eq!(&marked[wav.len() + 1..wav.len() + 5], b"LIST");
            assert_eq!(u32::from_le_bytes(marked[4..8].try_into().unwrap()) as usize + 8, marked.len());
        }
    }
}
