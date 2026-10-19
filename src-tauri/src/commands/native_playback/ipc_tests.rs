//! Actual Tauri dispatch/state/window-label extraction, with no WebKit or devices.
//! MockRuntime must use the cfg(test)-only output factory; normal builds cannot.
use super::*;
use crate::commands::{native_audio_lifecycle, native_recording::NativeRecording};
use std::{
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};
use tauri::{
    ipc::{CallbackFn, InvokeBody},
    test::{mock_builder, mock_context, noop_assets, MockRuntime},
    webview::InvokeRequest,
    Manager,
};

const WAIT: Duration = Duration::from_secs(10);
type Reply = Result<Value, Value>;
struct Fixture {
    app: tauri::App<MockRuntime>,
    main: tauri::WebviewWindow<MockRuntime>,
    other: tauri::WebviewWindow<MockRuntime>,
    prepared: Arc<AtomicU64>,
    control: Arc<Mutex<Option<Arc<LiveControl>>>>,
}
impl Fixture {
    fn new() -> Self {
        Self::with_output(true)
    }
    fn with_output(configured: bool) -> Self {
        let state = NativePlayback::default();
        let prepared = Arc::new(AtomicU64::new(0));
        let control = Arc::new(Mutex::new(None));
        if configured {
            let (count, observed) = (prepared.clone(), control.clone());
            *state.test_output.lock().unwrap() = Some(Arc::new(move |snapshot, control, _| {
                count.fetch_add(1, Ordering::AcqRel);
                *observed.lock().unwrap() = Some(control.clone());
                Ok(Box::new(move || {
                    until(|| control.stop.is_cancelled());
                    drop(snapshot);
                    Ok(json!({"synthetic":true,"joined":true}))
                }))
            }));
        }
        let app = mock_builder()
            .manage(state)
            .manage(Snapshots::default())
            .manage(NativeRecording::default())
            .invoke_handler(tauri::generate_handler![
                super::native_playback_start,
                super::native_playback_status,
                super::native_playback_pause,
                super::native_playback_update,
                super::native_playback_volume,
                super::native_playback_close,
                super::native_playback_reset_loudness,
                crate::commands::native_snapshot::native_snapshot_begin,
                crate::commands::native_snapshot::native_snapshot_write,
                crate::commands::native_snapshot::native_snapshot_seal,
                crate::commands::native_snapshot::native_snapshot_status,
                crate::commands::native_snapshot::native_snapshot_close,
            ])
            .build(mock_context(noop_assets()))
            .unwrap();
        let main = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let other = tauri::WebviewWindowBuilder::new(&app, "other", Default::default())
            .build()
            .unwrap();
        Self {
            app,
            main,
            other,
            prepared,
            control,
        }
    }
    fn json(&self, command: &str, value: Value) -> Reply {
        invoke(&self.main, command, InvokeBody::Json(value))
    }
    fn begin(&self) -> String {
        self.json("native_snapshot_begin", json!({"project":{"sampleRate":48000,"duration":1},"descriptors":[{"id":"source","frames":2048,"channels":2,"sampleRate":48000}]})).unwrap().as_str().unwrap().into()
    }
    fn upload(&self) -> String {
        let id = self.begin();
        invoke(
            &self.main,
            "native_snapshot_write",
            InvokeBody::Raw(packet(&id)),
        )
        .unwrap();
        self.json("native_snapshot_seal", json!({"snapshot":id}))
            .unwrap();
        id
    }
    fn start(&self, id: &str) -> String {
        self.json("native_playback_start", start_args(id))
            .unwrap()
            .as_str()
            .unwrap()
            .into()
    }
    fn counts(&self) -> Value {
        self.json("native_snapshot_status", json!({})).unwrap()
    }
    fn control(&self) -> Arc<LiveControl> {
        self.control.lock().unwrap().as_ref().unwrap().clone()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        native_audio_lifecycle::shutdown(
            &self.app.state::<Snapshots>(),
            &self.app.state::<NativeRecording>(),
            &self.app.state::<NativePlayback>(),
        );
    }
}
fn until(mut ready: impl FnMut() -> bool) {
    let deadline = Instant::now() + WAIT;
    while !ready() {
        assert!(Instant::now() < deadline, "IPC fixture deadline");
        thread::sleep(Duration::from_millis(1));
    }
}
fn pending(
    window: &tauri::WebviewWindow<MockRuntime>,
    command: &str,
    body: InvokeBody,
) -> mpsc::Receiver<Reply> {
    pending_at_origin(window, command, body, "tauri://localhost")
}
fn pending_at_origin(
    window: &tauri::WebviewWindow<MockRuntime>,
    command: &str,
    body: InvokeBody,
    origin: &str,
) -> mpsc::Receiver<Reply> {
    let (send, reply) = mpsc::channel();
    let (window, command, origin) = (window.clone(), command.to_string(), origin.to_string());
    thread::spawn(move || {
        let result = tauri::test::get_ipc_response(
            &window,
            InvokeRequest {
                cmd: command,
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: origin.parse().unwrap(),
                body,
                headers: Default::default(),
                invoke_key: tauri::test::INVOKE_KEY.into(),
            },
        )
        .map(|response| response.deserialize::<Value>().unwrap());
        let _ = send.send(result);
    });
    reply
}
fn invoke(window: &tauri::WebviewWindow<MockRuntime>, command: &str, body: InvokeBody) -> Reply {
    pending(window, command, body)
        .recv_timeout(WAIT)
        .expect("Tauri command did not return")
}
fn start_args(id: &str) -> Value {
    json!({"snapshot":id,"startFrame":0,"endFrame":48000,"cycle":false,"muted":true})
}
fn packet(id: &str) -> Vec<u8> {
    let header =
        serde_json::to_vec(&json!({"snapshot":id,"source":0,"offset":0,"frames":2048})).unwrap();
    let mut packet = b"CPS1".to_vec();
    packet.extend((header.len() as u32).to_le_bytes());
    packet.extend(header);
    packet.resize(packet.len() + 2048 * 2 * 4, 0);
    packet
}

