use super::*;
use crate::native_input::{input, CueWorker, Processor, Step};
struct Pass;
impl Processor for Pass {
    fn process(&mut self, _: u64, _: &mut [Stereo]) -> Result<()> {
        Ok(())
    }
}
fn lane(pcm: &[Stereo], controls: Controls) -> (CueOutput, output::Config, Controls) {
    let (mut writer, mut dry, cue) = input();
    let (mut worker, output) = CueWorker::new(cue, Pass);
    assert!(writer.push(0, 1000, pcm));
    assert_eq!(worker.step(), Step::Processed);
    assert_eq!(dry.pop().unwrap().samples(), pcm);
    drop(writer);
    assert_eq!(worker.step(), Step::Ended);
    (
        output,
        output::Config {
            clock: output::ClockMap::new(
                output::Timebase::new(1_000_000_000, 48000).unwrap(),
                1000,
                0,
            ),
            start_frame: 0,
            delay_frames: 1,
            startup_grace_frames: 512,
            max_drift_frames: 4,
        },
        controls,
    )
}
fn unity() -> Controls {
    Controls {
        gain: 1.,
        pan: 0.,
        mono: false,
    }
}
#[test]
fn two_inputs_mix_with_backing_and_independent_mono_balance_preserving_headroom() {
    let mut mix = Mixer::new(
        vec![
            lane(&[[2., 4.]; 128], unity()),
            lane(
                &[[2., 6.]; 128],
                Controls {
                    gain: 0.5,
                    pan: -1.,
                    mono: true,
                },
            ),
        ],
        0,
    )
    .unwrap();
    let mut out = [[0.; 2]; 129];
    mix.render(
        0,
        Backing::Audio {
            first_frame: 0,
            samples: &[[0.25, -0.5]; 129],
        },
        &mut out,
    );
    assert_eq!(out[0], [0.25, -0.5]);
    assert!(out[1..].iter().all(|sample| *sample == [4.25, 3.5]));
    assert_eq!(mix.fault(), None);
    assert_eq!(mix.cue_report(0).unwrap().played_frames, 128);
    mix.render(129, Backing::Silent, &mut out);
    assert_eq!(out, [[0.; 2]; 129]);
    assert_eq!(mix.cue_report(0).unwrap().phase, output::Phase::Ended);
}
#[test]
fn controls_ramp_across_unequal_blocks_and_invalid_updates_preserve_target() {
    let mut mix = Mixer::new(vec![lane(&[[1.; 2]; 256], unity())], 0).unwrap();
    let mut first = [[0.; 2]; 1];
    mix.render(0, Backing::Silent, &mut first);
    mix.set_controls(
        0,
        Controls {
            gain: 0.,
            ..unity()
        },
    )
    .unwrap();
    assert!(mix
        .set_controls(
            0,
            Controls {
                gain: f32::NAN,
                ..unity()
            }
        )
        .is_err());
    assert!(mix.set_controls(3, unity()).is_err());
    let mut a = [[0.; 2]; 17];
    let mut b = [[0.; 2]; 48];
    mix.render(1, Backing::Silent, &mut a);
    mix.render(18, Backing::Silent, &mut b);
    let values: Vec<_> = a.iter().chain(&b).map(|s| s[0]).collect();
    assert_eq!(values[0], 63. / 64.);
    assert_eq!(values[62], 1. / 64.);
    assert_eq!(values[63], 0.);
    assert_eq!(values[64], 0.);
}
#[test]
fn failed_cue_does_not_interrupt_other_cue_or_backing() {
    let failed = lane(&[[5.; 2]; 1], unity());
    failed.0.status().cancel();
    let mut mix = Mixer::new(vec![failed, lane(&[[2.; 2]; 128], unity())], 0).unwrap();
    let mut out = [[0.; 2]; 64];
    mix.render(
        0,
        Backing::Audio {
            first_frame: 0,
            samples: &[[0.5; 2]; 64],
        },
        &mut out,
    );
    assert_eq!(
        mix.cue_report(0).unwrap().fault,
        Some(output::Fault::Upstream(
            crate::native_input::Fault::Cancelled
        ))
    );
    assert_eq!(out[0], [0.5; 2]);
    assert!(out[1..].iter().all(|sample| *sample == [2.5; 2]));
    assert_eq!(mix.fault(), None);
}
#[test]
fn backing_clock_and_numeric_failures_latch_whole_mix_silence() {
    for kind in 0..6 {
        let mut mix = Mixer::new(vec![lane(&[[1.; 2]; 128], unity())], 0).unwrap();
        let mut out = [[9.; 2]; 8];
        let samples = if kind == 4 {
            [[f32::NAN; 2]; 8]
        } else {
            [[1.; 2]; 8]
        };
        let backing = match kind {
            0 => Backing::Unavailable,
            1 => Backing::Audio {
                first_frame: 1,
                samples: &samples,
            },
            2 => Backing::Audio {
                first_frame: 0,
                samples: &samples[..7],
            },
            _ => Backing::Audio {
                first_frame: 0,
                samples: &samples,
            },
        };
        let first = if kind == 3 {
            1
        } else if kind == 5 {
            i64::MAX
        } else {
            0
        };
        mix.render(first, backing, &mut out);
        assert!(mix.fault().is_some());
        assert_eq!(out, [[0.; 2]; 8]);
        assert_eq!(
            mix.cue_report(0).unwrap().fault,
            Some(output::Fault::Cancelled)
        );
        mix.render(0, Backing::Silent, &mut out);
        assert_eq!(out, [[0.; 2]; 8]);
    }
}
#[test]
fn invalid_layout_and_sum_overflow_are_silent() {
    let mut mix = Mixer::new(vec![], 0).unwrap();
    let mut out = [[9.; 2]; MAX_FRAMES + 1];
    mix.render(0, Backing::Silent, &mut out);
    assert_eq!(mix.fault(), Some(Fault::Buffer));
    assert!(out.iter().all(|s| *s == [0.; 2]));
    let mut mix = Mixer::new(
        vec![lane(
            &[[f32::MAX; 2]; 8],
            Controls {
                gain: 4.,
                ..unity()
            },
        )],
        0,
    )
    .unwrap();
    let mut out = [[9.; 2]; 8];
    mix.render(0, Backing::Silent, &mut out);
    assert_eq!(mix.fault(), Some(Fault::NonFinite));
    assert_eq!(out, [[0.; 2]; 8]);
}
#[test]
fn inputs_require_one_clock_and_bounded_valid_controls() {
    let mut second = lane(&[[1.; 2]; 8], unity());
    second.1.start_frame = 1;
    assert!(Mixer::new(vec![second], 0).is_err());
    let mut second = lane(&[[1.; 2]; 8], unity());
    second.1.clock = output::ClockMap::new(second.1.clock.timebase(), 1001, 0);
    assert!(Mixer::new(vec![lane(&[[1.; 2]; 8], unity()), second], 0).is_err());
    let inputs = (0..17).map(|_| lane(&[[1.; 2]; 8], unity())).collect();
    assert!(Mixer::new(inputs, 0).is_err());
    assert!(Mixer::new(
        vec![lane(&[[1.; 2]; 8], Controls { pan: 2., ..unity() })],
        0
    )
    .is_err());
}

#[test]
fn shared_clock_binding_is_all_or_nothing_and_cannot_retime_rendered_audio() {
    let mut mix = Mixer::new(
        vec![
            lane(&[[1.; 2]; 128], unity()),
            lane(&[[2.; 2]; 128], unity()),
        ],
        0,
    )
    .unwrap();
    let clock = output::ClockMap::new(
        output::Timebase::new(1_000_000_000, 48000).unwrap(),
        1000,
        100,
    );
    assert_eq!(
        mix.bind_clock(clock, i64::MAX),
        Err(output::Fault::ClockRange)
    );
    mix.bind_clock(clock, 100).unwrap();
    let mut out = [[0.; 2]; 129];
    mix.render(100, Backing::Silent, &mut out);
    assert_eq!(out[0], [0.; 2]);
    assert_eq!(out[1..], [[3.; 2]; 128]);
    assert_eq!(mix.bind_clock(clock, 0), Err(output::Fault::OutputClock));
}
