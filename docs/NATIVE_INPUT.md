# Native input engine foundation

The installed recorder still uses Web Audio capture and the
[buffered native cue](RECORDING_CUE.md). The Rust foundation in
`media/src/native_input.rs` is not connected to a hardware device or the recording
UI. It introduces no new recording mode and establishes no monitoring latency.

## Implemented

- One callback writer publishes separate dry and cue packets. Each packet retains
  its input frame number, opaque host timestamp and up to 512 stereo frames.
  Short blocks preserve their exact length. Finite samples above unity retain
  their headroom.
- Preallocated single-producer/single-consumer queues use atomic ownership
  transfers. Publishing input does no allocation, locking, waiting, helper IPC,
  file I/O or WebKit work. Allocate and destroy endpoints off the callback.
- Dry capture has 64 packet slots; cue input and output each have eight. These are
  capacity limits, not a latency target. Nothing waits for a queue to fill.
- A full cue queue, disconnected consumer, processing failure or cancellation
  faults the cue independently. Dry writes continue. Cue faults suppress already
  queued wet packets and late helper replies; there is no dry fallback.
- A dry overflow, invalid input or discontinuous sample counter latches an
  incomplete take. Existing dry packets remain available for recovery. Consumers
  must check status rather than treating the retained prefix as a complete take.
- A native worker owns a static rack of up to two AU/VST3 inserts at 48 kHz stereo.
  It restores saved state/parameters, retains order and reported delay during
  bypass, rejects changed latency and closes helpers on failure or completion.
  DSP and helper IPC happen on the worker, outside the callback.

`Packet.first_frame` identifies the original input block even after processing;
it does not compensate plug-in delay. Host ticks have no assumed unit. The rack
reports plug-in latency only and passes a contiguous input sample position to
helpers; it has no arrangement transport or live parameter automation.

## Ownership and remaining integration

A recording owner must reserve the group stream budget before opening racks,
register helper stop handles, and cancel both cue status and helpers when stopping
blocked IPC. Queue cancellation alone cannot interrupt a plug-in process. Dropping
the worker releases its rack; dropping it before normal input completion cancels
queued cue output. Empty input queues are normal while waiting for the next
callback. Output underrun detection belongs to the output scheduler.
The dry consumer must keep draining during monitor-only operation too; retaining
packets without a consumer deliberately faults the dry path when its queue fills.

Next work is the Mac hardware capture adapter and its device/channel mapping,
permission/error lifecycle, callback lifetime/reentrancy guards and sample/host
clock conversion. A native dry writer must retain partial recordings on failure.
Then connect a native output scheduler with startup buffering, measured latency,
input/output clock drift handling and fault silence before exposing this in the UI.
Independent cue outputs/backing mixes and wet capture retaining dry originals
follow that integration. Existing Web Audio recording remains available meanwhile.

## Checks

Portable tests cover overflow isolation, incomplete-take recovery, invalid samples,
clock discontinuities, short blocks, counter wrap/concurrent publication,
processing faults, disconnects, queued-output suppression and cancellation during
processing. A separate bypass history test covers delay across unequal blocks.

Mac tests use generated PCM, a native worker thread and actual Apple AUBandpass
helpers. One/two insert chains match independent offline WAV renders; bypassed
chains preserve input. A killed helper and a partial-open failure release sessions
while dry capture continues. An explicit SDK ADelay VST3 test covers one/two inserts.
Each response case uses 48,000 input frames and unequal packet lengths. The writer
waits for each processed packet in these deterministic tests: they verify DSP and
ownership, not real-time throughput or hardware latency. No microphone or output
device is opened. See [recorded scope](evidence/native-input-foundation.json).

```sh
cargo test --manifest-path media/Cargo.toml --features native-engine --locked --lib native_input
CRISPAUDIO_TEST_PLUGIN_FOLDER=/path/to/fixtures cargo test \
  --manifest-path media/Cargo.toml --features native-engine --locked --lib \
  native_input::plugins::tests::vst3_rack -- --ignored --nocapture
```

Linux media CI runs the portable tests; Mac CI also runs the AU checks. SDK VST3
tests require an explicit fixture and are ignored by default. These checks do not
qualify physical microphones, commercial plug-ins, background operation, sustained
load or the end-to-end recording workflow.
