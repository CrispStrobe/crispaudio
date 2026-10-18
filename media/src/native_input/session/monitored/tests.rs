use super::super::{Config, Outcome};
use super::*;
use std::{cell::Cell, path::Path, rc::Rc, time::Duration};
struct Input {
    writer: Option<InputWriter>,
    live: Rc<Cell<usize>>,
    bad: Rc<Cell<bool>>,
}
impl Capture for Input {
    fn report(&self) -> Report {
        Report {
            frames: 128,
            callbacks: 1,
            fault: None,
            peaks: [0.25; 2],
        }
    }
    fn check_device(&self) -> Result<()> {
        if self.bad.get() {
            Err("input disconnected".into())
        } else {
            Ok(())
        }
    }
    fn finish(mut self) -> Result<Report> {
        self.writer.take();
        Ok(self.report())
    }
}
impl Drop for Input {
    fn drop(&mut self) {
        self.live.set(self.live.get() - 1);
    }
}
#[derive(Default)]
struct State {
    live: Rc<Cell<usize>>,
    ready: Cell<bool>,
    fault: Cell<bool>,
    arm_failure: Cell<bool>,
    stop_failure: Cell<bool>,
    closes: Cell<usize>,
    armed: Cell<bool>,
}
struct Output(Rc<State>, Option<backing::Reader>);
impl MonitorOutput for Output {
    fn ready(&mut self) -> Result<bool> {
        if self.0.armed.get() {
            if let Some(reader) = self.1.as_mut() {
                reader
                    .render(&mut [[0.; 2]; 512])
                    .map_err(|_| "backing failed".to_string())?;
            }
        }
        if self.0.fault.get() {
            Err("output clock lost".into())
        } else {
            Ok(self.0.ready.get())
        }
    }
    fn arm(&self) -> Result<()> {
        assert_eq!(self.0.live.get(), 2);
        if self.0.arm_failure.get() {
            Err("arming failed".into())
        } else {
            self.0.armed.set(true);
            Ok(())
        }
    }
    fn stop(self) -> Result<()> {
        assert_eq!(
            self.0.live.get(),
            0,
            "Output closes only AFTER all captures quiesce"
        );
        self.0.closes.set(self.0.closes.get() + 1);
        if self.0.stop_failure.get() {
            Err("dispose failed".into())
        } else {
            Ok(())
        }
    }
}
fn specs() -> Vec<group::Input> {
    (0..2)
        .map(|i| group::Input {
            track_id: format!("track-{i}"),
            recording: Config {
                channels: 2,
                max_frames: 48000,
                context: serde_json::json!({}),
                callback_timeout: Duration::from_secs(5),
            },
            cue: None,
        })
        .collect()
}
fn prepared(root: &Path, state: Rc<State>) -> Prepared<Input, Output> {
    let (group, outputs) = group::Group::prepare(root, specs()).unwrap();
    assert!(outputs.is_empty());
    Prepared::new(group, Output(state, None), None)
}
fn open(state: Rc<State>, bad: Rc<Cell<bool>>) -> impl FnMut(&str, InputWriter) -> Result<Input> {
    move |_, mut writer| {
        assert!(writer.push(0, 100, &[[0.25; 2]; 128]));
        state.live.set(state.live.get() + 1);
        Ok(Input {
            writer: Some(writer),
            live: state.live.clone(),
            bad: bad.clone(),
        })
    }
}
fn assert_incomplete(outcome: group::GroupOutcome, needle: &str) {
    let group::GroupOutcome::Incomplete {
        directory,
        reason,
        inputs,
    } = outcome
    else {
        panic!("must retain incomplete group")
    };
    assert!(reason.contains(needle), "{reason}");
    assert!(!directory.join("completed.json").exists());
    assert_eq!(inputs.len(), 2);
    for input in inputs {
        let Outcome::Incomplete {
            recovery_directory, ..
        } = input.outcome
        else {
            panic!("must not publish completed take")
        };
        assert!(recovery_directory.join("take.json").exists());
        assert!(!recovery_directory.join("take.wav").exists());
    }
}
#[test]
fn readiness_gates_capture_and_drop_closes_unarmed_output() {
    let root = tempfile::tempdir().unwrap();
    let state = Rc::new(State::default());
    let mut prep = prepared(root.path(), state.clone());
    assert!(!prep.ready().unwrap());
    assert_eq!(state.live.get(), 0);
    drop(prep);
    assert_eq!(state.closes.get(), 1);
    let error = prepared(root.path(), state.clone())
        .start(|_, _| -> Result<Input> { panic!("clock not ready") })
        .err()
        .unwrap();
    assert!(error.reason.contains("not ready"));
    assert_eq!(error.inputs.len(), 2);
    assert_eq!(state.closes.get(), 2);
}
#[test]
fn complete_stop_quiesces_all_inputs_before_output_and_atomic_publication() {
    let root = tempfile::tempdir().unwrap();
    let state = Rc::new(State::default());
    state.ready.set(true);
    let run = prepared(root.path(), state.clone())
        .start(open(state.clone(), Rc::new(Cell::new(false))))
        .unwrap();
    assert!(state.armed.get());
    assert_eq!(state.live.get(), 2);
    let group::GroupOutcome::Complete { directory, .. } = run.stop() else {
        panic!("must complete")
    };
    assert_eq!(state.live.get(), 0);
    assert_eq!(state.closes.get(), 1);
    assert_eq!(group::load_completed(&directory).unwrap().clips.len(), 2);
}
#[test]
fn output_clock_loss_never_publishes_complete_dry_takes() {
    let root = tempfile::tempdir().unwrap();
    let state = Rc::new(State::default());
    state.ready.set(true);
    let mut run = prepared(root.path(), state.clone())
        .start(open(state.clone(), Rc::new(Cell::new(false))))
        .unwrap();
    state.fault.set(true);
    assert!(run.poll().is_err());
    assert_eq!(state.live.get(), 0);
    assert_eq!(state.closes.get(), 1);
    assert_incomplete(run.stop(), "output clock lost");
}
#[test]
fn raw_input_loss_and_cancel_quiesce_before_output_cleanup() {
    for cancel in [false, true] {
        let root = tempfile::tempdir().unwrap();
        let state = Rc::new(State::default());
        state.ready.set(true);
        let bad = Rc::new(Cell::new(false));
        let mut run = prepared(root.path(), state.clone())
            .start(open(state.clone(), bad.clone()))
            .unwrap();
        if cancel {
            assert_incomplete(run.cancel(), "cancelled");
        } else {
            bad.set(true);
            assert!(run.poll().is_err());
            assert_incomplete(run.stop(), "input disconnected");
        }
        assert_eq!(state.closes.get(), 1);
    }
}
#[test]
fn arming_and_finalization_failures_retain_only_incomplete_results() {
    let root = tempfile::tempdir().unwrap();
    let state = Rc::new(State::default());
    state.ready.set(true);
    state.arm_failure.set(true);
    state.stop_failure.set(true);
    let failure = prepared(root.path(), state.clone())
        .start(open(state.clone(), Rc::new(Cell::new(false))))
        .err()
        .unwrap();
    assert!(failure.reason.contains("arming failed"));
    assert!(failure.reason.contains("dispose failed"));
    assert_eq!(state.closes.get(), 1);
    state.arm_failure.set(false);
    let run = prepared(root.path(), state.clone())
        .start(open(state.clone(), Rc::new(Cell::new(false))))
        .unwrap();
    assert_incomplete(run.stop(), "dispose failed");
    assert_eq!(state.closes.get(), 2);
}
#[test]
fn partial_capture_start_failure_and_active_drop_close_exactly_once() {
    let root = tempfile::tempdir().unwrap();
    let state = Rc::new(State::default());
    state.ready.set(true);
    let mut factory = open(state.clone(), Rc::new(Cell::new(false)));
    let error = prepared(root.path(), state.clone())
        .start(|id, writer| {
            if id == "track-1" {
                drop(writer);
                Err("cannot open second input".into())
            } else {
                factory(id, writer)
            }
        })
        .err()
        .unwrap();
    assert_eq!(error.inputs.len(), 2);
    assert_eq!(state.live.get(), 0);
    assert_eq!(state.closes.get(), 1);
    let run = prepared(root.path(), state.clone())
        .start(open(state.clone(), Rc::new(Cell::new(false))))
        .unwrap();
    drop(run);
    assert_eq!(state.live.get(), 0);
    assert_eq!(state.closes.get(), 2);
}

