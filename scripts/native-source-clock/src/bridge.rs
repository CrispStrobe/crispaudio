//! Deliberately small JSON-line adapter for frontend qualification. Snapshot
//! storage, PCM validation, graph, live controls and worker are production code;
//! command dispatch/owner/queue time are test doubles, not Tauri IPC acceptance.
use crate::native_audio_clock::live::{self, LiveControl};
use crispaudio_media::native_snapshot::Snapshots;
use serde_json::{json, Value};
use std::{
    io::{self, BufRead, Write},
    sync::{Arc, Mutex},
    thread::JoinHandle,
};
const OWNER: &str = "source-bridge";
const LIMIT: usize = 2 * 1024 * 1024;
struct Session {
    id: String,
    snapshot: String,
    control: Arc<LiveControl>,
    result: Arc<Mutex<Option<Result<Value, String>>>>,
    worker: Option<JoinHandle<()>>,
}
#[derive(Default)]
struct Bridge {
    snapshots: Snapshots,
    session: Option<Session>,
    sequence: usize,
    closed: usize,
    allowed: Vec<String>,
}
fn text<'a>(value: &'a Value, key: &str) -> Result<&'a str, String> {
    value[key].as_str().ok_or_else(|| format!("Missing {key}"))
}
fn frame(value: &Value, key: &str) -> Result<u32, String> {
    value[key]
        .as_u64()
        .and_then(|v| u32::try_from(v).ok())
        .ok_or_else(|| format!("Invalid {key}"))
}
impl Bridge {
    fn active(&self, args: &Value) -> Result<&Session, String> {
        self.session
            .as_ref()
            .filter(|s| args["session"] == s.id)
            .ok_or("Unknown null bridge session".into())
    }
    fn close(&mut self) -> Result<Value, String> {
        let Some(mut active) = self.session.take() else {
            return Ok(Value::Null);
        };
        active.control.stop.cancel();
        if let Some(worker) = active.worker.take() {
            worker.join().map_err(|_| "Null bridge thread panicked")?;
        }
        if !live::null_bridge::helpers_closed(&active.control) {
            return Err("Null bridge helper survived worker join".into());
        }
        self.closed += 1;
        let result = active
            .result
            .lock()
            .unwrap()
            .take()
            .ok_or("Missing null bridge result")?;
        result
    }
    fn dispatch(&mut self, command: &str, args: Value) -> Result<Value, String> {
        match command {
            "native_snapshot_begin" => {
                let project = &args["project"];
                let effects = project["nativeEffects"]
                    .as_array()
                    .ok_or("One master effect required")?;
                if effects.len() != 1
                    || !self.allowed.iter().any(|id| effects[0]["pluginId"] == *id)
                {
                    return Err("Only explicitly trusted fixture effects are allowed".into());
                }
                let tracks = project["tracks"].as_array().ok_or("Missing source track")?;
                if tracks.len() != 1
                    || tracks.iter().any(|track| {
                        track["nativeEffects"]
                            .as_array()
                            .is_some_and(|r| !r.is_empty())
                            || track["segments"].as_array().is_none_or(|clips| {
                                clips.len() != 1
                                    || clips.iter().any(|c| {
                                        c["nativeEffects"].as_array().is_some_and(|r| !r.is_empty())
                                    })
                            })
                    })
                {
                    return Err("Only a single source master insert is allowed".into());
                }
                let descriptors: Vec<crispaudio_media::native_snapshot::Descriptor> =
                    serde_json::from_value(args["descriptors"].clone())
                        .map_err(|e| e.to_string())?;
                if descriptors.len() != 1
                    || descriptors
                        .iter()
                        .any(|s| s.sample_rate != 48000 || s.channels != 2 || s.frames > 480000)
                {
                    return Err("Null bridge requires one bounded stereo 48 kHz source".into());
                }
                Ok(json!(self.snapshots.begin(
                    OWNER,
                    project.clone(),
                    descriptors
                )?))
            }
            "native_snapshot_write" => {
                let packet: Vec<u8> = serde_json::from_value(args).map_err(|e| e.to_string())?;
                self.snapshots.write(OWNER, &packet)?;
                Ok(Value::Null)
            }
            "native_snapshot_seal" => {
                self.snapshots.seal(OWNER, text(&args, "snapshot")?)?;
                Ok(Value::Null)
            }
            "native_snapshot_close" => {
                let id = text(&args, "snapshot")?;
                // Production snapshot close revokes upload and cancels playback;
                // explicit playback close retains/join its reservation afterward.
                if let Some(active) = self.session.as_ref().filter(|s| s.snapshot == id) {
                    active.control.stop.cancel();
                }
                self.snapshots.close(OWNER, id)?;
                Ok(Value::Null)
            }
            "native_playback_start" => {
                if self.session.is_some() {
                    return Err("Close existing native audio first".into());
                }
                if args["muted"] != true || !args["device"].is_null() {
                    return Err("Hardware/device requests forbidden in null bridge".into());
                }
                let snapshot_id = text(&args, "snapshot")?.to_string();
                let snapshot = self.snapshots.get(OWNER, &snapshot_id)?;
                let start = frame(&args, "startFrame")?;
                let end = frame(&args, "endFrame")?;
                let cycle = args["cycle"].as_bool().ok_or("Missing cycle")?;
                let loop_start = if args["loopStartFrame"].is_null() {
                    None
                } else {
                    Some(frame(&args, "loopStartFrame")?)
                };
                if start >= end
                    || end as f64
                        > (snapshot.project["duration"]
                            .as_f64()
                            .ok_or("Invalid duration")?
                            * 48000.)
                            .round()
                    || loop_start.is_some_and(|v| v > start)
                    || cycle && end - loop_start.unwrap_or(start) < 2048
                {
                    return Err("Invalid null bridge range".into());
                }
                self.sequence += 1;
                let id = format!("null-playback-{}", self.sequence);
                let control = Arc::new(LiveControl::new());
                let result = Arc::new(Mutex::new(None));
                let saved = result.clone();
                let owned = control.clone();
                let worker = std::thread::spawn(move || {
                    let value = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        live::null_bridge::run(snapshot, start, end, cycle, loop_start, owned)
                    }))
                    .unwrap_or_else(|_| Err("Null bridge worker panicked".into()));
                    *saved.lock().unwrap() = Some(value);
                });
                self.session = Some(Session {
                    id: id.clone(),
                    snapshot: snapshot_id,
                    control,
                    result,
                    worker: Some(worker),
                });
                Ok(json!(id))
            }
            "native_playback_status" => {
                let active = self.active(&args)?;
                let mut status = active.control.status();
                if let Some(result) = active.result.lock().unwrap().as_ref() {
                    match result {
                        Ok(summary) => status["summary"] = summary.clone(),
                        Err(error) => {
                            status["phase"] = json!("fault");
                            status["error"] = json!(error);
                        }
                    }
                }
                Ok(status)
            }
            "native_playback_update" => Ok(json!(self
                .active(&args)?
                .control
                .update(args["controls"].clone())?)),
            "native_playback_pause" => {
                self.active(&args)?
                    .control
                    .pause(args["paused"].as_bool().ok_or("Invalid pause")?);
                Ok(Value::Null)
            }
            "native_playback_volume" => {
                self.active(&args)?
                    .control
                    .volume(args["volume"].as_f64().ok_or("Invalid volume")? as f32)?;
                Ok(Value::Null)
            }
            "native_playback_reset_loudness" => {
                self.active(&args)?.control.reset_loudness();
                Ok(Value::Null)
            }
            "native_playback_close" => {
                self.active(&args)?;
                self.close()
            }
            #[cfg(feature = "native-validation")]
            "bridge_fault" => {
                self.active(&args)?
                    .control
                    .validation_fault(text(&args, "kind")?)?;
                Ok(Value::Null)
            }
            "bridge_stats" => {
                let (snapshots, bytes) = self.snapshots.counts();
                Ok(
                    json!({"snapshots":snapshots,"bytes":bytes,"sessions":usize::from(self.session.is_some()),"started":self.sequence,"closed":self.closed,"hardware":false}),
                )
            }
            _ => Err(format!("Unsupported null bridge command: {command}")),
        }
    }
}
impl Drop for Bridge {
    fn drop(&mut self) {
        let _ = self.close();
        self.snapshots.shutdown();
    }
}

