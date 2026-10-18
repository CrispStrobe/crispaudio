# Native input engine foundation

For the ordered integration tasks and acceptance criteria, start with
[WORK_HANDOFF.md](WORK_HANDOFF.md). These are internal foundations; the installed
recording path remains unchanged.

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

## Dry recording owner

`session::Session` coordinates a single dry capture on its creating control thread
and a dedicated file worker. It is deliberately neither Send nor Sync. Durable
file creation finishes before capture opens. The Mac entry point validates file
channels against the selected input map, uses an explicit device UID and requires
existing microphone authorization. It never requests permission or changes a
system device. Without a cue configuration, it disables unused cue ingress.

Call `poll()` at least every 100 ms. It checks dry faults, unexpected worker exit,
device availability/format and a configurable callback-progress timeout. The
timeout includes startup; progress resets it. Detection depends on the control
thread being scheduled. A fault stops capture and joins the file worker, retaining
a terminal incomplete outcome with its recovery directory.

`stop()` synchronously closes capture before the file worker drains its final
partial buffers and verifies the final frame count. `cancel()` and Drop stop
capture, retain queued valid PCM, checkpoint and join without completed publication.
Startup/open failures also join the worker and return any retained directory.
Filesystem stalls can delay joining; this is not a hard real-time stop guarantee.
No original is deleted. The owner caps takes at 32 million frames to match current
in-memory native graph source limits. Larger streamed sessions remain pending.

This is internal software infrastructure. Grouped atomic clip publication, native
output scheduling and input/backing clock alignment remain required before app
commands, a native recording mode or hardware acceptance.

## Cue worker ownership

`Session::start_with_cue()` adds a native DSP worker and returns its single-consumer
`CueOutput`. It prepares the rack before capture opens. Share one `StreamBudget`
across all inputs in a recording group: at most two static inserts per input and
eight across the group. This budget is separate from playback helpers. Reservations
are acquired before opening and released only after the processor and registered
helpers close, including startup errors and panics.

A readiness timeout cancels opening, kills registered helpers (including helpers
registered after cancellation) and joins the worker. Cleanup may extend beyond the
deadline. Stop/cancel/drop suppress both queued wet packets and late replies,
interrupt helper IPC and join the DSP worker. Session polling also interrupts
helpers when a cue queue faults, so overflow cannot leave a blocked rack running.
Cue failure and output-consumer disconnection mute wet audio and preserve dry
capture. `cue_fault()` reports this independently; `cue_latency_samples()` reports
plug-in delay only. A slow or absent output consumer eventually faults the bounded
cue queue; no automatic restart is attempted.

Portable checks cover concurrent budget admission, startup error/timeout/panic,
processing failure, unconsumed output, blocked processing cancellation and ingress
overflow. Mac checks run real one/two-insert AU and SDK VST3 racks inside the owner:
a killed helper releases every helper and the reservation while an exact 1,536-frame
dry stereo WAV completes. Partial-open failure and a helper registered after startup
cancellation also close. This is software lifecycle qualification with generated
PCM; no output scheduler, physical device, deadline or sustained-load claim.

## Recording groups

`session::group::Group` validates the whole input list before file/device creation:
unique track IDs, valid channel/context limits, at most 16 inputs, two cue inserts
per input/eight per group, and a combined 32-million-frame decoded-source budget.
Each group owns its cue budget. `Group::prepare` creates all files/cue racks before
any capture opens; its returned prepared group retains the unopened writers.
`Session::prepare` provides the same split for one input. Prepared owners close
writers before joining on cancellation/Drop and retain recovery files. Existing
`start` methods use this preparation path internally. Inputs still open sequentially; a later startup failure
stops earlier inputs and retains their recovery files. This is startup rollback,
not synchronized hardware start.

Group stop closes every capture before joining any file worker. Individual clean
WAVs can finish, but they are not a committed group until all inputs succeed.
The owner writes/syncs a complete manifest to private staging, publishes
`completed.json` atomically without overwrite and syncs its directory. A failed
input yields an incomplete group with every available per-input result. Cancel,
Drop and a raw input fault stop all inputs, checkpoint and retain their originals.
Cue faults remain isolated from dry takes. `plan.json` and per-take metadata retain
group/track association for recovery after interrupted startup or capture.

`load_completed()` accepts the whole manifest or returns no clips. It checks
bounded schema/path/ID/source limits, regular files, WAV formats, frame counts and
physical file lengths. Missing/truncated clips invalidate the whole set. This is
reconciliation for app-owned storage, not cryptographic authentication or a hostile
filesystem boundary. If the directory sync fails after manifest publication, the
error explicitly reports a visible manifest with uncertain durability; reconcile
it instead of deleting takes or blindly retrying publication.

