use super::*;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};

fn fixture() -> Directory {
    let directory = Directory(std::env::temp_dir().join(unique("crispaudio-helper-test-")));
    fs::create_dir(&directory.0).unwrap();
    directory
}
fn helper(path: &Path, cpu: u32, payload: &[u8]) {
    let mut bytes = vec![0; 32];
    bytes[..4].copy_from_slice(&[0xcf, 0xfa, 0xed, 0xfe]);
    bytes[4..8].copy_from_slice(&cpu.to_le_bytes());
    bytes.extend_from_slice(payload);
    fs::write(path, bytes).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
    }
}
fn outputs(path: &Path, payload: &[u8]) -> io::Result<()> {
    for name in HELPERS {
        helper(&path.join(name), ARM, payload);
    }
    Ok(())
}
#[test]
fn warm_hit_keeps_staged_inode_and_signature_changes_cannot_mutate_cache() {
    let temp = fixture();
    let root = temp.0.join("cache");
    let out = temp.0.join("out");
    assert!(!materialize(&root, "key", ARM, &out, |p| outputs(p, b"original")).unwrap());
    let destination = out.join(HELPERS[0]);
    let before = fs::metadata(&destination).unwrap();
    assert!(materialize(&root, "key", ARM, &out, |_| panic!("Warm cache recompiled")).unwrap());
    assert_eq!(
        before.modified().unwrap(),
        fs::metadata(&destination).unwrap().modified().unwrap()
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        assert_eq!(before.ino(), fs::metadata(&destination).unwrap().ino());
        assert_ne!(
            before.ino(),
            fs::metadata(root.join("current").join(HELPERS[0]))
                .unwrap()
                .ino()
        );
    }
    fs::write(&destination, b"signed or damaged copy").unwrap();
    assert!(materialize(&root, "key", ARM, &out, |_| panic!("Staging mutated cache")).unwrap());
    assert_eq!(
        file_hash(&destination).unwrap(),
        file_hash(&root.join("current").join(HELPERS[0])).unwrap()
    );
    stage_helper(&destination, &out.join("alias")).unwrap();
    assert_eq!(
        fs::read(destination).unwrap(),
        fs::read(out.join("alias")).unwrap()
    );
}
#[test]
fn missing_corrupt_non_executable_wrong_arch_and_bad_manifest_rebuild() {
    let temp = fixture();
    let root = temp.0.join("cache");
    let out = temp.0.join("out");
    for damage in 0..5 {
        materialize(&root, "key", ARM, &out, |p| outputs(p, b"healthy")).unwrap();
        let path = root.join("current").join(HELPERS[0]);
        match damage {
            0 => fs::remove_file(&path).unwrap(),
            1 => {
                let mut file = OpenOptions::new().append(true).open(&path).unwrap();
                file.write_all(b"tampered").unwrap();
            }
            2 => {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
                }
                #[cfg(not(unix))]
                fs::remove_file(&path).unwrap();
            }
            3 => helper(&path, X86, b"wrong arch"),
            _ => fs::write(root.join("current/manifest"), b"invalid").unwrap(),
        }
        assert!(!materialize(&root, "key", ARM, &out, |p| outputs(p, b"repaired")).unwrap());
    }
}
#[test]
fn failed_build_preserves_previous_generation_and_outputs() {
    let temp = fixture();
    let root = temp.0.join("cache");
    let out = temp.0.join("out");
    materialize(&root, "old", ARM, &out, |p| outputs(p, b"old")).unwrap();
    let before = fs::read(out.join(HELPERS[0])).unwrap();
    assert!(materialize(&root, "new", ARM, &out, |p| {
        helper(&p.join(HELPERS[0]), ARM, b"partial");
        Err(invalid("compiler failed or inputs changed"))
    })
    .is_err());
    assert_eq!(before, fs::read(out.join(HELPERS[0])).unwrap());
    assert!(materialize(&root, "old", ARM, &out, |_| panic!("Previous entry lost")).unwrap());
    assert_eq!(fs::read_dir(&root).unwrap().count(), 3);
}
#[test]
fn cache_is_bounded_and_recovers_abandoned_publications() {
    let temp = fixture();
    let root = temp.0.join("cache");
    let out = temp.0.join("out");
    for key in ["a", "b", "c"] {
        assert!(!materialize(&root, key, ARM, &out, |p| outputs(p, key.as_bytes())).unwrap());
    }
    assert_eq!(fs::read_dir(&root).unwrap().count(), 3);
    for name in [".stage-abandoned", ".retired-abandoned"] {
        fs::create_dir(root.join(name)).unwrap();
        fs::write(root.join(name).join("partial"), b"partial").unwrap();
    }
    assert!(materialize(&root, "c", ARM, &out, |_| panic!("Valid entry rebuilt")).unwrap());
    assert_eq!(fs::read_dir(&root).unwrap().count(), 3);
    fs::rename(root.join("current"), root.join(".retired-interrupted")).unwrap();
    assert!(!materialize(&root, "c", ARM, &out, |p| outputs(p, b"recovered")).unwrap());
}
#[test]
fn unmanaged_cache_is_refused_without_deleting_contents() {
    let temp = fixture();
    let root = temp.0.join("cache");
    fs::create_dir(&root).unwrap();
    fs::write(root.join("personal"), b"keep").unwrap();
    assert!(
        materialize(&root, "key", ARM, &temp.0.join("out"), |_| panic!(
            "Unmanaged cache compiled"
        ))
        .is_err()
    );
    assert_eq!(fs::read(root.join("personal")).unwrap(), b"keep");
}
#[cfg(unix)]
#[test]
fn symlinked_cache_artifact_is_replaced_without_touching_target() {
    let temp = fixture();
    let root = temp.0.join("cache");
    let out = temp.0.join("out");
    materialize(&root, "key", ARM, &out, |p| outputs(p, b"good")).unwrap();
    let original = temp.0.join("outside");
    fs::write(&original, b"keep").unwrap();
    let cached = root.join("current").join(HELPERS[0]);
    fs::remove_file(&cached).unwrap();
    std::os::unix::fs::symlink(&original, cached).unwrap();
    assert!(!materialize(&root, "key", ARM, &out, |p| outputs(p, b"new")).unwrap());
    assert_eq!(fs::read(original).unwrap(), b"keep");
}
#[test]
fn concurrent_builders_publish_once() {
    let temp = fixture();
    let builds = Arc::new(AtomicUsize::new(0));
    let threads: Vec<_> = (0..4)
        .map(|i| {
            let root = temp.0.join("cache");
            let out = temp.0.join(format!("out-{i}"));
            let builds = builds.clone();
            std::thread::spawn(move || {
                materialize(&root, "key", ARM, &out, |p| {
                    builds.fetch_add(1, Ordering::SeqCst);
                    outputs(p, b"concurrent")
                })
                .unwrap()
            })
        })
        .collect();
    let hits = threads
        .into_iter()
        .filter_map(|t| t.join().unwrap().then_some(()))
        .count();
    assert_eq!(hits, 3);
    assert_eq!(builds.load(Ordering::SeqCst), 1);
}
#[test]
fn wrong_compiler_output_never_publishes() {
    let temp = fixture();
    let root = temp.0.join("cache");
    assert!(materialize(&root, "key", ARM, &temp.0.join("out"), |p| {
        for name in HELPERS {
            helper(&p.join(name), X86, b"bad");
        }
        Ok(())
    })
    .is_err());
    assert!(!root.join("current").exists());
    assert!(!temp.0.join("out").exists());
}

