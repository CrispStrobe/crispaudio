//! No AudioQueue is constructed here. The standalone driver additionally traps
//! queue creation and device inventory. Null time is a synthetic sample clock,
//! not evidence for a physical device, WebKit, sleep or hotplug behavior.
use super::*;
use crispaudio_media::native_snapshot::{Descriptor, Snapshots};
use std::collections::VecDeque;

fn source_snapshot(
    pcm: Vec<Stereo>,
    effect: Value,
) -> Arc<crispaudio_media::native_snapshot::Snapshot> {
    let frames = pcm.len();
    let project = json!({"sampleRate":48000,"duration":frames as f64/48000.,"masterVolume":1,"masterEffects":[],"outputLimiter":{"enabled":false},"nativeEffects":[effect],"tracks":[{"id":"source-track","volume":1,"pan":0,"muted":false,"solo":false,"segments":[{"id":"source-clip","sourceId":"source","startTime":0,"sourceOffset":0,"duration":frames as f64/48000.,"gain":1,"effects":[],"fadeInDuration":0,"fadeOutDuration":0}]}]});
    let registry = Snapshots::default();
    let id = registry
        .begin(
            "null-source",
            project,
            vec![Descriptor {
                id: "source".into(),
                frames,
                channels: 2,
                sample_rate: 48000,
            }],
        )
        .unwrap();
    for (index, chunk) in pcm.chunks(8192).enumerate() {
        let header = serde_json::to_vec(
            &json!({"snapshot":id,"source":0,"offset":index*8192,"frames":chunk.len()}),
        )
        .unwrap();
        let mut packet = b"CPS1".to_vec();
        packet.extend((header.len() as u32).to_le_bytes());
        packet.extend(header);
        for channel in 0..2 {
            for frame in chunk {
                packet.extend(frame[channel].to_le_bytes());
            }
        }
        registry.write("null-source", &packet).unwrap();
    }
    registry.seal("null-source", &id).unwrap();
    let snapshot = registry.get("null-source", &id).unwrap();
    registry.close("null-source", &id).unwrap();
    snapshot
}
fn au(name: &str, parameters: Value) -> Value {
    let plugins = crispaudio_media::apple::plugin("plugin-scan", "{}").unwrap();
    let id = plugins
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["name"] == name)
        .expect("System AU fixture missing")["id"]
        .clone();
    json!({"instanceId":"source-effect","pluginId":id,"name":name,"format":"AU","enabled":true,"bypass":false,"parameters":parameters,"state":""})
}
fn controls(parameters: Value, bypass: bool, level: f64) -> Value {
    json!({"masterVolume":level,"tracks":[{"id":"source-track","volume":1,"pan":0,"muted":false,"solo":false}],"native":[{"scope":"master","instanceId":"source-effect","parameters":parameters,"bypass":bypass}]})
}
struct NullCapture {
    pcm: Vec<Stereo>,
    clocks: Vec<u64>,
}
fn drive(
    state: &Output,
    start: u32,
    end: u32,
    cycle: bool,
    limit: usize,
    mut tick: impl FnMut(usize, &Output) -> Result<(), String>,
) -> Result<NullCapture, String> {
    let mut queue = VecDeque::new();
    for _ in 0..2 {
        let mut block = [0.; SAMPLES];
        state.fill(&mut block);
        queue.push_back(block);
    }
    state.control.phase.store(1, Ordering::Release);
    let mut capture = NullCapture {
        pcm: Vec::new(),
        clocks: Vec::new(),
    };
    let epoch = Instant::now();
    while capture.pcm.len() < limit {
        if epoch.elapsed() > Duration::from_secs(10) {
            return Err("Null-output deadline exceeded".into());
        }
        let frame = capture.pcm.len();
        tick(frame, state)?;
        if state.control.stop.stop.load(Ordering::Acquire) {
            break;
        }
        if state.ring.fault.load(Ordering::Acquire) != 0 {
            return Err("Native ring fault in null-output driver".into());
        }
        let count = if cycle {
            FRAMES
        } else {
            FRAMES.min((end - start) as usize - frame)
        };
        let block = queue.pop_front().unwrap();
        capture
            .pcm
            .extend(block.chunks_exact(2).take(count).map(|s| [s[0], s[1]]));
        if publish_clock(
            &state.control,
            start,
            end,
            cycle,
            start,
            capture.pcm.len() as u64,
        ) {
            break;
        }
        capture
            .clocks
            .push(state.control.position.load(Ordering::Acquire));
        let mut next = [0.; SAMPLES];
        state.fill(&mut next);
        queue.push_back(next);
        // Match a 48 kHz, 512-frame callback cadence. Tests do not pretend that
        // this synthetic clock is an observed Core Audio hardware timestamp.
        thread::sleep(Duration::from_secs_f64(count as f64 / 48000.));
    }
    Ok(capture)
}
#[test]
#[ignore = "Actual native realtime helper DSP; use isolated null-output driver"]
fn source_null_finite_latency_and_partial_end_are_exact() {
    let frames = 16385;
    let mut pcm = vec![[0.; 2]; frames];
    pcm[0] = [0.5, -0.3];
    pcm[frames - 1] = [0.2, -0.1];
    let expected = pcm.clone();
    let snapshot = source_snapshot(pcm, au("AUPeakLimiter", json!({"0":0.004,"1":0.01,"2":-3})));
    let control = Arc::new(LiveControl::new());
    let mut capture = None;
    let result = run_with_output(
        snapshot,
        0,
        frames as u32,
        false,
        None,
        true,
        control.clone(),
        0,
        |state| {
            capture = Some(drive(
                state,
                0,
                frames as u32,
                false,
                frames,
                |_, _| Ok(()),
            )?);
            Ok(())
        },
    )
    .unwrap();
    let actual = capture.unwrap().pcm;
    assert_eq!(actual.len(), frames);
    let gain = 10f32.powf(-3. / 20.);
    let error = actual
        .iter()
        .zip(expected)
        .flat_map(|(a, b)| (0..2).map(move |ch| (a[ch] - b[ch] * gain).abs()))
        .fold(0f32, f32::max);
    assert!(
        error < 2e-6,
        "Latency-aligned source samples changed: {error}"
    );
    assert_eq!(result["status"]["phase"], "ended");
    assert_eq!(result["status"]["frame"], frames);
    assert_eq!(result["helpersClosed"], true);
    assert_eq!(result["queueBuffers"], 0);
    println!(
        "SOURCE_NULL_FINITE {}",
        json!({"frames":frames,"maxError":error,"helpersClosed":true,"hardware":false})
    );
}
#[test]
#[ignore = "Actual native realtime helper DSP; use isolated null-output driver"]
fn source_null_live_parameters_and_warm_bypass_keep_one_helper() {
    let frames = 48000;
    let parameters = json!({"0":0.004,"1":0.01,"2":-3});
    let snapshot = source_snapshot(
        vec![[0.25, -0.125]; frames],
        au("AUPeakLimiter", parameters.clone()),
    );
    let control = Arc::new(LiveControl::new());
    let mut capture = None;
    let result = run_with_output(
        snapshot,
        0,
        frames as u32,
        false,
        None,
        true,
        control.clone(),
        0,
        |state| {
            capture = Some(drive(
                state,
                0,
                frames as u32,
                false,
                frames,
                |frame, state| {
                    assert_eq!(state.control.stop.helper.lock().unwrap().len(), 1);
                    if frame == 8192 {
                        state.control.update(controls(
                            json!({"0":0.004,"1":0.01,"2":-12}),
                            false,
                            1.,
                        ))?;
                    }
                    if frame == 20480 {
                        state.control.update(controls(
                            json!({"0":0.004,"1":0.01,"2":-12}),
                            true,
                            1.,
                        ))?;
                    }
                    if frame == 32768 {
                        state.control.update(controls(
                            json!({"0":0.004,"1":0.01,"2":-12}),
                            false,
                            0.5,
                        ))?;
                    }
                    Ok(())
                },
            )?);
            Ok(())
        },
    )
    .unwrap();
    let pcm = capture.unwrap().pcm;
    for (from, to, gain) in [
        (4096, 8192, 10f32.powf(-3. / 20.)),
        (16384, 20480, 10f32.powf(-12. / 20.)),
        (28672, 32768, 1.),
        (40960, 45056, 0.5 * 10f32.powf(-12. / 20.)),
    ] {
        for sample in &pcm[from..to] {
            assert!((sample[0] - 0.25 * gain).abs() < 2e-5);
            assert!((sample[1] + 0.125 * gain).abs() < 2e-5);
        }
    }
    assert_eq!(result["helpersClosed"], true);
    assert_eq!(result["status"]["appliedRevision"], 3);
    assert_eq!(result["status"]["fault"], 0);
    println!(
        "SOURCE_NULL_CONTROLS {}",
        json!({"frames":frames,"updates":3,"helperInstances":1,"helpersClosed":true,"hardware":false})
    );
}
#[test]
#[ignore = "Actual native realtime helper DSP; use isolated null-output driver"]
fn source_null_cancellation_and_helper_failure_join_owned_worker() {
    for fail in [false, true] {
        let snapshot = source_snapshot(
            vec![[0.1, -0.1]; 48000],
            au("AUBandpass", json!({"0":800,"1":1200})),
        );
        let control = Arc::new(LiveControl::new());
        let result = run_with_output(
            snapshot,
            0,
            48000,
            true,
            None,
            true,
            control.clone(),
            0,
            |state| {
                drive(state, 0, 48000, true, 48000, |frame, state| {
                    if frame == 4096 {
                        if fail {
                            for helper in state.control.stop.helper.lock().unwrap().iter() {
                                helper.stop();
                            }
                            thread::sleep(Duration::from_millis(25));
                        } else {
                            state.control.stop.cancel();
                        }
                    }
                    Ok(())
                })?;
                Ok(())
            },
        );
        if fail {
            assert!(result.is_err());
            assert_eq!(control.status()["phase"], "fault");
        } else {
            assert_eq!(result.unwrap()["status"]["phase"], "stopped");
        }
        assert!(control.stop.finished.load(Ordering::Acquire));
        assert!(control
            .stop
            .helper
            .lock()
            .unwrap()
            .iter()
            .all(|h| !h.is_alive()));
    }
    println!(
        "SOURCE_NULL_CLOSE {}",
        json!({"cancel":"joined","helperFault":"joined","hardware":false})
    );
}