#[test]
#[ignore = "Explicit stdin frontend bridge; no hardware"]
fn source_bridge_server() {
    if std::env::var("CRISPAUDIO_SOURCE_BRIDGE").as_deref() != Ok("1") {
        return;
    }
    let allowed: Vec<String> = serde_json::from_str(
        &std::env::var("CRISPAUDIO_SOURCE_BRIDGE_PLUGIN_IDS")
            .expect("Explicit trusted fixture IDs required"),
    )
    .unwrap();
    assert!(!allowed.is_empty() && allowed.len() <= 8);
    let mut bridge = Bridge::default();
    bridge.allowed = allowed;
    let mut input = io::stdin().lock();
    let mut output = io::stdout().lock();
    loop {
        let mut line = Vec::new();
        // Bound before allocation, even if the sender omits its line ending.
        let count = std::io::Read::take(&mut input, (LIMIT + 1) as u64)
            .read_until(b'\n', &mut line)
            .unwrap();
        if count == 0 {
            break;
        }
        assert!(count <= LIMIT, "Null bridge request exceeds limit");
        let request: Value = serde_json::from_slice(&line).unwrap();
        let id = request["id"].clone();
        let result = bridge.dispatch(text(&request, "command").unwrap(), request["args"].clone());
        let response = match result {
            Ok(value) => json!({"id":id,"value":value}),
            Err(error) => json!({"id":id,"error":error}),
        };
        writeln!(output, "SOURCE_BRIDGE {response}").unwrap();
        output.flush().unwrap();
    }
    let _ = bridge.close();
    bridge.snapshots.shutdown();
    let final_stats = bridge.dispatch("bridge_stats", Value::Null).unwrap();
    assert_eq!(final_stats["bytes"], 0);
    assert_eq!(final_stats["snapshots"], 0);
    assert_eq!(final_stats["sessions"], 0);
    assert_eq!(final_stats["started"], final_stats["closed"]);
    writeln!(output, "SOURCE_BRIDGE_FINAL {final_stats}").unwrap();
    output.flush().unwrap();
}

