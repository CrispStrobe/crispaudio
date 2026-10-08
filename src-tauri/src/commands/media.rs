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
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        media::export(&session, &output, mix.as_deref(), false, false)
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
