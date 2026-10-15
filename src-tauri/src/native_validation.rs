//! Opt-in, separate validation executable; never invoked by the installed app.
use crate::commands::native_playback::{self, NativePlayback};
use crate::commands::plugins::{self, PluginStreams};
use crate::native_validation_loopback::Loopback;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};
#[derive(Default)]
pub(crate) struct NativeClockState(
    std::sync::Mutex<
        Option<(
            String,
            std::sync::Arc<crate::native_audio_clock::Control>,
            Option<String>,
        )>,
    >,
);
impl NativeClockState {
    pub(crate) fn cancel_snapshot(&self, owner: &str, id: &str) {
        if let Some((label, control, snapshot)) = self.0.lock().unwrap().as_ref() {
            if label == owner && snapshot.as_deref() == Some(id) {
                control.cancel();
            }
        }
    }

    fn cancel_owner(&self, owner: &str) {
        if let Some((active, control, _)) = self.0.lock().unwrap().as_ref() {
            if active == owner {
                control.cancel();
            }
        }
    }
    fn cancel(&self) {
        if let Some((_, stop, _)) = self.0.lock().unwrap().as_ref() {
            stop.cancel();
        }
    }
    fn shutdown(&self) {
        let active = self
            .0
            .lock()
            .unwrap()
            .as_ref()
            .map(|(_, control, _)| control.clone());
        if let Some(control) = active {
            control.cancel();
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
            while !control.finished.load(Ordering::Acquire) && std::time::Instant::now() < deadline
            {
                std::thread::sleep(std::time::Duration::from_millis(2));
            }
        }
    }
}
#[tauri::command]
async fn native_validation_audio_clock(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, NativeClockState>,
    plugin: String,
    starve: bool,
    graph_au: Option<String>,
) -> Result<Value, String> {
    let stop = std::sync::Arc::new(crate::native_audio_clock::Control::default());
    {
        let mut slot = state.0.lock().unwrap();
        if slot.is_some() {
            return Err("Native clock already active".into());
        }
        *slot = Some((window.label().into(), stop.clone(), None));
    }
    let done = stop.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        struct Finished(std::sync::Arc<crate::native_audio_clock::Control>);
        impl Drop for Finished {
            fn drop(&mut self) {
                self.0.finished.store(true, Ordering::Release);
            }
        }
        let _done = Finished(done);
        let device = crate::commands::audio_output::list_audio_outputs()?
            .into_iter()
            .find(|d| d.is_default)
            .ok_or("No default output")?;
        crate::native_audio_clock::probe(plugin, device.id, stop, starve, graph_au, || {
            window
                .emit("native-clock-started", ())
                .map_err(|e| e.to_string())
        })
    })
    .await
    .map_err(|e| e.to_string());
    state.0.lock().unwrap().take();
    result?
}
#[tauri::command]
fn native_validation_audio_clock_cancel(
    window: tauri::WebviewWindow,
    state: tauri::State<NativeClockState>,
) -> Result<(), String> {
    if state
        .0
        .lock()
        .unwrap()
        .as_ref()
        .is_some_and(|(owner, _, _)| owner != window.label())
    {
        return Err("Native clock owner mismatch".into());
    }
    state.cancel();
    Ok(())
}

use crate::commands::native_snapshot::*;
#[tauri::command]
async fn native_snapshot_capture(
    window: tauri::WebviewWindow,
    snapshots: tauri::State<'_, crispaudio_media::native_snapshot::Snapshots>,
    state: tauri::State<'_, NativeClockState>,
    snapshot: String,
    start_frame: u32,
    end_frame: u32,
) -> Result<Value, String> {
    let stop = std::sync::Arc::new(crate::native_audio_clock::Control::default());
    let owned = {
        let mut slot = state.0.lock().unwrap();
        if slot.is_some() {
            return Err("Native clock already active".into());
        }
        let owned = snapshots.get(window.label(), &snapshot)?;
        *slot = Some((window.label().into(), stop.clone(), Some(snapshot)));
        owned
    };
    let done = stop.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        struct Finished(std::sync::Arc<crate::native_audio_clock::Control>);
        impl Drop for Finished {
            fn drop(&mut self) {
                self.0.finished.store(true, Ordering::Release);
            }
        }
        let _done = Finished(done);
        let device = crate::commands::audio_output::list_audio_outputs()?
            .into_iter()
            .find(|d| d.is_default)
            .ok_or("No default output")?;
        crate::native_audio_clock::capture_snapshot(
            owned,
            device.id,
            stop,
            start_frame,
            end_frame,
            || {
                window
                    .emit("native-clock-started", ())
                    .map_err(|e| e.to_string())
            },
        )
    })
    .await
    .map_err(|e| e.to_string());
    state.0.lock().unwrap().take();
    result?
}

