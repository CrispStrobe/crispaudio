use super::*;
fn project() -> Value {
    json!({"id":"project","tracks":[{"id":"track","recordArmed":true,"kind":"audio"}]})
}
fn options() -> Options {
    Options {
        monitor_mix: MonitorLevels::default(),
        device: "output-uid".into(),
        project_start_frame: 100,
        record_start_frame: 200,
        record_end_frame: Some(48000),
        cycle: false,
        lead_frames: 137,
        count_in_frames: 0,
        max_frames: 480000,
        click: None,
        inputs: vec![Input {
            track_id: "track".into(),
            device: "input-uid".into(),
            channels: vec![0],
            cue: None,
            monitor_fx: false,
            correction: Correction {
                frames: 0,
                basis: Basis::Unqualified,
            },
        }],
    }
}
#[test]
fn preflight_rejects_partial_groups_bad_routes_and_legacy_compensation() {
    validate(&options(), &project()).unwrap();
    let mut cases = Vec::new();
    for levels in [
        MonitorLevels {
            backing: f32::NAN,
            output: 1.,
        },
        MonitorLevels {
            backing: 1.,
            output: 1.01,
        },
        MonitorLevels {
            backing: -0.1,
            output: 0.,
        },
    ] {
        let mut o = options();
        o.monitor_mix = levels;
        cases.push(o);
    }
    let mut o = options();
    o.inputs.clear();
    cases.push(o);
    let mut o = options();
    o.inputs.push(o.inputs[0].clone());
    cases.push(o);
    let mut o = options();
    o.inputs[0].channels = vec![0, 0];
    cases.push(o);
    let mut o = options();
    o.inputs[0].channels = vec![32];
    cases.push(o);
    let mut o = options();
    o.inputs[0].correction.frames = 1;
    cases.push(o);
    let mut o = options();
    o.inputs[0].device = "\0uid".into();
    cases.push(o);
    let mut o = options();
    o.inputs[0].track_id = "missing".into();
    cases.push(o);
    let mut o = options();
    o.max_frames = 32_000_001;
    cases.push(o);
    let mut o = options();
    o.max_frames = 9599;
    cases.push(o);
    let mut o = options();
    o.record_start_frame = 99;
    cases.push(o);
    let mut o = options();
    o.record_end_frame = Some(200);
    cases.push(o);
    let mut o = options();
    o.cycle = true;
    o.record_end_frame = None;
    cases.push(o);
    let mut o = options();
    o.count_in_frames = 1;
    cases.push(o);
    let mut o = options();
    o.inputs[0].monitor_fx = true;
    cases.push(o);
    let mut o = options();
    o.inputs[0].cue = Some(CueControls {
        gain: f32::NAN,
        pan: 0.,
        mono: false,
    });
    cases.push(o);
    for o in cases {
        assert!(validate(&o, &project()).is_err());
    }
    for (key, value) in [
        ("locked", json!(true)),
        ("recordArmed", json!(false)),
        ("kind", json!("bus")),
    ] {
        let mut p = project();
        p["tracks"][0][key] = value;
        assert!(validate(&options(), &p).is_err());
    }
}
#[test]
fn cancellation_is_monotonic_and_sparse_cue_updates_are_bounded_by_track() {
    let control = Control::new();
    control.check().unwrap();
    control.request(false);
    assert!(control.check().is_err());
    control.request(true);
    control.request(false);
    assert_eq!(control.action.load(Ordering::Acquire), CANCEL);
    let o = options();
    let state = NativeRecording::default();
    let active = Arc::new(Session {
        owner: "main".into(),
        id: "run".into(),
        snapshot: "snapshot".into(),
        cues: HashSet::from(["track".into()]),
        control: Arc::new(Control::new()),
        worker: Mutex::new(None),
    });
    *state.active.lock().unwrap() = Some(active.clone());
    assert!(state.get("other", "run").is_err());
    assert!(state.get("main", "stale").is_err());
    state.cancel_snapshot("other", "snapshot");
    assert!(!active.control.cancelled());
    state.cancel_snapshot("main", "other");
    assert!(!active.control.cancelled());
    state.close_owner("other");
    assert!(state.get("main", "run").is_ok());
    for gain in [0., 0.5, 1., 2., 4.] {
        active.control.updates.lock().unwrap().insert(
            o.inputs[0].track_id.clone(),
            CueControls {
                gain,
                pan: 0.,
                mono: false,
            },
        );
    }
    assert_eq!(active.control.updates.lock().unwrap().len(), 1);
    state.cancel_snapshot("main", "snapshot");
    assert!(active.control.cancelled());
    state.close_owner("main");
    assert!(state.get("main", "run").is_err());
}
#[test]
fn retained_original_directory_survives_worker_failure() {
    let control = Control::new();
    retained(
        &control,
        std::path::Path::new("recordings/native-group-generated"),
    );
    assert_eq!(
        control.status.lock().unwrap()["directory"],
        "recordings/native-group-generated"
    );
    let failed = outcome(GroupOutcome::Incomplete {
        directory: PathBuf::from("recordings/native-group-generated"),
        reason: "clock drift".into(),
        inputs: Vec::new(),
    });
    assert_eq!(failed["phase"], "fault");
    assert_eq!(failed["error"], "clock drift");
    assert_eq!(
        failed["directory"],
        control.status.lock().unwrap()["directory"]
    );
}
#[test]
fn cue_rack_is_static_bounded_and_uses_the_frozen_track() {
    let mut p = project();
    p["tracks"][0]["nativeEffects"] = json!([{"enabled":true,"pluginId":"fixture","state":"state","parameters":{"gain":0.5},"bypass":true}]);
    assert!(cue_plugins(&p, "track", false).unwrap().is_empty());
    let rack = cue_plugins(&p, "track", true).unwrap();
    assert_eq!(rack.len(), 1);
    assert_eq!(rack[0].state, "state");
    assert!(rack[0].bypass);
    p["tracks"][0]["nativeEffects"][0]["parameterAutomation"] =
        json!({"gain":[{"time":0.,"value":1.}]});
    assert!(cue_plugins(&p, "track", true).is_err());
    p["tracks"][0]["nativeEffects"][0]["parameterAutomation"] = json!({"gain":[]});
    assert!(cue_plugins(&p, "track", true).is_ok());
    let entry = p["tracks"][0]["nativeEffects"][0].clone();
    p["tracks"][0]["nativeEffects"] = json!([entry.clone(), entry.clone(), entry]);
    assert!(cue_plugins(&p, "track", true).is_err());
}
#[test]
fn native_output_reservation_prevents_second_owner_until_cleanup() {
    let playback = NativePlayback::default();
    let first = playback.reserve_recording().unwrap();
    assert!(playback.reserve_recording().is_err());
    drop(first);
    let second = playback.reserve_recording().unwrap();
    drop(second);
    let playback = Arc::new(playback);
    let barrier = Arc::new(std::sync::Barrier::new(9));
    let release = Arc::new(std::sync::Barrier::new(9));
    let tasks = (0..8)
        .map(|_| {
            let (playback, barrier, release) = (playback.clone(), barrier.clone(), release.clone());
            thread::spawn(move || {
                barrier.wait();
                let lease = playback.reserve_recording();
                release.wait();
                lease.is_ok()
            })
        })
        .collect::<Vec<_>>();
    barrier.wait();
    release.wait();
    assert_eq!(
        tasks
            .into_iter()
            .map(|task| task.join().unwrap())
            .filter(|won| *won)
            .count(),
        1
    );
}

