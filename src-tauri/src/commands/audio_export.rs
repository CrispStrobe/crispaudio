use hound::{WavSpec, WavWriter, SampleFormat};
use serde::Deserialize;
use std::io::Cursor;

#[derive(Deserialize)]
pub struct WavExportParams {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub bit_depth: u16,
    pub channels: u16,
}

#[tauri::command]
pub async fn export_wav(params: WavExportParams) -> Result<Vec<u8>, String> {
    let spec = WavSpec {
        channels: params.channels,
        sample_rate: params.sample_rate,
        bits_per_sample: params.bit_depth,
        sample_format: if params.bit_depth == 32 {
            SampleFormat::Float
        } else {
            SampleFormat::Int
        },
    };

    let mut buffer = Cursor::new(Vec::new());
    let mut writer = WavWriter::new(&mut buffer, spec)
        .map_err(|e| format!("Failed to create WAV writer: {}", e))?;

    for &sample in &params.samples {
        match params.bit_depth {
            8 => {
                let val = ((sample * 127.0) + 128.0).clamp(0.0, 255.0) as u8;
                writer.write_sample(val as i8).map_err(|e| e.to_string())?;
            }
            16 => {
                let val = (sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
                writer.write_sample(val).map_err(|e| e.to_string())?;
            }
            24 => {
                let val = (sample * 8388607.0).clamp(-8388608.0, 8388607.0) as i32;
                writer.write_sample(val).map_err(|e| e.to_string())?;
            }
            32 => {
                writer.write_sample(sample).map_err(|e| e.to_string())?;
            }
            _ => return Err(format!("Unsupported bit depth: {}", params.bit_depth)),
        }
    }

    writer.finalize().map_err(|e| format!("Failed to finalize WAV: {}", e))?;
    Ok(buffer.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: run export_wav synchronously in tests.
    fn export(samples: Vec<f32>, sample_rate: u32, bit_depth: u16, channels: u16) -> Result<Vec<u8>, String> {
        let params = WavExportParams { samples, sample_rate, bit_depth, channels };
        // export_wav is async but does no real async work, so block on it.
        tokio::runtime::Runtime::new().unwrap().block_on(export_wav(params))
    }

    fn read_u16_le(buf: &[u8], offset: usize) -> u16 {
        u16::from_le_bytes([buf[offset], buf[offset + 1]])
    }

    fn read_u32_le(buf: &[u8], offset: usize) -> u32 {
        u32::from_le_bytes([buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]])
    }

    /// Find the byte offset of a sub-chunk id (e.g. b"data") in a WAV buffer.
    /// Returns the offset of the chunk's *data size* field (i.e. 4 bytes after the id).
    fn find_chunk(buf: &[u8], id: &[u8; 4]) -> Option<usize> {
        // Start scanning after the RIFF header (12 bytes).
        let mut pos = 12;
        while pos + 8 <= buf.len() {
            if &buf[pos..pos + 4] == id {
                return Some(pos + 4); // offset of the size field
            }
            let chunk_size = read_u32_le(buf, pos + 4) as usize;
            pos += 8 + chunk_size;
            // WAV chunks are word-aligned
            if pos % 2 != 0 { pos += 1; }
        }
        None
    }

    // ---- 16-bit WAV ----

    #[test]
    fn test_16bit_wav_header() {
        let samples = vec![0.0_f32, 0.5, -0.5, 1.0];
        let wav = export(samples.clone(), 44100, 16, 1).unwrap();

        // RIFF header
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");

        // Sample rate at offset 24
        assert_eq!(read_u32_le(&wav, 24), 44100);

        // Bits per sample at offset 34
        assert_eq!(read_u16_le(&wav, 34), 16);

        // Find the data chunk and verify its size
        let data_size_offset = find_chunk(&wav, b"data").expect("data chunk not found");
        let data_size = read_u32_le(&wav, data_size_offset);
        assert_eq!(data_size, (samples.len() as u32) * 1 * 2);
    }

    #[test]
    fn test_16bit_sample_values() {
        let samples = vec![0.0_f32, 1.0, -1.0];
        let wav = export(samples, 44100, 16, 1).unwrap();

        let data_size_offset = find_chunk(&wav, b"data").expect("data chunk not found");
        let data_offset = data_size_offset + 4; // skip past size field

        let s0 = i16::from_le_bytes([wav[data_offset], wav[data_offset + 1]]);
        let s1 = i16::from_le_bytes([wav[data_offset + 2], wav[data_offset + 3]]);
        let s2 = i16::from_le_bytes([wav[data_offset + 4], wav[data_offset + 5]]);

        assert_eq!(s0, 0);
        assert_eq!(s1, 32767);
        // -1.0 * 32767.0 = -32767 (the code clamps to [-32768, 32767] but the
        // multiplication itself yields -32767).
        assert_eq!(s2, -32767);
    }

    // ---- 8-bit WAV ----

    #[test]
    fn test_8bit_wav() {
        let samples = vec![0.0_f32, 1.0, -1.0];
        let wav = export(samples, 22050, 8, 1).unwrap();

        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(read_u32_le(&wav, 24), 22050);
        assert_eq!(read_u16_le(&wav, 34), 8);

        let data_size_offset = find_chunk(&wav, b"data").expect("data chunk not found");
        let data_size = read_u32_le(&wav, data_size_offset);
        assert_eq!(data_size, 3); // 3 samples * 1 byte each
    }

    // ---- 24-bit WAV ----

    #[test]
    fn test_24bit_wav() {
        let samples = vec![0.0_f32, 0.5];
        let wav = export(samples, 48000, 24, 1).unwrap();

        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(read_u32_le(&wav, 24), 48000);
        assert_eq!(read_u16_le(&wav, 34), 24);

        let data_size_offset = find_chunk(&wav, b"data").expect("data chunk not found");
        let data_size = read_u32_le(&wav, data_size_offset);
        assert_eq!(data_size, 2 * 3); // 2 samples * 3 bytes each
    }

    // ---- 32-bit float WAV ----

    #[test]
    fn test_32bit_float_wav() {
        let samples = vec![0.0_f32, 0.75, -0.25];
        let wav = export(samples, 44100, 32, 1).unwrap();

        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(read_u16_le(&wav, 34), 32);

        // Format tag at offset 20: 3 = IEEE float
        // (hound may write WAVEFORMATEXTENSIBLE tag 0xFFFE for float;
        //  verify it is either 3 or 0xFFFE)
        let fmt_tag = read_u16_le(&wav, 20);
        assert!(
            fmt_tag == 3 || fmt_tag == 0xFFFE,
            "expected IEEE float (3) or WAVEFORMATEXTENSIBLE (0xFFFE), got {}",
            fmt_tag
        );

        let data_size_offset = find_chunk(&wav, b"data").expect("data chunk not found");
        let data_size = read_u32_le(&wav, data_size_offset);
        assert_eq!(data_size, 3 * 4); // 3 samples * 4 bytes each
    }

    // ---- Empty samples ----

    #[test]
    fn test_empty_samples_valid_header() {
        let wav = export(vec![], 44100, 16, 1).unwrap();

        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");

        let data_size_offset = find_chunk(&wav, b"data").expect("data chunk not found");
        assert_eq!(read_u32_le(&wav, data_size_offset), 0); // data size = 0
    }

    // ---- Stereo ----

    #[test]
    fn test_stereo() {
        // Interleaved L/R samples
        let samples = vec![0.5_f32, -0.5, 0.25, -0.25];
        let wav = export(samples, 44100, 16, 2).unwrap();

        // Channels at offset 22
        assert_eq!(read_u16_le(&wav, 22), 2);

        // Data size = 4 samples * 2 bytes each
        let data_size_offset = find_chunk(&wav, b"data").expect("data chunk not found");
        assert_eq!(read_u32_le(&wav, data_size_offset), 4 * 2);
    }

    // ---- Unsupported bit depth ----

    #[test]
    fn test_unsupported_bit_depth_returns_error() {
        let result = export(vec![0.0], 44100, 12, 1);
        assert!(result.is_err(), "expected error for unsupported bit depth 12");
    }
}
