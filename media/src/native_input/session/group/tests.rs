use super::*;
use crate::native_input::{recording::recover, Fault};
use std::{cell::Cell, rc::Rc, sync::atomic::AtomicBool};

struct Fake {
    writer: Option<InputWriter>,
    frames: u64,
    id: String,
    fail_stop: bool,
    no_early_complete: Option<PathBuf>,
    live: Rc<Cell<usize>>,
    finishes: Rc<Cell<usize>>,
    peers_stopped: Rc<Cell<bool>>,
}
impl Fake {
    fn new(
        mut writer: InputWriter,
        id: &str,
        live: Rc<Cell<usize>>,
        finishes: Rc<Cell<usize>>,
        peers: Rc<Cell<bool>>,
    ) -> Self {
        assert!(writer.push(1000, 100, &[[0.25, -0.5]; 128]));
        live.set(live.get() + 1);
        Self {
            writer: Some(writer),
            frames: 128,
            id: id.into(),
            fail_stop: false,
            no_early_complete: None,
            live,
            finishes,
            peers_stopped: peers,
        }
    }
}
impl Capture for Fake {
    fn report(&self) -> Report {
        Report {
            frames: self.frames,
            callbacks: 1,
            fault: None,
            peaks: [0.25, 0.5],
        }
    }
    fn check_device(&self) -> Result<()> {
        Ok(())
    }
    fn finish(mut self) -> Result<Report> {
        if let Some(directory) = &self.no_early_complete {
            for entry in fs::read_dir(directory).unwrap() {
                assert!(
                    !entry.unwrap().path().join("take.wav").exists(),
                    "A file was published before every capture stopped"
                );
            }
        }
        assert!(self
            .writer
            .as_mut()
            .unwrap()
            .push(1128, 200, &[[0.75, -0.125]; 31]));
        self.frames += 31;
        self.finishes.set(self.finishes.get() + 1);
        if self.fail_stop {
            return Err(format!("{} failed stop", self.id));
        }
        self.writer.take();
        Ok(self.report())
    }
}
impl Drop for Fake {
    fn drop(&mut self) {
        self.live.set(self.live.get() - 1);
        if self.live.get() == 0 {
            self.peers_stopped.set(true);
        }
    }
}
fn inputs() -> Vec<Input> {
    ["voice", "room"]
        .into_iter()
        .map(|id| Input {
            track_id: id.into(),
            recording: Config {
                channels: 2,
                max_frames: 48000,
                context: serde_json::json!({"project":"test"}),
                callback_timeout: Duration::from_secs(5),
            },
            cue: None,
        })
        .collect()
}
fn start(root: &Path, fail_stop: bool) -> Group<Fake> {
    let live = Rc::new(Cell::new(0));
    let finishes = Rc::new(Cell::new(0));
    let peers = Rc::new(Cell::new(false));
    Group::start(root, inputs(), |id, writer| {
        let mut capture = Fake::new(writer, id, live.clone(), finishes.clone(), peers.clone());
        capture.fail_stop = fail_stop && id == "room";
        Ok(capture)
    })
    .unwrap()
    .0
}
fn incomplete(outcome: GroupOutcome) -> (PathBuf, Vec<InputOutcome>) {
    match outcome {
        GroupOutcome::Incomplete {
            directory, inputs, ..
        } => (directory, inputs),
        _ => panic!("Expected incomplete group"),
    }
}

