use super::*;
use crate::native_graph::{Insert, Source};
use std::{collections::HashMap, sync::atomic::AtomicUsize, time::Instant};
struct Sequence(u64);
impl Renderer for Sequence {
    fn render(&mut self, pcm: &mut [Stereo]) -> Result<()> {
        for sample in pcm {
            *sample = [self.0 as f32, -(self.0 as f32)];
            self.0 += 1;
        }
        Ok(())
    }
}
fn wait(mut condition: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(3);
    while !condition() {
        assert!(Instant::now() < deadline);
        thread::sleep(Duration::from_millis(1));
    }
}
#[test]
fn worker_backpressure_partial_blocks_and_eof_preserve_exact_frames() {
    let (mut worker, mut reader) =
        Worker::start(Duration::from_secs(2), |_| Ok((Sequence(0), 20003))).unwrap();
    let mut actual = Vec::new();
    for size in [1, 511, 17, 512, 83].into_iter().cycle().take(100) {
        wait(|| {
            reader.input.status().closed()
                || reader
                    .input
                    .queue
                    .write
                    .load(Ordering::Acquire)
                    .wrapping_sub(reader.input.queue.read.load(Ordering::Acquire))
                    >= 2
        });
        let mut pcm = vec![[9.; 2]; size];
        reader.render(&mut pcm).unwrap();
        actual.extend(pcm);
        if actual.len() >= 20500 {
            break;
        }
    }
    for (i, sample) in actual.iter().enumerate() {
        assert_eq!(
            *sample,
            if i < 20003 {
                [i as f32, -(i as f32)]
            } else {
                [0.; 2]
            }
        );
    }
    assert_eq!(reader.consumed(), 20003);
    assert_eq!(reader.fault(), None);
    worker.poll().unwrap();
}
#[test]
fn explicit_deadline_miss_latches_silence_without_timeline_advance() {
    struct Slow {
        blocks: usize,
        entered: Arc<AtomicBool>,
        release: Arc<AtomicBool>,
        control: Control,
    }
    impl Renderer for Slow {
        fn render(&mut self, pcm: &mut [Stereo]) -> Result<()> {
            if self.blocks == SLOTS {
                self.entered.store(true, Ordering::Release);
                while !self.release.load(Ordering::Acquire) && !self.control.cancelled() {
                    thread::sleep(Duration::from_millis(1));
                }
            }
            self.blocks += 1;
            pcm.fill([1.; 2]);
            Ok(())
        }
    }
    let entered = Arc::new(AtomicBool::new(false));
    let release = Arc::new(AtomicBool::new(false));
    let (e, r) = (entered.clone(), release.clone());
    let (mut worker, mut reader) = Worker::start(Duration::from_secs(2), move |control| {
        Ok((
            Slow {
                blocks: 0,
                entered: e,
                release: r,
                control,
            },
            10000,
        ))
    })
    .unwrap();
    let mut pcm = [[0.; 2]; MAX_FRAMES];
    reader.render(&mut pcm).unwrap();
    wait(|| entered.load(Ordering::Acquire));
    for _ in 1..SLOTS {
        reader.render(&mut pcm).unwrap();
    }
    assert_eq!(reader.render(&mut pcm), Err(Fault::Discontinuous));
    assert_eq!(pcm, [[0.; 2]; MAX_FRAMES]);
    assert_eq!(reader.consumed(), (SLOTS * MAX_FRAMES) as u64);
    release.store(true, Ordering::Release);
    assert!(worker.poll().is_err());
    assert!(reader.render(&mut pcm).is_err());
    assert_eq!(pcm, [[0.; 2]; MAX_FRAMES]);
}
#[test]
fn preparation_failure_timeout_and_panics_join_and_drop_off_caller_thread() {
    assert!(Worker::start::<Sequence>(Duration::ZERO, |_| Ok((Sequence(0), 1))).is_err());
    assert!(
        Worker::start::<Sequence>(Duration::from_secs(1), |_| Err("prepare failed".into()))
            .is_err()
    );
    assert!(Worker::start(Duration::from_secs(1), |_| Ok((Sequence(0), 0))).is_err());
    assert!(Worker::start(Duration::from_secs(1), |_| Ok((Sequence(0), 32_000_001))).is_err());
    let finished = Arc::new(AtomicBool::new(false));
    let flag = finished.clone();
    assert!(
        Worker::start::<Sequence>(Duration::from_millis(5), move |control| {
            while !control.cancelled() {
                thread::sleep(Duration::from_millis(1));
            }
            flag.store(true, Ordering::Release);
            Err("cancelled".into())
        })
        .is_err()
    );
    assert!(finished.load(Ordering::Acquire));
    assert!(
        Worker::start::<Sequence>(Duration::from_secs(1), |_| panic!("test startup panic"))
            .is_err()
    );
    struct DropCheck {
        caller: thread::ThreadId,
        count: Arc<AtomicUsize>,
    }
    impl Renderer for DropCheck {
        fn render(&mut self, pcm: &mut [Stereo]) -> Result<()> {
            pcm.fill([1.; 2]);
            Ok(())
        }
    }
    impl Drop for DropCheck {
        fn drop(&mut self) {
            assert_ne!(thread::current().id(), self.caller);
            self.count.fetch_add(1, Ordering::AcqRel);
        }
    }
    let count = Arc::new(AtomicUsize::new(0));
    let c = count.clone();
    let caller = thread::current().id();
    let (worker, reader) = Worker::start(Duration::from_secs(1), move |_| {
        Ok((DropCheck { caller, count: c }, 30000))
    })
    .unwrap();
    drop(reader);
    drop(worker);
    assert_eq!(count.load(Ordering::Acquire), 1);
}
#[test]
fn invalid_blocks_and_nonfinite_renderer_cannot_escape() {
    struct Bad;
    impl Renderer for Bad {
        fn render(&mut self, pcm: &mut [Stereo]) -> Result<()> {
            pcm.fill([f32::NAN; 2]);
            Ok(())
        }
    }
    assert!(Worker::start(Duration::from_secs(1), |_| Ok((Bad, 512))).is_err());
    let (_worker, mut reader) =
        Worker::start(Duration::from_secs(1), |_| Ok((Sequence(0), 512))).unwrap();
    let mut out = [[1.; 2]; MAX_FRAMES + 1];
    assert!(reader.render(&mut out).is_err());
    assert_eq!(out, [[0.; 2]; MAX_FRAMES + 1]);
}
fn graph() -> Graph {
    let project = serde_json::json!({"sampleRate":48000,"duration":2048./48000.,"masterVolume":0.5,"tracks":[{"id":"a","volume":1,"pan":0,"segments":[{"id":"clip","sourceId":"s","startTime":0,"sourceOffset":0,"duration":2048./48000.,"gain":1,"effects":[]}]}]});
    let source = Source::new(vec![(0..2048).map(|i| i as f32 / 2048.).collect()]).unwrap();
    Graph::prepare(
        &project,
        HashMap::from([("s".into(), source)]),
        |_| -> Result<Box<dyn Insert>> { Err("No inserts expected".into()) },
    )
    .unwrap()
}
#[test]
fn graph_range_preroll_matches_independent_graph_render() {
    let (mut worker, mut reader) =
        Worker::graph(Duration::from_secs(2), 713, 1901, |_| Ok(graph())).unwrap();
    let mut reference = graph();
    let mut all = vec![[0.; 2]; 1901];
    for pcm in all.chunks_mut(137) {
        reference.render(pcm).unwrap();
    }
    let mut actual = vec![[0.; 2]; 1536];
    for pcm in actual.chunks_mut(512) {
        reader.render(pcm).unwrap();
    }
    assert_eq!(actual[..1188], all[713..1901]);
    assert_eq!(actual[1188..], [[0.; 2]; 348]);
    worker.poll().unwrap();
    assert!(Worker::graph(Duration::from_secs(1), 10, 9, |_| Ok(graph())).is_err());
    assert!(Worker::graph(Duration::from_secs(1), 0, 2049, |_| Ok(graph())).is_err());
}