#[test]
fn ipc_binary_upload_controls_and_close_use_actual_commands() {
    let f = Fixture::new();
    let id = f.upload();
    let session = f.start(&id);
    let status = f
        .json("native_playback_status", json!({"session":session}))
        .unwrap();
    assert_eq!(status["phase"], "preparing");
    let controls = json!({"masterVolume":0.25,"tracks":[],"native":[]});
    assert_eq!(
        f.json(
            "native_playback_update",
            json!({"session":session,"controls":controls})
        )
        .unwrap(),
        1
    );
    assert!(f
        .json(
            "native_playback_update",
            json!({"session":session,"controls":"invalid"})
        )
        .is_err());
    assert_eq!(
        f.json(
            "native_playback_pause",
            json!({"session":session,"paused":true})
        )
        .unwrap(),
        Value::Null
    );
    assert_eq!(
        f.json(
            "native_playback_pause",
            json!({"session":session,"paused":false})
        )
        .unwrap(),
        Value::Null
    );
    assert!(f
        .json("native_playback_pause", json!({"session":session}))
        .is_err());
    assert_eq!(
        f.json(
            "native_playback_volume",
            json!({"session":session,"volume":0.2})
        )
        .unwrap(),
        Value::Null
    );
    assert!(f
        .json(
            "native_playback_volume",
            json!({"session":session,"volume":1.01})
        )
        .is_err());
    assert_eq!(
        f.json("native_playback_reset_loudness", json!({"session":session}))
            .unwrap(),
        Value::Null
    );
    f.json("native_snapshot_close", json!({"snapshot":id}))
        .unwrap();
    until(|| f.control().stop.finished.load(Ordering::Acquire));
    assert!(f.app.state::<NativePlayback>().reserve_recording().is_err());
    let summary = f
        .json("native_playback_close", json!({"session":session}))
        .unwrap();
    assert_eq!(summary["joined"], true);
    assert_eq!(f.counts(), json!({"entries":0,"bytes":0}));
    assert!(f
        .json("native_playback_status", json!({"session":session}))
        .is_err());
}

