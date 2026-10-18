//! Native input transport foundation; no hardware device or frontend dependency.
//!
//! A single callback writer copies into independent dry/cue SPSC queues. Only
//! the cue worker runs DSP. Construction and destruction belong off the callback.
//! The Mac adapter lives in `macos`, dry-file persistence in `recording`. The
//! session owner coordinates capture/files/cue; app/output clock integration is
//! still pending. Empty input queues
//! are normal, not underruns.
use crate::{native_graph::Stereo, Result};
#[cfg(target_os = "macos")]
pub mod macos;
pub mod backing;
pub mod mix;
pub mod output;
pub mod plugins;
pub mod recording;
pub mod session;
use std::{
    cell::{Cell, UnsafeCell},
    marker::PhantomData,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
};

pub const MAX_FRAMES: usize = 512;
pub const DRY_SLOTS: usize = 64;
pub const CUE_SLOTS: usize = 8;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(usize)]
pub enum Fault {
    Overflow = 1,
    InvalidInput = 2,
    Discontinuous = 3,
    Disconnected = 4,
    Processor = 5,
    Cancelled = 6,
    Device = 7,
    Storage = 8,
}

#[derive(Clone, Copy)]
pub struct Packet {
    /// Contiguous input sample clock, not the arrangement/playback clock. On a
    /// processed packet this identifies its input block, not latency-adjusted PCM.
    pub first_frame: u64,
    /// Opaque hardware host ticks; hardware adapters must define their timebase.
    pub host_time: u64,
    length: usize,
    pcm: [Stereo; MAX_FRAMES],
}
impl Default for Packet {
    fn default() -> Self {
        Self {
            first_frame: 0,
            host_time: 0,
            length: 0,
            pcm: [[0.; 2]; MAX_FRAMES],
        }
    }
}
impl Packet {
    pub fn samples(&self) -> &[Stereo] {
        &self.pcm[..self.length]
    }
}

