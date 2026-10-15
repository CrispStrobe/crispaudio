//! macOS user-selected files and plug-in folders. Bookmarks stay in the app container;
//! helpers receive fresh, implicit bookmarks, never the persistent app-scoped ones.
use crate::Result;
use serde::{Deserialize, Serialize};
use std::{
    ffi::c_void,
    path::Path,
    process::Command,
    ptr,
    sync::{Mutex, OnceLock},
};

type Ref = *const c_void;
#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRelease(value: Ref);
    fn CFURLCreateFromFileSystemRepresentation(
        allocator: Ref,
        bytes: *const u8,
        length: isize,
        directory: u8,
    ) -> Ref;
    fn CFURLCreateBookmarkData(
        allocator: Ref,
        url: Ref,
        options: usize,
        properties: Ref,
        relative: Ref,
        error: *mut Ref,
    ) -> Ref;
    fn CFDataCreate(allocator: Ref, bytes: *const u8, length: isize) -> Ref;
    fn CFDataGetLength(data: Ref) -> isize;
    fn CFDataGetBytePtr(data: Ref) -> *const u8;
    fn CFURLCreateByResolvingBookmarkData(
        allocator: Ref,
        data: Ref,
        options: usize,
        relative: Ref,
        properties: Ref,
        stale: *mut u8,
        error: *mut Ref,
    ) -> Ref;
    fn CFURLStartAccessingSecurityScopedResource(url: Ref) -> u8;
    fn CFURLStopAccessingSecurityScopedResource(url: Ref);
}
const MAX_FOLDERS: usize = 8;
const MAX_RESOURCES: usize = 256;
const MAX_STORE_BYTES: u64 = 72 * 1024 * 1024;
const MAX_BOOKMARK: usize = 65536;
struct Owned(Ref);
impl Drop for Owned {
    fn drop(&mut self) {
        unsafe { CFRelease(self.0) }
    }
}
struct Access {
    url: Owned,
    started: bool,
}
// CFURL is immutable and Core Foundation permits use across threads. The mutex
// below serializes our access and destruction; only balanced scope calls mutate it.
unsafe impl Send for Access {}
impl Drop for Access {
    fn drop(&mut self) {
        if self.started {
            unsafe { CFURLStopAccessingSecurityScopedResource(self.url.0) }
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
struct Record {
    path: String,
    bookmark: Vec<u8>,
    #[serde(default = "yes")]
    read_only: bool,
    #[serde(default = "yes")]
    directory: bool,
}
fn yes() -> bool {
    true
}
struct Grant {
    record: Record,
    access: Option<Access>,
}
static RESOURCES: OnceLock<Mutex<Vec<Grant>>> = OnceLock::new();
fn resources() -> &'static Mutex<Vec<Grant>> {
    RESOURCES.get_or_init(|| Mutex::new(Vec::new()))
}
static GRANTS: OnceLock<Mutex<Vec<Grant>>> = OnceLock::new();
fn grants() -> &'static Mutex<Vec<Grant>> {
    GRANTS.get_or_init(|| Mutex::new(Vec::new()))
}
fn owned(value: Ref, error: Ref, message: &str) -> Result<Owned> {
    if !error.is_null() {
        unsafe { CFRelease(error) };
    }
    if value.is_null() {
        Err(message.into())
    } else {
        Ok(Owned(value))
    }
}
fn bookmark(url: Ref, options: usize) -> Result<Vec<u8>> {
    let mut error = ptr::null();
    let data = unsafe {
        CFURLCreateBookmarkData(
            ptr::null(),
            url,
            options,
            ptr::null(),
            ptr::null(),
            &mut error,
        )
    };
    let data = owned(
        data,
        error,
        "Cannot remember this resource; select it again in the file picker",
    )?;
    let length = unsafe { CFDataGetLength(data.0) };
    if length <= 0 || length as usize > MAX_BOOKMARK {
        return Err("Folder bookmark is too large".into());
    }
    Ok(unsafe { std::slice::from_raw_parts(CFDataGetBytePtr(data.0), length as usize) }.to_vec())
}
fn resolve(bytes: &[u8]) -> Result<(Access, bool)> {
    if bytes.is_empty() || bytes.len() > MAX_BOOKMARK {
        return Err("Invalid folder bookmark".into());
    }
    let data = owned(
        unsafe { CFDataCreate(ptr::null(), bytes.as_ptr(), bytes.len() as isize) },
        ptr::null(),
        "Cannot load folder bookmark",
    )?;
    let mut stale = 0;
    let mut error = ptr::null();
    // No UI or volume mounting during startup. Re-select unavailable folders.
    let url = unsafe {
        CFURLCreateByResolvingBookmarkData(
            ptr::null(),
            data.0,
            (1 << 8) | (1 << 9) | (1 << 10),
            ptr::null(),
            ptr::null(),
            &mut stale,
            &mut error,
        )
    };
    let url = owned(url, error, "Saved resource is unavailable; select it again")?;
    let started = unsafe { CFURLStartAccessingSecurityScopedResource(url.0) } != 0;
    Ok((Access { url, started }, stale != 0))
}
fn validate_records(records: &[Record], limit: usize) -> Result<()> {
    if records.len() > limit
        || records.iter().any(|r| {
            !Path::new(&r.path).is_absolute()
                || r.path.len() > 4096
                || r.bookmark.is_empty()
                || r.bookmark.len() > MAX_BOOKMARK
        })
    {
        return Err("Invalid saved resources".into());
    }
    Ok(())
}
/// Restore before any helper can run. Individual unavailable volumes do not prevent startup.
pub fn restore(file: &Path) -> Result<Vec<String>> {
    restore_into(file, grants(), MAX_FOLDERS)
}
pub fn restore_resources(file: &Path) -> Result<Vec<String>> {
    restore_into(file, resources(), MAX_RESOURCES)
}
fn restore_into(file: &Path, store: &Mutex<Vec<Grant>>, limit: usize) -> Result<Vec<String>> {
    if !file.exists() {
        return Ok(Vec::new());
    }
    if std::fs::metadata(file).map_err(|e| e.to_string())?.len() > MAX_STORE_BYTES {
        return Err("Saved resources are too large".into());
    }
    let records: Vec<Record> =
        serde_json::from_slice(&std::fs::read(file).map_err(|e| e.to_string())?)
            .map_err(|_| "Invalid saved resources")?;
    validate_records(&records, limit)?;
    let mut restored = Vec::new();
    let mut warnings = Vec::new();
    for mut record in records {
        match resolve(&record.bookmark) {
            Ok((access, stale)) => {
                if stale {
                    if let Ok(data) = bookmark(access.url.0, scope_options(record.read_only)) {
                        record.bookmark = data;
                    }
                }
                restored.push(Grant {
                    record,
                    access: Some(access),
                });
            }
            Err(_) => {
                warnings.push(record.path.clone());
                restored.push(Grant {
                    record,
                    access: None,
                });
            }
        }
    }
    // Persist refreshed stale data, retaining offline-volume records as well.
    let records = restored
        .iter()
        .map(|g| g.record.clone())
        .collect::<Vec<_>>();
    *store.lock().map_err(|_| "File access unavailable")? = restored;
    save_records(file, &records)?;
    Ok(warnings)
}
fn scope_options(read_only: bool) -> usize {
    (1 << 11) | if read_only { 1 << 12 } else { 0 }
}
fn capture(path: &str, read_only: bool) -> Result<Grant> {
    use std::os::unix::ffi::OsStrExt;
    if path.len() > 4096 || !Path::new(path).is_absolute() {
        return Err("Select an absolute file or folder path".into());
    }
    let meta =
        std::fs::metadata(path).map_err(|_| "Selected resource is unavailable; select it again")?;
    if !meta.is_file() && !meta.is_dir() {
        return Err("Select a regular file or folder".into());
    }
    let bytes = Path::new(path).as_os_str().as_bytes();
    let url = owned(
        unsafe {
            CFURLCreateFromFileSystemRepresentation(
                ptr::null(),
                bytes.as_ptr(),
                bytes.len() as isize,
                u8::from(meta.is_dir()),
            )
        },
        ptr::null(),
        "Invalid resource path",
    )?;
    let record = Record {
        path: path.into(),
        bookmark: bookmark(url.0, scope_options(read_only))?,
        read_only,
        directory: meta.is_dir(),
    };
    let (access, _) = resolve(&record.bookmark)?;
    Ok(Grant {
        record,
        access: Some(access),
    })
}
fn save_records(file: &Path, records: &[Record]) -> Result<()> {
    use std::{io::Write, os::unix::fs::PermissionsExt};
    let parent = file.parent().ok_or("Invalid bookmark storage")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut staged = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    staged
        .as_file()
        .set_permissions(std::fs::Permissions::from_mode(0o600))
        .map_err(|e| e.to_string())?;
    staged
        .write_all(&serde_json::to_vec(records).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    staged.as_file().sync_all().map_err(|e| e.to_string())?;
    staged.persist(file).map_err(|e| e.to_string())?;
    Ok(())
}
/// Capture while the native picker/drop grant is active. No parent-folder escalation.
pub fn remember_folder(path: &str, file: &Path) -> Result<()> {
    if !Path::new(path).is_dir() {
        return Err("Select an existing plug-in folder".into());
    }
    let grant = capture(path, true)?;
    let mut current = grants().lock().map_err(|_| "Folder access unavailable")?;
    let mut records = current
        .iter()
        .filter(|g| g.record.path != path)
        .map(|g| g.record.clone())
        .collect::<Vec<_>>();
    records.push(grant.record.clone());
    if records.len() > MAX_FOLDERS {
        records.remove(0);
    }
    save_records(file, &records)?;
    current.retain(|g| g.record.path != path);
    current.push(grant);
    if current.len() > MAX_FOLDERS {
        current.remove(0);
    }
    Ok(())
}
fn normalized(path: &Path) -> std::path::PathBuf {
    if let Ok(path) = path.canonicalize() {
        return path;
    }
    // Output files may not exist yet; their staging directory normally does.
    if let (Some(parent), Some(name)) = (path.parent(), path.file_name()) {
        if let Ok(parent) = parent.canonicalize() {
            return parent.join(name);
        }
    }
    let mut clean = std::path::PathBuf::new();
    for part in path.components() {
        match part {
            std::path::Component::ParentDir => {
                clean.pop();
            }
            std::path::Component::CurDir => {}
            other => clean.push(other.as_os_str()),
        }
    }
    clean
}
fn covers(record: &Record, path: &Path, writable: bool) -> bool {
    let base = normalized(Path::new(&record.path));
    let path = normalized(path);
    (!writable || !record.read_only) && (base == path || record.directory && path.starts_with(base))
}
pub fn writable_folder(path: &Path) -> Result<bool> {
    Ok(resources()
        .lock()
        .map_err(|_| "File access unavailable")?
        .iter()
        .any(|g| g.access.is_some() && g.record.directory && covers(&g.record, path, true)))
}
pub fn remember_resources(paths: &[String], writable: bool, file: &Path) -> Result<()> {
    if paths.len() > 4096 {
        return Err("Too many selected files; choose their media folder instead".into());
    }
    let mut current = resources().lock().map_err(|_| "File access unavailable")?;
    let mut additions = Vec::<Grant>::new();
    for path in paths {
        if current
            .iter()
            .chain(additions.iter())
            .any(|g| g.access.is_some() && covers(&g.record, Path::new(path), writable))
        {
            continue;
        }
        additions.push(capture(path, !writable)?);
        if additions.len() > MAX_RESOURCES {
            return Err("Too many individual files; select their media folder first".into());
        }
    }
    let keep = |g: &&Grant| {
        !additions
            .iter()
            .any(|a| covers(&a.record, Path::new(&g.record.path), !g.record.read_only))
    };
    let mut records = current
        .iter()
        .filter(keep)
        .map(|g| g.record.clone())
        .collect::<Vec<_>>();
    records.extend(additions.iter().map(|g| g.record.clone()));
    if records.len() > MAX_RESOURCES {
        return Err(
            "Saved file access limit reached; select a media folder to group its files".into(),
        );
    }
    save_records(file, &records)?;
    current.retain(|g| {
        !additions
            .iter()
            .any(|a| covers(&a.record, Path::new(&g.record.path), !g.record.read_only))
    });
    current.extend(additions);
    Ok(())
}
fn request_paths(value: &serde_json::Value, paths: &mut Vec<std::path::PathBuf>) {
    match value {
        serde_json::Value::String(path) if Path::new(path).is_absolute() => paths.push(path.into()),
        serde_json::Value::Array(values) => {
            for value in values {
                request_paths(value, paths)
            }
        }
        serde_json::Value::Object(values) => {
            for value in values.values() {
                request_paths(value, paths)
            }
        }
        _ => {}
    }
}
/// The caller owns `directory` until the helper exits, including streaming helpers.
pub(crate) fn configure_helper(command: &mut Command, directory: &Path) -> Result<()> {
    // Never inherit an injected/stale transport from the parent environment.
    command.env_remove("CRISPAUDIO_RESOURCE_BOOKMARKS");
    let current = grants().lock().map_err(|_| "Folder access unavailable")?;

    // Plain bookmarks include an implicit scope for transfer to a child process.
    // App-scoped persistent bookmarks are bound to the parent app identity.
    let mut transfers = current
        .iter()
        .filter_map(|g| g.access.as_ref())
        .map(|access| bookmark(access.url.0, 0))
        .collect::<Result<Vec<_>>>()?;
    let mut paths = Vec::new();
    for arg in command.get_args() {
        let path = Path::new(arg);
        if path.is_absolute() {
            paths.push(path.to_path_buf());
        }
        if path.extension().is_some_and(|ext| ext == "json")
            && std::fs::metadata(path).is_ok_and(|m| m.len() <= 16_000_000)
        {
            if let Ok(bytes) = std::fs::read(path) {
                if let Ok(value) = serde_json::from_slice(&bytes) {
                    request_paths(&value, &mut paths);
                }
            }
        }
    }
    let files = resources().lock().map_err(|_| "File access unavailable")?;
    for grant in files
        .iter()
        .filter(|g| paths.iter().any(|p| covers(&g.record, p, false)))
    {
        if let Some(access) = &grant.access {
            transfers.push(bookmark(access.url.0, 0)?);
        }
    }
    if transfers.is_empty() {
        return Ok(());
    }
    let file = directory.join("resource-bookmarks.json");
    std::fs::write(
        &file,
        serde_json::to_vec(&transfers).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    command.env("CRISPAUDIO_RESOURCE_BOOKMARKS", file);
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unbounded_or_relative_persisted_grants() {
        let valid = Record {
            path: "/tmp/plugins".into(),
            bookmark: vec![1],
            read_only: true,
            directory: true,
        };
        assert!(validate_records(&[valid.clone()], 8).is_ok());
        assert!(validate_records(&vec![valid.clone(); 9], 8).is_err());
        assert!(validate_records(
            &[Record {
                path: "../plugins".into(),
                ..valid.clone()
            }],
            8
        )
        .is_err());
        assert!(validate_records(
            &[Record {
                bookmark: vec![0; MAX_BOOKMARK + 1],
                ..valid
            }],
            8
        )
        .is_err());
        assert!(resolve(&[]).is_err());
        assert!(resolve(b"not a bookmark").is_err());
    }
    #[test]
    fn files_do_not_authorize_siblings_or_children_and_read_grants_do_not_authorize_writes() {
        let mut record = Record {
            path: "/media/take.wav".into(),
            bookmark: vec![1],
            read_only: true,
            directory: false,
        };
        assert!(covers(&record, Path::new("/media/take.wav"), false));
        assert!(!covers(&record, Path::new("/media/other.wav"), false));
        assert!(!covers(&record, Path::new("/media/take.wav/child"), false));
        assert!(!covers(&record, Path::new("/media/take.wav"), true));
        record.path = "/media".into();
        record.directory = true;
        record.read_only = false;
        assert!(covers(&record, Path::new("/media/exports/mix.wav"), true));
        assert!(!covers(&record, Path::new("/media-other/mix.wav"), true));
    }
    #[test]
    fn helper_clears_inherited_transport_without_grants() {
        let folder = tempfile::tempdir().unwrap();
        let mut cmd = Command::new("true");
        cmd.env("CRISPAUDIO_RESOURCE_BOOKMARKS", "/untrusted");
        configure_helper(&mut cmd, folder.path()).unwrap();
        assert!(cmd
            .get_envs()
            .any(|(key, value)| key == "CRISPAUDIO_RESOURCE_BOOKMARKS" && value.is_none()));
    }
}
