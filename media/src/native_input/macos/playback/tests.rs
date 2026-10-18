use super::*;
use crate::native_graph::Stereo;
use crate::native_input::{input, CueWorker, Processor, Reader, Step};
use std::sync::{atomic::AtomicI32, Arc, Barrier, Mutex};
const BASE: u64 = 1_000_000_000_000;
fn config() -> Config {
    Config {
        delay_frames: 2048,
        startup_grace_frames: 48000,
        max_input_drift_frames: 4,
        max_output_drift_frames: 8,
        watchdog_timeout: Duration::from_secs(1),
    }
}
struct Pass;
impl Processor for Pass {
    fn process(&mut self, _: u64, _: &mut [Stereo]) -> Result<()> {
        Ok(())
    }
}
struct BufferFixture {
    pcm: Box<[Stereo; MAX_FRAMES]>,
    buffer: Buffer,
}
impl BufferFixture {
    fn new() -> Self {
        let mut pcm = Box::new([[9.; 2]; MAX_FRAMES]);
        let buffer = Buffer {
            capacity: BYTES,
            data: pcm.as_mut_ptr().cast(),
            size: 0,
            user: std::ptr::null_mut(),
            packet_capacity: 0,
            packets: std::ptr::null_mut(),
            packet_count: 0,
        };
        Self { pcm, buffer }
    }
    fn send(&mut self, state: &State, queue: &FakeQueue) {
        unsafe {
            callback(
                (state as *const State as *mut State).cast(),
                queue.pointer(),
                &mut self.buffer,
            );
        }
    }
}
struct FakeQueue {
    stamp: Mutex<Timestamp>,
    discontinuity: AtomicBool,
    time_error: AtomicI32,
    enqueue_error: AtomicI32,
    stop_error: AtomicI32,
    dispose_error: AtomicI32,
    enqueues: AtomicUsize,
    stops: AtomicUsize,
    disposals: AtomicUsize,
    state: AtomicUsize,
}
impl FakeQueue {
    fn new() -> Self {
        Self {
            stamp: Mutex::new(Timestamp {
                sample: 0.,
                host: BASE,
                flags: 3,
                ..Timestamp::default()
            }),
            discontinuity: AtomicBool::new(false),
            time_error: AtomicI32::new(0),
            enqueue_error: AtomicI32::new(0),
            stop_error: AtomicI32::new(0),
            dispose_error: AtomicI32::new(0),
            enqueues: AtomicUsize::new(0),
            stops: AtomicUsize::new(0),
            disposals: AtomicUsize::new(0),
            state: AtomicUsize::new(0),
        }
    }
    fn pointer(&self) -> Queue {
        (self as *const Self as *mut Self).cast()
    }
    fn time(&self, frame: u64) {
        let mut stamp = self.stamp.lock().unwrap();
        stamp.sample = frame as f64;
        stamp.host = BASE + frame;
    }
}
unsafe extern "C" fn current(
    queue: Queue,
    timeline: *const c_void,
    time: *mut Timestamp,
    discontinuity: *mut u8,
) -> i32 {
    assert!(!timeline.is_null());
    let queue = &*queue.cast::<FakeQueue>();
    let source = queue.stamp.lock().unwrap();
    std::ptr::copy_nonoverlapping(&*source, time, 1);
    *discontinuity = u8::from(queue.discontinuity.load(Ordering::Acquire));
    queue.time_error.load(Ordering::Acquire)
}
unsafe extern "C" fn enqueue(queue: Queue, buffer: *mut Buffer, _: u32, _: *const c_void) -> i32 {
    assert_eq!((*buffer).size, BYTES);
    let queue = &*queue.cast::<FakeQueue>();
    queue.enqueues.fetch_add(1, Ordering::AcqRel);
    queue.enqueue_error.load(Ordering::Acquire)
}
unsafe extern "C" fn stop(queue: Queue, _: u8) -> i32 {
    let queue = &*queue.cast::<FakeQueue>();
    queue.stops.fetch_add(1, Ordering::AcqRel);
    queue.stop_error.load(Ordering::Acquire)
}
unsafe extern "C" fn dispose(queue: Queue, _: u8) -> i32 {
    let queue = &*queue.cast::<FakeQueue>();
    queue.disposals.fetch_add(1, Ordering::AcqRel);
    let state = &*(queue.state.load(Ordering::Acquire) as *const State);
    assert_eq!(state.phase.load(Ordering::Acquire), FINISHING);
    assert!(state
        .cue_status
        .iter()
        .all(|status| status.fault().is_some()));
    queue.dispose_error.load(Ordering::Acquire)
}
struct Fixture {
    output: Output,
    _queue: Arc<FakeQueue>,
}
impl std::ops::Deref for Fixture {
    type Target = Output;
    fn deref(&self) -> &Output {
        &self.output
    }
}
impl std::ops::DerefMut for Fixture {
    fn deref_mut(&mut self) -> &mut Output {
        &mut self.output
    }
}
fn make_fixture() -> (
    Fixture,
    Arc<FakeQueue>,
    InputWriter,
    Reader<DRY_SLOTS>,
    CueWorker<Pass>,
) {
    let (writer, dry, cue) = input();
    let (worker, output) = CueWorker::new(cue, Pass);
    let (fixture, queue) = make_output(output);
    (fixture, queue, writer, dry, worker)
}
fn make_output(output: CueOutput) -> (Fixture, Arc<FakeQueue>) {
    let queue = Arc::new(FakeQueue::new());
    let state = State::new(
        output,
        config(),
        HostTimebase {
            numerator: 1_000_000_000,
            denominator: 48000,
        },
        Ops {
            enqueue,
            current,
            stop,
            dispose,
        },
    )
    .unwrap();
    make_state(state, queue)
}
fn make_state(state: Box<State>, queue: Arc<FakeQueue>) -> (Fixture, Arc<FakeQueue>) {
    state.timeline.store(queue.pointer(), Ordering::Release);
    state.phase.store(RUNNING, Ordering::Release);
    queue
        .state
        .store((&*state as *const State) as usize, Ordering::Release);
    let output = Output {
        queue: queue.pointer(),
        state: Some(state),
        device: OutputDevice {
            uid: "fixture".into(),
            label: "Synthetic output".into(),
            channels: 2,
            nominal_rate: 48000.,
            is_default: false,
        },
        timeout: Duration::from_secs(1),
        progress: Instant::now(),
        last_frame: 0,
        last_callbacks: 0,
        retained: None,
    };
    (
        Fixture {
            output,
            _queue: queue.clone(),
        },
        queue,
    )
}
#[test]
fn clock_ready_then_arm_plays_at_queue_frames_and_stops_cleanly() {
    let (mut fixture, queue, mut writer, mut dry, mut worker) = make_fixture();
    let mut buffer = BufferFixture::new();
    assert!(fixture.arm().is_err());
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    assert_eq!(*buffer.pcm, [[0.; 2]; MAX_FRAMES]);
    let clock = fixture.report().clock.unwrap();
    assert_eq!(clock.anchor(), (BASE, 0));
    assert_eq!(fixture.report().queued_frames, 2048);
    queue.time(512);
    assert!(writer.push(0, BASE + 512, &[[0.5, -0.25]; 512]));
    assert_eq!(worker.step(), Step::Processed);
    dry.pop().unwrap();
    fixture.arm().unwrap();
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    assert_eq!(*buffer.pcm, [[0.; 2]; MAX_FRAMES]);
    queue.time(1024);
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    assert_eq!(*buffer.pcm, [[0.5, -0.25]; MAX_FRAMES]);
    assert_eq!(fixture.report().cue.played_frames, 512);
    fixture.close().unwrap();
    assert!(fixture.report().stopped);
    assert_eq!(queue.stops.load(Ordering::Acquire), 1);
    assert_eq!(queue.disposals.load(Ordering::Acquire), 1);
    assert_eq!(dry.status().fault(), None);
}
#[test]
fn discontinuity_missing_flags_backward_clock_drift_and_time_error_mute() {
    for mode in 0..5 {
        let (mut fixture, queue, _writer, _dry, _worker) = make_fixture();
        let mut buffer = BufferFixture::new();
        buffer.send(fixture.state.as_ref().unwrap(), &queue);
        match mode {
            0 => queue.discontinuity.store(true, Ordering::Release),
            1 => queue.stamp.lock().unwrap().flags = 1,
            2 => queue.stamp.lock().unwrap().host = BASE - 1,
            3 => {
                let mut time = queue.stamp.lock().unwrap();
                time.sample = 512.;
                time.host = BASE + 530;
            }
            _ => queue.time_error.store(-1, Ordering::Release),
        }
        *buffer.pcm = [[9.; 2]; MAX_FRAMES];
        buffer.send(fixture.state.as_ref().unwrap(), &queue);
        assert_eq!(*buffer.pcm, [[0.; 2]; MAX_FRAMES]);
        assert_eq!(fixture.report().fault, Some(Fault::Clock));
        assert!(fixture.poll_at(Instant::now(), |_| Ok(())).is_err());
        assert!(fixture.report().stopped);
        assert_eq!(queue.disposals.load(Ordering::Acquire), 1);
    }
}
#[test]
fn scheduler_underrun_cancels_only_cue_and_keeps_silent_output_until_stopped() {
    let (mut fixture, queue, mut writer, mut dry, mut worker) = make_fixture();
    let mut buffer = BufferFixture::new();
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    fixture.arm().unwrap();
    assert!(writer.push(0, BASE, &[[0.25, -0.5]; 128]));
    assert_eq!(worker.step(), Step::Processed);
    dry.pop().unwrap();
    for frame in [512, 1024, 1536] {
        queue.time(frame);
        buffer.send(fixture.state.as_ref().unwrap(), &queue);
    }
    let report = fixture.report();
    assert_eq!(report.fault, Some(Fault::Scheduler));
    assert_eq!(report.cue.fault, Some(output::Fault::Underrun));
    assert_eq!(*buffer.pcm, [[0.; 2]; MAX_FRAMES]);
    assert!(writer.push(128, BASE + 128, &[[0.5; 2]; 31]));
    assert_eq!(dry.pop().unwrap().samples().len(), 31);
    assert_eq!(dry.status().fault(), None);
    let previous = queue.enqueues.load(Ordering::Acquire);
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    assert_eq!(queue.enqueues.load(Ordering::Acquire), previous + 1);
    assert_eq!(*buffer.pcm, [[0.; 2]; MAX_FRAMES]);
    fixture.close().unwrap();
}
#[test]
fn layout_failure_and_enqueue_error_fault_without_touching_raw() {
    for mode in 0..3 {
        let (fixture, queue, _writer, dry, _worker) = make_fixture();
        let mut buffer = BufferFixture::new();
        match mode {
            0 => buffer.buffer.capacity -= 1,
            1 => buffer.buffer.data = std::ptr::null_mut(),
            _ => queue.enqueue_error.store(-1, Ordering::Release),
        }
        buffer.send(fixture.state.as_ref().unwrap(), &queue);
        assert_eq!(
            fixture.report().fault,
            Some(if mode < 2 {
                Fault::Layout
            } else {
                Fault::Queue
            })
        );
        assert_eq!(dry.status().fault(), None);
    }
}
#[test]
fn watchdog_detects_both_absent_callbacks_and_a_frozen_hardware_clock() {
    for callbacks in [false, true] {
        let (mut fixture, queue, _writer, _dry, _worker) = make_fixture();
        let mut buffer = BufferFixture::new();
        let now = fixture.progress;
        if callbacks {
            for _ in 0..3 {
                buffer.send(fixture.state.as_ref().unwrap(), &queue);
            }
        }
        assert!(fixture
            .poll_at(now + Duration::from_millis(500), |_| Ok(()))
            .is_ok());
        assert!(fixture
            .poll_at(now + Duration::from_secs(1), |_| Ok(()))
            .unwrap_err()
            .contains("stalled"));
        assert_eq!(fixture.report().fault, Some(Fault::Stalled));
        assert!(fixture.report().stopped);
    }
}
#[test]
fn stop_error_still_disposes_and_dispose_error_retains_state() {
    let (mut fixture, queue, _writer, _dry, _worker) = make_fixture();
    queue.stop_error.store(-1, Ordering::Release);
    assert!(fixture.close().is_err());
    assert_eq!(queue.disposals.load(Ordering::Acquire), 1);
    assert!(fixture.report().stopped);
    let (mut fixture, queue, _writer, _dry, _worker) = make_fixture();
    queue.dispose_error.store(-2, Ordering::Release);
    let state = queue.state.load(Ordering::Acquire) as *mut State;
    assert!(fixture.close().unwrap_err().contains("retained"));
    assert!(fixture.state.is_none());
    assert_eq!(fixture.report().fault, Some(Fault::Queue));
    assert!(!fixture.report().stopped);
    assert!(fixture.arm().is_err());
    drop(fixture);
    assert_eq!(queue.disposals.load(Ordering::Acquire), 1);
    // Fake queue has no registered OS callbacks: only the fixture can reclaim
    // this intentionally retained state after proving its own quiescence.
    unsafe {
        drop(Box::from_raw(state));
    }
}
#[test]
fn invalid_uid_and_inventory_checks_never_open_output_queues() {
    for device in list_outputs().unwrap() {
        assert!(!device.uid.is_empty());
        assert!(device.channels > 0);
        assert!(device.nominal_rate.is_finite());
    }
    let (_writer, _dry, cue) = input();
    let (_worker, output) = CueWorker::new(cue, Pass);
    assert!(Output::start("\0", output, config()).is_err());
}
struct Gate {
    entered: Barrier,
    leave: Barrier,
}
unsafe extern "C" fn blocked_current(
    queue: Queue,
    _: *const c_void,
    time: *mut Timestamp,
    _: *mut u8,
) -> i32 {
    let gate = &*queue.cast::<Gate>();
    gate.entered.wait();
    gate.leave.wait();
    *time = Timestamp {
        sample: 0.,
        host: BASE,
        flags: 3,
        ..Timestamp::default()
    };
    0
}
#[test]
fn overlapping_callbacks_never_borrow_the_same_pcm_or_state_twice() {
    let (_writer, _dry, cue) = input();
    let (_worker, output) = CueWorker::new(cue, Pass);
    let state: Arc<State> = Arc::from(
        State::new(
            output,
            config(),
            HostTimebase {
                numerator: 1_000_000_000,
                denominator: 48000,
            },
            Ops {
                enqueue,
                current: blocked_current,
                stop,
                dispose,
            },
        )
        .unwrap(),
    );
    state.phase.store(RUNNING, Ordering::Release);
    let gate = Arc::new(Gate {
        entered: Barrier::new(2),
        leave: Barrier::new(2),
    });
    // First callback blocks inside the time query with its mutable PCM borrow.
    // Overlap receives that SAME pointer; it must return before taking any borrow.
    let mut buffer = BufferFixture::new();
    let pointer = (&mut buffer.buffer as *mut Buffer) as usize;
    let (thread_state, thread_gate) = (state.clone(), gate.clone());
    let task = std::thread::spawn(move || unsafe {
        callback(
            (Arc::as_ptr(&thread_state) as *mut State).cast(),
            Arc::as_ptr(&thread_gate) as Queue,
            pointer as *mut Buffer,
        )
    });
    gate.entered.wait();
    unsafe {
        callback(
            (Arc::as_ptr(&state) as *mut State).cast(),
            Arc::as_ptr(&gate) as Queue,
            pointer as *mut Buffer,
        )
    };
    assert_eq!(state.report().fault, Some(Fault::Overlap));
    state.phase.store(FINISHING, Ordering::Release);
    gate.leave.wait();
    task.join().unwrap();
    assert_eq!(*buffer.pcm, [[0.; 2]; MAX_FRAMES]);
    assert!(!state.entered.load(Ordering::Acquire));
}

