//! macOS user-selected plug-in folders. Bookmarks stay in the app container;
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
}
struct Grant {
    record: Record,
    access: Option<Access>,
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
        "Cannot remember this folder; select it again in the folder picker",
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
    let url = owned(
        url,
        error,
        "Saved plug-in folder is unavailable; select it again",
    )?;
    let started = unsafe { CFURLStartAccessingSecurityScopedResource(url.0) } != 0;
    Ok((Access { url, started }, stale != 0))
}
fn validate_records(records: &[Record]) -> Result<()> {
    if records.len() > MAX_FOLDERS
        || records.iter().any(|r| {
            !Path::new(&r.path).is_absolute()
                || r.path.len() > 4096
                || r.bookmark.is_empty()
                || r.bookmark.len() > MAX_BOOKMARK
        })
    {
        return Err("Invalid saved plug-in folders".into());
    }
    Ok(())
}
/// Restore before any helper can run. Individual unavailable volumes do not prevent startup.
pub fn restore(file: &Path) -> Result<Vec<String>> {
    if !file.exists() {
        return Ok(Vec::new());
    }
    if std::fs::metadata(file).map_err(|e| e.to_string())?.len() > 3_000_000 {
        return Err("Saved plug-in folders are too large".into());
    }
    let records: Vec<Record> =
        serde_json::from_slice(&std::fs::read(file).map_err(|e| e.to_string())?)
            .map_err(|_| "Invalid saved plug-in folders")?;
    validate_records(&records)?;
    let mut restored = Vec::new();
    let mut warnings = Vec::new();
    for mut record in records {
        match resolve(&record.bookmark) {
            Ok((access, stale)) => {
                if stale {
                    if let Ok(data) = bookmark(access.url.0, (1 << 11) | (1 << 12)) {
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
    *grants().lock().map_err(|_| "Folder access unavailable")? = restored;
    Ok(warnings)
}
/// Call immediately after NSOpenPanel selection, while its dynamic grant is active.
pub fn remember_folder(path: &str, file: &Path) -> Result<()> {
    if path.len() > 4096 || !Path::new(path).is_absolute() || !Path::new(path).is_dir() {
        return Err("Select an existing plug-in folder".into());
    }
    use std::os::unix::{ffi::OsStrExt, fs::PermissionsExt};
    let bytes = Path::new(path).as_os_str().as_bytes();
    let url = owned(
        unsafe {
            CFURLCreateFromFileSystemRepresentation(
                ptr::null(),
                bytes.as_ptr(),
                bytes.len() as isize,
                1,
            )
        },
        ptr::null(),
        "Invalid folder path",
    )?;
    // Read-only scope: plug-in code and assets are read, never modified by the host.
    let record = Record {
        path: path.into(),
        bookmark: bookmark(url.0, (1 << 11) | (1 << 12))?,
    };
    let (access, _) = resolve(&record.bookmark)?;
    let mut current = grants().lock().map_err(|_| "Folder access unavailable")?;
    let mut records: Vec<Record> = current
        .iter()
        .filter(|g| g.record.path != path)
        .map(|g| g.record.clone())
        .collect();
    records.push(record.clone());
    if records.len() > MAX_FOLDERS {
        records.remove(0);
    }
    let parent = file.parent().ok_or("Invalid bookmark storage")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut staged = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    staged
        .as_file()
        .set_permissions(std::fs::Permissions::from_mode(0o600))
        .map_err(|e| e.to_string())?;
    use std::io::Write;
    staged
        .write_all(&serde_json::to_vec(&records).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    staged.as_file().sync_all().map_err(|e| e.to_string())?;
    staged.persist(file).map_err(|e| e.to_string())?;
    current.retain(|g| g.record.path != path);
    current.push(Grant {
        record,
        access: Some(access),
    });
    if current.len() > MAX_FOLDERS {
        current.remove(0);
    }
    Ok(())
}
/// The caller owns `directory` until the helper exits, including streaming helpers.
pub(crate) fn configure_helper(command: &mut Command, directory: &Path) -> Result<()> {
    // Never inherit an injected/stale transport from the parent environment.
    command.env_remove("CRISPAUDIO_RESOURCE_BOOKMARKS");
    let current = grants().lock().map_err(|_| "Folder access unavailable")?;
    if current.is_empty() {
        return Ok(());
    }
    // Plain bookmarks include an implicit scope for transfer to a child process.
    // App-scoped persistent bookmarks are bound to the parent app identity.
    let transfers = current
        .iter()
        .filter_map(|g| g.access.as_ref())
        .map(|access| bookmark(access.url.0, 0))
        .collect::<Result<Vec<_>>>()?;
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
        };
        assert!(validate_records(&[valid.clone()]).is_ok());
        assert!(validate_records(&vec![valid.clone(); 9]).is_err());
        assert!(validate_records(&[Record {
            path: "../plugins".into(),
            ..valid.clone()
        }])
        .is_err());
        assert!(validate_records(&[Record {
            bookmark: vec![0; MAX_BOOKMARK + 1],
            ..valid
        }])
        .is_err());
        assert!(resolve(&[]).is_err());
        assert!(resolve(b"not a bookmark").is_err());
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