#[test]
fn complete_group_commits_all_clips_and_reopens_after_stopping_every_capture() {
    let root = tempfile::tempdir().unwrap();
    let mut group = start(root.path(), false);
    assert_eq!(group.poll().unwrap().len(), 2);
    let live = group.inputs[0].1.capture.as_ref().unwrap().live.clone();
    let finishes = group.inputs[0].1.capture.as_ref().unwrap().finishes.clone();
    let peers = group.inputs[0]
        .1
        .capture
        .as_ref()
        .unwrap()
        .peers_stopped
        .clone();
    // Each capture finish checks that no earlier file is already complete.
    let directory = group.directory().to_owned();
    for (_, session) in &mut group.inputs {
        session.capture.as_mut().unwrap().no_early_complete = Some(directory.clone());
    }
    assert!(!directory.join(MANIFEST).exists());
    let GroupOutcome::Complete { manifest, .. } = group.stop() else {
        panic!("Expected complete group")
    };
    assert_eq!(live.get(), 0);
    assert_eq!(finishes.get(), 2);
    assert!(peers.get());
    assert_eq!(manifest.clips.len(), 2);
    let reopened = load_completed(&directory).unwrap();
    assert_eq!(reopened.clips.len(), 2);
    for clip in reopened.clips {
        assert_eq!(clip.info.frames, 159);
        assert_eq!(clip.info.first_input_frame, 1000);
        assert_eq!(clip.info.context["trackId"], clip.track_id);
        assert_eq!(clip.info.context["source"]["project"], "test");
        let pcm = hound::WavReader::open(directory.join(clip.audio))
            .unwrap()
            .samples::<f32>()
            .map(|v| v.unwrap())
            .collect::<Vec<_>>();
        assert_eq!(&pcm[..256], [0.25, -0.5].repeat(128));
        assert_eq!(&pcm[256..], [0.75, -0.125].repeat(31));
    }
}
#[test]
fn second_input_start_failure_rolls_back_first_and_keeps_recoverable_prefix() {
    let root = tempfile::tempdir().unwrap();
    let live = Rc::new(Cell::new(0));
    let finishes = Rc::new(Cell::new(0));
    let peers = Rc::new(Cell::new(false));
    let error = Group::start(root.path(), inputs(), |id, writer| {
        if id == "room" {
            drop(writer);
            return Err("Device unavailable".into());
        }
        Ok(Fake::new(
            writer,
            id,
            live.clone(),
            finishes.clone(),
            peers.clone(),
        ))
    })
    .err()
    .unwrap();
    assert_eq!(live.get(), 0);
    assert_eq!(error.inputs.len(), 2);
    let directory = error.directory.unwrap();
    assert!(directory.join("plan.json").exists());
    assert!(!directory.join(MANIFEST).exists());
    assert!(load_completed(&directory).is_err());
    let Outcome::Incomplete {
        recovery_directory, ..
    } = &error.inputs[0].outcome
    else {
        panic!("First input must roll back")
    };
    assert_eq!(
        recover(
            recovery_directory,
            &root.path().join("prefix.wav"),
            &AtomicBool::new(false)
        )
        .unwrap()
        .info
        .frames,
        128
    );
}
#[test]
fn later_stop_failure_does_not_commit_a_partial_set() {
    let root = tempfile::tempdir().unwrap();
    let (directory, outcomes) = incomplete(start(root.path(), true).stop());
    assert!(!directory.join(MANIFEST).exists());
    assert!(matches!(outcomes[0].outcome, Outcome::Complete(_)));
    assert!(matches!(outcomes[1].outcome, Outcome::Incomplete { .. }));
    for (index, input) in outcomes.iter().enumerate() {
        let path = match &input.outcome {
            Outcome::Complete(take) => &take.recovery_directory,
            Outcome::Incomplete {
                recovery_directory, ..
            } => recovery_directory,
        };
        assert_eq!(
            recover(
                path,
                &root.path().join(format!("prefix-{index}.wav")),
                &AtomicBool::new(false)
            )
            .unwrap()
            .info
            .frames,
            159
        );
    }
}
#[test]
fn raw_fault_cancel_and_drop_stop_every_input_without_committing() {
    for mode in 0..3 {
        let root = tempfile::tempdir().unwrap();
        let mut group = start(root.path(), false);
        let path = group.directory().to_owned();
        let live = group.inputs[0].1.capture.as_ref().unwrap().live.clone();
        match mode {
            0 => {
                group.inputs[1].1.dry.fail(Fault::Overflow);
                assert!(group.poll().is_err());
                assert!(group.outcome().is_some());
                incomplete(group.stop());
            }
            1 => {
                incomplete(group.cancel());
            }
            _ => drop(group),
        }
        assert_eq!(live.get(), 0);
        assert!(!path.join(MANIFEST).exists());
        let takes = fs::read_dir(&path)
            .unwrap()
            .filter_map(|e| {
                let p = e.unwrap().path();
                p.is_dir().then_some(p)
            })
            .collect::<Vec<_>>();
        assert_eq!(takes.len(), 2);
        for (index, take) in takes.iter().enumerate() {
            assert_eq!(
                recover(
                    take,
                    &root.path().join(format!("recover-{index}.wav")),
                    &AtomicBool::new(false)
                )
                .unwrap()
                .info
                .frames,
                128
            );
        }
    }
}
#[test]
fn whole_group_validation_rejects_duplicates_budgets_and_bad_late_config_before_opening() {
    let root = tempfile::tempdir().unwrap();
    for mode in 0..6 {
        let mut list = inputs();
        match mode {
            0 => list[1].track_id = "voice".into(),
            1 => list[1].recording.channels = 3,
            2 => {
                for input in &mut list {
                    input.recording.max_frames = MAX_TAKE_FRAMES;
                }
            }
            3 => list[1].recording.context = serde_json::Value::Null,
            4 => list.clear(),
            _ => {
                for index in 0..3 {
                    let mut extra = inputs().remove(0);
                    extra.track_id = format!("extra-{index}");
                    list.push(extra);
                }
                for input in &mut list {
                    input.cue = Some(CueSpec {
                        plugins: (0..2)
                            .map(|_| PluginConfig {
                                id: "not-opened".into(),
                                state: String::new(),
                                parameters: serde_json::json!({}),
                                bypass: false,
                            })
                            .collect(),
                        startup_timeout: Duration::from_secs(1),
                    });
                }
            }
        }
        assert!(Group::<Fake>::start(root.path(), list, |_, _| panic!(
            "Preflight must reject before factory"
        ))
        .is_err());
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
    }
}
#[test]
fn manifest_collision_preserves_existing_file_and_all_take_originals() {
    let root = tempfile::tempdir().unwrap();
    let group = start(root.path(), false);
    let dir = group.directory().to_owned();
    fs::write(dir.join(MANIFEST), b"existing").unwrap();
    let (_, outcomes) = incomplete(group.stop());
    assert_eq!(fs::read(dir.join(MANIFEST)).unwrap(), b"existing");
    assert!(outcomes
        .iter()
        .all(|o| matches!(o.outcome, Outcome::Complete(_))));
    assert!(load_completed(&dir).is_err());
}
#[test]
fn reopen_rejects_missing_truncated_duplicate_and_traversing_clips() {
    for mode in 0..7 {
        let root = tempfile::tempdir().unwrap();
        let group = start(root.path(), false);
        let dir = group.directory().to_owned();
        let GroupOutcome::Complete { mut manifest, .. } = group.stop() else {
            panic!("Expected complete group")
        };
        match mode {
            0 => {
                fs::remove_file(dir.join(&manifest.clips[1].audio)).unwrap();
            }
            1 => {
                std::fs::OpenOptions::new()
                    .write(true)
                    .open(dir.join(&manifest.clips[1].audio))
                    .unwrap()
                    .set_len(80)
                    .unwrap();
            }
            2 => manifest.clips[1].track_id = manifest.clips[0].track_id.clone(),
            3 => manifest.clips[1].audio = "../outside.wav".into(),
            4 => manifest.clips[1].info.frames += 1,
            5 => manifest.clips[1].audio = manifest.clips[0].audio.clone(),
            _ => {
                manifest.clips[1].audio = Path::new(&manifest.clips[0].audio)
                    .parent()
                    .unwrap()
                    .join(".")
                    .join("take.wav")
                    .to_str()
                    .unwrap()
                    .to_owned()
            }
        }
        fs::write(dir.join(MANIFEST), serde_json::to_vec(&manifest).unwrap()).unwrap();
        assert!(load_completed(&dir).is_err());
    }
}
#[cfg(unix)]
#[test]
fn reopen_refuses_known_symlink_manifest_or_audio() {
    for mode in 0..2 {
        let root = tempfile::tempdir().unwrap();
        let group = start(root.path(), false);
        let dir = group.directory().to_owned();
        let GroupOutcome::Complete { manifest, .. } = group.stop() else {
            panic!("Expected complete group")
        };
        let path = if mode == 0 {
            dir.join(MANIFEST)
        } else {
            dir.join(&manifest.clips[0].audio)
        };
        let original = root.path().join("original");
        fs::rename(&path, &original).unwrap();
        std::os::unix::fs::symlink(&original, &path).unwrap();
        assert!(load_completed(&dir).is_err());
        assert!(original.exists());
    }
}