This layer returns a group result eligible for one future project transaction.
Actual project insertion/Undo, sample-accurate input/backing alignment and
hardware/load qualification are still pending. Native output scheduling and
coordinated ownership are implemented below.

## Cue scheduling and host-clock math

`output::ClockMap` maps hardware host ticks to a signed, non-looping 48 kHz output
frame clock. It subtracts epochs before scaling with integer arithmetic and rounds
to the nearest frame; negative positions support preroll. The anchor must come
from an established output sample/host relationship. Callback arrival time, a
looping arrangement playhead or querying the Mac timebase alone is insufficient.
The Mac timebase adapter can construct a map but does not establish an anchor.

`output::Scheduler` consumes one native `CueOutput`. For valid adapter buffers of
1–512 frames, each render reads at most eight packets and copies/zeros bounded
PCM, with no allocation, locks, helper IPC, file work or helper destruction. It
handles partial packets and clean EOF. The first host timestamp fixes the cue
origin plus a configured transport delay; reported plug-in delay is additional.
Following packets stay contiguous. Small timestamp jitter does not insert gaps.

Startup silence has a frame deadline, including a first packet dated too far in
the future. Late data, underrun, excess accumulated input/host drift, malformed
clocks, packet-read budget exhaustion and upstream failure latch silence. A fault
clears the whole current block, suppresses later replay and atomically cancels
cue ingress. Session polling closes helpers off the callback; dry recording keeps
running. Successfully rendered earlier blocks remain counted. Invalid caller
buffers are cleared in full and rejected; hardware adapters must bound buffer
sizes before calling this path.

The scheduler detects drift; it does not resample or promise independent-device
synchronization. Startup/delay/drift limits are explicit internal test/configuration
values, not new shipped latency settings. Software tests use generated data and
wait for helpers off callback before rendering. Exact impulse/frame checks,
20 ppm synthetic drift detection and AU/VST3 failure cleanup do not measure
real-time throughput, device conversion or audible round-trip latency.

Cue worker EOF now rechecks input after acquiring the producer's close flag. This
retains a final packet published between an empty read and close. Scheduler EOF
uses the same ordering; concurrent final-publication checks retain short tails.

The Mac output adapter below supplies a queue/host-anchor path. Physical anchor
qualification, input/backing/project mapping and persisted clip placement, drift
correction, full-path timing/load checks and app integration remain pending.

## Mac device-bound cue output

`macos::playback::Output` opens a fixed 48 kHz float stereo AudioQueue on an explicit
output UID. It reads output inventory/nominal format and never changes the system
default or device rate. Setup verifies the client format, creates a real queue
timeline and primes three silent 512-frame buffers. It stays silent until a valid
queue sample/host pair is observed and the caller explicitly calls `arm()`.
Capture/rack preparation and arming must be coordinated before cue buffering fills.

The queue sample clock is relative to queue start; it is not the absolute device
sample clock or a looping project playhead. The callback requires both valid
sample and host timestamps, rejects timeline discontinuities, backward clock
observations and excessive accumulated output/host drift, and binds the scheduler
or whole mixer before its first render. Mixer binding preflights all lanes before
changing any lane. The published anchor is stable. The SDK's timeline and
clock signatures/constants are checked by the C ABI fixture.

Callback state is guarded before any mutable PCM or scheduler borrow, including
when overlapping callbacks supply the same buffer. The callback makes bounded
clock-query/enqueue calls and uses fixed buffers and atomics; it does not perform
helper IPC, file work, allocation or application locking. Normal stop suppresses
clock errors/cue cancellation caused by shutdown. Faulted callbacks submit silence
until control polling stops the queue. This is not a guarantee of immediate mute
of audio already queued in hardware.

Call `poll()` regularly (at least every 100 ms). It checks device availability and
nominal format, callback progress **and** advancing queue time. A busy callback
with a frozen hardware clock still times out. Errors stop/dispose the queue and
cancel cue and backing status; session/backing polling separately kills/reaps
helpers. Raw capture itself continues until its owner stops it. A synchronized
recording owner must mark backing/output clock failure incomplete; surviving dry
files alone do not establish valid project alignment. Reports are atomic telemetry snapshots; cue frame counts describe
rendered data, not measured acoustic playback. `Output` is not Send/Sync and must
be controlled on its creating thread.

