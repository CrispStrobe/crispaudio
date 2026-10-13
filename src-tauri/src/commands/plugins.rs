//! Cancellable macOS Audio Unit effect discovery and isolated source processing.
use serde_json::{json, Value};
use tauri::Manager;
#[tauri::command]
pub async fn audio_unit_plugin(
    app: tauri::AppHandle,
    operation: String,
    mut request: Value,
    job_id: Option<String>,
) -> Result<Value, String> {
    if !request.is_object() || request.to_string().len() > 16_000_000 {
        return Err("Invalid plugin request".into());
    }
    if !cfg!(target_os = "macos") {
        return Err("Desktop plugin hosting requires macOS".into());
    }
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("plugin-previews");
    tauri::async_runtime::spawn_blocking(move || {
        crispaudio_media::jobs::run(job_id, || {
            let mut output = None;
            if operation == "plugin-render" {
                std::fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
                let path = cache.join(format!(
                    "preview-{}-{}.wav",
                    std::process::id(),
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map_err(|e| e.to_string())?
                        .as_nanos()
                ));
                request["output"] = json!(path);
                output = Some(path);
            }
            let result = crispaudio_media::apple::plugin(&operation, &request.to_string());
            if result.is_err() {
                if let Some(path) = output {
                    let _ = std::fs::remove_file(path);
                }
            }
            result
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