#[derive(Default)]
struct LoopbackState(std::sync::Mutex<Option<Loopback>>);
#[tauri::command]
fn native_validation_loopback_open(
    window: tauri::WebviewWindow,
    state: tauri::State<LoopbackState>,
    streams: tauri::State<PluginStreams>,
) -> Result<Value, String> {
    let mut slot = state.0.lock().unwrap();
    if slot.is_some() {
        return Err("Validation endpoint already open".into());
    }
    let origin = window
        .url()
        .map_err(|e| e.to_string())?
        .origin()
        .ascii_serialization();
    if !origin.starts_with("http://127.0.0.1:") {
        return Err("Loopback fixture origin required".into());
    }
    let server = Loopback::start(window.label().into(), origin, streams.inner().clone())?;
    let descriptor = server.descriptor();
    *slot = Some(server);
    Ok(descriptor)
}
#[tauri::command]
async fn native_validation_loopback_close(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, LoopbackState>,
) -> Result<(), String> {
    let server = {
        let mut slot = state.0.lock().unwrap();
        if slot
            .as_ref()
            .is_some_and(|server| server.owner != window.label())
        {
            return Err("Endpoint owner mismatch".into());
        }
        slot.take()
    };
    if let Some(server) = server {
        tauri::async_runtime::spawn_blocking(move || server.stop())
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[derive(Default)]
struct ValidationState {
    finished: AtomicBool,
}
#[tauri::command]
fn native_validation_progress(stage: String) {
    if [
        "loaded",
        "key-ready",
        "worker-created",
        "worker-ping",
        "worker-ipc",
        "worker-finished",
        "worker-audio-open",
        "worker-audio-pulse",
        "worker-audio-connect",
        "worker-audio-capture",
        "worker-audio-close",
        "export",
        "decode",
        "recovery",
        "render",
        "render-done",
        "playback",
        "native-start",
        "native-ready",
        "pause-start",
        "pause-done",
        "capture-done",
    ]
    .contains(&stage.as_str())
    {
        println!("CRISPAUDIO_NATIVE_PHASE {stage}");
    }
}
#[tauri::command]
fn native_validation_worker_key(app: tauri::AppHandle) -> String {
    app.invoke_key().to_string()
}
#[tauri::command]
fn native_validation_status(streams: tauri::State<'_, PluginStreams>) -> Value {
    let (active, opening) = streams.validation_counts();
    json!({"active":active,"opening":opening})
}
#[tauri::command]
fn native_validation_window(window: tauri::WebviewWindow, hidden: bool) -> Result<(), String> {
    if hidden {
        window.hide()
    } else {
        window.show().and_then(|_| window.set_focus())
    }
    .map_err(|e| e.to_string())
}
#[tauri::command]
fn native_validation_delivery_directory() -> Result<String, String> {
    let folder = std::env::temp_dir().join("crispaudio-share").join(format!(
        "native-delivery-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    Ok(folder.to_string_lossy().into_owned())
}
#[tauri::command]
fn native_validation_recordings_remove(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<(), String> {
    if paths.len() > 16 {
        return Err("Too many validation recordings".into());
    }
    let folder = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("recordings");
    for path in paths {
        let path = std::path::PathBuf::from(path);
        if path.parent() != Some(folder.as_path())
            || !path
                .file_name()
                .is_some_and(|name| name.to_string_lossy().starts_with("recording-"))
            || path.extension().is_none_or(|extension| extension != "wav")
        {
            return Err("Not a validation recording".into());
        }
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
fn native_validation_report(app: tauri::AppHandle, report: Value) {
    use std::io::Write;
    app.state::<ValidationState>()
        .finished
        .store(true, Ordering::SeqCst);
    println!("CRISPAUDIO_NATIVE_VALIDATION {}", report);
    let _ = std::io::stdout().flush();
    app.exit(if report["success"] == true { 0 } else { 1 });
}
pub fn run() {
    let options =
        std::env::var("CRISPAUDIO_NATIVE_VALIDATION_OPTIONS").expect("Validation options required");
    let options: Value = serde_json::from_str(&options).expect("Invalid validation options");
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .manage(PluginStreams::default())
        .manage(ValidationState::default())
        .manage(LoopbackState::default())
        .manage(NativeClockState::default())
        .manage(NativePlayback::default())
        .manage(crispaudio_media::native_snapshot::Snapshots::default())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window
                    .state::<NativePlayback>()
                    .cancel_owner(window.label());
                window
                    .state::<NativeClockState>()
                    .cancel_owner(window.label());
                window
                    .state::<crispaudio_media::native_snapshot::Snapshots>()
                    .close_owner(window.label());
                window.state::<PluginStreams>().close_owner(window.label());
                window.state::<LoopbackState>().0.lock().unwrap().take();
            }
        })
        .invoke_handler(tauri::generate_handler![
            plugins::plugin_stream_open,
            plugins::plugin_stream_process_binary,
            plugins::plugin_stream_snapshot,
            plugins::plugin_stream_close,
            native_playback::native_playback_validation_fault,
            native_playback::native_playback_start,
            native_playback::native_playback_status,
            native_playback::native_playback_pause,
            native_playback::native_playback_volume,
            native_playback::native_playback_update,
            native_playback::native_playback_reset_loudness,
            native_playback::native_playback_close,
            native_snapshot_begin,
            native_snapshot_write,
            native_snapshot_seal,
            native_snapshot_close,
            native_snapshot_capture,
            native_snapshot_status,
            native_validation_audio_clock,
            native_validation_audio_clock_cancel,
            native_validation_loopback_open,
            native_validation_loopback_close,
            crate::commands::delivery::publish_delivery_stage,
            native_validation_delivery_directory,
            crate::commands::native_files::persist_recording,
            native_validation_recordings_remove,
            native_validation_report,
            native_validation_status,
            native_validation_worker_key,
            native_validation_progress,
            native_validation_window
        ])
        .setup(move |app| {
            tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("CrispAudio native validation")
            .inner_size(600.0, 300.0)
            .data_store_identifier(*b"CrispNativeTest1")
            .initialization_script(format!("window.nativeValidationOptions={options};"))
            .build()?;
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                for _ in 0..90 {
                    std::thread::sleep(std::time::Duration::from_secs(1));
                    if handle
                        .state::<ValidationState>()
                        .finished
                        .load(Ordering::SeqCst)
                    {
                        return;
                    }
                }
                native_validation_report(
                    handle,
                    json!({"success":false,"error":"Native validation timed out"}),
                );
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Native validation startup failed");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            app.state::<NativeClockState>().shutdown();
            app.state::<NativePlayback>().shutdown();
            app.state::<crispaudio_media::native_snapshot::Snapshots>()
                .shutdown();
            app.state::<PluginStreams>().shutdown();
            app.state::<LoopbackState>().0.lock().unwrap().take();
        }
    });
}

#[cfg(test)]
mod snapshot_owner_tests {
    use super::*;
    #[test]
    fn closing_another_window_does_not_cancel_the_active_snapshot() {
        let control = std::sync::Arc::new(crate::native_audio_clock::Control::default());
        let state = NativeClockState(std::sync::Mutex::new(Some((
            "owner".into(),
            control.clone(),
            Some("snapshot".into()),
        ))));
        state.cancel_owner("other");
        assert!(!control.is_cancelled());
        state.cancel_owner("owner");
        assert!(control.is_cancelled());
    }
}
