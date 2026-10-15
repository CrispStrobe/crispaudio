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
    helper: Mutex<Vec<StreamStop>>,
    ring: Mutex<Option<Arc<Ring>>>,
    pub finished: AtomicBool,
}
impl Control {
    #[cfg(test)]
    pub(crate) fn is_cancelled(&self) -> bool {
        self.stop.load(Ordering::Acquire)
    }
    pub fn cancel(&self) {
        self.stop.store(true, Ordering::Release);
        if let Some(ring) = self.ring.lock().unwrap().as_ref() {
            ring.stop.store(true, Ordering::Release);
        }
        for helper in self.helper.lock().unwrap().iter() {
            helper.stop();
        }
    }
    fn register(&self, helper: StreamStop) {
        self.helper.lock().unwrap().push(helper);
        if self.stop.load(Ordering::Acquire) {
            self.cancel();
        }
    }
}

use crispaudio_media::native_graph::{Graph, Insert, Source, Stereo};
struct NativeInsert {
    stream: PluginStream,
    latency: usize,
    bypass: bool,
    dry: Vec<Stereo>,
    cursor: usize,
}
impl Insert for NativeInsert {
    fn latency(&self) -> usize {
        self.latency
    }
    fn process(&mut self, pcm: &mut [Stereo], _: u32) -> Result<(), String> {
        let input = vec![
            pcm.iter().map(|v| v[0]).collect(),
            pcm.iter().map(|v| v[1]).collect(),
        ];
        // Scope-specific musical transport is a later integration, not guessed here.
        let reply = self.stream.process(&input, &json!({}), self.bypass)?;
        if reply.metadata["latencySamples"].as_u64() != Some(self.latency as u64) {
            return Err("Native graph plugin latency changed".into());
        }
        for (i, sample) in pcm.iter_mut().enumerate() {
            *sample = [reply.samples[0][i], reply.samples[1][i]];
            if self.bypass && !self.dry.is_empty() {
                std::mem::swap(sample, &mut self.dry[self.cursor]);
                self.cursor = (self.cursor + 1) % self.dry.len();
            }
        }
        Ok(())
    }
}
fn graph_fixture(vst: &str, au: &str, control: &Control) -> Result<Graph, String> {
    let native = |id: &str, bypass: bool, parameters: Value| json!([{"instanceId":"i","pluginId":id,"enabled":true,"bypass":bypass,"parameters":parameters,"state":""}]);
    let clip = |id: &str, source: &str| json!({"id":id,"sourceId":source,"startTime":0,"sourceOffset":0,"duration":BLOCKS as f64*FRAMES as f64/48000.,"gain":1,"effects":[]});
    let mut wet = clip("wet", "source");
    wet["nativeEffects"] = native(vst, false, json!({"100":0.002,"101":0}));
    let project = json!({"sampleRate":48000,"duration":BLOCKS as f64*FRAMES as f64/48000.,"masterVolume":0.5,"nativeEffects":native(au,true,json!({"0":440})),"tracks":[
 {"id":"wet","volume":0.5,"pan":0,"segments":[wet],"nativeEffects":native(au,true,json!({"0":440})),"output":"bus","sends":[{"id":"pre","target":"master","gain":0.25,"preFader":true},{"id":"post","target":"master","gain":0.25,"preFader":false}]},
 {"id":"dry","volume":0.375,"pan":0,"segments":[clip("dry","dry")]},
 {"id":"bus","kind":"bus","volume":0.5,"pan":0,"segments":[],"nativeEffects":native(vst,false,json!({"100":0.002,"101":0}))}]});
    let source = |delay: usize| -> Result<Source, String> {
        let mut pcm = vec![vec![0.; BLOCKS * FRAMES]; 2];
        for frame in (4096 + delay..BLOCKS * FRAMES).step_by(8192) {
            pcm[0][frame] = 0.75;
            pcm[1][frame] = -0.625;
        }
        Source::new(pcm)
    };
    prepare_graph(
        &project,
        std::collections::HashMap::from([
            ("source".into(), source(0)?),
            ("dry".into(), source(192)?),
        ]),
        control,
    )
}
fn prepare_graph(
    project: &Value,
    sources: std::collections::HashMap<String, Source>,
    control: &Control,
) -> Result<Graph, String> {
    Graph::prepare(project, sources, |entry| {
        let stream = PluginStream::open_with_stop(
            &json!({"id":entry["pluginId"],"sampleRate":48000,"channels":2,"processMode":"realtime","parameters":entry["parameters"],"state":entry["state"]}),
            |helper| control.register(helper),
        )?;
        let latency = stream.info["latencySamples"]
            .as_u64()
            .ok_or("Missing graph plugin latency")? as usize;
        if latency > 480000 {
            return Err("Invalid graph native latency".into());
        }
        Ok(Box::new(NativeInsert {
            stream,
            latency,
            bypass: entry["bypass"] == true,
            dry: vec![[0.; 2]; latency],
            cursor: 0,
        }))
    })
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
    blocks: usize,
    frames: usize,
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
        if data.blocks < state.blocks {
            data.consumer.fill(out);
            let valid = state
                .frames
                .saturating_sub(data.blocks * FRAMES)
                .min(FRAMES);
            out[valid * 2..].fill(0.);
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
    let deadline = Instant::now() + Duration::from_secs_f64(state.frames as f64 / 48000. + 3.);
    let mut hardware = Vec::with_capacity(400);
    let mut next_sample = Instant::now();
    while state.completed.load(Ordering::Acquire) < state.blocks
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
    graph_au: Option<String>,
    started: impl FnOnce() -> Result<(), String>,
) -> Result<Value, String> {
    run(
        plugin,
        device,
        stop,
        starve,
        graph_au,
        None,
        0,
        BLOCKS * FRAMES,
        started,
    )
}
pub fn capture_snapshot(
    snapshot: Arc<crispaudio_media::native_snapshot::Snapshot>,
    device: String,
    stop: Arc<Control>,
    start: u32,
    end: u32,
    started: impl FnOnce() -> Result<(), String>,
) -> Result<Value, String> {
    let duration = snapshot.project["duration"]
        .as_f64()
        .ok_or("Invalid native snapshot duration")?;
    if end <= start
        || end as f64 > (duration * 48000.).round()
        || end - start < 2048
        || end - start > 480000
    {
        return Err("Invalid native capture range".into());
    }
    run(
        String::new(),
        device,
        stop,
        false,
        None,
        Some(snapshot),
        start,
        (end - start) as usize,
        started,
    )
}
fn run(
    plugin: String,
    device: String,
    stop: Arc<Control>,
    starve: bool,
    graph_au: Option<String>,
    snapshot: Option<Arc<crispaudio_media::native_snapshot::Snapshot>>,
    start_frame: u32,
    capture_frames: usize,
    started: impl FnOnce() -> Result<(), String>,
) -> Result<Value, String> {
    let snapshot_mode = snapshot.is_some();
    let total_blocks = capture_frames.div_ceil(FRAMES);
    let graph_mode = graph_au.is_some();
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
        let _snapshot_lease = snapshot.clone();
        let mut graph = if let Some(snapshot) = snapshot {
            Some(prepare_graph(
                &snapshot.project,
                snapshot.sources.clone(),
                &worker_stop,
            )?)
        } else if let Some(au) = graph_au {
            Some(graph_fixture(&plugin, &au, &worker_stop)?)
        } else {
            None
        };
        let mut stream = if graph.is_none() {
            Some(PluginStream::open_with_stop(
                &json!({"id":plugin,"sampleRate":48000,"channels":2,"processMode":"realtime","parameters":{"100":0.002,"101":0},"bypass":false}),
                |helper| worker_stop.register(helper),
            )?)
        } else {
            None
        };
        let history_frames = if snapshot_mode {
            start_frame
                .checked_add(graph.as_ref().unwrap().latency() as u32)
                .ok_or("Native history clock overflow")?
        } else {
            0
        };
        let mut warmed = 0;
        while warmed < history_frames {
            if worker_stop.stop.load(Ordering::Acquire) || worker_ring.stop.load(Ordering::Acquire)
            {
                return Err("Native snapshot preparation cancelled".into());
            }
            let length = (history_frames - warmed).min(4096);
            let mut discard = vec![[0.; 2]; length as usize];
            graph.as_mut().unwrap().render(&mut discard)?;
            warmed += length;
        }
        let handles = worker_stop.helper.lock().unwrap().clone();
        let graph_latency = graph.as_ref().map(|g| g.latency());
        let mut times = Vec::with_capacity(total_blocks);
        let mut max_process_ms = 0f64;
        let result = (|| -> Result<(), String> {
            for block in 0..total_blocks {
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
                let mut interleaved = [0.; SAMPLES];
                if let Some(graph) = &mut graph {
                    let mut pcm = vec![[0.; 2]; FRAMES];
                    graph.render(&mut pcm)?;
                    for (i, sample) in pcm.iter().enumerate() {
                        interleaved[i * 2] = sample[0];
                        interleaved[i * 2 + 1] = sample[1];
                    }
                } else {
                    let reply = stream.as_mut().unwrap().process_with_transport(
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
                    for i in 0..FRAMES {
                        interleaved[i * 2] = reply.samples[0][i];
                        interleaved[i * 2 + 1] = reply.samples[1][i];
                    }
                }
                max_process_ms = max_process_ms.max(t.elapsed().as_secs_f64() * 1000.);
                times.push(epoch + clock.elapsed().as_secs_f64() * 1000.);
                while !producer.push(&interleaved) {
                    if worker_stop.stop.load(Ordering::Acquire)
                        || worker_ring.stop.load(Ordering::Acquire)
                        || worker_ring.fault.load(Ordering::Acquire) != 0
                    {
                        return Ok(());
                    }
                    thread::sleep(Duration::from_micros(250));
                }
                if block == total_blocks.min(SLOTS) - 1 {
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
        drop(graph);
        drop(stream);
        if !worker_stop.stop.load(Ordering::Acquire) {
            result?;
        }
        Ok(
            json!({"historyFrames":history_frames,"processTimes":times,"maxProcessMs":max_process_ms,"helperClosed":handles.iter().all(|handle|!handle.is_alive()),"helpers":handles.len(),"graphLatency":graph_latency}),
        )
    });
    let state = CallbackState {
        data: UnsafeCell::new(CallbackData {
            consumer,
            capture: vec![0.; total_blocks * SAMPLES],
            times: vec![0.; total_blocks],
            blocks: 0,
        }),
        entered: AtomicBool::new(false),
        completed: AtomicUsize::new(0),
        callbacks: AtomicU64::new(0),
        clock,
        epoch,
        blocks: total_blocks,
        frames: capture_frames,
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
    let mut samples = Vec::new();
    let mut nonzero = 0usize;
    let mut hash = 2166136261u32;
    for i in 0..(data.blocks * FRAMES).min(capture_frames) {
        let l = data.capture[i * 2];
        let r = data.capture[i * 2 + 1];
        for value in [l, r] {
            for byte in value.to_le_bytes() {
                hash = (hash ^ (byte as u32)).wrapping_mul(16777619);
            }
        }
        if l.abs() > 1e-6 || r.abs() > 1e-6 {
            if samples.len() < 256 {
                samples.push(json!({"frame":i,"left":l,"right":r}));
            }
            nonzero += 1;
            if !snapshot_mode || impulses.len() < 256 {
                impulses.push(i);
            }
            let gain = if graph_mode {
                if i >= 4192 && (i - 4192) % 8192 == 0 {
                    0.1875
                } else {
                    0.3125
                }
            } else {
                1.
            };
            if (l - 0.75 * gain).abs() > 2e-6 || (r + 0.625 * gain).abs() > 2e-6 {
                invalid += 1;
            }
        }
    }
    let expected = if graph_mode {
        (4096..BLOCKS * FRAMES)
            .step_by(8192)
            .flat_map(|frame| [frame + 96, frame + 192])
            .filter(|frame| *frame < BLOCKS * FRAMES)
            .collect::<Vec<_>>()
    } else {
        (4096 + 96..BLOCKS * FRAMES)
            .step_by(8192)
            .collect::<Vec<_>>()
    };
    Ok(
        json!({"kind":if snapshot_mode {"native-snapshot-clock"}else if graph_mode {"native-graph-clock"}else{"native-clock"},"hardwareTimes":hardware,"fault":fault,"blocks":data.blocks,"frames":(data.blocks*FRAMES).min(capture_frames),"pcmHash":hash,"nonZeroFrames":nonzero,"endPaddingSilent":data.blocks*FRAMES>=capture_frames&&data.capture[capture_frames*2..data.blocks*SAMPLES].iter().all(|v|*v==0.),"samples":samples,"blockFrames":FRAMES,"ringSlots":SLOTS,"queueBuffers":2,"rate":48000,"deviceBound":true,"muted":true,"impulses":impulses,"pcmExact":if snapshot_mode {Value::Null}else{json!(impulses==expected&&invalid==0)},"faultBlockSilent":fault!=0&&data.blocks>0&&data.capture[(data.blocks-1)*SAMPLES..data.blocks*SAMPLES].iter().all(|v|*v==0.),"callbackTimes":&data.times[..data.blocks],"worker":stats,"cancelled":stop.stop.load(Ordering::Acquire)}),
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
