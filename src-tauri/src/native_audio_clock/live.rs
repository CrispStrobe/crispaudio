//! Continuous, native-owned transport. The callback only consumes bounded PCM.
//! Control/polling and plugins run off the callback and WebKit document thread.
use super::*;
use crispaudio_media::monitor_click::MonitorClick;
use std::sync::atomic::AtomicU32;

#[derive(Default)]
pub struct LiveControl {
    pub stop: Arc<Control>,
    paused: AtomicBool,
    volume: AtomicU32,
    phase: AtomicUsize,
    position: AtomicU64,
    position_time: AtomicU64,
    rendered: AtomicU64,
    max_process_ns: AtomicU64,
    callbacks: AtomicU64,
    peaks: [AtomicU32; 2],
    fault: AtomicUsize,
    pending: Mutex<
        Option<(
            u64,
            crispaudio_media::native_graph::MixControls,
            Option<MonitorClick>,
        )>,
    >,
    revision: AtomicU64,
    applied: AtomicU64,
    meters: Mutex<Value>,
    loudness: Mutex<Value>,
    reset_loudness: AtomicBool,
}
impl LiveControl {
    pub fn new() -> Self {
        Self {
            volume: AtomicU32::new(1f32.to_bits()),
            ..Self::default()
        }
    }
    pub fn pause(&self, paused: bool) {
        self.paused.store(paused, Ordering::Release);
    }
    pub fn volume(&self, volume: f32) -> Result<(), String> {
        if !volume.is_finite() || !(0.0..=1.0).contains(&volume) {
            return Err("Invalid monitor volume".into());
        }
        self.volume.store(volume.to_bits(), Ordering::Release);
        Ok(())
    }
    pub fn update(&self, mut value: Value) -> Result<u64, String> {
        if value.to_string().len() > 4_000_000 {
            return Err("Native controls exceed limit".into());
        }
        let click = MonitorClick::parse(&value["music"])?;
        if let Some(object) = value.as_object_mut() {
            object.remove("music");
        }
        let update =
            serde_json::from_value(value).map_err(|e| format!("Invalid native controls: {e}"))?;
        let mut pending = self.pending.lock().unwrap();
        let revision = self.revision.fetch_add(1, Ordering::AcqRel) + 1;
        *pending = Some((revision, update, click));
        Ok(revision)
    }
    fn apply(&self, graph: &mut Graph, click: &mut Option<MonitorClick>) -> Result<(), String> {
        if let Some((revision, update, next_click)) = self.pending.lock().unwrap().take() {
            graph.update_controls(update)?;
            *click = next_click;
            self.applied.store(revision, Ordering::Release);
        }
        Ok(())
    }
    #[cfg(feature = "native-validation")]
    pub fn validation_fault(&self, kind: &str) -> Result<(), String> {
        match kind {
            "helper" => {
                for helper in self.stop.helper.lock().unwrap().iter() {
                    helper.stop();
                }
                Ok(())
            }
            "underrun" => {
                self.stop
                    .ring
                    .lock()
                    .unwrap()
                    .as_ref()
                    .ok_or("No native ring")?
                    .fail(99);
                Ok(())
            }
            _ => Err("Unknown validation fault".into()),
        }
    }
    pub fn reset_loudness(&self) {
        *self.loudness.lock().unwrap() = Value::Null;
        self.reset_loudness.store(true, Ordering::Release);
    }
    pub fn status(&self) -> Value {
        json!({"phase":(["preparing","playing","paused","ended","fault","stopped"][self.phase.load(Ordering::Acquire).min(5)]),
            "frame":self.position.load(Ordering::Acquire),"clockTimeMs":self.position_time.load(Ordering::Acquire),"renderedFrames":self.rendered.load(Ordering::Acquire),"maxProcessMs":self.max_process_ns.load(Ordering::Acquire)as f64/1_000_000.,
            "callbacks":self.callbacks.load(Ordering::Acquire),"fault":self.fault.load(Ordering::Acquire),
            "loudness":self.loudness.lock().unwrap().clone(),"appliedRevision":self.applied.load(Ordering::Acquire),"meters":self.meters.lock().unwrap().clone(),
            "peaks":self.peaks.each_ref().map(|v|f32::from_bits(v.load(Ordering::Acquire)))})
    }
}
#[derive(Clone, Copy, Default)]
struct Captured {
    frame: u64,
    left: f32,
    right: f32,
}
struct LiveData {
    consumer: Consumer,
    queued: u64,
    captured: [Captured; 256],
    captured_count: usize,
}
struct Output {
    data: UnsafeCell<LiveData>,
    entered: AtomicBool,
    control: Arc<LiveControl>,
    ring: Arc<Ring>,
    end: Option<u64>,
}
impl Output {
    /// The sole bounded PCM consumer. Hardware and null-output qualification use
    /// this exact path; neither DSP nor control operations run here.
    fn fill(&self, output: &mut [f32]) {
        if output.len() != SAMPLES {
            output.fill(0.);
            self.ring.fail(2);
            return;
        }
        output.fill(0.);
        if self
            .entered
            .compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
            .is_err()
        {
            self.ring.fail(3);
        } else {
            // The CAS above grants this consumer exclusive access until release.
            let data = unsafe { &mut *self.data.get() };
            let count = self.end.map_or(FRAMES, |end| {
                end.saturating_sub(data.queued).min(FRAMES as u64) as usize
            });
            if count > 0 && data.consumer.fill(output) {
                output[count * 2..].fill(0.);
                let mut peaks = [0f32; 2];
                for (index, sample) in output.chunks_exact(2).take(count).enumerate() {
                    for ch in 0..2 {
                        peaks[ch] = peaks[ch].max(sample[ch].abs());
                    }
                    if data.captured_count < 256 && sample.iter().any(|v| v.abs() > 1e-6) {
                        data.captured[data.captured_count] = Captured {
                            frame: data.queued + index as u64,
                            left: sample[0],
                            right: sample[1],
                        };
                        data.captured_count += 1;
                    }
                }
                for (ch, peak) in peaks.iter().enumerate() {
                    self.control.peaks[ch].store(peak.to_bits(), Ordering::Release);
                }
            }
            data.queued += FRAMES as u64;
            self.entered.store(false, Ordering::Release);
        }
        self.control.callbacks.fetch_add(1, Ordering::Relaxed);
    }
}
unsafe extern "C" fn callback(user: *mut c_void, queue: Queue, buffer: *mut Buffer) {
    let state = &*(user as *const Output);
    if buffer.is_null() || (*buffer).capacity as usize != SAMPLES * 4 || (*buffer).data.is_null() {
        state.ring.fail(2);
        return;
    }
    let output = std::slice::from_raw_parts_mut((*buffer).data.cast::<f32>(), SAMPLES);
    state.fill(output);
    (*buffer).size = (SAMPLES * 4) as u32;
    if !state.ring.stop.load(Ordering::Acquire)
        && AudioQueueEnqueueBuffer(queue, buffer, 0, std::ptr::null()) != 0
        && !state.ring.stop.load(Ordering::Acquire)
    {
        state.ring.fail(4);
    }
}
#[link(name = "AudioToolbox", kind = "framework")]
extern "C" {
    fn AudioQueuePause(queue: Queue) -> i32;
    fn pthread_set_qos_class_self_np(class: u32, relative: i32) -> i32;
}

