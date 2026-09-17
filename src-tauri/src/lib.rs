mod commands;

use commands::{audio_export, native_files, project};
#[cfg(any(target_os = "macos", target_os = "ios"))]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_crispaudio_native::init())
        .manage(native_files::OpenedFiles::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            audio_export::export_wav,
            project::save_project,
            project::load_project,
            native_files::take_opened_files,
            native_files::read_opened_file,
            native_files::stage_share_file,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| {
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { urls } = &event {
            let paths = urls
                .iter()
                .filter_map(|url| url.to_file_path().ok())
                .collect();
            native_files::handle_opened(app, &app.state::<native_files::OpenedFiles>(), paths);
        }
        let _ = (app, event);
    });
}
