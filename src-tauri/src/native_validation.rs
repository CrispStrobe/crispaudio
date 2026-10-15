//! Opt-in, separate validation executable; never invoked by the installed app.
use crate::commands::plugins::{self, PluginStreams};
use crate::native_validation_loopback::Loopback;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;
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
        .manage(PluginStreams::default())
        .manage(ValidationState::default())
        .manage(LoopbackState::default())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window.state::<PluginStreams>().close_owner(window.label());
                window.state::<LoopbackState>().0.lock().unwrap().take();
            }
        })
        .invoke_handler(tauri::generate_handler![
            plugins::plugin_stream_open,
            plugins::plugin_stream_process_binary,
            plugins::plugin_stream_snapshot,
            plugins::plugin_stream_close,
            native_validation_loopback_open,
            native_validation_loopback_close,
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
            app.state::<PluginStreams>().shutdown();
            app.state::<LoopbackState>().0.lock().unwrap().take();
        }
    });
}
