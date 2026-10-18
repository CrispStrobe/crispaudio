use super::*;
struct Scratch(PathBuf);
impl Scratch {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "crispaudio-conversion-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn id(n: usize) -> String {
    format!("00000000-0000-4000-8000-{n:012x}")
}
fn wav() -> Vec<u8> {
    let mut bytes = std::io::Cursor::new(Vec::new());
    {
        let mut writer = hound::WavWriter::new(
            &mut bytes,
            hound::WavSpec {
                channels: 1,
                sample_rate: 44100,
                bits_per_sample: 32,
                sample_format: hound::SampleFormat::Float,
            },
        )
        .unwrap();
        for _ in 0..441 {
            writer.write_sample(0.25f32).unwrap();
        }
        writer.finalize().unwrap();
    }
    bytes.into_inner()
}
fn collect(state: &ConversionFiles, root: &Path) {
    state.0.lock().unwrap().collect(root).unwrap();
}
#[test]
fn failed_partial_import_removes_only_its_files_and_retry_can_succeed() {
    let scratch = Scratch::new();
    let root = scratch.0.join("owned");
    let original = scratch.0.join("original.wav");
    fs::write(&original, wav()).unwrap();
    let state = ConversionFiles::default();
    state.begin("a", &root, &id(1)).unwrap();
    let path = state.write("a", &id(1), &wav()).unwrap();
    assert!(state.write("a", &id(1), b"not a WAV").is_err());
    assert!(Path::new(&path).exists());
    state.finish("a", &id(1), false).unwrap();
    assert!(!root.join(id(1)).exists());
    assert_eq!(fs::read(original).unwrap(), wav());
    state.begin("a", &root, &id(2)).unwrap();
    let path = state.write("a", &id(2), &wav()).unwrap();
    state.protect("a", &id(2)).unwrap();
    state.finish("a", &id(2), true).unwrap();
    state.shutdown();
    collect(&state, &root);
    assert_eq!(fs::read(path).unwrap(), wav());
}
#[test]
fn retained_project_and_undo_files_survive_window_shutdown_and_future_collection() {
    let scratch = Scratch::new();
    let state = ConversionFiles::default();
    state.begin("a", &scratch.0, &id(1)).unwrap();
    let path = state.write("a", &id(1), &wav()).unwrap();
    state.protect("a", &id(1)).unwrap();
    state.close_owner("a");
    collect(&state, &scratch.0);
    assert_eq!(fs::read(&path).unwrap(), wav());
    // An acknowledgement lost during publication is conservatively retained.
    assert!(state.0.lock().unwrap().active.is_empty());
    let next = ConversionFiles::default();
    collect(&next, &scratch.0);
    assert!(Path::new(&path).exists());
}
#[test]
fn abandoned_pending_is_collected_but_a_live_cross_instance_lease_is_not() {
    let scratch = Scratch::new();
    let live = ConversionFiles::default();
    live.begin("a", &scratch.0, &id(1)).unwrap();
    let path = live.write("a", &id(1), &wav()).unwrap();
    let collector = ConversionFiles::default();
    collect(&collector, &scratch.0);
    assert!(Path::new(&path).exists());
    drop(live); // Simulate process loss: drop locks without normal window cleanup.
    collect(&collector, &scratch.0);
    assert!(!Path::new(&path).exists());
    assert!(!scratch.0.join(id(1)).exists());
}
#[test]
fn capabilities_are_owner_scoped_and_never_accept_paths_or_touch_symlink_targets() {
    let scratch = Scratch::new();
    let state = ConversionFiles::default();
    assert!(state.begin("a", &scratch.0, "../outside").is_err());
    state.begin("a", &scratch.0, &id(1)).unwrap();
    assert!(state.write("other", &id(1), &wav()).is_err());
    assert!(state.protect("other", &id(1)).is_err());
    assert!(state.finish("other", &id(1), false).is_err());
    let outside = scratch.0.join("keep.wav");
    fs::write(&outside, wav()).unwrap();
    let link = scratch.0.join(id(1)).join("source-0.wav");
    std::os::unix::fs::symlink(&outside, &link).unwrap();
    assert!(state.write("a", &id(1), &wav()).is_err());
    assert!(state.finish("a", &id(1), false).is_err());
    state.close_owner("a");
    collect(&state, &scratch.0);
    assert!(link.symlink_metadata().unwrap().file_type().is_symlink());
    assert_eq!(fs::read(outside).unwrap(), wav());
    let alias = scratch.0.join("alias");
    std::os::unix::fs::symlink(&scratch.0, &alias).unwrap();
    assert!(state.begin("a", &alias, &id(2)).is_err());
}
#[test]
fn failed_explicit_abort_has_a_receipt_for_safe_retry_and_never_accepts_publication() {
    let scratch = Scratch::new();
    let state = ConversionFiles::default();
    state.begin("a", &scratch.0, &id(1)).unwrap();
    let path = state.write("a", &id(1), &wav()).unwrap();
    state.protect("a", &id(1)).unwrap();
    let unknown = scratch.0.join(id(1)).join("unknown.wav");
    fs::write(&unknown, wav()).unwrap();
    assert!(state.finish("a", &id(1), false).is_err());
    assert!(Path::new(&path).exists());
    assert!(marked(&scratch.0.join(id(1)).join(ABORTED), &id(1)));
    assert!(state.0.lock().unwrap().active.is_empty());
    assert!(state.protect("a", &id(1)).is_err());
    assert!(state.write("a", &id(1), &wav()).is_err());
    // No window close needed: the failed abort already released its live lease.
    fs::remove_file(unknown).unwrap();
    collect(&state, &scratch.0);
    assert!(!scratch.0.join(id(1)).exists());
}
#[test]
fn collection_is_paged_and_unreceipted_or_malformed_directories_are_preserved() {
    let scratch = Scratch::new();
    for n in 1..=300 {
        fs::create_dir(scratch.0.join(id(n))).unwrap();
    }
    let unknown = scratch.0.join(id(1));
    fs::write(unknown.join(PENDING), b"wrong receipt").unwrap();
    let abandoned = ConversionFiles::default();
    abandoned.begin("a", &scratch.0, &id(999)).unwrap();
    abandoned.write("a", &id(999), &wav()).unwrap();
    drop(abandoned);
    let state = ConversionFiles::default();
    collect(&state, &scratch.0);
    assert!(state.0.lock().unwrap().scan.is_some());
    for _ in 0..3 {
        collect(&state, &scratch.0);
    }
    assert!(!scratch.0.join(id(999)).exists());
    assert!(unknown.exists());
    assert_eq!(fs::read_dir(&scratch.0).unwrap().count(), 300);
}
#[test]
fn write_limits_and_state_transitions_do_not_publish_partial_or_unretained_files() {
    let scratch = Scratch::new();
    let state = ConversionFiles::default();
    state.begin("a", &scratch.0, &id(1)).unwrap();
    assert!(state.finish("a", &id(1), true).is_err());
    assert!(state.protect("a", &id(1)).is_err());
    for _ in 0..8 {
        state.write("a", &id(1), &wav()).unwrap();
    }
    assert!(state.write("a", &id(1), &wav()).is_err());
    state.protect("a", &id(1)).unwrap();
    assert!(state.write("a", &id(1), &wav()).is_err());
    state.finish("a", &id(1), false).unwrap();
    assert!(!scratch.0.join(id(1)).exists());
    state.begin("a", &scratch.0, &id(2)).unwrap();
    state
        .0
        .lock()
        .unwrap()
        .active
        .get_mut(&id(2))
        .unwrap()
        .bytes = BUDGET;
    assert!(state.write("a", &id(2), &wav()).is_err());
    state.shutdown();
    assert!(!scratch.0.join(id(2)).exists());
}
