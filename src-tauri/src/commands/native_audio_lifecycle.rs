//! Retire upload admission before waiting for native audio owners.
use super::{native_playback::NativePlayback, native_recording::NativeRecording};
use crispaudio_media::native_snapshot::Snapshots;

pub fn close_owner(
    owner: &str,
    snapshots: &Snapshots,
    recording: &NativeRecording,
    playback: &NativePlayback,
) {
    // A late command either fails get(), or already holds its audio owner lock;
    // in that case the close below waits for publication, cancels and joins it.
    snapshots.close_owner(owner);
    recording.close_owner(owner);
    playback.close_owner(owner);
}

pub fn shutdown(snapshots: &Snapshots, recording: &NativeRecording, playback: &NativePlayback) {
    snapshots.shutdown();
    recording.shutdown();
    playback.shutdown();
}