Failed setup explicitly closes the partially prepared output and preserves both
the original error and any cleanup error. Stop always attempts synchronous disposal
even if stopping fails. Callback state and scheduler are released only after
disposal establishes quiescence. Failed
disposal intentionally retains state to avoid a late-callback use-after-free and
returns an explicit error; a retained fault report stays readable. This does not
claim the OS queue was released successfully.

Tests invoke the actual Rust callback/clock/scheduler/lifecycle against fake queue
operations and generated timestamps/PCM. Real one/two-insert AU and SDK VST3 racks
release their stream reservations after a callback underrun while an exact
384-frame dry WAV completes. Inventory queries are read-only; no hardware queue is
opened by these tests. Real AudioQueue creation/conversion/timestamps, audible
latency, sustained load and physical hot-plug behavior remain unqualified. The
adapter is not connected to app commands or the installed recording workflow.

## Shared cue/backing mixer (internal)

`native_input::mix::Mixer` sums up to 16 scheduled cue lanes with worker-prepared
stereo backing blocks on one contiguous output clock. Each cue has linear level,
stereo balance and optional mono averaging, independent of backing levels. Valid
control updates interpolate the mixing matrix over 64 frames, including mono
changes. The exclusive render owner applies updates; no shared mutex is introduced.
Float headroom is preserved without an implicit limiter.

Construction/destruction allocate off callback. Render handles at most 512 frames
and 16 bounded schedulers, with fixed scratch storage and no helper/file work.
Individual cue faults mute that lane while backing and other cues continue. A
missing, mismatched or non-finite backing block, output clock gap, invalid buffer
or non-finite sum latches whole-mix silence and cancels cue consumers. Intentional
backing silence/EOF is explicit. The recording owner must react to a whole-mix
fault; silence alone does not establish valid project alignment or stop capture.

`Output::start_shared` now connects the mixer and optional backing reader to the
Mac queue. `set_cue_controls` publishes each gain/balance/mono setting as one atomic
64-bit snapshot; the callback applies the latest value and ramps it, with no
unbounded command queue. Per-lane reports distinguish muted cues from whole-output
faults. The legacy single-cue entry point retains its earlier fault behavior.

`backing::Worker` prepares graph/rack work on its thread and primes a fixed queue
of 16 x 512 frames (or a complete shorter backing). Full means worker backpressure,
not overflow. Its reader handles partial blocks and EOF silence with at most two
packet reads per callback block. Missing promised PCM latches failure without
skipping/replaying or advancing the consumed counter. Helpers must register stop
handles before blocking startup; timeout/cancellation kills registered helpers and
joins off callback. Arbitrary blocking renderers must cooperate with cancellation.
Graph preparation warms source history plus plug-in latency before publishing a
finite selected project range; current decoded-source/frame limits still apply.
This queue is bounded transport, not a new disk-streaming capability.

`session::monitored::Prepared`/`Run` now coordinate readiness, capture start,
arming, health polling and ordered shutdown. The native output's `inspect()`
reports health without closing; the owner quiesces all captures first, then stops
output/backing and joins cue/file workers. `Group::stop_with` gates completion on
external finalization; `interrupt_with` retains incomplete files after loss/cancel.
A final output/disposal error prevents a complete marker. Call owner polling at
least every 100 ms; this cannot supply a hard deadline while control/storage stalls.

Persisted input/backing/project placement, app/Undo integration and physical
latency/load qualification remain open. This owner does not infer project timing
from callback arrival or declare independent devices synchronized. Tests use generated
PCM and synchronous pass-through cue workers, with no physical devices.

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

## Validated timing and project adapter — development after 0.13.33

The internal timing path now persists a complete pre-capture intent with boot/run
scope, integer timebase, project/punch/loop windows and separate explicit placement
corrections. Output activation is the first mixed frame after arming, distinct
from its stable priming clock anchor. Raw block clocks and PCM checksums are
verified before placement; excessive drift rejects alignment without silently
resampling. Lead-in/punch/loop splits retain original source offsets.

Manifest v2 requires timing; v1 remains readable as untimed raw audio. Reopen
recomputes v2 timing from verified originals. Alignment failure retains the dry
files and withholds complete group publication. The editor adapter validates the
whole group and original project identity, then prepares one existing take/comp
transaction with Undo/Redo and save/reopen coverage. App commands/UI do not call
this adapter yet; the installed recorder is unchanged.

Activation/progress clocks are finalized only at clean stop. Verified raw prefix
recovery therefore does not yet provide aligned interrupted-session recovery; a
durable in-run output-clock ledger remains required. Physical clock accuracy,
independent-device correction, round-trip latency and load tests remain open.

