use super::*;
use crate::{
    native_graph::{Insert, Source},
    native_input::timing::{Basis, Context, Correction},
};
use std::collections::{BTreeMap, HashMap, VecDeque};
fn plan() -> Plan {
    Plan {
        intent: Intent {
            context: Context {
                scope: "generated-boot:recording".into(),
                numerator: 1,
                denominator: 1,
            },
            project_id: "p".into(),
            lead_frames: 137,
            project_start_frame: 713,
            record_start_frame: 800,
            record_end_frame: Some(1901),
            cycle: false,
            max_drift_frames: 2,
            corrections: BTreeMap::from([(
                "a".into(),
                Correction {
                    frames: 0,
                    basis: Basis::Unqualified,
                },
            )]),
        },
        frames: 2503,
        count_in_frames: 0,
        click: None,
    }
}
struct Delay(VecDeque<Stereo>);
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
fn graph(delayed: bool) -> Graph {
    let mut doc = serde_json::json!({"sampleRate":48000,"duration":2048./48000.,"masterVolume":0.5,"tracks":[{"id":"a","volume":1,"pan":0,"segments":[{"id":"c","sourceId":"s","startTime":0,"sourceOffset":0,"duration":2048./48000.,"gain":1,"effects":[]}]}]});
    if delayed {
        doc["nativeEffects"] = serde_json::json!([{"instanceId":"delay","pluginId":"test","enabled":true,"bypass":false,"parameters":{},"state":""}]);
    }
    Graph::prepare(
        &doc,
        HashMap::from([(
            "s".into(),
            Source::new(vec![(0..2048).map(|i| i as f32 / 2048.).collect()]).unwrap(),
        )]),
        |_| Ok(Box::new(Delay(VecDeque::from(vec![[0.; 2]; 37])))),
    )
    .unwrap()
}
fn render(mut recording: Recording, sizes: &[usize]) -> Vec<Stereo> {
    let mut output = Vec::new();
    for size in sizes.iter().cycle() {
        let count = (*size).min((recording.plan.frames - recording.position) as usize);
        if count == 0 {
            break;
        }
        let mut block = vec![[9.; 2]; count];
        recording.render(&mut block).unwrap();
        output.extend(block);
    }
    output
}
fn reference(mut graph: Graph, plan: &Plan) -> Vec<Stereo> {
    if plan.intent.cycle {
        graph
            .set_cycle(
                plan.intent.record_start_frame as u32,
                plan.intent.record_end_frame.unwrap() as u32,
            )
            .unwrap();
    }
    let begin = plan.intent.project_start_frame as usize + graph.latency();
    let count = plan.frames as usize - plan.intent.lead_frames as usize;
    let mut all = vec![[0.; 2]; begin + count];
    for block in all.chunks_mut(173) {
        graph.render(block).unwrap();
    }
    let mut expected = vec![[0.; 2]; plan.intent.lead_frames as usize];
    expected.extend_from_slice(&all[begin..]);
    expected
}
#[test]
fn lead_preroll_loop_and_latency_match_an_independent_graph_clock() {
    for cycle in [false, true] {
        for delayed in [false, true] {
            let mut p = plan();
            p.intent.cycle = cycle;
            p.frames = 5137;
            let expected = reference(graph(delayed), &p);
            let actual = render(
                Recording::prepare(graph(delayed), p.clone(), &Control::default()).unwrap(),
                &[1, 511, 83, 17, 512],
            );
            assert_eq!(actual, expected, "cycle={cycle}, delayed={delayed}");
            assert_eq!(&actual[..137], &vec![[0.; 2]; 137]);
            // Count-in did not advance the graph; first visible frame is project 713.
            assert_eq!(actual[137], expected[137]);
        }
    }
}
fn click() -> Click {
    Click {
        tempo: 137.,
        numerator: 3,
        denominator: 8,
        origin_seconds: 0.007,
        level: 0.5,
        metronome: true,
    }
}
#[test]
fn count_in_and_loop_clicks_are_block_invariant_and_monitor_only() {
    let mut p = plan();
    p.intent.lead_frames = 7013;
    p.count_in_frames = 5000;
    p.frames = 30003;
    p.intent.cycle = true;
    p.intent.record_start_frame = 800;
    p.intent.record_end_frame = Some(1901);
    p.click = Some(click());
    let expected = render(
        Recording::prepare(graph(true), p.clone(), &Control::default()).unwrap(),
        &[512],
    );
    let actual = render(
        Recording::prepare(graph(true), p.clone(), &Control::default()).unwrap(),
        &[1, 3, 17, 499, 37],
    );
    assert_eq!(actual, expected);
    assert!(actual[..2013].iter().all(|v| *v == [0.; 2]));
    assert!(actual[2013..7013].iter().any(|v| v[0] != 0.));
    let dry = reference(graph(true), &p);
    // The graph and file path have no click settings or modified source samples.
    assert_eq!(dry[..7013], vec![[0.; 2]; 7013]);
    assert_ne!(actual, dry);
    // Disabling project metronome retains the explicit count-in only.
    p.click.as_mut().unwrap().metronome = false;
    let count_only = render(
        Recording::prepare(graph(true), p.clone(), &Control::default()).unwrap(),
        &[173],
    );
    assert_eq!(count_only[..7013], actual[..7013]);
    assert_eq!(count_only[7013..], dry[7013..]);
}
#[test]
fn click_onsets_respect_half_open_windows_accent_and_fractional_beat_period() {
    let c = click();
    let period = 48000. * 60. / c.tempo * 4. / c.denominator as f64;
    for index in [-3i64, -1, 0, 1, 3, 1000] {
        let onset = (c.origin_seconds * 48000. + index as f64 * period).round() as i64;
        assert_eq!(c.sample(onset - 1, onset, onset + 2000, false), 0.);
        assert_eq!(c.sample(onset + 2000, onset, onset + 2000, false), 0.);
        assert_eq!(c.sample(onset + 1, onset + 1, onset + 2000, false), 0.); // no stale tail on seek
        let frequency = if index.rem_euclid(3) == 0 {
            1200.
        } else {
            800.
        };
        let expected = (0.08 * c.level as f64 / 96.
            * (std::f64::consts::TAU * frequency / 48000.).sin()) as f32;
        assert!((c.sample(onset + 1, onset, onset + 2000, false) - expected).abs() < 1e-8);
        assert_eq!(c.sample(onset + 1920, onset, onset + 2000, false), 0.);
    }
}
#[test]
fn invalid_transport_and_cancelled_preroll_reject_before_publication() {
    let mut cases = Vec::new();
    let mut p = plan();
    p.frames = 32_000_001;
    cases.push(p);
    let mut p = plan();
    p.frames = p.intent.lead_frames as u64;
    cases.push(p);
    let mut p = plan();
    p.count_in_frames = 138;
    cases.push(p);
    let mut p = plan();
    p.count_in_frames = 1;
    cases.push(p);
    let mut p = plan();
    p.intent.cycle = true;
    p.intent.record_end_frame = Some(2049);
    cases.push(p);
    let mut p = plan();
    p.intent.project_start_frame = u32::MAX as i64;
    p.intent.record_start_frame = u32::MAX as i64;
    p.intent.record_end_frame = None;
    cases.push(p);
    for invalid in [f64::NAN, 19., 301.] {
        let mut p = plan();
        let mut c = click();
        c.tempo = invalid;
        p.click = Some(c);
        cases.push(p);
    }
    let mut p = plan();
    p.click = Some(Click {
        level: f32::NAN,
        ..click()
    });
    cases.push(p);
    for p in cases {
        assert!(Recording::prepare(graph(false), p, &Control::default()).is_err());
    }
    let cancelled = Control::default();
    cancelled.stop();
    assert!(Recording::prepare(graph(true), plan(), &cancelled).is_err());
    let mut renderer = Recording::prepare(graph(false), plan(), &Control::default()).unwrap();
    let mut too_big = [[1.; 2]; MAX_FRAMES + 1];
    assert!(renderer.render(&mut too_big).is_err());
    assert_eq!(too_big, [[0.; 2]; MAX_FRAMES + 1]);
    assert_eq!(renderer.position, 0);
}
#[test]
fn recording_worker_primes_lead_and_graph_without_allocating_total_pcm() {
    let mut p = plan();
    p.intent.cycle = true;
    p.frames = 7001;
    p.count_in_frames = 100;
    p.click = Some(click());
    let expected = render(
        Recording::prepare(graph(true), p.clone(), &Control::default()).unwrap(),
        &[71],
    );
    let (mut worker, mut reader) =
        Worker::recording(Duration::from_secs(2), p, |_| Ok(graph(true))).unwrap();
    let mut actual = vec![[1.; 2]; 7168];
    for block in actual.chunks_mut(512) {
        reader.render(block).unwrap();
    }
    assert_eq!(actual[..7001], expected);
    assert_eq!(actual[7001..], [[0.; 2]; 167]);
    worker.poll().unwrap();
}