#[test]
fn owner_shutdown_joins_before_releasing_audio_reservation() {
    let state = NativeRecording::default();
    let playback = NativePlayback::default();
    let lease = playback.reserve_recording().unwrap();
    let control = Arc::new(Control::new());
    let worker_control = control.clone();
    let worker = thread::spawn(move || {
        while !worker_control.cancelled() {
            thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(worker_control.action.load(Ordering::Acquire), CANCEL);
        *worker_control.status.lock().unwrap() =
            json!({"phase":"fault","error":"cancelled","joined":true});
        drop(lease);
        json!({"phase":"fault"})
    });
    *state.active.lock().unwrap() = Some(Arc::new(Session {
        owner: "main".into(),
        id: "run".into(),
        snapshot: "snapshot".into(),
        cues: HashSet::new(),
        control: control.clone(),
        worker: Mutex::new(Some(worker)),
    }));
    assert!(playback.reserve_recording().is_err());
    state.close_owner("other");
    assert!(!control.cancelled());
    state.shutdown();
    assert_eq!(control.status.lock().unwrap()["joined"], true);
    assert!(state.active.lock().unwrap().is_none());
    assert!(playback.reserve_recording().is_ok());
    state.shutdown();
}

#[test]
fn run_identity_does_not_repeat_when_process_counter_restarts() {
    let tokens = (0..64)
        .map(|_| run_token(0).unwrap())
        .collect::<HashSet<_>>();
    assert_eq!(tokens.len(), 64);
    for token in tokens {
        assert!(token.len() <= 64);
        assert!(token
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_'));
    }
}

#[test]
fn recovery_reservation_excludes_recording_and_other_recovery_until_worker_exits() {
    let state = NativeRecording::default();
    let lease = state.reserve_recovery().unwrap();
    assert!(state.recovering.load(Ordering::Acquire));
    assert!(state.reserve_recovery().is_err());
    drop(lease);
    assert!(!state.recovering.load(Ordering::Acquire));
    *state.active.lock().unwrap() = Some(Arc::new(Session {
        owner: "main".into(),
        id: "run".into(),
        snapshot: "snapshot".into(),
        cues: HashSet::new(),
        control: Arc::new(Control::new()),
        worker: Mutex::new(None),
    }));
    assert!(state.reserve_recovery().is_err());
    state.shutdown();
    assert!(state.reserve_recovery().is_ok());
}
