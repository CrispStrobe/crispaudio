use super::*;
use std::{cell::Cell, sync::atomic::AtomicBool};

struct Fake {
    writer: Option<InputWriter>,
    frames: u64,
    callbacks: u64,
    tail: bool,
    bad_count: bool,
    stop_error: bool,
    stop_fault: bool,
    device: Rc<Cell<bool>>,
    drops: Rc<Cell<usize>>,
}
impl Fake {
    fn new(mut writer: InputWriter, device: Rc<Cell<bool>>, drops: Rc<Cell<usize>>) -> Self {
        assert!(writer.push(700, 100, &[[0.25, -0.5]; 128]));
        Self {
            writer: Some(writer),
            frames: 128,
            callbacks: 1,
            tail: true,
            bad_count: false,
            stop_error: false,
            stop_fault: false,
            device,
            drops,
        }
    }
}
impl Capture for Fake {
    fn report(&self) -> Report {
        Report {
            frames: self.frames,
            callbacks: self.callbacks,
            fault: None,
            peaks: [0.25, 0.5],
        }
    }
    fn check_device(&self) -> Result<()> {
        if self.device.get() {
            Ok(())
        } else {
            Err("Device disconnected".into())
        }
    }
    fn finish(mut self) -> Result<Report> {
        if self.tail {
            assert!(self
                .writer
                .as_mut()
                .unwrap()
                .push(828, 200, &[[0.75, -0.125]; 31]));
            self.frames += 31;
            self.callbacks += 1;
        }
        drop(self.writer.take());
        if self.stop_error {
            return Err("Capture disposal failed".into());
        }
        let mut report = self.report();
        if self.bad_count {
            report.frames += 1;
        }
        if self.stop_fault {
            report.fault = Some(Fault::Device);
        }
        Ok(report)
    }
}
impl Drop for Fake {
    fn drop(&mut self) {
        self.drops.set(self.drops.get() + 1);
    }
}
fn config() -> Config {
    Config {
        channels: 2,
        max_frames: 48000,
        context: serde_json::json!({"track":"test"}),
        callback_timeout: Duration::from_secs(1),
    }
}
fn incomplete(outcome: Outcome) -> PathBuf {
    match outcome {
        Outcome::Incomplete {
            recovery_directory, ..
        } => recovery_directory,
        _ => panic!("Expected incomplete take"),
    }
}
fn recover(path: &Path, output: &Path) -> super::super::recording::RecoveredTake {
    super::super::recording::recover(path, output, &AtomicBool::new(false)).unwrap()
}

