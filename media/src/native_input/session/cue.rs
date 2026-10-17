//! Cue worker ownership, helper cancellation and a recording-group stream budget.
use super::super::{
    plugins::{PluginConfig, PluginRack},
    CueOutput, CueWorker, Fault, Processor, Reader, Status, Step, CUE_SLOTS,
};
use crate::{plugin_stream::StreamStop, Result};
use std::{
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpsc, Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};

pub const MAX_GROUP_INSERTS: usize = 8;
/// Share ONE budget across all inputs in a recording group. This is independent
/// of playback helpers; it does not enforce a process-wide or cross-app limit.
#[derive(Clone, Default)]
pub struct StreamBudget(Arc<AtomicUsize>);
impl StreamBudget {
    pub fn used(&self) -> usize {
        self.0.load(Ordering::Acquire)
    }
    fn reserve(&self, count: usize) -> Result<Reservation> {
        if count > 2 {
            return Err("At most two cue inserts per input".into());
        }
        let mut used = self.0.load(Ordering::Acquire);
        loop {
            let next = used
                .checked_add(count)
                .filter(|next| *next <= MAX_GROUP_INSERTS)
                .ok_or("Recording cue stream budget exhausted")?;
            match self
                .0
                .compare_exchange_weak(used, next, Ordering::AcqRel, Ordering::Acquire)
            {
                Ok(_) => break,
                Err(current) => used = current,
            }
        }
        Ok(Reservation {
            budget: self.clone(),
            count,
        })
    }
}
struct Reservation {
    budget: StreamBudget,
    count: usize,
}
impl Drop for Reservation {
    fn drop(&mut self) {
        self.budget.0.fetch_sub(self.count, Ordering::AcqRel);
    }
}
pub struct CueConfig {
    pub plugins: Vec<PluginConfig>,
    pub budget: StreamBudget,
    /// Deadline for readiness. Timeout kills registered helpers and joins before
    /// returning. Cleanup may extend beyond this deadline; no detached worker.
    pub startup_timeout: Duration,
}
#[derive(Default)]
struct Control {
    cancelled: AtomicBool,
    helpers: Mutex<Vec<StreamStop>>,
}
impl Control {
    fn register(&self, helper: StreamStop) {
        let mut helpers = self.helpers.lock().unwrap_or_else(|p| p.into_inner());
        if self.cancelled.load(Ordering::Acquire) {
            drop(helpers);
            helper.stop();
        } else {
            helpers.push(helper);
        }
    }
    fn stop(&self) {
        self.cancelled.store(true, Ordering::Release);
        let helpers = std::mem::take(&mut *self.helpers.lock().unwrap_or_else(|p| p.into_inner()));
        for helper in helpers {
            helper.stop();
        }
    }
}
struct Cleanup(Arc<Control>);
impl Drop for Cleanup {
    fn drop(&mut self) {
        self.0.stop();
    }
}

pub(super) struct Owner {
    input: Status<CUE_SLOTS>,
    output: Status<CUE_SLOTS>,
    control: Arc<Control>,
    worker: Option<JoinHandle<()>>,
    latency: usize,
}
impl Owner {
    pub(super) fn start(input: Reader<CUE_SLOTS>, config: CueConfig) -> Result<(Self, CueOutput)> {
        let reservation = config.budget.reserve(config.plugins.len())?;
        Self::spawn(input, reservation, config.startup_timeout, move |control| {
            let rack = PluginRack::open(&config.plugins, |helper| control.register(helper))?;
            let latency = rack.latency_samples();
            Ok((rack, latency))
        })
    }
    fn spawn<P: Processor + 'static>(
        input: Reader<CUE_SLOTS>,
        reservation: Reservation,
        timeout: Duration,
        open: impl FnOnce(Arc<Control>) -> Result<(P, usize)> + Send + 'static,
    ) -> Result<(Self, CueOutput)> {
        if timeout.is_zero() {
            return Err("Invalid cue startup timeout".into());
        }
        let status = input.status();
        let control = Arc::new(Control::default());
        let worker_control = control.clone();
        let (ready_tx, ready_rx) = mpsc::sync_channel(1);
        let worker_status = status.clone();
        let worker = thread::Builder::new()
            .name("native-recording-cue".into())
            .spawn(move || {
                // Reservation survives until DSP and registered helpers are closed.
                let _reservation = reservation;
                let _cleanup = Cleanup(worker_control.clone());
                let (processor, latency) = match open(worker_control.clone()) {
                    Ok(value) => value,
                    Err(reason) => {
                        worker_status.fail(Fault::Processor);
                        let _ = ready_tx.send(Err(reason));
                        return;
                    }
                };
                let (mut cue, output) = CueWorker::new(input, processor);
                if ready_tx.send(Ok((output, latency))).is_err() {
                    return;
                }
                while !worker_control.cancelled.load(Ordering::Acquire) {
                    match cue.step() {
                        Step::Processed => (),
                        Step::Idle => thread::park_timeout(Duration::from_millis(2)),
                        Step::Ended | Step::Fault(_) => break,
                    }
                }
            })
            .map_err(|error| error.to_string())?;
        match ready_rx.recv_timeout(timeout) {
            Ok(Ok((output, latency))) => Ok((
                Self {
                    input: status,
                    output: output.status(),
                    control,
                    worker: Some(worker),
                    latency,
                },
                output,
            )),
            result => {
                status.cancel();
                control.stop(); // Interrupt blocked startup IPC, including late registrations.
                worker.thread().unpark();
                let _ = worker.join();
                Err(match result {
                    Ok(Err(reason)) => reason,
                    Err(mpsc::RecvTimeoutError::Timeout) => "Cue startup timed out".into(),
                    _ => "Cue worker failed during startup".into(),
                })
            }
        }
    }
    pub(super) fn fault(&self) -> Option<Fault> {
        self.output.fault().or(self.input.fault())
    }
    pub(super) fn latency_samples(&self) -> usize {
        self.latency
    }
    pub(super) fn reap(&mut self) {
        if self.fault().is_some() {
            // An ingress/output overflow can happen while helper IPC blocks.
            self.control.stop();
            if let Some(worker) = self.worker.as_ref() {
                worker.thread().unpark();
            }
        }
        if self
            .worker
            .as_ref()
            .is_some_and(|worker| worker.is_finished())
        {
            if self.worker.take().unwrap().join().is_err() {
                self.input.fail(Fault::Processor);
                self.output.fail(Fault::Processor);
            }
        }
    }
    fn close(&mut self) {
        self.input.cancel();
        self.output.cancel(); // Suppress already-queued and in-flight wet audio.
        self.control.stop();
        if let Some(worker) = self.worker.take() {
            worker.thread().unpark();
            let _ = worker.join();
        }
    }
}
impl Drop for Owner {
    fn drop(&mut self) {
        self.close();
    }
}

#[cfg(test)]
mod tests;
