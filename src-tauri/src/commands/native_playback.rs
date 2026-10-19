//! Owner-scoped continuous native transport sessions.
use crate::native_audio_clock::live::{self, LiveControl};
use crispaudio_media::native_snapshot::{Snapshot, Snapshots};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
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
impl Session {
    // Hold the join mutex through completion: duplicate close paths must wait too.
    fn join(&self) -> Result<(), String> {
        self.control.stop.cancel();
        let mut worker = self.worker.lock().unwrap();
        if let Some(worker) = worker.take() {
            worker
                .join()
                .map_err(|_| "Native playback shutdown panicked")?;
        }
        Ok(())
    }
}
#[derive(Clone, Copy)]
struct PlaybackRange {
    start: u32,
    end: u32,
    cycle: bool,
    loop_start: Option<u32>,
}
#[derive(Default)]
pub struct NativePlayback {
    active: Mutex<Option<Arc<Session>>>,
    sequence: AtomicU64,
    recording: Arc<AtomicBool>,
}
/// Reservation shares the playback start lock; no two native owners can open
/// output concurrently. Retain until recording workers and queues have closed.
pub(crate) struct RecordingLease(Arc<AtomicBool>);
impl Drop for RecordingLease {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
impl NativePlayback {
    pub(crate) fn reserve_recording(&self) -> Result<RecordingLease, String> {
        let active = self.active.lock().unwrap();
        if active.is_some() || self.recording.swap(true, Ordering::AcqRel) {
            return Err("Close existing native audio first".into());
        }
        Ok(RecordingLease(self.recording.clone()))
    }

    fn start_with<F, R>(
        &self,
        owner: &str,
        snapshots: &Snapshots,
        snapshot_id: String,
        range: PlaybackRange,
        prepare: F,
    ) -> Result<String, String>
    where
        F: FnOnce(Arc<Snapshot>, Arc<LiveControl>) -> Result<R, String>,
        R: FnOnce() -> Result<Value, String> + Send + 'static,
    {
        let mut slot = self.active.lock().unwrap();
        if slot.is_some() || self.recording.load(Ordering::Acquire) {
            return Err("Close existing native audio first".into());
        }
        // Recheck owner admission under the same lock retained through publication.
        // Window teardown revokes snapshots BEFORE waiting for this owner lock.
        let snapshot = snapshots.get(owner, &snapshot_id)?;
        let duration = snapshot.project["duration"]
            .as_f64()
            .ok_or("Invalid native duration")?;
        if range.start >= range.end
            || range.end as f64 > (duration * 48000.).round()
            || range.loop_start.is_some_and(|v| v > range.start)
        {
            return Err("Invalid native playback range".into());
        }
        if range.cycle && range.end - range.loop_start.unwrap_or(range.start) < 2048 {
            return Err(
                "Live native loops require at least 2048 frames; choose Preview for shorter loops"
                    .into(),
            );
        }
        let control = Arc::new(LiveControl::new());
        let run = prepare(snapshot, control.clone())?;
        let id = format!(
            "native-playback-{}",
            self.sequence.fetch_add(1, Ordering::Relaxed)
        );
        let session = Arc::new(Session {
            owner: owner.into(),
            id: id.clone(),
            snapshot: snapshot_id,
            control,
            result: Mutex::new(None),
            worker: Mutex::new(None),
        });
        let owned = session.clone();
        // The slot lock covers prepare/spawn/publication, including a fast worker exit.
        *slot = Some(session.clone());
        let worker = std::thread::spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(run))
                .unwrap_or_else(|_| Err("Native playback thread panicked".into()));
            *owned.result.lock().unwrap() = Some(result);
            owned.control.stop.finished.store(true, Ordering::Release);
        });
        *session.worker.lock().unwrap() = Some(worker);
        Ok(id)
    }
    fn status(&self, owner: &str, id: &str) -> Result<Value, String> {
        let active = self.get(owner, id)?;
        let mut status = active.control.status();
        if let Some(result) = active.result.lock().unwrap().as_ref() {
            match result {
                Ok(value) => status["summary"] = value.clone(),
                Err(error) => {
                    status["phase"] = json!("fault");
                    status["error"] = json!(error);
                }
            }
        }
        Ok(status)
    }
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
            let _ = session.join();
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
            let _ = session.join();
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
    let range = PlaybackRange {
        start: start_frame,
        end: end_frame,
        cycle,
        loop_start: loop_start_frame,
    };
    state.start_with(
        window.label(),
        &snapshots,
        snapshot,
        range,
        |snapshot, control| {
            let devices = crate::commands::audio_output::list_audio_outputs()?;
            let selected = devices
                .iter()
                .find(|d| device.as_ref().map_or(d.is_default, |id| d.id == *id))
                .ok_or("Selected output is unavailable")?
                .id
                .clone();
            Ok(move || {
                live::run(
                    snapshot,
                    selected,
                    range.start,
                    range.end,
                    range.cycle,
                    range.loop_start,
                    muted.unwrap_or(false),
                    control,
                )
            })
        },
    )
}

#[tauri::command]
pub fn native_playback_status(
    window: tauri::WebviewWindow,
    state: tauri::State<NativePlayback>,
    session: String,
) -> Result<Value, String> {
    state.status(window.label(), &session)
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
    tauri::async_runtime::spawn_blocking(move || closing.join())
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

#[cfg(test)]
mod tests;
