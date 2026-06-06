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