#[test]
#[ignore = "Actual native realtime helper DSP; explicit VST3 fixture folder required"]
fn source_null_cycle_retains_delay_history_and_wraps_only_the_project_clock() {
    let folder = std::env::var("CRISPAUDIO_TEST_PLUGIN_FOLDER")
        .expect("Set CRISPAUDIO_TEST_PLUGIN_FOLDER to the trusted VST3 fixture folder");
    let plugins =
        crispaudio_media::apple::plugin("plugin-scan", &json!({"folders":[folder]}).to_string())
            .unwrap();
    let id = plugins
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["name"] == "ADelay")
        .expect("ADelay fixture missing")["id"]
        .clone();
    let effect = json!({"instanceId":"source-effect","pluginId":id,"name":"ADelay","format":"VST3","enabled":true,"bypass":false,"parameters":{"100":0.002,"101":0},"state":""});
    let frames = 4096;
    let mut pcm = vec![[0.; 2]; frames];
    pcm[frames - 10] = [0.5, -0.25];
    let snapshot = source_snapshot(pcm, effect);
    let control = Arc::new(LiveControl::new());
    let mut capture = None;
    let result = run_with_output(
        snapshot,
        0,
        frames as u32,
        true,
        None,
        true,
        control.clone(),
        0,
        |state| {
            capture = Some(drive(
                state,
                0,
                frames as u32,
                true,
                6 * frames,
                |_, state| {
                    assert_eq!(state.control.stop.helper.lock().unwrap().len(), 1);
                    Ok(())
                },
            )?);
            Ok(())
        },
    )
    .unwrap();
    let captured = capture.unwrap();
    let positions = captured
        .pcm
        .iter()
        .enumerate()
        .filter(|(_, s)| s[0].abs() > 1e-6 || s[1].abs() > 1e-6)
        .map(|(i, s)| {
            assert_eq!(*s, [0.5, -0.25]);
            i
        })
        .collect::<Vec<_>>();
    let expected = (frames - 10 + 96..6 * frames)
        .step_by(frames)
        .collect::<Vec<_>>();
    assert_eq!(positions, expected);
    for (i, clock) in captured.clocks.iter().enumerate() {
        assert_eq!(*clock, ((i + 1) * FRAMES % frames) as u64);
    }
    assert_eq!(result["helpersClosed"], true);
    assert_eq!(result["status"]["fault"], 0);
    println!(
        "SOURCE_NULL_CYCLE {}",
        json!({"cycles":6,"effectDelayFrames":96,"outputImpulses":positions.len(),"historyRetained":true,"helperInstances":1,"hardware":false})
    );
}