/// Owns the render thread on every path, including failed device creation.
struct Worker {
    control: Arc<LiveControl>,
    handle: Option<thread::JoinHandle<Result<(), String>>>,
}
impl Drop for Worker {
    fn drop(&mut self) {
        self.control.stop.cancel();
        if let Some(worker) = self.handle.take() {
            let _ = worker.join();
        }
    }
}

pub fn run(
    snapshot: Arc<crispaudio_media::native_snapshot::Snapshot>,
    device: String,
    start: u32,
    end: u32,
    cycle: bool,
    loop_start: Option<u32>,
    muted: bool,
    control: Arc<LiveControl>,
) -> Result<Value, String> {
    run_with_output(
        snapshot,
        start,
        end,
        cycle,
        loop_start,
        muted,
        control,
        2,
        |state| {
            play_device(
                state,
                &device,
                start,
                end,
                cycle,
                loop_start.unwrap_or(start),
                muted,
            )
        },
    )
}

fn run_with_output<F>(
    snapshot: Arc<crispaudio_media::native_snapshot::Snapshot>,
    start: u32,
    end: u32,
    cycle: bool,
    loop_start: Option<u32>,
    muted: bool,
    control: Arc<LiveControl>,
    queue_buffers: usize,
    output: F,
) -> Result<Value, String>
where
    F: FnOnce(&Output) -> Result<(), String>,
{
    struct Finished(Arc<LiveControl>);
    impl Drop for Finished {
        fn drop(&mut self) {
            self.0.stop.finished.store(true, Ordering::Release);
        }
    }
    let _finished = Finished(control.clone());
    let duration = snapshot.project["duration"]
        .as_f64()
        .ok_or("Invalid live duration")?;
    if start >= end || end as f64 > (duration * 48000.).round() {
        return Err("Invalid live playback range".into());
    }
    let cycle_start = loop_start.unwrap_or(start);
    if cycle_start > start {
        return Err("Invalid native cycle start".into());
    }
    let count = (!cycle).then_some((end - start) as u64);
    control.position.store(start as u64, Ordering::Release);
    let (mut producer, consumer) = ring();
    let shared = producer.ring.clone();
    *control.stop.ring.lock().unwrap() = Some(shared.clone());
    let (render_ready, ready) = std::sync::mpsc::sync_channel(1);
    let worker_control = control.clone();
    let worker_ring = shared.clone();
    let handle = thread::spawn(move || -> Result<(), String> {
        let result = (|| {
            if worker_control.stop.stop.load(Ordering::Acquire) {
                return Ok(());
            }
            // Scheduling priority follows audio work even when the window is hidden.
            if unsafe { pthread_set_qos_class_self_np(0x21, 0) } != 0 {
                return Err("Cannot schedule native audio worker".into());
            }
            let mut click = MonitorClick::parse(&snapshot.project["music"])?;
            let mut graph = prepare_graph(
                &snapshot.project,
                snapshot.sources.clone(),
                &worker_control.stop,
            )?;
            if cycle {
                graph.set_cycle(cycle_start, end)?;
            }
            let history = start
                .checked_add(graph.latency() as u32)
                .ok_or("Native preroll overflow")?;
            let mut warmed = 0;
            while warmed < history {
                if worker_control.stop.stop.load(Ordering::Acquire) {
                    return Err("Native playback cancelled".into());
                }
                let n = (history - warmed).min(4096);
                graph.render(&mut vec![[0.; 2]; n as usize])?;
                warmed += n;
            }
            crispaudio_media::realtime_macos::configure(FRAMES as u32, 48000.)?;
            let mut loudness = crispaudio_media::loudness_meter::Meter::default();
            let mut rendered = 0u64;
            let mut ready = false;
            loop {
                if worker_control.stop.stop.load(Ordering::Acquire)
                    || worker_ring.stop.load(Ordering::Acquire)
                    || worker_ring.fault.load(Ordering::Acquire) != 0
                {
                    break;
                }
                worker_control.apply(&mut graph, &mut click)?;
                if ready && worker_control.paused.load(Ordering::Acquire) {
                    thread::sleep(Duration::from_millis(1));
                    continue;
                }
                let frames = count.map_or(FRAMES, |n| {
                    n.saturating_sub(rendered).min(FRAMES as u64) as usize
                });
                if frames == 0 {
                    break;
                }
                let processing = Instant::now();
                let mut pcm = vec![[0.; 2]; frames];
                graph.render(&mut pcm)?;
                if worker_control.reset_loudness.swap(false, Ordering::AcqRel) {
                    loudness = crispaudio_media::loudness_meter::Meter::default();
                }
                let mut reading = false;
                for sample in &pcm {
                    reading |= loudness.frame(*sample);
                }
                if reading {
                    *worker_control.loudness.lock().unwrap() =
                        serde_json::to_value(loudness.reading()).map_err(|e| e.to_string())?;
                }
                let mut next = graph.meters();
                let mut meters = worker_control.meters.lock().unwrap();
                let decay = (-(frames as f64) / 48000. / 0.15).exp();
                if let Some(values) = next.as_object_mut() {
                    for (id, value) in values {
                        let old = &meters[id];
                        let peak = value["peak"].as_f64().unwrap();
                        let rms = value["rms"].as_f64().unwrap();
                        value["peak"] = json!(peak.max(old["peak"].as_f64().unwrap_or(0.) * decay));
                        value["rms"] = json!((rms * rms * (1. - decay)
                            + old["rms"].as_f64().unwrap_or(0.).powi(2) * decay)
                            .sqrt());
                    }
                }
                *meters = next;
                drop(meters);
                if let Some(click) = &click {
                    click.mix(
                        &mut pcm,
                        start as u64 + rendered,
                        cycle.then_some((cycle_start, end)),
                    );
                }
                worker_control
                    .max_process_ns
                    .fetch_max(processing.elapsed().as_nanos() as u64, Ordering::Relaxed);
                let mut block = [0.; SAMPLES];
                for (i, sample) in pcm.iter().enumerate() {
                    block[i * 2] = sample[0];
                    block[i * 2 + 1] = sample[1];
                }
                while !producer.push(&block) {
                    worker_control.apply(&mut graph, &mut click)?;
                    if worker_control.stop.stop.load(Ordering::Acquire)
                        || worker_ring.stop.load(Ordering::Acquire)
                        || worker_ring.fault.load(Ordering::Acquire) != 0
                    {
                        return Ok(());
                    }
                    thread::sleep(Duration::from_micros(250));
                }
                rendered += frames as u64;
                worker_control.rendered.store(rendered, Ordering::Release);
                if !ready && (rendered >= (FRAMES * SLOTS) as u64 || count == Some(rendered)) {
                    render_ready
                        .send(())
                        .map_err(|_| "Playback preparation cancelled")?;
                    ready = true;
                }
            }
            Ok(())
        })();
        if result.is_err() && !worker_control.stop.stop.load(Ordering::Acquire) {
            worker_ring.fail(6);
        }
        result
    });
    let mut worker = Worker {
        control: control.clone(),
        handle: Some(handle),
    };
    let state = Box::new(Output {
        data: UnsafeCell::new(LiveData {
            consumer,
            queued: 0,
            captured: [Captured::default(); 256],
            captured_count: 0,
        }),
        entered: AtomicBool::new(false),
        control: control.clone(),
        ring: shared.clone(),
        end: count,
    });
    let result = (|| -> Result<(), String> {
        ready
            .recv_timeout(Duration::from_secs(30))
            .map_err(|_| "Native playback preparation failed")?;
        if control.stop.stop.load(Ordering::Acquire) {
            return Ok(());
        }
        output(&state)
    })();
    let cancelled =
        control.stop.stop.load(Ordering::Acquire) && shared.fault.load(Ordering::Acquire) == 0;
    shared.stop.store(true, Ordering::Release);
    control.stop.cancel();
    let rendered = worker
        .handle
        .take()
        .unwrap()
        .join()
        .map_err(|_| "Native live render thread panicked")?;
    if !cancelled && (result.is_err() || rendered.is_err()) {
        control.phase.store(4, Ordering::Release);
    } else if control.phase.load(Ordering::Acquire) != 3 {
        control.phase.store(5, Ordering::Release);
    }
    for peak in &control.peaks {
        peak.store(0f32.to_bits(), Ordering::Release);
    }
    let data = state.data.into_inner();
    let captured = data.captured[..data.captured_count]
        .iter()
        .map(|sample| json!({"frame":sample.frame,"left":sample.left,"right":sample.right}))
        .collect::<Vec<_>>();
    let summary = json!({"status":control.status(),"samples":captured,"muted":muted,"helpersClosed":control.stop.helper.lock().unwrap().iter().all(|h|!h.is_alive()),"ringSlots":SLOTS,"queueBuffers":queue_buffers});
    if !cancelled {
        rendered?;
        result?;
    }
    Ok(summary)
}

