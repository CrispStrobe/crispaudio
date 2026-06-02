use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize)]
pub struct AudioFileInfo {
    pub path: String,
    pub data: Vec<u8>,
    pub name: String,
}

#[tauri::command]
pub async fn open_audio_file(path: String) -> Result<AudioFileInfo, String> {
    let path_buf = PathBuf::from(&path);
    let name = path_buf
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let data = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(AudioFileInfo { path, data, name })
}

#[tauri::command]
pub async fn save_audio_file(path: String, data: Vec<u8>) -> Result<(), String> {
    fs::write(&path, &data).map_err(|e| format!("Failed to write file: {}", e))
}
