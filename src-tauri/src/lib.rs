#[cfg(all(feature = "native-validation", target_os = "macos"))]
mod folder_validation;
#[cfg(target_os = "macos")]
mod native_audio_clock;
#[cfg(all(feature = "native-validation", target_os = "macos"))]
mod native_validation;
#[cfg(all(feature = "native-validation", target_os = "macos"))]
mod native_validation_loopback;
#[cfg(all(feature = "native-validation", target_os = "macos"))]
mod resource_validation;
#[cfg(all(feature = "native-validation", target_os = "macos"))]
pub use native_validation::run as run_native_validation;
mod commands;
mod native_menu;

use commands::{audio_export, media, native_files, project};
use tauri::Manager;

// One context expansion also embeds the Mac Info.plist exactly once.
pub(crate) fn app_context() -> tauri::Context<tauri::Wry> {
    tauri::generate_context!()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_crispaudio_native::init())
        .manage(native_files::OpenedFiles::default())
        .manage(commands::midi::MidiState::default())
        .manage(commands::plugins::PluginStreams::default())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                #[cfg(target_os = "macos")]
                {
                    window
                        .state::<commands::native_playback::NativePlayback>()
                        .close_owner(window.label());
                    window
                        .state::<crispaudio_media::native_snapshot::Snapshots>()
                        .close_owner(window.label());
                }
                window
                    .state::<commands::plugins::PluginStreams>()
                    .close_owner(window.label());
            }
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            #[cfg(target_os = "macos")]
            {
                let data = app.path().app_data_dir()?;
                match crispaudio_media::security_scope::restore_resources(
                    &data.join("resource-bookmarks.json"),
                ) {
                    Ok(unavailable) if !unavailable.is_empty() => log::warn!(
                        "{} selected resources unavailable; reselect them",
                        unavailable.len()
                    ),
                    Err(error) => log::warn!("Could not restore selected resource access: {error}"),
                    _ => {}
                }
                let file = data.join("plugin-folders.json");
                match crispaudio_media::security_scope::restore(&file) {
                    Ok(unavailable) if !unavailable.is_empty() => log::warn!(
                        "{} saved plug-in folders unavailable; reselect them",
                        unavailable.len()
                    ),
                    Err(error) => log::warn!("Could not restore plug-in folder access: {error}"),
                    _ => {}
                }
                native_menu::install(app.handle(), &native_menu::MenuContext::default())?;
            }
            Ok(())
        });
    #[cfg(target_os = "macos")]
    let builder = builder
        .manage(commands::native_playback::NativePlayback::default())
        .manage(crispaudio_media::native_snapshot::Snapshots::default());
    #[cfg(desktop)]
    let builder = builder.on_menu_event(|app, event| {
        use tauri::Emitter;
        if let Some(action) = event.id().as_ref().strip_prefix("ca-") {
            let _ = app.emit("crispaudio-menu", action);
        }
    });
    let app = builder
        .invoke_handler(tauri::generate_handler![
            #[cfg(target_os = "macos")]
            commands::native_snapshot::native_snapshot_begin,
            #[cfg(target_os = "macos")]
            commands::native_snapshot::native_snapshot_write,
            #[cfg(target_os = "macos")]
            commands::native_snapshot::native_snapshot_seal,
            #[cfg(target_os = "macos")]
            commands::native_snapshot::native_snapshot_close,
            #[cfg(target_os = "macos")]
            commands::native_snapshot::native_snapshot_status,
            #[cfg(target_os = "macos")]
            commands::native_playback::native_playback_start,
            #[cfg(target_os = "macos")]
            commands::native_playback::native_playback_status,
            #[cfg(target_os = "macos")]
            commands::native_playback::native_playback_pause,
            #[cfg(target_os = "macos")]
            commands::native_playback::native_playback_update,
            #[cfg(target_os = "macos")]
            commands::native_playback::native_playback_reset_loudness,
            #[cfg(target_os = "macos")]
            commands::native_playback::native_playback_volume,
            #[cfg(target_os = "macos")]
            commands::native_playback::native_playback_close,
            native_menu::configure_native_menu,
            commands::midi::list_midi_inputs,
            commands::midi::connect_midi_input,
            commands::midi::disconnect_midi_input,
            commands::audio_output::list_audio_outputs,
            commands::audio_output::select_audio_output,
            audio_export::export_wav,
            audio_export::export_wav_binary,
            project::save_project,
            project::persist_cached_media,
            commands::delivery::review_project_media,
            commands::delivery::resolve_project_media,
            commands::delivery::collect_project_media,
            commands::delivery::publish_delivery_stage,
            commands::delivery::annotate_delivery_wav,
            commands::resources::remember_resources,
            commands::resources::resource_folder_writable,
            commands::resources::native_export_requires_folder,
            commands::resources::relocate_resource_paths,
            commands::plugins::remember_plugin_folder,
            commands::plugins::audio_unit_plugin,
            commands::plugins::plugin_stream_open,
            commands::plugins::plugin_stream_process,
            commands::plugins::plugin_stream_process_binary,
            commands::plugins::plugin_stream_snapshot,
            commands::plugins::plugin_stream_close,
            project::load_project,
            native_files::take_opened_files,
            native_files::read_opened_file,
            native_files::stage_share_file,
            native_files::persist_recording,
            media::desktop_media_available,
            media::probe_media,
            media::cancel_media_job,
            media::measure_loudness,
            media::prepare_media_asset,
            media::retime_media_asset,
            media::analyze_media,
            media::align_media,
            media::export_media,
            media::export_video_edit,
            media::export_linked_project_video,
            media::export_linked_project_wav,
            media::export_linked_project_flac,
            media::export_linked_project_aac,
            media::prepare_video_preview,
            media::estimate_track_sync,
        ])
        .build(app_context())
        .expect("error while building tauri application");

    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            #[cfg(target_os = "macos")]
            {
                app.state::<commands::native_playback::NativePlayback>()
                    .shutdown();
                app.state::<crispaudio_media::native_snapshot::Snapshots>()
                    .shutdown();
            }
            app.state::<commands::plugins::PluginStreams>().shutdown();
        }
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
