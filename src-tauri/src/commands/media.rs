use crispaudio_media::{self as media, Session};
use tauri::Manager;
use tauri_plugin_fs::FsExt;

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
    job_id: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        media::jobs::run(job_id, || {
            if start.is_some() || end.is_some() {
                let range = start.unwrap_or(0.0)..end.unwrap_or(session.video.duration);
                media::export_segment(&session, &output, mix.as_deref(), range, false, false, true)
            } else {
                media::export(&session, &output, mix.as_deref(), false, false)
            }
        })
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

#[tauri::command]
pub async fn export_video_edit(
    edit: media::video_edit::VideoEdit,
    output: String,
    mix: Option<String>,
    start: f64,
    end: f64,
    job_id: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        media::jobs::run(job_id, || {
            media::video_edit::export_edit(&edit, &output, mix.as_deref(), start, end, true)
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn probe_media(path: String) -> Result<media::MediaInfo, String> {
    tauri::async_runtime::spawn_blocking(move || media::probe(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn prepare_media_asset(
    app: tauri::AppHandle,
    path: String,
    proxy: bool,
    denoise: Option<bool>,
    thumbnail: Option<bool>,
    job_id: Option<String>,
) -> Result<String, String> {
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("media");
    let result = tauri::async_runtime::spawn_blocking(move || {
        media::jobs::run(job_id, || {
            use std::hash::{Hash, Hasher};
            let path = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
            let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
            let mut hash = std::collections::hash_map::DefaultHasher::new();
            path.hash(&mut hash);
            metadata.len().hash(&mut hash);
            metadata.modified().ok().hash(&mut hash);
            proxy.hash(&mut hash);
            denoise.unwrap_or(false).hash(&mut hash);
            thumbnail.unwrap_or(false).hash(&mut hash);
            std::fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
            let destination = cache.join(format!(
                "{:x}.{}",
                hash.finish(),
                if thumbnail.unwrap_or(false) {
                    "jpg"
                } else if proxy {
                    "mp4"
                } else {
                    "wav"
                }
            ));
            if !destination.exists() {
                let stamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(|e| e.to_string())?
                    .as_nanos();
                let stage = cache.join(format!(
                    "{:x}-{}-{stamp}.{}",
                    hash.finish(),
                    std::process::id(),
                    if thumbnail.unwrap_or(false) {
                        "jpg"
                    } else if proxy {
                        "mp4"
                    } else {
                        "wav"
                    }
                ));
                let result = if thumbnail.unwrap_or(false) {
                    media::first_thumbnail(&path.to_string_lossy(), &stage.to_string_lossy())
                } else if denoise.unwrap_or(false) {
                    media::clean_audio(&path.to_string_lossy(), &stage.to_string_lossy(), -45.0)
                } else {
                    media::prepare_asset(&path.to_string_lossy(), &stage.to_string_lossy(), proxy)
                }
                .and_then(|_| std::fs::rename(&stage, &destination).map_err(|e| e.to_string()));
                if result.is_err() {
                    let _ = std::fs::remove_file(stage);
                }
                result?;
            }
            Ok::<_, String>(destination.to_string_lossy().into_owned())
        })
    })
    .await
    .map_err(|e| e.to_string())??;
    app.asset_protocol_scope()
        .allow_file(&result)
        .map_err(|e| e.to_string())?;
    app.fs_scope()
        .allow_file(&result)
        .map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub async fn measure_loudness(
    path: String,
    job_id: Option<String>,
) -> Result<media::Loudness, String> {
    tauri::async_runtime::spawn_blocking(move || {
        media::jobs::run(job_id, || media::loudness(&path))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn cancel_media_job(job_id: String) -> bool {
    media::jobs::cancel(&job_id)
}

/// Native disk-backed audio mix and desktop picture export, without GUI PCM IPC.
#[tauri::command]
pub async fn export_linked_project_video(
    document: serde_json::Value,
    edit: media::video_edit::VideoEdit,
    output: String,
    start: f64,
    end: f64,
    job_id: Option<String>,
) -> Result<(), String> {
    if !cfg!(target_os = "macos") {
        return Err("Native linked-project video export requires macOS".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        media::jobs::run(job_id, || {
            media::video_edit::export_linked_project(&document, &edit, &output, start, end)
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Save an integer WAV directly to disk; no decoded PCM or WAV bytes cross IPC.
#[tauri::command]
pub async fn export_linked_project_wav(
    document: serde_json::Value,
    output: String,
    bit_depth: u16,
    job_id: Option<String>,
) -> Result<(), String> {
    if !cfg!(target_os = "macos")
        || document["format"] != "crispaudio-project"
        || document["version"] != 3
        || document["project"]["sampleRate"] != 48000
    {
        return Err("Native WAV export requires a linked 48 kHz project on macOS".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        media::jobs::run(job_id, || {
            media::audio_mix::render_pcm(&document, &output, bit_depth)
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn export_linked_project_flac(
    document: serde_json::Value,
    output: String,
    job_id: Option<String>,
) -> Result<(), String> {
    if !cfg!(target_os = "macos")
        || document["format"] != "crispaudio-project"
        || document["version"] != 3
        || document["project"]["sampleRate"] != 48000
    {
        return Err("Native FLAC export requires a linked 48 kHz project on macOS".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        media::jobs::run(job_id, || {
            media::audio_encode::render_flac(&document, &output)
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
