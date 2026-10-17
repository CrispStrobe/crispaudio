use super::*;
use crate::native_input::{input, CueWorker, InputWriter, Processor, Reader, Step, DRY_SLOTS};
const BASE: u64 = 1_000_000_000_000_000_000;
fn clock() -> ClockMap {
    ClockMap::new(Timebase::new(1_000_000_000, 48000).unwrap(), BASE, 0)
}
fn config() -> Config {
    Config {
        clock: clock(),
        start_frame: 0,
        delay_frames: 32,
        startup_grace_frames: 512,
        max_drift_frames: 4,
    }
}
struct Pass;
impl Processor for Pass {
    fn process(&mut self, _: u64, _: &mut [Stereo]) -> Result<()> {
        Ok(())
    }
}
struct Fixture {
    writer: InputWriter,
    dry: Reader<DRY_SLOTS>,
    worker: CueWorker<Pass>,
    output: Scheduler,
}
fn fixture(config: Config) -> Fixture {
    let (writer, dry, cue) = input();
    let (worker, output) = CueWorker::new(cue, Pass);
    Fixture {
        writer,
        dry,
        worker,
        output: Scheduler::new(output, config).unwrap(),
    }
}
fn send(f: &mut Fixture, first: u64, host: u64, pcm: &[Stereo]) {
    assert!(f.writer.push(first, host, pcm));
    assert_eq!(f.worker.step(), Step::Processed);
    assert_eq!(f.dry.pop().unwrap().samples(), pcm);
}
#[test]
fn integer_host_mapping_preserves_large_epochs_and_signed_preroll() {
    let clock = ClockMap::new(Timebase::new(125, 3).unwrap(), u64::MAX - 5000, -100);
    assert_eq!(clock.frame_at(u64::MAX - 5000), Some(-100));
    assert_eq!(clock.frame_at(u64::MAX - 4500), Some(-99));
    assert_eq!(clock.frame_at(u64::MAX - 5500), Some(-101));
    assert_eq!(clock.frame_at(u64::MAX - 4750), Some(-99));
    assert_eq!(clock.frame_at(u64::MAX - 5250), Some(-101));
    assert_eq!(clock.timebase().ratio(), (125, 3));
    assert!(Timebase::new(0, 1).is_err());
    assert!(Timebase::new(1, 0).is_err());
    assert_eq!(
        ClockMap::new(Timebase::new(u32::MAX, 1).unwrap(), 0, 0).frame_at(u64::MAX),
        None
    );
    assert_eq!(
        ClockMap::new(Timebase::new(1_000_000_000, 48000).unwrap(), BASE, i64::MAX)
            .frame_at(BASE + 1),
        None
    );
}
#[test]
fn impulse_is_exact_at_fixed_delay_across_unequal_blocks_and_partial_eof() {
    let mut f = fixture(config());
    let mut pcm = vec![[0.; 2]; 384];
    pcm[0] = [1., -0.5];
    pcm[127] = [-0., 1.25];
    pcm[128] = [-0.75, 0.125];
    for block in 0..3 {
        send(
            &mut f,
            900 + block * 128,
            BASE + block * 128,
            &pcm[block as usize * 128..block as usize * 128 + 128],
        );
    }
    drop(f.writer);
    assert_eq!(f.worker.step(), Step::Ended);
    let mut actual = Vec::new();
    let mut frame = 0;
    for size in [31, 128, 1, 256, 64] {
        let mut block = vec![[8.; 2]; size];
        let report = f.output.render(frame, &mut block);
        assert_eq!(report.fault, None);
        frame += size as i64;
        actual.extend(block);
    }
    let mut expected = vec![[0.; 2]; 32];
    expected.extend(pcm);
    expected.resize(actual.len(), [0.; 2]);
    let bits = |pcm: Vec<Stereo>| {
        pcm.into_iter()
            .map(|v| [v[0].to_bits(), v[1].to_bits()])
            .collect::<Vec<_>>()
    };
    assert_eq!(bits(actual), bits(expected));
    assert_eq!(f.output.report().played_frames, 384);
    assert_eq!(f.output.report().phase, Phase::Ended);
}
#[test]
fn startup_silence_is_bounded_even_with_a_far_future_first_packet() {
    let mut cfg = config();
    cfg.startup_grace_frames = 128;
    let mut f = fixture(cfg);
    let mut block = [[1.; 2]; 64];
    for frame in [0, 64] {
        assert_eq!(f.output.render(frame, &mut block).phase, Phase::Waiting);
        assert_eq!(block, [[0.; 2]; 64]);
    }
    assert_eq!(
        f.output.render(128, &mut block).fault,
        Some(Fault::StartupTimeout)
    );
    let mut f = fixture(config());
    send(&mut f, 0, BASE + 1000, &[[0.5; 2]; 128]);
    assert_eq!(
        f.output.render(0, &mut block).fault,
        Some(Fault::StartupTimeout)
    );
    assert_eq!(block, [[0.; 2]; 64]);
}
#[test]
fn late_first_packet_never_slips_the_audio_clock_or_corrupts_dry() {
    let mut f = fixture(config());
    let mut block = [[1.; 2]; 64];
    f.output.render(0, &mut block);
    send(&mut f, 0, BASE, &[[0.5; 2]; 128]);
    assert_eq!(f.output.render(64, &mut block).fault, Some(Fault::Late));
    assert_eq!(block, [[0.; 2]; 64]);
    assert!(f.writer.push(128, BASE + 128, &[[0.25; 2]; 31]));
    assert_eq!(f.dry.pop().unwrap().samples(), &[[0.25; 2]; 31]);
    assert_eq!(f.dry.status().fault(), None);
}
#[test]
fn underrun_zeros_the_whole_block_and_never_replays_late_packets() {
    let mut f = fixture(config());
    send(&mut f, 0, BASE, &[[0.5; 2]; 128]);
    let mut block = [[1.; 2]; 256];
    let report = f.output.render(0, &mut block);
    assert_eq!(report.fault, Some(Fault::Underrun));
    assert_eq!(report.copied_frames, 0);
    assert_eq!(report.played_frames, 0);
    assert_eq!(block, [[0.; 2]; 256]);
    assert_eq!(f.worker.step(), Step::Fault(InputFault::Cancelled));
    assert!(f.writer.push(128, BASE + 128, &[[0.25; 2]; 128]));
    f.dry.pop().unwrap();
    assert_eq!(
        f.output.render(256, &mut block).fault,
        Some(Fault::Underrun)
    );
    assert_eq!(block, [[0.; 2]; 256]);
}
#[test]
fn valid_previous_blocks_stay_counted_after_a_later_underrun() {
    let mut f = fixture(config());
    send(&mut f, 0, BASE, &[[0.5; 2]; 128]);
    let mut block = [[1.; 2]; 160];
    assert_eq!(f.output.render(0, &mut block).played_frames, 128);
    assert_eq!(
        f.output.render(160, &mut block).fault,
        Some(Fault::Underrun)
    );
    assert_eq!(f.output.report().played_frames, 128);
}
#[test]
fn bounded_timestamp_jitter_does_not_insert_gaps_but_excess_drift_mutes() {
    let mut f = fixture(config());
    for (first, host) in [(0, 0), (128, 130), (256, 254)] {
        send(&mut f, first, BASE + host, &[[0.5, -0.25]; 128]);
    }
    let mut block = [[9.; 2]; 416];
    assert_eq!(f.output.render(0, &mut block).fault, None);
    assert_eq!(&block[..32], &[[0.; 2]; 32]);
    assert_eq!(&block[32..], &[[0.5, -0.25]; 384]);
    assert_eq!(f.output.report().drift_frames, -2);
    let mut f = fixture(config());
    send(&mut f, 0, BASE, &[[0.5; 2]; 128]);
    send(&mut f, 128, BASE + 133, &[[0.25; 2]; 128]);
    let mut block = [[9.; 2]; 288];
    let report = f.output.render(0, &mut block);
    assert_eq!(report.fault, Some(Fault::Drift));
    assert_eq!(report.drift_frames, 5);
    assert_eq!(block, [[0.; 2]; 288]);
}
#[test]
fn output_gaps_bad_buffers_and_upstream_faults_latch_silence() {
    for mode in 0..4 {
        let mut f = fixture(config());
        send(&mut f, 0, BASE, &[[0.5; 2]; 128]);
        let mut block = vec![
            [9.; 2];
            if mode == 1 {
                513
            } else if mode == 2 {
                0
            } else {
                64
            }
        ];
        if mode == 3 {
            f.output.input.status().cancel();
        }
        let report = f.output.render(if mode == 0 { 1 } else { 0 }, &mut block);
        assert_eq!(
            report.fault,
            Some(match mode {
                0 => Fault::OutputClock,
                1 | 2 => Fault::InvalidBuffer,
                _ => Fault::Upstream(InputFault::Cancelled),
            })
        );
        assert!(block.iter().all(|v| *v == [0.; 2]));
        assert_eq!(f.dry.status().fault(), None);
    }
}
#[test]
fn malformed_packet_clocks_are_rejected_at_the_output_boundary() {
    for mode in 0..3 {
        let (mut writer, reader) = super::super::queue::<CUE_SLOTS>();
        let mut scheduler = Scheduler::new(CueOutput(reader), config()).unwrap();
        let mut packet = Packet {
            first_frame: 0,
            host_time: BASE,
            length: 128,
            pcm: [[0.5; 2]; MAX_FRAMES],
        };
        writer.push(&packet);
        packet.first_frame = if mode == 0 { 129 } else { 128 };
        packet.host_time = if mode == 1 { BASE } else { BASE + 128 };
        if mode == 2 {
            packet.first_frame = u64::MAX;
        }
        writer.push(&packet);
        let mut block = [[9.; 2]; 288];
        assert_eq!(
            scheduler.render(0, &mut block).fault,
            Some(Fault::InputClock)
        );
        assert_eq!(block, [[0.; 2]; 288]);
    }
}
#[test]
fn tiny_packet_budget_is_bounded_and_exact_eight_packet_eof_is_clean() {
    // A drained eight-packet queue at clean EOF needs no ninth pop.
    let (mut writer, reader) = super::super::queue::<CUE_SLOTS>();
    for frame in 0..8 {
        writer.push(&Packet {
            first_frame: frame,
            host_time: BASE + frame,
            length: 1,
            pcm: [[0.5; 2]; MAX_FRAMES],
        });
    }
    drop(writer);
    let mut scheduler = Scheduler::new(CueOutput(reader), config()).unwrap();
    let mut block = [[9.; 2]; 64];
    assert_eq!(scheduler.render(0, &mut block).phase, Phase::Ended);
    assert_eq!(&block[32..40], &[[0.5; 2]; 8]);
    assert_eq!(&block[40..], &[[0.; 2]; 24]);
}
#[test]
fn invalid_limits_are_rejected_before_a_callback_runs() {
    for mode in 0..5 {
        let (_writer, reader) = super::super::queue::<CUE_SLOTS>();
        let mut cfg = config();
        match mode {
            0 => cfg.delay_frames = 0,
            1 => cfg.delay_frames = 4097,
            2 => cfg.startup_grace_frames = 0,
            3 => cfg.max_drift_frames = 0,
            _ => cfg.start_frame = i64::MAX,
        }
        assert!(Scheduler::new(CueOutput(reader), cfg).is_err());
    }
}
#[cfg(target_os = "macos")]
#[test]
fn mac_timebase_maps_ticks_without_opening_a_device() {
    let base = crate::native_input::macos::HostTimebase::current().unwrap();
    let clock = base.clock_map(BASE, 123);
    assert_eq!(clock.frame_at(BASE), Some(123));
}

