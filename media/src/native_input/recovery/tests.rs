use super::*;
use crate::native_input::{
    input,
    output::{ClockMap, Timebase},
    recording::Recorder,
    timing::{Basis, Context, Correction},
};
use std::{
    io::{Seek, SeekFrom},
    process::Command,
};
const BASE: u64 = 1_000_000_000_000_000_000;
fn intent() -> Intent {
    Intent {
        context: Context {
            scope: "boot-fixture/run-one".into(),
            numerator: 1_000_000_000,
            denominator: 48000,
        },
        project_id: "project".into(),
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
fn snapshot(end: u64) -> Snapshot {
    Snapshot::new(
        ClockMap::new(Timebase::new(1_000_000_000, 48000).unwrap(), BASE, 0),
        2048,
        end,
    )
    .unwrap()
}
fn fixture(root: &Path, drift: u64, cycle: bool, crash: bool) -> PathBuf {
    let path = root.join("native-group-fixture");
    fs::create_dir(&path).unwrap();
    let mut intent = intent();
    if cycle {
        intent.cycle = true;
        intent.record_end_frame = Some(1400);
    }
    let mut recordings = Vec::new();
    let mut inputs = Vec::new();
    for (id, delay) in [("voice", 0), ("room", 16)] {
        let (mut writer, reader, _cue) = input();
        let mut recorder=Recorder::create(&path,reader,2,48000,serde_json::json!({"recordingGroup":"native-group-fixture","trackId":id,"source":{"nativeRecordingTiming":intent}})).unwrap();
        inputs.push((
            id.into(),
            recorder
                .directory()
                .file_name()
                .unwrap()
                .to_str()
                .unwrap()
                .into(),
        ));
        for block in 0..4 {
            assert!(writer.push(
                100 + block * 512,
                BASE + 1792 + delay + block * 512 + if block > 0 { drift } else { 0 },
                &[[0.25, -0.5]; 512]
            ));
            recorder.step().unwrap();
        }
        recorder.checkpoint().unwrap();
        recordings.push((writer, recorder));
    }
    let mut ledger = Ledger::create(&path, intent, inputs).unwrap();
    ledger.checkpoint(snapshot(3072)).unwrap();
    ledger.finish().unwrap();
    if crash {
        std::process::exit(0);
    }
    drop(recordings);
    path
}
#[test]
fn process_exit_recovers_all_inputs_at_sample_positions_without_modifying_originals() {
    const KEY: &str = "CRISPAUDIO_LEDGER_CRASH_FIXTURE";
    if let Some(root) = std::env::var_os(KEY) {
        fixture(Path::new(&root), 0, false, true);
        unreachable!();
    }
    let root = tempfile::tempdir().unwrap();
    assert!(Command::new(std::env::current_exe().unwrap()).args(["--exact","native_input::recovery::tests::process_exit_recovers_all_inputs_at_sample_positions_without_modifying_originals","--nocapture"]).env(KEY,root.path()).status().unwrap().success());
    let source = root.path().join("native-group-fixture");
    let before = originals(&source);
    let found = discover(root.path()).unwrap();
    assert_eq!(found.candidates.len(), 1);
    assert_eq!(found.candidates[0].output_end_frame, 3072);
    let (path, recovered) =
        recover(root.path(), "native-group-fixture", &AtomicBool::new(false)).unwrap();
    assert!(recovered.incomplete);
    assert!(!path.join("completed.json").exists());
    assert_eq!(recovered.manifest.clips.len(), 2);
    let placements = &recovered.manifest.timing.as_ref().unwrap().placements;
    assert_eq!(placements[0].project_start_frame, 1000);
    assert_eq!(placements[0].source_offset_frames, 256);
    assert_eq!(placements[0].frames, 768);
    assert_eq!(placements[1].source_offset_frames, 240);
    for clip in &recovered.manifest.clips {
        assert_eq!(clip.info.frames, 1024);
        let samples = hound::WavReader::open(path.join(&clip.audio))
            .unwrap()
            .samples::<f32>()
            .map(|v| v.unwrap())
            .collect::<Vec<_>>();
        assert_eq!(samples, [[0.25, -0.5]; 1024].concat());
    }
    assert_eq!(before, originals(&source));
    assert_eq!(
        load_recovered(&source).unwrap().1.manifest.timing,
        recovered.manifest.timing
    );
    assert_eq!(
        recover(root.path(), "native-group-fixture", &AtomicBool::new(false))
            .unwrap()
            .0,
        path
    );
    assert!(discover(root.path()).unwrap().candidates[0].recovered);
}
fn originals(path: &Path) -> Vec<(String, Vec<u8>)> {
    let mut files = Vec::new();
    for entry in fs::read_dir(path).unwrap() {
        let entry = entry.unwrap();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("native-take-") {
            for file in fs::read_dir(entry.path()).unwrap() {
                let file = file.unwrap();
                files.push((
                    format!("{name}/{}", file.file_name().to_string_lossy()),
                    fs::read(file.path()).unwrap(),
                ));
            }
        }
    }
    files.sort();
    files
}
#[test]
fn corrupt_tail_and_drift_keep_only_verified_whole_blocks_and_preserve_cycle_placement() {
    for mode in 0..3 {
        let root = tempfile::tempdir().unwrap();
        let source = fixture(
            root.path(),
            if mode == 1 { 100 } else { 0 },
            mode == 2,
            false,
        );
        if mode == 0 {
            let c = load_checkpoint(&source).unwrap();
            let name = &c.plan.inputs[1].1;
            let mut file = fs::OpenOptions::new()
                .write(true)
                .open(source.join(name).join("audio.partial.wav"))
                .unwrap();
            let meta: serde_json::Value = read(&source.join(name).join("take.json")).unwrap();
            file.seek(SeekFrom::Start(
                meta["data_offset"].as_u64().unwrap() + 512 * 8,
            ))
            .unwrap();
            file.write_all(&[255; 4]).unwrap();
        }
        let (_, result) =
            recover(root.path(), "native-group-fixture", &AtomicBool::new(false)).unwrap();
        assert_eq!(
            result.manifest.clips[0].info.frames,
            if mode == 1 { 512 } else { 1024 }
        );
        if mode == 0 {
            assert_eq!(result.manifest.clips[1].info.frames, 512);
            assert!(result.reasons[1].as_ref().unwrap().contains("checksum"));
        }
        if mode == 1 {
            assert!(result
                .reasons
                .iter()
                .all(|r| r.as_ref().unwrap().contains("drift")));
        }
        if mode == 2 {
            assert!(result
                .manifest
                .timing
                .as_ref()
                .unwrap()
                .placements
                .iter()
                .any(|p| p.pass == 1));
        }
    }
}
#[test]
fn incomplete_group_or_cancel_never_publishes_a_partial_recovered_result() {
    for cancelled in [false, true] {
        let root = tempfile::tempdir().unwrap();
        let source = fixture(root.path(), 0, false, false);
        let before = originals(&source);
        if !cancelled {
            let c = load_checkpoint(&source).unwrap();
            fs::remove_file(source.join(&c.plan.inputs[1].1).join("blocks.bin")).unwrap();
        }
        assert!(recover(
            root.path(),
            "native-group-fixture",
            &AtomicBool::new(cancelled)
        )
        .is_err());
        assert!(!source.join(DESTINATION).exists());
        if cancelled {
            assert_eq!(before, originals(&source));
        }
    }
}
#[test]
fn checkpoints_reject_regression_anchor_changes_and_worker_write_failure() {
    let root = tempfile::tempdir().unwrap();
    let source = fixture(root.path(), 0, false, false);
    let saved = load_checkpoint(&source).unwrap();
    fs::remove_file(source.join(PLAN)).unwrap();
    fs::remove_file(source.join(CHECKPOINT)).unwrap();
    let mut ledger = Ledger::create(&source, saved.plan.intent, saved.plan.inputs).unwrap();
    ledger.checkpoint(snapshot(4096)).unwrap();
    assert!(ledger.checkpoint(snapshot(3072)).is_err());
    let mut changed = snapshot(8192);
    changed.anchor_host = (BASE + 1).to_string();
    assert!(ledger.checkpoint(changed).is_err());
    ledger.finish().unwrap();
    assert_eq!(
        load_checkpoint(&source).unwrap().output.end_queued_frame,
        4096
    );
    fs::remove_file(source.join(PLAN)).unwrap();
    fs::remove_file(source.join(CHECKPOINT)).unwrap();
    fs::create_dir(source.join(CHECKPOINT)).unwrap();
    let mut ledger = Ledger::create(&source, intent(), saved_inputs(&source)).unwrap();
    ledger.checkpoint(snapshot(4096)).unwrap();
    assert!(ledger.finish().is_err());
}
fn saved_inputs(source: &Path) -> Vec<(String, String)> {
    let mut entries = fs::read_dir(source)
        .unwrap()
        .filter_map(|e| {
            let p = e.unwrap().path();
            let metadata = p.join("take.json");
            let bytes = fs::read(metadata).ok()?;
            let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
            Some((
                v["context"]["trackId"].as_str().unwrap().into(),
                p.file_name().unwrap().to_str().unwrap().into(),
            ))
        })
        .collect::<Vec<_>>();
    entries.sort();
    entries
}
#[test]
fn missing_torn_or_altered_ledger_is_never_an_aligned_candidate() {
    for mode in 0..4 {
        let root = tempfile::tempdir().unwrap();
        let source = fixture(root.path(), 0, false, false);
        match mode {
            0 => fs::remove_file(source.join(CHECKPOINT)).unwrap(),
            1 => {
                let f = fs::OpenOptions::new()
                    .write(true)
                    .open(source.join(CHECKPOINT))
                    .unwrap();
                f.set_len(40).unwrap();
            }
            2 => {
                let mut v: serde_json::Value = read(&source.join(CHECKPOINT)).unwrap();
                v["checkpoint"]["output"]["firstMixedFrame"] = 2050.into();
                fs::write(source.join(CHECKPOINT), serde_json::to_vec(&v).unwrap()).unwrap();
            }
            _ => {
                let mut p: Plan = read(&source.join(PLAN)).unwrap();
                p.intent.project_id = "another".into();
                fs::write(source.join(PLAN), serde_json::to_vec(&p).unwrap()).unwrap();
            }
        }
        assert!(discover(root.path()).unwrap().candidates.is_empty());
        assert!(recover(root.path(), "native-group-fixture", &AtomicBool::new(false)).is_err());
        assert!(!source.join(DESTINATION).exists());
    }
}
#[cfg(unix)]
#[test]
fn managed_paths_reject_traversal_and_known_symlinks() {
    use std::os::unix::fs::symlink;
    for part in 0..5 {
        let root = tempfile::tempdir().unwrap();
        let source = fixture(root.path(), 0, false, false);
        let c = load_checkpoint(&source).unwrap();
        let path = match part {
            0 => source.clone(),
            1 => source.join(PLAN),
            2 => source.join(CHECKPOINT),
            3 => source.join(&c.plan.inputs[0].1),
            _ => source.join(&c.plan.inputs[0].1).join("audio.partial.wav"),
        };
        let target = root.path().join("outside");
        fs::rename(&path, &target).unwrap();
        symlink(&target, &path).unwrap();
        assert!(recover(root.path(), "native-group-fixture", &AtomicBool::new(false)).is_err());
    }
    let root = tempfile::tempdir().unwrap();
    for id in [
        "../outside",
        "native-group-../outside",
        "/native-group-outside",
        "native-group-a/b",
        "native-group-a\0",
    ] {
        assert!(managed_group(root.path(), id).is_err());
    }
}
#[test]
fn discovery_is_bounded_and_complete_markers_require_separate_reconciliation() {
    let root = tempfile::tempdir().unwrap();
    let source = fixture(root.path(), 0, false, false);
    fs::write(source.join("completed.json"), b"{}").unwrap();
    assert!(discover(root.path()).unwrap().candidates.is_empty());
    assert!(recover(root.path(), "native-group-fixture", &AtomicBool::new(false)).is_err());
    for index in 0..520 {
        fs::write(root.path().join(format!("unrelated-{index}")), b"").unwrap();
    }
    let found = discover(root.path()).unwrap();
    assert!(found.truncated);
    assert_eq!(found.scanned, 512);
}
#[test]
fn reopened_recovery_rejects_changed_pcm_and_receipt_mapping() {
    for mapping in [false, true] {
        let root = tempfile::tempdir().unwrap();
        let source = fixture(root.path(), 0, false, false);
        let (destination, result) =
            recover(root.path(), "native-group-fixture", &AtomicBool::new(false)).unwrap();
        if mapping {
            let mut v: serde_json::Value = read(&destination.join(RECEIPT)).unwrap();
            v["manifest"]["clips"][0]["audio"] = "../outside/take.wav".into();
            fs::write(destination.join(RECEIPT), serde_json::to_vec(&v).unwrap()).unwrap();
        } else {
            let mut file = fs::OpenOptions::new()
                .write(true)
                .open(destination.join(&result.manifest.clips[0].audio))
                .unwrap();
            file.seek(SeekFrom::End(-4)).unwrap();
            file.write_all(&[0; 4]).unwrap();
        }
        assert!(load_recovered(&source).is_err());
    }
}

#[test]
fn complete_candidate_without_ledger_is_reviewed_by_full_manifest_verification() {
    let root = tempfile::tempdir().unwrap();
    let source = fixture(root.path(), 0, false, false);
    let (derived, result) =
        recover(root.path(), "native-group-fixture", &AtomicBool::new(false)).unwrap();
    let complete = root.path().join("native-group-complete");
    fs::rename(&derived, &complete).unwrap();
    fs::write(
        complete.join("completed.json"),
        serde_json::to_vec(&result.manifest).unwrap(),
    )
    .unwrap();
    let found = discover(root.path()).unwrap();
    let candidate = found
        .candidates
        .iter()
        .find(|c| c.group == "native-group-complete")
        .unwrap();
    assert_eq!(candidate.kind, "complete");
    assert_eq!(candidate.import_id, "boot-fixture/run-one");
    super::super::session::group::load_completed(&complete).unwrap();
    let clip = &result.manifest.clips[0];
    let mut file = fs::OpenOptions::new()
        .write(true)
        .open(complete.join(&clip.audio))
        .unwrap();
    file.seek(SeekFrom::End(-4)).unwrap();
    file.write_all(&[0; 4]).unwrap();
    assert!(super::super::session::group::load_completed(&complete).is_err());
    // Metadata remains a candidate, never a claim of verified PCM.
    assert!(discover(root.path())
        .unwrap()
        .candidates
        .iter()
        .any(|c| c.group == "native-group-complete"));
    assert!(source.exists());
}
