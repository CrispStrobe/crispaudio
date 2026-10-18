//! Owner-scoped Mac recording actor. !Send audio queues are constructed, polled
//! and destroyed on one control thread. No WebKit PCM/timing deadlines.
use super::native_playback::{NativePlayback, RecordingLease};
use crispaudio_media::{
    native_input::{
        backing::{
            self,
            transport::{Click, Plan},
        },
        macos::{
            self,
            playback::{self, MonitorLevels, Output},
            ChannelMap, HostTimebase,
        },
        mix,
        plugins::PluginConfig,
        session::{
            self,
            group::{self, Group, GroupOutcome},
            monitored,
        },
        timing::{Basis, Correction, Intent},
    },
    native_snapshot::{Snapshot, Snapshots},
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashSet},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
use tauri::Manager;
#[link(name = "System")]
extern "C" {
    fn getentropy(buffer: *mut std::ffi::c_void, size: usize) -> i32;
}
fn run_token(sequence: u64) -> Result<String, String> {
    // A process-local counter alone repeats after app relaunch within one boot.
    let mut random = [0u8; 16];
    if unsafe { getentropy(random.as_mut_ptr().cast(), random.len()) } != 0 {
        return Err("Could not create a unique native recording identity".into());
    }
    let random = random
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    Ok(format!("nr-{random}-{sequence:x}"))
}
const STOP: usize = 1;
const CANCEL: usize = 2;
const POLL: Duration = Duration::from_millis(20);
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CueControls {
    pub gain: f32,
    pub pan: f32,
    pub mono: bool,
}
impl CueControls {
    fn checked(&self) -> Result<mix::Controls, String> {
        if !self.gain.is_finite()
            || !(0. ..=4.).contains(&self.gain)
            || !self.pan.is_finite()
            || !(-1. ..=1.).contains(&self.pan)
        {
            return Err("Invalid native cue controls".into());
        }
        Ok(mix::Controls {
            gain: self.gain,
            pan: self.pan,
            mono: self.mono,
        })
    }
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Input {
    pub track_id: String,
    /// CoreAudio UID, not a browser media-device ID.
    pub device: String,
    pub channels: Vec<u32>,
    pub cue: Option<CueControls>,
    pub monitor_fx: bool,
    pub correction: Correction,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Options {
    #[serde(default)]
    pub monitor_mix: MonitorLevels,
    pub device: String,
    pub project_start_frame: u32,
    pub record_start_frame: u32,
    pub record_end_frame: Option<u32>,
    pub cycle: bool,
    pub lead_frames: u32,
    pub count_in_frames: u32,
    /// Per-input raw source cap; the whole group remains <=32 million frames.
    pub max_frames: u64,
    pub click: Option<Click>,
    pub inputs: Vec<Input>,
}
fn valid_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 128 && !value.chars().any(char::is_control)
}
fn validate(options: &Options, project: &Value) -> Result<(), String> {
    options.monitor_mix.validate()?;
    let mut ids = HashSet::new();
    if !valid_id(project["id"].as_str().unwrap_or(""))
        || options.device.is_empty()
        || options.device.len() > 4096
        || options.device.chars().any(char::is_control)
        || options.inputs.is_empty()
        || options.inputs.len() > 8
        || options.max_frames > 32_000_000 / options.inputs.len() as u64
        || options.max_frames
            < 9600
                + options.lead_frames as u64
                + (options
                    .record_start_frame
                    .saturating_sub(options.project_start_frame)) as u64
        || options.lead_frames > 60 * 48000
        || options.count_in_frames > options.lead_frames
        || options.count_in_frames > 0 && options.click.is_none()
        || options.project_start_frame > options.record_start_frame
        || options
            .record_end_frame
            .is_some_and(|end| end <= options.record_start_frame)
        || options.cycle && options.record_end_frame.is_none()
    {
        return Err("Invalid native recording plan".into());
    }
    let tracks = project["tracks"]
        .as_array()
        .ok_or("Invalid recording tracks")?;
    for input in &options.inputs {
        if !valid_id(&input.track_id)
            || !ids.insert(&input.track_id)
            || input.device.is_empty()
            || input.device.len() > 4096
            || input.device.chars().any(char::is_control)
            || !(1..=2).contains(&input.channels.len())
            || input.channels.iter().any(|channel| *channel >= 32)
            || input.channels.len() == 2 && input.channels[0] == input.channels[1]
            || input.correction.frames.abs_diff(0) > 48000
            || input.correction.basis == Basis::Unqualified && input.correction.frames != 0
            || input.monitor_fx && input.cue.is_none()
        {
            return Err("Invalid native recording input".into());
        }
        if let Some(cue) = &input.cue {
            cue.checked()?;
        }
        let track = tracks
            .iter()
            .find(|track| track["id"] == input.track_id)
            .ok_or("Recording track is missing")?;
        if track["kind"] == "bus" || track["locked"] == true || track["recordArmed"] != true {
            return Err("Recording track is not armed or is locked".into());
        }
    }
    Ok(())
}
struct Control {
    action: AtomicUsize,
    status: Mutex<Value>,
    /// Sparse control-thread updates only. The output callback uses atomics.
    updates: Mutex<BTreeMap<String, CueControls>>,
    monitor_mix: Mutex<MonitorLevels>,
}
impl Control {
    fn new() -> Self {
        Self {
            action: AtomicUsize::new(0),
            status: Mutex::new(json!({"phase":"preparing"})),
            updates: Mutex::new(BTreeMap::new()),
            monitor_mix: Mutex::new(MonitorLevels::default()),
        }
    }
    fn cancelled(&self) -> bool {
        self.action.load(Ordering::Acquire) != 0
    }
    fn check(&self) -> Result<(), String> {
        if self.cancelled() {
            Err("Native recording cancelled during preparation".into())
        } else {
            Ok(())
        }
    }
    fn request(&self, cancel: bool) {
        self.action
            .fetch_max(if cancel { CANCEL } else { STOP }, Ordering::AcqRel);
    }
}
struct Session {
    owner: String,
    id: String,
    snapshot: String,
    cues: HashSet<String>,
    control: Arc<Control>,
    worker: Mutex<Option<JoinHandle<Value>>>,
}
#[derive(Default)]
pub struct NativeRecording {
    active: Mutex<Option<Arc<Session>>>,
    sequence: AtomicU64,
    recovering: Arc<AtomicBool>,
}
struct RecoveryLease(Arc<AtomicBool>);
impl Drop for RecoveryLease {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
impl NativeRecording {
    fn reserve_recovery(&self) -> Result<RecoveryLease, String> {
        let active = self.active.lock().unwrap();
        if active.is_some()
            || self
                .recovering
                .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
                .is_err()
        {
            return Err("Close native recording or recovery first".into());
        }
        Ok(RecoveryLease(self.recovering.clone()))
    }
    fn get(&self, owner: &str, id: &str) -> Result<Arc<Session>, String> {
        self.active
            .lock()
            .unwrap()
            .as_ref()
            .filter(|s| s.owner == owner && s.id == id)
            .cloned()
            .ok_or("Unknown native recording session".into())
    }
    pub fn cancel_snapshot(&self, owner: &str, snapshot: &str) {
        if let Some(s) = self
            .active
            .lock()
            .unwrap()
            .as_ref()
            .filter(|s| s.owner == owner && s.snapshot == snapshot)
        {
            s.control.request(true);
        }
    }
    pub fn close_owner(&self, owner: &str) {
        let mut slot = self.active.lock().unwrap();
        if let Some(s) = slot.as_ref().filter(|s| s.owner == owner) {
            s.control.request(true);
            if let Some(worker) = s.worker.lock().unwrap().take() {
                let _ = worker.join();
            }
            slot.take();
        }
    }
    pub fn shutdown(&self) {
        if let Some(s) = self.active.lock().unwrap().take() {
            s.control.request(true);
            if let Some(worker) = s.worker.lock().unwrap().take() {
                let _ = worker.join();
            }
        }
    }
}
fn retained(control: &Control, directory: &std::path::Path) {
    control.status.lock().unwrap()["directory"] = json!(directory);
}
fn outcome(value: GroupOutcome) -> Value {
    match value {
        GroupOutcome::Complete {
            directory,
            manifest,
        } => json!({"phase":"complete","directory":directory,"manifest":manifest}),
        GroupOutcome::Incomplete {
            directory, reason, ..
        } => json!({"phase":"fault","directory":directory,"error":reason}),
    }
}
fn cue_plugins(
    project: &Value,
    track_id: &str,
    enabled: bool,
) -> Result<Vec<PluginConfig>, String> {
    if !enabled {
        return Ok(Vec::new());
    }
    let track = project["tracks"]
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["id"] == track_id)
        .unwrap();
    let mut plugins = Vec::new();
    if let Some(rack) = track["nativeEffects"].as_array() {
        for entry in rack.iter().filter(|entry| entry["enabled"] == true) {
            if entry["parameterAutomation"]
                .as_object()
                .is_some_and(|lanes| {
                    lanes
                        .values()
                        .any(|lane| lane.as_array().is_some_and(|points| !points.is_empty()))
                })
            {
                return Err("Native recording cue requires static inserts".into());
            }
            plugins.push(PluginConfig {
                id: entry["pluginId"]
                    .as_str()
                    .ok_or("Invalid cue plug-in")?
                    .into(),
                state: entry["state"].as_str().unwrap_or("").into(),
                parameters: entry["parameters"].clone(),
                bypass: entry["bypass"] == true,
            });
        }
    }
    if plugins.len() > 2 {
        return Err("At most two cue inserts per input".into());
    }
    Ok(plugins)
}
fn run(
    snapshot: Arc<Snapshot>,
    options: Options,
    root: PathBuf,
    token: String,
    control: Arc<Control>,
    _lease: RecordingLease,
) -> Result<Value, String> {
    control.check()?;
    validate(&options, &snapshot.project)?;
    if macos::microphone_permission()? != macos::Permission::Authorized {
        return Err("Microphone permission must be granted before native recording".into());
    }
    let available = macos::list_inputs()?;
    for input in &options.inputs {
        let device = available
            .iter()
            .find(|device| device.uid == input.device)
            .ok_or("Selected input is unavailable")?;
        if input
            .channels
            .iter()
            .any(|channel| *channel >= device.channels)
        {
            return Err("Selected input channels are unavailable".into());
        }
    }
    if !playback::list_outputs()?
        .iter()
        .any(|device| device.uid == options.device)
    {
        return Err("Selected output is unavailable".into());
    }
    let intent = Intent {
        context: HostTimebase::current()?.recording_context(&token)?,
        project_id: snapshot.project["id"].as_str().unwrap().into(),
        lead_frames: options.lead_frames,
        project_start_frame: options.project_start_frame as i64,
        record_start_frame: options.record_start_frame as i64,
        record_end_frame: options.record_end_frame.map(i64::from),
        cycle: options.cycle,
        max_drift_frames: 64,
        corrections: options
            .inputs
            .iter()
            .map(|input| (input.track_id.clone(), input.correction.clone()))
            .collect(),
    };
    let mut inputs = options
        .inputs
        .iter()
        .map(|input| {
            Ok(group::Input {
                track_id: input.track_id.clone(),
                recording: session::Config {
                    channels: input.channels.len() as u16,
                    max_frames: options.max_frames,
                    context: json!({"device":input.device,"channels":input.channels}),
                    callback_timeout: Duration::from_secs(2),
                },
                cue: input
                    .cue
                    .as_ref()
                    .map(|_| {
                        cue_plugins(&snapshot.project, &input.track_id, input.monitor_fx).map(
                            |plugins| group::CueSpec {
                                plugins,
                                startup_timeout: Duration::from_secs(5),
                            },
                        )
                    })
                    .transpose()?,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    intent.stamp(&mut inputs)?;
    control.check()?;
    // No capture opens until every dry file, cue helper and backing graph is ready.
    let (prepared, cues) = Group::<macos::Capture>::prepare(&root, inputs).map_err(|error| {
        if let Some(directory) = error.directory {
            retained(&control, &directory);
        }
        error.reason
    })?;
    retained(&control, prepared.directory());
    let mut ledger = crispaudio_media::native_input::recovery::Ledger::create(
        prepared.directory(),
        intent.clone(),
        prepared.recovery_inputs(),
    )?;
    control.check()?;
    let backing_snapshot = snapshot.clone(); // Retain the decoded-source budget lease.
    let (backing, reader) = backing::Worker::recording(
        Duration::from_secs(10),
        Plan {
            intent: intent.clone(),
            frames: options.max_frames,
            count_in_frames: options.count_in_frames,
            click: options.click.clone(),
        },
        move |backing_control| {
            crate::native_audio_clock::prepare_recording_graph(
                &backing_snapshot.project,
                backing_snapshot.sources.clone(),
                &|helper| backing_control.register(helper),
            )
        },
    )?;
    control.check()?;
    let cue_ids = cues.iter().map(|(id, _)| id.clone()).collect::<Vec<_>>();
    let cues = cues
        .into_iter()
        .map(|(id, cue)| {
            Ok((
                cue,
                options
                    .inputs
                    .iter()
                    .find(|input| input.track_id == id)
                    .unwrap()
                    .cue
                    .as_ref()
                    .unwrap()
                    .checked()?,
            ))
        })
        .collect::<Result<Vec<_>, String>>()?;
    let output = Output::start_shared(
        &options.device,
        cues,
        Some(reader),
        playback::Config {
            delay_frames: 4096,
            startup_grace_frames: 48000,
            max_input_drift_frames: 64,
            max_output_drift_frames: 64,
            watchdog_timeout: Duration::from_secs(2),
        },
    )?;
    output.set_monitor_levels(*control.monitor_mix.lock().unwrap())?;
    let mut prepared = monitored::Prepared::new(prepared, output, Some(backing));
    let deadline = Instant::now() + Duration::from_secs(2);
    while !prepared.ready()? {
        control.check()?;
        if Instant::now() >= deadline {
            return Err("Native output clock readiness timed out".into());
        }
        thread::sleep(POLL);
    }
    control.check()?;
    let mut run = prepared
        .start(|id, writer| {
            control.check()?;
            let input = options
                .inputs
                .iter()
                .find(|input| input.track_id == id)
                .unwrap();
            let map = if input.channels.len() == 1 {
                ChannelMap::Mono(input.channels[0])
            } else {
                ChannelMap::Stereo(input.channels[0], input.channels[1])
            };
            macos::Capture::start(&input.device, map, writer)
        })
        .map_err(|error| error.reason)?;
    let mut last_checkpoint = None;
    loop {
        let action = control.action.load(Ordering::Acquire);
        if action == CANCEL {
            return Ok(outcome(run.cancel()));
        }
        if action == STOP {
            return Ok(outcome(run.stop_timed(intent)));
        }
        let reports = match run.poll() {
            Ok(reports) => reports,
            Err(_) => return Ok(outcome(run.cancel())),
        };
        run.output()
            .unwrap()
            .set_monitor_levels(*control.monitor_mix.lock().unwrap())?;
        for (id, update) in std::mem::take(&mut *control.updates.lock().unwrap()) {
            let index = cue_ids
                .iter()
                .position(|cue| *cue == id)
                .ok_or("Unknown cue track")?;
            run.output()
                .unwrap()
                .set_cue_controls(index, update.checked()?)?;
        }
        let output = run.output().unwrap().report();
        ledger.check()?;
        if last_checkpoint.is_none_or(|last: Instant| last.elapsed() >= Duration::from_secs(1)) {
            if let Some(snapshot) =
                crispaudio_media::native_input::timing::Snapshot::from_progress(&output)?
            {
                ledger.checkpoint(snapshot)?;
                last_checkpoint = Some(Instant::now());
            }
        }
        let elapsed = output
            .first_mixed_frame
            .map(|first| output.hardware_frame - first);
        let project_elapsed = elapsed.map(|frame| frame - options.lead_frames as i64);
        let linear_frame = project_elapsed.map(|frame| options.project_start_frame as i64 + frame);
        let phase = if elapsed.map_or(true, |frame| frame < 0) {
            "preparing"
        } else if linear_frame.map_or(true, |frame| frame < options.record_start_frame as i64) {
            "lead"
        } else {
            "recording"
        };
        let frame = linear_frame.map(|frame| {
            if options.cycle && frame >= options.record_end_frame.unwrap() as i64 {
                options.record_start_frame as i64
                    + (frame - options.record_end_frame.unwrap() as i64)
                        % (options.record_end_frame.unwrap() - options.record_start_frame) as i64
            } else {
                frame.max(options.project_start_frame as i64)
            }
        });
        let mut status = control.status.lock().unwrap();
        status["phase"] = json!(phase);
        status["frame"] = json!(frame);
        status["elapsedFrames"] = json!(elapsed);
        status["callbacks"] = json!(output.callbacks);
        status["inputs"]=json!(reports.iter().map(|(id,report)|json!({"trackId":id,"frames":report.frames,"peaks":report.peaks,"channels":options.inputs.iter().find(|input|input.track_id==*id).unwrap().channels.len(),"cueFault":cue_ids.iter().position(|cue|cue==id).and_then(|index|output.cues[index]).and_then(|report|report.fault).map(|fault|format!("{fault:?}"))})).collect::<Vec<_>>());
        drop(status);
        // Leave a polling margin before the hard source cap. A stalled owner
        // still faults rather than publishing beyond its admitted source budget.
        let capped = reports
            .iter()
            .any(|(_, report)| report.frames >= options.max_frames - 4800);
        let window_end = options.record_end_frame.map(|end| {
            if options.cycle {
                end as i64 + 499 * (end - options.record_start_frame) as i64
            } else {
                end as i64
            }
        });
        if capped
            || linear_frame
                .zip(window_end)
                .is_some_and(|(frame, end)| frame >= end)
        {
            return Ok(outcome(run.stop_timed(intent)));
        }
        thread::sleep(POLL);
    }
}
#[tauri::command]
pub fn native_recording_start(
    window: tauri::WebviewWindow,
    state: tauri::State<NativeRecording>,
    snapshots: tauri::State<Snapshots>,
    playback: tauri::State<NativePlayback>,
    snapshot: String,
    options: Options,
) -> Result<String, String> {
    let mut slot = state.active.lock().unwrap();
    if slot.is_some() || state.recovering.load(Ordering::Acquire) {
        return Err("Close existing native recording first".into());
    }
    let frozen = snapshots.get(window.label(), &snapshot)?;
    validate(&options, &frozen.project)?;
    let root = window
        .app_handle()
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("recordings");
    let lease = playback.reserve_recording()?;
    let id = run_token(state.sequence.fetch_add(1, Ordering::Relaxed))?;
    let session = Arc::new(Session {
        owner: window.label().into(),
        id: id.clone(),
        snapshot,
        cues: options
            .inputs
            .iter()
            .filter(|input| input.cue.is_some())
            .map(|input| input.track_id.clone())
            .collect(),
        control: Arc::new(Control::new()),
        worker: Mutex::new(None),
    });
    *session.control.monitor_mix.lock().unwrap() = options.monitor_mix;
    let control = session.control.clone();
    let token = id.clone();
    let worker = thread::Builder::new()
        .name("native-recording-owner".into())
        .spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                run(frozen, options, root, token, control.clone(), lease)
            }))
            .unwrap_or_else(|_| Err("Native recording owner panicked".into()));
            let mut status = control.status.lock().unwrap();
            let result = result.unwrap_or_else(
                |reason| json!({"phase":"fault","error":reason,"directory":status["directory"]}),
            );
            *status = result.clone();
            result
        })
        .map_err(|error| error.to_string())?;
    *session.worker.lock().unwrap() = Some(worker);
    *slot = Some(session);
    Ok(id)
}
/// App-data managed IDs only; never accepts a filesystem path from WebKit.
#[tauri::command]
pub async fn native_recording_discover(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, NativeRecording>,
) -> Result<Value, String> {
    let lease = state.reserve_recovery()?;
    let root = window
        .app_handle()
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("recordings");
    tauri::async_runtime::spawn_blocking(move || {
        let _lease = lease;
        crispaudio_media::native_input::recovery::discover(&root)
            .and_then(|result| serde_json::to_value(result).map_err(|e| e.to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn native_recording_recover(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, NativeRecording>,
    group: String,
) -> Result<Value, String> {
    let lease = state.reserve_recovery()?;
    let root = window
        .app_handle()
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("recordings");
    tauri::async_runtime::spawn_blocking(move || {
        let _lease = lease;
        let (directory,result) = crispaudio_media::native_input::recovery::recover(&root,&group,&AtomicBool::new(false))?;
        Ok(json!({"phase":"recovered","incomplete":result.incomplete,"directory":directory,"manifest":result.manifest,"reasons":result.reasons}))
    }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub fn native_recording_status(
    window: tauri::WebviewWindow,
    state: tauri::State<NativeRecording>,
    session: String,
) -> Result<Value, String> {
    let active = state.get(window.label(), &session)?;
    let status = active.control.status.lock().unwrap().clone();
    Ok(status)
}
#[tauri::command]
pub fn native_recording_cue(
    window: tauri::WebviewWindow,
    state: tauri::State<NativeRecording>,
    session: String,
    track: String,
    controls: CueControls,
) -> Result<(), String> {
    controls.checked()?;
    let active = state.get(window.label(), &session)?;
    if !active.cues.contains(&track) {
        return Err("Unknown cue track".into());
    }
    active
        .control
        .updates
        .lock()
        .unwrap()
        .insert(track, controls);
    Ok(())
}
#[tauri::command]
pub fn native_recording_mix(
    window: tauri::WebviewWindow,
    state: tauri::State<NativeRecording>,
    session: String,
    levels: MonitorLevels,
) -> Result<(), String> {
    levels.validate()?;
    let active = state.get(window.label(), &session)?;
    *active.control.monitor_mix.lock().unwrap() = levels;
    Ok(())
}
#[tauri::command]
pub async fn native_recording_close(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, NativeRecording>,
    session: String,
    cancel: bool,
) -> Result<Value, String> {
    let active = state.get(window.label(), &session)?;
    active.control.request(cancel);
    let closing = active.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        if let Some(worker) = closing.worker.lock().unwrap().take() {
            worker
                .join()
                .map_err(|_| "Native recording shutdown panicked".to_string())
        } else {
            Ok(closing.control.status.lock().unwrap().clone())
        }
    })
    .await
    .map_err(|error| error.to_string())??;
    let mut slot = state.active.lock().unwrap();
    if slot.as_ref().is_some_and(|value| value.id == session) {
        slot.take();
    }
    Ok(result)
}
/// Read-only inventory. Starting capture requires a separate explicit command.
#[tauri::command]
pub fn native_recording_inputs() -> Result<Value, String> {
    Ok(
        json!({"permission":format!("{:?}",macos::microphone_permission()?),"devices":macos::list_inputs()?.iter().map(|device|json!({"uid":device.uid,"label":device.label,"channels":device.channels,"nominalRate":device.nominal_rate,"isDefault":device.is_default})).collect::<Vec<_>>()}),
    )
}
#[cfg(test)]
mod tests;
