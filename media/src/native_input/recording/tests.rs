use super::*;
use crate::native_input::{input, InputWriter};
use serde_json::json;

fn setup(root: &Path, channels: u16, limit: u64) -> (InputWriter, Recorder) {
    let (writer, reader, _cue) = input();
    let recorder = Recorder::create(
        root,
        reader,
        channels,
        limit,
        json!({"trackId":"voice","projectId":"fixture"}),
    )
    .unwrap();
    (writer, recorder)
}
fn pcm(frames: usize, start: usize) -> Vec<[f32; 2]> {
    (start..start + frames)
        .map(|frame| [1.5 + frame as f32 * 0.001, -2. - frame as f32 * 0.002])
        .collect()
}
fn samples(path: &Path) -> Vec<u32> {
    hound::WavReader::open(path)
        .unwrap()
        .samples::<f32>()
        .map(|sample| sample.unwrap().to_bits())
        .collect()
}
#[test]
fn automatic_checkpoint_exposes_one_second_of_audio_before_finish() {
    let root = tempfile::tempdir().unwrap();
    let (mut writer, mut recorder) = setup(root.path(), 2, 96000);
    let folder = recorder.directory().to_owned();
    for block in 0..94 {
        assert!(writer.push(block * 512, 100 + block, &pcm(512, (block * 512) as usize)));
        assert_eq!(recorder.step().unwrap(), Step::Written);
    }
    assert_eq!(
        hound::WavReader::open(folder.join(AUDIO))
            .unwrap()
            .duration(),
        48128
    );
    assert_eq!(
        std::fs::metadata(folder.join(INDEX)).unwrap().len(),
        16 + 94 * 32
    );
    assert!(!folder.join(COMPLETE).exists());
    drop(writer);
    let take = recorder.finish(48128).unwrap();
    assert_eq!(take.info.frames, 48128);
}
fn recovered(directory: &Path, output: &Path) -> RecoveredTake {
    recover(directory, output, &AtomicBool::new(false)).unwrap()
}
#[test]
fn mono_stereo_streaming_checkpoints_and_exact_final_publication() {
    let root = tempfile::tempdir().unwrap();
    let mut directories = Vec::new();
    for channels in [1, 2] {
        let (mut writer, mut recorder) = setup(root.path(), channels, 4096);
        let status = recorder.reader.status();
        let folder = recorder.directory().to_owned();
        assert_eq!(recorder.step().unwrap(), Step::Idle);
        let mut expected = Vec::new();
        let mut cursor = 0;
        for (index, length) in [512, 128, 1, 379].into_iter().enumerate() {
            let block = pcm(length, cursor);
            assert!(writer.push(48000 + cursor as u64, 1000 + index as u64 * 100, &block));
            assert_eq!(recorder.step().unwrap(), Step::Written);
            expected.extend(
                block
                    .iter()
                    .flat_map(|sample| sample[..channels as usize].iter().map(|v| v.to_bits())),
            );
            cursor += length;
            if index == 1 {
                recorder.checkpoint().unwrap();
                assert_eq!(samples(&folder.join(AUDIO)), expected);
                assert!(!folder.join(COMPLETE).exists());
            }
        }
        drop(writer);
        let take = recorder.finish(cursor as u64).unwrap();
        assert_eq!(status.fault(), None);
        assert_eq!(take.info.frames, 1020);
        assert_eq!(take.info.first_input_frame, 48000);
        assert_eq!(take.info.first_host_time, 1000);
        assert_eq!(take.info.context["trackId"], "voice");
        assert_eq!(take.info.channels, channels);
        assert_eq!(samples(&take.path), expected);
        assert_eq!(samples(&folder.join(AUDIO)), expected);
        assert_eq!(take.recovery_directory, folder);
        let recovered = recovered(
            &folder,
            &root.path().join(format!("recovered-{channels}.wav")),
        );
        assert!(recovered.incomplete);
        assert_eq!(recovered.info, take.info);
        assert_eq!(recovered.stopped_reason, None);
        assert_eq!(samples(&recovered.path), expected);
        directories.push(folder);
    }
    assert_ne!(directories[0], directories[1]);
}
#[test]
fn dropped_take_and_damaged_wave_lengths_recover_without_touching_originals() {
    let root = tempfile::tempdir().unwrap();
    let (mut writer, mut recorder) = setup(root.path(), 2, 4096);
    let folder = recorder.directory().to_owned();
    let status = recorder.reader.status();
    let block = [[-0., 1.5], [2.5, -2.]];
    assert!(writer.push(0, 100, &block));
    recorder.step().unwrap();
    drop(writer);
    drop(recorder); // Cancellation does not publish take.wav.
    assert_eq!(status.fault(), Some(Fault::Cancelled));
    assert!(!folder.join(COMPLETE).exists());
    let metadata: Metadata =
        serde_json::from_slice(&std::fs::read(folder.join(META)).unwrap()).unwrap();
    let mut file = OpenOptions::new()
        .write(true)
        .open(folder.join(AUDIO))
        .unwrap();
    file.seek(SeekFrom::Start(4)).unwrap();
    file.write_all(&[255; 4]).unwrap();
    file.seek(SeekFrom::Start(metadata.data_offset - 4))
        .unwrap();
    file.write_all(&[0; 4]).unwrap();
    file.sync_all().unwrap();
    let before = std::fs::read(folder.join(AUDIO)).unwrap();
    let take = recovered(&folder, &root.path().join("salvaged.wav"));
    assert_eq!(take.info.frames, 2);
    assert!(take.incomplete);
    assert_eq!(
        samples(&take.path),
        block
            .iter()
            .flatten()
            .map(|v| v.to_bits())
            .collect::<Vec<_>>()
    );
    assert_eq!(std::fs::read(folder.join(AUDIO)).unwrap(), before);
}
#[test]
fn corrupted_or_torn_blocks_recover_only_the_verified_prefix() {
    for mode in 0..5 {
        let root = tempfile::tempdir().unwrap();
        let (mut writer, mut recorder) = setup(root.path(), 2, 4096);
        let folder = recorder.directory().to_owned();
        let mut cursor = 0;
        for length in [128, 31, 64] {
            assert!(writer.push(cursor as u64, 100 + cursor as u64, &pcm(length, cursor)));
            recorder.step().unwrap();
            cursor += length;
        }
        drop(writer);
        drop(recorder);
        let metadata: Metadata =
            serde_json::from_slice(&std::fs::read(folder.join(META)).unwrap()).unwrap();
        match mode {
            0 => {
                let mut file = OpenOptions::new()
                    .append(true)
                    .open(folder.join(INDEX))
                    .unwrap();
                file.write_all(&[0; 17]).unwrap();
            }
            1 => {
                let mut file = OpenOptions::new()
                    .write(true)
                    .open(folder.join(AUDIO))
                    .unwrap();
                file.seek(SeekFrom::Start(metadata.data_offset + 128 * 8))
                    .unwrap();
                file.write_all(&[255; 4]).unwrap();
            }
            2 => {
                OpenOptions::new()
                    .write(true)
                    .open(folder.join(AUDIO))
                    .unwrap()
                    .set_len(metadata.data_offset + 128 * 8 + 7)
                    .unwrap();
            }
            3 => {
                let mut file = OpenOptions::new()
                    .write(true)
                    .open(folder.join(INDEX))
                    .unwrap();
                file.seek(SeekFrom::Start(16 + 32 + 16)).unwrap();
                file.write_all(&u32::MAX.to_le_bytes()).unwrap();
            }
            4 => {
                let mut file = OpenOptions::new()
                    .write(true)
                    .open(folder.join(INDEX))
                    .unwrap();
                file.seek(SeekFrom::Start(16 + 32)).unwrap();
                file.write_all(&127u64.to_le_bytes()).unwrap();
            }
            _ => unreachable!(),
        }
        let take = recovered(&folder, &root.path().join("prefix.wav"));
        let expected = if mode == 0 { 223 } else { 128 };
        assert_eq!(take.info.frames, expected);
        assert!(take.stopped_reason.is_some());
        assert_eq!(
            samples(&take.path),
            pcm(expected as usize, 0)
                .iter()
                .flatten()
                .map(|v| v.to_bits())
                .collect::<Vec<_>>()
        );
    }
}
#[test]
fn raw_overflow_and_take_limit_never_publish_complete_audio() {
    let root = tempfile::tempdir().unwrap();
    let (mut writer, recorder) = setup(root.path(), 1, 4096);
    let folder = recorder.directory().to_owned();
    for frame in 0..DRY_SLOTS as u64 {
        assert!(writer.push(frame, frame, &[[0.5; 2]]));
    }
    assert!(!writer.push(DRY_SLOTS as u64, 0, &[[0.5; 2]]));
    drop(writer);
    assert!(recorder.finish(DRY_SLOTS as u64).is_err());
    assert!(!folder.join(COMPLETE).exists());
    assert_eq!(
        recovered(&folder, &root.path().join("overflow.wav"))
            .info
            .frames,
        DRY_SLOTS as u64
    );
    let (mut writer, mut recorder) = setup(root.path(), 2, 128);
    let folder = recorder.directory().to_owned();
    for frame in [0, 64] {
        assert!(writer.push(frame, frame, &pcm(64, frame as usize)));
        recorder.step().unwrap();
    }
    assert!(writer.push(128, 128, &pcm(1, 128)));
    assert!(recorder.step().is_err());
    assert_eq!(recorder.reader.status().fault(), Some(Fault::Storage));
    drop(writer);
    drop(recorder);
    assert!(!folder.join(COMPLETE).exists());
    assert_eq!(
        recovered(&folder, &root.path().join("limit.wav"))
            .info
            .frames,
        128
    );
}
#[test]
fn storage_error_latches_ingress_and_retains_prior_durable_blocks() {
    let root = tempfile::tempdir().unwrap();
    let (mut writer, mut recorder) = setup(root.path(), 2, 4096);
    let folder = recorder.directory().to_owned();
    assert!(writer.push(0, 100, &pcm(128, 0)));
    recorder.step().unwrap();
    recorder.checkpoint().unwrap();
    // Real OS write error: replace the buffered index descriptor with read-only.
    recorder.index = BufWriter::new(File::open(folder.join(INDEX)).unwrap());
    assert!(writer.push(128, 200, &pcm(31, 128)));
    recorder.step().unwrap();
    assert!(recorder.checkpoint().is_err());
    assert_eq!(recorder.reader.status().fault(), Some(Fault::Storage));
    assert!(!writer.push(159, 300, &pcm(1, 159)));
    drop(writer);
    drop(recorder);
    let take = recovered(&folder, &root.path().join("storage-prefix.wav"));
    assert_eq!(take.info.frames, 128);
    assert!(!folder.join(COMPLETE).exists());
}
#[test]
fn live_empty_and_mismatched_owner_counts_cannot_finish() {
    for mode in 0..3 {
        let root = tempfile::tempdir().unwrap();
        let (mut writer, mut recorder) = setup(root.path(), 2, 4096);
        let folder = recorder.directory().to_owned();
        if mode != 1 {
            assert!(writer.push(0, 100, &pcm(128, 0)));
            recorder.step().unwrap();
        }
        if mode == 0 {
            assert!(recorder.finish(128).is_err());
            drop(writer);
        } else {
            drop(writer);
            assert!(recorder.finish(127).is_err());
        }
        assert!(!folder.join(COMPLETE).exists());
        let output = root.path().join("recovered.wav");
        if mode == 1 {
            assert!(recover(&folder, &output, &AtomicBool::new(false)).is_err());
            assert!(!output.exists());
        } else {
            assert_eq!(recovered(&folder, &output).info.frames, 128);
        }
    }
}
#[test]
fn publication_cancellation_and_metadata_failure_preserve_all_existing_files() {
    let root = tempfile::tempdir().unwrap();
    let (mut writer, mut recorder) = setup(root.path(), 2, 4096);
    let folder = recorder.directory().to_owned();
    assert!(writer.push(0, 100, &pcm(128, 0)));
    recorder.step().unwrap();
    drop(writer);
    std::fs::write(folder.join(COMPLETE), b"keep existing take").unwrap();
    assert!(recorder.finish(128).is_err());
    assert_eq!(
        std::fs::read(folder.join(COMPLETE)).unwrap(),
        b"keep existing take"
    );
    let output = root.path().join("existing.wav");
    std::fs::write(&output, b"keep output").unwrap();
    assert!(recover(&folder, &output, &AtomicBool::new(false)).is_err());
    assert_eq!(std::fs::read(&output).unwrap(), b"keep output");
    let output = root.path().join("cancelled.wav");
    assert!(recover(&folder, &output, &AtomicBool::new(true)).is_err());
    assert!(!output.exists());
    let meta = std::fs::read(folder.join(META)).unwrap();
    std::fs::write(folder.join(META), [meta, b" ".to_vec()].concat()).unwrap(); // Valid JSON, mismatched checksum.
    assert!(recover(&folder, &output, &AtomicBool::new(false)).is_err());
    assert!(!output.exists());
}
#[cfg(unix)]
#[test]
fn recovery_never_follows_source_or_destination_symlinks() {
    let root = tempfile::tempdir().unwrap();
    let (mut writer, mut recorder) = setup(root.path(), 1, 4096);
    let folder = recorder.directory().to_owned();
    assert!(writer.push(0, 100, &pcm(128, 0)));
    recorder.step().unwrap();
    drop(writer);
    drop(recorder);
    let existing = root.path().join("existing.wav");
    std::fs::write(&existing, b"keep").unwrap();
    let output = root.path().join("symlink.wav");
    std::os::unix::fs::symlink(&existing, &output).unwrap();
    assert!(recover(&folder, &output, &AtomicBool::new(false)).is_err());
    assert_eq!(std::fs::read(&existing).unwrap(), b"keep");
    let source = folder.join(AUDIO);
    std::fs::rename(&source, folder.join("original.wav")).unwrap();
    std::os::unix::fs::symlink(folder.join("original.wav"), &source).unwrap();
    assert!(recover(
        &folder,
        &root.path().join("out.wav"),
        &AtomicBool::new(false)
    )
    .is_err());
}
#[test]
fn abrupt_process_exit_recovers_checkpoint_without_drop_or_finalization() {
    let root = tempfile::tempdir().unwrap();
    let result = std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "native_input::recording::tests::abrupt_exit_fixture",
            "--ignored",
        ])
        .env("CRISPAUDIO_RECORDING_CRASH_FIXTURE_ROOT", root.path())
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let folder = PathBuf::from(std::fs::read_to_string(root.path().join("fixture-path")).unwrap());
    assert!(!folder.join(COMPLETE).exists());
    let take = recovered(&folder, &root.path().join("after-crash.wav"));
    assert_eq!(take.info.frames, 159);
    assert_eq!(
        samples(&take.path),
        pcm(159, 0)
            .iter()
            .flatten()
            .map(|v| v.to_bits())
            .collect::<Vec<_>>()
    );
}
#[test]
#[ignore = "Child-process support fixture; parent recovery test supplies its directory"]
fn abrupt_exit_fixture() {
    let Ok(root) = std::env::var("CRISPAUDIO_RECORDING_CRASH_FIXTURE_ROOT") else {
        return;
    };
    let root = Path::new(&root);
    let (mut writer, mut recorder) = setup(root, 2, 4096);
    assert!(writer.push(0, 100, &pcm(128, 0)));
    recorder.step().unwrap();
    assert!(writer.push(128, 200, &pcm(31, 128)));
    recorder.step().unwrap();
    recorder.checkpoint().unwrap();
    assert!(writer.push(159, 300, &pcm(512, 159)));
    recorder.step().unwrap(); // Intentionally uncheckpointed.
    let mut marker = File::create(root.join("fixture-path")).unwrap();
    marker
        .write_all(recorder.directory().to_str().unwrap().as_bytes())
        .unwrap();
    marker.sync_all().unwrap();
    std::process::exit(0); // Skips every destructor and WAV finalization.
}