#[test]
fn ipc_window_labels_isolate_uploads_sessions_and_controls() {
    let f = Fixture::new();
    let id = f.begin();
    for (command, body) in [
        ("native_snapshot_write", InvokeBody::Raw(packet(&id))),
        (
            "native_snapshot_seal",
            InvokeBody::Json(json!({"snapshot":id})),
        ),
        (
            "native_snapshot_close",
            InvokeBody::Json(json!({"snapshot":id})),
        ),
    ] {
        assert!(invoke(&f.other, command, body).is_err());
    }
    invoke(
        &f.main,
        "native_snapshot_write",
        InvokeBody::Raw(packet(&id)),
    )
    .unwrap();
    f.json("native_snapshot_seal", json!({"snapshot":id}))
        .unwrap();
    assert!(invoke(
        &f.other,
        "native_playback_start",
        InvokeBody::Json(start_args(&id))
    )
    .is_err());
    let session = f.start(&id);
    let control = f.control();
    for (command, extra) in [
        ("native_playback_status", json!({})),
        ("native_playback_close", json!({})),
        ("native_playback_pause", json!({"paused":true})),
        ("native_playback_volume", json!({"volume":0.1})),
        ("native_playback_reset_loudness", json!({})),
        (
            "native_playback_update",
            json!({"controls":{"masterVolume":0.1,"tracks":[],"native":[]}}),
        ),
    ] {
        let mut args = extra;
        args["session"] = json!(session);
        assert!(invoke(&f.other, command, InvokeBody::Json(args)).is_err());
    }
    assert!(!control.stop.is_cancelled());
    assert_eq!(f.prepared.load(Ordering::Acquire), 1);
    f.json("native_playback_close", json!({"session":session}))
        .unwrap();
    f.json("native_snapshot_close", json!({"snapshot":id}))
        .unwrap();
    assert_eq!(f.counts(), json!({"entries":0,"bytes":0}));
}

#[test]
fn ipc_rejects_malformed_binary_incomplete_upload_and_wrong_argument_names() {
    let f = Fixture::new();
    let id = f.begin();
    assert!(f
        .json("native_snapshot_write", json!({"bytes":packet(&id)}))
        .is_err());
    assert!(invoke(
        &f.main,
        "native_snapshot_write",
        InvokeBody::Raw(vec![1, 2, 3])
    )
    .is_err());
    let mut nan = packet(&id);
    let offset = 8 + u32::from_le_bytes(nan[4..8].try_into().unwrap()) as usize;
    nan[offset..offset + 4].copy_from_slice(&f32::NAN.to_le_bytes());
    assert!(invoke(&f.main, "native_snapshot_write", InvokeBody::Raw(nan)).is_err());
    assert!(f
        .json("native_snapshot_seal", json!({"snapshot":id}))
        .is_err());
    assert!(f.json("native_playback_start", start_args(&id)).is_err());
    invoke(
        &f.main,
        "native_snapshot_write",
        InvokeBody::Raw(packet(&id)),
    )
    .unwrap();
    f.json("native_snapshot_seal", json!({"snapshot":id}))
        .unwrap();
    assert!(f
        .json(
            "native_playback_start",
            json!({"snapshot":id,"start_frame":0,"end_frame":48000,"cycle":false})
        )
        .is_err());
    assert!(f
        .json(
            "native_playback_start",
            json!({"snapshot":id,"startFrame":"zero","endFrame":48000,"cycle":false})
        )
        .is_err());
    assert_eq!(f.prepared.load(Ordering::Acquire), 0);
    let session = f.start(&id);
    f.json("native_playback_close", json!({"session":session}))
        .unwrap();
}

#[test]
fn ipc_mock_output_fails_closed_when_no_test_factory_is_configured() {
    let f = Fixture::with_output(false);
    let id = f.upload();
    let error = f
        .json("native_playback_start", start_args(&id))
        .unwrap_err();
    assert_eq!(error, json!("Mock native output was not configured"));
    assert!(f.app.state::<NativePlayback>().reserve_recording().is_ok());
}

#[test]
fn ipc_start_observes_the_real_recording_lease() {
    let f = Fixture::new();
    let id = f.upload();
    let lease = f.app.state::<NativePlayback>().reserve_recording().unwrap();
    assert!(f.json("native_playback_start", start_args(&id)).is_err());
    assert_eq!(f.prepared.load(Ordering::Acquire), 0);
    drop(lease);
    let session = f.start(&id);
    assert!(f.app.state::<NativePlayback>().reserve_recording().is_err());
    f.json("native_playback_close", json!({"session":session}))
        .unwrap();
    assert!(f.app.state::<NativePlayback>().reserve_recording().is_ok());
    assert_eq!(f.counts(), json!({"entries":1,"bytes":32768}));
    f.json("native_snapshot_close", json!({"snapshot":id}))
        .unwrap();
    assert_eq!(f.counts(), json!({"entries":0,"bytes":0}));
}