#[test]
fn stop_includes_partial_tail_and_exact_count_on_separate_file_worker() {
    let root = tempfile::tempdir().unwrap();
    let drops = Rc::new(Cell::new(0));
    let mut session = Session::start(root.path(), config(), |writer| {
        // Durable artifacts exist before a device factory is invoked.
        let folder = std::fs::read_dir(root.path())
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert!(folder.join("take.json").is_file());
        Ok(Fake::new(writer, Rc::new(Cell::new(true)), drops.clone()))
    })
    .unwrap();
    assert_eq!(session.poll().unwrap().peaks, [0.25, 0.5]);
    let Outcome::Complete(take) = session.stop() else {
        panic!("Expected complete take")
    };
    assert_eq!(drops.get(), 1);
    assert_eq!(take.info.frames, 159);
    assert_eq!(take.info.first_input_frame, 700);
    assert_eq!(take.info.first_host_time, 100);
    let pcm = hound::WavReader::open(take.path)
        .unwrap()
        .samples::<f32>()
        .collect::<std::result::Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(&pcm[..256], [0.25, -0.5].repeat(128));
    assert_eq!(&pcm[256..], [0.75, -0.125].repeat(31));
}
#[test]
fn cancellation_and_drop_join_worker_and_preserve_prefix() {
    for explicit in [true, false] {
        let root = tempfile::tempdir().unwrap();
        let drops = Rc::new(Cell::new(0));
        let session = Session::start(root.path(), config(), |writer| {
            Ok(Fake::new(writer, Rc::new(Cell::new(true)), drops.clone()))
        })
        .unwrap();
        let path = session.recovery_directory().to_owned();
        if explicit {
            assert_eq!(incomplete(session.cancel()), path);
        } else {
            drop(session);
        }
        assert_eq!(drops.get(), 1);
        assert!(!path.join("take.wav").exists());
        assert_eq!(
            recover(&path, &root.path().join("recovered.wav"))
                .info
                .frames,
            128
        );
    }
}
#[test]
fn stalls_device_loss_and_raw_fault_stop_capture_automatically() {
    for mode in 0..3 {
        let root = tempfile::tempdir().unwrap();
        let device = Rc::new(Cell::new(true));
        let drops = Rc::new(Cell::new(0));
        let mut session = Session::start(root.path(), config(), |writer| {
            Ok(Fake::new(writer, device.clone(), drops.clone()))
        })
        .unwrap();
        let now = session.progress_at;
        session.poll_at(now).unwrap();
        match mode {
            0 => (),
            1 => device.set(false),
            _ => session.dry.fail(Fault::Overflow),
        }
        let reason = session.poll_at(now + Duration::from_secs(2)).unwrap_err();
        assert!(reason.contains(match mode {
            0 => "stalled",
            1 => "disconnected",
            _ => "Overflow",
        }));
        assert_eq!(drops.get(), 1);
        assert!(session.worker.is_none());
        assert!(session.outcome().is_some());
        let path = incomplete(session.stop());
        assert_eq!(
            recover(&path, &root.path().join("recovered.wav"))
                .info
                .frames,
            128
        );
    }
}
#[test]
fn progress_resets_watchdog_but_startup_without_callbacks_times_out() {
    let root = tempfile::tempdir().unwrap();
    let mut session = Session::start(root.path(), config(), |writer| {
        let mut fake = Fake::new(writer, Rc::new(Cell::new(true)), Rc::new(Cell::new(0)));
        fake.callbacks = 0;
        Ok(fake)
    })
    .unwrap();
    let now = session.progress_at;
    session.poll_at(now + Duration::from_millis(500)).unwrap();
    session.capture.as_mut().unwrap().callbacks = 1;
    session.poll_at(now + Duration::from_millis(900)).unwrap();
    session.poll_at(now + Duration::from_millis(1500)).unwrap();
    assert!(session.poll_at(now + Duration::from_millis(1900)).is_err());
    let path = incomplete(session.stop());
    assert!(!path.join("take.wav").exists());

    let session = Session::start(root.path(), config(), |writer| {
        Ok(Fake::new(
            writer,
            Rc::new(Cell::new(true)),
            Rc::new(Cell::new(0)),
        ))
    })
    .unwrap();
    let mut session = session;
    session.capture.as_mut().unwrap().callbacks = 0;
    assert!(session
        .poll_at(session.progress_at + Duration::from_secs(1))
        .unwrap_err()
        .contains("stalled"));
}
#[test]
fn stop_error_fault_and_count_mismatch_never_publish_complete_audio() {
    for mode in 0..3 {
        let root = tempfile::tempdir().unwrap();
        let session = Session::start(root.path(), config(), |writer| {
            let mut fake = Fake::new(writer, Rc::new(Cell::new(true)), Rc::new(Cell::new(0)));
            fake.stop_error = mode == 0;
            fake.stop_fault = mode == 1;
            fake.bad_count = mode == 2;
            Ok(fake)
        })
        .unwrap();
        let path = incomplete(session.stop());
        assert!(!path.join("take.wav").exists());
        assert_eq!(
            recover(&path, &root.path().join("recovered.wav"))
                .info
                .frames,
            159
        );
    }
}
#[test]
fn failed_open_retains_files_and_invalid_config_never_calls_factory() {
    let root = tempfile::tempdir().unwrap();
    let result = Session::<Fake>::start(root.path(), config(), |writer| {
        drop(writer);
        Err("Microphone permission denied".into())
    });
    let error = result.err().unwrap();
    assert!(error.reason.contains("permission"));
    assert!(error
        .recovery_directory
        .unwrap()
        .join("take.json")
        .is_file());
    for invalid in 0..4 {
        let mut config = config();
        match invalid {
            0 => config.max_frames = MAX_TAKE_FRAMES + 1,
            1 => config.max_frames = 0,
            2 => config.callback_timeout = Duration::ZERO,
            _ => config.channels = 3,
        }
        let result =
            Session::<Fake>::start(root.path(), config, |_| panic!("Must not open device"));
        assert!(result.is_err());
    }
}
#[test]
fn file_budget_failure_faults_ingress_and_releases_capture() {
    let root = tempfile::tempdir().unwrap();
    let drops = Rc::new(Cell::new(0));
    let mut config = config();
    config.max_frames = 64;
    let mut session = Session::start(root.path(), config, |writer| {
        Ok(Fake::new(writer, Rc::new(Cell::new(true)), drops.clone()))
    })
    .unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    while session.dry.fault().is_none() {
        assert!(Instant::now() < deadline);
        thread::sleep(Duration::from_millis(1));
    }
    assert!(session.poll().unwrap_err().contains("Storage"));
    assert_eq!(drops.get(), 1);
    let path = incomplete(session.stop());
    assert!(!path.join("take.wav").exists());
}