fn publish_clock(
    control: &LiveControl,
    start: u32,
    end: u32,
    cycle: bool,
    cycle_start: u32,
    elapsed: u64,
) -> bool {
    let absolute = start as u64 + elapsed;
    let position = if cycle && absolute >= end as u64 {
        cycle_start as u64 + (absolute - cycle_start as u64) % (end - cycle_start) as u64
    } else {
        absolute.min(end as u64)
    };
    control.position.store(position, Ordering::Release);
    control.position_time.store(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
        Ordering::Release,
    );
    let ended = !cycle && elapsed >= (end - start) as u64;
    if ended {
        control.phase.store(3, Ordering::Release);
    }
    ended
}

fn play_device(
    state: &Output,
    device: &str,
    start: u32,
    end: u32,
    cycle: bool,
    cycle_start: u32,
    muted: bool,
) -> Result<(), String> {
    let control = &state.control;
    let shared = &state.ring;
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
            callback,
            (&*state as *const Output as *mut Output).cast(),
            std::ptr::null(),
            std::ptr::null(),
            0,
            &mut raw,
        )
    })?;
    let queue = AudioQueue(raw, shared.clone());
    let uid = std::ffi::CString::new(device).map_err(|_| "Invalid output UID")?;
    let name = unsafe { CFStringCreateWithCString(std::ptr::null(), uid.as_ptr(), 0x08000100) };
    if name.is_null() {
        return Err("Cannot create output UID".into());
    }
    let bound = unsafe {
        AudioQueueSetProperty(
            queue.0,
            u32::from_be_bytes(*b"aqcd"),
            (&name as *const *const c_void).cast(),
            std::mem::size_of_val(&name) as u32,
        )
    };
    unsafe { CFRelease(name) };
    check(bound)?;
    let mut volume = if muted {
        0.
    } else {
        f32::from_bits(control.volume.load(Ordering::Acquire))
    };
    check(unsafe { AudioQueueSetParameter(queue.0, 1, volume) })?;
    for _ in 0..2 {
        let mut buffer = std::ptr::null_mut();
        check(unsafe { AudioQueueAllocateBuffer(queue.0, (SAMPLES * 4) as u32, &mut buffer) })?;
        unsafe {
            callback(
                (&*state as *const Output as *mut Output).cast(),
                queue.0,
                buffer,
            )
        };
    }
    let mut paused = control.paused.load(Ordering::Acquire);
    if !paused {
        check(unsafe { AudioQueueStart(queue.0, std::ptr::null()) })?;
    }
    control
        .phase
        .store(if paused { 2 } else { 1 }, Ordering::Release);
    let mut device_check = Instant::now();
    let mut last_clock = Instant::now();
    let mut previous_sample = f64::NEG_INFINITY;
    while !control.stop.stop.load(Ordering::Acquire) {
        let fault = shared.fault.load(Ordering::Acquire);
        if fault != 0 {
            control.fault.store(fault, Ordering::Release);
            return Err(format!("Native playback fault ({fault})"));
        }
        let desired = control.paused.load(Ordering::Acquire);
        if paused != desired {
            check(unsafe {
                if desired {
                    AudioQueuePause(queue.0)
                } else {
                    AudioQueueStart(queue.0, std::ptr::null())
                }
            })?;
            paused = desired;
            last_clock = Instant::now();
            control
                .phase
                .store(if paused { 2 } else { 1 }, Ordering::Release);
        }
        let desired = if muted {
            0.
        } else {
            f32::from_bits(control.volume.load(Ordering::Acquire))
        };
        if volume != desired {
            check(unsafe { AudioQueueSetParameter(queue.0, 1, desired) })?;
            volume = desired;
        }
        let mut stamp = Timestamp::default();
        let mut discontinuity = 0u8;
        if !paused
            && unsafe {
                AudioQueueGetCurrentTime(queue.0, std::ptr::null(), &mut stamp, &mut discontinuity)
            } == 0
            && stamp.flags & 1 != 0
            && stamp.sample.is_finite()
        {
            if discontinuity != 0 || stamp.sample < previous_sample {
                shared.fail(7);
                return Err(format!("Native device clock discontinuity: previous={previous_sample}, current={}, paused={paused}",stamp.sample));
            }
            if stamp.sample > previous_sample {
                last_clock = Instant::now();
                previous_sample = stamp.sample;
            }
            let elapsed = stamp.sample.max(0.) as u64;
            if publish_clock(control, start, end, cycle, cycle_start, elapsed) {
                break;
            }
        }
        if !paused && last_clock.elapsed() > Duration::from_secs(2) {
            shared.fail(8);
        }
        if device_check.elapsed() > Duration::from_millis(500) {
            if !crate::commands::audio_output::list_audio_outputs()?
                .iter()
                .any(|d| d.id == device)
            {
                shared.fail(9);
            }
            device_check = Instant::now();
        }
        thread::sleep(Duration::from_millis(2));
    }
    // Dispose synchronously before reading callback-owned capture storage.
    check(unsafe { AudioQueueSetParameter(queue.0, 1, 0.) })?;
    drop(queue);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn click_packets_validate_before_replacing_pending_mix_controls() {
        let control = LiveControl::new();
        let music = json!({"tempo":120,"numerator":4,"denominator":4,"origin":0,
            "metronome":true,"clickLevel":0.5});
        let packet = json!({"masterVolume":1,"tracks":[],"music":music});
        assert_eq!(control.update(packet.clone()).unwrap(), 1);
        let mut invalid = packet.clone();
        invalid["music"]["clickLevel"] = json!(2);
        assert!(control.update(invalid).is_err());
        assert_eq!(control.pending.lock().unwrap().as_ref().unwrap().0, 1);
        let mut unknown = packet.clone();
        unknown["unexpected"] = json!(true);
        assert!(control.update(unknown).is_err());
        assert_eq!(control.revision.load(Ordering::Acquire), 1);
        assert_eq!(
            control
                .update(json!({"masterVolume":1,"tracks":[],"music":null}))
                .unwrap(),
            2
        );
        assert!(control
            .pending
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .2
            .is_none());
    }
}

#[cfg(test)]
#[path = "live/null_tests.rs"]
mod null_tests;