Validation: 143 focused native tests including SDK VST3/subprocess fixtures;
308 media tests passed, 16 ignored; 2025 frontend tests across 208 files; full lint,
production build and SDK C ABI syntax checks passed. No physical input/output,
app Rust build, simulator, bundle or installation was run for this checkpoint.
[Timing evidence](evidence/native-recording-timing.json).

## Native recording commands and backing transport — development after 0.13.33

Mac app commands now own recording on a dedicated control thread. Explicit
CoreAudio UIDs/channel maps, app-owned storage, native timing, meter reports and
sparse cue updates cross the IPC boundary; WebKit does not feed PCM or drive
capture timing. A shared reservation excludes concurrent native playback output.
Owner/token checks protect controls; snapshot/window close and exit cancel/join.
Errors retain originals and report their recovery directory. A typed snapshot
client prevents concurrent transports and cleans up late starts.

The worker now follows the same frozen timing intent for silent delay, audible
count-in, preroll and loops, including native graph latency compensation and
retained DSP history. Click onsets use an arithmetic musical clock, remain
independent of render-block size and stay outside dry recordings/exports.

Software checks pass: 313 media tests (16 ignored), 46 app Rust tests (one hardware
case ignored), plus typed-client lifecycle/cleanup tests, lint and production
build. The installed app is unchanged. No physical input/output, simulator,
bundle or installation was run. The visible recording controls are not wired to
this mode yet. Independent backing controls, aligned crash recovery and hardware
qualification remain pending. [Command evidence](evidence/native-recording-commands.json).

## Native recording UI preview — 0.13.34 candidate

Mac Input settings now offer Compatible (default) and Native · Preview. Native
uses explicit CoreAudio input/channel maps and an app-local monitor output; saved
native correction is separate from browser IDs and compatible calibration. The
existing Record/Stop button and persistent meters drive either path. Advanced
native timing stays collapsed; short EN/DE labels and contextual info are used.

`NativeRecordingController` owns snapshot/start/stop/loading on the frontend.
Native status supplies playhead/meter reports; browser clocks never place takes.
A complete group loads before one editor transaction. Project-rate conversion
retains original WAV provenance. Stale projects, decode failures and invalid paths
insert no partial group; originals remain available. Pending-start/lead-in Stop and
unmount cancel without late publication. Blank sessions work through a positive
frozen backing duration without changing the editor project.

The full frontend suite passes 2045 tests across 211 files; lint and production
build pass. Generated lifecycle tests cover immediate Record without a dialog,
meters/playhead, Stop/preparation/teardown and single Undo; controller tests cover
UID resolution, count-in/loops, complete loading, provenance, reopen and failures.
English 1100×800 and German 820×650 browser layout checks pass with generated device
inventory and no hardware audio. A Mac debug candidate is built and its sandbox/
helper signing layout is checked with local ad-hoc signatures. Installed 0.13.33
is preserved; no physical capture/output or Apple upload is claimed.

N4 still requires live independent backing/cue controls, preparation-cancellation
qualification and durable in-run clock recovery. Physical timing/latency/load,
external-device and iOS acceptance remain N5. Native mode remains opt-in.
[Preview evidence](evidence/native-recording-ui-preview.json).

## Native live monitor mix — 0.13.35 candidate

Native recording now offers a collapsed live Monitor mix with backing/output
attenuation, mute and per-prepared-input cue gain/balance/mono. Edits live in the
run's controller and leave the project, Undo history, raw samples and take clocks
unchanged. Closing settings retains the mix; a new run starts from saved presets.
Muted faders can be adjusted, and unmute restores their remembered level.

One in-flight frontend control batch coalesces new values, while the actor hands
coherent monitor targets to output atomics. The callback ramps changes over 64
frames; initial levels are installed before first mixed PCM, including exact mute.
Backing includes monitor clicks; output gain applies to backing plus cues. No
GUI lock, plug-in call or file write was added to the output callback.

Validation: 2054 frontend tests/212 files, 314 media tests (16 ignored), 46 app Rust
tests (one hardware case ignored), 21 release checks, full lint and production
build pass. Fake-queue callback checks include independent gain, ramps, muted start,
invalid controls and unchanged raw PCM. Generated monitor UI passes EN1100×800,
DE820×650 and DE390×800 with numeric editing/no horizontal overflow. The Mac debug
candidate passes local ad-hoc sandbox/helper signing checks; installed 0.13.33 is
preserved. No physical mic/output, iOS simulator, installation or Apple upload.

Aligned crash recovery, helper-opening cancellation qualification and N5 physical
latency/load/device checks remain pending. [Mix evidence](evidence/native-recording-monitor-mix.json).