// Launched as a separate test process by the cases below; inert in an ordinary run.
#[test]
fn process_worker() {
    let Some(path) = std::env::var_os("CRISPAUDIO_CACHE_TEST_ROOT") else {
        return;
    };
    let root = PathBuf::from(path);
    if std::env::var_os("CRISPAUDIO_CACHE_TEST_HOLD").is_some() {
        let _lock = Lock::acquire(&root).unwrap();
        initialize(&root).unwrap();
        fs::write(root.join("locked"), b"ready").unwrap();
        loop {
            std::thread::park();
        }
    }
    materialize(
        &root,
        "process",
        ARM,
        &root.parent().unwrap().join(unique("out-")),
        |p| {
            let mut count = OpenOptions::new()
                .create(true)
                .append(true)
                .open(root.join("build-count"))?;
            count.write_all(b"build\n")?;
            outputs(p, b"process")
        },
    )
    .unwrap();
}
#[test]
fn separate_processes_share_one_build() {
    let temp = fixture();
    let root = temp.0.join("cache");
    let mut children: Vec<_> = (0..3)
        .map(|_| {
            std::process::Command::new(std::env::current_exe().unwrap())
                .args(["--exact", "cache::tests::process_worker"])
                .env("CRISPAUDIO_CACHE_TEST_ROOT", &root)
                .stdout(std::process::Stdio::null())
                .spawn()
                .unwrap()
        })
        .collect();
    for child in &mut children {
        assert!(child.wait().unwrap().success());
    }
    assert_eq!(
        fs::read_to_string(root.join("build-count")).unwrap(),
        "build\n"
    );
}
#[test]
fn killed_process_releases_lock_for_next_build() {
    let temp = fixture();
    let root = temp.0.join("cache");
    let mut child = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "cache::tests::process_worker"])
        .env("CRISPAUDIO_CACHE_TEST_ROOT", &root)
        .env("CRISPAUDIO_CACHE_TEST_HOLD", "1")
        .stdout(std::process::Stdio::null())
        .spawn()
        .unwrap();
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    while !root.join("locked").exists() && std::time::Instant::now() < deadline {
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    let ready = root.join("locked").exists();
    child.kill().unwrap();
    child.wait().unwrap();
    assert!(ready, "Child never obtained lock");
    fs::remove_file(root.join("locked")).unwrap();
    assert!(
        !materialize(&root, "key", ARM, &temp.0.join("out"), |p| outputs(
            p,
            b"unlocked"
        ))
        .unwrap()
    );
}
