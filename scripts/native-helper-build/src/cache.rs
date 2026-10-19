use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

pub(crate) const HELPERS: [&str; 2] = ["crispaudio-apple-media", "crispaudio-vst3-host"];
static NEXT: AtomicU64 = AtomicU64::new(0);
const MARKER: &str = "CrispAudio native helper cache v1\n";
pub(crate) const ARM: u32 = 0x0100000c;
pub(crate) const X86: u32 = 0x01000007;
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
pub(crate) fn unique(prefix: &str) -> String {
    format!(
        "{prefix}{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    )
}
pub(crate) fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
pub(crate) fn file_hash(path: &Path) -> io::Result<String> {
    let mut file = File::open(path)?;
    let mut hash = Sha256::new();
    let mut bytes = [0; 65536];
    loop {
        let n = file.read(&mut bytes)?;
        if n == 0 {
            break;
        }
        hash.update(&bytes[..n]);
    }
    Ok(hex(&hash.finalize()))
}
fn executable(path: &Path) -> io::Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_file() {
        return Err(invalid("Helper must be a regular file"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o111 == 0 {
            return Err(invalid("Helper is not executable"));
        }
    }
    Ok(())
}
fn artifact_hash(path: &Path, cpu: u32) -> io::Result<String> {
    executable(path)?;
    let mut header = [0; 32];
    File::open(path)?.read_exact(&mut header)?;
    if header[..4] != [0xcf, 0xfa, 0xed, 0xfe]
        || u32::from_le_bytes(header[4..8].try_into().unwrap()) != cpu
    {
        return Err(invalid(
            "Helper is not the requested 64-bit Mach-O architecture",
        ));
    }
    file_hash(path)
}
pub(crate) struct Directory(pub PathBuf);
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = remove_owned(&self.0);
    }
}
fn remove_owned(path: &Path) -> io::Result<()> {
    match fs::symlink_metadata(path) {
        Ok(m) if m.is_dir() => fs::remove_dir_all(path),
        Ok(_) => fs::remove_file(path),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e),
    }
}
fn real_directory(path: &Path) -> io::Result<()> {
    fs::create_dir_all(path)?;
    if !fs::symlink_metadata(path)?.is_dir() {
        return Err(invalid("Cache/output directory must not be a symlink"));
    }
    Ok(())
}
struct Lock(File);
impl Lock {
    fn acquire(root: &Path) -> io::Result<Self> {
        real_directory(root)?;
        let path = root.join("lock");
        if let Ok(m) = fs::symlink_metadata(&path) {
            if !m.is_file() {
                return Err(invalid("Invalid cache lock"));
            }
        }
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
            #[cfg(target_os = "macos")]
            options.custom_flags(0x100); // O_NOFOLLOW
            #[cfg(target_os = "linux")]
            options.custom_flags(0x20000);
        }
        let file = options.open(path)?;
        #[cfg(unix)]
        {
            use std::os::fd::AsRawFd;
            extern "C" {
                fn flock(fd: i32, operation: i32) -> i32;
            }
            if unsafe { flock(file.as_raw_fd(), 2) } != 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(Self(file))
        }
        #[cfg(not(unix))]
        {
            let _ = file;
            Err(io::Error::new(
                io::ErrorKind::Unsupported,
                "Native helper cache requires Unix file locks",
            ))
        }
    }
}
impl Drop for Lock {
    fn drop(&mut self) {
        #[cfg(unix)]
        {
            use std::os::fd::AsRawFd;
            extern "C" {
                fn flock(fd: i32, operation: i32) -> i32;
            }
            let _ = unsafe { flock(self.0.as_raw_fd(), 8) };
        }
    }
}
fn initialize(root: &Path) -> io::Result<()> {
    let marker = root.join("owner");
    if marker.exists() {
        if !fs::symlink_metadata(&marker)?.is_file()
            || fs::metadata(&marker)?.len() > 128
            || fs::read_to_string(marker)? != MARKER
        {
            return Err(invalid("Unrecognized helper cache"));
        }
    } else {
        for entry in fs::read_dir(root)? {
            if entry?.file_name() != "lock" {
                return Err(invalid("Refusing unmanaged cache contents"));
            }
        }
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(marker)?;
        file.write_all(MARKER.as_bytes())?;
        file.sync_all()?;
    }
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with(".stage-") || name.starts_with(".retired-") {
            remove_owned(&entry.path())?;
        }
    }
    Ok(())
}
fn manifest(directory: &Path, key: &str, cpu: u32) -> io::Result<[String; 2]> {
    if !fs::symlink_metadata(directory)?.is_dir() {
        return Err(invalid("Invalid cache entry"));
    }
    let path = directory.join("manifest");
    if !fs::symlink_metadata(&path)?.is_file() || fs::metadata(&path)?.len() > 1024 {
        return Err(invalid("Invalid cache manifest"));
    }
    let text = fs::read_to_string(path)?;
    let lines: Vec<_> = text.lines().collect();
    if lines.len() != 4 || lines[0] != "v1" || lines[1] != key {
        return Err(invalid("Cache key mismatch"));
    }
    let hashes = [
        artifact_hash(&directory.join(HELPERS[0]), cpu)?,
        artifact_hash(&directory.join(HELPERS[1]), cpu)?,
    ];
    if hashes[0] != lines[2] || hashes[1] != lines[3] {
        return Err(invalid("Cached helper checksum mismatch"));
    }
    Ok(hashes)
}
/// Only copies bytes: signing a staged file cannot mutate the verified cache.
/// Existing matching files keep their inode/mtime; replacements use a local rename.
pub fn stage_helper(source: &Path, destination: &Path) -> io::Result<()> {
    executable(source)?;
    let hash = file_hash(source)?;
    stage(source, destination, &hash)
}
fn stage(source: &Path, destination: &Path, hash: &str) -> io::Result<()> {
    if executable(destination).is_ok() && file_hash(destination)? == hash {
        return Ok(());
    }
    let parent = destination
        .parent()
        .ok_or_else(|| invalid("Missing staging parent"))?;
    real_directory(parent)?;
    // The directory owns the temporary only until it is renamed into place.
    let staging = Directory(parent.join(unique(".helper-stage-")));
    fs::create_dir(&staging.0)?;
    let temporary_inside = staging.0.join("helper");
    fs::copy(source, &temporary_inside)?;
    if file_hash(&temporary_inside)? != hash {
        return Err(invalid("Helper changed during staging"));
    }
    File::open(&temporary_inside)?.sync_all()?;
    // Rename directly from a private subdirectory on the same filesystem.
    fs::rename(temporary_inside, destination)?;
    Ok(())
}
/// One verified current generation, shared by the embedded and sidecar recipes.
/// Callers hold the process lock through verification, build, publication and copy.
pub(crate) fn materialize(
    root: &Path,
    key: &str,
    cpu: u32,
    out: &Path,
    build: impl FnOnce(&Path) -> io::Result<()>,
) -> io::Result<bool> {
    let _lock = Lock::acquire(root)?;
    initialize(root)?;
    let current = root.join("current");
    if let Ok(hashes) = manifest(&current, key, cpu) {
        for (name, hash) in HELPERS.iter().zip(hashes) {
            stage(&current.join(name), &out.join(name), &hash)?;
        }
        return Ok(true);
    }
    let staged = Directory(root.join(unique(".stage-")));
    fs::create_dir(&staged.0)?;
    build(&staged.0)?;
    let hashes = [
        artifact_hash(&staged.0.join(HELPERS[0]), cpu)?,
        artifact_hash(&staged.0.join(HELPERS[1]), cpu)?,
    ];
    let mut file = File::create(staged.0.join("manifest"))?;
    write!(file, "v1\n{key}\n{}\n{}\n", hashes[0], hashes[1])?;
    file.sync_all()?;
    let retired = Directory(root.join(unique(".retired-")));
    if fs::symlink_metadata(&current).is_ok() {
        fs::rename(&current, &retired.0)?;
    }
    if let Err(error) = fs::rename(&staged.0, &current) {
        if retired.0.exists() {
            let _ = fs::rename(&retired.0, &current);
        }
        return Err(error);
    }
    for (name, hash) in HELPERS.iter().zip(hashes) {
        stage(&current.join(name), &out.join(name), &hash)?;
    }
    Ok(false)
}

#[cfg(all(test, unix))]
mod tests;
