//! Owner-scoped, bounded binary PCM upload. No plugins, devices or filesystem access.
use crate::{
    native_graph::{Source, Stereo},
    Result,
};
use serde::Deserialize;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicU64, AtomicUsize, Ordering},
        Arc, Mutex,
    },
};
const MEMORY: usize = 256_000_000;
const CHUNK: usize = 8192;
static NEXT: AtomicU64 = AtomicU64::new(1);
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Descriptor {
    pub id: String,
    pub frames: usize,
    pub channels: usize,
    pub sample_rate: usize,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Header {
    snapshot: String,
    source: usize,
    offset: usize,
    frames: usize,
}
struct Lease {
    bytes: usize,
    budget: Arc<AtomicUsize>,
}
impl Drop for Lease {
    fn drop(&mut self) {
        self.budget.fetch_sub(self.bytes, Ordering::AcqRel);
    }
}
struct Upload {
    descriptor: Descriptor,
    pcm: Vec<Stereo>,
    received: usize,
}
pub struct Snapshot {
    pub project: Value,
    pub sources: HashMap<String, Source>,
    _lease: Arc<Lease>,
}
struct Entry {
    owner: String,
    project: Option<Value>,
    uploads: Vec<Upload>,
    ready: Option<Arc<Snapshot>>,
    lease: Option<Arc<Lease>>,
}
#[derive(Default)]
struct State {
    entries: HashMap<String, Entry>,
    closed: bool,
    revoked: HashSet<String>,
}
#[derive(Clone, Default)]
pub struct Snapshots {
    state: Arc<Mutex<State>>,
    budget: Arc<AtomicUsize>,
}
impl Snapshots {
    pub fn begin(
        &self,
        owner: &str,
        project: Value,
        descriptors: Vec<Descriptor>,
    ) -> Result<String> {
        if owner.is_empty()
            || !project.is_object()
            || project.to_string().len() > 4_000_000
            || project["sampleRate"] != 48000
            || descriptors.len() > 256
        {
            return Err("Invalid native snapshot metadata".into());
        }
        let mut ids = HashSet::new();
        let mut bytes = 0usize;
        for d in &descriptors {
            if d.id.is_empty()
                || d.id.len() > 128
                || !ids.insert(&d.id)
                || d.sample_rate != 48000
                || !(1..=2).contains(&d.channels)
                || d.frames == 0
            {
                return Err("Invalid native source descriptor".into());
            }
            // Account for staging plus the temporary Arc conversion copy at finalization.
            bytes = bytes
                .checked_add(d.frames.checked_mul(16).ok_or("Native source too large")?)
                .ok_or("Native source budget overflow")?;
        }
        let mut state = self
            .state
            .lock()
            .map_err(|_| "Native snapshot registry unavailable")?;
        if state.closed || state.revoked.contains(owner) || state.entries.len() >= 2 {
            return Err("Native snapshot limit reached".into());
        }
        loop {
            let used = self.budget.load(Ordering::Acquire);
            let next = used
                .checked_add(bytes)
                .filter(|total| *total <= MEMORY)
                .ok_or("Native snapshot memory limit reached")?;
            if self
                .budget
                .compare_exchange_weak(used, next, Ordering::AcqRel, Ordering::Acquire)
                .is_ok()
            {
                break;
            }
        }
        let lease = Arc::new(Lease {
            bytes,
            budget: self.budget.clone(),
        });
        let id = format!(
            "snapshot-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        );
        let uploads = descriptors
            .into_iter()
            .map(|descriptor| Upload {
                pcm: vec![[0.; 2]; descriptor.frames],
                descriptor,
                received: 0,
            })
            .collect();
        state.entries.insert(
            id.clone(),
            Entry {
                owner: owner.into(),
                project: Some(project),
                uploads,
                ready: None,
                lease: Some(lease),
            },
        );
        Ok(id)
    }
    pub fn write(&self, owner: &str, packet: &[u8]) -> Result<()> {
        if packet.len() < 8 || packet.len() > 8 + 4096 + CHUNK * 8 || &packet[..4] != b"CPS1" {
            return Err("Invalid native PCM packet".into());
        }
        let json_len = u32::from_le_bytes(packet[4..8].try_into().unwrap()) as usize;
        if json_len == 0 || json_len > 4096 || 8 + json_len > packet.len() {
            return Err("Invalid native PCM header".into());
        }
        let header: Header = serde_json::from_slice(&packet[8..8 + json_len])
            .map_err(|_| "Invalid native PCM header")?;
        if header.frames == 0 || header.frames > CHUNK {
            return Err("Invalid native PCM frame count".into());
        }
        let mut state = self
            .state
            .lock()
            .map_err(|_| "Native snapshot registry unavailable")?;
        let entry = state
            .entries
            .get_mut(&header.snapshot)
            .filter(|entry| entry.owner == owner)
            .ok_or("Native snapshot unavailable")?;
        if entry.ready.is_some() {
            return Err("Native snapshot already sealed".into());
        }
        let upload = entry
            .uploads
            .get_mut(header.source)
            .ok_or("Invalid native source index")?;
        let pcm = &packet[8 + json_len..];
        if header.offset != upload.received
            || header.frames > upload.descriptor.frames.saturating_sub(upload.received)
            || pcm.len() != header.frames * upload.descriptor.channels * 4
        {
            return Err("Native PCM chunk is out of order or has wrong size".into());
        }
        if pcm
            .chunks_exact(4)
            .any(|v| !f32::from_le_bytes(v.try_into().unwrap()).is_finite())
        {
            return Err("Non-finite native source PCM".into());
        }
        for channel in 0..upload.descriptor.channels {
            for frame in 0..header.frames {
                let offset = (channel * header.frames + frame) * 4;
                let value = f32::from_le_bytes(pcm[offset..offset + 4].try_into().unwrap());
                upload.pcm[header.offset + frame][channel] = value;
                if upload.descriptor.channels == 1 {
                    upload.pcm[header.offset + frame][1] = value;
                }
            }
        }
        upload.received += header.frames;
        Ok(())
    }
    pub fn seal(&self, owner: &str, id: &str) -> Result<()> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "Native snapshot registry unavailable")?;
        let entry = state
            .entries
            .get_mut(id)
            .filter(|entry| entry.owner == owner)
            .ok_or("Native snapshot unavailable")?;
        if entry.ready.is_some() {
            return Ok(());
        }
        if entry
            .uploads
            .iter()
            .any(|upload| upload.received != upload.descriptor.frames)
        {
            return Err("Native snapshot PCM incomplete".into());
        }
        let sources = std::mem::take(&mut entry.uploads)
            .into_iter()
            .map(|u| {
                (
                    u.descriptor.id,
                    Source::uploaded(u.pcm, u.descriptor.channels == 1),
                )
            })
            .collect();
        entry.ready = Some(Arc::new(Snapshot {
            project: entry.project.take().unwrap(),
            sources,
            _lease: entry.lease.take().unwrap(),
        }));
        Ok(())
    }
    pub fn get(&self, owner: &str, id: &str) -> Result<Arc<Snapshot>> {
        self.state
            .lock()
            .map_err(|_| "Native snapshot registry unavailable")?
            .entries
            .get(id)
            .filter(|e| e.owner == owner)
            .and_then(|e| e.ready.clone())
            .ok_or("Native snapshot is unavailable or incomplete".into())
    }
    pub fn close(&self, owner: &str, id: &str) -> Result<()> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "Native snapshot registry unavailable")?;
        if state.entries.get(id).is_some_and(|e| e.owner != owner) {
            return Err("Native snapshot owner mismatch".into());
        }
        state.entries.remove(id);
        Ok(())
    }
    pub fn close_owner(&self, owner: &str) {
        let mut state = self.state.lock().unwrap();
        state.revoked.insert(owner.into());
        state.entries.retain(|_, e| e.owner != owner);
    }
    pub fn shutdown(&self) {
        let mut state = self.state.lock().unwrap();
        state.closed = true;
        state.entries.clear();
    }
    pub fn counts(&self) -> (usize, usize) {
        (
            self.state.lock().unwrap().entries.len(),
            self.budget.load(Ordering::Acquire),
        )
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn descriptor() -> Descriptor {
        Descriptor {
            id: "s".into(),
            frames: 2,
            channels: 1,
            sample_rate: 48000,
        }
    }
    fn packet(id: &str, offset: usize, pcm: &[f32]) -> Vec<u8> {
        let header =
            json!({"snapshot":id,"source":0,"offset":offset,"frames":pcm.len()}).to_string();
        let mut bytes = b"CPS1".to_vec();
        bytes.extend((header.len() as u32).to_le_bytes());
        bytes.extend(header.as_bytes());
        for sample in pcm {
            bytes.extend(sample.to_le_bytes());
        }
        bytes
    }
    #[test]
    fn ordered_sealed_owned_and_leased() {
        let registry = Snapshots::default();
        let id = registry
            .begin("a", json!({"sampleRate":48000}), vec![descriptor()])
            .unwrap();
        assert!(registry.seal("a", &id).is_err());
        assert!(registry.write("b", &packet(&id, 0, &[1.])).is_err());
        assert!(registry.close("b", &id).is_err());
        registry.write("a", &packet(&id, 0, &[1.])).unwrap();
        assert!(registry.write("a", &packet(&id, 0, &[2.])).is_err());
        assert!(registry.write("a", &packet(&id, 1, &[f32::NAN])).is_err());
        registry.write("a", &packet(&id, 1, &[-0.5])).unwrap();
        registry.seal("a", &id).unwrap();
        assert!(registry.write("a", &packet(&id, 0, &[0.])).is_err());
        assert!(registry.get("b", &id).is_err());
        let snapshot = registry.get("a", &id).unwrap();
        registry.close("a", &id).unwrap();
        assert_eq!(registry.counts(), (0, 32));
        drop(snapshot);
        assert_eq!(registry.counts(), (0, 0));
    }
    #[test]
    fn budgets_owner_cleanup_shutdown_and_malformed_packets() {
        let registry = Snapshots::default();
        let mut huge = descriptor();
        huge.frames = usize::MAX;
        assert!(registry
            .begin("a", json!({"sampleRate":48000}), vec![huge])
            .is_err());
        assert_eq!(registry.counts(), (0, 0));
        let a = registry
            .begin("a", json!({"sampleRate":48000}), vec![descriptor()])
            .unwrap();
        let _b = registry
            .begin("b", json!({"sampleRate":48000}), vec![descriptor()])
            .unwrap();
        assert!(registry
            .begin("c", json!({"sampleRate":48000}), vec![])
            .is_err());
        assert!(registry.write("a", b"CPS1").is_err());
        let mut bad = packet(&a, 0, &[1.]);
        bad.push(0);
        assert!(registry.write("a", &bad).is_err());
        registry.close_owner("a");
        assert!(registry
            .begin("a", json!({"sampleRate":48000}), vec![])
            .is_err());
        assert_eq!(registry.counts(), (1, 32));
        registry.shutdown();
        assert_eq!(registry.counts(), (0, 0));
        assert!(registry
            .begin("a", json!({"sampleRate":48000}), vec![])
            .is_err());
    }
}