#[test]
fn device_loss_quiesces_output_and_hardware_progress_resets_watchdog() {
    let (mut fixture, queue, _writer, _dry, _worker) = make_fixture();
    let mut buffer = BufferFixture::new();
    let now = fixture.progress;
    queue.time(512);
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    fixture
        .poll_at(now + Duration::from_millis(500), |_| Ok(()))
        .unwrap();
    buffer.send(fixture.state.as_ref().unwrap(), &queue); // Callback alone isn't clock progress.
    fixture
        .poll_at(now + Duration::from_millis(1499), |_| Ok(()))
        .unwrap();
    assert!(fixture
        .poll_at(now + Duration::from_millis(1500), |_| Ok(()))
        .is_err());
    let (mut fixture, queue, _writer, _dry, _worker) = make_fixture();
    assert!(fixture
        .poll_at(Instant::now(), |output| {
            output.state.as_ref().unwrap().fail(Fault::Device);
            Err("Device unplugged".into())
        })
        .unwrap_err()
        .contains("unplugged"));
    assert!(fixture.report().stopped);
    assert_eq!(fixture.report().fault, Some(Fault::Device));
    assert_eq!(queue.disposals.load(Ordering::Acquire), 1);
}
#[test]
fn aborted_setup_without_queue_does_not_call_stop_or_dispose() {
    let (mut fixture, queue, _writer, _dry, _worker) = make_fixture();
    fixture.output.queue = std::ptr::null_mut();
    fixture
        .state
        .as_ref()
        .unwrap()
        .phase
        .store(PREPARING, Ordering::Release);
    fixture.close().unwrap();
    assert!(fixture.report().stopped);
    assert_eq!(queue.stops.load(Ordering::Acquire), 0);
    assert_eq!(queue.disposals.load(Ordering::Acquire), 0);
}