#[test]
fn backing_worker_failure_stops_the_active_group_without_a_complete_marker() {
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    struct Source(Arc<AtomicBool>);
    impl backing::Renderer for Source {
        fn render(&mut self, pcm: &mut [[f32; 2]]) -> Result<()> {
            if self.0.load(Ordering::Acquire) {
                return Err("backing render failed".into());
            }
            pcm.fill([0.125; 2]);
            Ok(())
        }
    }
    let root = tempfile::tempdir().unwrap();
    let state = Rc::new(State::default());
    state.ready.set(true);
    let fail = Arc::new(AtomicBool::new(false));
    let flag = fail.clone();
    let (backing, reader) =
        backing::Worker::start(Duration::from_secs(2), move |_| Ok((Source(flag), 32000))).unwrap();
    let (group, _) = group::Group::prepare(root.path(), specs()).unwrap();
    let mut run = Prepared::new(group, Output(state.clone(), Some(reader)), Some(backing))
        .start(open(state.clone(), Rc::new(Cell::new(false))))
        .unwrap();
    fail.store(true, Ordering::Release);
    let deadline = std::time::Instant::now() + Duration::from_secs(3);
    while run.poll().is_ok() {
        assert!(std::time::Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(2));
    }
    assert_eq!(state.live.get(), 0);
    assert_eq!(state.closes.get(), 1);
    assert_incomplete(run.stop(), "backing");
}
