//! Cancellable macOS Audio Unit effect discovery and isolated source processing.
use serde_json::{json, Value};
use tauri::Manager;
#[tauri::command]
pub async fn audio_unit_plugin(
    app: tauri::AppHandle,
    operation: String,
    mut request: Value,
    job_id: Option<String>,
) -> Result<Value, String> {
    if !request.is_object() || request.to_string().len() > 16_000_000 {
        return Err("Invalid plugin request".into());
    }
    if !cfg!(target_os = "macos") {
        return Err("Desktop plugin hosting requires macOS".into());
    }
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("plugin-previews");
    tauri::async_runtime::spawn_blocking(move || {
        crispaudio_media::jobs::run(job_id, || {
            let mut output = None;
            if operation == "plugin-render" {
                std::fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
                let path = cache.join(format!(
                    "preview-{}-{}.wav",
                    std::process::id(),
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map_err(|e| e.to_string())?
                        .as_nanos()
                ));
                request["output"] = json!(path);
                output = Some(path);
            }
            let result = crispaudio_media::apple::plugin(&operation, &request.to_string());
            if result.is_err() {
                if let Some(path) = output {
                    let _ = std::fs::remove_file(path);
                }
            }
            result
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

use crispaudio_media::plugin_stream::{PluginStream, StreamReply, StreamStop};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};
static NEXT_STREAM: AtomicU64 = AtomicU64::new(1);
struct StreamEntry {
    owner: String,
    processor: Mutex<PluginStream>,
    stop: StreamStop,
}
#[derive(Default)]
struct Registry {
    entries: HashMap<String, Arc<StreamEntry>>,
    opening: HashMap<String, (String, Option<StreamStop>)>,
    closed: bool,
}
#[derive(Clone, Default)]
pub struct PluginStreams(Arc<Mutex<Registry>>);
impl PluginStreams {
    fn reserve(&self, owner: &str) -> Result<String, String> {
        let session = format!(
            "stream-{}-{}",
            std::process::id(),
            NEXT_STREAM.fetch_add(1, Ordering::Relaxed)
        );
        {
            let mut registry = self
                .0
                .lock()
                .map_err(|_| "Plugin stream registry unavailable")?;
            registry.entries.retain(|_, entry| entry.stop.is_alive());
            if registry.closed || registry.entries.len() + registry.opening.len() >= 8 {
                return Err("Plugin stream limit reached".into());
            }
            registry
                .opening
                .insert(session.clone(), (owner.to_string(), None));
        }
        Ok(session)
    }

    pub fn close_owner(&self, owner: &str) {
        let removed = {
            let mut registry = self.0.lock().unwrap();
            let pending = registry
                .opening
                .iter()
                .filter(|(_, v)| v.0 == owner)
                .map(|(id, _)| id.clone())
                .collect::<Vec<_>>();
            for id in pending {
                if let Some((_, Some(stop))) = registry.opening.remove(&id) {
                    stop.stop();
                }
            }
            let ids = registry
                .entries
                .iter()
                .filter(|(_, v)| v.owner == owner)
                .map(|(id, _)| id.clone())
                .collect::<Vec<_>>();
            ids.into_iter()
                .filter_map(|id| registry.entries.remove(&id))
                .collect::<Vec<_>>()
        };
        for entry in removed {
            entry.stop.stop();
        }
    }
    pub fn shutdown(&self) {
        let removed = {
            let mut registry = self.0.lock().unwrap();
            registry.closed = true;
            for (_, (_, stop)) in registry.opening.drain() {
                if let Some(stop) = stop {
                    stop.stop();
                }
            }
            registry
                .entries
                .drain()
                .map(|(_, entry)| entry)
                .collect::<Vec<_>>()
        };
        for entry in removed {
            entry.stop.stop();
        }
    }
    fn entry(&self, owner: &str, id: &str) -> Result<Arc<StreamEntry>, String> {
        self.0
            .lock()
            .map_err(|_| "Plugin stream registry unavailable")?
            .entries
            .get(id)
            .filter(|entry| entry.owner == owner)
            .cloned()
            .ok_or("Plugin stream unavailable".into())
    }
    fn remove(&self, owner: &str, id: &str) -> Result<(), String> {
        let entry = {
            let mut registry = self
                .0
                .lock()
                .map_err(|_| "Plugin stream registry unavailable")?;
            if let Some(entry) = registry.entries.get(id) {
                if entry.owner != owner {
                    return Err("Plugin stream owner mismatch".into());
                }
            }
            registry.entries.remove(id)
        };
        if let Some(entry) = entry {
            entry.stop.stop();
        }
        Ok(())
    }
}
#[tauri::command]
pub async fn plugin_stream_open(
    window: tauri::WebviewWindow,
    streams: tauri::State<'_, PluginStreams>,
    request: Value,
) -> Result<Value, String> {
    if !cfg!(target_os = "macos") {
        return Err("Plugin streams require macOS".into());
    }
    let owner = window.label().to_string();
    let state = streams.inner().clone();
    let session = state.reserve(&owner)?;
    tauri::async_runtime::spawn_blocking(move || {
        let result = PluginStream::open_with_stop(&request, |stop| {
            let mut registry = state.0.lock().unwrap();
            if let Some(pending) = registry.opening.get_mut(&session) {
                pending.1 = Some(stop);
            } else {
                stop.stop();
            }
        });
        let mut registry = state
            .0
            .lock()
            .map_err(|_| "Plugin stream registry unavailable")?;
        let pending = registry.opening.remove(&session);
        let stream = result?;
        if registry.closed || pending.is_none() {
            return Err("Plugin stream opening superseded".into());
        }
        let info = stream.info.clone();
        registry.entries.insert(
            session.clone(),
            Arc::new(StreamEntry {
                owner,
                stop: stream.stop_handle(),
                processor: Mutex::new(stream),
            }),
        );
        Ok(json!({"session":session,"info":info}))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn plugin_stream_process(
    window: tauri::WebviewWindow,
    streams: tauri::State<'_, PluginStreams>,
    session: String,
    samples: Vec<Vec<f32>>,
    parameters: Value,
    bypass: bool,
) -> Result<StreamReply, String> {
    if samples.len() > 2 || samples.iter().any(|channel| channel.len() > 4096) {
        return Err("Invalid plugin stream audio".into());
    }
    let owner = window.label().to_string();
    let state = streams.inner().clone();
    let entry = state.entry(&owner, &session)?;
    tauri::async_runtime::spawn_blocking(move || {
        let result = entry
            .processor
            .try_lock()
            .map_err(|_| "Plugin stream unavailable")?
            .process(&samples, &parameters, bypass);
        if result.is_err() {
            let _ = state.remove(&owner, &session);
        }
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
#[derive(serde::Deserialize)]
struct PacketSettings {
    session: String,
    channels: usize,
    frames: usize,
    parameters: Value,
    bypass: bool,
}
fn decode_stream_packet(body: &[u8]) -> Result<(PacketSettings, Vec<Vec<f32>>), String> {
    if body.len() < 4 || body.len() > 16388 + 32768 {
        return Err("Invalid plugin packet size".into());
    }
    let length = u32::from_le_bytes(body[..4].try_into().unwrap()) as usize;
    if length > 16384 || length > body.len() - 4 {
        return Err("Invalid plugin packet header".into());
    }
    let settings: PacketSettings = serde_json::from_slice(&body[4..4 + length])
        .map_err(|_| "Invalid plugin packet settings")?;
    if settings.session.is_empty()
        || settings.session.len() > 128
        || !(1..=2).contains(&settings.channels)
        || !(1..=4096).contains(&settings.frames)
        || !settings.parameters.is_object()
        || settings.parameters.to_string().len() > 8192
        || body.len() != 4 + length + settings.channels * settings.frames * 4
    {
        return Err("Invalid plugin packet format".into());
    }
    let samples = body[4 + length..]
        .chunks_exact(settings.frames * 4)
        .map(|channel| {
            channel
                .chunks_exact(4)
                .map(|b| f32::from_le_bytes(b.try_into().unwrap()))
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    if samples.iter().flatten().any(|v| !v.is_finite()) {
        return Err("Invalid plugin packet PCM".into());
    }
    Ok((settings, samples))
}
fn encode_stream_reply(reply: StreamReply) -> Result<Vec<u8>, String> {
    let header = serde_json::to_vec(&reply.metadata).map_err(|e| e.to_string())?;
    if header.len() > 1048576 {
        return Err("Plugin reply metadata too large".into());
    }
    let mut bytes = Vec::with_capacity(
        4 + header.len() + reply.samples.iter().map(|ch| ch.len() * 4).sum::<usize>(),
    );
    bytes.extend_from_slice(&(header.len() as u32).to_le_bytes());
    bytes.extend_from_slice(&header);
    for sample in reply.samples.iter().flatten() {
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    Ok(bytes)
}
#[tauri::command]
pub async fn plugin_stream_process_binary(
    window: tauri::WebviewWindow,
    streams: tauri::State<'_, PluginStreams>,
    request: tauri::ipc::Request<'_>,
) -> Result<tauri::ipc::Response, String> {
    let body = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes,
        _ => return Err("Binary plugin packet required".into()),
    };
    let (settings, samples) = decode_stream_packet(body)?;
    let owner = window.label().to_string();
    let state = streams.inner().clone();
    let entry = state.entry(&owner, &settings.session)?;
    tauri::async_runtime::spawn_blocking(move || {
        let result = entry
            .processor
            .try_lock()
            .map_err(|_| "Plugin stream unavailable")?
            .process(&samples, &settings.parameters, settings.bypass);
        if result.is_err() {
            let _ = state.remove(&owner, &settings.session);
        }
        encode_stream_reply(result?).map(tauri::ipc::Response::new)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn plugin_stream_snapshot(
    window: tauri::WebviewWindow,
    streams: tauri::State<'_, PluginStreams>,
    session: String,
) -> Result<StreamReply, String> {
    let owner = window.label().to_string();
    let state = streams.inner().clone();
    let entry = state.entry(&owner, &session)?;
    tauri::async_runtime::spawn_blocking(move || {
        let result = entry
            .processor
            .try_lock()
            .map_err(|_| "Plugin stream unavailable")?
            .snapshot();
        if result.is_err() {
            let _ = state.remove(&owner, &session);
        }
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn plugin_stream_close(
    window: tauri::WebviewWindow,
    streams: tauri::State<'_, PluginStreams>,
    session: String,
) -> Result<(), String> {
    let owner = window.label().to_string();
    let state = streams.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.remove(&owner, &session))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod stream_registry_tests {
    use super::*;
    #[test]
    fn pending_slots_are_bounded_released_by_owner_and_closed_on_shutdown() {
        let state = PluginStreams::default();
        let ids = (0..8)
            .map(|i| state.reserve(if i < 4 { "one" } else { "two" }).unwrap())
            .collect::<Vec<_>>();
        assert!(state.reserve("one").is_err());
        assert_eq!(
            ids.iter().collect::<std::collections::HashSet<_>>().len(),
            8
        );
        state.close_owner("one");
        assert_eq!(state.0.lock().unwrap().opening.len(), 4);
        assert!(state.reserve("one").is_ok());
        state.shutdown();
        assert!(state.0.lock().unwrap().opening.is_empty());
        assert!(state.reserve("three").is_err());
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn owner_checks_and_shutdown_stop_published_and_pending_processors() {
        let plugins = crispaudio_media::apple::plugin("plugin-scan", "{}").unwrap();
        let id = plugins
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["name"] == "AUBandpass")
            .unwrap()["id"]
            .clone();
        let request = json!({"id":id,"sampleRate":48000,"channels":1});
        let state = PluginStreams::default();
        let first = PluginStream::open(&request).unwrap();
        let first_stop = first.stop_handle();
        let second = PluginStream::open(&request).unwrap();
        let second_stop = second.stop_handle();
        let mut pending = PluginStream::open(&request).unwrap();
        let pending_stop = pending.stop_handle();
        {
            let mut registry = state.0.lock().unwrap();
            registry.entries.insert(
                "first".into(),
                Arc::new(StreamEntry {
                    owner: "one".into(),
                    stop: first_stop.clone(),
                    processor: Mutex::new(first),
                }),
            );
            registry.entries.insert(
                "second".into(),
                Arc::new(StreamEntry {
                    owner: "two".into(),
                    stop: second_stop.clone(),
                    processor: Mutex::new(second),
                }),
            );
            registry
                .opening
                .insert("pending".into(), ("one".into(), Some(pending_stop)));
        }
        assert!(state.entry("two", "first").is_err());
        assert!(state.remove("two", "first").is_err());
        assert!(first_stop.is_alive());
        state.close_owner("one");
        assert!(!first_stop.is_alive());
        assert!(pending.snapshot().is_err());
        assert!(second_stop.is_alive());
        assert!(state.entry("two", "second").is_ok());
        state.shutdown();
        assert!(!second_stop.is_alive());
        assert!(state.remove("two", "second").is_ok());
    }
}

#[cfg(test)]
mod binary_stream_tests {
    use super::*;
    fn packet(settings: Value, pcm: &[f32]) -> Vec<u8> {
        let header = serde_json::to_vec(&settings).unwrap();
        let mut bytes = (header.len() as u32).to_le_bytes().to_vec();
        bytes.extend(header);
        for v in pcm {
            bytes.extend(v.to_le_bytes());
        }
        bytes
    }
    #[test]
    fn exact_pcm_and_bounded_settings() {
        let settings =
            json!({"session":"owned","channels":2,"frames":2,"parameters":{},"bypass":false});
        let (_, samples) =
            decode_stream_packet(&packet(settings.clone(), &[1.5, -2.0, 0.0, 3.0])).unwrap();
        assert_eq!(samples, vec![vec![1.5, -2.0], vec![0.0, 3.0]]);
        assert!(
            decode_stream_packet(&packet(settings.clone(), &[f32::NAN, 0.0, 0.0, 0.0])).is_err()
        );
        assert!(decode_stream_packet(&packet(settings, &[1.0])).is_err());
        assert!(decode_stream_packet(&packet(json!({"session":"owned","channels":18446744073709551615u64,"frames":4096,"parameters":{},"bypass":false}),&[])).is_err());
        assert!(decode_stream_packet(&[255; 4]).is_err());
    }
    #[test]
    fn reply_encodes_planar_float32_without_clipping() {
        let metadata =
            json!({"frames":2,"channels":1,"sampleRate":48000,"sequence":1,"latencySamples":0});
        let bytes = encode_stream_reply(StreamReply {
            metadata: metadata.clone(),
            samples: vec![vec![1.5, -2.0]],
        })
        .unwrap();
        let n = u32::from_le_bytes(bytes[..4].try_into().unwrap()) as usize;
        assert_eq!(
            serde_json::from_slice::<Value>(&bytes[4..4 + n]).unwrap(),
            metadata
        );
        assert_eq!(
            f32::from_le_bytes(bytes[4 + n..8 + n].try_into().unwrap()),
            1.5
        );
        assert_eq!(
            f32::from_le_bytes(bytes[8 + n..12 + n].try_into().unwrap()),
            -2.0
        );
    }
}
