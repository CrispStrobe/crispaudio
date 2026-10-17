use super::*;
use crate::native_graph::Stereo;
use std::{sync::Barrier, time::Instant};

fn until(mut condition: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(5);
    while !condition() {
        assert!(Instant::now() < deadline, "Worker deadline exceeded");
        thread::sleep(Duration::from_millis(1));
    }
}
struct Gain {
    drops: Arc<AtomicUsize>,
    fail: bool,
    control: Option<Arc<Control>>,
    entered: Arc<AtomicBool>,
}
impl Processor for Gain {
    fn process(&mut self, _: u64, pcm: &mut [Stereo]) -> Result<()> {
        self.entered.store(true, Ordering::Release);
        if let Some(control) = &self.control {
            until(|| control.cancelled.load(Ordering::Acquire));
        }
        if self.fail {
            return Err("Test cue processor failed".into());
        }
        for sample in pcm {
            sample[0] *= 0.5;
            sample[1] *= 0.5;
        }
        Ok(())
    }
}
impl Drop for Gain {
    fn drop(&mut self) {
        self.drops.fetch_add(1, Ordering::AcqRel);
    }
}

#[test]
fn shared_group_budget_cannot_be_oversubscribed_concurrently_and_is_reusable() {
    let budget = StreamBudget::default();
    let gate = Arc::new(Barrier::new(9));
    let admitted = Arc::new(AtomicUsize::new(0));
    let mut workers = Vec::new();
    for _ in 0..8 {
        let (budget, gate, admitted) = (budget.clone(), gate.clone(), admitted.clone());
        workers.push(thread::spawn(move || {
            gate.wait();
            let reservation = budget.reserve(2);
            if reservation.is_ok() {
                admitted.fetch_add(1, Ordering::AcqRel);
            }
            gate.wait();
            gate.wait();
            drop(reservation);
        }));
    }
    gate.wait();
    gate.wait();
    assert_eq!(admitted.load(Ordering::Acquire), 4);
    assert_eq!(budget.used(), 8);
    assert!(budget.reserve(1).is_err());
    gate.wait();
    for worker in workers {
        worker.join().unwrap();
    }
    assert_eq!(budget.used(), 0);
    assert!(budget.reserve(3).is_err());
    let _again = budget.reserve(2).unwrap();
    assert_eq!(budget.used(), 2);
}

#[test]
fn worker_processes_native_packets_and_closes_with_no_leaked_reservation() {
    let budget = StreamBudget::default();
    let drops = Arc::new(AtomicUsize::new(0));
    let d = drops.clone();
    let (mut writer, mut dry, input) = crate::native_input::input();
    let (owner, mut output) = Owner::spawn(
        input,
        budget.reserve(2).unwrap(),
        Duration::from_secs(1),
        move |_| {
            Ok((
                Gain {
                    drops: d,
                    fail: false,
                    control: None,
                    entered: Arc::new(AtomicBool::new(false)),
                },
                17,
            ))
        },
    )
    .unwrap();
    assert_eq!(owner.latency_samples(), 17);
    assert_eq!(budget.used(), 2);
    assert!(writer.push(100, 200, &[[0.5, -0.25]; 128]));
    let mut wet = None;
    until(|| {
        wet = output.pop();
        wet.is_some()
    });
    let wet = wet.unwrap();
    assert_eq!(wet.first_frame, 100);
    assert_eq!(wet.host_time, 200);
    assert_eq!(wet.samples(), &[[0.25, -0.125]; 128]);
    assert_eq!(dry.pop().unwrap().samples(), &[[0.5, -0.25]; 128]);
    drop(owner);
    assert_eq!(budget.used(), 0);
    assert_eq!(drops.load(Ordering::Acquire), 1);
    assert!(output.pop().is_none());
    assert!(writer.push(228, 300, &[[0.1, 0.2]; 31]));
    assert_eq!(dry.pop().unwrap().samples().len(), 31);
}