#[test]
fn ipc_worker_fault_is_reported_and_error_close_releases_the_registry() {
    let f = Fixture::new();
    let id = f.upload();
    *f.app.state::<NativePlayback>().test_output.lock().unwrap() =
        Some(Arc::new(|_, _control, _| {
            Ok(Box::new(|| Err("synthetic worker fault".into())))
        }));
    let session = f.start(&id);
    let active = f
        .app
        .state::<NativePlayback>()
        .get("main", &session)
        .unwrap();
    until(|| active.control.stop.finished.load(Ordering::Acquire));
    let status = f
        .json("native_playback_status", json!({"session":session}))
        .unwrap();
    assert_eq!(status["phase"], "fault");
    assert_eq!(status["error"], "synthetic worker fault");
    assert!(f.app.state::<NativePlayback>().reserve_recording().is_err());
    assert_eq!(
        f.json("native_playback_close", json!({"session":session}))
            .unwrap_err(),
        json!("synthetic worker fault")
    );
    assert!(f.app.state::<NativePlayback>().reserve_recording().is_ok());
    f.json("native_snapshot_close", json!({"snapshot":id}))
        .unwrap();
}

#[test]
fn ipc_close_reply_waits_for_join_and_retains_output_reservation() {
    let f = Fixture::new();
    let id = f.upload();
    let (release, gate) = mpsc::channel();
    let gate = Mutex::new(Some(gate));
    *f.app.state::<NativePlayback>().test_output.lock().unwrap() =
        Some(Arc::new(move |snapshot, control, _| {
            let gate = gate
                .lock()
                .unwrap()
                .take()
                .ok_or("Output already prepared")?;
            Ok(Box::new(move || {
                until(|| control.stop.is_cancelled());
                gate.recv_timeout(WAIT)
                    .map_err(|_| "Worker release deadline")?;
                drop(snapshot);
                Ok(json!({"joined":true}))
            }))
        }));
    let session = f.start(&id);
    let active = f
        .app
        .state::<NativePlayback>()
        .get("main", &session)
        .unwrap();
    let closing = pending(
        &f.main,
        "native_playback_close",
        InvokeBody::Json(json!({"session":session})),
    );
    until(|| active.control.stop.is_cancelled());
    assert!(closing.recv_timeout(Duration::from_millis(30)).is_err());
    assert!(f.app.state::<NativePlayback>().reserve_recording().is_err());
    release.send(()).unwrap();
    assert_eq!(closing.recv_timeout(WAIT).unwrap().unwrap()["joined"], true);
    assert!(f.app.state::<NativePlayback>().reserve_recording().is_ok());
}

#[test]
fn ipc_pending_start_and_revoked_window_use_production_teardown() {
    let f = Fixture::new();
    let id = f.upload();
    let (entered, ready) = mpsc::channel();
    let (release, gate) = mpsc::channel();
    let gate = Mutex::new(Some(gate));
    *f.app.state::<NativePlayback>().test_output.lock().unwrap() =
        Some(Arc::new(move |snapshot, control, _| {
            entered
                .send(())
                .map_err(|_| "Preparation observer closed")?;
            gate.lock()
                .unwrap()
                .take()
                .ok_or("Output already prepared")?
                .recv_timeout(WAIT)
                .map_err(|_| "Preparation release deadline")?;
            Ok(Box::new(move || {
                until(|| control.stop.is_cancelled());
                drop(snapshot);
                Ok(Value::Null)
            }))
        }));
    let starting = pending(
        &f.main,
        "native_playback_start",
        InvokeBody::Json(start_args(&id)),
    );
    ready.recv_timeout(WAIT).unwrap();
    let app = f.app.handle().clone();
    let closing = thread::spawn(move || {
        native_audio_lifecycle::close_owner(
            "main",
            &app.state::<Snapshots>(),
            &app.state::<NativeRecording>(),
            &app.state::<NativePlayback>(),
        );
    });
    until(|| f.app.state::<Snapshots>().counts().0 == 0);
    assert_eq!(f.counts(), json!({"entries":0,"bytes":32768}));
    assert!(f
        .json(
            "native_snapshot_begin",
            json!({"project":{"sampleRate":48000},"descriptors":[]})
        )
        .is_err());
    release.send(()).unwrap();
    let session = starting.recv_timeout(WAIT).unwrap().unwrap();
    closing.join().unwrap();
    assert!(f
        .json("native_playback_status", json!({"session":session}))
        .is_err());
    assert!(f.json("native_playback_start", start_args(&id)).is_err());
    assert_eq!(f.counts(), json!({"entries":0,"bytes":0}));
}

#[test]
fn ipc_remote_origin_cannot_allocate_a_snapshot_in_the_test_context() {
    let f = Fixture::new();
    let reply = pending_at_origin(
        &f.main,
        "native_snapshot_begin",
        InvokeBody::Json(json!({"project":{"sampleRate":48000},"descriptors":[]})),
        "https://remote.invalid",
    );
    assert!(reply.recv_timeout(WAIT).unwrap().is_err());
    assert_eq!(f.counts(), json!({"entries":0,"bytes":0}));
}