#[test]
#[ignore = "Actual native realtime helper DSP; use isolated null-output driver"]
fn source_null_pause_holds_worker_and_accepts_controls_before_resume() {
    let frames = 24000;
    let snapshot = source_snapshot(
        vec![[0.25, -0.125]; frames],
        au("AUPeakLimiter", json!({"0":0.004,"1":0.01,"2":-3})),
    );
    let control = Arc::new(LiveControl::new());
    let mut capture = None;
    let result = run_with_output(
        snapshot,
        0,
        frames as u32,
        false,
        None,
        true,
        control.clone(),
        0,
        |state| {
            capture = Some(drive(
                state,
                0,
                frames as u32,
                false,
                frames,
                |frame, state| {
                    if frame == 4096 {
                        state.control.pause(true);
                        state.control.phase.store(2, Ordering::Release);
                        let clock = state.control.position.load(Ordering::Acquire);
                        thread::sleep(Duration::from_millis(25));
                        let rendered = state.control.rendered.load(Ordering::Acquire);
                        let revision = state.control.update(controls(
                            json!({"0":0.004,"1":0.01,"2":-12}),
                            false,
                            1.,
                        ))?;
                        for _ in 0..100 {
                            if state.control.applied.load(Ordering::Acquire) == revision {
                                break;
                            }
                            thread::sleep(Duration::from_millis(1));
                        }
                        assert_eq!(state.control.applied.load(Ordering::Acquire), revision);
                        thread::sleep(Duration::from_millis(25));
                        assert_eq!(state.control.position.load(Ordering::Acquire), clock);
                        assert_eq!(state.control.rendered.load(Ordering::Acquire), rendered);
                        state.control.pause(false);
                        state.control.phase.store(1, Ordering::Release);
                    }
                    Ok(())
                },
            )?);
            Ok(())
        },
    )
    .unwrap();
    for sample in &capture.unwrap().pcm[16384..20480] {
        assert!((sample[0] - 0.25 * 10f32.powf(-12. / 20.)).abs() < 2e-5);
    }
    assert_eq!(result["helpersClosed"], true);
    assert_eq!(result["status"]["fault"], 0);
    println!(
        "SOURCE_NULL_PAUSE {}",
        json!({"clockHeld":true,"workerHeld":true,"pausedControlApplied":true,"hardware":false})
    );
}