#[test]
fn failed_processor_and_unconsumed_output_mute_cue_but_keep_dry_alive() {
    for fail in [true, false] {
        let budget = StreamBudget::default();
        let drops = Arc::new(AtomicUsize::new(0));
        let d = drops.clone();
        let (mut writer, mut dry, input) = crate::native_input::input();
        let (mut owner, mut output) = Owner::spawn(
            input,
            budget.reserve(1).unwrap(),
            Duration::from_secs(1),
            move |_| {
                Ok((
                    Gain {
                        drops: d,
                        fail,
                        control: None,
                        entered: Arc::new(AtomicBool::new(false)),
                    },
                    0,
                ))
            },
        )
        .unwrap();
        for block in 0..9 {
            assert!(writer.push(block * 128, 100 + block, &[[0.5, -0.25]; 128]));
            assert_eq!(dry.pop().unwrap().samples().len(), 128);
            // Prevent ingress overflow so non-failing case exercises OUTPUT full.
            if !fail {
                until(|| owner.input.0.read.load(Ordering::Acquire) >= block as usize + 1);
            } else if block == 0 {
                until(|| owner.fault() == Some(Fault::Processor));
            }
        }
        until(|| owner.fault().is_some());
        until(|| {
            owner.reap();
            owner.worker.is_none()
        });
        assert_eq!(budget.used(), 0);
        assert_eq!(drops.load(Ordering::Acquire), 1);
        assert!(output.pop().is_none());
        assert!(writer.push(9 * 128, 200, &[[0.75; 2]; 31]));
        assert_eq!(dry.pop().unwrap().samples().len(), 31);
    }
}

#[test]
fn cancellation_interrupts_work_and_suppresses_a_late_reply() {
    let budget = StreamBudget::default();
    let drops = Arc::new(AtomicUsize::new(0));
    let entered = Arc::new(AtomicBool::new(false));
    let (d, e) = (drops.clone(), entered.clone());
    let (mut writer, mut dry, input) = crate::native_input::input();
    let (owner, mut output) = Owner::spawn(
        input,
        budget.reserve(2).unwrap(),
        Duration::from_secs(1),
        move |control| {
            Ok((
                Gain {
                    drops: d,
                    fail: false,
                    control: Some(control),
                    entered: e,
                },
                0,
            ))
        },
    )
    .unwrap();
    writer.push(0, 100, &[[0.5; 2]; 128]);
    until(|| entered.load(Ordering::Acquire));
    drop(owner);
    assert_eq!(budget.used(), 0);
    assert_eq!(drops.load(Ordering::Acquire), 1);
    assert!(output.pop().is_none());
    assert_eq!(dry.pop().unwrap().samples(), &[[0.5; 2]; 128]);
}

#[test]
fn startup_failure_timeout_and_panic_join_and_release_budget() {
    for mode in 0..3 {
        let budget = StreamBudget::default();
        let (_writer, _dry, input) = crate::native_input::input();
        let result = Owner::spawn::<Gain>(
            input,
            budget.reserve(2).unwrap(),
            Duration::from_millis(20),
            move |control| match mode {
                0 => Err("Test startup failure".into()),
                1 => {
                    until(|| control.cancelled.load(Ordering::Acquire));
                    Err("Cancelled opening".into())
                }
                _ => panic!("Test startup panic"),
            },
        );
        let reason = result.err().unwrap();
        assert!(reason.contains(match mode {
            0 => "startup failure",
            1 => "timed out",
            _ => "failed during startup",
        }));
        assert_eq!(budget.used(), 0);
    }
}