#[cfg(target_os = "macos")]
#[test]
fn mac_channel_layout_mismatch_rejected_before_file_or_device_creation() {
    let root = tempfile::tempdir().unwrap();
    let result = Session::start_macos(
        root.path(),
        config(),
        "unused",
        super::super::macos::ChannelMap::Mono(0),
    );
    assert!(result.err().unwrap().reason.contains("channel map"));
    assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 0);
}

#[test]
fn session_cue_output_disconnect_preserves_complete_dry_take_and_closes_workers() {
    let root = tempfile::tempdir().unwrap();
    let budget = cue::StreamBudget::default();
    let (mut session, mut output) = Session::start_with_cue(
        root.path(),
        config(),
        CueConfig {
            plugins: Vec::new(),
            budget: budget.clone(),
            startup_timeout: Duration::from_secs(1),
        },
        |writer| {
            Ok(Fake::new(
                writer,
                Rc::new(Cell::new(true)),
                Rc::new(Cell::new(0)),
            ))
        },
    )
    .unwrap();
    assert_eq!(session.cue_latency_samples(), Some(0));
    let deadline = Instant::now() + Duration::from_secs(5);
    let wet = loop {
        if let Some(packet) = output.pop() {
            break packet;
        }
        assert!(Instant::now() < deadline);
        thread::sleep(Duration::from_millis(1));
    };
    assert_eq!(wet.samples(), &[[0.25, -0.5]; 128]);
    drop(output);
    assert_eq!(session.cue_fault(), Some(Fault::Disconnected));
    session.poll().unwrap();
    let Outcome::Complete(take) = session.stop() else {
        panic!("Cue disconnect must preserve dry take")
    };
    assert_eq!(take.info.frames, 159);
    assert_eq!(budget.used(), 0);
}

#[test]
fn failed_cue_startup_never_opens_capture_and_retains_recovery_files() {
    let root = tempfile::tempdir().unwrap();
    let budget = cue::StreamBudget::default();
    let result = Session::<Fake>::start_with_cue(
        root.path(),
        config(),
        CueConfig {
            plugins: vec![super::super::plugins::PluginConfig {
                id: String::new(),
                state: String::new(),
                parameters: serde_json::json!({}),
                bypass: false,
            }],
            budget: budget.clone(),
            startup_timeout: Duration::from_secs(1),
        },
        |_| panic!("Invalid cue must not open capture"),
    );
    let error = result.err().unwrap();
    assert!(error.reason.contains("configuration"));
    assert!(error.recovery_directory.unwrap().join("take.json").exists());
    assert_eq!(budget.used(), 0);
}

#[test]
fn preparation_creates_files_without_capture_and_starts_only_on_request() {
    let root = tempfile::tempdir().unwrap();
    let drops = Rc::new(Cell::new(0));
    let (prepared, output) = Session::<Fake>::prepare(root.path(), config(), None).unwrap();
    assert!(output.is_none());
    let path = prepared.recovery_directory().to_owned();
    assert!(path.join("take.json").is_file());
    assert!(!path.join("take.wav").exists());
    assert_eq!(drops.get(), 0);
    let session = prepared
        .start(|writer| Ok(Fake::new(writer, Rc::new(Cell::new(true)), drops.clone())))
        .unwrap();
    assert!(matches!(session.stop(), Outcome::Complete(_)));
    assert_eq!(drops.get(), 1);
}
#[test]
fn abandoned_preparation_retains_files_without_a_complete_take() {
    let root = tempfile::tempdir().unwrap();
    let (prepared, _) = Session::<Fake>::prepare(root.path(), config(), None).unwrap();
    let path = prepared.recovery_directory().to_owned();
    drop(prepared);
    assert!(path.join("take.json").is_file());
    assert!(path.join("audio.partial.wav").is_file());
    assert!(!path.join("take.wav").exists());
}
