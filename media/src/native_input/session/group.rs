//! All-or-none native recording group result. Individual files are retained;
//! only a complete manifest makes them eligible for one project transaction.
use super::{
    cue::{CueConfig, StreamBudget, MAX_GROUP_INSERTS},
    Capture, Config, Outcome, Report, Session, MAX_TAKE_FRAMES,
};
use crate::native_input::verification::Verification;
use crate::{
    native_input::{plugins::PluginConfig, recording::TakeInfo, CueOutput, InputWriter},
    Result,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{Read, Seek, Write},
    path::{Component, Path, PathBuf},
    time::Duration,
};

pub const MAX_INPUTS: usize = 16;
const MANIFEST: &str = "completed.json";
const MAX_MANIFEST_BYTES: u64 = 512 * 1024;
pub struct CueSpec {
    pub plugins: Vec<PluginConfig>,
    pub startup_timeout: Duration,
}
pub struct Input {
    pub track_id: String,
    pub recording: Config,
    pub cue: Option<CueSpec>,
}
#[derive(Debug)]
pub struct InputOutcome {
    pub track_id: String,
    pub outcome: Outcome,
}
#[derive(Debug)]
pub struct StartError {
    pub reason: String,
    pub directory: Option<PathBuf>,
    pub inputs: Vec<InputOutcome>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Clip {
    pub track_id: String,
    /// Relative to the group directory. No external or traversing paths.
    pub audio: String,
    pub info: TakeInfo,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub version: u32,
    pub clips: Vec<Clip>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timing: Option<crate::native_input::timing::Timing>,
}
#[derive(Debug)]
pub enum GroupOutcome {
    Complete {
        directory: PathBuf,
        manifest: Manifest,
    },
    Incomplete {
        directory: PathBuf,
        reason: String,
        inputs: Vec<InputOutcome>,
    },
}
fn io<T>(value: std::io::Result<T>) -> Result<T> {
    value.map_err(|e| e.to_string())
}
fn sync_directory(path: &Path) -> Result<()> {
    #[cfg(unix)]
    io(File::open(path).and_then(|file| file.sync_all()))?;
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}
fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 128 && !id.chars().any(char::is_control)
}
fn validate(inputs: &[Input]) -> Result<()> {
    if inputs.is_empty() || inputs.len() > MAX_INPUTS {
        return Err("Invalid recording group input count".into());
    }
    let mut ids = HashSet::new();
    let mut frames = 0u64;
    let mut inserts = 0;
    for input in inputs {
        let config = &input.recording;
        if !valid_id(&input.track_id)
            || !ids.insert(&input.track_id)
            || !(1..=2).contains(&config.channels)
            || config.max_frames == 0
            || config.max_frames > MAX_TAKE_FRAMES
            || config.callback_timeout.is_zero()
            || !config.context.is_object()
            || config.context.to_string().len() > 16000
        {
            return Err("Invalid recording group track configuration".into());
        }
        frames = frames
            .checked_add(config.max_frames)
            .ok_or("Recording group frame budget overflow")?;
        if let Some(cue) = &input.cue {
            if cue.plugins.len() > 2
                || cue.startup_timeout.is_zero()
                || cue.plugins.iter().any(|plugin| {
                    plugin.id.is_empty()
                        || plugin.state.len() > 1_500_000
                        || !plugin.parameters.is_object()
                        || plugin.parameters.to_string().len() > 64_000
                })
            {
                return Err("Invalid recording group cue configuration".into());
            }
            inserts += cue.plugins.len();
        }
    }
    if frames > MAX_TAKE_FRAMES || inserts > MAX_GROUP_INSERTS {
        return Err("Recording group source or cue budget exceeded".into());
    }
    Ok(())
}
fn create(root: &Path, inputs: &[Input]) -> Result<PathBuf> {
    io(fs::create_dir_all(root))?;
    let folder = io(tempfile::Builder::new()
        .prefix("native-group-")
        .tempdir_in(root))?;
    let mut plan = io(File::create(folder.path().join("plan.json")))?;
    let bytes = serde_json::to_vec(&serde_json::json!({"version":1,"tracks":inputs.iter().map(|i| &i.track_id).collect::<Vec<_>>()})).map_err(|e| e.to_string())?;
    io(plan.write_all(&bytes))?;
    io(plan.sync_all())?;
    sync_directory(folder.path())?;
    let path = folder.keep();
    sync_directory(root)?;
    Ok(path)
}
fn publish(directory: &Path, manifest: &Manifest) -> Result<()> {
    let bytes = serde_json::to_vec(manifest).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_MANIFEST_BYTES {
        return Err("Recording group manifest too large".into());
    }
    let mut staging = io(tempfile::NamedTempFile::new_in(directory))?;
    io(staging.write_all(&bytes))?;
    io(staging.as_file().sync_all())?;
    io(fs::hard_link(staging.path(), directory.join(MANIFEST)))?; // Atomic, no overwrite.
                                                                  // A sync failure AFTER the link leaves a fully formed, visible manifest with
                                                                  // uncertain durability. Reconcile through load_completed; never delete takes.
    sync_directory(directory)
        .map_err(|e| format!("Group manifest visible but directory sync failed: {e}"))
}

