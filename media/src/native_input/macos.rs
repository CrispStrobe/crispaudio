//! App-local Mac input queue. Not connected to recording commands/UI yet.
//! All setup, stopping and disposal belong on its owning control thread.
mod devices;
use super::{Fault, InputWriter, Status, CUE_SLOTS, DRY_SLOTS, MAX_FRAMES};
use crate::Result;
pub use devices::{list_inputs, InputDevice};
use std::{
    cell::UnsafeCell,
    ffi::{c_char, c_void, CString},
    sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicUsize, Ordering},
};

const RATE: f64 = 48000.;
const PREPARING: usize = 0;
const RUNNING: usize = 1;
const FINISHING: usize = 2;
const ABORTING: usize = 3;
const CLOSED: usize = 4;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Permission {
    Undetermined,
    Restricted,
    Denied,
    Authorized,
}
#[link(name = "AVFoundation", kind = "framework")]
extern "C" {
    static AVMediaTypeAudio: *const c_void;
}
#[link(name = "objc")]
extern "C" {
    fn objc_getClass(name: *const c_char) -> *mut c_void;
    fn sel_registerName(name: *const c_char) -> *mut c_void;
    #[link_name = "objc_msgSend"]
    fn authorization_status(
        class: *mut c_void,
        selector: *mut c_void,
        media: *const c_void,
    ) -> isize;
}
/// Read-only query. This module never requests permission or displays a prompt.
pub fn microphone_permission() -> Result<Permission> {
    let class = unsafe { objc_getClass(b"AVCaptureDevice\0".as_ptr().cast()) };
    if class.is_null() {
        return Err("AVCaptureDevice is unavailable".into());
    }
    let selector =
        unsafe { sel_registerName(b"authorizationStatusForMediaType:\0".as_ptr().cast()) };
    match unsafe { authorization_status(class, selector, AVMediaTypeAudio) } {
        0 => Ok(Permission::Undetermined),
        1 => Ok(Permission::Restricted),
        2 => Ok(Permission::Denied),
        3 => Ok(Permission::Authorized),
        _ => Err("Unknown microphone authorization state".into()),
    }
}

fn ensure_authorized(permission: Permission) -> Result<()> {
    if permission == Permission::Authorized {
        Ok(())
    } else {
        Err("Microphone permission must be granted before native recording".into())
    }
}

