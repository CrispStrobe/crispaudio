# Recording, cue monitoring and native input — implementation contracts

Binding rules for count-in/pre-roll, cue racks, native capture/output/files/groups/timing, recovery, qualification. Read before changing that code.
Moved verbatim from CLAUDE.md on 2026-11-23; version numbers mark when each
contract was introduced. User-facing guides live in the other docs/ files.

## Recording lead-in (0.13.26)

recordingLeadIn.ts plans optional countInBars/preRollBars, each 0–4, using the
global musical clock. Existing countIn is seconds: retain it as silent delay.
Selected preparation is bounded to60s. Group input uses maxima. A future engine
play()/playRenderedPreview() anchor aligns playback/count-in to audio frames;
missed explicit deadlines cancel instead of claiming past scheduling. Count-in
uses finite lookahead, not UI timers. Pre-roll uses source handles and takeStart
cropping. Do not crop ordinary latency-compensated placement without pre-roll:
existing multi-input calibration depends on that behavior. Recording backing
can play once before loopStart; extendRecordingPasses uses the first intro length
then regular lap lengths. TimelineMetronome supports the same intro. Stop before
the record frame discards input and publishes no take/file. Changing lead-in or
latency preserves a connected preview; device/channel changes disconnect it.

## Recording cue (0.13.32)

RecordingMonitor owns a separate monitor-only graph; TimelineCapture retains a
silent sink so raw capture/meters survive cue disable/fault. Native cue inserts use
saved static track state, up to two/input and eight total, 1024-frame blocks with
four-block transport delay plus plug-in latency (since 0.13.33, shared per whole input rack). No wet capture or independent cue
device/mix. Await monitoring(false) before native backing preparation and replacement
cues to release sessions. Preview ownership compares immutable native rack identity;
project subscriptions skip transport-only state updates. See RECORDING_CUE.md.

## Shared native cue bridge (0.13.33)

NativeCueRack opens up to two native helpers and runs each block through them in
order behind one NativePluginNode. Per-insert bypass uses FrameDelay for reported
latency; the bridge sees summed plug-in latency. prepareNativePluginNode has an
internal optional stream factory; its default timeline/source path is unchanged.
Do not reduce input block size based on short steady-tone tests: 256/512-frame
candidates missed deadlines and are recorded as rejected evidence. Exact bypassed
impulse timing plus AU/VST3 response/cleanup qualify the shared-buffer change only.

## Native input foundation (development after 0.13.33)

`native_input::mix` sums up to 16 scheduled cue lanes and pre-rendered backing
blocks. Construct/drop off callback; controls require exclusive render ownership.
Never render Graph/helpers on the output callback. Cue faults isolate one lane;
missing/misaligned backing or output clock errors latch whole-mix silence. The
monitored recording owner stops and marks the group incomplete on those faults.
`Output::start_shared` now wires this mixer and a bounded `backing::Worker` reader
to the Mac queue; app integration remains pending. Backing DSP and graph preroll
run only on the worker. Output controls use coherent atomic snapshots and ramp
in the callback. `Group::prepare`/`Session::prepare` split files/cue preparation
from capture start; Drop closes unopened writers before joining.
`session::monitored` now owns readiness/arming/poll/stop; native `inspect()` leaves
cleanup to this owner so captures quiesce before output/backing cleanup and file
joins. Final output failure prevents complete publication. Project timing,
app/Undo integration and physical qualification remain required.

`media::native_input` (native-engine feature) has one non-Clone/non-Sync callback
writer, independent dry/cue SPSC queues and a cue worker with a static AU/VST3 rack.
Do not connect it via JS PCM callbacks: app commands and project-clock
integration remain pending. No installed recording behavior changes yet. Cue
faults suppress pending wet packets and retain dry capture; raw overflow/gaps must
be reported as an incomplete take, never a clean stop. Status cancellation does
not interrupt helper IPC: the owner must also stop registered helpers. Reserve
the group stream budget before opening. See docs/NATIVE_INPUT.md for lifecycle,
scope and focused tests; no latency/hardware qualification follows from these tests.

## Mac capture adapter (development after 0.13.33)

