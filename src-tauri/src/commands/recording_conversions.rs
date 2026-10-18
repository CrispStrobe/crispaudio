//! Owned derived files for native recovery imports. Originals never enter here.
//! Pending/explicitly aborted transactions may be collected; retained files may
//! be referenced by unsaved projects or Undo and are never inferred to be unused.
use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions, ReadDir},
    io::Write,
    os::fd::AsRawFd,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{
    ipc::{InvokeBody, Request},
    Manager,
};
type Result<T> = std::result::Result<T, String>;
const PENDING: &str = "pending.receipt";
const RETAINED: &str = "retained.receipt";
const ABORTED: &str = "aborted.receipt";
const LEASE: &str = "lease.lock";
const BUDGET: usize = 256 * 1024 * 1024;
extern "C" {
    fn flock(fd: i32, operation: i32) -> i32;
}
fn io<T>(value: std::io::Result<T>) -> Result<T> {
    value.map_err(|e| e.to_string())
}
fn valid(token: &str) -> bool {
    token.len() == 36
        && token.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        })
}
fn receipt(token: &str) -> Vec<u8> {
    format!("CRSP-RECOVERY-CONVERSIONS-1\n{token}\n").into_bytes()
}
fn regular(path: &Path) -> bool {
    path.symlink_metadata().is_ok_and(|m| m.is_file())
}
fn marked(path: &Path, token: &str) -> bool {
    regular(path)
        && path
            .metadata()
            .is_ok_and(|m| m.len() == receipt(token).len() as u64)
        && fs::read(path).is_ok_and(|b| b == receipt(token))
}
fn mark(directory: &Path, name: &str, token: &str) -> Result<()> {
    let path = directory.join(name);
    if marked(&path, token) {
        return Ok(());
    }
    let mut file = io(OpenOptions::new().write(true).create_new(true).open(path))?;
    io(file.write_all(&receipt(token)))?;
    io(file.sync_all())?;
    io(File::open(directory).and_then(|f| f.sync_all()))
}
fn lock(path: &Path, create: bool) -> Result<Option<File>> {
    if !create && !regular(path) {
        return Err("Invalid conversion lease".into());
    }
    let file = io(OpenOptions::new()
        .read(true)
        .write(true)
        .create_new(create)
        .open(path))?;
    // LOCK_EX | LOCK_NB. Separate processes/windows cannot collect an active writer.
    if unsafe { flock(file.as_raw_fd(), 2 | 4) } == 0 {
        Ok(Some(file))
    } else {
        let error = std::io::Error::last_os_error();
        if error.kind() == std::io::ErrorKind::WouldBlock {
            Ok(None)
        } else {
            Err(error.to_string())
        }
    }
}
fn source_name(name: &str) -> bool {
    (0..8).any(|i| name == format!("source-{i}.wav"))
}
fn remove_owned(directory: &Path, token: &str, explicit: bool) -> Result<()> {
    if !directory.symlink_metadata().is_ok_and(|m| m.is_dir())
        || !marked(&directory.join(PENDING), token)
    {
        return Err("Unowned conversion directory".into());
    }
    if !explicit
        && directory.join(RETAINED).symlink_metadata().is_ok()
        && !marked(&directory.join(ABORTED), token)
    {
        return Err("Retained conversions are protected".into());
    }
    let entries = io(fs::read_dir(directory))?
        .take(13)
        .collect::<std::io::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    if entries.len() > 12
        || entries.iter().any(|e| {
            !regular(&e.path())
                || !e.file_name().to_str().is_some_and(|name| {
                    source_name(name) || [PENDING, RETAINED, ABORTED, LEASE].contains(&name)
                })
        })
    {
        return Err("Unexpected conversion contents; retained".into());
    }
    // Validate the whole directory first; delete known leaves only, never recurse.
    for entry in &entries {
        if source_name(&entry.file_name().to_string_lossy()) {
            io(fs::remove_file(entry.path()))?;
        }
    }
    for name in [RETAINED, ABORTED, PENDING, LEASE] {
        let path = directory.join(name);
        if path.symlink_metadata().is_ok() {
            io(fs::remove_file(path))?;
        }
    }
    io(fs::remove_dir(directory))
}
struct Transaction {
    owner: String,
    token: String,
    directory: PathBuf,
    _lease: File,
    protected: bool,
    aborted: bool,
    files: usize,
    bytes: usize,
}
#[derive(Default)]
struct Inner {
    active: HashMap<String, Transaction>,
    scan: Option<(PathBuf, ReadDir)>,
}
#[derive(Default)]
pub struct ConversionFiles(Mutex<Inner>);
impl Inner {
    fn collect(&mut self, root: &Path) -> Result<()> {
        if !root.symlink_metadata().is_ok_and(|m| m.is_dir()) {
            return Err("Invalid conversion root".into());
        }
        if self.scan.as_ref().is_none_or(|(path, _)| path != root) {
            self.scan = Some((root.to_owned(), io(fs::read_dir(root))?));
        }
        let entries = self
            .scan
            .as_mut()
            .unwrap()
            .1
            .by_ref()
            .take(256)
            .collect::<Vec<_>>();
        if entries.len() < 256 {
            self.scan = None;
        }
        for entry in entries.into_iter().flatten() {
            let Some(token) = entry
                .file_name()
                .to_str()
                .map(str::to_owned)
                .filter(|id| valid(id))
            else {
                continue;
            };
            let path = entry.path();
            if !path.symlink_metadata().is_ok_and(|m| m.is_dir())
                || !marked(&path.join(PENDING), &token)
            {
                continue;
            }
            if path.join(RETAINED).symlink_metadata().is_ok()
                && !marked(&path.join(ABORTED), &token)
            {
                continue;
            }
            if let Ok(Some(_lease)) = lock(&path.join(LEASE), false) {
                let _ = remove_owned(&path, &token, false);
            }
        }
        Ok(())
    }
    fn transaction(&mut self, owner: &str, token: &str) -> Result<&mut Transaction> {
        self.active
            .get_mut(token)
            .filter(|t| t.owner == owner)
            .ok_or("Unknown conversion transaction".into())
    }
}
impl ConversionFiles {
    fn begin(&self, owner: &str, root: &Path, token: &str) -> Result<()> {
        if !valid(token) {
            return Err("Invalid conversion token".into());
        }
        let mut inner = self.0.lock().unwrap();
        if inner.active.len() >= 8 || inner.active.contains_key(token) {
            return Err("Conversion transaction already active or budget exhausted".into());
        }
        io(fs::create_dir_all(root))?;
        inner.collect(root)?;
        let directory = root.join(token);
        io(fs::create_dir(&directory))?;
        let lease = lock(&directory.join(LEASE), true)?.ok_or("Conversion lease unavailable")?;
        mark(&directory, PENDING, token)?;
        // Retained publication must survive a crash, including the new directory
        // entries, not just WAV/receipt contents.
        io(File::open(root).and_then(|file| file.sync_all()))?;
        if let Some(parent) = root.parent() {
            io(File::open(parent).and_then(|file| file.sync_all()))?;
        }
        inner.active.insert(
            token.into(),
            Transaction {
                owner: owner.into(),
                token: token.into(),
                directory,
                _lease: lease,
                protected: false,
                aborted: false,
                files: 0,
                bytes: 0,
            },
        );
        Ok(())
    }
    fn write(&self, owner: &str, token: &str, bytes: &[u8]) -> Result<String> {
        let mut inner = self.0.lock().unwrap();
        let t = inner.transaction(owner, token)?;
        if t.protected || t.aborted || t.files >= 8 || bytes.len() > BUDGET.saturating_sub(t.bytes)
        {
            return Err("Conversion transaction is closed or exceeds its budget".into());
        }
        super::native_files::validate_recording(bytes)?;
        let path = t.directory.join(format!("source-{}.wav", t.files));
        let mut file = io(OpenOptions::new().write(true).create_new(true).open(&path))?;
        if let Err(error) = file.write_all(bytes).and_then(|_| file.sync_all()) {
            let _ = fs::remove_file(path);
            return Err(error.to_string());
        }
        t.files += 1;
        t.bytes += bytes.len();
        Ok(path.to_string_lossy().into_owned())
    }
    fn protect(&self, owner: &str, token: &str) -> Result<()> {
        let mut inner = self.0.lock().unwrap();
        let t = inner.transaction(owner, token)?;
        if t.aborted || t.files == 0 {
            return Err("No prepared conversion files".into());
        }
        // Conservatively retain on uncertain I/O acknowledgement. Explicit abort
        // remains available until the frontend starts publication.
        t.protected = true;
        mark(&t.directory, RETAINED, &t.token)
    }
    fn finish(&self, owner: &str, token: &str, keep: bool) -> Result<()> {
        let mut inner = self.0.lock().unwrap();
        if !inner.active.contains_key(token) {
            return Ok(());
        }
        let t = inner.transaction(owner, token)?;
        if keep {
            if !t.protected || t.aborted {
                return Err("Conversion files are not retained".into());
            }
        } else {
            t.aborted = true;
            mark(&t.directory, ABORTED, &t.token)?;
        }
        // Once abort intent is durable, release the registry lease even if leaf
        // deletion fails. A later import can retry collection without waiting
        // for this window to close. This token can no longer stage/protect files.
        let transaction = inner.active.remove(token).unwrap();
        if keep {
            Ok(())
        } else {
            remove_owned(&transaction.directory, &transaction.token, true)
        }
    }
    pub fn close_owner(&self, owner: &str) {
        let mut inner = self.0.lock().unwrap();
        let ids = inner
            .active
            .iter()
            .filter(|(_, t)| t.owner == owner)
            .map(|(id, _)| id.clone())
            .collect::<Vec<_>>();
        for id in ids {
            let t = inner.active.remove(&id).unwrap();
            if !t.protected || t.aborted {
                let _ = remove_owned(&t.directory, &t.token, false);
            }
        }
    }
    pub fn shutdown(&self) {
        let owners = self
            .0
            .lock()
            .unwrap()
            .active
            .values()
            .map(|t| t.owner.clone())
            .collect::<Vec<_>>();
        for owner in owners {
            self.close_owner(&owner);
        }
    }
}
fn root(window: &tauri::WebviewWindow) -> Result<PathBuf> {
    if window
        .app_handle()
        .get_webview_window(window.label())
        .is_none()
    {
        return Err("Recording window closed".into());
    }
    Ok(window
        .app_handle()
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("native-recording-conversions-v1"))
}
#[tauri::command]
pub async fn recording_conversion_begin(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ConversionFiles>,
    token: String,
) -> Result<()> {
    let root = root(&window)?;
    let app = window.app_handle().clone();
    let owner = window.label().to_owned();
    let task_owner = owner.clone();
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<ConversionFiles>()
            .begin(&task_owner, &root, &token)
    })
    .await
    .map_err(|e| e.to_string())??;
    if window
        .app_handle()
        .get_webview_window(window.label())
        .is_none()
    {
        state.close_owner(&owner);
        return Err("Recording window closed".into());
    }
    Ok(())
}
#[tauri::command]
pub async fn recording_conversion_write(
    window: tauri::WebviewWindow,
    request: Request<'_>,
) -> Result<String> {
    root(&window)?;
    let token = request
        .headers()
        .get("x-conversion-token")
        .and_then(|s| s.to_str().ok())
        .ok_or("Missing conversion token")?
        .to_owned();
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected WAV bytes".into());
    };
    if bytes.len() > BUDGET {
        return Err("Conversion exceeds its budget".into());
    }
    let bytes = bytes.clone();
    let app = window.app_handle().clone();
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<ConversionFiles>().write(&owner, &token, &bytes)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn recording_conversion_protect(
    window: tauri::WebviewWindow,
    token: String,
) -> Result<()> {
    root(&window)?;
    let app = window.app_handle().clone();
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<ConversionFiles>().protect(&owner, &token)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn recording_conversion_finish(
    window: tauri::WebviewWindow,
    token: String,
    keep: bool,
) -> Result<()> {
    let app = window.app_handle().clone();
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<ConversionFiles>().finish(&owner, &token, keep)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests;