struct Queue<const N: usize> {
    slots: [UnsafeCell<Packet>; N],
    read: AtomicUsize,
    write: AtomicUsize,
    fault: AtomicUsize,
    closed: AtomicBool,
}
// Each queue has exactly one non-Clone, non-Sync writer and reader. A writer
// exclusively owns an unpublished slot; release/acquire publication transfers
// ownership to the reader, which releases it only after copying. No references
// into slots escape. Fault/status handles never access slot storage.
unsafe impl<const N: usize> Sync for Queue<N> {}
struct Writer<const N: usize> {
    queue: Arc<Queue<N>>,
    single: PhantomData<Cell<()>>,
}
pub struct Reader<const N: usize> {
    queue: Arc<Queue<N>>,
    single: PhantomData<Cell<()>>,
}
#[derive(Clone)]
pub struct Status<const N: usize>(Arc<Queue<N>>);
impl<const N: usize> Status<N> {
    /// The first fault latches. Already queued packets can be drained for recovery.
    pub fn fault(&self) -> Option<Fault> {
        match self.0.fault.load(Ordering::Acquire) {
            0 => None,
            1 => Some(Fault::Overflow),
            2 => Some(Fault::InvalidInput),
            3 => Some(Fault::Discontinuous),
            4 => Some(Fault::Disconnected),
            5 => Some(Fault::Processor),
            6 => Some(Fault::Cancelled),
            7 => Some(Fault::Device),
            _ => Some(Fault::Storage),
        }
    }
    pub fn closed(&self) -> bool {
        self.0.closed.load(Ordering::Acquire)
    }
    pub fn cancel(&self) {
        self.fail(Fault::Cancelled);
    }
    fn fail(&self, fault: Fault) {
        let _ =
            self.0
                .fault
                .compare_exchange(0, fault as usize, Ordering::AcqRel, Ordering::Acquire);
    }
}
fn queue<const N: usize>() -> (Writer<N>, Reader<N>) {
    assert!(N.is_power_of_two()); // Counter wrap preserves slot indexing.
    let queue = Arc::new(Queue {
        slots: std::array::from_fn(|_| UnsafeCell::new(Packet::default())),
        read: AtomicUsize::new(0),
        write: AtomicUsize::new(0),
        fault: AtomicUsize::new(0),
        closed: AtomicBool::new(false),
    });
    (
        Writer {
            queue: queue.clone(),
            single: PhantomData,
        },
        Reader {
            queue,
            single: PhantomData,
        },
    )
}
impl<const N: usize> Writer<N> {
    fn status(&self) -> Status<N> {
        Status(self.queue.clone())
    }
    fn push(&mut self, packet: &Packet) -> bool {
        if self.queue.fault.load(Ordering::Acquire) != 0 {
            return false;
        }
        let w = self.queue.write.load(Ordering::Relaxed);
        if w.wrapping_sub(self.queue.read.load(Ordering::Acquire)) == N {
            self.status().fail(Fault::Overflow);
            return false;
        }
        unsafe {
            *self.queue.slots[w % N].get() = *packet;
        }
        self.queue.write.store(w.wrapping_add(1), Ordering::Release);
        true
    }
}
impl<const N: usize> Drop for Writer<N> {
    fn drop(&mut self) {
        self.queue.closed.store(true, Ordering::Release);
    }
}
impl<const N: usize> Reader<N> {
    pub fn status(&self) -> Status<N> {
        Status(self.queue.clone())
    }
    /// Nonblocking copy. On a fault, remaining packets are recovery data only;
    /// cue consumers must check status and output silence instead of playing them.
    pub fn pop(&mut self) -> Option<Packet> {
        let r = self.queue.read.load(Ordering::Relaxed);
        if r == self.queue.write.load(Ordering::Acquire) {
            return None;
        }
        let packet = unsafe { *self.queue.slots[r % N].get() };
        self.queue.read.store(r.wrapping_add(1), Ordering::Release);
        Some(packet)
    }
}
impl<const N: usize> Drop for Reader<N> {
    fn drop(&mut self) {
        if !self.queue.closed.load(Ordering::Acquire)
            || self.queue.read.load(Ordering::Relaxed) != self.queue.write.load(Ordering::Acquire)
        {
            self.status().fail(Fault::Disconnected);
        }
    }
}

pub struct InputWriter {
    dry: Writer<DRY_SLOTS>,
    cue: Writer<CUE_SLOTS>,
    next: Option<u64>,
}
/// Allocate off the callback, then move each endpoint to its sole owning thread.
pub fn input() -> (InputWriter, Reader<DRY_SLOTS>, Reader<CUE_SLOTS>) {
    let (dry_writer, dry) = queue();
    let (cue_writer, cue) = queue();
    (
        InputWriter {
            dry: dry_writer,
            cue: cue_writer,
            next: None,
        },
        dry,
        cue,
    )
}
impl InputWriter {
    /// Bounded callback work: validate <=512 stereo frames, copy twice, publish.
    /// No allocation, locks, waiting, helper IPC, WebKit or file I/O. The caller
    /// splits larger callbacks and supplies a contiguous sample clock. A failed
    /// dry write latches an incomplete take; cue faults never block dry writes.
    pub fn push(&mut self, first_frame: u64, host_time: u64, pcm: &[Stereo]) -> bool {
        let end = first_frame.checked_add(pcm.len() as u64);
        let fault = if pcm.is_empty()
            || pcm.len() > MAX_FRAMES
            || end.is_none()
            || pcm.iter().flatten().any(|v| !v.is_finite())
        {
            Some(Fault::InvalidInput)
        } else if self.next.is_some_and(|next| next != first_frame) {
            Some(Fault::Discontinuous)
        } else {
            None
        };
        if let Some(fault) = fault {
            self.dry.status().fail(fault);
            self.cue.status().fail(fault);
            return false;
        }
        self.next = end;
        let mut packet = Packet {
            first_frame,
            host_time,
            length: pcm.len(),
            ..Packet::default()
        };
        packet.pcm[..pcm.len()].copy_from_slice(pcm);
        let dry = self.dry.push(&packet);
        self.cue.push(&packet);
        dry
    }
}