`native_input::macos::Capture` is not exposed by app commands/UI. It opens only
with existing AVCaptureDevice authorization, pins a requested UID and requests
48 kHz interleaved PCM. Channel maps validate against a read-only CoreAudio input
inventory. The callback has an atomic reentrancy guard and no helper/file/WebKit
work; sample time normalizes to input frame zero while host ticks are retained.
Finish accepts partial callbacks during stop; abort faults the take. Inspect the
finish report even on Ok. Userdata survives synchronous disposal; failed disposal
retains it to avoid use-after-free. Owner still needs explicit permission flow,
device checks/watchdog, clock mapping and native dry/output integration.
Mac tests use synthetic callback buffers and fake queue operations, not devices.
Fake queue ownership must outlive Capture even on assertion unwinding. ABI C
fixture is syntax-only against the installed SDK; no hardware/latency claim.

## Native file worker (development after 0.13.33)

`native_input::recording::Recorder` belongs on a file worker, never a callback.
Create its persistent take directory before capture. Float WAV plus immutable
metadata/checksummed block index retain raw samples and input/host origins.
Checkpoints sync WAV before index; ~1 s of accepted frames, not a wall-clock timer.
Finish requires closed/drained/fault-free ingress and matching owner frame count;
publication is a no-replace hard link. Abandoned recorders checkpoint best effort
and cancel; original files remain. Recovery ignores mutable WAV lengths, copies
verified whole blocks only and always reports incomplete. Index hashes are FNV64
for accidental corruption, not authentication. The subprocess fixture skips Drop
and must run only with its explicit test directory; normal CI ignores the helper
but executes its parent test. Native input readers now leave drained EOF clean,
while active/unread abandonment still faults. Fault::Storage=8 stops raw writes.
No app command/UI owner is connected yet. See docs/NATIVE_INPUT.md.

## Native dry recording owner (development after 0.13.33)

`native_input::session::Session` is !Send/!Sync and owns capture on its creating
control thread plus a dedicated Recorder file worker. Durable creation completes
before the device factory runs; startup errors can retain a recovery directory.
`start_macos` checks file/map channel agreement, uses explicit UID and existing
permission only. There is no permission prompt or device fallback. This owner is
dry-only by default; start_with_cue adds a native DSP/helper owner and returns a
single-consumer CueOutput for the scheduler/shared output. Poll at least every
100 ms for device/fault/callback checks;
timeout includes startup and resets on callback progress, not file progress.
A poll fault aborts capture and joins files, with a terminal outcome available.
Stop quiesces capture before final drain and exact frame-count publication.
Cancel/drop preserves queued valid PCM, attempts checkpoint and joins the worker.
Do not delete interrupted directories. Filesystem stalls can delay shutdown.
The per-take cap is 32,000,000 frames, matching native decoded-source limits;
this is not long-session streaming. Group publication, shared output and a
monitored run owner are implemented below; project-clock/app integration is next.

## Native cue ownership (development after 0.13.33)

`session::cue::StreamBudget` must be shared across ALL inputs in one recording
group: eight inserts total, at most two per input. It is not process-wide and does
not count playback helpers. Reserve before rack open; worker owns reservation
until processor/helper cleanup completes, including startup errors/panics. Cue
readiness timeout cancels registered helpers, kills late registrations and joins
before returning; cleanup can exceed the deadline. No detached cue workers.
Session poll reaps cue faults separately from dry faults. On cue queue fault it
also cancels registered helpers to unblock IPC; dry capture continues. Cue fault
and plug-in latency are separate session queries. Stop/cancel/drop quiesce capture,
suppress queued/in-flight wet output, stop helpers and join DSP before file join.
Do not run helper open/process on the capture or file thread. The returned native
CueOutput needs a native consumer; do not route PCM through JS. Generated AU/VST3
checks verify failure isolation and exact dry files, not end-to-end latency/load.

## Native recording groups (development after 0.13.33)

`session::group::Group` owns up to16 Sessions on the creating control thread.
Preflight validates ALL configs, unique IDs, total<=8 cue inserts and total max
frames<=32M BEFORE files/capture. Budget private to group; sequential startup
rolls back earlier captures on a later failure. Do not claim synchronized start.
Stop is two-phase: stop every capture, then join files. Poll uses Session.check_at
without a per-input abort/join so a raw fault quiesces the entire group first.
Cancel/drop retains all recoverable originals. Clean per-input WAVs are private
artifacts until an atomic, no-overwrite completed.json commits the whole set.
plan.json + per-take context retain group/track association. load_completed accepts
all clips or none and checks bounded schema/paths/IDs plus regular WAV metadata/
physical lengths. A post-link directory-sync failure can leave a complete visible
manifest with uncertain durability; reconcile rather than deleting originals.
Project insertion/Undo and physical clock/output alignment are NOT implemented by
this manifest layer. Neither atomic visibility nor process-exit checks prove
power-loss durability. Filesystem work belongs outside audio callbacks.