#[test]
#[ignore = "Actual native realtime helper DSP; use isolated null-output driver"]
fn source_null_latency_change_faults_and_latches_silence() {
    let snapshot = source_snapshot(
        vec![[0.25, -0.125]; 48000],
        au("AUPeakLimiter", json!({"0":0.004,"1":0.01,"2":-3})),
    );
    let control = Arc::new(LiveControl::new());
    let result = run_with_output(
        snapshot,
        0,
        48000,
        true,
        None,
        true,
        control.clone(),
        0,
        |state| {
            let driven = drive(state, 0, 48000, true, 48000, |frame, state| {
                if frame == 4096 {
                    state.control.update(controls(
                        json!({"0":0.008,"1":0.01,"2":-3}),
                        false,
                        1.,
                    ))?;
                }
                Ok(())
            });
            assert!(state.ring.fault.load(Ordering::Acquire) != 0);
            let mut block = [9.; SAMPLES];
            state.fill(&mut block);
            assert!(block.iter().all(|v| *v == 0.));
            driven.map(|_| ())
        },
    );
    assert!(result.unwrap_err().contains("latency changed"));
    assert_eq!(control.status()["phase"], "fault");
    assert!(control
        .stop
        .helper
        .lock()
        .unwrap()
        .iter()
        .all(|h| !h.is_alive()));
    println!(
        "SOURCE_NULL_LATENCY_FAULT {}",
        json!({"changedLatencyRejected":true,"faultOutputSilent":true,"helpersClosed":true,"hardware":false})
    );
}

