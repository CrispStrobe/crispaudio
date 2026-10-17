//! Control-thread dry recording owner. File I/O runs on its own worker.
//! No cue output, project publication, or hardware clock alignment is implied.
use super::{
    input,
    recording::{CompletedTake, Recorder, Step},
    Fault, InputWriter, Status, DRY_SLOTS,
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
impl<C: Capture> Session<C> {
    /// The factory runs only after durable file creation on the worker. It must
    /// use the supplied writer and return a capture owning it; never retain the
    /// writer elsewhere on failure. It must not prompt for microphone access.
    pub fn start(
        root: &Path,
        config: Config,
        open: impl FnOnce(InputWriter) -> Result<C>,
    ) -> std::result::Result<Self, StartError> {
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
        let (writer, reader, cue) = input();
        // Dry-only owner: explicitly disable unused cue instead of overflowing it.
        drop(cue);
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
        let capture = match open(writer) {
            Ok(capture) => capture,
            Err(reason) => {
                dry.cancel();
                let _ = commands.send(Command::Abort(reason.clone()));
                let _ = worker.join();
                return Err(StartError {
                    reason,
                    recovery_directory: Some(directory),
                });
            }
        };
        Ok(Self {
            capture: Some(capture),
            dry,
            commands,
            worker: Some(worker),
            directory,
            timeout: config.callback_timeout,
            progress_at: Instant::now(),
            callbacks: 0,
            outcome: None,
            control_thread: PhantomData,
        })
    }
    pub fn recovery_directory(&self) -> &Path {
        &self.directory
    }
    pub fn outcome(&self) -> Option<&Outcome> {
        self.outcome.as_ref()
    }
    pub fn poll(&mut self) -> Result<Report> {
        self.poll_at(Instant::now())
    }
    fn poll_at(&mut self, now: Instant) -> Result<Report> {
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
            self.abort(reason.clone());
            return Err(reason);
        }
        Ok(report)
    }
    fn join(&mut self, command: Command) {
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
    pub fn stop(mut self) -> Outcome {
        if let Some(capture) = self.capture.take() {
            let command = match capture.finish() {
                Ok(report) if report.fault.is_none() => Command::Finish(report.frames),
                Ok(report) => {
                    self.dry.cancel();
                    Command::Abort(format!("Native capture fault at stop: {:?}", report.fault))
                }
                Err(reason) => {
                    self.dry.cancel();
                    Command::Abort(reason)
                }
            };
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