## Native cue scheduler (development after 0.13.33)

`native_input::output` is a portable cue consumer and integer host-clock map, not
an opened output queue or an app recording mode. ClockMap anchor MUST describe
an established non-looping output frame/host pair; callback arrival/project loop
position/timebase query alone is not that anchor. Subtract ticks before integer
scaling; no float absolute epochs. Scheduler consumes <=8 packets per valid
1..512-frame callback, holds partial packets and uses a fixed first host origin
plus configured delay. Plugin delay is additional. Bounds/rates are explicit,
not shipped latency presets. Small timestamp jitter does not create gaps; excess
accumulated drift mutes instead of silently resampling/repositioning dry clips.
Fault clears WHOLE block and atomically cancels cue; session poll kills/reaps
helpers off callback while dry files continue. Detailed scheduler fault remains
separate from cue Status::Cancelled. Invalid caller buffers clear in full; adapter
must validate/bound its buffers first. Construct/drop scheduler off callback.
Cue worker/scheduler EOF must acquire closed THEN recheck empty: final publication
can race the initial empty pop. Never close helpers or discard a final tail from
an empty read that predates EOF. Generated tests wait off callback for helpers;
no hardware anchor/deadline/physical latency qualification follows. Device-bound
shared output and persisted placements are implemented internally; app wiring and
physical full-path timing remain unqualified.

## Mac cue output adapter (development after 0.13.33)

`native_input::macos::playback::Output` is a !Send/!Sync control-thread owner, still
outside app commands/UI. Uses explicit output UID, 48k float stereo client format,
real AudioQueue timeline, three silent512-frame priming buffers. No system default
or nominal-rate mutation, fallback or permission prompt. Read-only output inventory
shares bounded CoreAudio input inventory parsing. Requires >=2 physical channels;
actual device conversion/layout qualification remains pending.
Clock must be valid sample+host in QUEUE-relative client frames; never substitute
device absolute frames or callback arrival time. Timeline nonnull enables actual
discontinuity reporting. Publish stable initial anchor; arm uses atomics and binds
scheduler before first render. Fixed queue lookahead means delay config alone is
not a roundtrip latency promise. Prepare capture/helpers and arm before ring fills.
Atomic entered guard precedes BOTH PCM and Data mutable borrows (overlap may reuse
same buffer). State.timeline is AtomicPtr; no &mut State survives callback setup/
Start. Callback makes bounded native clock/enqueue calls, no app locks/helpers/IO.
On fault, submit zeros until poll closes queue; queued hardware audio isn't claimed
instantly muted. Stop-induced query/cancel errors do not become new playback faults.
Poll regularly for device/nominal-format, callback AND hardware-frame progress;
stalled clock with busy callbacks must still timeout. Session poll separately
reaps cancelled cue helpers; raw recording stays independent. Telemetry snapshots
are not atomic whole reports; cue played_frames counts rendered PCM, not acoustics.
Failed setup uses explicit complete_setup cleanup, preserving original+cleanup
errors instead of hiding disposal failure in Drop. Stop failure still attempts
Dispose(true). Dispose failure retains Box<State>, no callback UAF; explicit
error+retained fault report, not a successful-release claim.
Only fake-queue tests reclaim a leak after proving their own quiescence. No physical
queue/conversion/timestamp/latency/long/load acceptance from synthetic tests.
Shared backing/cue output and a coordinated owner are now implemented above.
Next: persisted input/backing/project placements, full-path timing, app integration
and physical acceptance.

## Native timing manifests and editor adapter (development after 0.13.33)