#[test]
#[ignore = "Source fixture needs the actual AU catalog; use isolated null-output driver"]
fn source_null_pre_cancelled_owner_never_opens_an_insert_or_output() {
    let snapshot = source_snapshot(
        vec![[0.; 2]; 4096],
        au("AUBandpass", json!({"0":800,"1":1200})),
    );
    let control = Arc::new(LiveControl::new());
    control.stop.cancel();
    let result = run_with_output(
        snapshot,
        0,
        4096,
        false,
        None,
        true,
        control.clone(),
        0,
        |_| panic!("Cancelled preparation opened output"),
    )
    .unwrap();
    assert!(control.stop.helper.lock().unwrap().is_empty());
    assert_eq!(result["status"]["phase"], "stopped");
    assert!(control.stop.finished.load(Ordering::Acquire));
    println!(
        "SOURCE_NULL_PRE_CANCEL {}",
        json!({"insertOpened":false,"outputOpened":false,"hardware":false})
    );
}

#[test]
fn source_output_rejects_bad_shape_and_reentrant_consumption_without_pcm() {
    for reentrant in [false, true] {
        let (mut producer, consumer) = ring();
        assert!(producer.push(&[0.5; SAMPLES]));
        let state = Output {
            data: UnsafeCell::new(LiveData {
                consumer,
                queued: 0,
                captured: [Captured::default(); 256],
                captured_count: 0,
            }),
            entered: AtomicBool::new(reentrant),
            control: Arc::new(LiveControl::new()),
            ring: producer.ring.clone(),
            end: None,
        };
        let mut output = vec![9.; if reentrant { SAMPLES } else { 8 }];
        state.fill(&mut output);
        assert!(output.iter().all(|v| *v == 0.));
        assert_eq!(
            state.ring.fault.load(Ordering::Acquire),
            if reentrant { 3 } else { 2 }
        );
        assert_eq!(state.data.into_inner().queued, 0);
    }
}

#[test]
fn source_output_clock_preserves_finite_end_and_nonzero_cycle_start() {
    let control = LiveControl::new();
    control.phase.store(1, Ordering::Release);
    for (elapsed, position, ended) in [
        (0, 12000, false),
        (35999, 47999, false),
        (36000, 48000, true),
        (42000, 48000, true),
    ] {
        assert_eq!(
            publish_clock(&control, 12000, 48000, false, 6000, elapsed),
            ended
        );
        assert_eq!(control.position.load(Ordering::Acquire), position);
    }
    assert_eq!(control.status()["phase"], "ended");
    control.phase.store(1, Ordering::Release);
    for (elapsed, position) in [
        (0, 12000),
        (35999, 47999),
        (36000, 6000),
        (42000, 12000),
        (84000, 12000),
    ] {
        assert!(!publish_clock(&control, 12000, 48000, true, 6000, elapsed));
        assert_eq!(control.position.load(Ordering::Acquire), position);
    }
    assert_eq!(control.status()["phase"], "playing");
    assert!(control.position_time.load(Ordering::Acquire) > 0);
}
