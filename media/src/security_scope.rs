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
    fn CFURLGetFileSystemRepresentation(
        url: Ref,
        resolve: u8,
        buffer: *mut u8,
        length: isize,
    ) -> u8;
    fn CFURLStartAccessingSecurityScopedResource(url: Ref) -> u8;
    fn CFURLStopAccessingSecurityScopedResource(url: Ref);
}
const MAX_FOLDERS: usize = 8;
const MAX_PREVIOUS_PATHS: usize = 16;
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    previous_paths: Vec<String>,
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
                || r.previous_paths.len() > MAX_PREVIOUS_PATHS
                || r.previous_paths
                    .iter()
                    .any(|path| !Path::new(path).is_absolute() || path.len() > 4096)
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
                let moved = update_location(&mut record, &access);
                if stale || moved {
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
fn remember_previous(record: &mut Record, path: String) {
    if path != record.path && !record.previous_paths.contains(&path) {
        record.previous_paths.push(path);
        if record.previous_paths.len() > MAX_PREVIOUS_PATHS {
            record.previous_paths.remove(0);
        }
    }
}
fn update_location(record: &mut Record, access: &Access) -> bool {
    let mut buffer = [0u8; 4097];
    if unsafe {
        CFURLGetFileSystemRepresentation(
            access.url.0,
            0,
            buffer.as_mut_ptr(),
            buffer.len() as isize,
        )
    } == 0
    {
        return false;
    }
    let Some(end) = buffer.iter().position(|byte| *byte == 0) else {
        return false;
    };
    let Ok(path) = std::str::from_utf8(&buffer[..end]) else {
        return false;
    };
    if !Path::new(path).is_absolute() || path == record.path {
        return false;
    }
    let previous = std::mem::replace(&mut record.path, path.into());
    record.previous_paths.retain(|previous| previous != path);
    if normalized(Path::new(&previous)) != normalized(Path::new(path)) {
        remember_previous(record, previous);
    }
    true
}

fn relocated_candidate(record: &Record, path: &Path) -> Option<std::path::PathBuf> {
    let path = normalized(path);
    let base = normalized(Path::new(&record.path));
    let mut candidates = std::collections::BTreeSet::new();
    for previous in &record.previous_paths {
        let previous = normalized(Path::new(previous));
        let candidate = if record.directory {
            let Ok(relative) = path.strip_prefix(&previous) else {
                continue;
            };
            base.join(relative)
        } else if path == previous {
            base.clone()
        } else {
            continue;
        };
        let Ok(candidate) = candidate.canonicalize() else {
            continue;
        };
        if candidate.is_file() && (!record.directory || candidate.starts_with(&base)) {
            candidates.insert(candidate);
        }
    }
    if candidates.len() == 1 {
        candidates.pop_first()
    } else {
        None
    }
}
fn relocated_from(path: &Path, grants: &[Grant]) -> Option<std::path::PathBuf> {
    // Never substitute an existing path or guess from filenames. More than one
    // bookmarked identity claiming an old path is ambiguous and needs relinking.
    if !path.is_absolute() || path.try_exists().unwrap_or(false) {
        return None;
    }
    let candidates = grants
        .iter()
        .filter(|g| g.access.is_some())
        .filter_map(|g| relocated_candidate(&g.record, path))
        .collect::<std::collections::BTreeSet<_>>();
    if candidates.len() == 1 {
        candidates.into_iter().next()
    } else {
        None
    }
}
/// Only return a unique, accessible identity restored from a selected resource.
pub fn relocated_resource(path: &Path) -> Result<Option<std::path::PathBuf>> {
    Ok(relocated_from(
        path,
        &resources().lock().map_err(|_| "File access unavailable")?,
    ))
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
        previous_paths: Vec::new(),
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
    // A moved folder can leave several missing components below a symlinked
    // ancestor such as /var -> /private/var. Normalize that ancestor too.
    for ancestor in clean.ancestors().skip(1) {
        if let Ok(base) = ancestor.canonicalize() {
            if let Ok(suffix) = clean.strip_prefix(ancestor) {
                return base.join(suffix);
            }
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
        let mut added = capture(path, !writable)?;
        let directory = added.record.directory;
        for old in current.iter().filter(|g| {
            normalized(Path::new(&g.record.path)) == normalized(Path::new(path))
                && g.record.directory == directory
        }) {
            for previous in &old.record.previous_paths {
                remember_previous(&mut added.record, previous.clone());
            }
        }
        additions.push(added);
        if additions.len() > MAX_RESOURCES {
            return Err("Too many individual files; select their media folder first".into());
        }
    }
    // A containing folder cannot replace an individual file's rename history.
    // Same-path re-selection carries that history into the new grant above.
    let keep = |g: &Grant| {
        let same_path = additions.iter().any(|a| {
            normalized(Path::new(&a.record.path)) == normalized(Path::new(&g.record.path))
        });
        (!g.record.previous_paths.is_empty() && !same_path)
            || !additions
                .iter()
                .any(|a| covers(&a.record, Path::new(&g.record.path), !g.record.read_only))
    };
    let mut records = current
        .iter()
        .filter(|g| keep(g))
        .map(|g| g.record.clone())
        .collect::<Vec<_>>();
    records.extend(additions.iter().map(|g| g.record.clone()));
    if records.len() > MAX_RESOURCES {
        return Err(
            "Saved file access limit reached; select a media folder to group its files".into(),
        );
    }
    save_records(file, &records)?;
    current.retain(keep);
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
    fn renamed_bookmarked_files_and_folders_restore_identity_and_history() {
        for directory in [false, true] {
            let root = tempfile::tempdir().unwrap();
            let before = root.path().join("before");
            let after = root.path().join("after");
            let later = root.path().join("later");
            if directory {
                std::fs::create_dir(&before).unwrap();
                std::fs::write(before.join("take.wav"), b"original audio").unwrap();
            } else {
                std::fs::write(&before, b"original audio").unwrap();
            }
            let file = root.path().join("bookmarks.json");
            let grant = capture(before.to_str().unwrap(), true).unwrap();
            save_records(&file, &[grant.record.clone()]).unwrap();
            drop(grant);
            let original = if directory {
                before.join("take.wav")
            } else {
                before.clone()
            };
            let current = if directory {
                after.join("take.wav")
            } else {
                after.clone()
            };
            std::fs::rename(&before, &after).unwrap();
            let store = Mutex::new(Vec::new());
            assert!(restore_into(&file, &store, MAX_RESOURCES)
                .unwrap()
                .is_empty());
            {
                let grants = store.lock().unwrap();
                assert_eq!(
                    relocated_from(&original, &grants),
                    Some(current.canonicalize().unwrap())
                );
                assert!(covers(&grants[0].record, &current, false));
                assert!(!covers(&grants[0].record, &current, true));
            }
            drop(store);
            std::fs::rename(&after, &later).unwrap();
            let store = Mutex::new(Vec::new());
            assert!(restore_into(&file, &store, MAX_RESOURCES)
                .unwrap()
                .is_empty());
            let latest = if directory {
                later.join("take.wav")
            } else {
                later.clone()
            };
            let grants = store.lock().unwrap();
            assert_eq!(
                relocated_from(&original, &grants),
                Some(latest.canonicalize().unwrap())
            );
            assert_eq!(
                relocated_from(&current, &grants),
                Some(latest.canonicalize().unwrap())
            );
            // An unrelated replacement at the old path must never be substituted.
            if directory {
                std::fs::create_dir(&before).unwrap();
            }
            std::fs::write(&original, b"replacement").unwrap();
            assert!(relocated_from(&original, &grants).is_none());
        }
    }
    #[test]
    fn ambiguous_and_inactive_bookmarks_do_not_choose_a_source() {
        let root = tempfile::tempdir().unwrap();
        let original = root.path().join("missing.wav");
        let first = root.path().join("first.wav");
        let second = root.path().join("second.wav");
        std::fs::write(&first, b"first").unwrap();
        std::fs::write(&second, b"second").unwrap();
        let mut grants = vec![
            capture(first.to_str().unwrap(), true).unwrap(),
            capture(second.to_str().unwrap(), true).unwrap(),
        ];
        for grant in &mut grants {
            remember_previous(&mut grant.record, original.to_string_lossy().into_owned());
        }
        assert!(relocated_from(&original, &grants).is_none());
        grants[1].access = None;
        assert_eq!(
            relocated_from(&original, &grants),
            Some(first.canonicalize().unwrap())
        );
        grants[0].access = None;
        assert!(relocated_from(&original, &grants).is_none());
    }
    #[test]
    fn folder_history_checks_every_alias_and_rejects_symlink_escape() {
        let root = tempfile::tempdir().unwrap();
        let current = root.path().join("current");
        std::fs::create_dir(&current).unwrap();
        std::fs::write(current.join("take.wav"), b"audio").unwrap();
        let mut record = Record {
            path: current.to_string_lossy().into_owned(),
            bookmark: vec![1],
            previous_paths: vec!["/different".into(), "/old-folder".into()],
            read_only: true,
            directory: true,
        };
        assert_eq!(
            relocated_candidate(&record, Path::new("/old-folder/take.wav")),
            Some(current.join("take.wav").canonicalize().unwrap())
        );
        assert!(relocated_candidate(&record, Path::new("/old-folder-sibling/take.wav")).is_none());
        let outside = root.path().join("outside.wav");
        std::fs::write(&outside, b"unselected").unwrap();
        std::os::unix::fs::symlink(&outside, current.join("escape.wav")).unwrap();
        assert!(relocated_candidate(&record, Path::new("/old-folder/escape.wav")).is_none());
        record.previous_paths = vec!["/old-file".into()];
        record.directory = false;
        record.path = outside.to_string_lossy().into_owned();
        assert!(relocated_candidate(&record, Path::new("/old-file/child")).is_none());
    }
    #[test]
    fn legacy_records_have_no_history_and_history_is_bounded() {
        let mut record: Record = serde_json::from_str(r#"{"path":"/new","bookmark":[1]}"#).unwrap();
        assert!(record.previous_paths.is_empty());
        for i in 0..20 {
            remember_previous(&mut record, format!("/old-{i}"));
        }
        assert_eq!(record.previous_paths.len(), MAX_PREVIOUS_PATHS);
        assert_eq!(record.previous_paths[0], "/old-4");
        assert!(validate_records(&[record.clone()], MAX_RESOURCES).is_ok());
        record.previous_paths.push("relative".into());
        assert!(validate_records(&[record], MAX_RESOURCES).is_err());
    }
    #[test]
    fn rejects_unbounded_or_relative_persisted_grants() {
        let valid = Record {
            path: "/tmp/plugins".into(),
            bookmark: vec![1],
            previous_paths: Vec::new(),
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
            previous_paths: Vec::new(),
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
