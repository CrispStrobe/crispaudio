use super::native_playback::NativePlayback;
use serde_json::{json, Value};
#[cfg(feature = "native-validation")]
use tauri::Manager;
#[tauri::command]
pub async fn native_snapshot_begin<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    snapshots: tauri::State<'_, crispaudio_media::native_snapshot::Snapshots>,
    project: Value,
    descriptors: Vec<crispaudio_media::native_snapshot::Descriptor>,
) -> Result<String, String> {
    let snapshots = snapshots.inner().clone();
    let owner = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move || snapshots.begin(&owner, project, descriptors))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn native_snapshot_write<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    snapshots: tauri::State<crispaudio_media::native_snapshot::Snapshots>,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => snapshots.write(window.label(), bytes),
        _ => Err("Binary native PCM required".into()),
    }
}
#[tauri::command]
pub async fn native_snapshot_seal<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    snapshots: tauri::State<'_, crispaudio_media::native_snapshot::Snapshots>,
    snapshot: String,
) -> Result<(), String> {
    let snapshots = snapshots.inner().clone();
    let owner = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move || snapshots.seal(&owner, &snapshot))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn native_snapshot_close<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    snapshots: tauri::State<crispaudio_media::native_snapshot::Snapshots>,
    playback: tauri::State<NativePlayback>,
    recording: tauri::State<super::native_recording::NativeRecording>,
    snapshot: String,
) -> Result<(), String> {
    #[cfg(feature = "native-validation")]
    if let Some(state) = window.try_state::<crate::native_validation::NativeClockState>() {
        state.cancel_snapshot(window.label(), &snapshot);
    }
    snapshots.close(window.label(), &snapshot)?;
    playback.cancel_snapshot(window.label(), &snapshot);
    recording.cancel_snapshot(window.label(), &snapshot);
    Ok(())
}
#[tauri::command]
pub fn native_snapshot_status(
    snapshots: tauri::State<crispaudio_media::native_snapshot::Snapshots>,
) -> Value {
    let (entries, bytes) = snapshots.counts();
    json!({"entries":entries,"bytes":bytes})
}
