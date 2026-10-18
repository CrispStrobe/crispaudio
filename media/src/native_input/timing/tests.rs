use super::*;
use crate::native_input::{
    session::{
        group::{self, Group, GroupOutcome},
        Capture, Config, Outcome, Report,
    },
    InputWriter,
};
use std::{fs, time::Duration};
const BASE: u64 = 1_000_000_000_000_000_000;
struct Fake {
    writer: Option<InputWriter>,
    frames: u64,
}
impl Capture for Fake {
    fn report(&self) -> Report {
        Report {
            frames: self.frames,
            callbacks: 2,
            fault: None,
            peaks: [0.25; 2],
        }
    }
    fn check_device(&self) -> Result<()> {
        Ok(())
    }
    fn finish(mut self) -> Result<Report> {
        drop(self.writer.take());
        Ok(self.report())
    }
}
fn make_intent() -> Intent {
    Intent {
        context: Context {
            scope: "boot-fixture/run-a".into(),
            numerator: 1_000_000_000,
            denominator: 48000,
        },
        project_id: "fixture-project".into(),
        lead_frames: 0,
        project_start_frame: 1000,
        record_start_frame: 1000,
        record_end_frame: None,
        cycle: false,
        max_drift_frames: 4,
        corrections: ["voice", "room"]
            .into_iter()
            .map(|id| {
                (
                    id.into(),
                    Correction {
                        frames: 0,
                        basis: Basis::Unqualified,
                    },
                )
            })
            .collect(),
    }
}
fn specs() -> Vec<Input> {
    ["voice", "room"]
        .into_iter()
        .map(|id| Input {
            track_id: id.into(),
            recording: Config {
                channels: 2,
                max_frames: 48000,
                context: serde_json::json!({"project":"fixture"}),
                callback_timeout: Duration::from_secs(5),
            },
            cue: None,
        })
        .collect()
}
fn snapshot() -> Snapshot {
    Snapshot::new(
        ClockMap::new(Timebase::new(1_000_000_000, 48000).unwrap(), BASE, 0),
        2048,
        8192,
    )
    .unwrap()
}
fn capture(root: &Path, intent: &Intent, drift: u64, blocks: u64, stamp: bool) -> Group<Fake> {
    let mut specs = specs();
    if stamp {
        intent.stamp(&mut specs).unwrap();
    }
    Group::start(root, specs, |id, mut writer| {
        let delay = if id == "room" { 16 } else { 0 };
        for block in 0..blocks {
            assert!(writer.push(
                100 + block * 512,
                BASE + 1792 + delay + block * 512 + if block > 0 { drift } else { 0 },
                &[[0.25, -0.5]; 512]
            ));
        }
        Ok(Fake {
            writer: Some(writer),
            frames: blocks * 512,
        })
    })
    .unwrap()
    .0
}
fn complete(outcome: GroupOutcome) -> (std::path::PathBuf, group::Manifest) {
    let GroupOutcome::Complete {
        directory,
        manifest,
    } = outcome
    else {
        panic!("expected timed complete group: {outcome:?}")
    };
    (directory, manifest)
}
fn incomplete(outcome: GroupOutcome, needle: &str) {
    let GroupOutcome::Incomplete {
        directory,
        reason,
        inputs,
    } = outcome
    else {
        panic!("must retain incomplete group")
    };
    assert!(reason.contains(needle), "{reason}");
    assert!(!directory.join("completed.json").exists());
    assert!(inputs
        .iter()
        .all(|input| matches!(input.outcome, Outcome::Complete(_))));
}
#[test]
fn mixed_activation_not_initial_anchor_places_two_inputs_and_reopens_exactly() {
    let root = tempfile::tempdir().unwrap();
    let intent = make_intent();
    let (directory, manifest) =
        complete(capture(root.path(), &intent, 3, 2, true).stop_timed(intent, || Ok(snapshot())));
    assert_eq!(manifest.version, 2);
    let timing = manifest.timing.as_ref().unwrap();
    assert_eq!(timing.output.anchor_host, BASE.to_string());
    assert_eq!(timing.placements.len(), 2);
    assert_eq!(
        timing.placements[0],
        Placement {
            track_id: "voice".into(),
            pass: 0,
            project_start_frame: 1000,
            source_offset_frames: 256,
            frames: 768
        }
    );
    assert_eq!(timing.placements[1].source_offset_frames, 240);
    assert_eq!(timing.placements[1].frames, 784);
    assert_eq!(timing.traces[0].max_drift_frames, 3);
    assert_eq!(
        group::load_completed(&directory).unwrap().timing,
        manifest.timing
    );
}
#[test]
fn preroll_punch_and_loop_passes_retain_raw_offsets_and_explicit_correction() {
    let root = tempfile::tempdir().unwrap();
    let mut intent = make_intent();
    intent.record_start_frame = 1200;
    intent.record_end_frame = Some(1600);
    intent.cycle = true;
    intent.corrections.get_mut("voice").unwrap().frames = 32;
    intent.corrections.get_mut("voice").unwrap().basis = Basis::Manual;
    let (_, manifest) =
        complete(capture(root.path(), &intent, 0, 2, true).stop_timed(intent, || Ok(snapshot())));
    let timing = manifest.timing.unwrap();
    let voice = timing
        .placements
        .iter()
        .filter(|p| p.track_id == "voice")
        .collect::<Vec<_>>();
    assert_eq!(
        *voice[0],
        Placement {
            track_id: "voice".into(),
            pass: 0,
            project_start_frame: 1200,
            source_offset_frames: 424,
            frames: 400
        }
    );
    assert_eq!(
        *voice[1],
        Placement {
            track_id: "voice".into(),
            pass: 1,
            project_start_frame: 1200,
            source_offset_frames: 824,
            frames: 200
        }
    );
    assert_eq!(manifest.clips[0].info.frames, 1024);
}
#[test]
fn drift_missing_intent_wrong_timebase_and_unqueued_extent_prevent_publication() {
    for case in 0..5 {
        let root = tempfile::tempdir().unwrap();
        let mut intent = make_intent();
        let drift = if case == 0 { 5 } else { 0 };
        let group = capture(root.path(), &intent, drift, 2, case != 1);
        if case == 4 {
            intent.project_id = "another-project".into();
        }
        let mut output = snapshot();
        if case == 2 {
            output.numerator = 125;
        }
        if case == 3 {
            output.end_queued_frame = 2050;
        }
        let needle = match case {
            0 => "drift",
            1 => "intent/source mismatch",
            2 => "timebase mismatch",
            3 => "queued backing",
            _ => "intent/source mismatch",
        };
        incomplete(group.stop_timed(intent, || Ok(output)), needle);
    }
}
#[test]
fn reopen_rejects_changed_placement_clock_index_audio_and_version() {
    for case in 0..6 {
        let root = tempfile::tempdir().unwrap();
        let intent = make_intent();
        let (directory, manifest) = complete(
            capture(root.path(), &intent, 0, 2, true).stop_timed(intent, || Ok(snapshot())),
        );
        let marker = directory.join("completed.json");
        if case < 3 || case == 5 {
            let mut value: serde_json::Value =
                serde_json::from_slice(&fs::read(&marker).unwrap()).unwrap();
            match case {
                0 => value["timing"]["output"]["firstMixedFrame"] = serde_json::json!(2049),
                1 => {
                    value["timing"]["placements"][0]["sourceOffsetFrames"] = serde_json::json!(255)
                }
                2 => value["version"] = serde_json::json!(1),
                _ => {
                    value["timing"]["intent"]["context"]["scope"] =
                        serde_json::json!("another-boot/run-b")
                }
            };
            fs::write(&marker, serde_json::to_vec(&value).unwrap()).unwrap();
        } else {
            let take = directory.join(&manifest.clips[0].audio);
            let path = if case == 3 {
                take.parent().unwrap().join("blocks.bin")
            } else {
                take
            };
            let mut bytes = fs::read(&path).unwrap();
            let offset = if case == 3 { 24 } else { bytes.len() - 1 };
            bytes[offset] ^= 1;
            fs::write(path, bytes).unwrap();
        }
        assert!(group::load_completed(&directory).is_err(), "case {case}");
    }
}
#[test]
fn intent_stamping_is_atomic_and_cannot_reuse_a_prior_run() {
    let intent = make_intent();
    let mut inputs = specs();
    let first = inputs[0].recording.context.clone();
    inputs[1].recording.context = serde_json::json!("bad");
    assert!(intent.stamp(&mut inputs).is_err());
    assert_eq!(inputs[0].recording.context, first);
    let mut inputs = specs();
    intent.stamp(&mut inputs).unwrap();
    let first = inputs[0].recording.context.clone();
    assert!(intent.stamp(&mut inputs).is_err());
    assert_eq!(inputs[0].recording.context, first);
    let mut invalid = intent.clone();
    invalid.corrections.get_mut("voice").unwrap().frames = 1;
    assert!(invalid.stamp(&mut specs()).is_err());
}
#[test]
fn tiny_cycle_budget_and_far_clock_origins_fail_without_partial_aligned_sets() {
    let root = tempfile::tempdir().unwrap();
    let mut intent = make_intent();
    intent.project_start_frame = 0;
    intent.record_start_frame = 0;
    intent.record_end_frame = Some(1);
    intent.cycle = true;
    incomplete(
        capture(root.path(), &intent, 0, 10, true).stop_timed(intent, || Ok(snapshot())),
        "placement budget",
    );
    let mut out = snapshot();
    out.anchor_host = "0".into();
    out.end_queued_frame = i64::MAX;
    let intent = make_intent();
    incomplete(
        capture(root.path(), &intent, 0, 2, true).stop_timed(intent, || Ok(out)),
        "outside the project clock",
    );
}