`native_input::timing` freezes the complete Intent in each raw take context before
capture. Integer host mapping uses an opaque boot/run scope, explicit timebase and
the output first-mixed frame, distinct from its priming clock anchor. Corrections
are explicit per input (unqualified zero/manual/measured), never cue/plugin delay
or legacy Web Audio latency. Every raw clock/PCM block is checked; excess drift
rejects alignment. Original WAV offsets survive preroll/punch/loop splitting.
Manifest v1 remains untimed; v2 requires timing and recomputes it on reopen.
Alignment failure retains originals and publishes no complete aligned group.
`nativeRecordingTakes.ts` validates sources/project identity and prepares one
existing recording-group transaction; callers must commit it once. App commands
and recording UI are not wired yet. Mid-record output-clock persistence is still
needed for aligned crash recovery; raw prefix recovery alone does not qualify it.
See [handoff](docs/WORK_HANDOFF.md) for N4/N5 and current evidence.

## Native recording commands (development after 0.13.33)

`commands/native_recording.rs` constructs/drops all !Send Mac queues on one actor
thread, polling every20ms independently of GUI timers. State stores only Send
control/status/join handles. NativePlayback's recording lease shares its start
lock and excludes concurrent native output owners. Keep the lease until queues
and workers close. Inputs use explicit CoreAudio UIDs/channel indices; all raw
files live below app-owned recordings. No microphone prompt, global default or
sample-rate mutation occurs. Stop finalizes timed v2; faults/cancel retain files.
Actor owns window/snapshot/exit cleanup. NativeTimelineSnapshot/Recording clients
handle late starts, exclusive transport and close/join. Recording controls are
not wired to this mode yet; preserve the working legacy recorder.
`backing::Worker::recording` renders finite admitted PCM from the frozen timing
intent: delay/count-in, preroll, looping with retained DSP history and separate
monitor clicks. It compensates graph latency before publishing frame zero.
Physical timing/latency and startup cancellation responsiveness remain unqualified.

## Native recording UI preview (0.13.34 candidate)

TimelineRecording now branches to NativeRecordingController only on Mac with the
opt-in settings preference; Compatible remains default. NativeRecordingSetup uses
CoreAudio inventory, separate input.native UID/channels/correctionFrames and app
monitor-output preference. Never reinterpret browser deviceId or latencyMs.
Controller freezes source/project ownership, supports empty backing, native status
meters/cursor and pending-start cancellation. It reads all validated group WAVs,
normalizes project rate with original provenance, then returns one existing
publishNativeRecordingGroup transaction. UI commits once. Project changes/load
failures retain originals without partial publication; unmount cancels. Native
route fields validate on reopen; portable track templates omit device routing.
N4 controls/recovery and N5 physical checks remain open in WORK_HANDOFF.md.

## Ephemeral native monitor controls (0.13.35)

NativeRecordingController owns last/current mix and cue overrides per run, outside
project state. Keep sliders available while muted; restore remembered levels on
unmute and retain state when the settings component unmounts. Coalesce frontend
updates with one in-flight batch and <=8 pending cue IDs; never queue PCM in GUI.
Native actor stores sparse controls, then Output::set_monitor_levels hands coherent
backing/output targets across AtomicU64. Audio callback ramps 64frames; initial
mute is installed at first bind without a unity ramp. Raw queues/files and saved
graph levels are untouched. Live controls replace the frozen cue section during
recording to avoid duplicate controls/slider IDs. Recovery/N5 remain open.

## Durable native recovery (0.13.36)

`native_input::recovery::Ledger` owns a latest-value disk worker; never move its
fsync/JSON work into callback or WebKit. Create the immutable plan before capture.
Only healthy armed output after first observed mixed PCM supplies checkpoints;
use hardware progress, never queued tail or browser time. Reject anchor/timebase
changes and regression. Saved host ticks belong only to that frozen run/boot scope.
Recovery derives fresh indexed WAVs in an atomic all-input directory, verifies
placements through the ordinary timing verifier and always labels them incomplete.
Never overwrite originals or synthesize a clean completed.json. Known symlinks and
unmanaged IDs are refused; app-owned directories are not an adversarial FS boundary.
Recovery's separate native reservation excludes active capture. Compact import UI,
completed-group reconciliation, pagination and owned cancellation are still N4.

## Native recovery review/import (0.13.37)