/// Owned by the DSP worker. Dropping it must release all its plug-in sessions.
pub trait Processor: Send {
    fn process(&mut self, first_frame: u64, pcm: &mut [Stereo]) -> Result<()>;
}
#[derive(Debug, PartialEq, Eq)]
pub enum Step {
    Idle,
    Processed,
    Ended,
    Fault(Fault),
}
/// Wet packets are never recovery data. A latched cue fault suppresses queued
/// replies too, rather than letting a consumer accidentally play stale audio.
pub struct CueOutput(Reader<CUE_SLOTS>);
impl CueOutput {
    pub fn status(&self) -> Status<CUE_SLOTS> {
        self.0.status()
    }
    /// Snapshot for the sole consumer. Concurrent publication may add packets.
    pub fn queued_packets(&self) -> usize {
        self.0
            .queue
            .write
            .load(Ordering::Acquire)
            .wrapping_sub(self.0.queue.read.load(Ordering::Relaxed))
    }
    pub fn pop(&mut self) -> Option<Packet> {
        if self.status().fault().is_some() {
            return None;
        }
        let packet = self.0.pop();
        if self.status().fault().is_some() {
            None
        } else {
            packet
        }
    }
}
pub struct CueWorker<P: Processor> {
    input: Reader<CUE_SLOTS>,
    output: Writer<CUE_SLOTS>,
    processor: Option<P>,
}
impl<P: Processor> CueWorker<P> {
    /// Construction/opening plug-ins and repeated step calls belong on the
    /// native worker. The output ring is separate from both input queues.
    pub fn new(input: Reader<CUE_SLOTS>, processor: P) -> (Self, CueOutput) {
        let (output, reader) = queue();
        (
            Self {
                input,
                output,
                processor: Some(processor),
            },
            CueOutput(reader),
        )
    }
    fn fault(&mut self, fault: Fault) -> Step {
        self.input.status().fail(fault);
        self.output.status().fail(fault);
        self.processor.take(); // Close helpers on the worker, never on callback.
        self.output.queue.closed.store(true, Ordering::Release);
        Step::Fault(fault)
    }
    pub fn step(&mut self) -> Step {
        if let Some(fault) = self.output.status().fault().or(self.input.status().fault()) {
            return self.fault(fault);
        }
        let mut packet = self.input.pop();
        let closed = packet.is_none() && self.input.status().closed();
        if packet.is_none() && closed {
            // Acquiring EOF also acquires the producer's final packet. The first
            // empty read may predate that publication; never discard a stop tail.
            packet = self.input.pop();
        }
        let Some(mut packet) = packet else {
            return if closed {
                self.processor.take();
                self.output.queue.closed.store(true, Ordering::Release);
                Step::Ended
            } else {
                Step::Idle
            };
        };
        let Some(processor) = self.processor.as_mut() else {
            return Step::Ended;
        };
        if processor
            .process(packet.first_frame, &mut packet.pcm[..packet.length])
            .is_err()
            || packet.samples().iter().flatten().any(|v| !v.is_finite())
        {
            return self.fault(Fault::Processor);
        }
        // A cancellation/overflow during helper IPC must suppress the late reply.
        if let Some(fault) = self.output.status().fault().or(self.input.status().fault()) {
            return self.fault(fault);
        }
        if !self.output.push(&packet) {
            return self.fault(Fault::Overflow);
        }
        Step::Processed
    }
}
impl<P: Processor> Drop for CueWorker<P> {
    fn drop(&mut self) {
        if self.processor.is_some() {
            self.input.status().fail(Fault::Cancelled);
            self.output.status().fail(Fault::Cancelled);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{sync::atomic::AtomicUsize, thread};

    #[test]
    fn drained_eof_is_clean_but_abandoned_active_or_pending_input_faults() {
        for mode in 0..4 {
            let (mut writer, mut reader) = queue::<8>();
            let status = reader.status();
            if mode >= 2 {
                assert!(writer.push(&Packet {
                    length: 1,
                    ..Packet::default()
                }));
            }
            if mode == 3 {
                reader.pop().unwrap();
            }
            if mode != 0 {
                drop(writer);
            }
            drop(reader);
            assert_eq!(
                status.fault(),
                if mode == 0 || mode == 2 {
                    Some(Fault::Disconnected)
                } else {
                    None
                }
            );
        }
    }

    struct Gain {
        drops: Arc<AtomicUsize>,
        fail: bool,
        poison: bool,
    }
    impl Processor for Gain {
        fn process(&mut self, _: u64, pcm: &mut [Stereo]) -> Result<()> {
            if self.fail {
                return Err("Injected helper fault".into());
            }
            for sample in pcm {
                *sample = if self.poison {
                    [f32::NAN; 2]
                } else {
                    [sample[0] * 0.5, sample[1] * 0.5]
                };
            }
            Ok(())
        }
    }
    impl Drop for Gain {
        fn drop(&mut self) {
            self.drops.fetch_add(1, Ordering::Relaxed);
        }
    }
    fn gain(fail: bool, poison: bool) -> (Gain, Arc<AtomicUsize>) {
        let drops = Arc::new(AtomicUsize::new(0));
        (
            Gain {
                drops: drops.clone(),
                fail,
                poison,
            },
            drops,
        )
    }
    #[test]
    fn packet_clock_stereo_and_short_final_block_remain_dry() {
        let (mut writer, mut dry, cue) = input();
        let (processor, drops) = gain(false, false);
        let (mut worker, mut wet) = CueWorker::new(cue, processor);
        assert_eq!(worker.step(), Step::Idle);
        let mut first = 48000;
        for frames in [128, 512, 1, 379] {
            let pcm = vec![[1.5, -0.75]; frames]; // Preserve headroom, no clipping.
            assert!(writer.push(first, 100 + first, &pcm));
            assert_eq!(worker.step(), Step::Processed);
            let raw = dry.pop().unwrap();
            let cue = wet.pop().unwrap();
            assert_eq!((raw.first_frame, raw.host_time), (first, 100 + first));
            assert_eq!(
                (cue.first_frame, cue.host_time),
                (raw.first_frame, raw.host_time)
            );
            assert_eq!(raw.samples(), pcm);
            assert_eq!(cue.samples(), vec![[0.75, -0.375]; frames]);
            first += frames as u64;
        }
        drop(writer);
        assert_eq!(worker.step(), Step::Ended);
        assert_eq!(worker.step(), Step::Ended);
        assert_eq!(drops.load(Ordering::Relaxed), 1);
        assert!(dry.status().closed());
        assert!(wet.status().closed());
        assert_eq!(wet.status().fault(), None);
    }
    #[test]
    fn stalled_cue_never_blocks_or_changes_dry_capture() {
        let (mut writer, mut dry, cue) = input();
        let status = cue.status();
        for frame in 0..1000 {
            assert!(writer.push(frame, frame * 7, &[[frame as f32, -0.5]]));
            let packet = dry.pop().unwrap();
            assert_eq!(packet.first_frame, frame);
            assert_eq!(packet.samples(), &[[frame as f32, -0.5]]);
        }
        assert_eq!(status.fault(), Some(Fault::Overflow));
        assert_eq!(dry.status().fault(), None);
        let (processor, drops) = gain(false, false);
        let (mut worker, mut wet) = CueWorker::new(cue, processor);
        assert_eq!(worker.step(), Step::Fault(Fault::Overflow));
        assert!(wet.pop().is_none());
        assert_eq!(drops.load(Ordering::Relaxed), 1);
    }
    #[test]
    fn dry_overflow_retains_exact_prefix_and_latches_incomplete_take() {
        let (mut writer, mut dry, mut cue) = input();
        for frame in 0..DRY_SLOTS as u64 {
            assert!(writer.push(frame, 0, &[[frame as f32; 2]]));
            cue.pop().unwrap();
        }
        assert!(!writer.push(DRY_SLOTS as u64, 0, &[[99.; 2]]));
        assert_eq!(dry.status().fault(), Some(Fault::Overflow));
        for frame in 0..DRY_SLOTS as u64 {
            let packet = dry.pop().unwrap();
            assert_eq!(packet.first_frame, frame);
            assert_eq!(packet.samples(), &[[frame as f32; 2]]);
        }
        assert!(dry.pop().is_none());
        assert!(!writer.push(DRY_SLOTS as u64 + 1, 0, &[[100.; 2]]));
        assert_eq!(cue.status().fault(), None);
    }
    #[test]
    fn invalid_input_and_clock_gaps_are_explicit_and_never_published() {
        for (start, samples, fault) in [
            (1, vec![], Fault::InvalidInput),
            (1, vec![[0.; 2]; MAX_FRAMES + 1], Fault::InvalidInput),
            (1, vec![[f32::NAN, 0.]], Fault::InvalidInput),
            (1, vec![[0., f32::INFINITY]], Fault::InvalidInput),
            (u64::MAX, vec![[0.; 2]], Fault::InvalidInput),
            (0, vec![[0.; 2]], Fault::Discontinuous),
            (2, vec![[0.; 2]], Fault::Discontinuous),
        ] {
            let (mut writer, mut dry, mut cue) = input();
            assert!(writer.push(0, 0, &[[0.; 2]]));
            dry.pop().unwrap();
            cue.pop().unwrap();
            assert!(!writer.push(start, 0, &samples));
            assert!(dry.pop().is_none());
            assert!(cue.pop().is_none());
            assert_eq!(dry.status().fault(), Some(fault));
            assert_eq!(cue.status().fault(), Some(fault));
        }
    }
    #[test]
    fn processing_failure_and_nonfinite_replies_close_cue_only() {
        for (fail, poison) in [(true, false), (false, true)] {
            let (mut writer, mut dry, cue) = input();
            let (processor, drops) = gain(fail, poison);
            let (mut worker, mut wet) = CueWorker::new(cue, processor);
            assert!(writer.push(0, 0, &[[0.25; 2]]));
            assert_eq!(worker.step(), Step::Fault(Fault::Processor));
            assert!(wet.pop().is_none());
            assert_eq!(drops.load(Ordering::Relaxed), 1);
            for frame in 1..100 {
                assert!(writer.push(frame, 0, &[[0.25; 2]]));
                let raw = dry.pop().unwrap();
                assert_eq!(raw.first_frame, frame - 1);
                assert_eq!(raw.samples(), &[[0.25; 2]]);
            }
            assert_eq!(dry.status().fault(), None);
            assert_eq!(worker.step(), Step::Fault(Fault::Processor));
            assert_eq!(drops.load(Ordering::Relaxed), 1);
        }
    }
    #[test]
    fn output_backpressure_disconnect_and_cancel_release_processor() {
        for mode in 0..3 {
            let (mut writer, mut dry, cue) = input();
            let (processor, drops) = gain(false, false);
            let (mut worker, wet) = CueWorker::new(cue, processor);
            let status = wet.status();
            if mode == 1 {
                status.cancel();
            }
            if mode == 2 {
                drop(wet);
            }
            let expected = [Fault::Overflow, Fault::Cancelled, Fault::Disconnected][mode];
            let count = if mode == 0 { CUE_SLOTS } else { 0 };
            for frame in 0..=count {
                assert!(writer.push(frame as u64, 0, &[[0.25; 2]]));
                dry.pop().unwrap();
                assert_eq!(
                    worker.step(),
                    if frame < count {
                        Step::Processed
                    } else {
                        Step::Fault(expected)
                    }
                );
            }
            assert_eq!(status.fault(), Some(expected));
            assert_eq!(drops.load(Ordering::Relaxed), 1);
            assert!(writer.push((count + 1) as u64, 0, &[[0.5; 2]]));
            assert_eq!(dry.pop().unwrap().samples(), &[[0.5; 2]]);
        }
    }
    struct Blocking {
        barrier: Arc<std::sync::Barrier>,
        drops: Arc<AtomicUsize>,
    }
    #[test]
    fn dropping_or_cancelling_worker_suppresses_already_queued_wet_pcm() {
        for cancel in [false, true] {
            let (mut writer, mut dry, cue) = input();
            let (processor, drops) = gain(false, false);
            let (mut worker, mut wet) = CueWorker::new(cue, processor);
            assert!(writer.push(0, 0, &[[0.5; 2]]));
            assert_eq!(worker.step(), Step::Processed);
            if cancel {
                wet.status().cancel();
                assert_eq!(worker.step(), Step::Fault(Fault::Cancelled));
            }
            drop(worker);
            assert!(wet.pop().is_none());
            assert_eq!(drops.load(Ordering::Relaxed), 1);
            assert_eq!(dry.pop().unwrap().samples(), &[[0.5; 2]]);
            assert!(writer.push(1, 0, &[[0.75; 2]]));
            assert_eq!(dry.pop().unwrap().samples(), &[[0.75; 2]]);
        }
    }
    impl Processor for Blocking {
        fn process(&mut self, _: u64, _: &mut [Stereo]) -> Result<()> {
            self.barrier.wait();
            self.barrier.wait();
            Ok(())
        }
    }
    impl Drop for Blocking {
        fn drop(&mut self) {
            self.drops.fetch_add(1, Ordering::Relaxed);
        }
    }
    #[test]
    fn cancellation_during_processing_suppresses_late_reply() {
        let (mut writer, mut dry, cue) = input();
        let barrier = Arc::new(std::sync::Barrier::new(2));
        let drops = Arc::new(AtomicUsize::new(0));
        let (mut worker, mut wet) = CueWorker::new(
            cue,
            Blocking {
                barrier: barrier.clone(),
                drops: drops.clone(),
            },
        );
        assert!(writer.push(0, 0, &[[0.25; 2]]));
        let task = thread::spawn(move || worker.step());
        barrier.wait();
        wet.status().cancel();
        // A real helper's stop handle must additionally interrupt blocked IPC.
        assert!(writer.push(1, 0, &[[0.75; 2]]));
        barrier.wait();
        assert_eq!(task.join().unwrap(), Step::Fault(Fault::Cancelled));
        assert_eq!(drops.load(Ordering::Relaxed), 1);
        assert!(wet.pop().is_none());
        assert_eq!(dry.pop().unwrap().first_frame, 0);
        assert_eq!(dry.pop().unwrap().samples(), &[[0.75; 2]]);
    }
    #[test]
    fn counter_wrap_and_concurrent_publication_preserve_packets() {
        let (mut writer, mut reader) = queue::<8>();
        writer.queue.read.store(usize::MAX - 3, Ordering::Relaxed);
        writer.queue.write.store(usize::MAX - 3, Ordering::Relaxed);
        let task = thread::spawn(move || {
            for first_frame in 0..10000 {
                // Test producer paces itself; real callbacks never wait on space.
                while writer
                    .queue
                    .write
                    .load(Ordering::Relaxed)
                    .wrapping_sub(writer.queue.read.load(Ordering::Acquire))
                    == 8
                {
                    thread::yield_now();
                }
                let packet = Packet {
                    first_frame,
                    host_time: first_frame * 3,
                    length: MAX_FRAMES,
                    pcm: [[first_frame as f32, -0.75]; MAX_FRAMES],
                };
                assert!(writer.push(&packet));
            }
        });
        for frame in 0..10000 {
            let packet = loop {
                if let Some(packet) = reader.pop() {
                    break packet;
                }
                thread::yield_now();
            };
            assert_eq!((packet.first_frame, packet.host_time), (frame, frame * 3));
            assert!(packet
                .samples()
                .iter()
                .all(|sample| *sample == [frame as f32, -0.75]));
        }
        task.join().unwrap();
        assert_eq!(reader.status().fault(), None);
        assert!(reader.status().closed());
    }
}