unsafe extern "C" fn finish_in_clock_query(
    queue: Queue,
    _: *const c_void,
    _: *mut Timestamp,
    _: *mut u8,
) -> i32 {
    let queue = &*queue.cast::<FakeQueue>();
    let state = &*(queue.state.load(Ordering::Acquire) as *const State);
    state.phase.store(FINISHING, Ordering::Release);
    state.cue_status[0].cancel();
    -1
}
#[test]
fn stop_during_clock_query_is_silent_without_spurious_clock_fault_or_reenqueue() {
    let (mut fixture, queue, _writer, _dry, _worker) = make_fixture();
    fixture.state.as_mut().unwrap().ops.current = finish_in_clock_query;
    let mut buffer = BufferFixture::new();
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    assert_eq!(*buffer.pcm, [[0.; 2]; MAX_FRAMES]);
    assert_eq!(fixture.report().fault, None);
    assert_eq!(queue.enqueues.load(Ordering::Acquire), 0);
    assert!(!fixture
        .state
        .as_ref()
        .unwrap()
        .entered
        .load(Ordering::Acquire));
    fixture.close().unwrap();
    assert!(fixture.report().stopped);
}

mod native_rack {
    use super::*;
    use crate::native_input::{
        plugins::PluginConfig,
        session::{
            self,
            cue::{CueConfig, StreamBudget},
            Outcome, Session,
        },
    };
    use std::{cell::RefCell, rc::Rc};
    struct CaptureState {
        writer: Option<InputWriter>,
        frames: u64,
    }
    struct Capture(Rc<RefCell<CaptureState>>);
    impl session::Capture for Capture {
        fn report(&self) -> session::Report {
            let state = self.0.borrow();
            session::Report {
                frames: state.frames,
                callbacks: state.frames / 128,
                fault: None,
                peaks: [0.25, 0.5],
            }
        }
        fn check_device(&self) -> Result<()> {
            Ok(())
        }
        fn finish(self) -> Result<session::Report> {
            self.0.borrow_mut().writer.take();
            Ok(self.report())
        }
    }
    impl Drop for Capture {
        fn drop(&mut self) {
            self.0.borrow_mut().writer.take();
        }
    }
    fn wait(mut check: impl FnMut() -> bool) {
        let deadline = Instant::now() + Duration::from_secs(5);
        while !check() {
            assert!(Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(1));
        }
    }
    fn qualify(id: &str, count: usize) {
        let root = tempfile::tempdir().unwrap();
        let state = Rc::new(RefCell::new(CaptureState {
            writer: None,
            frames: 0,
        }));
        let budget = StreamBudget::default();
        let (mut owner, cue) = Session::start_with_cue(
            root.path(),
            session::Config {
                channels: 2,
                max_frames: 48000,
                context: serde_json::json!({}),
                callback_timeout: Duration::from_secs(5),
            },
            CueConfig {
                plugins: (0..count)
                    .map(|_| PluginConfig {
                        id: id.into(),
                        state: String::new(),
                        parameters: serde_json::json!({}),
                        bypass: false,
                    })
                    .collect(),
                budget: budget.clone(),
                startup_timeout: Duration::from_secs(10),
            },
            |writer| {
                state.borrow_mut().writer = Some(writer);
                Ok(Capture(state.clone()))
            },
        )
        .unwrap();
        assert_eq!(budget.used(), count);
        {
            let mut state = state.borrow_mut();
            assert!(state
                .writer
                .as_mut()
                .unwrap()
                .push(0, BASE, &[[0.25, -0.5]; 128]));
            state.frames += 128;
        }
        wait(|| cue.queued_packets() == 1);
        let (mut output, queue) = make_output(cue);
        let mut buffer = BufferFixture::new();
        buffer.send(output.state.as_ref().unwrap(), &queue);
        output.arm().unwrap();
        queue.time(512);
        buffer.send(output.state.as_ref().unwrap(), &queue);
        assert_eq!(output.report().fault, Some(Fault::Scheduler));
        assert_eq!(output.report().cue.fault, Some(output::Fault::Underrun));
        assert_eq!(*buffer.pcm, [[0.; 2]; MAX_FRAMES]);
        wait(|| {
            owner.poll().unwrap();
            budget.used() == 0
        });
        for first in [128, 256] {
            let mut state = state.borrow_mut();
            assert!(state
                .writer
                .as_mut()
                .unwrap()
                .push(first, BASE + first, &[[0.25, -0.5]; 128]));
            state.frames += 128;
        }
        output.close().unwrap();
        assert_eq!(queue.disposals.load(Ordering::Acquire), 1);
        let Outcome::Complete(take) = owner.stop() else {
            panic!("Output fault must preserve dry recording")
        };
        assert_eq!(take.info.frames, 384);
        let pcm = hound::WavReader::open(take.path)
            .unwrap()
            .samples::<f32>()
            .map(|v| v.unwrap())
            .collect::<Vec<_>>();
        assert_eq!(pcm, [0.25, -0.5].repeat(384));
        assert_eq!(budget.used(), 0);
    }
    #[test]
    fn callback_scheduler_fault_reaps_real_au_helpers_and_preserves_dry_files() {
        let plugins = crate::apple::plugin("plugin-scan", "{}").unwrap();
        let id = plugins
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["name"] == "AUBandpass")
            .unwrap()["id"]
            .as_str()
            .unwrap();
        for count in [1, 2] {
            qualify(id, count);
        }
    }
    #[test]
    #[ignore = "Requires explicit SDK VST3 fixture folder"]
    fn callback_scheduler_fault_reaps_real_vst3_helpers_and_preserves_dry_files() {
        let folder = std::env::var("CRISPAUDIO_TEST_PLUGIN_FOLDER")
            .expect("Explicit SDK VST3 fixture folder");
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
            .unwrap();
        for count in [1, 2] {
            qualify(id, count);
        }
    }
}

