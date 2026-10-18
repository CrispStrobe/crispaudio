//! Worker-prepared backing audio. Output callbacks consume fixed bounded PCM;
//! graph rendering, helper cancellation and worker joins stay off callback.
use super::{queue, Fault, Packet, Reader as QueueReader, Status, MAX_FRAMES};
use crate::{
    native_graph::{Graph, Stereo},
    plugin_stream::StreamStop,
    Result,
};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};

pub const SLOTS: usize = 16;
#[derive(Clone, Default)]
pub struct Control(Arc<ControlData>);
#[derive(Default)]
struct ControlData {
    cancelled: AtomicBool,
    helpers: Mutex<Vec<StreamStop>>,
}
impl Control {
    pub fn cancelled(&self) -> bool {
        self.0.cancelled.load(Ordering::Acquire)
    }
    /// Register as soon as a helper is spawned, before a potentially blocking
    /// handshake. A late registration after cancellation is stopped immediately.
    pub fn register(&self, helper: StreamStop) {
        let mut helpers = self.0.helpers.lock().unwrap_or_else(|p| p.into_inner());
        if self.cancelled() {
            drop(helpers);
            helper.stop();
        } else {
            helpers.push(helper);
        }
    }
    fn stop(&self) {
        self.0.cancelled.store(true, Ordering::Release);
        let helpers =
            std::mem::take(&mut *self.0.helpers.lock().unwrap_or_else(|p| p.into_inner()));
        for helper in helpers {
            helper.stop();
        }
    }
}
struct Cleanup(Control);
impl Drop for Cleanup {
    fn drop(&mut self) {
        self.0.stop();
    }
}
/// The owner must register external helper stop handles with Control. A renderer
/// must cooperate with cancellation; arbitrary blocking user code cannot be killed.
pub trait Renderer: Send + 'static {
    fn render(&mut self, output: &mut [Stereo]) -> Result<()>;
}
impl Renderer for Graph {
    fn render(&mut self, output: &mut [Stereo]) -> Result<()> {
        Graph::render(self, output)
    }
}

