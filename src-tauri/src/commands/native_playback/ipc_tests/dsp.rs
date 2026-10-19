//! Actual generated command dispatch + production registry, worker/ring/graph.
//! Only output time/consumption and MockRuntime windows are synthetic.
use super::*;
use crate::native_audio_clock::live::null_bridge;
use std::collections::VecDeque;
const FRAMES: usize = 8192;
type History = Arc<Mutex<VecDeque<[f32; 2]>>>;

macro_rules! forbidden_queue {
    ($name:ident) => {
        #[no_mangle]
        pub unsafe extern "C" fn $name(
            _: *const std::ffi::c_void,
            _: *const std::ffi::c_void,
            _: *mut std::ffi::c_void,
            _: *const std::ffi::c_void,
            _: *const std::ffi::c_void,
            _: u32,
            _: *mut *mut std::ffi::c_void,
        ) -> i32 {
            eprintln!("Native command/DSP QA forbids hardware queues");
            std::process::abort()
        }
    };
}
forbidden_queue!(AudioQueueNewOutput);
forbidden_queue!(AudioQueueNewInput);
#[no_mangle]
pub unsafe extern "C" fn AudioObjectGetPropertyDataSize(
    _: u32,
    _: *const std::ffi::c_void,
    _: u32,
    _: *const std::ffi::c_void,
    _: *mut u32,
) -> i32 {
    eprintln!("Native command/DSP QA forbids device inventory");
    std::process::abort()
}
#[no_mangle]
pub unsafe extern "C" fn AudioObjectGetPropertyData(
    _: u32,
    _: *const std::ffi::c_void,
    _: u32,
    _: *const std::ffi::c_void,
    _: *mut u32,
    _: *mut std::ffi::c_void,
) -> i32 {
    eprintln!("Native command/DSP QA forbids device property queries");
    std::process::abort()
}