#[test]
fn concurrent_tiny_packet_producer_cannot_extend_the_callback_read_budget() {
    use std::sync::{atomic::Ordering, Arc, Barrier};
    let (mut writer, reader) = super::super::queue::<CUE_SLOTS>();
    let status = reader.status();
    for frame in 0..8 {
        assert!(writer.push(&Packet {
            first_frame: frame,
            host_time: BASE + frame,
            length: 1,
            pcm: [[0.5; 2]; MAX_FRAMES]
        }));
    }
    let gate = Arc::new(Barrier::new(2));
    let worker_gate = gate.clone();
    let producer = std::thread::spawn(move || {
        worker_gate.wait();
        let mut frame = 8;
        while writer.status().fault().is_none() {
            let read = writer.queue.read.load(Ordering::Acquire);
            let write = writer.queue.write.load(Ordering::Relaxed);
            if write.wrapping_sub(read) < CUE_SLOTS {
                if !writer.push(&Packet {
                    first_frame: frame,
                    host_time: BASE + frame,
                    length: 1,
                    pcm: [[0.5; 2]; MAX_FRAMES],
                }) {
                    break;
                }
                frame += 1;
            } else {
                std::thread::yield_now();
            }
        }
    });
    let mut scheduler = Scheduler::new(CueOutput(reader), config()).unwrap();
    let mut block = [[9.; 2]; 512];
    gate.wait();
    let report = scheduler.render(0, &mut block);
    assert!(matches!(
        report.fault,
        Some(Fault::PacketBudget | Fault::Underrun)
    ));
    assert_eq!(status.0.read.load(Ordering::Acquire), CUE_SLOTS);
    assert_eq!(block, [[0.; 2]; 512]);
    producer.join().unwrap();
}
#[test]
fn accumulated_twenty_ppm_drift_is_detected_without_changing_dry_pcm() {
    let mut f = fixture(config());
    let mut fault_at = None;
    for block in 0..520u64 {
        let first = block * 512;
        send(
            &mut f,
            first,
            BASE + first + first / 50000,
            &[[0.25, -0.5]; 512],
        );
        let mut output = [[9.; 2]; 512];
        let report = f.output.render(first as i64, &mut output);
        if let Some(fault) = report.fault {
            assert_eq!(fault, Fault::Drift);
            assert_eq!(report.drift_frames, 5);
            assert_eq!(output, [[0.; 2]; 512]);
            fault_at = Some(first);
            break;
        }
    }
    assert!((250000..251000).contains(&fault_at.unwrap()));
    assert_eq!(f.dry.status().fault(), None);
    assert_eq!(clock().frame_at(BASE + 48000 * 3600), Some(48000 * 3600));
}