#[test]
fn graph_backing_preroll_compensates_native_latency_on_the_worker() {
    struct Delay(std::collections::VecDeque<Stereo>);
    impl Insert for Delay {
        fn latency(&self) -> usize {
            37
        }
        fn process(&mut self, pcm: &mut [Stereo], _: u32) -> Result<()> {
            for sample in pcm {
                self.0.push_back(*sample);
                *sample = self.0.pop_front().unwrap();
            }
            Ok(())
        }
    }
    fn delayed() -> Graph {
        let doc = serde_json::json!({"sampleRate":48000,"duration":2048./48000.,"masterVolume":0.5,
            "nativeEffects":[{"instanceId":"backing-delay","pluginId":"test","enabled":true,"bypass":false,"parameters":{},"state":""}],
            "tracks":[{"id":"a","volume":1,"pan":0,"segments":[{"id":"clip","sourceId":"s","startTime":0,"sourceOffset":0,"duration":2048./48000.,"gain":1,"effects":[]}]}]});
        let source = Source::new(vec![(0..2048).map(|i| i as f32 / 2048.).collect()]).unwrap();
        Graph::prepare(&doc, HashMap::from([("s".into(), source)]), |_| {
            Ok(Box::new(Delay(std::collections::VecDeque::from(vec![
                [0.;
                    2];
                37
            ]))))
        })
        .unwrap()
    }
    let (_worker, mut reader) =
        Worker::graph(Duration::from_secs(2), 713, 1901, |_| Ok(delayed())).unwrap();
    let mut reference = delayed();
    assert_eq!(reference.latency(), 37);
    let mut all = vec![[0.; 2]; 1938];
    for pcm in all.chunks_mut(137) {
        reference.render(pcm).unwrap();
    }
    let mut actual = vec![[0.; 2]; 1536];
    for pcm in actual.chunks_mut(512) {
        reader.render(pcm).unwrap();
    }
    assert_eq!(actual[..1188], all[750..1938]);
    assert_eq!(actual[1188..], [[0.; 2]; 348]);
}