#[test]
fn setup_failure_preserves_original_error_and_reports_failed_cleanup() {
    for mode in 0..3 {
        let (fixture, queue, _writer, _dry, _worker) = make_fixture();
        let Fixture { output, _queue } = fixture;
        output
            .state
            .as_ref()
            .unwrap()
            .phase
            .store(PREPARING, Ordering::Release);
        if mode == 1 {
            queue.stop_error.store(-1, Ordering::Release);
        }
        if mode == 2 {
            queue.dispose_error.store(-2, Ordering::Release);
        }
        let retained = queue.state.load(Ordering::Acquire) as *mut State;
        let reason = output
            .complete_setup(Err("Synthetic format setup failed".into()))
            .err()
            .unwrap();
        assert!(reason.contains("Synthetic format setup failed"));
        assert_eq!(reason.contains("cleanup failed"), mode != 0);
        assert_eq!(reason.contains("retained"), mode == 2);
        assert_eq!(queue.stops.load(Ordering::Acquire), 1);
        assert_eq!(queue.disposals.load(Ordering::Acquire), 1);
        if mode == 2 {
            unsafe {
                drop(Box::from_raw(retained));
            }
        }
    }
}

fn shared_fixture(
    cues: Vec<(CueOutput, mix::Controls)>,
    backing: Option<backing::Reader>,
) -> (Fixture, Arc<FakeQueue>) {
    let queue = Arc::new(FakeQueue::new());
    let state = State::shared(
        cues,
        backing,
        config(),
        HostTimebase {
            numerator: 1_000_000_000,
            denominator: 48000,
        },
        Ops {
            enqueue,
            current,
            stop,
            dispose,
        },
    )
    .unwrap();
    make_state(state, queue)
}
struct BackingTone;
impl backing::Renderer for BackingTone {
    fn render(&mut self, pcm: &mut [Stereo]) -> Result<()> {
        pcm.fill([0.25; 2]);
        Ok(())
    }
}
fn cue_blocks(value: f32) -> (CueOutput, InputWriter, Reader<DRY_SLOTS>, CueWorker<Pass>) {
    let (mut writer, mut dry, cue) = input();
    let (mut worker, output) = CueWorker::new(cue, Pass);
    for block in 0..3 {
        assert!(writer.push(block * 512, BASE + block * 512, &[[value; 2]; 512]));
        assert_eq!(worker.step(), Step::Processed);
        assert!(dry.pop().is_some());
    }
    (output, writer, dry, worker)
}
#[test]
fn shared_callback_mixes_backing_two_cues_and_atomic_ramped_controls() {
    let (one, _w1, _d1, _c1) = cue_blocks(1.);
    let (two, _w2, _d2, _c2) = cue_blocks(2.);
    let status = one.status();
    let controls = mix::Controls {
        gain: 1.,
        pan: 0.,
        mono: false,
    };
    let (mut backing, pcm) =
        backing::Worker::start(Duration::from_secs(1), |_| Ok((BackingTone, 1536))).unwrap();
    let (mut fixture, queue) = shared_fixture(vec![(one, controls), (two, controls)], Some(pcm));
    let mut buffer = BufferFixture::new();
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    assert_eq!(*buffer.pcm, [[0.; 2]; 512]);
    assert_eq!(fixture.report().first_mixed_frame, None);
    fixture.arm().unwrap();
    queue.time(512);
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    assert_eq!(*buffer.pcm, [[3.25; 2]; 512]);
    assert_eq!(fixture.report().fault, None);
    assert_eq!(fixture.report().first_mixed_frame, Some(2048));
    assert!(fixture.set_cue_controls(2, controls).is_err());
    assert!(fixture
        .set_cue_controls(
            0,
            mix::Controls {
                gain: f32::NAN,
                ..controls
            }
        )
        .is_err());
    fixture
        .set_cue_controls(
            0,
            mix::Controls {
                gain: 0.,
                ..controls
            },
        )
        .unwrap();
    queue.time(1024);
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    assert_eq!(buffer.pcm[0], [2.25 + 63. / 64.; 2]);
    assert_eq!(buffer.pcm[63..], [[2.25; 2]; 449]);
    // A failed cue lane does not cancel the second lane or prepared backing.
    status.cancel();
    queue.time(1536);
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    assert_eq!(*buffer.pcm, [[2.25; 2]; 512]);
    let report = fixture.report();
    assert_eq!(report.fault, None);
    assert!(report.cues[0].unwrap().fault.is_some());
    assert_eq!(report.cues[1].unwrap().fault, None);
    assert_eq!(report.cues[1].unwrap().played_frames, 1536);
    assert!(report.cues[2].is_none());
    fixture.close().unwrap();
    assert!(backing.poll().is_err());
    assert_eq!(queue.disposals.load(Ordering::Acquire), 1);
}
#[test]
fn shared_backing_failure_silences_all_lanes_and_closes_on_poll() {
    let (one, _w, _d, _c) = cue_blocks(1.);
    let status = one.status();
    let (backing, pcm) =
        backing::Worker::start(Duration::from_secs(1), |_| Ok((BackingTone, 16384))).unwrap();
    let (mut fixture, queue) = shared_fixture(
        vec![(
            one,
            mix::Controls {
                gain: 1.,
                pan: 0.,
                mono: false,
            },
        )],
        Some(pcm),
    );
    let mut buffer = BufferFixture::new();
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    fixture.arm().unwrap();
    drop(backing);
    queue.time(512);
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    assert_eq!(*buffer.pcm, [[0.; 2]; 512]);
    assert_eq!(fixture.report().fault, Some(Fault::Backing));
    assert!(status.fault().is_some());
    assert!(fixture.poll_at(Instant::now(), |_| Ok(())).is_err());
    assert_eq!(queue.disposals.load(Ordering::Acquire), 1);
}
#[test]
fn shared_backing_only_output_binds_without_a_dummy_cue() {
    let (_backing, pcm) =
        backing::Worker::start(Duration::from_secs(1), |_| Ok((BackingTone, 513))).unwrap();
    let (mut fixture, queue) = shared_fixture(vec![], Some(pcm));
    let mut buffer = BufferFixture::new();
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    fixture.arm().unwrap();
    queue.time(512);
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    assert_eq!(*buffer.pcm, [[0.25; 2]; 512]);
    assert!(fixture.report().cues.iter().all(Option::is_none));
    queue.time(1024);
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    assert_eq!(buffer.pcm[0], [0.25; 2]);
    assert_eq!(buffer.pcm[1..], [[0.; 2]; 511]);
    queue.time(1536);
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    assert_eq!(*buffer.pcm, [[0.; 2]; 512]);
    assert_eq!(fixture.report().fault, None);
    fixture.close().unwrap();
}

