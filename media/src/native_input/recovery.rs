//! Durable output timing ledger and conservative, all-input crash recovery.
//! Managed directories only. No disk I/O, locks or recovery on audio callbacks.
use super::{
    recording,
    session::group::{Clip, Manifest},
    timing::{Intent, Snapshot},
};
use crate::Result;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, SyncSender},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
};
const PLAN: &str = "recovery-plan.json";
const CHECKPOINT: &str = "output-checkpoint.json";
const RECEIPT: &str = "recovered.json";
const DESTINATION: &str = "recovered-v1";
const MAX_JSON: u64 = 512 * 1024;
fn io<T>(value: std::io::Result<T>) -> Result<T> {
    value.map_err(|e| e.to_string())
}
fn sync(path: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        io(io(File::open(path))?.sync_all())
    }
    #[cfg(not(unix))]
    {
        let _ = path;
        Ok(())
    }
}
fn directory(path: &Path) -> Result<()> {
    if !io(fs::symlink_metadata(path))?.is_dir() {
        return Err("Recovery directory is not a regular directory".into());
    }
    Ok(())
}
fn named(name: &str, prefix: &str) -> bool {
    name.starts_with(prefix)
        && name.len() > prefix.len()
        && name.len() <= 128
        && name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}
pub fn managed_group(root: &Path, id: &str) -> Result<PathBuf> {
    if !named(id, "native-group-") {
        return Err("Invalid managed recording group".into());
    }
    directory(root)?;
    let path = root.join(id);
    directory(&path)?;
    Ok(path)
}
fn read<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    let meta = io(fs::symlink_metadata(path))?;
    if !meta.is_file() || meta.len() > MAX_JSON {
        return Err("Invalid recovery metadata file".into());
    }
    let mut bytes = Vec::new();
    io(File::open(path))?
        .take(MAX_JSON + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_JSON {
        return Err("Recovery metadata exceeds limit".into());
    }
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}
fn write(path: &Path, value: &impl Serialize, replace: bool) -> Result<()> {
    let bytes = serde_json::to_vec(value).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_JSON {
        return Err("Recovery metadata exceeds limit".into());
    }
    let parent = path.parent().unwrap();
    let mut file = io(tempfile::NamedTempFile::new_in(parent))?;
    io(file.write_all(&bytes))?;
    io(file.as_file().sync_all())?;
    if replace {
        file.persist(path).map_err(|e| e.to_string())?;
    } else {
        file.persist_noclobber(path).map_err(|e| e.to_string())?;
    }
    sync(parent)
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Plan {
    pub version: u32,
    pub group: String,
    pub intent: Intent,
    pub inputs: Vec<(String, String)>,
}
impl Plan {
    fn validate(&self) -> Result<()> {
        if self.version != 1 || !named(&self.group, "native-group-") {
            return Err("Invalid recovery plan".into());
        }
        self.intent.validate(
            &self
                .inputs
                .iter()
                .map(|(id, _)| id.as_str())
                .collect::<Vec<_>>(),
        )?;
        let mut names = HashSet::new();
        if self
            .inputs
            .iter()
            .any(|(_, name)| !named(name, "native-take-") || !names.insert(name))
        {
            return Err("Invalid recovery input names".into());
        }
        Ok(())
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Checkpoint {
    pub version: u32,
    pub plan: Plan,
    pub output: Snapshot,
}
impl Checkpoint {
    fn validate(&self) -> Result<()> {
        self.plan.validate()?;
        self.output.clock()?;
        if self.version != 1
            || (self.output.numerator, self.output.denominator)
                != (
                    self.plan.intent.context.numerator,
                    self.plan.intent.context.denominator,
                )
        {
            return Err("Invalid recovery output timebase".into());
        }
        Ok(())
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    checkpoint: Checkpoint,
    checksum: String,
}
fn checksum(checkpoint: &Checkpoint) -> Result<String> {
    let bytes = serde_json::to_vec(checkpoint).map_err(|e| e.to_string())?;
    Ok(format!(
        "{:016x}",
        bytes
            .iter()
            .fold(14695981039346656037u64, |hash, byte| (hash ^ *byte as u64)
                .wrapping_mul(1099511628211))
    ))
}
fn load_checkpoint(group: &Path) -> Result<Checkpoint> {
    directory(group)?;
    let saved: Plan = read(&group.join(PLAN))?;
    saved.validate()?;
    let envelope: Envelope = read(&group.join(CHECKPOINT))?;
    let checkpoint = envelope.checkpoint;
    checkpoint.validate()?;
    if checksum(&checkpoint)? != envelope.checksum
        || checkpoint.plan != saved
        || group.file_name().and_then(|s| s.to_str()) != Some(saved.group.as_str())
    {
        return Err("Recovery ledger mismatch".into());
    }
    Ok(checkpoint)
}
/// One disk worker and a single latest-value slot. A slow disk never queues
/// unbounded snapshots or blocks the recording actor on fsync.
pub struct Ledger {
    plan: Plan,
    last: Option<Snapshot>,
    pending: Arc<Mutex<Option<Snapshot>>>,
    error: Arc<Mutex<Option<String>>>,
    wake: Option<SyncSender<()>>,
    worker: Option<JoinHandle<()>>,
}
impl Ledger {
    pub fn create(group: &Path, intent: Intent, inputs: Vec<(String, String)>) -> Result<Self> {
        directory(group)?;
        let plan = Plan {
            version: 1,
            group: group
                .file_name()
                .and_then(|s| s.to_str())
                .ok_or("Invalid recovery group")?
                .into(),
            intent,
            inputs,
        };
        plan.validate()?;
        for (_, name) in &plan.inputs {
            directory(&group.join(name))?;
        }
        write(&group.join(PLAN), &plan, false)?;
        let pending = Arc::new(Mutex::new(None));
        let error = Arc::new(Mutex::new(None));
        let (wake, rx) = mpsc::sync_channel(1);
        let (slot, failure, saved, path) = (
            pending.clone(),
            error.clone(),
            plan.clone(),
            group.join(CHECKPOINT),
        );
        let worker = thread::Builder::new()
            .name("recording-ledger".into())
            .spawn(move || {
                // Drain the last value even when the owner closes the channel.
                loop {
                    let open = rx.recv().is_ok();
                    let next = slot.lock().unwrap().take();
                    if let Some(output) = next {
                        let checkpoint = Checkpoint {
                            version: 1,
                            plan: saved.clone(),
                            output,
                        };
                        let result = checksum(&checkpoint).and_then(|checksum| {
                            write(
                                &path,
                                &Envelope {
                                    checkpoint,
                                    checksum,
                                },
                                true,
                            )
                        });
                        if let Err(reason) = result {
                            *failure.lock().unwrap() = Some(reason);
                            break;
                        }
                    }
                    if !open {
                        break;
                    }
                }
            })
            .map_err(|e| e.to_string())?;
        Ok(Self {
            plan,
            last: None,
            pending,
            error,
            wake: Some(wake),
            worker: Some(worker),
        })
    }
    pub fn check(&self) -> Result<()> {
        if let Some(reason) = self.error.lock().unwrap().as_ref() {
            Err(format!("Recording ledger failed: {reason}"))
        } else {
            Ok(())
        }
    }
    pub fn checkpoint(&mut self, output: Snapshot) -> Result<()> {
        self.check()?;
        let next = Checkpoint {
            version: 1,
            plan: self.plan.clone(),
            output: output.clone(),
        };
        next.validate()?;
        if let Some(last) = &self.last {
            let mut fixed = output.clone();
            fixed.end_queued_frame = last.end_queued_frame;
            if fixed != *last || output.end_queued_frame < last.end_queued_frame {
                return Err("Recovery output clock changed or regressed".into());
            }
        }
        self.last = Some(output.clone());
        *self.pending.lock().unwrap() = Some(output);
        match self.wake.as_ref().unwrap().try_send(()) {
            Ok(()) | Err(mpsc::TrySendError::Full(_)) => Ok(()),
            Err(_) => Err("Recording ledger worker stopped".into()),
        }
    }
    pub fn finish(mut self) -> Result<()> {
        self.join();
        self.check()
    }
    fn join(&mut self) {
        self.wake.take();
        if let Some(worker) = self.worker.take() {
            if worker.join().is_err() {
                *self.error.lock().unwrap() = Some("Ledger worker panicked".into());
            }
        }
    }
}
impl Drop for Ledger {
    fn drop(&mut self) {
        self.join();
    }
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub group: String,
    pub project_id: String,
    pub tracks: Vec<String>,
    pub output_end_frame: i64,
    pub recovered: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Discovery {
    pub candidates: Vec<Candidate>,
    pub scanned: usize,
    pub rejected: usize,
    pub truncated: bool,
}
/// Metadata only, <=512 directory entries and <=64 candidates. A candidate is
/// not permission to import: recover still verifies all clocks and PCM.
pub fn discover(root: &Path) -> Result<Discovery> {
    let mut result = Discovery {
        candidates: Vec::new(),
        scanned: 0,
        rejected: 0,
        truncated: false,
    };
    if !root.try_exists().map_err(|e| e.to_string())? {
        return Ok(result);
    }
    directory(root)?;
    for entry in io(fs::read_dir(root))? {
        if result.scanned >= 512 || result.candidates.len() >= 64 {
            result.truncated = true;
            break;
        }
        result.scanned += 1;
        let entry = io(entry)?;
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        if !named(&name, "native-group-") {
            continue;
        }
        let path = entry.path();
        if path.join("completed.json").symlink_metadata().is_ok() {
            continue;
        }
        match load_checkpoint(&path) {
            Ok(c) => result.candidates.push(Candidate {
                group: name,
                project_id: c.plan.intent.project_id,
                tracks: c.plan.inputs.into_iter().map(|(id, _)| id).collect(),
                output_end_frame: c.output.end_queued_frame,
                recovered: path.join(DESTINATION).try_exists().unwrap_or(false),
            }),
            Err(_) => result.rejected += 1,
        }
    }
    result.candidates.sort_by(|a, b| a.group.cmp(&b.group));
    Ok(result)
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Recovered {
    pub version: u32,
    pub incomplete: bool,
    pub checkpoint: Checkpoint,
    pub manifest: Manifest,
    pub reasons: Vec<Option<String>>,
}
/// Fresh derived copies only. No completed.json marker: interrupted recording is
/// always labelled incomplete, even with independently verified aligned placement.
pub fn recover(root: &Path, id: &str, cancel: &AtomicBool) -> Result<(PathBuf, Recovered)> {
    let source = managed_group(root, id)?;
    if source.join("completed.json").symlink_metadata().is_ok() {
        return Err("Recording already has a completed manifest; reconcile it instead".into());
    }
    let checkpoint = load_checkpoint(&source)?;
    let destination = source.join(DESTINATION);
    if destination.symlink_metadata().is_ok() {
        return load_recovered(&source);
    }
    let staged = io(tempfile::Builder::new()
        .prefix(".native-recovery-")
        .tempdir_in(&source))?;
    let (mut clips, mut reasons, mut frames) = (Vec::new(), Vec::new(), 0u64);
    for (track_id, name) in &checkpoint.plan.inputs {
        if cancel.load(Ordering::Acquire) {
            return Err("Recording recovery cancelled".into());
        }
        let input = source.join(name);
        directory(&input)?;
        let output = staged.path().join(name);
        io(fs::create_dir(&output))?;
        let take = recording::recover_aligned(
            &input,
            &output,
            cancel,
            checkpoint.output.clock()?,
            checkpoint.output.end_queued_frame,
            checkpoint.plan.intent.max_drift_frames,
        )?;
        if take.info.context["recordingGroup"] != id || take.info.context["trackId"] != *track_id {
            return Err("Recovery source/group mismatch".into());
        }
        frames += take.info.frames;
        if frames > 32_000_000 {
            return Err("Recovery group budget exceeded".into());
        }
        clips.push(Clip {
            track_id: track_id.clone(),
            audio: format!("{name}/take.wav"),
            info: take.info,
        });
        reasons.push(take.stopped_reason);
    }
    let timing = super::timing::build(
        staged.path(),
        &clips,
        &checkpoint.plan.intent,
        &checkpoint.output,
    )?;
    let manifest = Manifest {
        version: 2,
        clips,
        timing: Some(timing),
    };
    let recovered = Recovered {
        version: 1,
        incomplete: true,
        checkpoint,
        manifest,
        reasons,
    };
    write(&staged.path().join(RECEIPT), &recovered, false)?;
    if cancel.load(Ordering::Acquire) {
        return Err("Recording recovery cancelled".into());
    }
    io(fs::rename(staged.path(), &destination))?;
    sync(&source)?;
    Ok((destination, recovered))
}
pub fn load_recovered(source: &Path) -> Result<(PathBuf, Recovered)> {
    let checkpoint = load_checkpoint(source)?;
    let path = source.join(DESTINATION);
    directory(&path)?;
    let recovered: Recovered = read(&path.join(RECEIPT))?;
    if recovered.version != 1
        || !recovered.incomplete
        || recovered.checkpoint != checkpoint
        || recovered.manifest.version != 2
        || recovered.reasons.len() != checkpoint.plan.inputs.len()
    {
        return Err("Invalid recovered recording receipt".into());
    }
    let timing = recovered
        .manifest
        .timing
        .as_ref()
        .ok_or("Recovered timing missing")?;
    if timing.intent != checkpoint.plan.intent || timing.output != checkpoint.output {
        return Err("Recovered clock mismatch".into());
    }
    if recovered.manifest.clips.len() != checkpoint.plan.inputs.len() {
        return Err("Recovered input count mismatch".into());
    }
    for (clip, (id, name)) in recovered.manifest.clips.iter().zip(&checkpoint.plan.inputs) {
        if clip.track_id != *id || clip.audio != format!("{name}/take.wav") {
            return Err("Recovered input mapping mismatch".into());
        }
        directory(&path.join(name))?;
    }
    super::timing::verify(&path, &recovered.manifest.clips, timing)?;
    Ok((path, recovered))
}
#[cfg(test)]
mod tests;
