# Native input engine foundation

The installed recorder still uses Web Audio capture and the
[buffered native cue](RECORDING_CUE.md). The Rust foundation now includes a Mac
hardware capture adapter, but it is not connected to the recording UI or opened
by the installed app. It introduces no new recording mode and establishes no
monitoring latency. Adapter checks use synthetic callbacks, not a microphone.

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

## Mac capture adapter

`native_input::macos` provides read-only CoreAudio input enumeration and a
device-UID-bound AudioQueue input adapter. It requests interleaved float PCM at
48 kHz, checks the accepted client format and maps selected input channels to
mono (duplicated stereo) or stereo packets. Devices up to 32 channels are supported
by the mapping API. No system default or hardware sample rate is changed.

Opening requires existing `AVCaptureDevice` microphone authorization. This module
only queries permission; it never displays a permission prompt. A recording owner
must handle the explicit user action and authorization flow before opening. Input
rights and the usage description already exist in the Mac app packaging.

The callback maps at most 512 frames, preserves headroom and updates raw peak
meters. Device sample time normalizes to a contiguous zero-based input clock;
packets retain the first-sample host tick. Gaps, repeated/reversed timestamps,
invalid buffers and overlapping callbacks latch an incomplete-take fault. A
finishing queue accepts partial buffers delivered during synchronous stop without
re-enqueuing them. Aborting suppresses further publication. Userdata and producer
remain alive until synchronous disposal finishes. If disposal fails, userdata is
retained rather than risking a late callback into freed memory.

`finish()` can return a report with a take fault even if queue disposal succeeds:
the owner must inspect it before publishing a completed take. `check_device()`
detects a missing device or a changed channel count/rate on the control thread;
the owner must stop promptly and also implement a missing-callback watchdog.
The adapter makes no automatic replacement selection. `HostTimebase` converts
host tick differences to seconds, but does not synchronize capture and backing
clocks or provide arrangement/punch placement.

## Ownership and remaining integration

A recording owner must reserve the group stream budget before opening racks,
register helper stop handles, and cancel both cue status and helpers when stopping
blocked IPC. Queue cancellation alone cannot interrupt a plug-in process. Dropping
the worker releases its rack; dropping it before normal input completion cancels
queued cue output. Empty input queues are normal while waiting for the next
callback. Output underrun detection belongs to the output scheduler.
The dry consumer must keep draining during monitor-only operation too; retaining
packets without a consumer deliberately faults the dry path when its queue fills.

Next connect the adapter and file worker to a recording owner with device-loss/
permission handling, callback watchdog and transport clock mapping. Then connect
a native output scheduler with startup buffering, measured latency,
input/output clock drift handling and fault silence before exposing this in the UI.
Independent cue outputs/backing mixes and wet capture retaining dry originals
follow that integration. Existing Web Audio recording remains available meanwhile.

## Native dry files

`native_input::recording::Recorder` owns the dry reader on a separate file worker.
Create it in an app-owned durable folder before opening input. It writes 48 kHz
float WAV, preserving headroom; mono stores the already mapped left channel.
Take limits respect RIFF32 sizes and a bounded block-index count. The owner must
choose its frame budget and interpret the saved project/track context.

Each unique take folder retains `audio.partial.wav`, immutable `take.json` and
`blocks.bin`. The append-only index binds the metadata and checksums whole audio
blocks, including input frame position and host ticks. Checkpoints update/flush
the WAV, sync its file, then flush/sync the index roughly once per accepted second.
Directory entries are synced on Unix. This bounds buffering but does not promise
power-loss survival beyond a successful checkpoint or qualify slow storage.
The callback never writes or syncs files. A storage failure faults dry ingress;
the owner must stop capture and close its other resources promptly.

`finish(expected_frames)` requires a closed, drained, fault-free dry producer,
nonempty audio and an exact owner count of recorded frames. Only then does it
publish `take.wav` without replacing any file. The published WAV and partial name
are hard links to the same audio, not duplicate PCM storage. Completed originals
and recovery files are retained. Dropping an unfinished recorder marks cancellation
and attempts a final checkpoint; it never publishes a completed take. A drained
input reader at producer EOF closes cleanly; abandoning active/pending input faults.

`recover()` copies only verified whole blocks into a fresh WAV. It checks bounded
metadata, index/sample checksums and clock continuity, ignoring possibly torn WAV
length fields. A corrupt/partial block stops prefix recovery; unindexed audio is
not guessed. It leaves every original intact and never replaces an output file or
follows a known source symlink. Cancellation or failed publication retains source
files. Recovered takes are always marked **incomplete**, even with a clean index;
the index alone cannot establish that capture ended normally. Checksums detect
accidental corruption and are not cryptographic authentication.

Software checks cover exact mono/stereo data, automatic checkpoints, malformed
WAV lengths, torn/corrupt index/audio, overflow, take limits, real OS write failure,
publication collisions and cancellation. A subprocess exits without destructors
to test recovery of its checkpointed prefix. Mac composition tests connect the
actual capture callback (fake queue/generated PCM) to real file writes, retaining
the partial stop tail and a complete dry WAV after a real AU helper is killed.
No hardware input or output queue is opened. [File-worker evidence](evidence/native-recording-files.json).

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

Adapter tests additionally cover mono/stereo/channel mapping, raw meters, invalid
callback layouts/timestamps, overlap, permission preflight, partial stop buffers,
aborted setup and stop/dispose/enqueue errors. They invoke the actual Rust callback
against generated buffers and fake queue operations; read-only device/permission
queries are real. No input queue is opened. The C fixture
`scripts/fixtures/native-input-abi.c` checks FFI layouts and constants against the
selected Mac SDK using syntax-only compilation. [Adapter evidence](evidence/native-capture-adapter.json).