#[test]
fn cue_consumer_faults_do_not_invalidate_the_dry_group() {
    let root = tempfile::tempdir().unwrap();
    let mut specs = inputs();
    for input in &mut specs {
        input.cue = Some(CueSpec {
            plugins: Vec::new(),
            startup_timeout: Duration::from_secs(2),
        });
    }
    let live = Rc::new(Cell::new(0));
    let finishes = Rc::new(Cell::new(0));
    let peers = Rc::new(Cell::new(false));
    let (mut group, outputs) = Group::start(root.path(), specs, |id, writer| {
        Ok(Fake::new(
            writer,
            id,
            live.clone(),
            finishes.clone(),
            peers.clone(),
        ))
    })
    .unwrap();
    assert_eq!(outputs.len(), 2);
    drop(outputs);
    assert!(group.inputs.iter().all(|(_, s)| s.cue_fault().is_some()));
    assert_eq!(group.poll().unwrap().len(), 2);
    assert!(matches!(group.stop(), GroupOutcome::Complete { .. }));
    assert_eq!(live.get(), 0);
}

#[test]
fn second_rack_open_failure_rolls_back_an_already_capturing_input() {
    let root = tempfile::tempdir().unwrap();
    let mut specs = inputs();
    specs[1].cue = Some(CueSpec {
        plugins: vec![PluginConfig {
            id: "not-a-real-plugin".into(),
            state: String::new(),
            parameters: serde_json::json!({}),
            bypass: false,
        }],
        startup_timeout: Duration::from_secs(5),
    });
    let live = Rc::new(Cell::new(0));
    let finishes = Rc::new(Cell::new(0));
    let peers = Rc::new(Cell::new(false));
    let error = Group::start(root.path(), specs, |id, writer| {
        assert_eq!(
            id, "voice",
            "Second capture must not open after cue preparation fails"
        );
        Ok(Fake::new(
            writer,
            id,
            live.clone(),
            finishes.clone(),
            peers.clone(),
        ))
    })
    .err()
    .unwrap();
    assert_eq!(live.get(), 0);
    assert_eq!(error.inputs.len(), 2);
    assert!(!error.directory.unwrap().join(MANIFEST).exists());
}

