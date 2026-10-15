# Native audio engine foundation

The installed app uses rendered preview for enabled native AU/VST3 racks. The
continuous Web Audio/native bridge remains gated: measured WebKit UI stalls block
both worklet messages and native request dispatch. A worker heartbeat alone did
not establish independent audio delivery.

## Native clock experiment

`src-tauri/src/native_audio_clock.rs` is compiled only with `native-validation`
on macOS. A dedicated Rust worker owns one persistent VST3 helper and feeds a
bounded stereo PCM ring. Audio Queue Services consumes those blocks on its own
callback thread. No per-block request, PCM transfer or deadline passes through
WebKit. The frontend only starts/cancels the experiment and receives its report.

The ring has four slots of 512 frames at 48 kHz. Two queue buffers are allocated
before start. One additional block may be held by the producer while the ring is
full; this is a bounded lookahead experiment, not a qualified latency setting.
The callback copies prepared PCM or silence. It does not allocate, wait on locks,
process plugins or invoke the frontend. Acquire/release counters protect unique
producer/consumer slot ownership; a callback entry guard rejects reentrancy.
An empty deadline latches a silent fault rather than repeating stale audio.

The output queue binds directly to the current output UID without changing the
system default. Its volume is zero throughout validation. Capture records PCM
offered to the queue **before** that mute; it is not a recording of a speaker or
an output-device loopback. Native polling also reads the queue's sample clock.
Cancellation signals the ring, interrupts the owned helper and joins its worker.
Queue disposal is synchronous and precedes release of callback data. Shutdown
marks the queue as stopping before disposal, so a racing callback does not report
its expected re-enqueue rejection as a playback fault.

Apple documents [internal callback threads with a null run loop](https://developer.apple.com/documentation/audiotoolbox/audioqueuenewoutput(_:_:_:_:_:_:_:))
and [queue disposal](https://developer.apple.com/documentation/audiotoolbox/audioqueuedispose(_:_:)).
The FFI layouts and signatures follow the local Apple SDK AudioQueue.h and
CoreAudioBaseTypes.h headers. No new dependency or production command is added.

## Reproduce

With the existing ADelay fixture and the Cargo environment described by the
contributor setup, run:

```sh
CRISPAUDIO_NATIVE_VALIDATION_NATIVE_CLOCK=1 node scripts/test-native-timeline-tauri.mjs
cargo test --manifest-path src-tauri/Cargo.toml --locked \
  --features native-validation,tauri/custom-protocol --lib native_audio_clock
```

The separate Tauri fixture uses the ordinary app origin and an isolated test data
store. It checks baseline PCM, a 500 ms JavaScript stall, deliberate native worker
starvation, cancellation and helper cleanup. Assertions compare exact wet stereo
pulses, count native processing/callback progress during the stall and require the
queue clock to advance. Unit tests exercise bounded publication, counter wrap,
concurrent access, malformed-buffer silence and fault/cancellation behavior.

## Prepared project graph

The opt-in `crispaudio-media/native-engine` feature adds `native_graph::Graph`.
Preparation consumes an immutable decoded PCM registry and compiles project values
into owned DSP, routing and insert state. Later caller edits cannot alter a running
graph. This prototype accepts 48 kHz mono/stereo sources, up to 128 tracks, 256
clips and eight enabled native inserts. Source snapshots are capped at 256 MiB;
compensation delay state is capped at 64 MiB in addition to the existing built-in
FX budget. Files, decoding and GUI project transfer are outside this API.

The graph reuses the file mixer's built-in FX, fades, gain/pan automation, ducking
and limiter. Native inserts run after built-in racks at clip, track and master
scopes; buses use track racks. Clip merges, output/send merges and sidechain
program/detector paths receive integer-frame compensation based on reported insert
latency. Bypass retains that latency. Pre/post sends, mute/solo and the master fader
use the same routing rules as the existing mixer. Reported latency changes,
non-finite output and processing failures clear the entire output block and latch
the graph silent until it is dropped and prepared again.

The block renderer runs on the native worker, where allocation and helper pipe
calls are allowed. The audio callback still only consumes the bounded final mix.
Compensation and sidechain tests use explicit synthetic delays, varying block
sizes and both detector/program arrival orders. A separate parity test compares
built-in filtering, fades, automation and limiting against the existing WAV mixer.
These tests establish the selected graph behavior, not blanket parity for every
FX combination or plugin.

The native validation runner additionally supports:

```sh
CRISPAUDIO_NATIVE_VALIDATION_NATIVE_GRAPH=1 node scripts/test-native-timeline-tauri.mjs
cargo test --manifest-path media/Cargo.toml --features native-engine --lib --locked
```

Its generated-source arrangement routes two audio tracks through a bus and pre/post
sends, with four actual AU/VST3 instances across clip, track, bus and master racks.
It checks the resulting wet pulse positions and gains, UI-stall independence,
starvation and cancellation. The test plugins report zero intrinsic latency;
nonzero reported-latency compensation is covered by the synthetic insert tests.
Output remains muted, and capture is still before the device mute.

## Integration still required

This remains a validation-only engine. Next connect real GUI project/source
snapshots to owned native sessions and add sample-clock transport, seeks/loops and
state restoration. Native plugin musical timing currently uses each helper's
initial clock; scope-compensated tempo/position context is not implemented in the
graph adapter. Add that context before qualifying tempo-synchronized plugins.
Live parameter commands, meters and output-device changes/disconnection handling
also remain pending. Verify export
parity, cancellation and owner cleanup under load before enabling live inserts.
The rendered-preview fallback stays available throughout this work. Physical
output, wider plugin compatibility, recording and other platforms need separate
acceptance checks.
