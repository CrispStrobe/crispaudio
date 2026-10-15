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

## Integration still required

This experiment proves one native-owned processing/output path can continue
through a WebKit UI stall. It is not a production timeline engine. Next implement
immutable project/source snapshots and the existing track/bus/send graph on the
native worker, with consistent latency compensation and whole-graph fault mute.
Then add sample-clock transport, seeks/loops and state restoration, live parameter
commands, meters and output-device changes/disconnection handling. Verify export
parity, cancellation and owner cleanup under load before enabling live inserts.
The rendered-preview fallback stays available throughout this work. Physical
output, wider plugin compatibility, recording and other platforms need separate
acceptance checks.