#[cfg(target_os = "macos")]
fn apple_config() -> PluginConfig {
    let plugins = crate::apple::plugin("plugin-scan", "{}").unwrap();
    let id = plugins
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["name"] == "AUBandpass")
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    PluginConfig {
        id,
        state: String::new(),
        parameters: serde_json::json!({"0":1000}),
        bypass: false,
    }
}
#[cfg(target_os = "macos")]
struct SyntheticCapture {
    writer: Option<crate::native_input::InputWriter>,
    frames: u64,
}
#[cfg(target_os = "macos")]
impl super::super::Capture for SyntheticCapture {
    fn report(&self) -> super::super::Report {
        super::super::Report {
            frames: self.frames,
            callbacks: self.frames / 128,
            fault: None,
            peaks: [0.25, 0.5],
        }
    }
    fn check_device(&self) -> Result<()> {
        Ok(())
    }
    fn finish(mut self) -> Result<super::super::Report> {
        self.writer.take();
        Ok(<Self as super::super::Capture>::report(&self))
    }
}
#[cfg(target_os = "macos")]
fn capture_config() -> super::super::Config {
    super::super::Config {
        channels: 2,
        max_frames: 48000,
        context: serde_json::json!({}),
        callback_timeout: Duration::from_secs(5),
    }
}
#[cfg(target_os = "macos")]
fn owned_helper_case(plugins: Vec<PluginConfig>) {
    use super::super::{Outcome, Session};
    let root = tempfile::tempdir().unwrap();
    let budget = StreamBudget::default();
    let count = plugins.len();
    let (mut session, mut output) = Session::start_with_cue(
        root.path(),
        capture_config(),
        CueConfig {
            plugins,
            budget: budget.clone(),
            startup_timeout: Duration::from_secs(10),
        },
        |writer| {
            Ok(SyntheticCapture {
                writer: Some(writer),
                frames: 0,
            })
        },
    )
    .unwrap();
    assert_eq!(budget.used(), count);
    let handles = session
        .cue
        .as_ref()
        .unwrap()
        .control
        .helpers
        .lock()
        .unwrap()
        .clone();
    assert_eq!(handles.len(), count);
    assert!(handles.iter().all(StreamStop::is_alive));
    for block in 0..12 {
        if block == 4 {
            handles[0].stop();
        }
        let capture = session.capture.as_mut().unwrap();
        assert!(capture.writer.as_mut().unwrap().push(
            block * 128,
            100 + block,
            &[[0.25, -0.5]; 128]
        ));
        capture.frames += 128;
        if block < 4 {
            let mut wet = None;
            until(|| {
                wet = output.pop();
                wet.is_some()
            });
            assert_eq!(wet.unwrap().samples().len(), 128);
        } else if block == 4 {
            until(|| {
                session.poll().unwrap();
                session.cue_fault().is_some()
            });
            until(|| budget.used() == 0);
            assert!(handles.iter().all(|h| !h.is_alive()));
            assert!(output.pop().is_none());
        }
    }
    let Outcome::Complete(take) = session.stop() else {
        panic!("Killed cue must preserve dry recording")
    };
    let pcm = hound::WavReader::open(take.path)
        .unwrap()
        .samples::<f32>()
        .map(|v| v.unwrap())
        .collect::<Vec<_>>();
    assert_eq!(take.info.frames, 1536);
    assert_eq!(pcm, [0.25, -0.5].repeat(1536));
    assert_eq!(budget.used(), 0);
    assert!(handles.iter().all(|h| !h.is_alive()));
}
#[cfg(target_os = "macos")]
#[test]
fn actual_au_helpers_are_owned_killed_and_released_while_dry_file_completes() {
    for count in [1, 2] {
        owned_helper_case((0..count).map(|_| apple_config()).collect());
    }
}
#[cfg(target_os = "macos")]
#[test]
#[ignore = "Requires explicit SDK VST3 fixture folder"]
fn actual_vst3_helpers_are_owned_killed_and_released_while_dry_file_completes() {
    let folder =
        std::env::var("CRISPAUDIO_TEST_PLUGIN_FOLDER").expect("Explicit SDK VST3 fixture folder");
    let plugins = crate::apple::plugin(
        "plugin-scan",
        &serde_json::json!({"folders":[folder]}).to_string(),
    )
    .unwrap();
    let id = plugins
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["name"] == "ADelay")
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    for count in [1, 2] {
        owned_helper_case(
            (0..count)
                .map(|_| PluginConfig {
                    id: id.clone(),
                    state: String::new(),
                    parameters: serde_json::json!({}),
                    bypass: false,
                })
                .collect(),
        );
    }
}
#[cfg(target_os = "macos")]
#[test]
fn real_helpers_close_on_capture_open_failure_partial_rack_failure_and_late_registration() {
    use super::super::Session;
    let root = tempfile::tempdir().unwrap();
    let budget = StreamBudget::default();
    // A failed device open happens after rack startup: its owner must close it.
    let error = Session::<SyntheticCapture>::start_with_cue(
        root.path(),
        capture_config(),
        CueConfig {
            plugins: vec![apple_config(), apple_config()],
            budget: budget.clone(),
            startup_timeout: Duration::from_secs(10),
        },
        |_| Err("Synthetic device open failed".into()),
    )
    .err()
    .unwrap();
    assert!(error.recovery_directory.is_some());
    assert_eq!(budget.used(), 0);

    let (_writer, _dry, input) = crate::native_input::input();
    let mut invalid = apple_config();
    invalid.id = "au:not-a-real-component".into();
    let checked = Arc::new(AtomicBool::new(false));
    let worker_checked = checked.clone();
    let mut observed = Vec::new();
    let result = Owner::spawn::<PluginRack>(
        input,
        budget.reserve(2).unwrap(),
        Duration::from_secs(10),
        move |control| {
            // PluginRack itself closes its first helper when the second open fails.
            let rack = PluginRack::open(&[apple_config(), invalid], |h| {
                observed.push(h.clone());
                control.register(h);
            });
            assert!(rack.is_err());
            assert!(observed.iter().all(|h| !h.is_alive()));
            worker_checked.store(true, Ordering::Release);
            Err("Partial rack failed and closed".into())
        },
    );
    assert!(result.is_err());
    assert!(checked.load(Ordering::Acquire));
    assert_eq!(budget.used(), 0);

    let checked = Arc::new(AtomicBool::new(false));
    let worker_checked = checked.clone();
    let plugin = apple_config();
    let (_writer, _dry, input) = crate::native_input::input();
    let result = Owner::spawn::<PluginRack>(
        input,
        budget.reserve(1).unwrap(),
        Duration::from_millis(20),
        move |control| {
            until(|| control.cancelled.load(Ordering::Acquire));
            let mut observed = Vec::new();
            let rack = PluginRack::open(&[plugin], |h| {
                observed.push(h.clone());
                control.register(h);
            });
            assert!(rack.is_err()); // Late registration is killed before handshake.
            assert!(observed.iter().all(|h| !h.is_alive()));
            worker_checked.store(true, Ordering::Release);
            Err("Late helper killed".into())
        },
    );
    assert!(result.err().unwrap().contains("timed out"));
    assert!(checked.load(Ordering::Acquire));
    assert_eq!(budget.used(), 0);
}