#[derive(Clone, Copy, Debug)]
pub enum ChannelMap {
    Mono(u32),
    Stereo(u32, u32),
}
impl ChannelMap {
    fn indices(self, channels: u32) -> Result<[usize; 2]> {
        let (left, right) = match self {
            Self::Mono(channel) => (channel, channel),
            Self::Stereo(left, right) => (left, right),
        };
        if !(1..=32).contains(&channels) || left >= channels || right >= channels {
            return Err("Selected input channels are unavailable".into());
        }
        Ok([left as usize, right as usize])
    }
}
#[derive(Clone, Copy, Debug)]
pub struct HostTimebase {
    numerator: u32,
    denominator: u32,
}
#[link(name = "System")]
extern "C" {
    fn mach_timebase_info(info: *mut MachTimebase) -> i32;
}
#[repr(C)]
struct MachTimebase {
    numerator: u32,
    denominator: u32,
}
impl HostTimebase {
    pub fn current() -> Result<Self> {
        let mut info = MachTimebase {
            numerator: 0,
            denominator: 0,
        };
        if unsafe { mach_timebase_info(&mut info) } != 0
            || info.numerator == 0
            || info.denominator == 0
        {
            return Err("Invalid Mac host timebase".into());
        }
        Ok(Self {
            numerator: info.numerator,
            denominator: info.denominator,
        })
    }
    /// Convert a tick *difference*, not the absolute host epoch, to seconds.
    pub fn seconds(self, ticks: u64) -> f64 {
        ticks as f64 * self.numerator as f64 / self.denominator as f64 / 1_000_000_000.
    }
}
#[repr(C)]
struct Format {
    rate: f64,
    id: u32,
    flags: u32,
    bytes_packet: u32,
    frames_packet: u32,
    bytes_frame: u32,
    channels: u32,
    bits: u32,
    reserved: u32,
}
impl Format {
    fn input(channels: u32) -> Self {
        Self {
            rate: RATE,
            id: u32::from_be_bytes(*b"lpcm"),
            flags: 1 | 8,
            bytes_packet: channels * 4,
            frames_packet: 1,
            bytes_frame: channels * 4,
            channels,
            bits: 32,
            reserved: 0,
        }
    }
    fn valid(&self, channels: u32) -> bool {
        self.rate == RATE
            && self.id == u32::from_be_bytes(*b"lpcm")
            && self.flags == (1 | 8)
            && self.bytes_packet == channels * 4
            && self.frames_packet == 1
            && self.bytes_frame == channels * 4
            && self.channels == channels
            && self.bits == 32
    }
}
#[repr(C)]
struct Buffer {
    capacity: u32,
    data: *mut c_void,
    size: u32,
    user: *mut c_void,
    packet_capacity: u32,
    packets: *mut c_void,
    packet_count: u32,
}
#[repr(C)]
#[derive(Default)]
struct Timestamp {
    sample: f64,
    host: u64,
    rate: f64,
    word: u64,
    smpte: [u8; 24],
    flags: u32,
    reserved: u32,
}
type Queue = *mut c_void;
type Enqueue = unsafe extern "C" fn(Queue, *mut Buffer, u32, *const c_void) -> i32;
type Callback =
    unsafe extern "C" fn(*mut c_void, Queue, *mut Buffer, *const Timestamp, u32, *const c_void);
