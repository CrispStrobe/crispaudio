//! One control-thread owner for prepared capture groups, output and backing.
//! No app commands/project insertion here. Call poll at least every 100 ms.
use super::{group, Capture, InputWriter, Report};
use crate::native_input::backing;
use crate::Result;

/// Implementations must preserve explicit routing and return clock/device faults.
/// Use shared output to isolate cue-only failures from synchronized backing.
pub trait MonitorOutput: Sized {
    fn ready(&mut self) -> Result<bool>;
    fn arm(&self) -> Result<()>;
    fn stop(self) -> Result<()>;
}
#[cfg(target_os = "macos")]
impl MonitorOutput for crate::native_input::macos::playback::Output {
    fn ready(&mut self) -> Result<bool> {
        Ok(self.inspect()?.clock.is_some())
    }
    fn arm(&self) -> Result<()> {
        Self::arm(self)
    }
    fn stop(self) -> Result<()> {
        let report = Self::stop(self)?;
        if let Some(fault) = report.fault {
            Err(format!("Output fault at stop: {fault:?}"))
        } else {
            Ok(())
        }
    }
}
// Capture callbacks are already quiescent when this runs. Always stop output and
// backing even if one fails. Worker Drop kills registered helpers and joins.
fn cleanup<O: MonitorOutput>(
    output: Option<O>,
    mut backing: Option<backing::Worker>,
) -> Result<()> {
    let health = backing.as_mut().map_or(Ok(()), backing::Worker::poll);
    let stopped = output.map_or(Ok(()), MonitorOutput::stop);
    drop(backing);
    match (health, stopped) {
        (Err(a), Err(b)) => Err(format!("{a}; {b}")),
        (Err(reason), _) | (_, Err(reason)) => Err(reason),
        _ => Ok(()),
    }
}
fn start_error(outcome: group::GroupOutcome) -> group::StartError {
    match outcome {
        group::GroupOutcome::Incomplete {
            directory,
            reason,
            inputs,
        } => group::StartError {
            reason,
            directory: Some(directory),
            inputs,
        },
        group::GroupOutcome::Complete { .. } => {
            unreachable!("Preparation cannot publish a complete group")
        }
    }
}
/// Build the group, primed backing and shared output before constructing this
/// owner. The output must own the returned group's cue consumers/backing reader.
pub struct Prepared<C: Capture, O: MonitorOutput> {
    group: Option<group::Prepared<C>>,
    output: Option<O>,
    backing: Option<backing::Worker>,
    fault: Option<String>,
}
impl<C: Capture, O: MonitorOutput> Prepared<C, O> {
    pub fn new(group: group::Prepared<C>, output: O, backing: Option<backing::Worker>) -> Self {
        Self {
            group: Some(group),
            output: Some(output),
            backing,
            fault: None,
        }
    }
    /// Wait without opening capture. A failure latches; retry requires a fresh
    /// preparation, so no stale clock/rack can be armed accidentally.
    pub fn ready(&mut self) -> Result<bool> {
        if let Some(reason) = &self.fault {
            return Err(reason.clone());
        }
        let result = self.output.as_mut().unwrap().ready().and_then(|ready| {
            if let Some(backing) = self.backing.as_mut() {
                backing.poll()?;
            }
            Ok(ready)
        });
        if let Err(reason) = &result {
            self.fault = Some(reason.clone());
        }
        result
    }
    /// Open only after output clock readiness; arm promptly after sequential
    /// capture startup. Per-input timestamps still need project mapping (N3).
    pub fn start(
        mut self,
        open: impl FnMut(&str, InputWriter) -> Result<C>,
    ) -> std::result::Result<Run<C, O>, group::StartError> {
        let ready = self.ready().and_then(|ready| {
            if ready {
                Ok(())
            } else {
                Err("Output clock is not ready".into())
            }
        });
        if let Err(reason) = ready {
            return Err(self.fail(reason));
        }
        let group = match self.group.take().unwrap().start(open) {
            Ok(group) => group,
            Err(mut failure) => {
                if let Err(reason) = cleanup(self.output.take(), self.backing.take()) {
                    failure
                        .reason
                        .push_str(&format!("; cleanup failed: {reason}"));
                }
                return Err(failure);
            }
        };
        if let Err(reason) = self.output.as_ref().unwrap().arm() {
            let (output, backing) = (self.output.take(), self.backing.take());
            return Err(start_error(
                group.interrupt_with(format!("Output arming failed: {reason}"), || {
                    cleanup(output, backing)
                }),
            ));
        }
        Ok(Run {
            group: Some(group),
            output: self.output.take(),
            backing: self.backing.take(),
            outcome: None,
        })
    }
    fn fail(&mut self, reason: String) -> group::StartError {
        let (output, backing) = (self.output.take(), self.backing.take());
        start_error(
            self.group
                .take()
                .unwrap()
                .cancel_with(reason, || cleanup(output, backing)),
        )
    }
}
impl<C: Capture, O: MonitorOutput> Drop for Prepared<C, O> {
    fn drop(&mut self) {
        if self.group.is_some() {
            let _ = self.fail("Prepared recording owner dropped".into());
        } else {
            let _ = cleanup(self.output.take(), self.backing.take());
        }
    }
}
pub struct Run<C: Capture, O: MonitorOutput> {
    group: Option<group::Group<C>>,
    output: Option<O>,
    backing: Option<backing::Worker>,
    outcome: Option<group::GroupOutcome>,
}
impl<C: Capture, O: MonitorOutput> Run<C, O> {
    pub fn outcome(&self) -> Option<&group::GroupOutcome> {
        self.outcome.as_ref()
    }
    pub fn poll(&mut self) -> Result<Vec<(String, Report)>> {
        if self.outcome.is_some() {
            return Err("Native recording has stopped".into());
        }
        let result = (|| {
            if !self.output.as_mut().unwrap().ready()? {
                return Err("Output clock readiness was lost".into());
            }
            if let Some(backing) = self.backing.as_mut() {
                backing.poll()?;
            }
            self.group.as_mut().unwrap().check()
        })();
        if let Err(reason) = &result {
            self.abort(reason.clone());
        }
        result
    }
    fn abort(&mut self, reason: String) {
        if self.outcome.is_some() {
            return;
        }
        let (output, backing) = (self.output.take(), self.backing.take());
        self.outcome = Some(
            self.group
                .take()
                .unwrap()
                .interrupt_with(reason, || cleanup(output, backing)),
        );
    }
    pub fn cancel(mut self) -> group::GroupOutcome {
        self.abort("Native recording cancelled".into());
        self.outcome.take().unwrap()
    }
    pub fn stop(mut self) -> group::GroupOutcome {
        if self.outcome.is_none() {
            let _ = self.poll();
        }
        if let Some(outcome) = self.outcome.take() {
            return outcome;
        }
        let (output, backing) = (self.output.take(), self.backing.take());
        self.group
            .take()
            .unwrap()
            .stop_with(|| cleanup(output, backing))
    }
}
impl<C: Capture, O: MonitorOutput> Drop for Run<C, O> {
    fn drop(&mut self) {
        if self.group.is_some() {
            self.abort("Native recording owner dropped".into());
        }
    }
}

#[cfg(test)]
mod tests;