fn guards() {
    // Keep definitions even if this fixture's reachable graph needs no CoreAudio.
    std::hint::black_box(AudioQueueNewOutput as *const ());
    std::hint::black_box(AudioQueueNewInput as *const ());
    std::hint::black_box(AudioObjectGetPropertyDataSize as *const ());
    std::hint::black_box(AudioObjectGetPropertyData as *const ());
}
#[derive(Default)]
struct Gate {
    entered: AtomicBool,
    release: AtomicBool,
}
impl Gate {
    fn wait(&self) {
        self.entered.store(true, Ordering::Release);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        while !self.release.load(Ordering::Acquire) {
            assert!(
                std::time::Instant::now() < deadline,
                "DSP fixture gate deadline"
            );
            thread::sleep(Duration::from_millis(1));
        }
    }
}
struct Dsp {
    fixture: Fixture,
    history: History,
    gate: Option<Arc<Gate>>,
}
impl Dsp {
    fn new(gate: Option<Arc<Gate>>) -> Self {
        guards();
        let fixture = Fixture::with_output(false);
        let history: History = Default::default();
        let (observed, counter, control, gate_copy) = (
            history.clone(),
            fixture.prepared.clone(),
            fixture.control.clone(),
            gate.clone(),
        );
        *fixture
            .app
            .state::<NativePlayback>()
            .test_output
            .lock()
            .unwrap() = Some(Arc::new(move |snapshot, live, range| {
            counter.fetch_add(1, Ordering::AcqRel);
            *control.lock().unwrap() = Some(live.clone());
            let (observed, gate) = (observed.clone(), gate_copy.clone());
            Ok(Box::new(move || {
                null_bridge::run_observed(
                    snapshot,
                    range.start,
                    range.end,
                    range.cycle,
                    range.loop_start,
                    live,
                    |pcm| {
                        if let Some(gate) = &gate {
                            if !gate.release.load(Ordering::Acquire) {
                                gate.wait();
                            }
                        }
                        let mut history = observed.lock().unwrap();
                        if let Some(sample) = pcm.chunks_exact(2).next() {
                            history.push_back([sample[0], sample[1]]);
                        }
                        while history.len() > 32 {
                            history.pop_front();
                        }
                    },
                )
            }))
        }));
        Self {
            fixture,
            history,
            gate,
        }
    }
    fn upload(&self, other: bool, native: Value) -> String {
        let window = if other {
            &self.fixture.other
        } else {
            &self.fixture.main
        };
        let project = json!({"id":"qa-project","sampleRate":48000,"duration":FRAMES as f64/48000.,"masterVolume":0.5,"outputLimiter":{"enabled":false},"nativeEffects":native,"tracks":[{"id":"qa-track","recordArmed":true,"volume":0.5,"pan":0,"segments":[{"id":"qa-clip","sourceId":"source","startTime":0,"sourceOffset":0,"duration":FRAMES as f64/48000.,"gain":1,"effects":[]}]}]});
        let id = invoke(window,"native_snapshot_begin",InvokeBody::Json(json!({"project":project,"descriptors":[{"id":"source","frames":FRAMES,"channels":2,"sampleRate":48000}]}))).unwrap().as_str().unwrap().to_owned();
        let header =
            serde_json::to_vec(&json!({"snapshot":id,"source":0,"offset":0,"frames":FRAMES}))
                .unwrap();
        let mut bytes = b"CPS1".to_vec();
        bytes.extend((header.len() as u32).to_le_bytes());
        bytes.extend(header);
        for value in [0.5f32, -0.25] {
            for _ in 0..FRAMES {
                bytes.extend(value.to_le_bytes());
            }
        }
        invoke(window, "native_snapshot_write", InvokeBody::Raw(bytes)).unwrap();
        invoke(
            window,
            "native_snapshot_seal",
            InvokeBody::Json(json!({"snapshot":id})),
        )
        .unwrap();
        id
    }
    fn start(&self, id: &str, other: bool, cycle: bool) -> String {
        let window = if other {
            &self.fixture.other
        } else {
            &self.fixture.main
        };
        invoke(window,"native_playback_start",InvokeBody::Json(json!({"snapshot":id,"device":"qa-no-device","startFrame":0,"endFrame":FRAMES,"cycle":cycle,"loopStartFrame":0,"muted":true}))).unwrap().as_str().unwrap().into()
    }
    fn status(&self, session: &str) -> Value {
        self.fixture
            .json("native_playback_status", json!({"session":session}))
            .unwrap()
    }
    fn close(&self, session: &str) -> Reply {
        self.fixture
            .json("native_playback_close", json!({"session":session}))
    }
    fn tail(&self, expected: [f32; 2]) -> bool {
        let history = self.history.lock().unwrap();
        history.len() >= 4
            && history.iter().rev().take(4).all(|actual| {
                actual
                    .iter()
                    .zip(expected)
                    .all(|(a, e)| (a - e).abs() < 1e-5)
            })
    }
}
impl Drop for Dsp {
    fn drop(&mut self) {
        if let Some(gate) = &self.gate {
            gate.release.store(true, Ordering::Release);
        }
    }
}
fn controls(level: f64, native: Value) -> Value {
    json!({"masterVolume":level,"tracks":[{"id":"qa-track","volume":0.5,"pan":0,"muted":false,"solo":false}],"native":native})
}
#[test]
fn commands_render_real_worker_pcm_and_join_at_finite_end() {
    let d = Dsp::new(None);
    let id = d.upload(false, json!([]));
    let session = d.start(&id, false, false);
    until(|| d.status(&session)["phase"] == "ended");
    let control = d.fixture.control();
    let summary = d.close(&session).unwrap();
    assert_eq!(summary["helpersClosed"], true);
    assert_eq!(summary["queueBuffers"], 0);
    assert!(control.stop.finished.load(Ordering::Acquire));
    let samples = summary["samples"].as_array().unwrap();
    assert_eq!(samples.len(), 256);
    for sample in samples {
        assert_eq!(sample["left"], 0.125);
        assert_eq!(sample["right"], -0.0625);
    }
    assert!(d.status_or_missing(&session));
    d.fixture
        .json("native_snapshot_close", json!({"snapshot":id}))
        .unwrap();
    assert_eq!(d.fixture.counts(), json!({"entries":0,"bytes":0}));
}
impl Dsp {
    fn status_or_missing(&self, session: &str) -> bool {
        self.fixture
            .json("native_playback_status", json!({"session":session}))
            .is_err()
    }
}
#[test]
fn commands_apply_live_gain_pause_resume_and_monitor_without_printing_monitor_gain() {
    let d = Dsp::new(None);
    let id = d.upload(false, json!([]));
    let session = d.start(&id, false, true);
    until(|| d.tail([0.125, -0.0625]));
    d.fixture
        .json(
            "native_playback_pause",
            json!({"session":session,"paused":true}),
        )
        .unwrap();
    until(|| d.status(&session)["phase"] == "paused");
    let frame = d.status(&session)["frame"].clone();
    thread::sleep(Duration::from_millis(30));
    assert_eq!(d.status(&session)["frame"], frame);
    let revision = d
        .fixture
        .json(
            "native_playback_update",
            json!({"session":session,"controls":controls(0.25,json!([]))}),
        )
        .unwrap();
    until(|| d.status(&session)["appliedRevision"] == revision);
    d.fixture
        .json(
            "native_playback_volume",
            json!({"session":session,"volume":0.1}),
        )
        .unwrap();
    d.fixture
        .json("native_playback_reset_loudness", json!({"session":session}))
        .unwrap();
    d.fixture
        .json(
            "native_playback_pause",
            json!({"session":session,"paused":false}),
        )
        .unwrap();
    until(|| d.tail([0.0625, -0.03125])); // Raw graph is independent of monitor-only volume.
    assert!(invoke(
        &d.fixture.other,
        "native_playback_pause",
        InvokeBody::Json(json!({"session":session,"paused":true}))
    )
    .is_err());
    assert_eq!(d.close(&session).unwrap()["helpersClosed"], true);
    d.fixture
        .json("native_snapshot_close", json!({"snapshot":id}))
        .unwrap();
    assert_eq!(d.fixture.counts(), json!({"entries":0,"bytes":0}));
}
#[test]
fn actual_recording_start_rejects_owned_playback_before_capture() {
    let d = Dsp::new(None);
    let id = d.upload(false, json!([]));
    let session = d.start(&id, false, true);
    until(|| d.status(&session)["phase"] == "playing");
    let options = json!({"device":"qa-no-output","projectStartFrame":0,"recordStartFrame":0,"recordEndFrame":FRAMES,"cycle":false,"leadFrames":0,"countInFrames":0,"maxFrames":48000,"click":null,"inputs":[{"trackId":"qa-track","device":"qa-no-input","channels":[0],"cue":null,"monitorFx":false,"correction":{"frames":0,"basis":"unqualified"}}]});
    let error = d
        .fixture
        .json(
            "native_recording_start",
            json!({"snapshot":id,"options":options}),
        )
        .unwrap_err();
    assert_eq!(error, "Close existing native audio first");
    d.close(&session).unwrap();
    let lease = d
        .fixture
        .app
        .state::<NativePlayback>()
        .reserve_recording()
        .unwrap();
    let before = d.fixture.prepared.load(Ordering::Acquire);
    assert!(d.fixture.json("native_playback_start",json!({"snapshot":id,"device":"qa-no-output","startFrame":0,"endFrame":FRAMES,"cycle":false,"muted":true})).is_err());
    assert_eq!(before, d.fixture.prepared.load(Ordering::Acquire));
    drop(lease);
    d.fixture
        .json("native_snapshot_close", json!({"snapshot":id}))
        .unwrap();
    assert_eq!(d.fixture.counts(), json!({"entries":0,"bytes":0}));
}
#[test]
fn snapshot_cancel_and_close_reply_wait_for_the_real_consumer_and_worker() {
    let gate = Arc::new(Gate::default());
    let d = Dsp::new(Some(gate.clone()));
    let id = d.upload(false, json!([]));
    let session = d.start(&id, false, true);
    until(|| gate.entered.load(Ordering::Acquire));
    d.fixture
        .json("native_snapshot_close", json!({"snapshot":id}))
        .unwrap();
    let cancelled = d.fixture.counts();
    assert_eq!(cancelled["entries"], 0);
    // The render worker may already drop its snapshot while the consumer waits.
    assert!(cancelled["bytes"].as_u64().unwrap() <= (FRAMES * 16) as u64);
    let reply = pending(
        &d.fixture.main,
        "native_playback_close",
        InvokeBody::Json(json!({"session":session})),
    );
    thread::sleep(Duration::from_millis(30));
    assert!(matches!(reply.try_recv(), Err(mpsc::TryRecvError::Empty)));
    assert!(d
        .fixture
        .app
        .state::<NativePlayback>()
        .reserve_recording()
        .is_err());
    gate.release.store(true, Ordering::Release);
    assert_eq!(
        reply.recv_timeout(WAIT).unwrap().unwrap()["helpersClosed"],
        true
    );
    assert!(d.fixture.control().stop.finished.load(Ordering::Acquire));
    assert_eq!(d.fixture.counts(), json!({"entries":0,"bytes":0}));
}
#[test]
fn owner_and_app_retirement_join_real_workers_and_close_admission() {
    let d = Dsp::new(None);
    let id = d.upload(false, json!([]));
    let session = d.start(&id, false, true);
    until(|| d.status(&session)["phase"] == "playing");
    let first = d.fixture.control();
    native_audio_lifecycle::close_owner(
        "main",
        &d.fixture.app.state::<Snapshots>(),
        &d.fixture.app.state::<NativeRecording>(),
        &d.fixture.app.state::<NativePlayback>(),
    );
    assert!(first.stop.finished.load(Ordering::Acquire));
    assert!(null_bridge::helpers_closed(&first));
    assert_eq!(d.fixture.counts(), json!({"entries":0,"bytes":0}));
    assert!(d
        .fixture
        .json(
            "native_snapshot_begin",
            json!({"project":{"sampleRate":48000},"descriptors":[]})
        )
        .is_err());
    let other = d.upload(true, json!([]));
    let second = d.start(&other, true, true);
    until(|| {
        invoke(
            &d.fixture.other,
            "native_playback_status",
            InvokeBody::Json(json!({"session":second})),
        )
        .unwrap()["phase"]
            == "playing"
    });
    let control = d.fixture.control();
    native_audio_lifecycle::shutdown(
        &d.fixture.app.state::<Snapshots>(),
        &d.fixture.app.state::<NativeRecording>(),
        &d.fixture.app.state::<NativePlayback>(),
    );
    assert!(control.stop.finished.load(Ordering::Acquire));
    assert!(null_bridge::helpers_closed(&control));
    assert_eq!(d.fixture.counts(), json!({"entries":0,"bytes":0}));
    assert!(invoke(
        &d.fixture.other,
        "native_snapshot_begin",
        InvokeBody::Json(json!({"project":{"sampleRate":48000},"descriptors":[]}))
    )
    .is_err());
}
#[cfg(feature = "native-validation")]
#[test]
fn ring_fault_through_real_worker_requires_close_then_releases_registry() {
    let d = Dsp::new(None);
    let id = d.upload(false, json!([]));
    let session = d.start(&id, false, true);
    until(|| d.status(&session)["phase"] == "playing");
    d.fixture.control().validation_fault("underrun").unwrap();
    until(|| d.status(&session)["phase"] == "fault");
    assert!(d
        .fixture
        .app
        .state::<NativePlayback>()
        .reserve_recording()
        .is_err());
    assert!(d.close(&session).is_err());
    assert!(d.fixture.control().stop.finished.load(Ordering::Acquire));
    let lease = d
        .fixture
        .app
        .state::<NativePlayback>()
        .reserve_recording()
        .unwrap();
    drop(lease);
    d.fixture
        .json("native_snapshot_close", json!({"snapshot":id}))
        .unwrap();
    assert_eq!(d.fixture.counts(), json!({"entries":0,"bytes":0}));
}
#[test]
#[ignore = "Trusted system AU fixture; use guarded native command/DSP runner --system-au"]
fn actual_system_au_parameters_bypass_and_helper_cleanup_share_command_owner() {
    assert_eq!(
        std::env::var("CRISPAUDIO_COMMAND_DSP_SYSTEM_AU").as_deref(),
        Ok("1"),
        "Use guarded runner --system-au for actual helper fixtures"
    );
    let catalog = crispaudio_media::apple::plugin("plugin-scan", "{}").unwrap();
    let au = catalog
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["name"] == "AUPeakLimiter" && p["manufacturer"] == "Apple")
        .expect("Trusted Apple AUPeakLimiter unavailable");
    let effect = json!({"instanceId":"qa-au","pluginId":au["id"],"name":au["name"],"format":"AU","enabled":true,"bypass":false,"parameters":{"2":-6.020599913279624},"state":""});
    let d = Dsp::new(None);
    let id = d.upload(false, json!([effect]));
    let session = d.start(&id, false, true);
    until(|| d.tail([0.0625, -0.03125]));
    assert_eq!(null_bridge::helper_count(&d.fixture.control()), 1);
    let native = |bypass, gain| json!([{"scope":"master","instanceId":"qa-au","parameters":{"2":gain},"bypass":bypass}]);
    d.fixture
        .json(
            "native_playback_update",
            json!({"session":session,"controls":controls(0.5,native(false,-12.041199826559248))}),
        )
        .unwrap();
    until(|| d.tail([0.03125, -0.015625]));
    d.fixture
        .json(
            "native_playback_update",
            json!({"session":session,"controls":controls(0.5,native(true,-12.041199826559248))}),
        )
        .unwrap();
    until(|| d.tail([0.125, -0.0625]));
    d.fixture
        .json(
            "native_playback_update",
            json!({"session":session,"controls":controls(0.5,native(false,-12.041199826559248))}),
        )
        .unwrap();
    until(|| d.tail([0.03125, -0.015625]));
    assert_eq!(null_bridge::helper_count(&d.fixture.control()), 1);
    assert_eq!(d.close(&session).unwrap()["helpersClosed"], true);
    // Kill a second real helper through the production fault hook.
    let faulting = d.start(&id, false, true);
    until(|| {
        d.status(&faulting)["phase"] == "playing"
            && d.tail([0.0625, -0.03125])
            && null_bridge::helper_count(&d.fixture.control()) == 1
    });
    d.fixture.control().validation_fault("helper").unwrap();
    until(|| d.status(&faulting)["phase"] == "fault");
    assert!(d.close(&faulting).is_err());
    assert!(d.fixture.control().stop.finished.load(Ordering::Acquire));
    assert!(null_bridge::helpers_closed(&d.fixture.control()));

    d.fixture
        .json("native_snapshot_close", json!({"snapshot":id}))
        .unwrap();
    assert_eq!(d.fixture.counts(), json!({"entries":0,"bytes":0}));
}