#[test]
fn abrupt_exit_between_individual_take_completions_never_commits_a_partial_group() {
    let root = tempfile::tempdir().unwrap();
    let result = std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "native_input::session::group::tests::interrupted_group_fixture",
            "--ignored",
        ])
        .env("CRISPAUDIO_GROUP_CRASH_FIXTURE_ROOT", root.path())
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let directory =
        PathBuf::from(fs::read_to_string(root.path().join("fixture-directory")).unwrap());
    assert!(!directory.join(MANIFEST).exists());
    assert!(load_completed(&directory).is_err());
    let completed = fs::read_dir(&directory)
        .unwrap()
        .filter(|e| e.as_ref().unwrap().path().join("take.wav").exists())
        .count();
    assert_eq!(completed, 1);
    assert!(directory.join("plan.json").exists());
}
#[test]
#[ignore = "Subprocess crash support; parent executes with explicit temporary root"]
fn interrupted_group_fixture() {
    let Ok(root) = std::env::var("CRISPAUDIO_GROUP_CRASH_FIXTURE_ROOT") else {
        return;
    };
    let root = Path::new(&root);
    let mut group = start(root, false);
    let directory = group.directory().to_owned();
    let (_, session) = group.inputs.remove(0);
    assert!(matches!(session.stop(), Outcome::Complete(_)));
    let marker = root.join("fixture-directory");
    let mut file = File::create(marker).unwrap();
    file.write_all(directory.to_str().unwrap().as_bytes())
        .unwrap();
    file.sync_all().unwrap();
    std::process::exit(0); // Skip Group/Session/Recorder destructors on remaining input.
}