#[link(name = "AudioToolbox", kind = "framework")]
extern "C" {
    fn AudioQueueNewInput(
        format: *const Format,
        callback: Callback,
        user: *mut c_void,
        run_loop: *const c_void,
        mode: *const c_void,
        flags: u32,
        queue: *mut Queue,
    ) -> i32;
    fn AudioQueueAllocateBuffer(queue: Queue, size: u32, buffer: *mut *mut Buffer) -> i32;
    fn AudioQueueEnqueueBuffer(
        queue: Queue,
        buffer: *mut Buffer,
        count: u32,
        packets: *const c_void,
    ) -> i32;
    fn AudioQueueSetProperty(queue: Queue, id: u32, value: *const c_void, size: u32) -> i32;
    fn AudioQueueGetProperty(queue: Queue, id: u32, value: *mut c_void, size: *mut u32) -> i32;
    fn AudioQueueStart(queue: Queue, time: *const c_void) -> i32;
    fn AudioQueueStop(queue: Queue, immediate: u8) -> i32;
    fn AudioQueueDispose(queue: Queue, immediate: u8) -> i32;
}
#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFStringCreateWithCString(
        allocator: *const c_void,
        text: *const c_char,
        encoding: u32,
    ) -> *const c_void;
    fn CFRelease(value: *const c_void);
}
fn check(status: i32) -> Result<()> {
    if status == 0 {
        Ok(())
    } else {
        Err(format!("Native input queue error ({status})"))
    }
}
#[derive(Default)]
struct InputClock {
    origin: Option<f64>,
    frames: u64,
    host: Option<u64>,
}
impl InputClock {
    fn accept(&mut self, time: &Timestamp, length: usize) -> std::result::Result<u64, Fault> {
        if time.flags & 3 != 3
            || !time.sample.is_finite()
            || time.sample.abs() >= (1u64 << 52) as f64
        {
            return Err(Fault::InvalidInput);
        }
        let origin = self.origin.unwrap_or(time.sample);
        if (time.sample - (origin + self.frames as f64)).abs() > 0.01
            || self.host.is_some_and(|host| time.host <= host)
        {
            return Err(Fault::Discontinuous);
        }
        let first = self.frames;
        self.frames = self
            .frames
            .checked_add(length as u64)
            .ok_or(Fault::InvalidInput)?;
        self.origin = Some(origin);
        self.host = Some(time.host);
        Ok(first)
    }
}
struct Data {
    writer: Option<InputWriter>,
    clock: InputClock,
}
struct State {
    data: UnsafeCell<Data>,
    entered: AtomicBool,
    phase: AtomicUsize,
    dry: Status<DRY_SLOTS>,
    cue: Status<CUE_SLOTS>,
    channels: usize,
    map: [usize; 2],
    frames: AtomicU64,
    callbacks: AtomicU64,
    peaks: [AtomicU32; 2],
    enqueue: Enqueue,
}
// Callback mutation of Data is protected by entered; the owning control thread
// accesses Data only after synchronous disposal proves callback quiescence.
// Every other field shared with the control thread is immutable or atomic.
unsafe impl Sync for State {}
impl State {
    fn new(
        writer: InputWriter,
        channels: u32,
        map: ChannelMap,
        enqueue: Enqueue,
    ) -> Result<Box<Self>> {
        let indices = map.indices(channels)?;
        Ok(Box::new(Self {
            dry: writer.dry.status(),
            cue: writer.cue.status(),
            data: UnsafeCell::new(Data {
                writer: Some(writer),
                clock: InputClock::default(),
            }),
            entered: AtomicBool::new(false),
            phase: AtomicUsize::new(PREPARING),
            channels: channels as usize,
            map: indices,
            frames: AtomicU64::new(0),
            callbacks: AtomicU64::new(0),
            peaks: std::array::from_fn(|_| AtomicU32::new(0)),
            enqueue,
        }))
    }
    fn fail(&self, fault: Fault) {
        self.dry.fail(fault);
        self.cue.fail(fault);
        for peak in &self.peaks {
            peak.store(0, Ordering::Release);
        }
    }
    fn report(&self) -> InputReport {
        let fault = self.dry.fault();
        InputReport {
            frames: self.frames.load(Ordering::Acquire),
            callbacks: self.callbacks.load(Ordering::Acquire),
            fault,
            peaks: if fault.is_some() {
                [0.; 2]
            } else {
                self.peaks
                    .each_ref()
                    .map(|peak| f32::from_bits(peak.load(Ordering::Acquire)))
            },
        }
    }
}
#[derive(Clone, Copy, Debug)]
pub struct InputReport {
    pub frames: u64,
    pub callbacks: u64,
    pub fault: Option<Fault>,
    pub peaks: [f32; 2],
}

