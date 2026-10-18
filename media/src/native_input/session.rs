//! Control-thread capture owner with dry-file and optional cue workers.
//! Project publication and hardware output/clock alignment remain separate.
use super::{
    input,
    recording::{CompletedTake, Recorder, Step},
    CueOutput, Fault, InputWriter, Status, DRY_SLOTS,
};
use crate::Result;
use serde_json::Value;
use std::{
    marker::PhantomData,
    path::{Path, PathBuf},
    rc::Rc,
    sync::mpsc::{self, Receiver, Sender, TryRecvError},
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

pub mod cue;
pub mod group;
pub mod monitored;
use cue::{CueConfig, Owner as CueOwner};

/// Matches the current decoded native graph source limit; this is not a
/// long-session streaming capability. Owners may choose a smaller budget.
pub const MAX_TAKE_FRAMES: u64 = 32_000_000;
#[derive(Clone, Copy, Debug)]
pub struct Report {
    pub frames: u64,
    pub callbacks: u64,
    pub fault: Option<Fault>,
    pub peaks: [f32; 2],
}
/// A capture must close its producer synchronously on finish/drop. Construction,
/// polling and destruction stay on the same control thread, including on Mac.
pub trait Capture: Sized {
    fn report(&self) -> Report;
    fn check_device(&self) -> Result<()>;
    fn finish(self) -> Result<Report>;
}
pub struct Config {
    pub channels: u16,
    pub max_frames: u64,
    pub context: Value,
    /// Maximum interval without a new callback (including startup). Call poll
    /// at least every 100 ms; detection cannot run while the control thread stalls.
    pub callback_timeout: Duration,
}
#[derive(Debug)]
pub struct StartError {
    pub reason: String,
    pub recovery_directory: Option<PathBuf>,
}
#[derive(Debug)]
pub enum Outcome {
    Complete(CompletedTake),
    Incomplete {
        recovery_directory: PathBuf,
        reason: String,
    },
}
enum Command {
    Finish(u64),
    Abort(String),
}

fn finish_files(mut recorder: Recorder, command: Command) -> Result<CompletedTake> {
    match command {
        Command::Finish(frames) => recorder.finish(frames),
        Command::Abort(reason) => {
            // Producer is already stopped. Preserve queued valid dry PCM,
            // even when cancelled or faulted; never publish a complete take.
            while recorder.step()? == Step::Written {}
            recorder.checkpoint()?;
            Err(reason)
        }
    }
}
fn run(mut recorder: Recorder, commands: Receiver<Command>) -> Result<CompletedTake> {
    loop {
        match commands.try_recv() {
            Ok(command) => return finish_files(recorder, command),
            Err(TryRecvError::Disconnected) => return Err("Recording owner disconnected".into()),
            Err(TryRecvError::Empty) => (),
        }
        match recorder.step()? {
            Step::Written => continue,
            Step::Idle | Step::Ended | Step::Interrupted(_) => {
                // Wait without spinning. Ingress has no locks or wakeup calls.
                match commands.recv_timeout(Duration::from_millis(2)) {
                    Ok(command) => return finish_files(recorder, command),
                    Err(mpsc::RecvTimeoutError::Timeout) => (),
                    Err(mpsc::RecvTimeoutError::Disconnected) => {
                        return Err("Recording owner disconnected".into())
                    }
                }
            }
        }
    }
}

/// Owns one dry capture and file worker. Deliberately !Send/!Sync, even with a
/// synthetic capture. Poll on the creating control thread; Drop aborts and joins.
/// A blocked filesystem can delay shutdown; no hard real-time stop is promised.
pub struct Session<C: Capture> {
    capture: Option<C>,
    cue: Option<CueOwner>,
    dry: Status<DRY_SLOTS>,
    commands: Sender<Command>,
    worker: Option<JoinHandle<Result<CompletedTake>>>,
    directory: PathBuf,
    timeout: Duration,
    progress_at: Instant,
    callbacks: u64,
    outcome: Option<Outcome>,
    control_thread: PhantomData<Rc<()>>,
}
/// Files and cue helpers exist, but capture has not opened. Drop closes the
/// ingress before joining workers, retaining recovery files. Deliberately !Send.
pub struct Prepared<C: Capture> {
    session: Option<Session<C>>,
    writer: Option<InputWriter>,
}
impl<C: Capture> Prepared<C> {
    pub fn recovery_directory(&self) -> &Path {
        self.session.as_ref().unwrap().recovery_directory()
    }
    pub fn start(
        mut self,
        open: impl FnOnce(InputWriter) -> Result<C>,
    ) -> std::result::Result<Session<C>, StartError> {
        let session = self.session.as_mut().unwrap();
        let result = session
            .check_prepared()
            .and_then(|_| open(self.writer.take().unwrap()));
        match result {
            Ok(capture) => {
                session.capture = Some(capture);
                session.progress_at = Instant::now();
                Ok(self.session.take().unwrap())
            }
            Err(reason) => {
                drop(self.writer.take());
                session.abort(reason.clone());
                Err(StartError {
                    reason,
                    recovery_directory: Some(session.directory.clone()),
                })
            }
        }
    }
    pub fn cancel(mut self) -> Outcome {
        drop(self.writer.take());
        self.session.take().unwrap().cancel()
    }
}
impl<C: Capture> Drop for Prepared<C> {
    fn drop(&mut self) {
        drop(self.writer.take());
        drop(self.session.take());
    }
}
impl<C: Capture> Session<C> {
    /// The factory runs only after durable file creation on the worker. It must
    /// use the supplied writer and return a capture owning it; never retain the
    /// writer elsewhere on failure. It must not prompt for microphone access.
    pub fn start(
        root: &Path,
        config: Config,
        open: impl FnOnce(InputWriter) -> Result<C>,
    ) -> std::result::Result<Self, StartError> {
        Self::start_internal(root, config, None, open).map(|(session, _)| session)
    }
    /// Prepares cue helpers before capture. Share the cue budget across all group
    /// inputs. The returned output belongs to one native consumer, never WebKit.
    pub fn start_with_cue(
        root: &Path,
        config: Config,
        cue: CueConfig,
        open: impl FnOnce(InputWriter) -> Result<C>,
    ) -> std::result::Result<(Self, CueOutput), StartError> {
        Self::start_internal(root, config, Some(cue), open)
            .map(|(session, output)| (session, output.unwrap()))
    }
    fn start_internal(
        root: &Path,
        config: Config,
        cue_config: Option<CueConfig>,
        open: impl FnOnce(InputWriter) -> Result<C>,
    ) -> std::result::Result<(Self, Option<CueOutput>), StartError> {
        let (prepared, output) = Self::prepare(root, config, cue_config)?;
        Ok((prepared.start(open)?, output))
    }
    /// Prepare durable files and cue helpers without starting capture. Use this
    /// for a whole group before opening/arming the shared output and inputs.
    pub fn prepare(
        root: &Path,
        config: Config,
        cue_config: Option<CueConfig>,
    ) -> std::result::Result<(Prepared<C>, Option<CueOutput>), StartError> {
        Self::prepare_cancellable(root, config, cue_config, &|| false)
    }
    /// Cancellation is checked before file creation and during cue readiness.
    /// An active filesystem call still finishes before file-worker cleanup joins.
    pub fn prepare_cancellable(
        root: &Path,
        config: Config,
        cue_config: Option<CueConfig>,
        cancelled: &dyn Fn() -> bool,
    ) -> std::result::Result<(Prepared<C>, Option<CueOutput>), StartError> {
        let error = |reason: String| StartError {
            reason,
            recovery_directory: None,
        };
        if config.max_frames == 0
            || config.max_frames > MAX_TAKE_FRAMES
            || config.callback_timeout.is_zero()
        {
            return Err(error("Invalid recording budget or callback timeout".into()));
        }
        if cancelled() {
            return Err(error("Recording preparation cancelled".into()));
        }
        let (writer, reader, cue) = input();
        let dry = reader.status();
        let root = root.to_owned();
        let (ready_tx, ready_rx) = mpsc::sync_channel(1);
        let (commands, receiver) = mpsc::channel();
        let worker = thread::Builder::new()
            .name("native-recording-file".into())
            .spawn(move || {
                let recorder = match Recorder::create(
                    &root,
                    reader,
                    config.channels,
                    config.max_frames,
                    config.context,
                ) {
                    Ok(recorder) => recorder,
                    Err(reason) => {
                        let _ = ready_tx.send(Err(reason.clone()));
                        return Err(reason);
                    }
                };
                if ready_tx.send(Ok(recorder.directory().to_owned())).is_err() {
                    return Err("Recording startup abandoned".into());
                }
                run(recorder, receiver)
            })
            .map_err(|e| error(e.to_string()))?;
        let directory = match ready_rx.recv() {
            Ok(Ok(path)) => path,
            result => {
                drop(writer);
                let _ = worker.join();
                return Err(error(match result {
                    Ok(Err(reason)) => reason,
                    _ => "Recording file worker failed during startup".into(),
                }));
            }
        };
        let (cue_owner, output) = if let Some(cue_config) = cue_config {
            match CueOwner::start_cancellable(cue, cue_config, cancelled) {
                Ok((owner, output)) => (Some(owner), Some(output)),
                Err(reason) => {
                    drop(writer);
                    dry.cancel();
                    let _ = commands.send(Command::Abort(reason.clone()));
                    let _ = worker.join();
                    return Err(StartError {
                        reason,
                        recovery_directory: Some(directory),
                    });
                }
            }
        } else {
            drop(cue); // No monitor: disable unused ingress instead of overflowing.
            (None, None)
        };
        let session = Self {
            capture: None,
            cue: cue_owner,
            dry,
            commands,
            worker: Some(worker),
            directory,
            timeout: config.callback_timeout,
            progress_at: Instant::now(),
            callbacks: 0,
            outcome: None,
            control_thread: PhantomData,
        };
        if cancelled() {
            let directory = session.directory.clone();
            drop(writer);
            drop(session);
            return Err(StartError {
                reason: "Recording preparation cancelled".into(),
                recovery_directory: Some(directory),
            });
        }
        Ok((
            Prepared {
                session: Some(session),
                writer: Some(writer),
            },
            output,
        ))
    }
    fn check_prepared(&mut self) -> Result<()> {
        if let Some(cue) = self.cue.as_mut() {
            cue.reap();
            if cue.fault().is_some() {
                return Err("Cue failed before capture startup".into());
            }
        }
        if self.dry.fault().is_some()
            || self
                .worker
                .as_ref()
                .is_none_or(|worker| worker.is_finished())
        {
            return Err("Prepared recording worker failed".into());
        }
        Ok(())
    }
    pub fn recovery_directory(&self) -> &Path {
        &self.directory
    }
    pub fn outcome(&self) -> Option<&Outcome> {
        self.outcome.as_ref()
    }
    /// Cue failure is isolated from the dry recording outcome.
    pub fn cue_fault(&self) -> Option<Fault> {
        self.cue.as_ref().and_then(CueOwner::fault)
    }
    /// Plug-in delay only; output scheduling/latency has not been qualified.
    pub fn cue_latency_samples(&self) -> Option<usize> {
        self.cue.as_ref().map(CueOwner::latency_samples)
    }
    pub fn poll(&mut self) -> Result<Report> {
        self.poll_at(Instant::now())
    }
    fn poll_at(&mut self, now: Instant) -> Result<Report> {
        match self.check_at(now) {
            Ok(report) => Ok(report),
            Err(reason) => {
                self.abort(reason.clone());
                Err(reason)
            }
        }
    }
    fn check_at(&mut self, now: Instant) -> Result<Report> {
        if let Some(cue) = self.cue.as_mut() {
            cue.reap();
        }
        let capture = self.capture.as_ref().ok_or("Recording has stopped")?;
        let report = capture.report();
        let reason = if let Some(fault) = self.dry.fault().or(report.fault) {
            Some(format!("Native capture fault: {fault:?}"))
        } else if self
            .worker
            .as_ref()
            .is_some_and(|worker| worker.is_finished())
        {
            Some("Recording file worker stopped unexpectedly".into())
        } else if let Err(reason) = capture.check_device() {
            Some(reason)
        } else {
            if report.callbacks != self.callbacks {
                self.callbacks = report.callbacks;
                self.progress_at = now;
            }
            (now.saturating_duration_since(self.progress_at) >= self.timeout)
                .then(|| "Native input callbacks stalled".into())
        };
        if let Some(reason) = reason {
            return Err(reason);
        }
        Ok(report)
    }
    fn join(&mut self, command: Command) {
        drop(self.cue.take()); // Suppress cue, kill blocked helpers and join DSP.
        let _ = self.commands.send(command);
        let result = self.worker.take().unwrap().join();
        self.outcome = Some(match result {
            Ok(Ok(take)) => Outcome::Complete(take),
            Ok(Err(reason)) => Outcome::Incomplete {
                recovery_directory: self.directory.clone(),
                reason,
            },
            Err(_) => Outcome::Incomplete {
                recovery_directory: self.directory.clone(),
                reason: "Recording file worker panicked".into(),
            },
        });
    }
    fn abort(&mut self, reason: String) {
        if self.outcome.is_some() {
            return;
        }
        self.dry.cancel();
        drop(self.capture.take()); // Quiesce capture BEFORE draining/joining files.
        self.join(Command::Abort(reason));
    }
    pub fn cancel(mut self) -> Outcome {
        self.abort("Recording cancelled".into());
        self.outcome.take().unwrap()
    }
    // Group stop quiesces every capture before joining any file worker.
    fn stop_capture(&mut self) -> Option<Command> {
        self.capture.take().map(|capture| match capture.finish() {
            Ok(report) if report.fault.is_none() => Command::Finish(report.frames),
            Ok(report) => {
                self.dry.cancel();
                Command::Abort(format!("Native capture fault at stop: {:?}", report.fault))
            }
            Err(reason) => {
                self.dry.cancel();
                Command::Abort(reason)
            }
        })
    }
    pub fn stop(mut self) -> Outcome {
        if let Some(command) = self.stop_capture() {
            self.join(command);
        }
        self.outcome.take().unwrap()
    }
}
impl<C: Capture> Drop for Session<C> {
    fn drop(&mut self) {
        if self.worker.is_some() {
            self.abort("Recording owner dropped".into());
        }
    }
}

#[cfg(target_os = "macos")]
impl Session<super::macos::Capture> {
    /// Opens only an already-authorized, explicitly selected Mac input. The map
    /// and file channel count must agree; no device fallback or permission prompt.
    pub fn start_macos(
        root: &Path,
        config: Config,
        uid: &str,
        map: super::macos::ChannelMap,
    ) -> std::result::Result<Self, StartError> {
        let channels = match map {
            super::macos::ChannelMap::Mono(_) => 1,
            super::macos::ChannelMap::Stereo(_, _) => 2,
        };
        if config.channels != channels {
            return Err(StartError {
                reason: "Recording channel map does not match file layout".into(),
                recovery_directory: None,
            });
        }
        Self::start(root, config, |writer| {
            super::macos::Capture::start(uid, map, writer)
        })
    }
}

#[cfg(target_os = "macos")]
impl Capture for super::macos::Capture {
    fn report(&self) -> Report {
        super::macos::Capture::report(self).into()
    }
    fn check_device(&self) -> Result<()> {
        super::macos::Capture::check_device(self)
    }
    fn finish(self) -> Result<Report> {
        super::macos::Capture::finish(self).map(Into::into)
    }
}
#[cfg(target_os = "macos")]
impl From<super::macos::InputReport> for Report {
    fn from(report: super::macos::InputReport) -> Self {
        Self {
            frames: report.frames,
            callbacks: report.callbacks,
            fault: report.fault,
            peaks: report.peaks,
        }
    }
}
#[cfg(test)]
mod tests;
