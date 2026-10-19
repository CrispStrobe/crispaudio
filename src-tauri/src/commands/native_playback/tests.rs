//! Real admission/owner registry; synthetic workers never enumerate/open devices.
use super::*;
use crate::commands::{native_audio_lifecycle, native_recording::NativeRecording};
use std::{
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

const WAIT: Duration = Duration::from_secs(5);
fn range() -> PlaybackRange {
    PlaybackRange {
        start: 0,
        end: 48000,
        cycle: false,
        loop_start: None,
    }
}
fn snapshot(snapshots: &Snapshots, owner: &str) -> String {
    let id = snapshots
        .begin(
            owner,
            json!({"sampleRate":48000,"duration":1}),
            vec![crispaudio_media::native_snapshot::Descriptor {
                id: "source".into(),
                frames: 2048,
                channels: 2,
                sample_rate: 48000,
            }],
        )
        .unwrap();
    let header =
        serde_json::to_vec(&json!({"snapshot":id,"source":0,"offset":0,"frames":2048})).unwrap();
    let mut packet = b"CPS1".to_vec();
    packet.extend((header.len() as u32).to_le_bytes());
    packet.extend(header);
    packet.resize(packet.len() + 2048 * 2 * 4, 0);
    snapshots.write(owner, &packet).unwrap();
    snapshots.seal(owner, &id).unwrap();
    id
}
fn wait_until(mut ready: impl FnMut() -> bool) {
    let deadline = Instant::now() + WAIT;
    while !ready() {
        assert!(Instant::now() < deadline, "bounded fixture wait expired");
        thread::sleep(Duration::from_millis(1));
    }
}
fn start(state: &NativePlayback, snapshots: &Snapshots, owner: &str, id: &str) -> String {
    state
        .start_with(owner, snapshots, id.into(), range(), |snapshot, control| {
            Ok(move || {
                wait_until(|| control.stop.is_cancelled());
                drop(snapshot);
                Ok(json!({"joined":true}))
            })
        })
        .unwrap()
}

#[test]
fn admission_checks_owner_upload_and_range_before_preparation() {
    let snapshots = Snapshots::default();
    let state = NativePlayback::default();
    let id = snapshot(&snapshots, "main");
    let attempted = AtomicBool::new(false);
    let rejected = |owner: &str, id: &str, range| {
        assert!(state
            .start_with(owner, &snapshots, id.into(), range, |_, _| {
                attempted.store(true, Ordering::Release);
                Ok(|| Ok(Value::Null))
            })
            .is_err());
    };
    rejected("other", &id, range());
    rejected("main", "missing", range());
    let pending = snapshots
        .begin("main", json!({"sampleRate":48000,"duration":1}), vec![])
        .unwrap();
    rejected("main", &pending, range());
    for bad in [
        PlaybackRange { end: 0, ..range() },
        PlaybackRange {
            end: 48001,
            ..range()
        },
        PlaybackRange {
            loop_start: Some(1),
            ..range()
        },
        PlaybackRange {
            end: 2047,
            cycle: true,
            ..range()
        },
    ] {
        rejected("main", &id, bad);
    }
    assert!(!attempted.load(Ordering::Acquire));
    assert!(state.active.lock().unwrap().is_none());
    assert!(state.reserve_recording().is_ok());
}

#[test]
fn prepare_failure_does_not_publish_or_reserve_output() {
    let snapshots = Snapshots::default();
    let state = NativePlayback::default();
    let id = snapshot(&snapshots, "main");
    let result = state.start_with("main", &snapshots, id, range(), |_, _| {
        Err::<fn() -> Result<Value, String>, _>("fixture preparation failed".into())
    });
    assert_eq!(result.unwrap_err(), "fixture preparation failed");
    assert!(state.active.lock().unwrap().is_none());
    assert!(state.reserve_recording().is_ok());
}

#[test]
fn recording_and_playback_exclude_each_other_until_join() {
    let snapshots = Snapshots::default();
    let state = NativePlayback::default();
    let id = snapshot(&snapshots, "main");
    let lease = state.reserve_recording().unwrap();
    assert!(state
        .start_with("main", &snapshots, id.clone(), range(), |_, _| {
            panic!("Recording must reject playback before preparation");
            #[allow(unreachable_code)]
            Ok(|| Ok(Value::Null))
        })
        .is_err());
    drop(lease);
    let session = start(&state, &snapshots, "main", &id);
    assert!(state.reserve_recording().is_err());
    assert!(state
        .start_with("main", &snapshots, id, range(), |_, _| {
            Ok(|| Ok(Value::Null))
        })
        .is_err());
    state.close_owner("main");
    assert!(state.get("main", &session).is_err());
    assert!(state.reserve_recording().is_ok());
}

#[test]
fn unrelated_owner_cannot_query_cancel_or_close_a_session() {
    let snapshots = Snapshots::default();
    let state = NativePlayback::default();
    let id = snapshot(&snapshots, "main");
    let session = start(&state, &snapshots, "main", &id);
    let active = state.get("main", &session).unwrap();
    assert!(state.get("other", &session).is_err());
    assert!(state.status("other", &session).is_err());
    state.cancel_owner("other");
    state.cancel_snapshot("other", &id);
    state.cancel_snapshot("main", "different");
    state.close_owner("other");
    assert!(!active.control.stop.is_cancelled());
    state.cancel_snapshot("main", &id);
    wait_until(|| active.control.stop.finished.load(Ordering::Acquire));
    // Cancellation/finished status is not a release of the native reservation.
    assert!(state.reserve_recording().is_err());
    state.close_owner("main");
    assert!(state.reserve_recording().is_ok());
}

#[test]
fn worker_failure_or_panic_stays_owned_until_explicit_close() {
    for panics in [false, true] {
        let snapshots = Snapshots::default();
        let state = NativePlayback::default();
        let id = snapshot(&snapshots, "main");
        let session = state
            .start_with("main", &snapshots, id, range(), move |_, _| {
                Ok(move || {
                    if panics {
                        panic!("synthetic worker panic");
                    }
                    Err("synthetic helper fault".into())
                })
            })
            .unwrap();
        let active = state.get("main", &session).unwrap();
        wait_until(|| active.control.stop.finished.load(Ordering::Acquire));
        let status = state.status("main", &session).unwrap();
        assert_eq!(status["phase"], "fault");
        assert_eq!(
            status["error"],
            if panics {
                "Native playback thread panicked"
            } else {
                "synthetic helper fault"
            }
        );
        assert!(state.reserve_recording().is_err());
        state.close_owner("main");
        assert!(state.reserve_recording().is_ok());
    }
}

#[test]
fn duplicate_join_waits_for_the_worker_and_keeps_recording_excluded() {
    let snapshots = Snapshots::default();
    let state = NativePlayback::default();
    let id = snapshot(&snapshots, "main");
    let (release, gate) = mpsc::channel();
    let session = state
        .start_with("main", &snapshots, id, range(), |_, control| {
            Ok(move || {
                wait_until(|| control.stop.is_cancelled());
                gate.recv_timeout(WAIT).unwrap();
                Ok(Value::Null)
            })
        })
        .unwrap();
    let active = state.get("main", &session).unwrap();
    let (done, completed) = mpsc::channel();
    let tasks = (0..2)
        .map(|_| {
            let (active, done) = (active.clone(), done.clone());
            thread::spawn(move || {
                active.join().unwrap();
                done.send(()).unwrap();
            })
        })
        .collect::<Vec<_>>();
    wait_until(|| active.control.stop.is_cancelled());
    assert!(completed.recv_timeout(Duration::from_millis(30)).is_err());
    assert!(state.reserve_recording().is_err());
    release.send(()).unwrap();
    for task in tasks {
        task.join().unwrap();
    }
    assert_eq!(completed.try_iter().count(), 2);
    // Joining alone does not release the registry; its close owner does.
    assert!(state.reserve_recording().is_err());
    state.close_owner("main");
    assert!(state.reserve_recording().is_ok());
}

#[test]
fn window_and_app_teardown_revoke_uploads_before_blocked_owner_join() {
    for shutdown in [false, true] {
        let snapshots = Snapshots::default();
        let state = Arc::new(NativePlayback::default());
        let recording = Arc::new(NativeRecording::default());
        let id = snapshot(&snapshots, "main");
        let (release, gate) = mpsc::channel();
        let session = state
            .start_with(
                "main",
                &snapshots,
                id.clone(),
                range(),
                |snapshot, control| {
                    Ok(move || {
                        wait_until(|| control.stop.is_cancelled());
                        gate.recv_timeout(WAIT).unwrap();
                        drop(snapshot);
                        Ok(json!({"joined":true}))
                    })
                },
            )
            .unwrap();
        let active = state.get("main", &session).unwrap();
        let (closing_snapshots, closing_state, closing_recording) =
            (snapshots.clone(), state.clone(), recording.clone());
        let closing = thread::spawn(move || {
            if shutdown {
                native_audio_lifecycle::shutdown(
                    &closing_snapshots,
                    &closing_recording,
                    &closing_state,
                );
            } else {
                native_audio_lifecycle::close_owner(
                    "main",
                    &closing_snapshots,
                    &closing_recording,
                    &closing_state,
                );
            }
        });
        wait_until(|| active.control.stop.is_cancelled());
        // This fails with the previous window/exit cleanup order.
        assert!(snapshots
            .begin("main", json!({"sampleRate":48000}), vec![])
            .is_err());
        assert!(snapshots.get("main", &id).is_err());
        // Revoked metadata does not free PCM still owned by a running worker.
        assert_eq!(snapshots.counts(), (0, 2048 * 16));
        if shutdown {
            assert!(snapshots
                .begin("other", json!({"sampleRate":48000}), vec![])
                .is_err());
        }
        release.send(()).unwrap();
        closing.join().unwrap();
        assert!(state.get("main", &session).is_err());
        assert!(state
            .start_with("main", &snapshots, id, range(), |_, _| {
                panic!("Revoked owner must not reach device/worker preparation");
                #[allow(unreachable_code)]
                Ok(|| Ok(Value::Null))
            })
            .is_err());
        assert_eq!(snapshots.counts(), (0, 0));
        if !shutdown {
            let other = snapshot(&snapshots, "other");
            start(&state, &snapshots, "other", &other);
            native_audio_lifecycle::close_owner("other", &snapshots, &recording, &state);
        }
    }
}

#[test]
fn teardown_joins_a_command_already_admitted_before_snapshot_revocation() {
    let snapshots = Snapshots::default();
    let state = Arc::new(NativePlayback::default());
    let recording = NativeRecording::default();
    let id = snapshot(&snapshots, "main");
    let (entered, ready) = mpsc::channel();
    let (release, gate) = mpsc::channel();
    let (starting_state, starting_snapshots) = (state.clone(), snapshots.clone());
    let starting = thread::spawn(move || {
        starting_state
            .start_with(
                "main",
                &starting_snapshots,
                id,
                range(),
                |snapshot, control| {
                    entered.send(()).unwrap();
                    gate.recv_timeout(WAIT).unwrap();
                    Ok(move || {
                        wait_until(|| control.stop.is_cancelled());
                        drop(snapshot);
                        Ok(Value::Null)
                    })
                },
            )
            .unwrap()
    });
    ready.recv_timeout(WAIT).unwrap();
    let (closing_state, closing_snapshots) = (state.clone(), snapshots.clone());
    let closing = thread::spawn(move || {
        native_audio_lifecycle::close_owner("main", &closing_snapshots, &recording, &closing_state)
    });
    wait_until(|| snapshots.counts().0 == 0);
    assert!(snapshots
        .begin("main", json!({"sampleRate":48000}), vec![])
        .is_err());
    assert_eq!(snapshots.counts().1, 2048 * 16);
    release.send(()).unwrap();
    let session = starting.join().unwrap();
    closing.join().unwrap();
    assert!(state.get("main", &session).is_err());
    assert!(state.reserve_recording().is_ok());
    assert_eq!(snapshots.counts(), (0, 0));
}