unsafe extern "C" fn callback(
    user: *mut c_void,
    queue: Queue,
    buffer: *mut Buffer,
    time: *const Timestamp,
    _: u32,
    descriptions: *const c_void,
) {
    if user.is_null() {
        return;
    }
    let state = &*user.cast::<State>();
    let phase = state.phase.load(Ordering::Acquire);
    if phase != RUNNING && phase != FINISHING {
        return;
    }
    if state.dry.fault().is_some() {
        return;
    }
    if state
        .entered
        .compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
        .is_err()
    {
        state.fail(Fault::Device);
        return;
    }
    // All paths release entered. No unwinding, heap work, locks, logging, WebKit,
    // file operations or DSP/helper calls can occur in this callback.
    let valid = (|| {
        if buffer.is_null() || !descriptions.is_null() {
            return Err(Fault::InvalidInput);
        }
        let buffer = &*buffer;
        if buffer.size == 0 && phase == FINISHING {
            return Ok(());
        }
        let stride = state.channels * 4;
        if buffer.capacity as usize != MAX_FRAMES * stride
            || buffer.size == 0
            || buffer.size > buffer.capacity
            || buffer.size as usize % stride != 0
            || buffer.data.is_null()
            || buffer.data as usize % std::mem::align_of::<f32>() != 0
            || time.is_null()
        {
            return Err(Fault::InvalidInput);
        }
        let frames = buffer.size as usize / stride;
        let source = std::slice::from_raw_parts(buffer.data.cast::<f32>(), frames * state.channels);
        let mut pcm = [[0.; 2]; MAX_FRAMES];
        let mut peaks = [0f32; 2];
        for frame in 0..frames {
            for channel in 0..2 {
                let sample = source[frame * state.channels + state.map[channel]];
                pcm[frame][channel] = sample;
                peaks[channel] = peaks[channel].max(sample.abs());
            }
        }
        let data = &mut *state.data.get();
        let first = data.clock.accept(&*time, frames)?;
        let writer = data.writer.as_mut().ok_or(Fault::Cancelled)?;
        if !writer.push(first, (*time).host, &pcm[..frames]) {
            return Err(state.dry.fault().unwrap_or(Fault::Device));
        }
        state.frames.store(data.clock.frames, Ordering::Release);
        state.callbacks.fetch_add(1, Ordering::Relaxed);
        for (peak, value) in state.peaks.iter().zip(peaks) {
            peak.store(value.to_bits(), Ordering::Release);
        }
        Ok(())
    })();
    if let Err(fault) = valid {
        state.fail(fault);
    }
    // Finishing accepts pending partial buffers but never re-enqueues them.
    if state.phase.load(Ordering::Acquire) == RUNNING
        && state.dry.fault().is_none()
        && (state.enqueue)(queue, buffer, 0, std::ptr::null()) != 0
    {
        state.fail(Fault::Device);
    }
    state.entered.store(false, Ordering::Release);
}