#[cfg(target_os = "macos")]
#[test]
fn stop_during_backing_helper_open_kills_and_joins_even_a_late_registration() {
    use crate::native_input::startup::BlockedHelper;
    for late in [false, true] {
        let cancel = Arc::new(AtomicBool::new(false));
        let flag = cancel.clone();
        let (tx, rx) = mpsc::sync_channel(1);
        let canceller = thread::spawn(move || {
            let stop: StreamStop = rx.recv_timeout(Duration::from_secs(3)).unwrap();
            assert!(stop.is_alive());
            flag.store(true, Ordering::Release);
            stop
        });
        let finished = Arc::new(AtomicBool::new(false));
        let done = finished.clone();
        let start = Instant::now();
        let result = Worker::start_cancellable::<Sequence>(
            Duration::from_secs(5),
            &|| cancel.load(Ordering::Acquire),
            move |control| {
                let mut helper = BlockedHelper::new();
                if !late {
                    control.register(helper.stop.clone());
                }
                tx.send(helper.stop.clone()).unwrap();
                if late {
                    wait(|| control.cancelled());
                    control.register(helper.stop.clone());
                }
                helper.handshake();
                done.store(true, Ordering::Release);
                Err("Helper handshake interrupted".into())
            },
        );
        assert!(result.err().unwrap().contains("cancelled"));
        assert!(
            start.elapsed() < Duration::from_secs(3),
            "Cancellation waited for the five-second startup deadline"
        );
        assert!(finished.load(Ordering::Acquire));
        assert!(!canceller.join().unwrap().is_alive());
    }
}
#[test]
fn cancelled_backing_does_not_start_preparation() {
    assert!(
        Worker::start_cancellable::<Sequence>(Duration::from_secs(5), &|| true, |_| panic!(
            "Must not prepare after cancellation"
        ))
        .is_err()
    );
}
