//! All-or-none native recording group result. Individual files are retained;
//! only a complete manifest makes them eligible for one project transaction.
use super::{
    cue::{CueConfig, StreamBudget, MAX_GROUP_INSERTS},
    Capture, Config, Outcome, Report, Session, MAX_TAKE_FRAMES,
};
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
impl<C: Capture> Group<C> {
    /// Validates the whole group before creating files/opening inputs. The cue
    /// budget is private to this group, so preflight admission cannot race another
    /// group. Opens sequentially; this does NOT establish synchronized clocks.
    pub fn start(
        root: &Path,
        inputs: Vec<Input>,
        mut open: impl FnMut(&str, InputWriter) -> Result<C>,
    ) -> std::result::Result<(Self, Vec<(String, CueOutput)>), StartError> {
        let error = |reason| StartError {
            reason,
            directory: None,
            inputs: Vec::new(),
        };
        validate(&inputs).map_err(error)?;
        let directory = create(root, &inputs).map_err(error)?;
        let mut group = Self {
            directory,
            inputs: Vec::new(),
            outcome: None,
        };
        let budget = StreamBudget::default();
        let mut outputs = Vec::new();
        for input in inputs {
            let id = input.track_id;
            let mut config = input.recording;
            config.context = serde_json::json!({"recordingGroup": group.directory.file_name().unwrap().to_string_lossy(), "trackId":id, "source":config.context});
            let result = if let Some(cue) = input.cue {
                Session::start_with_cue(
                    &group.directory,
                    config,
                    CueConfig {
                        plugins: cue.plugins,
                        budget: budget.clone(),
                        startup_timeout: cue.startup_timeout,
                    },
                    |writer| open(&id, writer),
                )
                .map(|(session, output)| (session, Some(output)))
            } else {
                Session::start(&group.directory, config, |writer| open(&id, writer))
                    .map(|session| (session, None))
            };
            match result {
                Ok((session, output)) => {
                    if let Some(output) = output {
                        outputs.push((id.clone(), output));
                    }
                    group.inputs.push((id, session));
                }
                Err(failure) => {
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
        Ok((group, outputs))
    }
    pub fn directory(&self) -> &Path {
        &self.directory
    }
    pub fn outcome(&self) -> Option<&GroupOutcome> {
        self.outcome.as_ref()
    }
    pub fn poll(&mut self) -> Result<Vec<(String, Report)>> {
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
            self.abort(reason.clone());
            Err(reason)
        } else {
            Ok(reports)
        }
    }
    fn abort(&mut self, reason: String) {
        if self.outcome.is_some() {
            return;
        }
        // Quiesce ALL captures before any cue/file join can block.
        for (_, session) in &mut self.inputs {
            session.dry.cancel();
            drop(session.capture.take());
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
    pub fn cancel(mut self) -> GroupOutcome {
        self.abort("Recording group cancelled".into());
        self.outcome.take().unwrap()
    }
    pub fn stop(mut self) -> GroupOutcome {
        if let Some(outcome) = self.outcome.take() {
            return outcome;
        }
        let stopped = std::mem::take(&mut self.inputs)
            .into_iter()
            .map(|(id, mut session)| {
                let command = session.stop_capture();
                (id, session, command)
            })
            .collect::<Vec<_>>();
        let inputs = stopped
            .into_iter()
            .map(|(track_id, mut session, command)| {
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
            let manifest = Manifest { version: 1, clips };
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
    if manifest.version != 1 || manifest.clips.is_empty() || manifest.clips.len() > MAX_INPUTS {
        return Err("Invalid recording group manifest".into());
    }
    let mut ids = HashSet::new();
    let mut audio_paths = HashSet::new();
    let mut frames = 0u64;
    for clip in &manifest.clips {
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
    Ok(manifest)
}
#[cfg(test)]
mod tests;