pub struct Group<C: Capture> {
    directory: PathBuf,
    inputs: Vec<(String, Session<C>)>,
    outcome: Option<GroupOutcome>,
}
/// A whole group's files and cue racks are ready before any capture opens.
/// The output owner can establish/prime its clock before calling start().
pub struct Prepared<C: Capture> {
    group: Option<Group<C>>,
    writers: Vec<InputWriter>,
}
impl<C: Capture> Prepared<C> {
    /// Immutable app-owned take names for a crash-recovery plan, before capture.
    pub fn recovery_inputs(&self) -> Vec<(String, String)> {
        self.group
            .as_ref()
            .unwrap()
            .inputs
            .iter()
            .map(|(id, session)| {
                (
                    id.clone(),
                    session
                        .recovery_directory()
                        .file_name()
                        .unwrap()
                        .to_str()
                        .unwrap()
                        .to_owned(),
                )
            })
            .collect()
    }
    pub fn directory(&self) -> &Path {
        self.group.as_ref().unwrap().directory()
    }
    pub fn start(
        mut self,
        mut open: impl FnMut(&str, InputWriter) -> Result<C>,
    ) -> std::result::Result<Group<C>, StartError> {
        let mut group = self.group.take().unwrap();
        let failure = group.inputs.iter_mut().find_map(|(id, session)| {
            session
                .check_prepared()
                .err()
                .map(|reason| format!("Input {id}: {reason}"))
        });
        if let Some(reason) = failure {
            drop(std::mem::take(&mut self.writers));
            return Err(Self::failure(group, reason));
        }
        let mut failure = None;
        for ((id, session), writer) in group
            .inputs
            .iter_mut()
            .zip(std::mem::take(&mut self.writers))
        {
            match open(id, writer) {
                Ok(capture) => {
                    session.capture = Some(capture);
                    session.progress_at = std::time::Instant::now();
                }
                Err(reason) => {
                    failure = Some(format!("Input {id} failed to start: {reason}"));
                    break;
                }
            }
        }
        if let Some(reason) = failure {
            Err(Self::failure(group, reason))
        } else {
            Ok(group)
        }
    }
    /// Cancel an unopened group and its external output/backing resources before
    /// joining files. No complete manifest is published.
    pub fn cancel_with(
        mut self,
        reason: String,
        cleanup: impl FnOnce() -> Result<()>,
    ) -> GroupOutcome {
        drop(std::mem::take(&mut self.writers));
        self.group.take().unwrap().interrupt_with(reason, cleanup)
    }
    fn failure(mut group: Group<C>, reason: String) -> StartError {
        group.abort(reason);
        let GroupOutcome::Incomplete {
            directory,
            reason,
            inputs,
        } = group.outcome.take().unwrap()
        else {
            unreachable!()
        };
        StartError {
            reason,
            directory: Some(directory),
            inputs,
        }
    }
}
impl<C: Capture> Drop for Prepared<C> {
    fn drop(&mut self) {
        drop(std::mem::take(&mut self.writers));
        drop(self.group.take());
    }
}
impl<C: Capture> Group<C> {
    /// Validates the whole group before creating files/opening inputs. The cue
    /// budget is private to this group, so preflight admission cannot race another
    /// group. Opens sequentially; this does NOT establish synchronized clocks.
    pub fn start(
        root: &Path,
        inputs: Vec<Input>,
        open: impl FnMut(&str, InputWriter) -> Result<C>,
    ) -> std::result::Result<(Self, Vec<(String, CueOutput)>), StartError> {
        let (prepared, outputs) = Self::prepare(root, inputs)?;
        Ok((prepared.start(open)?, outputs))
    }
    /// All file and helper preparation precedes capture; opening inputs remains
    /// sequential and does not imply simultaneous physical device clocks.
    pub fn prepare(
        root: &Path,
        inputs: Vec<Input>,
    ) -> std::result::Result<(Prepared<C>, Vec<(String, CueOutput)>), StartError> {
        Self::prepare_cancellable(root, inputs, &|| false)
    }
    /// All-or-none preparation with a control-thread cancellation predicate.
    pub fn prepare_cancellable(
        root: &Path,
        inputs: Vec<Input>,
        cancelled: &dyn Fn() -> bool,
    ) -> std::result::Result<(Prepared<C>, Vec<(String, CueOutput)>), StartError> {
        let error = |reason| StartError {
            reason,
            directory: None,
            inputs: Vec::new(),
        };
        validate(&inputs).map_err(error)?;
        if cancelled() {
            return Err(error("Recording preparation cancelled".into()));
        }
        let directory = create(root, &inputs).map_err(error)?;
        let mut group = Self {
            directory,
            inputs: Vec::new(),
            outcome: None,
        };
        let budget = StreamBudget::default();
        let mut outputs = Vec::new();
        let mut writers = Vec::new();
        for input in inputs {
            let id = input.track_id;
            let mut config = input.recording;
            config.context = serde_json::json!({"recordingGroup": group.directory.file_name().unwrap().to_string_lossy(), "trackId":id, "source":config.context});
            let cue = input.cue.map(|cue| CueConfig {
                plugins: cue.plugins,
                budget: budget.clone(),
                startup_timeout: cue.startup_timeout,
            });
            let result = Session::prepare_cancellable(&group.directory, config, cue, cancelled);
            match result {
                Ok((mut prepared, output)) => {
                    if let Some(output) = output {
                        outputs.push((id.clone(), output));
                    }
                    writers.push(prepared.writer.take().unwrap());
                    group.inputs.push((id, prepared.session.take().unwrap()));
                }
                Err(failure) => {
                    drop(writers);
                    group.abort(format!("Input {id} failed to start: {}", failure.reason));
                    let GroupOutcome::Incomplete {
                        directory,
                        reason,
                        mut inputs,
                    } = group.outcome.take().unwrap()
                    else {
                        unreachable!()
                    };
                    if let Some(recovery_directory) = failure.recovery_directory {
                        inputs.push(InputOutcome {
                            track_id: id,
                            outcome: Outcome::Incomplete {
                                recovery_directory,
                                reason: failure.reason,
                            },
                        });
                    }
                    return Err(StartError {
                        reason,
                        directory: Some(directory),
                        inputs,
                    });
                }
            }
        }
        Ok((
            Prepared {
                group: Some(group),
                writers,
            },
            outputs,
        ))
    }
    pub fn directory(&self) -> &Path {
        &self.directory
    }
    pub fn outcome(&self) -> Option<&GroupOutcome> {
        self.outcome.as_ref()
    }
    pub fn poll(&mut self) -> Result<Vec<(String, Report)>> {
        let result = self.check();
        if let Err(reason) = &result {
            self.abort(reason.clone());
        }
        result
    }
    // Whole-run owner supplies output/backing cleanup between quiesce and joins.
    pub(crate) fn check(&mut self) -> Result<Vec<(String, Report)>> {
        if self.outcome.is_some() {
            return Err("Recording group has stopped".into());
        }
        let mut reports = Vec::new();
        let mut failure = None;
        let now = std::time::Instant::now();
        for (id, session) in &mut self.inputs {
            match session.check_at(now) {
                Ok(report) => reports.push((id.clone(), report)),
                Err(reason) => {
                    failure = Some(format!("Input {id}: {reason}"));
                    break;
                }
            }
        }
        if let Some(reason) = failure {
            Err(reason)
        } else {
            Ok(reports)
        }
    }
    fn abort(&mut self, reason: String) {
        self.abort_with(reason, || Ok(()));
    }
    fn abort_with(&mut self, mut reason: String, cleanup: impl FnOnce() -> Result<()>) {
        if let Some(outcome) = &mut self.outcome {
            if let Err(error) = cleanup() {
                if let GroupOutcome::Incomplete { reason, .. } = outcome {
                    reason.push_str(&format!("; cleanup failed: {error}"));
                }
            }
            return;
        }
        // Stop ALL capture callbacks before external output/helper cleanup, then
        // join cue/file workers. A backing failure must never publish a group.
        for (_, session) in &mut self.inputs {
            session.dry.cancel();
            drop(session.capture.take());
        }
        if let Err(error) = cleanup() {
            reason.push_str(&format!("; cleanup failed: {error}"));
        }
        let inputs = std::mem::take(&mut self.inputs)
            .into_iter()
            .map(|(track_id, session)| InputOutcome {
                track_id,
                outcome: session.cancel(),
            })
            .collect();
        self.outcome = Some(GroupOutcome::Incomplete {
            directory: self.directory.clone(),
            reason,
            inputs,
        });
    }
    pub fn interrupt_with(
        mut self,
        reason: String,
        cleanup: impl FnOnce() -> Result<()>,
    ) -> GroupOutcome {
        self.abort_with(reason, cleanup);
        self.outcome.take().unwrap()
    }
    pub fn cancel(mut self) -> GroupOutcome {
        self.abort("Recording group cancelled".into());
        self.outcome.take().unwrap()
    }
    pub fn stop(self) -> GroupOutcome {
        self.stop_with(|| Ok(()))
    }
    /// Quiesce every capture, finish output/backing, THEN join files and publish.
    /// Failure of external finalization makes every take incomplete.
    pub fn stop_with(self, cleanup: impl FnOnce() -> Result<()>) -> GroupOutcome {
        self.finish_with(cleanup, |_, _| Ok(None))
    }
    /// Verify all input clocks and derive placements after files finish, BEFORE
    /// publishing the group marker. Untimed v1 groups remain backward-compatible.
    pub fn stop_timed(
        self,
        intent: crate::native_input::timing::Intent,
        cleanup: impl FnOnce() -> Result<crate::native_input::timing::Snapshot>,
    ) -> GroupOutcome {
        let snapshot = std::cell::RefCell::new(None);
        self.finish_with(
            || {
                snapshot.replace(Some(cleanup()?));
                Ok(())
            },
            |directory, clips| {
                let snapshot = snapshot.borrow();
                crate::native_input::timing::build(
                    directory,
                    clips,
                    &intent,
                    snapshot.as_ref().ok_or("Recording output clock missing")?,
                )
                .map(Some)
            },
        )
    }
    fn finish_with(
        mut self,
        cleanup: impl FnOnce() -> Result<()>,
        finalize: impl FnOnce(&Path, &[Clip]) -> Result<Option<crate::native_input::timing::Timing>>,
    ) -> GroupOutcome {
        if let Some(mut outcome) = self.outcome.take() {
            if let Err(error) = cleanup() {
                if let GroupOutcome::Incomplete { reason, .. } = &mut outcome {
                    reason.push_str(&format!("; cleanup failed: {error}"));
                }
            }
            return outcome;
        }
        let stopped = std::mem::take(&mut self.inputs)
            .into_iter()
            .map(|(id, mut session)| {
                let command = session.stop_capture();
                (id, session, command)
            })
            .collect::<Vec<_>>();
        let cleanup_error = cleanup().err();
        let inputs = stopped
            .into_iter()
            .map(|(track_id, mut session, command)| {
                let command = if let Some(reason) = &cleanup_error {
                    session.dry.cancel();
                    Some(super::Command::Abort(format!(
                        "Output/backing finalization failed: {reason}"
                    )))
                } else {
                    command
                };
                if let Some(command) = command {
                    session.join(command);
                }
                InputOutcome {
                    track_id,
                    outcome: session.outcome.take().unwrap(),
                }
            })
            .collect::<Vec<_>>();
        let result = (|| {
            if let Some(reason) = &cleanup_error {
                return Err(format!("Output/backing finalization failed: {reason}"));
            }
            let mut clips = Vec::new();
            for input in &inputs {
                let Outcome::Complete(take) = &input.outcome else {
                    return Err(format!("Input {} is incomplete", input.track_id));
                };
                let audio = take
                    .path
                    .strip_prefix(&self.directory)
                    .map_err(|e| e.to_string())?
                    .to_str()
                    .ok_or("Invalid group audio path")?
                    .to_owned();
                clips.push(Clip {
                    track_id: input.track_id.clone(),
                    audio,
                    info: take.info.clone(),
                });
            }
            let timing = finalize(&self.directory, &clips)?;
            let manifest = Manifest {
                version: if timing.is_some() { 2 } else { 1 },
                clips,
                timing,
            };
            publish(&self.directory, &manifest)?;
            Ok(manifest)
        })();
        match result {
            Ok(manifest) => GroupOutcome::Complete {
                directory: self.directory.clone(),
                manifest,
            },
            Err(reason) => GroupOutcome::Incomplete {
                directory: self.directory.clone(),
                reason,
                inputs,
            },
        }
    }
}
impl<C: Capture> Drop for Group<C> {
    fn drop(&mut self) {
        if !self.inputs.is_empty() {
            self.abort("Recording group owner dropped".into());
        }
    }
}