#[cfg(target_os = "macos")]
mod native_owner {
    use super::*;
    use crate::native_input::{
        plugins::PluginConfig,
        session::{
            self,
            cue::{CueConfig, StreamBudget},
            Outcome, Session,
        },
    };
    use std::{
        cell::RefCell,
        rc::Rc,
        time::{Duration, Instant},
    };
    struct State {
        writer: Option<InputWriter>,
        frames: u64,
    }
    struct Capture(Rc<RefCell<State>>);
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
    fn wait(mut condition: impl FnMut() -> bool) {
        let deadline = Instant::now() + Duration::from_secs(5);
        while !condition() {
            assert!(Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(1));
        }
    }
    fn qualify(id: &str, count: usize) {
        let root = tempfile::tempdir().unwrap();
        let state = Rc::new(RefCell::new(State {
            writer: None,
            frames: 0,
        }));
        let budget = StreamBudget::default();
        let (mut owner, output) = Session::start_with_cue(
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
        wait(|| output.queued_packets() == 1);
        let mut scheduler = Scheduler::new(output, config()).unwrap();
        let mut block = [[9.; 2]; 256];
        assert_eq!(scheduler.render(0, &mut block).fault, Some(Fault::Underrun));
        assert_eq!(block, [[0.; 2]; 256]);
        wait(|| {
            owner.poll().unwrap();
            budget.used() == 0
        });
        assert!(owner.cue_fault().is_some());
        for first in [128, 256] {
            let mut state = state.borrow_mut();
            assert!(state
                .writer
                .as_mut()
                .unwrap()
                .push(first, BASE + first, &[[0.25, -0.5]; 128]));
            state.frames += 128;
        }
        let Outcome::Complete(take) = owner.stop() else {
            panic!("Scheduler fault must leave dry recording complete")
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
    fn scheduler_underrun_reaps_actual_au_racks_and_retains_complete_dry_wav() {
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
    fn scheduler_underrun_reaps_actual_vst3_racks_and_retains_complete_dry_wav() {
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
fn concurrent_final_publication_is_drained_before_clean_cue_eof() {
    use std::sync::{Arc, Barrier};
    for _ in 0..128 {
        let (mut writer, mut dry, reader) = input();
        let (mut worker, mut output) = CueWorker::new(reader, Pass);
        let gate = Arc::new(Barrier::new(2));
        let producer_gate = gate.clone();
        let producer = std::thread::spawn(move || {
            producer_gate.wait();
            assert!(writer.push(0, BASE, &[[0.5; 2]; 128]));
            assert!(writer.push(128, BASE + 128, &[[0.25; 2]; 31]));
        });
        gate.wait();
        let mut wet = Vec::new();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        loop {
            match worker.step() {
                Step::Processed => wet.extend_from_slice(output.pop().unwrap().samples()),
                Step::Idle => {
                    assert!(std::time::Instant::now() < deadline);
                    std::thread::yield_now();
                }
                Step::Ended => break,
                Step::Fault(fault) => panic!("Unexpected final-packet fault: {fault:?}"),
            }
        }
        producer.join().unwrap();
        assert_eq!(
            wet,
            [[[0.5; 2]; 128].as_slice(), [[0.25; 2]; 31].as_slice()].concat()
        );
        assert_eq!(dry.pop().unwrap().samples().len(), 128);
        assert_eq!(dry.pop().unwrap().samples().len(), 31);
        assert_eq!(output.status().fault(), None);
        assert!(output.status().closed());
    }
}
