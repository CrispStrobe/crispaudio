//! Owner-scoped continuous native transport sessions.
use crate::native_audio_clock::live::{self, LiveControl};
use crispaudio_media::native_snapshot::Snapshots;
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Mutex,
};

struct Session {
    owner: String,
    id: String,
    snapshot: String,
    control: Arc<LiveControl>,
    result: Mutex<Option<Result<Value, String>>>,
    worker: Mutex<Option<std::thread::JoinHandle<()>>>,
}
#[derive(Default)]
pub struct NativePlayback {
    active: Mutex<Option<Arc<Session>>>,
    sequence: AtomicU64,
}
impl NativePlayback {
    fn get(&self, owner: &str, id: &str) -> Result<Arc<Session>, String> {
        let slot = self.active.lock().unwrap();
        slot.as_ref()
            .filter(|s| s.owner == owner && s.id == id)
            .cloned()
            .ok_or("Unknown native playback session".into())
    }
    pub fn close_owner(&self, owner: &str) {
        let mut slot = self.active.lock().unwrap();
        if let Some(session) = slot.as_ref().filter(|s| s.owner == owner) {
            session.control.stop.cancel();
            if let Some(worker) = session.worker.lock().unwrap().take() {
                let _ = worker.join();
            }
            slot.take();
        }
    }
    pub fn cancel_owner(&self, owner: &str) {
        if let Some(session) = self
            .active
            .lock()
            .unwrap()
            .as_ref()
            .filter(|s| s.owner == owner)
        {
            session.control.stop.cancel();
        }
    }
    pub fn cancel_snapshot(&self, owner: &str, id: &str) {
        if let Some(session) = self
            .active
            .lock()
            .unwrap()
            .as_ref()
            .filter(|s| s.owner == owner && s.snapshot == id)
        {
            session.control.stop.cancel();
        }
    }
    pub fn shutdown(&self) {
        if let Some(session) = self.active.lock().unwrap().take() {
            session.control.stop.cancel();
            if let Some(worker) = session.worker.lock().unwrap().take() {
                let _ = worker.join();
            }
        }
    }
}
#[tauri::command]
pub fn native_playback_start(
    window: tauri::WebviewWindow,
    state: tauri::State<NativePlayback>,
    snapshots: tauri::State<Snapshots>,
    snapshot: String,
    device: Option<String>,
    start_frame: u32,
    end_frame: u32,
    cycle: bool,
    loop_start_frame: Option<u32>,
    muted: Option<bool>,
) -> Result<String, String> {
    let mut slot = state.active.lock().unwrap();
    if slot.is_some() {
        return Err("Close existing native playback first".into());
    }
    let snapshot_id = snapshot.clone();
    let snapshot = snapshots.get(window.label(), &snapshot)?;
    let duration = snapshot.project["duration"]
        .as_f64()
        .ok_or("Invalid native duration")?;
    if start_frame >= end_frame
        || end_frame as f64 > (duration * 48000.).round()
        || loop_start_frame.is_some_and(|v| v > start_frame)
    {
        return Err("Invalid native playback range".into());
    }
    if cycle && end_frame - loop_start_frame.unwrap_or(start_frame) < 2048 {
        return Err(
            "Live native loops require at least 2048 frames; choose Preview for shorter loops"
                .into(),
        );
    }
    let devices = crate::commands::audio_output::list_audio_outputs()?;
    let selected = devices
        .iter()
        .find(|d| device.as_ref().map_or(d.is_default, |id| d.id == *id))
        .ok_or("Selected output is unavailable")?
        .id
        .clone();
    let id = format!(
        "native-playback-{}",
        state.sequence.fetch_add(1, Ordering::Relaxed)
    );
    let session = Arc::new(Session {
        owner: window.label().into(),
        id: id.clone(),
        snapshot: snapshot_id,
        control: Arc::new(LiveControl::new()),
        result: Mutex::new(None),
        worker: Mutex::new(None),
    });
    let owned = session.clone();
    // Reserve before spawning: another start cannot share the output device or
    // race old-session cleanup. State persists until explicit close, even at EOS.
    *slot = Some(session.clone());
    let worker = std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            live::run(
                snapshot,
                selected,
                start_frame,
                end_frame,
                cycle,
                loop_start_frame,
                muted.unwrap_or(false),
                owned.control.clone(),
            )
        }))
        .unwrap_or_else(|_| Err("Native playback thread panicked".into()));
        *owned.result.lock().unwrap() = Some(result);
        owned.control.stop.finished.store(true, Ordering::Release);
    });
    *session.worker.lock().unwrap() = Some(worker);
    Ok(id)
}
#[tauri::command]
pub fn native_playback_status(
    window: tauri::WebviewWindow,
    state: tauri::State<NativePlayback>,
    session: String,
) -> Result<Value, String> {
    let active = state.get(window.label(), &session)?;
    let mut status = active.control.status();
    if let Some(result) = active.result.lock().unwrap().as_ref() {
        match result {
            Ok(value) => {
                status["summary"] = value.clone();
            }
            Err(error) => {
                status["phase"] = json!("fault");
                status["error"] = json!(error);
            }
        }
    }
    Ok(status)
}
#[tauri::command]
pub fn native_playback_pause(
    window: tauri::WebviewWindow,
    state: tauri::State<NativePlayback>,
    session: String,
    paused: bool,
) -> Result<(), String> {
    state.get(window.label(), &session)?.control.pause(paused);
    Ok(())
}
#[tauri::command]
pub fn native_playback_update(
    window: tauri::WebviewWindow,
    state: tauri::State<NativePlayback>,
    session: String,
    controls: Value,
) -> Result<u64, String> {
    state
        .get(window.label(), &session)?
        .control
        .update(controls)
}
#[tauri::command]
pub fn native_playback_reset_loudness(
    window: tauri::WebviewWindow,
    state: tauri::State<NativePlayback>,
    session: String,
) -> Result<(), String> {
    state
        .get(window.label(), &session)?
        .control
        .reset_loudness();
    Ok(())
}
#[tauri::command]
pub fn native_playback_volume(
    window: tauri::WebviewWindow,
    state: tauri::State<NativePlayback>,
    session: String,
    volume: f32,
) -> Result<(), String> {
    state.get(window.label(), &session)?.control.volume(volume)
}
#[tauri::command]
pub async fn native_playback_close(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, NativePlayback>,
    session: String,
) -> Result<Value, String> {
    let active = state.get(window.label(), &session)?;
    let closing = active.clone();
    tauri::async_runtime::spawn_blocking(move || {
        closing.control.stop.cancel();
        if let Some(worker) = closing.worker.lock().unwrap().take() {
            worker
                .join()
                .map_err(|_| "Native playback shutdown panicked")?;
        }
        Ok::<_, String>(())
    })
    .await
    .map_err(|e| e.to_string())??;
    let mut slot = state.active.lock().unwrap();
    if slot.as_ref().is_some_and(|s| s.id == session) {
        slot.take();
    }
    let result = active
        .result
        .lock()
        .unwrap()
        .clone()
        .unwrap_or_else(|| Err("Native playback result missing".into()));
    result
}

#[cfg(feature = "native-validation")]
#[tauri::command]
pub fn native_playback_validation_fault(
    window: tauri::WebviewWindow,
    state: tauri::State<NativePlayback>,
    kind: String,
) -> Result<(), String> {
    let slot = state.active.lock().unwrap();
    let session = slot
        .as_ref()
        .filter(|s| s.owner == window.label())
        .ok_or("No owned validation playback")?;
    session.control.validation_fault(&kind)
}
