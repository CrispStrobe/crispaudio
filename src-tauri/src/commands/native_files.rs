//! Files crossing the app boundary.
//!
//! * Opening: another app (Files, Mail, AirDrop, Finder) hands us audio or a
//!   project via "Open in CrispAudio". The OS reports it as a `RunEvent::Opened`
//!   before the webview may be listening, so paths are queued here and the
//!   frontend drains them with `take_opened_files`. Only paths that arrived
//!   this way can be read back through `read_opened_file`.
//! * Sharing: the frontend streams exported bytes to `stage_share_file`, which
//!   writes them into the app's temp directory for the native share sheet.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Emitter, State};

pub const OPENED_FILES_EVENT: &str = "opened-files";

#[derive(Default)]
pub struct OpenedFiles {
    /// Opened but not yet picked up by the frontend.
    pending: Mutex<Vec<PathBuf>>,
    /// Opened and still readable via `read_opened_file`.
    readable: Mutex<Vec<PathBuf>>,
}

impl OpenedFiles {
    pub fn record(&self, paths: &[PathBuf]) {
        self.pending.lock().unwrap().extend(paths.iter().cloned());
        self.readable.lock().unwrap().extend(paths.iter().cloned());
    }

    fn take_pending(&self) -> Vec<PathBuf> {
        std::mem::take(&mut *self.pending.lock().unwrap())
    }

    /// Consumes read access to `path`; false if it was never opened.
    fn claim(&self, path: &Path) -> bool {
        let mut readable = self.readable.lock().unwrap();
        match readable.iter().position(|p| p == path) {
            Some(i) => {
                readable.remove(i);
                true
            }
            None => false,
        }
    }
}

/// Queue opened files and tell a frontend that is already running.
pub fn handle_opened(app: &AppHandle, state: &OpenedFiles, paths: Vec<PathBuf>) {
    if paths.is_empty() {
        return;
    }
    state.record(&paths);
    let _ = app.emit(OPENED_FILES_EVENT, ());
}

#[tauri::command]
pub fn take_opened_files(state: State<'_, OpenedFiles>) -> Vec<String> {
    state
        .take_pending()
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

#[tauri::command]
pub async fn read_opened_file(
    path: String,
    state: State<'_, OpenedFiles>,
) -> Result<Response, String> {
    let path = PathBuf::from(path);
    if !state.claim(&path) {
        return Err("File was not opened with CrispAudio".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read opened file: {e}"))?;
    // iOS copies documents opened from other apps into Documents/Inbox; once
    // imported, that copy is just clutter in the app container.
    if is_inbox_copy(&path) {
        let _ = std::fs::remove_file(&path);
    }
    Ok(Response::new(bytes))
}

#[tauri::command]
pub async fn stage_share_file(request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw file bytes".into());
    };
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|v| v.to_str().ok())
        .map(sanitize_file_name)
        .unwrap_or_else(|| "export".into());

    let dir = std::env::temp_dir().join("crispaudio-share");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create share dir: {e}"))?;
    let path = dir.join(name);
    std::fs::write(&path, bytes).map_err(|e| format!("Failed to stage file: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

fn is_inbox_copy(path: &Path) -> bool {
    cfg!(target_os = "ios")
        && path
            .parent()
            .and_then(|p| p.file_name())
            .is_some_and(|n| n == "Inbox")
}

/// Keep only a plain file name: no directories, no characters that need
/// escaping anywhere the share sheet might send the file.
fn sanitize_file_name(raw: &str) -> String {
    let base = Path::new(raw)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let cleaned: String = base
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | ' ') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches(|c| c == '.' || c == ' ');
    if trimmed.is_empty() {
        "export".into()
    } else {
        trimmed.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_directories_and_odd_characters() {
        assert_eq!(sanitize_file_name("../../etc/passwd"), "passwd");
        assert_eq!(sanitize_file_name("Mix: take #2.wav"), "Mix_ take _2.wav");
        assert_eq!(sanitize_file_name("Ströbele.mp3"), "Str_bele.mp3");
        assert_eq!(sanitize_file_name(".."), "export");
        assert_eq!(sanitize_file_name(""), "export");
    }

    #[test]
    fn only_opened_paths_can_be_claimed_once() {
        let state = OpenedFiles::default();
        let opened = PathBuf::from("/tmp/opened.wav");
        state.record(&[opened.clone()]);

        assert!(!state.claim(Path::new("/tmp/other.wav")));
        assert!(state.claim(&opened));
        assert!(!state.claim(&opened));
    }

    #[test]
    fn pending_paths_drain_once() {
        let state = OpenedFiles::default();
        state.record(&[PathBuf::from("/tmp/a.wav"), PathBuf::from("/tmp/b.crispaudio")]);

        assert_eq!(state.take_pending().len(), 2);
        assert!(state.take_pending().is_empty());
    }
}