#[test]
fn count_in_lead_is_not_imported_as_project_audio_or_cue_compensation() {
    let root = tempfile::tempdir().unwrap();
    let mut intent = make_intent();
    intent.lead_frames = 256;
    let (_, manifest) =
        complete(capture(root.path(), &intent, 0, 2, true).stop_timed(intent, || Ok(snapshot())));
    let timing = manifest.timing.unwrap();
    assert_eq!(timing.placements[0].source_offset_frames, 512);
    assert_eq!(timing.placements[0].project_start_frame, 1000);
    assert_eq!(timing.placements[0].frames, 512);
}

#[cfg(target_os = "macos")]
#[test]
fn mac_boot_and_run_context_is_read_only_stable_and_distinguishes_runs() {
    let timebase = crate::native_input::macos::HostTimebase::current().unwrap();
    let a = timebase.recording_context("run-a").unwrap();
    let same = timebase.recording_context("run-a").unwrap();
    let b = timebase.recording_context("run-b").unwrap();
    assert_eq!(a, same);
    assert_ne!(a.scope, b.scope);
    assert_eq!(a.scope.split(':').next(), b.scope.split(':').next());
    assert_eq!(
        (a.numerator, a.denominator),
        timebase.clock_map(0, 0).timebase().ratio()
    );
    assert!(timebase.recording_context("../run").is_err());
    assert!(timebase.recording_context("").is_err());
}
