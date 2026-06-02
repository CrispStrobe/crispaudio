use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Serialize, Deserialize)]
pub struct ProjectData {
    pub json: String,
}

#[tauri::command]
pub async fn save_project(path: String, data: String) -> Result<(), String> {
    fs::write(&path, &data).map_err(|e| format!("Failed to save project: {}", e))
}

#[tauri::command]
pub async fn load_project(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to load project: {}", e))
}