/// Reconcile a fully committed group after restart. An absent/malformed/partial
/// manifest yields no clips; individual recording prefixes remain recoverable.
/// Assumes an app-owned directory, not an adversarial filesystem security boundary.
pub fn load_completed(directory: &Path) -> Result<Manifest> {
    load_completed_checked(directory, Verification::default())
}
pub fn load_completed_checked(
    directory: &Path,
    verification: Verification<'_>,
) -> Result<Manifest> {
    verification.check()?;
    let path = directory.join(MANIFEST);
    let metadata = io(fs::symlink_metadata(&path))?;
    if !metadata.is_file() || metadata.len() > MAX_MANIFEST_BYTES {
        return Err("Invalid recording group manifest file".into());
    }
    let mut bytes = Vec::new();
    io(File::open(path))?
        .take(MAX_MANIFEST_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_MANIFEST_BYTES {
        return Err("Recording group manifest too large".into());
    }
    let manifest: Manifest = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    if !matches!(
        (manifest.version, manifest.timing.is_some()),
        (1, false) | (2, true)
    ) || manifest.clips.is_empty()
        || manifest.clips.len() > MAX_INPUTS
    {
        return Err("Invalid recording group manifest".into());
    }
    let mut ids = HashSet::new();
    let mut audio_paths = HashSet::new();
    let mut frames = 0u64;
    for clip in &manifest.clips {
        verification.check()?;
        let parts = Path::new(&clip.audio).components().collect::<Vec<_>>();
        let valid_path = parts.len() == 2
            && matches!(parts[0],Component::Normal(name) if name.to_str().is_some_and(|n| n.starts_with("native-take-")))
            && parts[1] == Component::Normal("take.wav".as_ref());
        if !valid_path
            || !valid_id(&clip.track_id)
            || !ids.insert(&clip.track_id)
            || !audio_paths.insert(Path::new(&clip.audio))
            || clip.info.frames == 0
            || clip.info.frames > MAX_TAKE_FRAMES
            || !(1..=2).contains(&clip.info.channels)
            || clip.info.sample_rate != 48000
            || clip
                .info
                .first_input_frame
                .checked_add(clip.info.frames)
                .is_none()
            || !clip.info.context.is_object()
            || clip.info.context.to_string().len() > 16384
        {
            return Err("Invalid recording group clip".into());
        }
        frames += clip.info.frames;
        if frames > MAX_TAKE_FRAMES {
            return Err("Recording group source budget exceeded".into());
        }
        let audio = directory.join(&clip.audio);
        if !io(fs::symlink_metadata(audio.parent().unwrap()))?.is_dir()
            || !io(fs::symlink_metadata(&audio))?.is_file()
        {
            return Err("Group audio is not a regular file".into());
        }
        let reader = hound::WavReader::open(&audio).map_err(|e| e.to_string())?;
        let spec = reader.spec();
        if spec.channels != clip.info.channels
            || spec.sample_rate != 48000
            || spec.bits_per_sample != 32
            || spec.sample_format != hound::SampleFormat::Float
            || reader.duration() as u64 != clip.info.frames
        {
            return Err("Group audio metadata mismatch".into());
        }
        let offset = io(reader.into_inner().stream_position())?;
        if io(fs::metadata(audio))?.len()
            < offset + clip.info.frames * clip.info.channels as u64 * 4
        {
            return Err("Truncated group audio".into());
        }
    }
    if let Some(timing) = &manifest.timing {
        crate::native_input::timing::verify_checked(
            directory,
            &manifest.clips,
            timing,
            verification,
        )?;
    }
    Ok(manifest)
}
#[cfg(test)]
mod tests;
