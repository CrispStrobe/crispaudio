use std::fs;

#[tauri::command]
pub async fn save_project(path: String, data: String) -> Result<(), String> {
    fs::write(&path, &data).map_err(|e| format!("Failed to save project: {}", e))
}

#[tauri::command]
pub async fn load_project(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to load project: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_path(name: &str) -> String {
        let mut p = PathBuf::from(std::env::temp_dir());
        p.push(format!("crispaudio_test_{}", name));
        p.to_string_lossy().into_owned()
    }

    fn run<T>(fut: impl std::future::Future<Output = T>) -> T {
        tokio::runtime::Runtime::new().unwrap().block_on(fut)
    }

    #[test]
    fn test_save_project_writes_file() {
        let path = temp_path("save_write");
        let data = r#"{"name":"test project"}"#.to_string();

        run(save_project(path.clone(), data.clone())).unwrap();

        let contents = std::fs::read_to_string(&path).unwrap();
        assert_eq!(contents, data);

        // cleanup
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn test_load_project_reads_file() {
        let path = temp_path("load_read");
        let data = r#"{"tracks":[]}"#.to_string();

        std::fs::write(&path, &data).unwrap();

        let loaded = run(load_project(path.clone())).unwrap();
        assert_eq!(loaded, data);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn test_load_project_nonexistent_returns_error() {
        let path = temp_path("does_not_exist_12345");
        // Make sure the file really doesn't exist
        let _ = std::fs::remove_file(&path);

        let result = run(load_project(path));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to load project"));
    }
}

/// Save-derived media out of the OS cache next to the project. Original user
/// recordings stay linked in place. Existing asset files are never overwritten.
#[tauri::command]
pub async fn persist_cached_media(
    app: tauri::AppHandle,
    json: String,
    project_path: String,
) -> Result<String, String> {
    use tauri::Manager;
    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || persist_assets(&json, &project_path, &cache))
        .await
        .map_err(|e| e.to_string())?
}
fn persist_assets(
    json: &str,
    project_path: &str,
    cache: &std::path::Path,
) -> Result<String, String> {
    use std::hash::{Hash, Hasher};
    let mut doc: serde_json::Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
    let parent = std::path::Path::new(project_path)
        .parent()
        .ok_or("Project has no parent folder")?;
    let filename = std::path::Path::new(project_path)
        .file_name()
        .ok_or("Project filename missing")?
        .to_string_lossy();
    let assets = parent.join(format!("{filename}.media"));
    let cache = cache.canonicalize().map_err(|e| e.to_string())?;
    if let Some(sources) = doc["sources"].as_array_mut() {
        for source in sources {
            let Some(path) = source["path"].as_str() else {
                continue;
            };
            let path = std::path::Path::new(path)
                .canonicalize()
                .map_err(|e| e.to_string())?;
            if !path.starts_with(&cache) {
                continue;
            }
            let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
            let mut hash = std::collections::hash_map::DefaultHasher::new();
            path.hash(&mut hash);
            metadata.len().hash(&mut hash);
            metadata.modified().ok().hash(&mut hash);
            std::fs::create_dir_all(&assets).map_err(|e| e.to_string())?;
            let destination = assets.join(format!("audio-{:x}.wav", hash.finish()));
            if !destination.exists() {
                let stamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(|e| e.to_string())?
                    .as_nanos();
                let staged = assets.join(format!(".copy-{}-{stamp}", std::process::id()));
                let result = std::fs::copy(&path, &staged)
                    .map_err(|e| e.to_string())
                    .and_then(|_| {
                        std::fs::hard_link(&staged, &destination).map_err(|e| e.to_string())
                    });
                let _ = std::fs::remove_file(staged);
                result?;
            }
            if std::fs::metadata(&destination)
                .map_err(|e| e.to_string())?
                .len()
                != metadata.len()
            {
                return Err("Project media asset size mismatch".into());
            }
            source["path"] = serde_json::json!(destination.to_string_lossy());
        }
    }
    serde_json::to_string(&doc).map_err(|e| e.to_string())
}

#[cfg(test)]
mod asset_tests {
    use super::*;
    #[test]
    fn cache_audio_becomes_durable_while_original_recordings_stay_linked() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("crispaudio-package-{stamp}"));
        let cache = root.join("cache");
        std::fs::create_dir_all(&cache).unwrap();
        let derived = cache.join("camera.wav");
        let original = root.join("original.wav");
        std::fs::write(&derived, b"derived audio").unwrap();
        std::fs::write(&original, b"original audio").unwrap();
        let project = root.join("test.crispaudio");
        let json =
            serde_json::json!({"sources":[{"id":"a","path":derived},{"id":"b","path":original}]})
                .to_string();
        let saved = persist_assets(&json, &project.to_string_lossy(), &cache).unwrap();
        let doc: serde_json::Value = serde_json::from_str(&saved).unwrap();
        let durable = std::path::Path::new(doc["sources"][0]["path"].as_str().unwrap());
        assert!(!durable.starts_with(&cache));
        assert_eq!(std::fs::read(durable).unwrap(), b"derived audio");
        assert_eq!(doc["sources"][1]["path"], serde_json::json!(original));
        assert_eq!(
            persist_assets(&json, &project.to_string_lossy(), &cache).unwrap(),
            saved
        );
        assert_eq!(std::fs::read(derived).unwrap(), b"derived audio");
        std::fs::remove_dir_all(root).unwrap();
    }
}
