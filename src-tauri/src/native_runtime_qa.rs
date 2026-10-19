//! Explicit debug-only Wry/WebKit qualification. This is not an app null-output mode.
use crate::commands::{
    native_playback::NativePlayback, native_recording::NativeRecording, native_snapshot::*,
};
use crispaudio_media::native_snapshot::Snapshots;
use serde_json::{json, Value};
use std::{
    borrow::Cow,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{
    utils::assets::{AssetKey, AssetsIter, CspHash},
    Manager,
};
const IDENTIFIER: &str = "com.crispstrobe.crispaudio.runtime-qa";
const STORE: [u8; 16] = *b"CrispRuntimeQA01";
const HTML: &[u8] = include_bytes!("native_runtime_qa/index.html");
const JS: &[u8] = include_bytes!("native_runtime_qa/qa.js");
struct Assets;
impl tauri::Assets<tauri::Wry> for Assets {
    fn get(&self, key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        match key.as_ref().trim_start_matches('/') {
            "index.html" => Some(Cow::Borrowed(HTML)),
            "qa.js" => Some(Cow::Borrowed(JS)),
            _ => None,
        }
    }
    fn iter(&self) -> Box<AssetsIter<'_>> {
        Box::new(
            [("index.html", HTML), ("qa.js", JS)]
                .into_iter()
                .map(|(key, bytes)| (Cow::Borrowed(key), Cow::Borrowed(bytes))),
        )
    }
    fn csp_hashes(&self, _: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        Box::new(std::iter::empty())
    }
}
#[derive(Default)]
struct Qa {
    peer: Mutex<Option<String>>,
    peer_loaded: AtomicBool,
    destroyed: AtomicBool,
    requested: AtomicBool,
    success: AtomicBool,
    error: Mutex<Option<String>>,
    exit: Mutex<Option<Value>>,
}
fn main_only(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Main QA window required".into());
    }
    Ok(())
}
#[tauri::command]
fn qa_inspect(
    window: tauri::WebviewWindow,
    snapshots: tauri::State<Snapshots>,
    snapshot: String,
) -> Value {
    let sealed = snapshots.get(window.label(), &snapshot);
    let ready = sealed
        .as_ref()
        .is_ok_and(|s| s.project["qa"] == "PCM · 日本語" && s.sources.contains_key("source"));
    let pcm_exact = sealed.ok().is_some_and(|s| {
        // Pure bounded graph only: no worker, plug-in factory, device or output queue.
        let Ok(mut graph) =
            crispaudio_media::native_graph::Graph::prepare(&s.project, s.sources.clone(), |_| {
                Err("Native inserts forbidden in snapshot PCM check".into())
            })
        else {
            return false;
        };
        let mut pcm = vec![[0.; 2]; 2048];
        graph.render(&mut pcm).is_ok() && pcm.iter().all(|sample| *sample == [0.125, -0.25])
    });
    let (entries, bytes) = snapshots.counts();
    json!({"ready":ready,"pcmExact":pcm_exact,"entries":entries,"bytes":bytes})
}
#[tauri::command]
fn qa_peer_loaded(window: tauri::WebviewWindow, qa: tauri::State<Arc<Qa>>) -> Result<(), String> {
    if window.label() != "other" {
        return Err("Peer required".into());
    }
    qa.peer_loaded.store(true, Ordering::Release);
    Ok(())
}
#[tauri::command]
fn qa_ask_peer(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    snapshot: String,
) -> Result<(), String> {
    main_only(&window)?;
    app.get_webview_window("other")
        .ok_or("Missing peer")?
        .eval(format!("window.qaPeer({});", json!(snapshot)))
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn qa_peer_ready(
    window: tauri::WebviewWindow,
    qa: tauri::State<Arc<Qa>>,
    own: String,
    snapshots: tauri::State<Snapshots>,
) -> Result<(), String> {
    if window.label() != "other" || !own.starts_with("snapshot-") || snapshots.counts().0 != 2 {
        return Err("Unexpected peer reply".into());
    }
    *qa.peer.lock().unwrap() = Some(own);
    Ok(())
}
#[tauri::command]
fn qa_state(qa: tauri::State<Arc<Qa>>, snapshots: tauri::State<Snapshots>) -> Value {
    let (entries, bytes) = snapshots.counts();
    json!({"peerLoaded":qa.peer_loaded.load(Ordering::Acquire),"peerReady":qa.peer.lock().unwrap().is_some(),"destroyed":qa.destroyed.load(Ordering::Acquire),"entries":entries,"bytes":bytes})
}
#[tauri::command]
fn qa_destroy_peer(window: tauri::WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    main_only(&window)?;
    app.get_webview_window("other")
        .ok_or("Missing peer")?
        .destroy()
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn qa_retired(
    window: tauri::WebviewWindow,
    snapshots: tauri::State<Snapshots>,
    qa: tauri::State<Arc<Qa>>,
) -> Result<Value, String> {
    main_only(&window)?;
    if !qa.destroyed.load(Ordering::Acquire) {
        return Err("Destroyed event has not arrived".into());
    }
    let revoked = snapshots
        .begin("other", json!({"sampleRate":48000}), vec![])
        .is_err();
    let (entries, bytes) = snapshots.counts();
    Ok(json!({"revoked":revoked,"entries":entries,"bytes":bytes}))
}
#[tauri::command]
fn qa_finish(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    qa: tauri::State<Arc<Qa>>,
    snapshots: tauri::State<Snapshots>,
    success: bool,
    error: Option<String>,
) -> Result<(), String> {
    if success {
        main_only(&window)?;
    }
    if qa.requested.swap(true, Ordering::AcqRel) {
        return Err("Completion already requested".into());
    }
    let valid = success && snapshots.counts() == (1, 32768) && qa.destroyed.load(Ordering::Acquire);
    qa.success.store(valid, Ordering::Release);
    *qa.error.lock().unwrap() = error;
    app.exit(if valid { 0 } else { 1 });
    Ok(())
}
pub fn run() {
    let mut context = crate::app_context();
    assert_eq!(
        context.config().identifier,
        IDENTIFIER,
        "Build with the dedicated runtime QA overlay; refusing the normal app identity"
    );
    assert!(
        context.config().app.windows.is_empty(),
        "QA must not open the production frontend"
    );
    assert!(
        context.config().build.dev_url.is_none(),
        "QA must use isolated local assets"
    );
    assert!(
        context
            .config()
            .bundle
            .file_associations
            .as_ref()
            .map_or(true, |a| a.is_empty()),
        "QA must not register documents"
    );
    if std::env::args().any(|arg| arg == "--identity") {
        println!(
            "{}",
            json!({"identifier":IDENTIFIER,"version":context.config().version,"store":STORE,"audioCommands":false})
        );
        return;
    }
    context.set_assets(Box::new(Assets));
    let qa = Arc::new(Qa::default());
    let exit_state = qa.clone();
    let app = tauri::Builder::default()
        .manage(qa)
        .manage(Snapshots::default())
        .manage(NativePlayback::default())
        .manage(NativeRecording::default())
        .manage(crate::commands::recording_conversions::ConversionFiles::default())
        .manage(crate::commands::plugins::PluginStreams::default())
        .invoke_handler(tauri::generate_handler![
            native_snapshot_begin,
            native_snapshot_write,
            native_snapshot_seal,
            native_snapshot_close,
            native_snapshot_status,
            qa_inspect,
            qa_peer_loaded,
            qa_ask_peer,
            qa_peer_ready,
            qa_state,
            qa_destroy_peer,
            qa_retired,
            qa_finish
        ])
        .on_window_event(|window, event| {
            crate::handle_window_event(window, event);
            if window.label() == "other" && matches!(event, tauri::WindowEvent::Destroyed) {
                window
                    .state::<Arc<Qa>>()
                    .destroyed
                    .store(true, Ordering::Release);
            }
        })
        .setup(|app| {
            for label in ["other", "main"] {
                tauri::WebviewWindowBuilder::new(
                    app,
                    label,
                    tauri::WebviewUrl::App("index.html".into()),
                )
                .title(format!("CrispAudio Runtime QA · {label}"))
                .inner_size(480.0, 180.0)
                .data_store_identifier(STORE)
                .initialization_script(format!("window.QA_ROLE={};", json!(label)))
                .build()?;
            }
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                for _ in 0..60 {
                    std::thread::sleep(Duration::from_secs(1));
                    if handle.state::<Arc<Qa>>().requested.load(Ordering::Acquire) {
                        return;
                    }
                }
                *handle.state::<Arc<Qa>>().error.lock().unwrap() =
                    Some("WebKit QA timed out".into());
                handle.exit(1);
            });
            Ok(())
        })
        .build(context)
        .expect("Runtime QA startup failed");
    let code = app.run_return(|app,event| {
        if matches!(event,tauri::RunEvent::Exit) {
            let before = app.state::<Snapshots>().counts();
            crate::shutdown_resources(app);
            let snapshots = app.state::<Snapshots>(); let after = snapshots.counts();
            let closed = snapshots.begin("after-exit",json!({"sampleRate":48000}),vec![]).is_err();
            let qa = app.state::<Arc<Qa>>();
            let success = qa.success.load(Ordering::Acquire) && after == (0,0) && closed;
            *qa.exit.lock().unwrap() = Some(json!({"success":success,"identifier":IDENTIFIER,"store":STORE,"destroyedEvent":qa.destroyed.load(Ordering::Acquire),"exitEvent":true,"beforeExitEntries":before.0,"afterExitEntries":after.0,"afterExitBytes":after.1,"admissionClosed":closed,"error":qa.error.lock().unwrap().clone(),"audioCommands":false}));
        }
    });
    let report = exit_state
        .exit
        .lock()
        .unwrap()
        .clone()
        .unwrap_or(json!({"success":false,"error":"No actual Exit event"}));
    println!("CRISPAUDIO_RUNTIME_QA {report}");
    std::process::exit(if report["success"] == true && code == 0 {
        0
    } else {
        1
    });
}