#[test]
fn bridge_rejects_hardware_and_unknown_commands() {
    let mut bridge = Bridge::default();
    for command in [
        "native_recording_inputs",
        "list_audio_outputs",
        "native_snapshot_capture",
    ] {
        assert!(bridge
            .dispatch(command, json!({}))
            .unwrap_err()
            .contains("Unsupported"));
    }
    for args in [
        json!({"muted":false}),
        json!({"muted":true,"device":"forbidden"}),
    ] {
        assert!(bridge
            .dispatch("native_playback_start", args)
            .unwrap_err()
            .contains("Hardware"));
    }
}
fn begin_request() -> Value {
    json!({"project":{"sampleRate":48000,"duration":2048./48000.,"nativeEffects":[{"pluginId":"trusted"}],"tracks":[{"segments":[{"sourceId":"source"}]}]},"descriptors":[{"id":"source","frames":2048,"sampleRate":48000,"channels":2}]})
}
#[test]
fn bridge_admits_only_bounded_stereo_and_one_trusted_master_insert() {
    let mut bridge = Bridge::default();
    bridge.allowed = vec!["trusted".into()];
    let request = begin_request();
    for path in ["rate", "frames", "channels", "plugin", "track", "clip"] {
        let mut bad = request.clone();
        match path {
            "rate" => bad["descriptors"][0]["sampleRate"] = json!(44100),
            "frames" => bad["descriptors"][0]["frames"] = json!(480001),
            "channels" => bad["descriptors"][0]["channels"] = json!(1),
            "plugin" => bad["project"]["nativeEffects"][0]["pluginId"] = json!("untrusted"),
            "track" => {
                bad["project"]["tracks"][0]["nativeEffects"] = json!([{"pluginId":"untrusted"}])
            }
            _ => {
                bad["project"]["tracks"][0]["segments"][0]["nativeEffects"] =
                    json!([{"pluginId":"untrusted"}])
            }
        }
        assert!(
            bridge.dispatch("native_snapshot_begin", bad).is_err(),
            "{path}"
        );
    }
    assert_eq!(bridge.snapshots.counts(), (0, 0));
}
#[test]
fn bridge_preserves_production_upload_validation_and_releases_failed_uploads() {
    let mut bridge = Bridge::default();
    bridge.allowed = vec!["trusted".into()];
    let id = bridge
        .dispatch("native_snapshot_begin", begin_request())
        .unwrap();
    assert!(bridge.snapshots.counts().1 > 0);
    assert!(bridge
        .dispatch("native_snapshot_write", json!([0, 1, 2]))
        .is_err());
    assert!(bridge
        .dispatch("native_snapshot_seal", json!({"snapshot":id}))
        .is_err());
    bridge
        .dispatch("native_snapshot_close", json!({"snapshot":id}))
        .unwrap();
    assert_eq!(bridge.snapshots.counts(), (0, 0));
}
