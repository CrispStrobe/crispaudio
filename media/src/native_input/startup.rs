//! Cancellable readiness waits on the control thread, never an audio callback.
use std::{
    sync::mpsc::{Receiver, RecvTimeoutError},
    time::{Duration, Instant},
};
#[derive(Debug, PartialEq, Eq)]
pub(super) enum WaitError {
    Cancelled,
    Timeout,
    Disconnected,
}
pub(super) fn wait<T>(
    rx: &Receiver<T>,
    timeout: Duration,
    cancelled: &dyn Fn() -> bool,
) -> Result<T, WaitError> {
    let start = Instant::now();
    loop {
        if cancelled() {
            return Err(WaitError::Cancelled);
        }
        let remaining = timeout.saturating_sub(start.elapsed());
        if remaining.is_zero() {
            return Err(WaitError::Timeout);
        }
        match rx.recv_timeout(remaining.min(Duration::from_millis(20))) {
            Ok(value) => {
                return if cancelled() {
                    Err(WaitError::Cancelled)
                } else {
                    Ok(value)
                }
            }
            Err(RecvTimeoutError::Timeout) => (),
            Err(RecvTimeoutError::Disconnected) => return Err(WaitError::Disconnected),
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::Cell, sync::mpsc};
    #[test]
    fn cancellation_wins_over_already_ready_results_and_prevents_waiting() {
        let (tx, rx) = mpsc::channel();
        tx.send(42).unwrap();
        assert_eq!(
            wait(&rx, Duration::from_secs(10), &|| true),
            Err(WaitError::Cancelled)
        );
        assert_eq!(rx.try_recv().unwrap(), 42);
        tx.send(43).unwrap();
        let calls = Cell::new(0);
        assert_eq!(
            wait(&rx, Duration::from_secs(10), &|| {
                calls.set(calls.get() + 1);
                calls.get() > 1
            }),
            Err(WaitError::Cancelled)
        );
    }
    #[test]
    fn readiness_disconnect_and_deadline_remain_distinct() {
        let (tx, rx) = mpsc::channel();
        tx.send(42).unwrap();
        assert_eq!(wait(&rx, Duration::from_secs(1), &|| false), Ok(42));
        assert_eq!(
            wait(&rx, Duration::ZERO, &|| false),
            Err(WaitError::Timeout)
        );
        drop(tx);
        assert_eq!(
            wait(&rx, Duration::from_secs(1), &|| false),
            Err(WaitError::Disconnected)
        );
    }
}

/// Real, silent subprocess: open stdout cannot complete until its stop handle
/// kills/reaps it. No devices, plug-ins, environment overrides or descendants.
#[cfg(all(test, target_os = "macos"))]
pub(crate) struct BlockedHelper {
    pub stop: crate::plugin_stream::StreamStop,
    _stdin: std::process::ChildStdin,
    stdout: std::process::ChildStdout,
}
#[cfg(all(test, target_os = "macos"))]
impl BlockedHelper {
    pub fn new() -> Self {
        use std::process::{Command, Stdio};
        let mut child = Command::new("/bin/cat")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        Self {
            _stdin: child.stdin.take().unwrap(),
            stdout: child.stdout.take().unwrap(),
            stop: crate::plugin_stream::StreamStop::test_child(child),
        }
    }
    pub fn handshake(&mut self) {
        use std::io::Read;
        let mut bytes = Vec::new();
        self.stdout.read_to_end(&mut bytes).unwrap();
        assert!(bytes.is_empty());
    }
}
#[cfg(all(test, target_os = "macos"))]
impl Drop for BlockedHelper {
    fn drop(&mut self) {
        self.stop.stop();
    }
}
