//! Remember only resources whose picker/drop/open grant is already active.
#[cfg(target_os = "macos")]
use tauri::Manager;
#[tauri::command]
pub async fn remember_resources(
    app: tauri::AppHandle,
    paths: Vec<String>,
    writable: bool,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let file = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("resource-bookmarks.json");
        tauri::async_runtime::spawn_blocking(move || {
            crispaudio_media::security_scope::remember_resources(&paths, writable, &file)
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, paths, writable);
        Ok(())
    }
}
#[tauri::command]
pub fn resource_folder_writable(path: String) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        crispaudio_media::security_scope::writable_folder(std::path::Path::new(&path))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Ok(true)
    }
}

/// A different-volume destination needs sibling staging for atomic publication.
#[tauri::command]
pub fn native_export_requires_folder(path: String) -> bool {
    #[cfg(target_os = "macos")]
    {
        !crispaudio_media::export_staging::uses_private_directory(std::path::Path::new(&path))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        false
    }
}

/// Send only linked paths across IPC, never embedded project audio.
#[tauri::command]
pub fn relocate_resource_paths(
    paths: Vec<String>,
) -> Result<std::collections::HashMap<String, String>, String> {
    if paths.len() > 4096
        || paths
            .iter()
            .any(|path| path.len() > 4096 || !std::path::Path::new(path).is_absolute())
    {
        return Err("Invalid resource path batch".into());
    }
    #[allow(unused_mut)]
    let mut result = std::collections::HashMap::new();
    #[cfg(target_os = "macos")]
    for path in paths {
        if let Some(current) =
            crispaudio_media::security_scope::relocated_resource(std::path::Path::new(&path))?
        {
            result.insert(path, current.to_string_lossy().into_owned());
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = paths;
    Ok(result)
}