#[test]
fn ingress_overflow_interrupts_blocked_processing_and_releases_budget_on_poll() {
    let budget = StreamBudget::default();
    let drops = Arc::new(AtomicUsize::new(0));
    let entered = Arc::new(AtomicBool::new(false));
    let (d, e) = (drops.clone(), entered.clone());
    let (mut writer, mut dry, input) = crate::native_input::input();
    let (mut owner, mut output) = Owner::spawn(
        input,
        budget.reserve(2).unwrap(),
        Duration::from_secs(1),
        move |control| {
            Ok((
                Gain {
                    drops: d,
                    fail: false,
                    control: Some(control),
                    entered: e,
                },
                0,
            ))
        },
    )
    .unwrap();
    assert!(writer.push(0, 100, &[[0.5; 2]; 128]));
    dry.pop().unwrap();
    until(|| entered.load(Ordering::Acquire));
    for block in 1..=9 {
        assert!(writer.push(block * 128, 100 + block, &[[0.5; 2]; 128]));
        dry.pop().unwrap();
    }
    assert_eq!(owner.fault(), Some(Fault::Overflow));
    until(|| {
        owner.reap();
        owner.worker.is_none()
    });
    assert_eq!(drops.load(Ordering::Acquire), 1);
    assert_eq!(budget.used(), 0);
    assert!(output.pop().is_none());
    assert_eq!(dry.status().fault(), None);
}
