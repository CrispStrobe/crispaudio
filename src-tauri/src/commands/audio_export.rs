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
