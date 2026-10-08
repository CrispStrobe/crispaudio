use crispaudio_media::{self as media, Session};
use tauri::Manager;

#[tauri::command]
pub fn desktop_media_available() -> bool {
    cfg!(not(any(target_os = "ios", target_os = "android")))
}

#[tauri::command]
pub async fn analyze_media(video: String, audio: Vec<String>) -> Result<Session, String> {
    tauri::async_runtime::spawn_blocking(move || media::analyze(&video, &audio))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn align_media(
    session: Session,
    output_dir: String,
    allow_uncertain: bool,
) -> Result<Session, String> {
    tauri::async_runtime::spawn_blocking(move || {
        media::align(&session, &output_dir, allow_uncertain)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn export_media(
    session: Session,
    output: String,
    mix: Option<String>,
    start: Option<f64>,
    end: Option<f64>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if start.is_some() || end.is_some() {
            let range = start.unwrap_or(0.0)..end.unwrap_or(session.video.duration);
            media::export_segment(&session, &output, mix.as_deref(), range, false, false, true)
        } else {
            media::export(&session, &output, mix.as_deref(), false, false)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn prepare_video_preview(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let path = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
    app.asset_protocol_scope()
        .allow_file(&path)
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Two concatenated little-endian mono f32 buffers at 1 kHz, preceded by
/// reference sample count (u32). Analysis runs off the UI thread.
#[tauri::command]
pub async fn estimate_track_sync(
    request: tauri::ipc::Request<'_>,
) -> Result<media::Alignment, String> {
    let body = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes,
        _ => return Err("Binary audio required".into()),
    };
    let (samples, count) = decode_sync_samples(body)?;
    tauri::async_runtime::spawn_blocking(move || {
        media::estimate(&samples[..count], &samples[count..], 1000)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn decode_sync_samples(body: &[u8]) -> Result<(Vec<f32>, usize), String> {
    if body.len() < 12 || (body.len() - 4) % 4 != 0 || body.len() > 120_000_004 {
        return Err("Invalid synchronization payload".into());
    }
    let count = u32::from_le_bytes(body[0..4].try_into().unwrap()) as usize;
    let samples: Vec<f32> = body[4..]
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes(b.try_into().unwrap()))
        .collect();
    if count == 0 || count >= samples.len() || samples.iter().any(|x| !x.is_finite()) {
        return Err("Invalid synchronization samples".into());
    }
    Ok((samples, count))
}

#[cfg(test)]
mod sync_tests {
    use super::decode_sync_samples;
    #[test]
    fn binary_sync_bounds_and_finite_samples() {
        assert!(decode_sync_samples(&[]).is_err());
        let mut bytes = 1u32.to_le_bytes().to_vec();
        bytes.extend_from_slice(&0.25f32.to_le_bytes());
        bytes.extend_from_slice(&(-0.5f32).to_le_bytes());
        let (samples, count) = decode_sync_samples(&bytes).unwrap();
        assert_eq!(count, 1);
        assert_eq!(samples, vec![0.25, -0.5]);
        bytes[0..4].copy_from_slice(&99u32.to_le_bytes());
        assert!(decode_sync_samples(&bytes).is_err());
        bytes[0..4].copy_from_slice(&1u32.to_le_bytes());
        bytes[4..8].copy_from_slice(&f32::NAN.to_le_bytes());
        assert!(decode_sync_samples(&bytes).is_err());
    }
}