NativeRecordingRecovery is a collapsed Mac recording section, not an automatic
startup import. Discovery reads metadata only; Review verifies backend clocks/PCM
and uses shared loadNativeRecordingSources before explicit Import. A project change,
close, playback or unavailable target must not publish a partial group. Keep
publishNativeRecordingGroup as one editor/Undo transaction. Portable bounded
nativeRecordingImports run IDs live in project state and validate on save/reopen;
Undo removes them with takes. Path fallback scans only projectSourceIds, never all
cached sources (Undo retains orphans for Redo). Complete marker groups require
load_completed, even when invalid; never fall back to raw salvage. Current backend
verification has no owned cancellation yet; frontend AbortSignal discards late work.

## Recovery jobs, pages and import persistence (0.13.38)

Keep recovery jobs owner-scoped: start/status/close, sparse phase/block counts,
cancel+join and reservation release. Pass Verification through raw copying AND
full/reused timing verification; do not check only before/after a long operation.
Cancellation is cooperative between blocks, not an interruptible filesystem call.
Discovery owns one bounded iterator; project/cursor/owner must match. Each page is
<=512 entries/64 candidates; UI replaces its page, never builds an unlimited list.
Close cursors at EOF/refresh/window or project close; native recording invalidates
idle cursors. Directory mutation requires refresh, not a snapshot guarantee.
Review never persists converted audio. The .38 prepareImport split (superseded by
the owned .40 importTakes coordinator below) performed encoding/persistence
only on explicit Import, then guarded one-action insertion/receipt. That split
could leave a conversion after failure; the .40 transaction flow below supersedes
it. Pass AbortSignal to the encoder and recheck playback before publication.

## Native helper-start cancellation (0.13.39)

Use Group::prepare_cancellable and backing::Worker::recording_cancellable from the
recording actor, with Control::cancelled (Stop OR Cancel). The control-thread
startup::wait polls at <=20 ms scheduled intervals and rejects ready results if
cancellation races acknowledgement. Error paths kill/reap registered and late
helper processes, then join before releasing cue reservations. Do not kill helpers
from the audio callback or change running Stop's capture-before-output ordering.
File-worker creation/flush still joins after an active filesystem call; arbitrary
unregistered blocking code cannot be interrupted. Non-cancellable public wrappers
remain for existing callers. Silent /bin/cat pipe fixtures exercise blocked startup
and late registration without opening devices or environment-wide helper overrides.

## Owned recovery conversions (0.13.40)

Use NativeRecordingRecovery.importTakes/importRecoveredTakes for explicit import;
do not restore the old prepareImport + caller publication split. The coordinator
stages all conversions, durably protects them, checks fresh state and calls one
synchronous publication callback. Mark publicationStarted BEFORE calling the store:
a subscriber can throw after setState/Undo mutation. Such files must stay retained.
A finally finishes with keep=true after publication starts, abort otherwise.

Mac recording_conversions.rs owns tokens per window, holds flock leases and limits
each transaction to eight files/256 MiB. Original persist_recording is unchanged.
Only receipted pending/aborted transactions with known regular leaves are collected,
in <=256-entry pages on later begins. Never delete retained files based on current
project/age/path; Undo, unsaved and other projects may reference them. Do not infer
ownership of pre-0.13.40 files in recordings. Collection/command I/O runs off UI and
audio threads; active file writes finish before rollback. Bind lifecycle cleanup
in main window destruction/app exit AFTER audio owners close; file cleanup must
not delay capture shutdown. Protect precedes observable editor references.

## Native qualification and first-use permission (0.13.41)

Read docs/NATIVE_RECORDING_QUALIFICATION.md before device checks. Build/launch the
isolated Mac preview via npm run native:preview -- --launch, preserving installed
sessions. Profile has a separate identifier/product and no file associations.
Mac debug app_context sets its 16-byte WebKit store only for that exact preview
identifier; current SDK config token generation incorrectly emits Vec for the
array field, so do not restore dataStoreIdentifier to the JSON overlay. The
preparer checks actual embedded config through --print-native-preview-identity,
which exits before constructing owners/windows. Null/empty file associations mean
none. Verification-only does not establish source freshness; default build does.

Only TimelineRecording's explicit Record action calls authorizeNativeRecording.
Undetermined access uses getUserMedia for permission, stops ALL tracks before
native requery/open, and rejects late work on Stop/project changes. Already
Authorized skips browser capture; Denied/Restricted do not loop permission prompts.
Never connect that permission stream or browser timestamps to native take timing.
