use super::*;
use crate::native_input::{input, Reader};
use std::sync::{atomic::AtomicI32, Arc, Barrier, Mutex};

struct Fixture {
    _pcm: Vec<f32>,
    buffer: Buffer,
    time: Timestamp,
}
impl Fixture {
    fn new(channels: usize, frames: usize, sample: f64, host: u64) -> Self {
        let mut pcm = vec![0f32; MAX_FRAMES * channels];
        for frame in 0..frames {
            for channel in 0..channels {
                pcm[frame * channels + channel] = frame as f32 * 0.001 + channel as f32 * 0.1;
            }
        }
        let buffer = Buffer {
            capacity: (pcm.len() * 4) as u32,
            data: pcm.as_mut_ptr().cast(),
            size: (frames * channels * 4) as u32,
            user: std::ptr::null_mut(),
            packet_capacity: 0,
            packets: std::ptr::null_mut(),
            packet_count: 0,
        };
        Self {
            _pcm: pcm,
            buffer,
            time: Timestamp {
                sample,
                host,
                flags: 3,
                ..Timestamp::default()
            },
        }
    }
    fn send(&mut self, state: &State, queue: &FakeQueue) {
        unsafe {
            callback(
                (state as *const State as *mut State).cast(),
                queue.pointer(),
                &mut self.buffer,
                &self.time,
                0,
                std::ptr::null(),
            );
        }
    }
}
#[derive(Default)]
struct FakeQueue {
    enqueues: AtomicUsize,
    stops: AtomicUsize,
    disposals: AtomicUsize,
    enqueue_error: AtomicI32,
    stop_error: AtomicI32,
    dispose_error: AtomicI32,
    state: AtomicUsize,
    pending: Mutex<Option<Fixture>>,
}
impl FakeQueue {
    fn pointer(&self) -> Queue {
        (self as *const Self as *mut Self).cast()
    }
}
unsafe extern "C" fn enqueue(queue: Queue, _: *mut Buffer, _: u32, _: *const c_void) -> i32 {
    let queue = &*queue.cast::<FakeQueue>();
    queue.enqueues.fetch_add(1, Ordering::Relaxed);
    queue.enqueue_error.load(Ordering::Relaxed)
}
unsafe extern "C" fn stop(queue: Queue, immediate: u8) -> i32 {
    assert_eq!(immediate, 1);
    let queue = &*queue.cast::<FakeQueue>();
    queue.stops.fetch_add(1, Ordering::Relaxed);
    let state = &*(queue.state.load(Ordering::Relaxed) as *const State);
    if let Some(mut pending) = queue.pending.lock().unwrap().take() {
        pending.send(state, queue);
    }
    queue.stop_error.load(Ordering::Relaxed)
}
unsafe extern "C" fn dispose(queue: Queue, immediate: u8) -> i32 {
    assert_eq!(immediate, 1);
    let queue = &*queue.cast::<FakeQueue>();
    queue.disposals.fetch_add(1, Ordering::Relaxed);
    let state = &*(queue.state.load(Ordering::Relaxed) as *const State);
    // Userdata and producer remain alive throughout synchronous disposal.
    assert!((*state.data.get()).writer.is_some());
    assert!([FINISHING, ABORTING].contains(&state.phase.load(Ordering::Acquire)));
    queue.dispose_error.load(Ordering::Relaxed)
}
// The fake queue must outlive Capture, including assertion unwinding. The real
// queue owns its resources until Dispose; model that ownership explicitly.
struct CaptureFixture {
    capture: Capture,
    _queue: Arc<FakeQueue>,
}
impl std::ops::Deref for CaptureFixture {
    type Target = Capture;
    fn deref(&self) -> &Capture {
        &self.capture
    }
}
impl CaptureFixture {
    fn finish(self) -> Result<InputReport> {
        self.capture.finish()
    }
}
fn fixture(
    channels: u32,
    map: ChannelMap,
) -> (
    CaptureFixture,
    Arc<FakeQueue>,
    Reader<DRY_SLOTS>,
    Reader<CUE_SLOTS>,
) {
    let (writer, dry, cue) = input();
    let state = State::new(writer, channels, map, enqueue).unwrap();
    state.phase.store(RUNNING, Ordering::Release);
    let queue = Arc::new(FakeQueue::default());
    queue
        .state
        .store((&*state as *const State) as usize, Ordering::Relaxed);
    let capture = Capture {
        queue: queue.pointer(),
        state: Some(state),
        device: InputDevice {
            uid: "fixture".into(),
            label: "Synthetic input".into(),
            channels,
            nominal_rate: RATE,
            is_default: false,
        },
        ops: QueueOps { stop, dispose },
    };
    (
        CaptureFixture {
            capture,
            _queue: queue.clone(),
        },
        queue,
        dry,
        cue,
    )
}
#[test]
fn sdk_struct_layout_and_host_timebase_are_explicit() {
    assert_eq!(std::mem::size_of::<Format>(), 40);
    assert_eq!(std::mem::size_of::<Buffer>(), 56);
    assert_eq!(std::mem::size_of::<Timestamp>(), 64);
    assert_eq!(std::mem::offset_of!(Buffer, data), 8);
    assert_eq!(std::mem::offset_of!(Buffer, size), 16);
    assert_eq!(std::mem::offset_of!(Buffer, user), 24);
    assert_eq!(std::mem::offset_of!(Buffer, packets), 40);
    assert_eq!(std::mem::offset_of!(Timestamp, host), 8);
    assert_eq!(std::mem::offset_of!(Timestamp, flags), 56);
    assert!(Format::input(2).valid(2));
    assert!(!Format::input(2).valid(1));
    assert_eq!(
        HostTimebase {
            numerator: 125,
            denominator: 3
        }
        .seconds(24_000_000),
        1.
    );
    assert!(HostTimebase::current().unwrap().seconds(1) > 0.);
    assert!(microphone_permission().is_ok()); // Query only; never starts capture.
}
#[test]
fn permission_and_invalid_uid_preflight_never_open_a_queue() {
    for permission in [
        Permission::Undetermined,
        Permission::Restricted,
        Permission::Denied,
    ] {
        assert!(ensure_authorized(permission).is_err());
    }
    assert!(ensure_authorized(Permission::Authorized).is_ok());
    let (writer, dry, cue) = input();
    // NUL is rejected before enumeration even if this test process is authorized.
    assert!(Capture::start("\0", ChannelMap::Mono(0), writer).is_err());
    assert!(dry.status().closed());
    assert!(cue.status().closed());
    assert_eq!(dry.status().fault(), Some(Fault::Device));
}
#[test]
fn failure_before_queue_creation_closes_producer_without_disposal() {
    let (mut capture, queue, dry, _) = fixture(1, ChannelMap::Mono(0));
    capture.capture.queue = std::ptr::null_mut();
    capture
        .state
        .as_ref()
        .unwrap()
        .phase
        .store(PREPARING, Ordering::Release);
    drop(capture);
    assert!(dry.status().closed());
    assert_eq!(dry.status().fault(), Some(Fault::Device));
    assert_eq!(queue.stops.load(Ordering::Relaxed), 0);
    assert_eq!(queue.disposals.load(Ordering::Relaxed), 0);
}
#[test]
fn selected_channels_and_raw_meter_keep_clock_and_headroom() {
    for (channels, map, indices) in [
        (1, ChannelMap::Mono(0), [0, 0]),
        (2, ChannelMap::Mono(1), [1, 1]),
        (2, ChannelMap::Stereo(1, 0), [1, 0]),
        (32, ChannelMap::Stereo(31, 0), [31, 0]),
    ] {
        let (capture, queue, mut dry, mut cue) = fixture(channels, map);
        let state = capture.state.as_ref().unwrap();
        let mut first = 0;
        for (index, frames) in [512, 128, 1, 379].into_iter().enumerate() {
            // Fractional/negative device origin normalizes to a zero input clock.
            let mut input = Fixture::new(
                channels as usize,
                frames,
                -128.25 + first as f64,
                100 + index as u64 * 1000,
            );
            input.send(state, &queue);
            let raw = dry.pop().unwrap();
            let cue = cue.pop().unwrap();
            assert_eq!((raw.first_frame, raw.host_time), (first, input.time.host));
            assert_eq!(raw.samples().len(), frames);
            assert_eq!(cue.samples(), raw.samples());
            for (frame, sample) in raw.samples().iter().enumerate() {
                assert_eq!(
                    *sample,
                    [
                        input._pcm[frame * channels as usize + indices[0]],
                        input._pcm[frame * channels as usize + indices[1]]
                    ]
                );
            }
            first += frames as u64;
        }
        let report = capture.report();
        assert_eq!(report.frames, 1020);
        assert_eq!(report.callbacks, 4);
        assert_eq!(report.fault, None);
        assert!((report.peaks[0] - (0.378 + indices[0] as f32 * 0.1)).abs() < 1e-6);
        assert_eq!(queue.enqueues.load(Ordering::Relaxed), 4);
        capture.finish().unwrap();
        assert!(dry.status().closed());
        assert_eq!(dry.status().fault(), None);
    }
    assert!(ChannelMap::Mono(1).indices(1).is_err());
    assert!(ChannelMap::Stereo(0, 32).indices(32).is_err());
    assert!(ChannelMap::Mono(0).indices(0).is_err());
}
#[test]
fn malformed_callbacks_fault_both_paths_without_publishing_or_reenqueuing() {
    for mode in 0..10 {
        let (capture, queue, mut dry, mut cue) = fixture(2, ChannelMap::Stereo(0, 1));
        let state = capture.state.as_ref().unwrap();
        let mut input = Fixture::new(2, 128, 0., 100);
        match mode {
            0 => input.buffer.capacity -= 4,
            1 => input.buffer.size = input.buffer.capacity + 4,
            2 => input.buffer.size = 7,
            3 => input.buffer.data = std::ptr::null_mut(),
            4 => input.buffer.data = unsafe { input.buffer.data.cast::<u8>().add(1) }.cast(),
            5 => input.buffer.size = 0,
            6 => input.time.sample = f64::NAN,
            7 => input.time.flags = 1,
            8 => input._pcm[0] = f32::INFINITY,
            9 => input.time.sample = (1u64 << 52) as f64,
            _ => unreachable!(),
        }
        input.send(state, &queue);
        assert_eq!(
            capture.report().fault,
            Some(Fault::InvalidInput),
            "mode {mode}"
        );
        assert_eq!(capture.report().frames, 0);
        assert!(dry.pop().is_none());
        assert!(cue.pop().is_none());
        assert_eq!(queue.enqueues.load(Ordering::Relaxed), 0);
        assert!(!state.entered.load(Ordering::Acquire));
    }
}
#[test]
fn null_buffer_timestamp_and_compressed_descriptions_are_rejected() {
    for mode in 0..3 {
        let (capture, queue, mut dry, _) = fixture(1, ChannelMap::Mono(0));
        let state = capture.state.as_ref().unwrap();
        let mut input = Fixture::new(1, 128, 0., 100);
        unsafe {
            callback(
                (&**state as *const State as *mut State).cast(),
                queue.pointer(),
                if mode == 0 {
                    std::ptr::null_mut()
                } else {
                    &mut input.buffer
                },
                if mode == 1 {
                    std::ptr::null()
                } else {
                    &input.time
                },
                0,
                if mode == 2 {
                    &input.time as *const Timestamp as *const c_void
                } else {
                    std::ptr::null()
                },
            );
        }
        assert_eq!(capture.report().fault, Some(Fault::InvalidInput));
        assert!(dry.pop().is_none());
    }
}
#[test]
fn missing_repeated_and_reversed_clock_blocks_latch_incomplete_take() {
    for (sample, host) in [(127., 200), (129., 200), (0., 200), (128., 100), (128., 99)] {
        let (capture, queue, mut dry, mut cue) = fixture(1, ChannelMap::Mono(0));
        let state = capture.state.as_ref().unwrap();
        Fixture::new(1, 128, 0., 100).send(state, &queue);
        dry.pop().unwrap();
        cue.pop().unwrap();
        Fixture::new(1, 128, sample, host).send(state, &queue);
        assert_eq!(capture.report().fault, Some(Fault::Discontinuous));
        assert_eq!(capture.report().frames, 128);
        assert!(dry.pop().is_none());
        assert!(cue.pop().is_none());
        assert_eq!(queue.enqueues.load(Ordering::Relaxed), 1);
    }
}
#[test]
fn cue_fault_does_not_stop_callback_but_dry_overflow_does() {
    let (capture, queue, mut dry, cue) = fixture(1, ChannelMap::Mono(0));
    let state = capture.state.as_ref().unwrap();
    cue.status().cancel();
    for frame in 0..100 {
        Fixture::new(1, 1, frame as f64, 100 + frame).send(state, &queue);
        assert_eq!(dry.pop().unwrap().first_frame, frame);
    }
    assert_eq!(capture.report().fault, None);
    assert_eq!(capture.report().frames, 100);
    assert_eq!(queue.enqueues.load(Ordering::Relaxed), 100);
    for frame in 100..100 + DRY_SLOTS as u64 + 1 {
        Fixture::new(1, 1, frame as f64, 100 + frame).send(state, &queue);
    }
    assert_eq!(capture.report().fault, Some(Fault::Overflow));
    assert_eq!(capture.report().frames, 100 + DRY_SLOTS as u64);
    assert_eq!(queue.enqueues.load(Ordering::Relaxed), 100 + DRY_SLOTS);
    let mut count = 0;
    while dry.pop().is_some() {
        count += 1;
    }
    assert_eq!(count, DRY_SLOTS);
}
#[test]
fn finish_keeps_partial_tail_and_drops_producer_after_synchronous_disposal() {
    let (capture, queue, mut dry, _) = fixture(1, ChannelMap::Mono(0));
    let state = capture.state.as_ref().unwrap();
    Fixture::new(1, 128, -256., 100).send(state, &queue);
    *queue.pending.lock().unwrap() = Some(Fixture::new(1, 31, -128., 200));
    let report = capture.finish().unwrap();
    assert_eq!(report.frames, 159);
    assert_eq!(report.fault, None);
    assert_eq!(queue.stops.load(Ordering::Relaxed), 1);
    assert_eq!(queue.disposals.load(Ordering::Relaxed), 1);
    assert_eq!(queue.enqueues.load(Ordering::Relaxed), 1);
    assert!(dry.status().closed());
    assert_eq!(dry.pop().unwrap().samples().len(), 128);
    let tail = dry.pop().unwrap();
    assert_eq!(tail.first_frame, 128);
    assert_eq!(tail.samples().len(), 31);
    assert!(dry.pop().is_none());
}
#[test]
fn abort_setup_failure_and_stop_errors_preserve_recoverable_prefix() {
    for mode in 0..3 {
        let (capture, queue, mut dry, _) = fixture(1, ChannelMap::Mono(0));
        let state = capture.state.as_ref().unwrap();
        Fixture::new(1, 128, 0., 100).send(state, &queue);
        *queue.pending.lock().unwrap() = Some(Fixture::new(1, 31, 128., 200));
        match mode {
            0 => {
                drop(capture);
                assert_eq!(dry.status().fault(), Some(Fault::Cancelled));
            }
            1 => {
                state.phase.store(PREPARING, Ordering::Release);
                drop(capture);
                assert_eq!(dry.status().fault(), Some(Fault::Device));
            }
            2 => {
                queue.stop_error.store(-1, Ordering::Relaxed);
                assert!(capture.finish().is_err());
                assert_eq!(dry.status().fault(), Some(Fault::Device));
            }
            _ => unreachable!(),
        }
        assert!(dry.status().closed());
        assert_eq!(dry.pop().unwrap().samples().len(), 128);
        if mode == 2 {
            assert_eq!(dry.pop().unwrap().samples().len(), 31);
        }
        assert!(dry.pop().is_none());
        assert_eq!(queue.stops.load(Ordering::Relaxed), 1);
        assert_eq!(queue.disposals.load(Ordering::Relaxed), 1);
    }
}
#[test]
fn failed_disposal_retains_userdata_for_late_callbacks() {
    let (capture, queue, mut dry, _) = fixture(1, ChannelMap::Mono(0));
    queue.dispose_error.store(-2, Ordering::Relaxed);
    assert!(capture.finish().is_err());
    assert_eq!(dry.status().fault(), Some(Fault::Device));
    assert!(!dry.status().closed()); // Userdata deliberately retained, not freed.
    let pointer = queue.state.load(Ordering::Relaxed) as *mut State;
    let state = unsafe { &*pointer };
    Fixture::new(1, 128, 0., 100).send(state, &queue); // Must ignore late callbacks.
    assert!(dry.pop().is_none());
    // Our fake API is now known quiescent; reclaim the intentionally leaked box.
    unsafe {
        drop(Box::from_raw(pointer));
    }
    assert!(dry.status().closed());
}
#[test]
fn enqueue_error_retains_current_packet_and_stops_future_publication() {
    let (capture, queue, mut dry, _) = fixture(1, ChannelMap::Mono(0));
    let state = capture.state.as_ref().unwrap();
    queue.enqueue_error.store(-3, Ordering::Relaxed);
    Fixture::new(1, 128, 0., 100).send(state, &queue);
    assert_eq!(capture.report().fault, Some(Fault::Device));
    assert_eq!(dry.pop().unwrap().samples().len(), 128);
    Fixture::new(1, 128, 128., 200).send(state, &queue);
    assert!(dry.pop().is_none());
    assert_eq!(capture.report().peaks, [0.; 2]);
}
struct Gate {
    entered: Barrier,
    leave: Barrier,
}
unsafe extern "C" fn blocked_enqueue(
    queue: Queue,
    _: *mut Buffer,
    _: u32,
    _: *const c_void,
) -> i32 {
    let gate = &*queue.cast::<Gate>();
    gate.entered.wait();
    gate.leave.wait();
    0
}
#[test]
fn overlapping_callbacks_fault_without_aliasing_input_writer() {
    let (writer, mut dry, _) = input();
    let state = Arc::from(State::new(writer, 1, ChannelMap::Mono(0), blocked_enqueue).unwrap());
    let state: Arc<State> = state;
    state.phase.store(RUNNING, Ordering::Release);
    let gate = Arc::new(Gate {
        entered: Barrier::new(2),
        leave: Barrier::new(2),
    });
    let worker_state = state.clone();
    let worker_gate = gate.clone();
    let task = std::thread::spawn(move || {
        let mut input = Fixture::new(1, 128, 0., 100);
        unsafe {
            callback(
                (Arc::as_ptr(&worker_state) as *mut State).cast(),
                Arc::as_ptr(&worker_gate) as Queue,
                &mut input.buffer,
                &input.time,
                0,
                std::ptr::null(),
            );
        }
    });
    gate.entered.wait();
    let mut input = Fixture::new(1, 128, 128., 200);
    unsafe {
        callback(
            (Arc::as_ptr(&state) as *mut State).cast(),
            Arc::as_ptr(&gate) as Queue,
            &mut input.buffer,
            &input.time,
            0,
            std::ptr::null(),
        );
    }
    gate.leave.wait();
    task.join().unwrap();
    assert_eq!(state.report().fault, Some(Fault::Device));
    assert_eq!(state.report().peaks, [0.; 2]);
    assert_eq!(state.report().frames, 128);
    assert_eq!(dry.pop().unwrap().first_frame, 0);
    assert!(dry.pop().is_none());
    assert!(!state.entered.load(Ordering::Acquire));
}