#[test]
fn live_monitor_levels_are_independent_ramped_and_muted_before_first_pcm() {
    let (cue, mut writer, mut dry, mut worker) = cue_blocks(1.);
    let (_backing, pcm) =
        backing::Worker::start(Duration::from_secs(1), |_| Ok((BackingTone, 8192))).unwrap();
    let (mut fixture, queue) = shared_fixture(
        vec![(
            cue,
            mix::Controls {
                gain: 1.,
                pan: 0.,
                mono: false,
            },
        )],
        Some(pcm),
    );
    let mut buffer = BufferFixture::new();
    fixture
        .set_monitor_levels(MonitorLevels {
            backing: 1.,
            output: 0.,
        })
        .unwrap();
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    fixture.arm().unwrap();
    queue.time(512);
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    assert_eq!(*buffer.pcm, [[0.; 2]; 512]);
    // The cue and backing clocks advanced normally while globally muted.
    assert_eq!(fixture.report().cues[0].unwrap().played_frames, 512);
    fixture
        .set_monitor_levels(MonitorLevels {
            backing: 0.,
            output: 1.,
        })
        .unwrap();
    queue.time(1024);
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    assert!((buffer.pcm[0][0] - (1. + 0.25 * 63. / 64.) / 64.).abs() < 1e-6);
    assert_eq!(buffer.pcm[63..], [[1.; 2]; 449]);
    // Backing attenuation did not alter cue level. Global attenuation affects both.
    fixture
        .set_monitor_levels(MonitorLevels {
            backing: 1.,
            output: 0.5,
        })
        .unwrap();
    queue.time(1536);
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    assert_eq!(buffer.pcm[63..], [[0.625; 2]; 449]);
    assert_eq!(fixture.report().fault, None);
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
        assert!(fixture.set_monitor_levels(levels).is_err());
    }
    assert!(writer.push(1536, BASE + 1536, &[[1.; 2]; 512]));
    assert_eq!(worker.step(), Step::Processed);
    let raw = dry.pop().unwrap();
    assert!(raw.samples().iter().all(|sample| *sample == [1.; 2]));
    queue.time(2048);
    buffer.send(fixture.state.as_ref().unwrap(), &queue);
    assert_eq!(*buffer.pcm, [[0.625; 2]; 512]);
    fixture.close().unwrap();
    assert!(fixture
        .set_monitor_levels(MonitorLevels::default())
        .is_err());
}