pub struct Worker {
    status: Status<SLOTS>,
    control: Control,
    thread: Option<JoinHandle<()>>,
}
pub struct Reader {
    input: QueueReader<SLOTS>,
    frames: u64,
    consumed: u64,
    next_packet: u64,
    pending: Option<Packet>,
    offset: usize,
    fault: Option<Fault>,
}
impl Worker {
    /// Prepares the renderer ON the worker and returns only after 16 blocks (or
    /// the complete shorter backing) are ready. Frames exclude graph preroll.
    /// No total backing PCM allocation: storage is fixed at 16 x 512 frames.
    pub fn start<R: Renderer>(
        timeout: Duration,
        prepare: impl FnOnce(Control) -> Result<(R, u64)> + Send + 'static,
    ) -> Result<(Self, Reader)> {
        if timeout.is_zero() {
            return Err("Invalid backing startup timeout".into());
        }
        let (mut writer, input) = queue::<SLOTS>();
        let status = input.status();
        let control = Control::default();
        let worker_control = control.clone();
        let worker_status = status.clone();
        let (tx, rx) = mpsc::sync_channel(1);
        let task = thread::Builder::new()
            .name("native-recording-backing".into())
            .spawn(move || {
                let _cleanup = Cleanup(worker_control.clone());
                let result: Result<()> = (|| {
                    let (mut renderer, frames) = prepare(worker_control.clone())?;
                    if frames == 0 || frames > 32_000_000 {
                        return Err("Invalid backing frame budget".into());
                    }
                    let mut rendered = 0u64;
                    let mut ready = false;
                    while rendered < frames {
                        if worker_control.cancelled() || worker_status.fault().is_some() {
                            return Ok(());
                        }
                        // Sole producer: capacity cannot shrink between this check
                        // and publication. Full means backpressure, never Overflow.
                        let w = writer.queue.write.load(Ordering::Relaxed);
                        if w.wrapping_sub(writer.queue.read.load(Ordering::Acquire)) == SLOTS {
                            thread::park_timeout(Duration::from_millis(1));
                            continue;
                        }
                        let length = (frames - rendered).min(MAX_FRAMES as u64) as usize;
                        let mut packet = Packet {
                            first_frame: rendered,
                            length,
                            ..Packet::default()
                        };
                        renderer.render(&mut packet.pcm[..length])?;
                        if packet
                            .samples()
                            .iter()
                            .flatten()
                            .any(|value| !value.is_finite())
                        {
                            return Err("Non-finite backing PCM".into());
                        }
                        if worker_control.cancelled() || worker_status.fault().is_some() {
                            return Ok(());
                        }
                        if !writer.push(&packet) {
                            return Err("Backing publication failed".into());
                        }
                        rendered += length as u64;
                        if !ready && (rendered >= (SLOTS * MAX_FRAMES) as u64 || rendered == frames)
                        {
                            tx.send(Ok(frames))
                                .map_err(|_| "Backing preparation cancelled")?;
                            ready = true;
                        }
                    }
                    Ok(())
                })();
                if let Err(reason) = result {
                    worker_status.fail(Fault::Processor);
                    let _ = tx.send(Err(reason));
                }
            })
            .map_err(|e| e.to_string())?;
        let mut owner = Self {
            status,
            control,
            thread: Some(task),
        };
        match rx.recv_timeout(timeout) {
            Ok(Ok(frames)) => Ok((
                owner,
                Reader {
                    input,
                    frames,
                    consumed: 0,
                    next_packet: 0,
                    pending: None,
                    offset: 0,
                    fault: None,
                },
            )),
            result => {
                owner.close();
                Err(match result {
                    Ok(Err(reason)) => reason,
                    Err(mpsc::RecvTimeoutError::Timeout) => "Backing startup timed out".into(),
                    _ => "Backing worker failed during startup".into(),
                })
            }
        }
    }
    /// Warm graph history (including plug-in latency) before publishing backing.
    /// Project range is finite and non-looping here; capture owner maps its frame
    /// zero to the chosen output/project anchor, without changing input clocks.
    pub fn graph(
        timeout: Duration,
        start: u32,
        end: u32,
        prepare: impl FnOnce(Control) -> Result<Graph> + Send + 'static,
    ) -> Result<(Self, Reader)> {
        Self::start(timeout, move |control| {
            let mut graph = prepare(control.clone())?;
            if start >= end || end > graph.duration() {
                return Err("Invalid backing project range".into());
            }
            let mut remaining = start
                .checked_add(
                    u32::try_from(graph.latency()).map_err(|_| "Backing latency overflow")?,
                )
                .ok_or("Backing preroll overflow")?;
            let mut scratch = [[0.; 2]; MAX_FRAMES];
            while remaining != 0 {
                if control.cancelled() {
                    return Err("Backing preparation cancelled".into());
                }
                let count = remaining.min(MAX_FRAMES as u32) as usize;
                graph.render(&mut scratch[..count])?;
                remaining -= count as u32;
            }
            Ok((graph, (end - start) as u64))
        })
    }
    pub fn poll(&mut self) -> Result<()> {
        if self.status.fault().is_some() {
            self.close();
            return Err("Native backing failed or cancelled".into());
        }
        if self.thread.as_ref().is_some_and(|task| task.is_finished()) {
            if self.thread.take().unwrap().join().is_err() {
                self.status.fail(Fault::Processor);
                self.control.stop();
                return Err("Backing worker panicked".into());
            }
        }
        Ok(())
    }
    fn close(&mut self) {
        self.status.cancel();
        self.control.stop();
        if let Some(task) = self.thread.take() {
            task.thread().unpark();
            let _ = task.join();
        }
    }
}
impl Drop for Worker {
    fn drop(&mut self) {
        self.close();
    }
}
impl Reader {
    pub fn status(&self) -> Status<SLOTS> {
        self.input.status()
    }
    pub fn frames(&self) -> u64 {
        self.frames
    }
    pub fn consumed(&self) -> u64 {
        self.consumed
    }
    pub fn fault(&self) -> Option<Fault> {
        self.fault.or(self.input.status().fault())
    }
    /// Consume at most two fixed packets per <=512-frame block. EOF pads the
    /// final output block with intentional silence. Any missing promised PCM
    /// faults immediately; never skip, replay or silently move the timeline.
    pub fn render(&mut self, output: &mut [Stereo]) -> std::result::Result<(), Fault> {
        output.fill([0.; 2]);
        let result = self.render_inner(output);
        if let Err(fault) = result {
            output.fill([0.; 2]);
            self.fault.get_or_insert(fault);
            self.input.status().fail(fault);
        }
        result
    }
    fn render_inner(&mut self, output: &mut [Stereo]) -> std::result::Result<(), Fault> {
        if let Some(fault) = self.fault() {
            return Err(fault);
        }
        if output.is_empty() || output.len() > MAX_FRAMES {
            return Err(Fault::InvalidInput);
        }
        let count = (self.frames - self.consumed).min(output.len() as u64) as usize;
        let mut copied = 0;
        let mut reads = 0;
        while copied < count {
            if self.pending.is_none() {
                if reads == 2 {
                    return Err(Fault::Discontinuous);
                }
                let mut packet = self.input.pop();
                // Observe close, then recheck publication (EOF race).
                if packet.is_none() && self.input.status().closed() {
                    packet = self.input.pop();
                }
                let packet = packet.ok_or(Fault::Discontinuous)?;
                reads += 1;
                let expected = (self.frames - self.next_packet).min(MAX_FRAMES as u64) as usize;
                if packet.first_frame != self.next_packet
                    || packet.length != expected
                    || expected == 0
                {
                    return Err(Fault::Discontinuous);
                }
                self.next_packet += expected as u64;
                self.pending = Some(packet);
                self.offset = 0;
            }
            let packet = self.pending.as_ref().unwrap();
            let n = (count - copied).min(packet.length - self.offset);
            output[copied..copied + n]
                .copy_from_slice(&packet.samples()[self.offset..self.offset + n]);
            copied += n;
            self.offset += n;
            if self.offset == packet.length {
                self.pending = None;
            }
        }
        if let Some(fault) = self.input.status().fault() {
            return Err(fault);
        }
        self.consumed += count as u64;
        Ok(())
    }
}

#[cfg(test)]
mod tests;

/// Native-clock recording lead-in, loop and monitor-only click rendering.
pub mod transport;
