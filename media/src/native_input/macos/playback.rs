//! App-local output for native recording; physical qualification remains pending. Start/arm/poll/stop/drop only on its creating control thread.
pub use super::devices::{list_outputs, OutputDevice};
use super::*;
use crate::native_input::{
    backing, mix,
    output::{self, ClockMap, Scheduler},
    CueOutput,
};
use std::{
    sync::atomic::{AtomicI64, AtomicPtr},
    time::{Duration, Instant},
};
const BYTES: u32 = (MAX_FRAMES * 2 * 4) as u32;
const PRIME_FRAMES: i64 = (MAX_FRAMES * 3) as i64;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(usize)]
pub enum Fault {
    Layout = 1,
    Overlap = 2,
    Queue = 3,
    Clock = 4,
    Device = 5,
    Stalled = 6,
    Scheduler = 7,
    Setup = 8,
    Mixer = 9,
    Backing = 10,
}
#[derive(Clone, Copy)]
pub struct Config {
    pub delay_frames: u32,
    pub startup_grace_frames: u32,
    pub max_input_drift_frames: u32,
    pub max_output_drift_frames: u32,
    pub watchdog_timeout: Duration,
}
#[derive(Clone, Copy, Debug)]
pub struct Report {
    pub callbacks: u64,
    pub queued_frames: u64,
    pub hardware_frame: i64,
    pub clock: Option<ClockMap>,
    pub armed: bool,
    /// Queue-relative first mixed frame, distinct from the initial clock anchor.
    pub first_mixed_frame: Option<i64>,
    pub stopped: bool,
    pub fault: Option<Fault>,
    /// First lane (legacy cue-only reports); use cues for a shared mix.
    pub cue: output::Report,
    pub cues: [Option<output::Report>; mix::MAX_INPUTS],
}
type CurrentTime = unsafe extern "C" fn(Queue, *const c_void, *mut Timestamp, *mut u8) -> i32;
#[derive(Clone, Copy)]
struct Ops {
    enqueue: Enqueue,
    current: CurrentTime,
    stop: unsafe extern "C" fn(Queue, u8) -> i32,
    dispose: unsafe extern "C" fn(Queue, u8) -> i32,
}
#[link(name = "AudioToolbox", kind = "framework")]
extern "C" {
    fn AudioQueueNewOutput(
        format: *const Format,
        callback: unsafe extern "C" fn(*mut c_void, Queue, *mut Buffer),
        user: *mut c_void,
        run_loop: *const c_void,
        mode: *const c_void,
        flags: u32,
        queue: *mut Queue,
    ) -> i32;
    fn AudioQueueCreateTimeline(queue: Queue, timeline: *mut *const c_void) -> i32;
    fn AudioQueueGetCurrentTime(
        queue: Queue,
        timeline: *const c_void,
        time: *mut Timestamp,
        discontinuity: *mut u8,
    ) -> i32;
}
/// Monitor-only attenuation, independent of the saved graph and dry files.
#[derive(Clone, Copy, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct MonitorLevels {
    pub backing: f32,
    pub output: f32,
}
impl Default for MonitorLevels {
    fn default() -> Self {
        Self {
            backing: 1.,
            output: 1.,
        }
    }
}
impl MonitorLevels {
    pub fn validate(self) -> Result<()> {
        if [self.backing, self.output]
            .iter()
            .any(|value| !value.is_finite() || !(0. ..=1.).contains(value))
        {
            Err("Invalid native monitor levels".into())
        } else {
            Ok(())
        }
    }
    fn bits(self) -> u64 {
        self.backing.to_bits() as u64 | ((self.output.to_bits() as u64) << 32)
    }
    fn from_bits(bits: u64) -> Self {
        Self {
            backing: f32::from_bits(bits as u32),
            output: f32::from_bits((bits >> 32) as u32),
        }
    }
}
struct Ramp {
    current: f32,
    target: f32,
    remaining: usize,
}
impl Ramp {
    fn new(value: f32) -> Self {
        Self {
            current: value,
            target: value,
            remaining: 0,
        }
    }
    fn set(&mut self, value: f32) {
        if value != self.target {
            self.target = value;
            self.remaining = 64;
        }
    }
    fn next(&mut self) -> f32 {
        if self.remaining > 0 {
            self.current += (self.target - self.current) / self.remaining as f32;
            self.remaining -= 1;
            if self.remaining == 0 {
                self.current = self.target;
            }
        }
        self.current
    }
}
struct MonitorRamps {
    backing: Ramp,
    output: Ramp,
}
impl MonitorRamps {
    fn new(levels: MonitorLevels) -> Self {
        Self {
            backing: Ramp::new(levels.backing),
            output: Ramp::new(levels.output),
        }
    }
    fn set(&mut self, levels: MonitorLevels) {
        self.backing.set(levels.backing);
        self.output.set(levels.output);
    }
}
enum RenderSource {
    Cue(Scheduler),
    Shared {
        mixer: mix::Mixer,
        backing: Option<backing::Reader>,
        pcm: [crate::native_graph::Stereo; MAX_FRAMES],
        applied: [u64; mix::MAX_INPUTS],
    },
}
fn control_bits(control: mix::Controls) -> u64 {
    (control.gain.to_bits() as u64 & 0x7fff_ffff)
        | ((control.mono as u64) << 31)
        | ((control.pan.to_bits() as u64) << 32)
}
fn controls(bits: u64) -> mix::Controls {
    mix::Controls {
        gain: f32::from_bits(bits as u32 & 0x7fff_ffff),
        mono: bits & (1 << 31) != 0,
        pan: f32::from_bits((bits >> 32) as u32),
    }
}
impl RenderSource {
    fn bind(&mut self, clock: ClockMap, start: i64) -> std::result::Result<(), output::Fault> {
        match self {
            Self::Cue(cue) => cue.bind_clock(clock, start),
            Self::Shared { mixer, .. } => mixer.bind_clock(clock, start),
        }
    }
    fn render(
        &mut self,
        first: i64,
        output: &mut [crate::native_graph::Stereo],
        state: &State,
        backing_gain: &mut Ramp,
    ) -> std::result::Result<(), Fault> {
        match self {
            Self::Cue(cue) => {
                let report = cue.render(first, output);
                state.save_lane(0, report);
                if report.fault.is_some() {
                    return Err(Fault::Scheduler);
                }
            }
            Self::Shared {
                mixer,
                backing,
                pcm,
                applied,
            } => {
                for (index, previous) in applied.iter_mut().enumerate().take(mixer.cue_count()) {
                    let bits = state.controls[index].load(Ordering::Acquire);
                    if *previous != bits {
                        mixer
                            .set_controls(index, controls(bits))
                            .map_err(|_| Fault::Mixer)?;
                        *previous = bits;
                    }
                }
                let backing = if let Some(reader) = backing {
                    reader
                        .render(&mut pcm[..output.len()])
                        .map_err(|_| Fault::Backing)?;
                    for sample in &mut pcm[..output.len()] {
                        let gain = backing_gain.next();
                        sample[0] *= gain;
                        sample[1] *= gain;
                    }
                    mix::Backing::Audio {
                        first_frame: first,
                        samples: &pcm[..output.len()],
                    }
                } else {
                    mix::Backing::Silent
                };
                mixer.render(first, backing, output);
                for index in 0..mixer.cue_count() {
                    state.save_lane(index, mixer.cue_report(index).unwrap());
                }
                if mixer.fault().is_some() {
                    return Err(Fault::Mixer);
                }
            }
        }
        Ok(())
    }
}
struct LaneReport {
    phase: AtomicUsize,
    fault: AtomicUsize,
    played: AtomicU64,
    drift: AtomicI64,
}
impl LaneReport {
    fn new() -> Self {
        Self {
            phase: AtomicUsize::new(0),
            fault: AtomicUsize::new(0),
            played: AtomicU64::new(0),
            drift: AtomicI64::new(0),
        }
    }
    fn get(&self) -> output::Report {
        output::Report {
            phase: match self.phase.load(Ordering::Acquire) {
                0 => output::Phase::Waiting,
                1 => output::Phase::Running,
                2 => output::Phase::Ended,
                _ => output::Phase::Fault,
            },
            fault: decode(self.fault.load(Ordering::Acquire)),
            copied_frames: 0,
            played_frames: self.played.load(Ordering::Acquire),
            drift_frames: self.drift.load(Ordering::Acquire),
        }
    }
}
struct Data {
    monitor: MonitorRamps,
    source: RenderSource,
    next: i64,
    clock: Option<ClockMap>,
    last: Option<(f64, u64)>,
    bound: bool,
}
struct State {
    data: UnsafeCell<Data>,
    entered: AtomicBool,
    phase: AtomicUsize,
    armed: AtomicBool,
    cue_status: Vec<Status<CUE_SLOTS>>,
    backing_status: Option<Status<{ backing::SLOTS }>>,
    shared: bool,
    controls: [AtomicU64; mix::MAX_INPUTS],
    monitor_levels: AtomicU64,
    lanes: [LaneReport; mix::MAX_INPUTS],
    ops: Ops,
    timeline: AtomicPtr<c_void>,
    timebase: HostTimebase,
    tolerance: u32,
    callbacks: AtomicU64,
    queued: AtomicU64,
    hardware: AtomicI64,
    anchor_ready: AtomicBool,
    mixed_ready: AtomicBool,
    mixed_frame: AtomicI64,
    anchor_host: AtomicU64,
    anchor_frame: AtomicI64,
    fault: AtomicUsize,
}
// The atomic entered guard grants exclusive callback access to Data. Control
// accesses Data only before registration or AFTER synchronous Dispose quiesces
// callbacks. Report/arm/fault use atomics only. The timeline is immutable while
// running; AudioQueue owns it until disposal. No Data references escape.
unsafe impl Sync for State {}
fn encode(fault: Option<output::Fault>) -> usize {
    use output::Fault as F;
    match fault {
        None => 0,
        Some(F::Cancelled) => 1,
        Some(F::InvalidBuffer) => 2,
        Some(F::OutputClock) => 3,
        Some(F::InputClock) => 4,
        Some(F::ClockRange) => 5,
        Some(F::Drift) => 6,
        Some(F::StartupTimeout) => 7,
        Some(F::Late) => 8,
        Some(F::Underrun) => 9,
        Some(F::PacketBudget) => 10,
        Some(F::Upstream(fault)) => 16 + fault as usize,
    }
}
fn decode(code: usize) -> Option<output::Fault> {
    use output::Fault as F;
    Some(match code {
        0 => return None,
        1 => F::Cancelled,
        2 => F::InvalidBuffer,
        3 => F::OutputClock,
        4 => F::InputClock,
        5 => F::ClockRange,
        6 => F::Drift,
        7 => F::StartupTimeout,
        8 => F::Late,
        9 => F::Underrun,
        10 => F::PacketBudget,
        17 => F::Upstream(super::Fault::Overflow),
        18 => F::Upstream(super::Fault::InvalidInput),
        19 => F::Upstream(super::Fault::Discontinuous),
        20 => F::Upstream(super::Fault::Disconnected),
        21 => F::Upstream(super::Fault::Processor),
        22 => F::Upstream(super::Fault::Cancelled),
        23 => F::Upstream(super::Fault::Device),
        _ => F::Upstream(super::Fault::Storage),
    })
}
impl State {
    fn new(cue: CueOutput, config: Config, timebase: HostTimebase, ops: Ops) -> Result<Box<Self>> {
        if config.watchdog_timeout.is_zero()
            || !(1..=MAX_FRAMES as u32).contains(&config.max_output_drift_frames)
        {
            return Err("Invalid native output watchdog or clock tolerance".into());
        }
        let cue_status = vec![cue.status()];
        let scheduler = Scheduler::new(
            cue,
            output::Config {
                clock: timebase.clock_map(0, 0),
                start_frame: 0,
                delay_frames: config.delay_frames,
                startup_grace_frames: config.startup_grace_frames,
                max_drift_frames: config.max_input_drift_frames,
            },
        )?;
        Self::with_source(
            RenderSource::Cue(scheduler),
            cue_status,
            None,
            [0; mix::MAX_INPUTS],
            config,
            timebase,
            ops,
        )
    }
    fn shared(
        cues: Vec<(CueOutput, mix::Controls)>,
        backing: Option<backing::Reader>,
        config: Config,
        timebase: HostTimebase,
        ops: Ops,
    ) -> Result<Box<Self>> {
        let cue_status = cues.iter().map(|(cue, _)| cue.status()).collect();
        let mut initial = [0; mix::MAX_INPUTS];
        if cues.len() > mix::MAX_INPUTS {
            return Err("Too many cue inputs".into());
        }
        let inputs = cues
            .into_iter()
            .enumerate()
            .map(|(index, (cue, controls))| {
                initial[index] = control_bits(controls);
                (
                    cue,
                    output::Config {
                        clock: timebase.clock_map(0, 0),
                        start_frame: 0,
                        delay_frames: config.delay_frames,
                        startup_grace_frames: config.startup_grace_frames,
                        max_drift_frames: config.max_input_drift_frames,
                    },
                    controls,
                )
            })
            .collect();
        let mixer = mix::Mixer::new(inputs, 0)?;
        let backing_status = backing.as_ref().map(|reader| reader.status());
        Self::with_source(
            RenderSource::Shared {
                mixer,
                backing,
                pcm: [[0.; 2]; MAX_FRAMES],
                applied: initial,
            },
            cue_status,
            backing_status,
            initial,
            config,
            timebase,
            ops,
        )
    }
    fn with_source(
        source: RenderSource,
        cue_status: Vec<Status<CUE_SLOTS>>,
        backing_status: Option<Status<{ backing::SLOTS }>>,
        initial: [u64; mix::MAX_INPUTS],
        config: Config,
        timebase: HostTimebase,
        ops: Ops,
    ) -> Result<Box<Self>> {
        if config.watchdog_timeout.is_zero()
            || !(1..=MAX_FRAMES as u32).contains(&config.max_output_drift_frames)
        {
            return Err("Invalid native output watchdog or clock tolerance".into());
        }
        Ok(Box::new(Self {
            shared: matches!(&source, RenderSource::Shared { .. }),
            data: UnsafeCell::new(Data {
                monitor: MonitorRamps::new(MonitorLevels::default()),
                source,
                next: PRIME_FRAMES,
                clock: None,
                last: None,
                bound: false,
            }),
            entered: AtomicBool::new(false),
            phase: AtomicUsize::new(PREPARING),
            armed: AtomicBool::new(false),
            cue_status,
            backing_status,
            controls: initial.map(AtomicU64::new),
            monitor_levels: AtomicU64::new(MonitorLevels::default().bits()),
            lanes: std::array::from_fn(|_| LaneReport::new()),
            ops,
            timeline: AtomicPtr::new(std::ptr::null_mut()),
            timebase,
            tolerance: config.max_output_drift_frames,
            callbacks: AtomicU64::new(0),
            queued: AtomicU64::new(PRIME_FRAMES as u64),
            hardware: AtomicI64::new(0),
            anchor_ready: AtomicBool::new(false),
            mixed_ready: AtomicBool::new(false),
            mixed_frame: AtomicI64::new(0),
            anchor_host: AtomicU64::new(0),
            anchor_frame: AtomicI64::new(0),
            fault: AtomicUsize::new(0),
        }))
    }
    fn fail(&self, fault: Fault) {
        let _ = self
            .fault
            .compare_exchange(0, fault as usize, Ordering::AcqRel, Ordering::Acquire);
        self.cancel_sources();
    }
    fn cancel_sources(&self) {
        for status in &self.cue_status {
            status.cancel();
        }
        if let Some(status) = &self.backing_status {
            status.cancel();
        }
    }
    fn save_lane(&self, index: usize, report: output::Report) {
        let lane = &self.lanes[index];
        lane.played.store(report.played_frames, Ordering::Release);
        lane.drift.store(report.drift_frames, Ordering::Release);
        lane.fault.store(encode(report.fault), Ordering::Release);
        lane.phase.store(
            match report.phase {
                output::Phase::Waiting => 0,
                output::Phase::Running => 1,
                output::Phase::Ended => 2,
                output::Phase::Fault => 3,
            },
            Ordering::Release,
        );
    }
    fn report(&self) -> Report {
        let fault = match self.fault.load(Ordering::Acquire) {
            0 => None,
            1 => Some(Fault::Layout),
            2 => Some(Fault::Overlap),
            3 => Some(Fault::Queue),
            4 => Some(Fault::Clock),
            5 => Some(Fault::Device),
            6 => Some(Fault::Stalled),
            7 => Some(Fault::Scheduler),
            8 => Some(Fault::Setup),
            9 => Some(Fault::Mixer),
            _ => Some(Fault::Backing),
        };
        let clock = self.anchor_ready.load(Ordering::Acquire).then(|| {
            self.timebase.clock_map(
                self.anchor_host.load(Ordering::Acquire),
                self.anchor_frame.load(Ordering::Acquire),
            )
        });
        Report {
            callbacks: self.callbacks.load(Ordering::Acquire),
            queued_frames: self.queued.load(Ordering::Acquire),
            hardware_frame: self.hardware.load(Ordering::Acquire),
            clock,
            armed: self.armed.load(Ordering::Acquire),
            first_mixed_frame: self
                .mixed_ready
                .load(Ordering::Acquire)
                .then(|| self.mixed_frame.load(Ordering::Acquire)),
            stopped: self.phase.load(Ordering::Acquire) == CLOSED,
            fault,
            cue: self.lanes[0].get(),
            cues: std::array::from_fn(|index| {
                (index < self.cue_status.len()).then(|| self.lanes[index].get())
            }),
        }
    }
    fn observe(
        &self,
        data: &mut Data,
        time: &Timestamp,
        discontinuity: u8,
    ) -> std::result::Result<ClockMap, Fault> {
        if discontinuity != 0
            || time.flags & 3 != 3
            || !time.sample.is_finite()
            || time.sample < 0.
            || time.sample >= (1u64 << 52) as f64
            || data
                .last
                .is_some_and(|(sample, host)| time.sample < sample || time.host < host)
        {
            return Err(Fault::Clock);
        }
        let frame = time.sample.round() as i64;
        if let Some(clock) = data.clock {
            let mapped = clock.frame_at(time.host).ok_or(Fault::Clock)?;
            if (mapped as i128 - frame as i128).abs() > self.tolerance as i128 {
                return Err(Fault::Clock);
            }
        } else {
            let clock = self.timebase.clock_map(time.host, frame);
            data.clock = Some(clock);
            self.anchor_host.store(time.host, Ordering::Relaxed);
            self.anchor_frame.store(frame, Ordering::Relaxed);
            self.anchor_ready.store(true, Ordering::Release);
        }
        data.last = Some((time.sample, time.host));
        self.hardware.store(frame, Ordering::Release);
        Ok(data.clock.unwrap())
    }
}
struct Entered<'a>(&'a AtomicBool);
impl Drop for Entered<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
unsafe extern "C" fn callback(user: *mut c_void, queue: Queue, buffer: *mut Buffer) {
    if user.is_null() {
        return;
    }
    let state = &*user.cast::<State>();
    if buffer.is_null()
        || (*buffer).capacity != BYTES
        || (*buffer).data.is_null()
        || ((*buffer).data as usize) % std::mem::align_of::<crate::native_graph::Stereo>() != 0
    {
        state.fail(Fault::Layout);
        return;
    }
    // Guard BEFORE taking a mutable buffer/Data reference: an overlapping callback
    // may even present the same buffer. Its failure path must not alias it.
    if state
        .entered
        .compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
        .is_err()
    {
        state.fail(Fault::Overlap);
        return;
    }
    let _entered = Entered(&state.entered);
    let output = std::slice::from_raw_parts_mut(
        (*buffer).data.cast::<crate::native_graph::Stereo>(),
        MAX_FRAMES,
    );
    output.fill([0.; 2]);
    if state.phase.load(Ordering::Acquire) != RUNNING {
        return;
    }
    let data = &mut *state.data.get();
    if state.fault.load(Ordering::Acquire) == 0 {
        let mut stamp = Timestamp::default();
        let mut discontinuity = 0;
        let status = (state.ops.current)(
            queue,
            state.timeline.load(Ordering::Acquire),
            &mut stamp,
            &mut discontinuity,
        );
        // Stop may invalidate the queue clock or cancel cue while this callback
        // is in flight. Those expected shutdown results are not playback faults.
        if state.phase.load(Ordering::Acquire) == RUNNING {
            if status != 0 {
                state.fail(Fault::Clock);
            } else {
                match state.observe(data, &stamp, discontinuity) {
                    Err(fault) => state.fail(fault),
                    Ok(clock) => {
                        if state.armed.load(Ordering::Acquire) {
                            if !data.bound {
                                match data.source.bind(clock, data.next) {
                                    Ok(()) => {
                                        // A muted start must never ramp down from unity.
                                        data.monitor = MonitorRamps::new(MonitorLevels::from_bits(
                                            state.monitor_levels.load(Ordering::Acquire),
                                        ));
                                        data.bound = true;
                                        state.mixed_frame.store(data.next, Ordering::Relaxed);
                                        state.mixed_ready.store(true, Ordering::Release);
                                    }
                                    Err(_) => state.fail(Fault::Clock),
                                }
                            }
                            if state.fault.load(Ordering::Acquire) == 0 {
                                data.monitor.set(MonitorLevels::from_bits(
                                    state.monitor_levels.load(Ordering::Acquire),
                                ));
                                let result = data.source.render(
                                    data.next,
                                    output,
                                    state,
                                    &mut data.monitor.backing,
                                );
                                for sample in output.iter_mut() {
                                    let gain = data.monitor.output.next();
                                    sample[0] *= gain;
                                    sample[1] *= gain;
                                }
                                if state.phase.load(Ordering::Acquire) == RUNNING {
                                    if let Err(fault) = result {
                                        state.fail(fault);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    if state.fault.load(Ordering::Acquire) != 0 || state.phase.load(Ordering::Acquire) != RUNNING {
        output.fill([0.; 2]);
    }
    state.callbacks.fetch_add(1, Ordering::AcqRel);
    (*buffer).size = BYTES;
    if state.phase.load(Ordering::Acquire) == RUNNING {
        if (state.ops.enqueue)(queue, buffer, 0, std::ptr::null()) != 0 {
            if state.phase.load(Ordering::Acquire) == RUNNING {
                state.fail(Fault::Queue);
            }
        } else if let Some(next) = data.next.checked_add(MAX_FRAMES as i64) {
            data.next = next;
            state.queued.store(next as u64, Ordering::Release);
        } else {
            state.fail(Fault::Clock);
        }
    }
}

/// !Send via its queue pointer. Do not drop while a callback could still run.
pub struct Output {
    queue: Queue,
    state: Option<Box<State>>,
    device: OutputDevice,
    timeout: Duration,
    progress: Instant,
    last_frame: i64,
    last_callbacks: u64,
    retained: Option<Report>,
}
impl Output {
    /// Starts with silent priming buffers. Explicit UID only; no default/rate
    /// mutation or permission prompt. Caller must explicitly arm after capture
    /// preparation. Physical output/timing remains unqualified.
    pub fn start(uid: &str, cue: CueOutput, config: Config) -> Result<Self> {
        Self::start_source(uid, config, move |timebase, ops| {
            State::new(cue, config, timebase, ops)
        })
    }
    /// Shared cue/backing output. The backing worker must already be primed.
    /// Its owner remains on the control thread and must poll/reap after faults.
    pub fn start_shared(
        uid: &str,
        cues: Vec<(CueOutput, mix::Controls)>,
        backing: Option<backing::Reader>,
        config: Config,
    ) -> Result<Self> {
        Self::start_source(uid, config, move |timebase, ops| {
            State::shared(cues, backing, config, timebase, ops)
        })
    }
    fn start_source(
        uid: &str,
        config: Config,
        prepare: impl FnOnce(HostTimebase, Ops) -> Result<Box<State>>,
    ) -> Result<Self> {
        let device = devices::resolve_output(uid)?;
        if device.channels < 2 {
            return Err("Native output requires a stereo device".into());
        }
        let state = prepare(
            HostTimebase::current()?,
            Ops {
                enqueue: AudioQueueEnqueueBuffer,
                current: AudioQueueGetCurrentTime,
                stop: AudioQueueStop,
                dispose: AudioQueueDispose,
            },
        )?;
        let mut output = Self {
            queue: std::ptr::null_mut(),
            state: Some(state),
            device,
            timeout: config.watchdog_timeout,
            progress: Instant::now(),
            last_frame: 0,
            last_callbacks: 0,
            retained: None,
        };
        let setup: Result<()> = (|| {
            let format = Format::input(2);
            let state = output.state.as_ref().unwrap();
            queue_check(unsafe {
                AudioQueueNewOutput(
                    &format,
                    callback,
                    (&**state as *const State as *mut State).cast(),
                    std::ptr::null(),
                    std::ptr::null(),
                    0,
                    &mut output.queue,
                )
            })?;
            let uid = CString::new(uid).map_err(|_| "Invalid output UID")?;
            let string =
                unsafe { CFStringCreateWithCString(std::ptr::null(), uid.as_ptr(), 0x08000100) };
            if string.is_null() {
                return Err("Cannot create output UID".into());
            }
            let result = unsafe {
                AudioQueueSetProperty(
                    output.queue,
                    u32::from_be_bytes(*b"aqcd"),
                    (&string as *const *const c_void).cast(),
                    std::mem::size_of_val(&string) as u32,
                )
            };
            unsafe {
                CFRelease(string);
            }
            queue_check(result)?;
            let mut actual = Format::input(0);
            let mut size = std::mem::size_of::<Format>() as u32;
            queue_check(unsafe {
                AudioQueueGetProperty(
                    output.queue,
                    u32::from_be_bytes(*b"aqft"),
                    (&mut actual as *mut Format).cast(),
                    &mut size,
                )
            })?;
            if size as usize != std::mem::size_of::<Format>() || !actual.valid(2) {
                return Err("Native output format was not accepted".into());
            }
            let mut timeline = std::ptr::null();
            queue_check(unsafe { AudioQueueCreateTimeline(output.queue, &mut timeline) })?;
            if timeline.is_null() {
                return Err("Native output timeline is unavailable".into());
            }
            state.timeline.store(timeline.cast_mut(), Ordering::Release);
            for _ in 0..3 {
                let mut buffer = std::ptr::null_mut();
                queue_check(unsafe { AudioQueueAllocateBuffer(output.queue, BYTES, &mut buffer) })?;
                if buffer.is_null()
                    || unsafe {
                        (*buffer).capacity != BYTES
                            || (*buffer).data.is_null()
                            || ((*buffer).data as usize) % 4 != 0
                    }
                {
                    return Err("Invalid native output priming buffer".into());
                }
                unsafe {
                    std::ptr::write_bytes((*buffer).data.cast::<u8>(), 0, BYTES as usize);
                    (*buffer).size = BYTES;
                }
                queue_check(unsafe {
                    AudioQueueEnqueueBuffer(output.queue, buffer, 0, std::ptr::null())
                })?;
            }
            state.phase.store(RUNNING, Ordering::Release);
            let started = unsafe { AudioQueueStart(output.queue, std::ptr::null()) };
            if started != 0 {
                state.fail(Fault::Setup);
            }
            queue_check(started)?;
            Ok(())
        })();
        output.complete_setup(setup)
    }
    fn complete_setup(mut self, setup: Result<()>) -> Result<Self> {
        match setup {
            Ok(()) => Ok(self),
            Err(reason) => {
                let cleanup = self.close();
                Err(match cleanup {
                    Ok(()) => reason,
                    Err(error) => format!("{reason}; setup cleanup failed: {error}"),
                })
            }
        }
    }
    pub fn report(&self) -> Report {
        self.state
            .as_ref()
            .map(|state| state.report())
            .or(self.retained)
            .expect("output state or retained disposal report")
    }
    /// No callback state mutation: the callback binds the real clock on its next
    /// turn. Call after native capture/rack preparation, before the cue ring fills.
    pub fn arm(&self) -> Result<()> {
        let state = self
            .state
            .as_ref()
            .ok_or("Native output disposed unsuccessfully")?;
        if state.phase.load(Ordering::Acquire) != RUNNING
            || state.fault.load(Ordering::Acquire) != 0
            || !state.anchor_ready.load(Ordering::Acquire)
        {
            return Err("Native output clock is not ready".into());
        }
        state.armed.store(true, Ordering::Release);
        Ok(())
    }
    /// Latest-value atomic handoff: level/balance/mono travel as one 64-bit
    /// snapshot, then ramp on the exclusive callback. No unbounded command queue.
    pub fn set_cue_controls(&self, index: usize, control: mix::Controls) -> Result<()> {
        control.coefficients()?;
        let state = self
            .state
            .as_ref()
            .ok_or("Native output disposed unsuccessfully")?;
        if index >= state.cue_status.len()
            || state.phase.load(Ordering::Acquire) != RUNNING
            || state.fault.load(Ordering::Acquire) != 0
        {
            return Err("Cue output is unavailable".into());
        }
        // Legacy single-cue output has no mix controls.
        if !state.shared {
            return Err("Cue controls require shared output".into());
        }
        state.controls[index].store(control_bits(control), Ordering::Release);
        Ok(())
    }
    /// Coherent latest-value handoff; 64-frame ramps on the audio callback.
    /// Initial values take effect before first mixed PCM, including exact mute.
    pub fn set_monitor_levels(&self, levels: MonitorLevels) -> Result<()> {
        levels.validate()?;
        let state = self
            .state
            .as_ref()
            .ok_or("Native output disposed unsuccessfully")?;
        if !state.shared
            || state.phase.load(Ordering::Acquire) != RUNNING
            || state.fault.load(Ordering::Acquire) != 0
        {
            return Err("Native monitor output is unavailable".into());
        }
        state.monitor_levels.store(levels.bits(), Ordering::Release);
        Ok(())
    }
    pub fn poll(&mut self) -> Result<Report> {
        self.poll_at(Instant::now(), Self::check_device)
    }
    /// Report health without closing the output on error. A coordinated owner
    /// must quiesce its input captures before calling stop after a failed inspect.
    pub fn inspect(&mut self) -> Result<Report> {
        self.inspect_at(Instant::now(), Self::check_device)
    }
    fn poll_at(
        &mut self,
        now: Instant,
        check_device: impl FnOnce(&Self) -> Result<()>,
    ) -> Result<Report> {
        match self.inspect_at(now, check_device) {
            Ok(report) => Ok(report),
            Err(reason) => {
                let close = self.close();
                Err(match close {
                    Ok(()) => reason,
                    Err(error) => format!("{reason}; shutdown failed: {error}"),
                })
            }
        }
    }
    fn inspect_at(
        &mut self,
        now: Instant,
        check_device: impl FnOnce(&Self) -> Result<()>,
    ) -> Result<Report> {
        let report = self.report();
        let reason = if report.stopped {
            Some("Native output is stopped".into())
        } else if let Some(fault) = report.fault {
            Some(format!("Native output fault: {fault:?}"))
        } else if let Err(reason) = check_device(self) {
            Some(reason)
        } else {
            if report.callbacks != self.last_callbacks && report.hardware_frame != self.last_frame {
                self.progress = now;
                self.last_callbacks = report.callbacks;
                self.last_frame = report.hardware_frame;
            }
            if now.saturating_duration_since(self.progress) >= self.timeout {
                self.state.as_ref().unwrap().fail(Fault::Stalled);
                Some("Native output callbacks or clock stalled".into())
            } else {
                None
            }
        };
        if let Some(reason) = reason {
            return Err(reason);
        }
        Ok(report)
    }
    pub fn check_device(&self) -> Result<()> {
        let result = devices::resolve_output(&self.device.uid).and_then(|current| {
            if current.channels != self.device.channels
                || current.nominal_rate != self.device.nominal_rate
            {
                Err("Output device format changed".into())
            } else {
                Ok(())
            }
        });
        if result.is_err() {
            if let Some(state) = &self.state {
                state.fail(Fault::Device);
            }
        }
        result
    }
    pub fn stop(mut self) -> Result<Report> {
        self.close()?;
        Ok(self.report())
    }
    fn close(&mut self) -> Result<()> {
        let Some(state) = self.state.as_ref() else {
            return Err("Output disposal failed; callback state retained".into());
        };
        if state.phase.load(Ordering::Acquire) == CLOSED {
            return Ok(());
        }
        state.phase.store(FINISHING, Ordering::Release);
        state.cancel_sources();
        if self.queue.is_null() {
            state.phase.store(CLOSED, Ordering::Release);
            return Ok(());
        }
        let stopped = unsafe { (state.ops.stop)(self.queue, 1) };
        if stopped != 0 {
            state.fail(Fault::Queue);
        }
        let disposed = unsafe { (state.ops.dispose)(self.queue, 1) };
        self.queue = std::ptr::null_mut();
        if disposed != 0 {
            state.fail(Fault::Queue);
            self.retained = Some(state.report());
            Box::leak(self.state.take().unwrap());
            return Err(format!(
                "Output disposal failed ({disposed}); callback state retained"
            ));
        }
        state.phase.store(CLOSED, Ordering::Release);
        queue_check(stopped)
    }
}
impl Drop for Output {
    fn drop(&mut self) {
        let _ = self.close();
    }
}
fn queue_check(status: i32) -> Result<()> {
    if status == 0 {
        Ok(())
    } else {
        Err(format!("Native output queue error ({status})"))
    }
}
#[cfg(test)]
mod tests;
