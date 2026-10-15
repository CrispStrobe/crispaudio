//! Isolated native-owned clock experiment. Compiled only by native-validation.
//! No production playback route, WebKit PCM messages or process-global device changes.
use crispaudio_media::plugin_stream::{PluginStream, StreamStop, StreamTransport};
use serde_json::{json, Value};
use std::{
    cell::UnsafeCell,
    ffi::{c_char, c_void},
    sync::{
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

/// Control operations never run in the audio callback. Killing the owned helper
/// interrupts an in-flight pipe request, including plugin initialization.
#[derive(Default)]
pub struct Control {
    stop: AtomicBool,
    helper: Mutex<Option<StreamStop>>,
    ring: Mutex<Option<Arc<Ring>>>,
    pub finished: AtomicBool,
}
impl Control {
    pub fn cancel(&self) {
        self.stop.store(true, Ordering::Release);
        if let Some(ring) = self.ring.lock().unwrap().as_ref() {
            ring.stop.store(true, Ordering::Release);
        }
        if let Some(helper) = self.helper.lock().unwrap().as_ref() {
            helper.stop();
        }
    }
    fn register(&self, helper: StreamStop) {
        *self.helper.lock().unwrap() = Some(helper);
        if self.stop.load(Ordering::Acquire) {
            self.cancel();
        }
    }
}

const FRAMES: usize = 512;
const SAMPLES: usize = FRAMES * 2;
const SLOTS: usize = 4;
const BLOCKS: usize = 300;
type Block = [f32; SAMPLES];
struct Ring {
    slots: [UnsafeCell<Block>; SLOTS],
    read: AtomicUsize,
    write: AtomicUsize,
    fault: AtomicUsize,
    stop: AtomicBool,
}
// Only the unique Producer writes unpublished slots and unique Consumer reads
// published slots. Acquire/release counters transfer slot ownership. Neither
// endpoint is Clone or Sync (Cell marker). No shared mutable slices escape.
unsafe impl Sync for Ring {}
struct Producer {
    ring: Arc<Ring>,
    _single: std::marker::PhantomData<std::cell::Cell<()>>,
}
struct Consumer {
    ring: Arc<Ring>,
    _single: std::marker::PhantomData<std::cell::Cell<()>>,
}
fn ring() -> (Producer, Consumer) {
    let r = Arc::new(Ring {
        slots: std::array::from_fn(|_| UnsafeCell::new([0.; SAMPLES])),
        read: AtomicUsize::new(0),
        write: AtomicUsize::new(0),
        fault: AtomicUsize::new(0),
        stop: AtomicBool::new(false),
    });
    (
        Producer {
            ring: r.clone(),
            _single: Default::default(),
        },
        Consumer {
            ring: r,
            _single: Default::default(),
        },
    )
}
impl Ring {
    fn fail(&self, code: usize) {
        let _ = self
            .fault
            .compare_exchange(0, code, Ordering::AcqRel, Ordering::Acquire);
    }
}
impl Producer {
    fn push(&mut self, data: &Block) -> bool {
        let w = self.ring.write.load(Ordering::Relaxed);
        if self.ring.stop.load(Ordering::Acquire)
            || self.ring.fault.load(Ordering::Acquire) != 0
            || w.wrapping_sub(self.ring.read.load(Ordering::Acquire)) == SLOTS
        {
            return false;
        }
        unsafe {
            *self.ring.slots[w % SLOTS].get() = *data;
        }
        self.ring.write.store(w.wrapping_add(1), Ordering::Release);
        true
    }
}
impl Consumer {
    fn fill(&mut self, output: &mut [f32]) -> bool {
        // Faults latch: an empty deadline never causes dry fallback or stale reuse.
        output.fill(0.);
        if output.len() != SAMPLES {
            self.ring.fail(2);
            return false;
        }
        if self.ring.stop.load(Ordering::Acquire) || self.ring.fault.load(Ordering::Acquire) != 0 {
            return false;
        }
        let r = self.ring.read.load(Ordering::Relaxed);
        if r == self.ring.write.load(Ordering::Acquire) {
            self.ring.fail(1);
            return false;
        }
        output.copy_from_slice(unsafe { &*self.ring.slots[r % SLOTS].get() });
        self.ring.read.store(r.wrapping_add(1), Ordering::Release);
        true
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
    fn AudioQueueAllocateBuffer(queue: Queue, size: u32, buffer: *mut *mut Buffer) -> i32;
    fn AudioQueueEnqueueBuffer(
        queue: Queue,
        buffer: *mut Buffer,
        count: u32,
        packets: *const c_void,
    ) -> i32;
    fn AudioQueueSetParameter(queue: Queue, id: u32, value: f32) -> i32;
    fn AudioQueueSetProperty(queue: Queue, id: u32, value: *const c_void, size: u32) -> i32;
    fn AudioQueueStart(queue: Queue, time: *const c_void) -> i32;
    fn AudioQueueGetCurrentTime(
        queue: Queue,
        timeline: *const c_void,
        timestamp: *mut Timestamp,
        discontinuity: *mut u8,
    ) -> i32;
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
fn check(status: i32) -> Result<(), String> {
    if status == 0 {
        Ok(())
    } else {
        Err(format!("Native audio queue error ({status})"))
    }
}
struct CallbackData {
    consumer: Consumer,
    capture: Vec<f32>,
    times: Vec<f64>,
    blocks: usize,
}
struct CallbackState {
    data: UnsafeCell<CallbackData>,
    entered: AtomicBool,
    completed: AtomicUsize,
    callbacks: AtomicU64,
    clock: Instant,
    epoch: f64,
    ring: Arc<Ring>,
}
unsafe extern "C" fn output(user: *mut c_void, queue: Queue, buffer: *mut Buffer) {
    let state = &*(user as *const CallbackState);
    // Queue buffers have fixed capacity, allocated by us before start. Never
    // allocate, lock, wait, log, invoke WebKit or process plugins in this callback.
    if buffer.is_null() {
        state.ring.fail(2);
        return;
    }
    if (*buffer).capacity as usize != SAMPLES * 4 || (*buffer).data.is_null() {
        state.ring.fail(2);
        return;
    }
    let out = std::slice::from_raw_parts_mut((*buffer).data.cast::<f32>(), SAMPLES);
    out.fill(0.);
    if state
        .entered
        .compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
        .is_err()
    {
        state.ring.fail(3);
    } else {
        let data = &mut *state.data.get();
        if data.blocks < BLOCKS {
            data.consumer.fill(out);
            let begin = data.blocks * SAMPLES;
            data.capture[begin..begin + SAMPLES].copy_from_slice(out);
            data.times[data.blocks] = state.epoch + state.clock.elapsed().as_secs_f64() * 1000.;
            data.blocks += 1;
            state.completed.store(data.blocks, Ordering::Release);
        }
        state.entered.store(false, Ordering::Release);
    }
    state.callbacks.fetch_add(1, Ordering::Relaxed);
    (*buffer).size = (SAMPLES * 4) as u32;
    if !state.ring.stop.load(Ordering::Acquire)
        && AudioQueueEnqueueBuffer(queue, buffer, 0, std::ptr::null()) != 0
        && !state.ring.stop.load(Ordering::Acquire)
    {
        state.ring.fail(4);
    }
}
struct AudioQueue(Queue, Arc<Ring>);
impl Drop for AudioQueue {
    fn drop(&mut self) {
        self.1.stop.store(true, Ordering::Release);
        unsafe {
            AudioQueueDispose(self.0, 1);
        }
    }
}
// Keep callback state alive until synchronous disposal completes, including error paths.
fn play(
    state: &CallbackState,
    uid: &str,
    cancel: &AtomicBool,
    started: impl FnOnce() -> Result<(), String>,
) -> Result<Vec<(f64, f64)>, String> {
    let format = Format {
        rate: 48000.,
        id: u32::from_be_bytes(*b"lpcm"),
        flags: 1 | 8,
        bytes_packet: 8,
        frames_packet: 1,
        bytes_frame: 8,
        channels: 2,
        bits: 32,
        reserved: 0,
    };
    let mut raw = std::ptr::null_mut();
    check(unsafe {
        AudioQueueNewOutput(
            &format,
            output,
            (state as *const CallbackState as *mut CallbackState).cast(),
            std::ptr::null(),
            std::ptr::null(),
            0,
            &mut raw,
        )
    })?;
    let queue = AudioQueue(raw, state.ring.clone());
    let uid = std::ffi::CString::new(uid).map_err(|_| "Invalid output UID")?;
    let device = unsafe { CFStringCreateWithCString(std::ptr::null(), uid.as_ptr(), 0x08000100) };
    if device.is_null() {
        return Err("Cannot create output UID".into());
    }
    let result = unsafe {
        AudioQueueSetProperty(
            queue.0,
            u32::from_be_bytes(*b"aqcd"),
            (&device as *const *const c_void).cast(),
            std::mem::size_of_val(&device) as u32,
        )
    };
    unsafe { CFRelease(device) };
    check(result)?;
    // Digital pre-volume capture only. Never emit an unsolicited physical tone.
    check(unsafe { AudioQueueSetParameter(queue.0, 1, 0.) })?;
    for _ in 0..2 {
        let mut buffer = std::ptr::null_mut();
        check(unsafe { AudioQueueAllocateBuffer(queue.0, (SAMPLES * 4) as u32, &mut buffer) })?;
        unsafe {
            output(
                (state as *const CallbackState as *mut CallbackState).cast(),
                queue.0,
                buffer,
            )
        };
    }
    check(unsafe { AudioQueueStart(queue.0, std::ptr::null()) })?;
    started()?;
    let deadline = Instant::now() + Duration::from_secs(6);
    let mut hardware = Vec::with_capacity(400);
    let mut next_sample = Instant::now();
    while state.completed.load(Ordering::Acquire) < BLOCKS
        && state.ring.fault.load(Ordering::Acquire) == 0
        && !state.ring.stop.load(Ordering::Acquire)
    {
        if cancel.load(Ordering::Acquire) {
            state.ring.stop.store(true, Ordering::Release);
            break;
        }
        if Instant::now() > deadline {
            state.ring.fail(5);
            break;
        }
        if Instant::now() >= next_sample && hardware.len() < 400 {
            let mut stamp = Timestamp::default();
            if unsafe {
                AudioQueueGetCurrentTime(
                    queue.0,
                    std::ptr::null(),
                    &mut stamp,
                    std::ptr::null_mut(),
                )
            } == 0
                && stamp.flags & 1 != 0
                && stamp.sample.is_finite()
            {
                hardware.push((
                    state.epoch + state.clock.elapsed().as_secs_f64() * 1000.,
                    stamp.sample,
                ));
            }
            next_sample = Instant::now() + Duration::from_millis(10);
        }
        thread::sleep(Duration::from_millis(2));
    }
    drop(queue);
    Ok(hardware)
}
/// The JS caller receives only summary/trace data. PCM and plugin deadlines stay native.
pub fn probe(
    plugin: String,
    device: String,
    stop: Arc<Control>,
    starve: bool,
    started: impl FnOnce() -> Result<(), String>,
) -> Result<Value, String> {
    let (mut producer, consumer) = ring();
    let shared = producer.ring.clone();
    *stop.ring.lock().unwrap() = Some(shared.clone());
    let clock = Instant::now();
    let epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs_f64()
        * 1000.;
    let worker_ring = shared.clone();
    let worker_stop = stop.clone();
    let (ready_send, ready) = std::sync::mpsc::sync_channel(1);
    let worker = thread::spawn(move || -> Result<Value, String> {
        let mut stream = PluginStream::open_with_stop(
            &json!({"id":plugin,"sampleRate":48000,"channels":2,"processMode":"realtime","parameters":{"100":0.002,"101":0},"bypass":false}),
            |helper| worker_stop.register(helper),
        )?;
        let handle = stream.stop_handle();
        let mut times = Vec::with_capacity(BLOCKS);
        let mut max_process_ms = 0f64;
        let result = (|| -> Result<(), String> {
            for block in 0..BLOCKS {
                if worker_stop.stop.load(Ordering::Acquire)
                    || worker_ring.stop.load(Ordering::Acquire)
                    || worker_ring.fault.load(Ordering::Acquire) != 0
                {
                    break;
                }
                if starve && block == 24 {
                    thread::sleep(Duration::from_millis(150));
                    if worker_ring.stop.load(Ordering::Acquire) {
                        break;
                    }
                }
                let mut input = vec![vec![0.; FRAMES]; 2];
                for i in 0..FRAMES {
                    let frame = block * FRAMES + i;
                    if frame >= 4096 && (frame - 4096) % 8192 == 0 {
                        input[0][i] = 0.75;
                        input[1][i] = -0.625;
                    }
                }
                let t = Instant::now();
                let reply = stream.process_with_transport(
                    &input,
                    &json!({}),
                    false,
                    Some(&StreamTransport {
                        sample_position: (block * FRAMES) as u64,
                        tempo: 120.,
                        numerator: 4,
                        denominator: 4,
                        origin_seconds: 0.,
                        playing: true,
                    }),
                )?;
                max_process_ms = max_process_ms.max(t.elapsed().as_secs_f64() * 1000.);
                times.push(epoch + clock.elapsed().as_secs_f64() * 1000.);
                let mut interleaved = [0.; SAMPLES];
                for i in 0..FRAMES {
                    interleaved[i * 2] = reply.samples[0][i];
                    interleaved[i * 2 + 1] = reply.samples[1][i];
                }
                while !producer.push(&interleaved) {
                    if worker_stop.stop.load(Ordering::Acquire)
                        || worker_ring.stop.load(Ordering::Acquire)
                        || worker_ring.fault.load(Ordering::Acquire) != 0
                    {
                        return Ok(());
                    }
                    thread::sleep(Duration::from_micros(250));
                }
                if block == SLOTS - 1 {
                    ready_send
                        .send(())
                        .map_err(|_| "Clock preparation cancelled")?;
                }
            }
            Ok(())
        })();
        if result.is_err() && !worker_stop.stop.load(Ordering::Acquire) {
            worker_ring.fail(6);
        }
        drop(stream);
        if !worker_stop.stop.load(Ordering::Acquire) {
            result?;
        }
        Ok(
            json!({"processTimes":times,"maxProcessMs":max_process_ms,"helperClosed":!handle.is_alive()}),
        )
    });
    let state = CallbackState {
        data: UnsafeCell::new(CallbackData {
            consumer,
            capture: vec![0.; BLOCKS * SAMPLES],
            times: vec![0.; BLOCKS],
            blocks: 0,
        }),
        entered: AtomicBool::new(false),
        completed: AtomicUsize::new(0),
        callbacks: AtomicU64::new(0),
        clock,
        epoch,
        ring: shared.clone(),
    };
    let result = (|| {
        ready
            .recv_timeout(Duration::from_secs(12))
            .map_err(|_| "Native clock preparation failed")?;
        if stop.stop.load(Ordering::Acquire) {
            return Err("Native clock cancelled".into());
        }
        play(&state, &device, &stop.stop, started)
    })();
    shared.stop.store(true, Ordering::Release);
    let worker_result = worker.join().map_err(|_| "Native clock worker panicked")?;
    let stats = worker_result?;
    let hardware = result?;
    let data = state.data.into_inner();
    let fault = shared.fault.load(Ordering::Acquire);
    let mut impulses = Vec::new();
    let mut invalid = 0;
    for i in 0..data.blocks * FRAMES {
        let l = data.capture[i * 2];
        let r = data.capture[i * 2 + 1];
        if l.abs() > 1e-6 || r.abs() > 1e-6 {
            impulses.push(i);
            if (l - 0.75).abs() > 2e-6 || (r + 0.625).abs() > 2e-6 {
                invalid += 1;
            }
        }
    }
    let expected = (4096 + 96..BLOCKS * FRAMES)
        .step_by(8192)
        .collect::<Vec<_>>();
    Ok(
        json!({"kind":"native-clock","hardwareTimes":hardware,"fault":fault,"blocks":data.blocks,"frames":data.blocks*FRAMES,"blockFrames":FRAMES,"ringSlots":SLOTS,"queueBuffers":2,"rate":48000,"deviceBound":true,"muted":true,"impulses":impulses,"pcmExact":impulses==expected&&invalid==0,"faultBlockSilent":fault!=0&&data.blocks>0&&data.capture[(data.blocks-1)*SAMPLES..data.blocks*SAMPLES].iter().all(|v|*v==0.),"callbackTimes":&data.times[..data.blocks],"worker":stats,"cancelled":stop.stop.load(Ordering::Acquire)}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_wrap_and_latched_fault_silence() {
        let (mut p, mut c) = ring();
        let mut out = [0.; SAMPLES];
        // Counter wrap is valid too; slot indexing is power-of-two.
        p.ring.read.store(usize::MAX - 3, Ordering::Relaxed);
        p.ring.write.store(usize::MAX - 3, Ordering::Relaxed);
        for n in 0..64 {
            for i in 0..SLOTS {
                assert!(p.push(&[(n * SLOTS + i) as f32; SAMPLES]));
            }
            assert!(!p.push(&[99.; SAMPLES]));
            for i in 0..SLOTS {
                assert!(c.fill(&mut out));
                assert!(out.iter().all(|x| *x == (n * SLOTS + i) as f32));
            }
        }
        out.fill(99.);
        assert!(!c.fill(&mut out));
        assert!(out.iter().all(|x| *x == 0.));
        assert!(!p.push(&[1.; SAMPLES]));
        assert!(!c.fill(&mut out));
        assert_eq!(p.ring.fault.load(Ordering::Acquire), 1);
    }
    #[test]
    fn cancel_before_registration_and_invalid_buffer_are_silent() {
        let control = Control::default();
        control.cancel();
        control.cancel();
        assert!(control.stop.load(Ordering::Acquire));
        let (mut p, mut c) = ring();
        assert!(p.push(&[0.5; SAMPLES]));
        let mut wrong = [1.; 8];
        assert!(!c.fill(&mut wrong));
        assert_eq!(wrong, [0.; 8]);
        let mut out = [1.; SAMPLES];
        assert!(!c.fill(&mut out));
        assert!(out.iter().all(|v| *v == 0.));
        assert_eq!(p.ring.fault.load(Ordering::Acquire), 2);
    }
    #[test]
    fn concurrent_publication_and_cancellation() {
        let (mut p, mut c) = ring();
        let shared = p.ring.clone();
        let producer = thread::spawn(move || {
            for n in 0..20000 {
                while !p.push(&[n as f32; SAMPLES]) {
                    thread::yield_now();
                }
            }
        });
        let mut out = [0.; SAMPLES];
        for n in 0..20000 {
            while c.ring.read.load(Ordering::Relaxed) == c.ring.write.load(Ordering::Acquire) {
                thread::yield_now();
            }
            assert!(c.fill(&mut out));
            assert!(out.iter().all(|x| *x == n as f32));
        }
        producer.join().unwrap();
        shared.stop.store(true, Ordering::Release);
        out.fill(3.);
        assert!(!c.fill(&mut out));
        assert!(out.iter().all(|x| *x == 0.));
        assert_eq!(shared.fault.load(Ordering::Acquire), 0);
    }
}