#[derive(Clone, Copy)]
struct QueueOps {
    stop: unsafe extern "C" fn(Queue, u8) -> i32,
    dispose: unsafe extern "C" fn(Queue, u8) -> i32,
}
pub struct Capture {
    queue: Queue,
    state: Option<Box<State>>,
    device: InputDevice,
    ops: QueueOps,
}
impl Capture {
    /// Requires already-authorized microphone access. No prompt, default-device
    /// change or sample-rate change. Call only after an explicit recording action.
    /// Requests the selected UID explicitly; this API never chooses a replacement.
    pub fn start(uid: &str, map: ChannelMap, writer: InputWriter) -> Result<Self> {
        let preflight = (|| {
            ensure_authorized(microphone_permission()?)?;
            let device = devices::resolve(uid)?;
            map.indices(device.channels)?;
            Ok(device)
        })();
        let device = match preflight {
            Ok(device) => device,
            Err(error) => {
                writer.dry.status().fail(Fault::Device);
                writer.cue.status().fail(Fault::Device);
                return Err(error);
            }
        };
        let state = State::new(writer, device.channels, map, AudioQueueEnqueueBuffer)?;
        let mut capture = Self {
            queue: std::ptr::null_mut(),
            state: Some(state),
            device,
            ops: QueueOps {
                stop: AudioQueueStop,
                dispose: AudioQueueDispose,
            },
        };
        let format = Format::input(capture.device.channels);
        let state = capture.state.as_ref().unwrap();
        check(unsafe {
            AudioQueueNewInput(
                &format,
                callback,
                (&**state as *const State as *mut State).cast(),
                std::ptr::null(),
                std::ptr::null(),
                0,
                &mut capture.queue,
            )
        })?;
        let uid = CString::new(uid).map_err(|_| "Invalid input UID")?;
        let string =
            unsafe { CFStringCreateWithCString(std::ptr::null(), uid.as_ptr(), 0x08000100) };
        if string.is_null() {
            return Err("Cannot create input UID".into());
        }
        let result = unsafe {
            AudioQueueSetProperty(
                capture.queue,
                u32::from_be_bytes(*b"aqcd"),
                (&string as *const *const c_void).cast(),
                std::mem::size_of_val(&string) as u32,
            )
        };
        unsafe {
            CFRelease(string);
        }
        check(result)?;
        let mut actual = Format::input(0);
        let mut size = std::mem::size_of::<Format>() as u32;
        check(unsafe {
            AudioQueueGetProperty(
                capture.queue,
                u32::from_be_bytes(*b"aqft"),
                (&mut actual as *mut Format).cast(),
                &mut size,
            )
        })?;
        if size as usize != std::mem::size_of::<Format>() || !actual.valid(capture.device.channels)
        {
            return Err("Native input format was not accepted".into());
        }
        for _ in 0..3 {
            let mut buffer = std::ptr::null_mut();
            check(unsafe {
                AudioQueueAllocateBuffer(
                    capture.queue,
                    (MAX_FRAMES * capture.device.channels as usize * 4) as u32,
                    &mut buffer,
                )
            })?;
            check(unsafe { AudioQueueEnqueueBuffer(capture.queue, buffer, 0, std::ptr::null()) })?;
        }
        state.phase.store(RUNNING, Ordering::Release);
        let started = unsafe { AudioQueueStart(capture.queue, std::ptr::null()) };
        if started != 0 {
            state.fail(Fault::Device);
        }
        check(started)?;
        Ok(capture)
    }
    pub fn report(&self) -> InputReport {
        self.state.as_ref().unwrap().report()
    }
    /// Control-thread hot-plug/format check. The owner must finish/drop promptly
    /// on failure and also implement a missing-callback watchdog.
    pub fn check_device(&self) -> Result<()> {
        let result = devices::resolve(&self.device.uid).and_then(|current| {
            if current.channels != self.device.channels
                || current.nominal_rate != self.device.nominal_rate
            {
                Err("Input device format changed during capture".into())
            } else {
                Ok(())
            }
        });
        if result.is_err() {
            self.state.as_ref().unwrap().fail(Fault::Device);
        }
        result
    }
    /// Stop synchronously, accepting the final partial buffers. A successful
    /// return can still carry an incomplete-take fault; inspect report.fault.
    pub fn finish(mut self) -> Result<InputReport> {
        self.close(true)?;
        Ok(self.report())
    }
    fn close(&mut self, finish: bool) -> Result<()> {
        let Some(state) = self.state.as_ref() else {
            return Ok(());
        };
        let phase = state.phase.load(Ordering::Acquire);
        if phase == CLOSED {
            return Ok(());
        }
        if !finish {
            state.fail(if phase == PREPARING {
                Fault::Device
            } else {
                Fault::Cancelled
            });
        }
        state
            .phase
            .store(if finish { FINISHING } else { ABORTING }, Ordering::Release);
        if self.queue.is_null() {
            state.phase.store(CLOSED, Ordering::Release);
            unsafe {
                (&mut *state.data.get()).writer.take();
            }
            return Ok(());
        }
        let stopped = unsafe { (self.ops.stop)(self.queue, 1) };
        if stopped != 0 {
            state.fail(Fault::Device);
        }
        let disposed = unsafe { (self.ops.dispose)(self.queue, 1) };
        self.queue = std::ptr::null_mut();
        if disposed != 0 {
            state.fail(Fault::Device);
            state.phase.store(ABORTING, Ordering::Release);
            // Disposal failed: callback quiescence is unproven. Retain userdata
            // rather than allowing a late callback to dereference freed memory.
            Box::leak(self.state.take().unwrap());
            return check(disposed);
        }
        state.phase.store(CLOSED, Ordering::Release);
        // AudioQueueDispose(true) has returned; no callbacks can access Data.
        unsafe {
            (&mut *state.data.get()).writer.take();
        }
        check(stopped)
    }
}
impl Drop for Capture {
    fn drop(&mut self) {
        let _ = self.close(false);
    }
}

#[cfg(test)]
mod tests;
