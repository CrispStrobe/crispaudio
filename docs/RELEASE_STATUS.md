# Distribution and platform status — 2026-10-17

Pushing `main` runs CI and the unsigned iOS simulator check. It does **not** submit
an iOS or macOS build to Apple. Repository web deployments use their own triggers;
external hosting integrations may differ. No release tag or Apple upload was
triggered for this local checkpoint.

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

## Shared native output and recording owner — 2026-10-18

Internal Mac output now consumes the shared cue mixer and bounded worker-prepared
backing. Control updates are coherent atomic snapshots with short ramps. The
whole-run owner prepares files/racks before capture, waits for the output clock,
arms after input startup and quiesces captures before output/backing cleanup and
file joins. Clock/backing/finalization faults retain incomplete recovery data and
prevent a complete group manifest. Sequential hardware starts are not synchronized
merely by this software sequencing.

Twenty-one additional tests pass: full media **299 passed, 16 ignored**; explicit
native-input **134 passed**, including AU/VST3 fixtures. The working installed
0.13.33 app is unchanged. No physical input/output, frontend/app build, simulator,
installation or Apple submission is claimed for this internal checkpoint.
[Evidence](evidence/native-monitored-recording.json); [next tasks](WORK_HANDOFF.md).

## Wrap-up checkpoint — 2026-10-17

The current code checkpoint is `962cc74` (internal shared native mixer); installed
0.13.33 remains unchanged. [WORK_HANDOFF.md](WORK_HANDOFF.md) is the current
engineering entry point with ordered tasks, dependencies and completion criteria.
This documentation wrap-up does not ship a new app or submit a build to Apple.

At the final pre-commit refresh, both code-checkpoint workflows were queued:
[general CI](https://github.com/CrispStrobe/crispaudio/actions/runs/39008195395)
and [iOS CI](https://github.com/CrispStrobe/crispaudio/actions/runs/39008195374).
For the preceding `59f0e4c`, general CI succeeded; iOS CI was cancelled. These
results do not establish green CI for the current code or this documentation commit.
Check live run status when resuming.

Historical evidence log names identify local artifacts, not committed attachments.
Their machine-specific locations are preserved only in the ignored local notes.
Personal walkthrough paths have been replaced with portable examples. This changes
the current tree; it does not remove previously committed paths from Git history.

## Apple and baseline CI refresh — 2026-10-16

Read-only App Store Connect checks from the VPS confirm public iOS 0.3.0 remains
`READY_FOR_SALE`; native Mac 1.0 remains `PREPARE_FOR_SUBMISSION`. Both platform
0.13.0/build 14 binaries are `VALID` and unexpired. Current internal/external review
states were not established: detail requests timed out/returned 404 and included
state fields were null. This does not establish rejection or build removal.
[Sanitized refresh](evidence/apple-store-status-2026-10-16.json).

Preceding main c1ec01a (0.13.21) passed both [general CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38911051561)
and [iOS CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38911051851).
This does not claim remote validation for the subsequent scope-cleanup commit.

## Shared cue/backing mixer — development after 0.13.33

An internal portable mixer now combines up to 16 scheduled cue lanes with prepared
backing PCM. Cue level, stereo balance and mono changes ramp over 64 frames. Cue
failure leaves other lanes/backing running; backing/clock faults latch whole-output
silence for the future recording owner to handle. It preserves float headroom and
rejects non-finite output. No physical queue, permission prompt or test tone was
used. Installed 0.13.33 is unchanged; hardware mixer wiring, backing worker handoff,
coordinated arming, project placement/Undo and physical qualification remain open.

Six generated-PCM mixer tests pass within the full media suite (278 passed,
16 ignored); app Rust checks pass (39 passed, one ignored). These are
deterministic software checks, not sustained-load or physical-latency evidence. See [scope](evidence/native-shared-mixer.json).

## Mac cue output adapter — development after 0.13.33

A Mac AudioQueue output adapter now selects an explicit output UID, verifies its
48 kHz float stereo client format and primes three silent buffers. It creates a
real queue timeline, requires valid queue sample/host timestamps, and stays silent
until clock readiness and explicit arming. Callback/scheduler faults, device/format
changes and stalled callback or hardware-frame progress trigger shutdown. It does
not change the system default or nominal rate. Dry recording remains independent.

All 107 focused native-input checks pass with explicit SDK VST3 and subprocess
fixtures. The full media suite passes 272 with 16 ignored; app Rust passes 39
with one hardware case ignored, and Python release checks pass 21. Adapter tests invoke the actual Rust callback with simulated queue
operations, covering exact scheduling/arming, invalid clocks and timeline gaps,
watchdogs, device loss, overlap on the same PCM pointer, stop races and disposal
errors. Setup failures preserve original and cleanup errors. Failed disposal retains
callback state and reports uncertain release rather than allowing use-after-free.
Actual one/two AU and SDK VST3 racks close after a callback/scheduler underrun while
an exact 384-frame dry stereo WAV completes. The C fixture checks output timeline,
clock and construction signatures against the selected Mac SDK.
[Adapter evidence](evidence/native-output-adapter.json).

No hardware input/output queue was opened. Inventory checks are read-only; queues,
timestamps and PCM are simulated in callback tests. Actual queue creation/device
conversion, audible latency, sustained load and physical hot-plug remain unqualified.
The adapter is not connected to app commands or installed recording. Shared cue/
backing mixing, input/backing/project clock mapping and persisted placements,
drift correction and coherent owner/app integration remain next. Installed 0.13.33
is unchanged; no bundle/install, permission prompt, Apple upload or release tag.

Preceding `701fc33` general CI `39003165534` was queued and iOS CI `39003165532`
pending at the initial refresh; both older `4dc299b` runs were cancelled. No remote
green result is claimed for this output adapter increment.

## Native cue scheduling — development after 0.13.33

A native cue consumer now maps host tick differences to signed 48 kHz output
frames with integer arithmetic. It preserves partial packets, bounds startup
silence, and keeps timestamp jitter from inserting gaps. Late data, underrun,
excess drift, bad clocks and exhausted packet-read budget latch a silent block;
session polling reaps cue helpers while dry recording continues. A clean-EOF
publication race is fixed in both the cue worker and scheduler, retaining final
packets published after an initial empty queue read.

All 92 focused native-input checks pass with explicit SDK VST3 and subprocess
fixtures. The full media suite passes 258 with 15 ignored; app Rust passes 39
with one hardware case ignored, and Python release checks pass 21. New checks cover exact impulse/negative-zero PCM through unequal blocks
and EOF, signed/large-uptime clock math, bounded startup, late/underrun suppression,
small jitter, accumulated synthetic 20 ppm drift, concurrent packet-read bounds
and 128 concurrent final-publication iterations. With one/two actual AU and VST3
inserts, a scheduler underrun closes the cue rack/reservation while an exact
384-frame dry stereo WAV still completes. No input/output device queue is opened.
[Scheduler evidence](evidence/native-cue-scheduler.json).

This is software scheduling qualification. Tests wait for helper replies off
callback and do not establish real-time throughput or audible latency. A hardware
output adapter and trustworthy output sample/host anchor are still required,
followed by input/backing/project mapping, persisted clip placements, drift
correction where necessary and full-path timing/app integration. Installed 0.13.33
is unchanged; no bundle/install, physical audio check, Apple upload or release tag.

The preceding group commit `4dc299b` general CI `39001569390` and iOS CI
`39001569362` were still queued at the initial refresh. No remote green result
is claimed for this subsequent scheduler increment.

## Native recording groups — development after 0.13.33

A native group coordinator now validates all inputs before opening any, rolls back
partial startup and stops every capture before joining file workers. Individual
WAVs remain private recording artifacts until every input succeeds and the owner
atomically publishes a complete, no-overwrite group manifest. Interrupted/failed
groups retain their originals and per-input recovery outcomes. Restart loading
accepts all referenced clips or returns no clips; it rejects missing/truncated
files, bad paths, duplicate tracks/audio paths and incompatible metadata.

All 75 focused native-input checks pass with the explicit SDK VST3 fixture and
both subprocess support cases. The full media suite passes 242 with 14 ignored;
app Rust passes 39 with one hardware case ignored, and Python release checks pass 21. New group checks cover startup rollback, stop
failure, raw faults/cancel/drop, cue-fault isolation, whole-group budgets,
publication collisions and malformed/symlink audio references. A subprocess exits
without destructors between individual take completions: one complete WAV remains,
but no complete group is accepted. Normal two-input stop retains both 31-frame
partial tails and reopens two exact 159-frame takes.
[Group evidence](evidence/native-recording-groups.json).

Inputs still open sequentially: this does not establish synchronized hardware
start or sample alignment. A post-publication directory-sync failure can leave a
fully formed visible manifest with uncertain durability; restart reconciliation
handles that state. Actual project insertion/Undo, native output scheduling and
input/backing clock mapping remain pending. No physical input/output queue, app
bundle/install, permission prompt, Apple upload or release tag. Installed 0.13.33
is unchanged. Obsolete local executable caches were pruned, preserving the newest
eight and active/recent executables; free space rose from 1.8 to 6.4 GiB.

Preceding `92bbbf3` general CI `39000521269` was queued and iOS CI `39000521226`
pending at the initial refresh. The preceding `dafad14` runs were cancelled.
These remote states do not establish validation of this group increment.

## Native cue ownership — development after 0.13.33

The recording owner can now prepare and own a separate native cue worker. Each
input can reserve up to two AU/VST3 inserts from a shared eight-insert recording
group budget. Startup cancellation kills registered helpers, including late
registrations, and joins the worker. Capture stop/cancel also suppresses queued
and in-flight wet audio before helper/worker cleanup. Runtime cue faults release
the rack while dry recording continues; cue status is separate from take status.

All 63 focused native-input checks pass with the explicit SDK VST3 fixture and
subprocess support case. The full media suite passes 231 with 13 ignored; app Rust
passes 39 with one hardware case ignored, and Python release checks pass 21. New tests
cover concurrent budget admission, startup failure/timeout/panic, blocked processing
cancellation, ingress/output overflow and a disconnected consumer. One/two real AU
and SDK VST3 helpers are killed inside the session owner; all helpers and reserved
slots close while an exact 1,536-frame dry stereo WAV completes. Partial rack open,
capture-open failure and late helper registration also clean up.
[Lifecycle evidence](evidence/native-cue-owner.json).

These are generated inputs and local helper/file processes. No physical capture
or output queue was opened. The cue output still needs native scheduling and
input/backing clock mapping; grouped atomic clip publication and app integration
remain pending. Startup timeout triggers cleanup but cannot promise a hard return
deadline. No installed app change, Apple upload or release tag.

The preceding `dafad14` main/iOS CI runs were still queued at the initial refresh.
The older file-worker general run `38998491514` is cancelled; its iOS run passed.
These remote states do not replace local validation of this increment.

## Native dry recording owner — development after 0.13.33

A control-thread session now owns dry capture and a separate file worker. Files
are created before opening capture. Device/format checks, dry faults, unexpected
worker exit and a callback-progress timeout end capture with recovery information.
Stop accepts the final partial buffer, closes capture and verifies the final frame
count before publication. Cancel/drop joins the worker and retains originals.
The current decoded-source budget caps each take at 32 million frames.

All 52 focused native-input checks pass, including the explicit SDK VST3 fixture.
The full media suite passes 221 with 12 ignored; app Rust passes 39 with one ignored;
Python release checks pass 21. A new composition test uses the real Mac callback
and stop/dispose code with a simulated queue: the owner publishes all 159 frames,
including the 31-frame stop tail, after capture disposal. Other owner tests cover
startup/layout rejection, cancellation/drop, callback progress/stalls, device loss,
raw faults, file-budget failure and stop errors/count mismatches.
[Owner evidence](evidence/native-recording-owner.json).

No physical input/output queue was opened and no permission prompt was requested.
This owner is dry-only and not connected to app commands/UI. Cue helper ownership
and group stream budgets, grouped atomic clip publication, native output scheduling
and input/backing clock synchronization remain next. Filesystem stalls can delay
shutdown; sustained load, physical devices and long-session streaming remain
unqualified. Installed 0.13.33 is unchanged; no Apple upload or release tag.

The preceding file-worker commit `d9edc0d` passed
[iOS CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38998491507).
Its [general CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38998491514)
was still queued at this checkpoint; neither run qualifies this subsequent change.

## Native dry-file worker — development after 0.13.33

Native recording now has a file worker for float WAV and a checksummed block
index, with periodic ordered syncing. A complete take requires a closed/drained,
fault-free producer and matching owner frame count. Interrupted files remain
recoverable; prefix recovery ignores torn WAV length fields, verifies whole
blocks and always labels its output incomplete. Existing files are never replaced.

All 43 focused checks pass with the explicit SDK VST3 fixture and subprocess
support case. The full media suite passes 212 with 12 fixture/platform cases
ignored. Its parent recovery test still executes the ignored child support case
in a separate process, which exits without destructors and recovers 159 durable
frames. Mac software composition retains a partial stop tail and records 12,288
exact dry stereo frames after a real AU cue helper is killed.
App Rust checks pass 39 with one hardware case ignored; the 21 Python release
checks pass. No new frontend or iOS simulator run is claimed for this increment.
[File-worker evidence](evidence/native-recording-files.json).

These are generated callback inputs, fake AudioQueue operations and real local
file/helper processes. No microphone or output queue was opened. Slow/full-drive,
power-loss and physical-device behavior remain unqualified. The recording owner,
watchdog and native backing/output clock integration are next. No new installed
app version, Apple upload or release tag; installed 0.13.33 is unchanged.

The preceding adapter commit `8bf8a9f` passed
[general CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38994968839) and
[iOS CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38994968833).
Those runs precede this file-worker increment.

## Mac capture adapter — development after 0.13.33

The native input foundation now has a Mac AudioQueue adapter bound to an explicit
device UID, with mono/stereo channel mapping, existing-authorization checks,
sample/host clocks and raw peak reports. The callback validates frames and guards
against reentrancy. Finish retains partial callbacks delivered during stop;
abort/error paths mark recoverable prefixes as incomplete. Callback userdata
survives synchronous disposal, including failure handling.

All 29 focused input checks pass, including the explicit SDK VST3 fixture from
the preceding worker implementation. Adapter tests use generated buffers and fake
queue operations; inventory, authorization and host-timebase queries are read-only.
The C ABI fixture and Rust layout checks agree with the selected Mac SDK.
The full media library passes 199 tests with 11 platform/fixture checks ignored;
the app Rust library passes 39 with one hardware check ignored. The 21 Python
release checks pass. Frontend code is unchanged.
[Adapter evidence](evidence/native-capture-adapter.json).

No hardware input queue was opened, permission prompt requested, or app build
installed for this increment. Physical device opening/conversion/timestamps remain
unqualified. A recording owner/watchdog, dry-file recovery and native output/clock
integration are still required before exposing this in the app. Installed 0.13.33
and its Web Audio recording workflow remain current. No Apple upload or tag.

The preceding input-foundation commit `7d2f384` passed
[general CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38968651578) and
[iOS CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38968651228).
Those runs precede this adapter increment.

## Native input foundation — development after 0.13.33

The Rust media engine now contains independent bounded dry/cue input queues and a
native worker rack for static AU/VST3 inserts. Cue failure/cancellation suppresses
queued wet audio while dry capture continues; input gaps or dry overflow explicitly
mark an incomplete take. [Implementation and integration scope](NATIVE_INPUT.md).

This code is not connected to hardware capture or the recording UI. Installed
0.13.33 remains the current app; no new application version or Apple upload is
part of this foundation checkpoint. Hardware ingress, native dry persistence,
clock conversion and output scheduling remain required before native recording
can replace the existing Web Audio path.

The 14 focused checks pass with an explicitly supplied SDK VST3 fixture, including
actual native-worker AU/VST3 output against offline references and helper fault
cleanup. The full media library passes 184 tests with 11 platform/fixture checks
ignored; the focused invocation runs the otherwise ignored input VST3 check.
App Rust library checks pass 39 tests with one hardware check ignored, and the
21 Python release checks pass. Frontend code is unchanged; its earlier 2,020-test
result is not a new run for this increment.
[Evidence and limits](evidence/native-input-foundation.json). Mac CI now explicitly
runs the input AU checks; Linux media CI already covers the portable queues.

The installed 0.13.33 baseline commit `58c50e6` passed both
[general CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38957944073) and
[iOS CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38957944069).
Those runs precede the native input foundation changes.

## Local 0.13.33 — one bridge for the whole native cue rack

A native cue rack now uses one Web Audio bridge for up to two saved inserts.
The transport contribution for two inserts is **4096 samples instead of 8192**:
85.3 ms instead of 170.7 ms at 48 kHz, plus summed reported plug-in latency.
Individual insert order/state and latency-matched bypass remain intact. A changed
latency or processing error closes the entire cue; raw capture remains separate.
Timeline/source bridges keep their default single-stream path.

Actual Mac Tauri/WebKit checks pass one/two AUBandpass and SDK ADelay VST3 chains,
eight seconds each at 48 kHz, with expected response and zero owned sessions after
close. Bypassed AU impulse checks measure exactly 4096 transport samples for both
rack sizes. [Shared-buffer measurements](evidence/recording-cue-shared-buffer.json).
Smaller 256/512-frame per-insert candidates missed deadlines and are not shipped;
[rejected evidence](evidence/recording-cue-rejected-buffers.json) preserves that result.
These are bounded generated-input checks, not physical input, commercial plug-in,
background, long-session or heavy-load qualification.

Final frontend **2,021 tests pass in 207 files**. Lint, TypeScript/web build and 21
release checks pass. The existing cue browser test verifies actual capture/native
worklets, real AU DSP through a separate Node fixture bridge, dry signal retention,
transport-fault isolation, level/pan/mono, inspector numeric edit/one Undo, reopen
and German 390 px layout. Test language is explicitly set before selecting controls.
The final normal Mac debug bundle passes in 33.73 s (existing Rust warnings).
Local 0.13.33 is installed/reopened, strict/deep ad-hoc signature verified, with one
autosave retained and a recovery backup. No new full Rust/iOS or physical listening
claim; no Apple upload or tag.

Locally, 155 old generated build-script directories were removed from this repo's
debug cache, retaining the newest 20 and all source, helper outputs, installed apps
and session backups. Roughly 2.5 GiB was recovered. These are regenerable artifacts.
Native input ingress, independent cue devices/mixes and wet capture remain open.

## Local 0.13.32 — separate recording cue and buffered native inserts

Recording now has a separate per-input cue level, pan and mono under collapsed
Input → Cue mix. Takes, raw meters and capture timing remain dry. Optional Mac
native track inserts use saved static settings, up to two per input/eight total,
with the 4096-sample bridge delay per insert plus plug-in latency displayed.
Monitoring off, cancellation, ownership changes and faults release cue sessions;
faults mute the cue while the raw capture worklet continues. Cue settings persist
in projects/templates; templates start unarmed, monitoring off/default device.
Native rack identity changes invalidate warm input; transport-only store updates
avoid repeatedly cloning/serializing plug-in state.

Final frontend: **2,014 tests pass in 206 files**; lint, TypeScript/web build and
21 release checks pass. Actual Mac WebKit/Tauri IPC with the current bundled AU
helper passes generated-input one/two-AUBandpass cue chains at 48 kHz, two seconds
each, with expected response/delay and an empty native registry after close.
[Sanitized measurements](evidence/recording-cue-native.json).

Muted Chromium checks use real capture/native worklets, generated MediaStreams
and an actual AU helper through a separate Node pipe fixture bridge. Cue level is
compared with an offline render of the same AU. They cover dry capture, mono/pan,
injected transport failure without losing raw PCM, stream release, inspector
numeric edits/one Undo, saved settings/reopen and German 390 px layout. Existing
multi-input and warm-preview ownership regressions pass. These measurements do
not qualify physical microphones, VST3/commercial cue chains, sustained load or
background use. No new full Rust suite/iOS build/physical listening claim.

The final normal Mac debug bundle passes (26.62 s, existing Rust warnings), with
the updated EN/DE cue help verified in the final dist. Local 0.13.32 is installed
and reopened, strict/deep ad-hoc signature verified, one autosave retained and a
recovery backup created. Count-in/pre-roll regression also passes on a fresh dev
server (the earlier prototype probe used a stale HMR module identity).

The cue shares the current playback output. Low-latency native input DSP, wet/dry
capture, separate headphone devices/backing mixes, PFL/AFL and dim remain open.
See [Recording cue mix](RECORDING_CUE.md). No Apple upload or release tag.

## Local 0.13.31 — restoration quality and frequency selection

Restoration uses a logarithmic frequency axis including DC. Display bins, band
shading and mouse/touch selection share one mapping; cancelled touch gestures
restore the previous band. Other spectrograms keep their linear defaults. Captions
reflect the selected window and colour floor. The German 390 px layout fits.

Nonstationary deterministic fixtures cover changing voice-like envelopes,
percussion and sweeps, plus mains removal at 8–192 kHz. The repeatable
[quality report](evidence/source-restoration-material.json) includes clean-signal
damage. Declipping improvements are modest on noisy/transient fixtures (about
0.5–1.1 dB), unlike the sweep (about 27 dB). These are synthetic reference-error
measurements; real recordings and physical listening remain unqualified.

Frontend: **2,003 tests pass in 205 files**. Lint, TypeScript/web build and 21 release
checks pass. Browser checks cover actual mouse and CDP touch band selection/cancel,
real restoration workers, stale/cancel handling, unchanged channels/ranges,
one Undo/Redo, retained originals, temporary float WAV bytes, linked reopen and
render. Native storage is fixture-bridged; native plug-in DSP and physical iOS
are not qualified by those browser checks. No new Apple upload or release tag.

The normal macOS debug bundle passes (1m 41s; existing Rust dead-code warnings).
Local 0.13.31 is installed/reopened, strict/deep ad-hoc signature verified and the
one autosave retained, with a recovery backup. Rust logic is unchanged apart from
the version; no new full Rust suite, iOS build or physical-device check is claimed.

Native input FX/cue routing remains the next accepted implementation area.

## Local 0.13.30 — bounded source restoration and audition level

Source Editor offers cancellable de-hum, selected-band spectral attenuation and
short hard-clip reconstruction through the existing preview/A-B/Apply path. The
spectrogram supports band dragging and numeric bounds. Parameters persist with
derived audio; originals, outside-range samples, other channels and timing remain
intact. Preview request ownership also covers native source helpers, so older
results cannot replace a newer requested preview.

Separate editable audition gain is shared by Original/Preview. Hot sources and
prepared restorations get sample-peak monitor headroom; saved float audio retains
reconstructed levels above full scale. This is not automatic loudness matching.
Worker memory/duration/context limits and tool-specific quality limits are explicit
in [the restoration guide](RESTORATION.md).

The final frontend suite passes 1,989 tests (203 files), with source DSP, worker
ownership/cancellation, headroom and stale-result checks. Browser checks measure
mains/harmonics, target-band reduction and short-clip error against known synthetic
signals; they also exercise real workers, cancellation, float WAV, linked reopen,
render, metadata, one Undo/Redo, hot-source replay and German 390 px layout. These
are fixture-specific measurements, not varied-material/physical listening claims.
Final full lint plus changed-source/DSP/script lint, TypeScript, 21 release checks
and the normal Mac bundle pass. Existing audition, manual repair and touch source
editing regressions pass. The local 0.13.30 app is installed/reopened with strict/deep
ad-hoc signature verification and its one autosave preserved.
[Evidence](evidence/source-restoration.json).

No new full Rust test suite, signed iOS build or physical audio acceptance is added. Spectral
healing/inpainting, drifting-noise tracking, general click detection, automatic
loudness matching and broader material qualification remain open.

## Local 0.13.29 — channel utilities and manual click repair

Source Editor gains a compact Channels & repair dropdown: invert polarity, stereo
swap, dual-mono average, side-copy and manual click repair. Stereo tools require
All channels and keep channel count/timing. Inversion/repair respect the chosen
channels/ranges. Utility previews use the existing Original/Preview and one-Undo
Apply path; originals and samples outside the edit remain intact.

Repair interpolates gaps up to 1 ms between clean neighbours with bounded cubic
curves. It requires two clean samples on either side/between gaps. Audition adds
100 ms of context per side without expanding the repair itself; overlapping
listening windows merge. Zoom to selection and connected samples/dots fix the
previously disappearing close-zoom waveform. The prepared operation is named
beside Apply. A short synthetic click fixture improves its selected-gap error;
this is not a general perceptual-quality or spectral-restoration claim.

All 1,971 frontend tests (200 files), 22 focused checks, full lint plus final
changed-source/script lint, TypeScript, 21 release checks and the final normal Mac
bundle pass. Browser tests cover all six operations, a real temporary float WAV,
linked reopen/render, original/Undo preservation, context-only audition padding,
close-zoom drawing and German 390 px layout. Existing touch source-editing and final
continuous-audition regressions pass. The local 0.13.29 app is installed/reopened
with strict/deep ad-hoc signature verification and its one autosave preserved.
[Evidence](evidence/source-repair.json). No new physical
listening, native plug-in DSP, full Rust suite or iOS build is claimed. Spectral
repair, de-hum, declipping and general click detection remain open.
[Source guide](SOURCE_EDITING.md).

## Local 0.13.28 — continuous source comparison

Source Editor now preserves audition position across Original/Preview, cleanup
preview changes, Reset and loop toggles. The source cursor maps joined ranges;
normalization target edits update an active preview during valid typing/scrubbing.
A/B controls sit beside playback with a visible active choice. Apply is still a
separate undoable edit. Opening/redrawing the editor does not allocate playback PCM.

The source-only engine explicitly anchors 10 ms gain ramps, including rapid swaps,
and bounds fading voices. Recording, source changes, arrangement playback and
close release audition. Native source effects still prepare offline previews;
completed renders can update running audition. This does not qualify a live native
FX graph, loudness matching, streaming, physical outputs or physical iOS.

Desktop/touch source-editing regression checks pass: source headroom, channel/range
processing, retained originals, one Undo/Redo, regions, loop audition, analysis,
linked lock atomicity, capture protection, German layout and save/reopen/render.
All 1,962 frontend tests pass (199 files), with 21 final focused numeric/audition
checks after live-target wiring. Browser PCM/comparison/lifecycle checks pass: zero
measured clock error, continuous rapid-swap level, unchanged project/Undo, and
recording/source/timeline/close cleanup. Full lint plus final changed-source/script
lint, TypeScript, 21 release checks and the final normal Mac bundle pass.
[Evidence](evidence/source-audition.json). The local 0.13.28 app is installed and
reopened with strict/deep ad-hoc signature verification; its autosave is preserved.
[Source editing guide](SOURCE_EDITING.md).

## Local 0.13.27 — reusable track/input/FX templates

The native Edit menu, touch command ribbon and Track Settings open a compact
picker, with mono/stereo/speech low-cut starters and a local custom library. Saving
is collapsed; explanations are behind (i). Templates retain static input timing,
level/pan, waveform mode and saved FX settings. New tracks are empty, selected,
unarmed and monitoring-off, with independent processors and one Undo step.
Audio/takes, project-time automation, hardware IDs and session routing are excluded.

All 1,955 frontend tests (198 files) pass, including new model/component checks
for persistence, fresh identities, Undo/Redo, quota failure and recording/stale
project guards. Browser save/add/delete/reload, actual copied-FX offline PCM and
German 390 px layout checks pass. After the final selected-clip/bus fallback fix,
all 10 focused template tests and the browser check pass again. [Evidence](evidence/track-templates.json).
Full lint, final changed-source/script lint, TypeScript, 21 release checks and the
normal Mac bundle pass. The final local 0.13.27 app is installed/reopened with
strict/deep ad-hoc signature verification and its one autosave preserved.
No new physical-device, native plug-in DSP or signed iOS build is claimed.
Portable/session templates and live native-window state capture remain open.

## Local 0.13.26 — count-in and pre-roll

Recording options now offer audible bar-based count-in and project-audio pre-roll.
Existing seconds values stay a silent delay. Future Web Audio playback anchors
align clicks and takes; count-in clicks are scheduled ahead, outside the capture
and export graphs. Raw sources retain lead-in handles, while published takes
exclude pre-roll. Existing per-input latency placement without pre-roll is retained.
Cancel before the recording point publishes no take or recording file.

Prepared wet backing plays its intro once before hardware loop passes. Settings
roundtrip in projects; simultaneous inputs use maxima on one common clock. Selected
lead-in is bounded to 60 seconds and uses the existing global tempo/meter. Native
input FX, tempo maps and physical interface acceptance remain separate work.
[Recording guide](RECORDING_REVIEW.md) · [evidence](evidence/recording-leadin.json).

All 1,946 frontend tests, lint, TypeScript, 21 release checks and the normal Mac
bundle pass. The local app is installed as 0.13.26 with strict/deep ad-hoc signature
verification and its autosave preserved. No native Rust behavior changed; no new
full iOS build is claimed.

New browser PCM/capture checks and existing direct-record, punch/loop, multi-input
and monitor-metronome checks pass. They include exact scheduled start samples,
pre-roll cropping, count-in/pre-roll/device-loss cancellation, one Undo, persistence,
German small-screen layout and legacy per-input latency. Native plug-in DSP is a
prepared-buffer fixture in the new timing test; no new physical listening check or
Apple upload is claimed.

## Local 0.13.25 — transcript handoff and ASR scope cleanup

ASR launch/setup controls, model/executable discovery and app-side ASR commands
are removed. Existing aligned projects and speech edits remain supported; the
independent CLI retains its previous helper command for scripts. Timeline and
source views share JSON/SRT/VTT import with desktop and browser/mobile pickers,
stale-read guards, destination bounds and timeline word-layout checks.

The current CrisperWeaver standard exporter supplies cue timing but omits words.
Schema-matched cue import passes; genuine word-timed JSON enables word cuts.
A word-preserving export remains a cross-app gap, and no CrisperWeaver code was
changed. [Speech workflow](SPEECH_EDITING.md).

All 1,933 frontend tests, 39 desktop app tests, the iOS Rust simulator check,
lint, TypeScript, 21 release checks and listing limits pass. The normal Mac bundle
passes and is installed locally as 0.13.25 with strict/deep ad-hoc signature
verification and its autosave preserved. The browser workflow verifies file imports, a one-second word cut
across three audio tracks and video, Undo/Redo, project/source-transcript reopen
and a 624,000-frame WAV roundtrip. The 390px German workspace has no horizontal
content overflow. These are software checks, not new physical device acceptance.
[Checkpoint evidence](evidence/transcript-handoff.json). No Apple upload.

## Local 0.13.24 — continuous waveform feedback

Segment-effect waveforms now refresh during uninterrupted slider movements.
The scheduler samples the latest settings between serialized renders and keeps
the last processed shape under FX… while updating. Trims, source/placement changes
and bypass immediately stop showing the preceding shape. Hidden windows suspend
preview work. Render/cache budgets and the native/long-clip exclusions are unchanged.

Seventeen focused scheduler, hook and waveform tests pass. The real-browser
inspector check made 48 continuous changes, displayed seven processed shapes
before release and produced one Undo entry. PCM checks for all twelve built-in
effects, trim invalidation, bypass/Undo and the small German viewport pass again.
Lint, TypeScript, 21 release checks and the normal Mac bundle pass. The local
0.13.24 app is installed with strict/deep ad-hoc signature verification and its
autosave preserved. Preceding 0.13.23 [general CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38919660069)
is green; its iOS run was still in progress at this check. The last full frontend suite is the 1,912-test 0.13.23
baseline; it is not presented as a new full-suite run.
[Checkpoint evidence](evidence/continuous-fx-waveform.json). No Apple upload.

## Local 0.13.23 — effect-aware segment waveforms

Built-in segment effects refresh visible timeline waveforms after a short editing
pause, using the existing clip DSP with gain, fades and effect automation. The
preview path never accesses native plug-ins or the playback device. An FX status
marks processed, updating or source-only drawing. The initial bounds are 60 seconds
/ 32 MiB per render and eight entries / 32 MiB retained cache. Native inserts,
longer clips and track/bus/master processing remain follow-up work; see the
[accepted audio-workstation roadmap](DAW_GAP_ANALYSIS.md).

All 1,912 frontend tests, lint, TypeScript and 21 release checks pass. Actual browser
PCM checks match the existing clip-range renderer exactly for all twelve built-in
effect types; changing a real inspector slider changes canvas waveform pixels.
Rapid edits, bypass, Undo and a small German viewport pass. This is software
verification, not new listening, hardware or physical iOS acceptance. The normal Mac bundle is installed locally as 0.13.23,
with strict/deep ad-hoc signature verification and the autosave preserved.
[Checkpoint evidence](evidence/clip-fx-waveform.json). No Apple upload.

## Local 0.13.22 — audio finishing scope and TTS retirement

TTS creation, server preferences and iOS speech synthesis commands are removed.
Existing generated clips remain ordinary audio; imported transcripts and captions
remain editable. CometBeat owns composition; CrisperWeaver owns ASR/TTS generation.
The legacy optional CrispASR launcher remains a separate retirement/handoff task.
The [comparison and gap inventory](DAW_GAP_ANALYSIS.md) distinguishes implemented
subsets from larger recording, restoration, routing and session-engine gaps.
All 1,908 frontend tests and 39 desktop app tests pass, as do release gates,
old-project/real-source browser checks, the full unsigned iOS simulator bundle
and normal Mac bundle. The local app is installed with its autosave preserved.
[Checkpoint evidence](evidence/audio-focus-tts-retirement.json). No new public
App Store release or parity claim follows from this scope cleanup.

## Local 0.13.21 — Preview and recording monitor clicks

The monitor metronome now follows rendered Preview source loops and recording
capture-pass anchors. Recording clicks continue after the backing ends, respect
punch boundaries and stop on cancellation/unmount. Clicks are separate from
project meters, rendered buffers and microphone input routing. Native Live keeps
its native click path. Real offline PCM and muted synthetic capture checks pass;
physical input/output acceptance is unchanged. No Apple upload.
[Validation evidence](evidence/preview-recording-metronome.json).

## Local 0.13.20 — native monitor metronome

Mac Live playback now supplies monitor clicks from its native render clock.
The existing musical controls set enable/level, bar accents and tempo. Clicks
follow seeks and loop boundaries, remain outside mix meters and exports, and
use the selected output and monitor volume. Preview and prepared recording
backing still omit clicks. No new hardware acceptance or Apple upload.
[Validation evidence](evidence/native-monitor-click.json).

## Local 0.13.19 — compact track shape review

Track gain, pan and built-in parameter shaping now shares the compact review used
by inspectors. One selector, the curve, optional custom fields and one action row
replace the older explanatory paragraphs. Info retains full names and units.
Negative pan and raw effect values remain intact; direct Apply creates one Undo,
with project identity/lock/capture checks and no-op Redo preservation.
[Validation evidence](evidence/compact-track-shapes.json).

## Local 0.13.18 — scoped curve shaping

The inspector’s “…” menu opens local segment shaping for built-in clip/master
and native clip/track/master curves. Presets and custom Bézier handles reuse the
track-shaping math, retain raw or normalized units, and bake at most sixteen
editable intervals. Intact shapes reopen from interior points. Use shape changes
only the draft; Apply creates one Undo. Interrupted gestures restore controls;
other segments, static values and native state remain independent.
[Validation evidence](evidence/scoped-curve-shapes.json).

## Local 0.13.17 — compact automation paste review

Track-lane paste now presents time/length fields and a live current/result curve
comparison. Source, interval, stretch and boundary details are behind an info
button. Typing and touch scrubbing change only the preview; Paste remains one
Undo. Gain, pan and all six built-in parameter lanes retain their existing bounds,
locks, no-op and stale-project guards. EN/DE frequency labels are corrected.
[Validation evidence](evidence/automation-paste-review.json).

## Local 0.13.16 — inspector curve range tools

The inspector’s “…” menu exposes range selection, copy, playhead paste and fit to
range. Mouse/touch range dragging and numeric bounds show a selection band.
Built-in inspectors share clipboards with track lanes; native copies require the
same plug-in, parameter and reported range. Paste uses one-sample exterior guards
and stays a local draft until Apply. Cancelled gestures restore the selection;
menu keys stay isolated from timeline shortcuts. No native DSP or Apple upload.
[Validation evidence](evidence/curve-range-tools.json).

## Local 0.13.15 — built-in curves and clip editing

Built-in clip/master inspectors now share native inserts’ visual editor, with
mouse/touch/pen dragging, keyboard adjustment and typed %, ms and Hz. Recording
stays collapsed and Apply publishes one Undo. Built-in clip envelopes follow
moves, nudges, slides and paste; trims/splits/slips keep their timeline clocks.
Moves and speed changes sample Linear/Step boundaries at project zero.
Frontend changes only; native DSP and Apple submissions are unchanged.
[Validation evidence](evidence/builtin-parameter-curve-editor.json).

## Local 0.13.14 — native parameter curve editor

Native parameter inspectors now include a graph with point creation/dragging,
actual-unit time/value fields, Linear/Step, deletion and keyboard editing.
Touch/pen numeric scrubbing previews the curve; cancelled gestures restore the
draft. Dense captures use bounded rendering while every point stays editable by
index. Apply publishes one Undo and preserves plug-in state and other lanes.
Recording controls are collapsed; first-point selection keeps the graph stable.
Desktop/touch German browser checks cover layout, dragging, units and Undo.
[Validation evidence](evidence/native-parameter-curve-editor.json).

## Local 0.13.13 — native automation follows editing

Native parameter curves follow moved/nudged/pasted clip content and speed scaling.
Splits, trims and source slips retain their timeline clock. Range edits retime
selected clip/track curves and comp backups, with master curves following global
scope policy. Boundary values/Step segments, locks and existing curve limits are
protected. Mix snapshots retain the data and reject stale arrangement geometry.
This checkpoint changes frontend project editing only; native DSP is unchanged.
[Validation evidence](evidence/native-automation-edits.json).

## Local 0.13.12 — native parameter passes

AU/VST3 parameter automation is available at track, clip and master scope through
the icon beside each expanded native parameter. Touch/Latch/Write captures use
the native clock, local review and one Undo on Apply. Audition holds independent
instance/address lanes without changing the project or saved plug-in state.
Static Read values include queried defaults. Saved curves run in Live, Preview
and GUI exports; CLI native-insert exports remain unsupported. Curve evaluation
uses processing blocks (normally 512 frames Live, 4096 Preview/export), with
project-time latency compensation. Physical/commercial plug-in acceptance and
continuous native input DSP remain pending.
[Validation evidence](evidence/native-parameter-passes.json).

## Local 0.13.11 — built-in effect order

Same-type built-in effect reorders now rebuild native playback, including Undo,
Redo and changes made while paused. Stable optional processor identities persist
through edits and save/reopen; paste creates fresh identities. Legacy projects
remain compatible and acquire identities when reordered. Supported knob edits
continue to update the running graph. This checkpoint changes no native DSP code.
See [validation evidence](evidence/native-effect-identity.json).

## Local 0.13.10 — live master and clip effects

Mac Live playback now supports the same eleven built-in effect controls on tracks,
clips and master: wet/dry mix for six effects, delay time/feedback, chorus depth/rate
and ring frequency. Knobs and saved curves update without replacing processors.
All native delays reserve time-edit history before playback inside the shared
64 MiB effect-state budget. Oscillator phase and effect tails keep running.

Clip/master inspectors can capture Touch, Latch and Write passes. Use pass adds
reviewed points to the local draft; Apply publishes one Undo step. Clip capture
uses its timeline extent and absolute project time. Preview, microphone capture
and locks remain guarded. Failed audition, native faults and playback-mode changes
discard active passes; faults also discard pending reviews.

Master and clip controls have explicit scope identities, with duplicate/unknown
scopes and invalid indices rejected before any packet changes the graph. Unsupported
built-in settings, native plug-in parameter passes and continuous native input DSP
remain outside this increment. Live control delivery remains block-based.
All 1,781 frontend tests, 164 media tests with native-engine enabled, 41 app tests
and 21 release checks pass. Lint, TypeScript, locked iOS simulator compilation and
the normal Mac bundle pass. The installed 0.13.10 app is running with a verified
deep/strict signature, one autosave preserved and the prior app/session backed up.
DSP checks use synthetic PCM and fixture native inserts; no new physical audio or
commercial plug-in acceptance was performed. Both preceding CI workflows passed.
[Scoped native evidence](evidence/native-scoped-effects.json).
No Apple upload or release tag was triggered for this checkpoint.

## Local 0.13.9 — live track effect knobs

Supported built-in track effect knobs update during Mac Live playback without
replacing the processors. This includes wet/dry mix for six effects, delay
time/feedback, chorus depth/rate and ring frequency. Undo and Redo use the same
live control path. Base values follow the existing constructor defaults, clamping
and float precision; automation curves retain priority. Delay history, effect
tails and oscillator phase keep running. Invalid packets are rejected before
any base value or curve is applied.

Other settings, such as reverb decay, distortion drive, filter/compressor controls,
master/clip effect settings and rack structure still require a restart. Control
delivery remains block-based. Project formats and plug-in saved state are unchanged.
All 1,773 frontend tests, 163 media tests with native-engine enabled, 41 app tests
and 21 release checks pass. Lint, TypeScript, locked iOS simulator compilation and
the normal Mac bundle pass. The installed 0.13.9 app is running with a verified
deep/strict signature, one autosave preserved and the prior app/session backed up.
DSP checks use synthetic PCM and fixture native inserts; no new physical audio or
commercial plug-in acceptance was performed. Preceding general CI passed; its iOS
CI remains in progress at the last check.
[Live knob evidence](evidence/native-static-track-effects.json).
No Apple upload or release tag was triggered for this checkpoint.

## Local 0.13.8 — delay-time and oscillator passes

Mac Live playback adds track delay time, chorus rate and ring frequency to the
existing Touch/Latch/Write workflow. Audition remains session-only; reviewed
Apply creates one Undo step. Native track delays reserve their full two-second
history before playback, within the existing shared 64 MiB effect-state budget.
Time edits retain the history and do not resize the buffer during playback.
Native oscillators keep phase through automation control changes, Read restoration and
project loops. Static and automated rates use the same native frequency increment.
Offline rendering retains its established DSP paths.

Master/clip effect passes, native plug-in parameter passes and continuous native
input DSP remain pending. Live control delivery remains block-based.
All 1,771 frontend tests, 161 media tests with native-engine enabled, 41 app tests
and 21 release checks pass. Lint, TypeScript, locked iOS simulator compilation
and the normal Mac bundle pass. The installed 0.13.8 app is running with a verified
deep/strict signature, one autosave preserved and the prior app/session backed up.
DSP checks use synthetic PCM and fixture native inserts; no new physical audio or
commercial plug-in acceptance was performed. Both preceding CI workflows passed.
[Delay and oscillator evidence](evidence/native-time-phase-automation.json).
No Apple upload or release tag was triggered for this checkpoint.

## Local 0.13.7 — delay feedback and chorus depth passes

Mac Live playback adds Touch, Latch and Write passes for track delay feedback
and chorus depth. They share the existing session-only audition, review and
single-Undo Apply workflow. Wet/dry controls can remain held independently.
Read restoration retains the processors and their history, returning to the
original static setting or envelope. Parameter bounds and duplicate controls
are validated before the complete control packet is applied. Envelope readers
now rewind their point cursors with project time at loop boundaries.

Delay time, chorus rate, ring frequency, master/clip passes, plug-in parameter
passes and continuous native input DSP remain pending. Native control delivery
is block-based. [Parameter pass evidence](evidence/native-feedback-depth-automation.json).
All 1,765 frontend tests, 159 media tests with native-engine enabled, 41 app tests
and 21 release checks pass. Lint, TypeScript, locked iOS simulator compilation and
the normal Mac bundle pass. The installed 0.13.7 app is running with a verified
deep/strict signature, one autosave retained and the prior app/session backed up.
DSP checks use fixture native inserts and synthetic PCM; no new physical audio
or commercial plug-in acceptance was performed. Both CI workflows passed at the
preceding 0233265 checkpoint.
No Apple upload or release tag was triggered for this checkpoint.

## Local 0.13.6 — native track effect mix passes

Mac Live playback can record wet/dry Touch, Latch and Write passes for built-in
track delay, chorus, reverb, distortion, ring modulation and bitcrush. Audition
uses temporary envelopes; Apply publishes the reviewed pass with one Undo.
Native inserts and built-in effect histories keep running. Clearing a reverb
mix envelope now restores its original static mix. Entire mix packets are
validated before controls are applied, including disabled-effect index mapping.

Control delivery remains block-based. Other effect parameters, master/clip
passes, plug-in parameter passes and continuous native input DSP remain pending.
Preview and microphone capture keep their existing automation guards.

All 1,761 frontend tests, 157 media tests with native-engine enabled, 41 app
tests and 21 release checks pass. Lint, TypeScript, the locked iOS simulator
compile and normal Mac bundle pass. The installed 0.13.6 app is running with a
verified deep/strict signature, one autosave preserved and the prior app/session
backed up. DSP checks use synthetic PCM and fixture inserts; no new physical
audio or commercial plug-in acceptance was performed.
[Effect mix checkpoint evidence](evidence/native-effect-mix-automation.json).
No Apple upload or release tag was triggered for this checkpoint.

## Local 0.13.5 — native level and pan passes

Mac Live playback can record track level/pan Touch, Latch and Write passes.
Audition uses temporary hot-control envelopes; the project and plug-in state stay
unchanged until review and Apply. Read restoration, stop/replacement cleanup and
fault interruption are covered. Preview, microphone capture and effect-parameter
passes remain guarded. Control delivery is block-based, not sample-accurate.
A native control-drain race that could drop the final slider value is fixed.

The 0.13.4 general CI failure was a Windows-only Unix-path assumption in the
new test fixture; bee3577 replaces it with native absolute temporary paths.
Both general CI and iOS CI passed at 124614b, including the Windows fixture repair.

The local 0.13.5 app is installed and deep/strict signature-verified, with the prior
app/session backed up and one autosave preserved. All 1,758 frontend tests pass in
one final run, including native Touch/Latch/Write, Read restoration, one Undo,
fault discard and unavailable-audition guards. With the native engine enabled,
156 media tests pass; the stateful insert fixture checks known PCM and DSP-history
continuity through override/restoration. The 41 app tests, locked iOS simulator
compile, lint, TypeScript build and 21 release checks also pass.
[Checkpoint evidence](evidence/native-mix-automation.json). No new Apple upload.


## Local 0.13.4 — recover moved media from Mac bookmarks

Restored resource bookmarks now retain their resolved location and bounded path
history. Missing absolute references in projects, autosave recovery and saved-job
decoding can follow renamed files or selected folders after relaunch, including
video, stills and retained originals. No project file is rewritten just by opening.
Existing paths remain unchanged; ambiguous or unavailable identities still use
manual relinking. Startup does not mount offline volumes or show permission UI.
Folder recovery cannot escape the selected folder through a symlink.

The local 0.13.4 app is installed and signature-verified with one autosave retained
and the previous app/session backed up. All 1,748 frontend tests pass in one final
run; 143 media tests, 41 app tests, the locked iOS simulator compile, lint,
TypeScript and 21 release checks pass. Seven native bookmark tests include actual
consecutive file/folder renames and serialized restoration in a nonsandboxed
fixture process. They do not replace signed sandbox/Finder gesture acceptance.
Recovery IPC sends only bounded path lists, leaving embedded project audio in the
frontend. [Checkpoint evidence](evidence/macos-moved-media.json).

No new Apple upload is part of this local software checkpoint.

## Local 0.13.3 — simpler single-file exports

Mac native WAV, FLAC, AAC and video exports stage privately when the destination
is on the temporary-storage volume, so ordinary exports use only the Save dialog.
Another volume (or an unreadable destination parent) retains sibling staging and
explicit folder access. Project sidecar assets and delivery folders still require
folder selections. Completed files are published atomically without replacing an
existing destination; cancellation and render failures leave no new output.

The noninteractive Seatbelt probe confirms that a named-file write grant allows
publication while sibling scratch writes remain denied. This is a kernel boundary
check, not a new PowerBox/Save-panel replay. The prior 0.13.2 signed-app resource
evidence remains unchanged; Accessibility permission has not been bypassed.

The local 0.13.3 app is installed and deep/strict signature-verified, with the prior
app/session backed up and one autosave preserved. The 139 regular media checks,
three generated codec checks, native linked-video section check, 40 app tests,
iOS simulator compile, lint, TypeScript build and 21 release checks pass. All
1,742 frontend tests pass across the full run and targeted retries; the initial
run had one test timeout and two worker-start timeouts. The final panel-export
retry passes all 11 tests with a 20-second timeout and command-scoped sleep
inhibition. [Checkpoint evidence](evidence/native-export-staging.json).
No Apple upload or release tag is part of this local change.

## Local 0.13.2 — project, media and output access

Mac media/project selections and explicit media/output folder grants now persist
across launches. Helpers receive matching file access for native reads and output.
File → Media Folder Access… groups linked sources. Native renders and saves with
sidecar audio request output-folder access when necessary, before starting work.
Saved-project format 4 is accepted by native resolution/collection, and dropped or
Finder-opened projects resolve relative media. Desktop opened MP4 files retain
paths instead of transferring the whole movie through byte IPC.

Five real hardened-sandbox launches pass file selection/restoration, parent/helper
reads, read-only source boundaries, version-4 project reopening/writing and native
AAC output. An unselected neighboring input remains denied. The earlier external
VST3 folder/stream probe also passes with the extended transport.
[Resource evidence](evidence/macos-resource-bookmarks.json).

The 0.13.2 local app is installed and signature-verified with one autosave retained
and the prior app/session backed up. All 1,738 frontend tests, 136 media tests,
40 app tests, the locked iOS simulator compile and 21 release checks pass. A later
picker replay was blocked when macOS denied `osascript` Assistive Access; earlier
five-launch resource and two-launch plug-in sandbox runs passed. The checked probe
source now uses direct AX selection instead of global keyboard typing and supports
manual picker selection. System permissions were not changed.

This local checkpoint does not upload another Apple build. Physical Finder gestures,
iOS hardware, commercial plugins and external interfaces remain acceptance work.

## Local 0.13.1 — selected plug-in folders

Selected Mac plug-in folders now use persistent app-scoped bookmarks. Native
helpers resolve per-job transferred bookmarks for scan, preview and streaming.
An isolated hardened sandbox probe passes real selection outside Downloads and
restoration in a separate launch; both launches first confirm access is denied.
It exercises external VST3 discovery/streaming and Swift helper reads of generated
audio. [Evidence](evidence/macos-folder-bookmarks.json).

The 0.13.1 local app is installed and signature-verified, with the previous app
and session data backed up and the autosave retained. This is local software work;
no 0.13.1 Apple build has been uploaded. General
project/media bookmarks, commercial plug-ins and physical-device checks remain
separate follow-ups. The TestFlight record below describes the submitted 0.13.0.

## TestFlight 0.13.0 / build 14 — submitted 2026-10-15

| Platform | Apple processing | Internal TestFlight | External TestFlight |
|---|---|---|---|
| iOS / iPadOS | `VALID` | `IN_BETA_TESTING` | `WAITING_FOR_BETA_REVIEW` |
| Native macOS, Apple Silicon, macOS 13+ | `VALID` | `IN_BETA_TESTING` | `WAITING_FOR_BETA_REVIEW` |

Both builds are assigned to the existing Internal Testers and External Testers
groups, verified from the group side. The account owner is attached to the internal
group. Per-platform test notes and export compliance are set; automatic external
notification is enabled. Both Beta App Review submissions report `WAITING_FOR_REVIEW`.

[Public TestFlight invitation](https://testflight.apple.com/join/YpRwC6wF) ·
[App Store Connect](https://appstoreconnect.apple.com/apps/6791876962/testflight) ·
[Build and API evidence](evidence/testflight-0.13.0-build14.json).

The existing iOS profile and canonical signing identities were reused. A matching
Mac App Store profile was created without changing capabilities or revoking any
certificate. The native Mac release copy launches and renders under hardened
App Sandbox. Its separately signed helpers, app/profile/certificate identity,
architectures, privacy manifest, package signature and regular-user file access
pass verification. Apple rejected the first Mac package because its embedded
profile had owner-only read permissions; the normalized, re-signed package was
accepted. A regression check now catches that condition before upload.

The IPA and PKG are retained with hashes and signed-artifact checks. All 21 release
regression checks pass. No new physical microphone/audibility or iOS hardware test
was performed. External interfaces, commercial plugins and selected resource
folders outside Downloads remain beta acceptance work. The local installed app
and autosave are unchanged. No public App Store release was submitted or changed.

## Verified Apple distribution status

Checked 2026-10-15 using the App Store Connect API from the VPS and Apple's public
DE/US lookup endpoints. App ID `6791876962`, bundle ID `com.crispstrobe.crispaudio`.

| Route | Current evidence |
|---|---|
| Public iPhone/iPad app | **0.3.0 released**, `READY_FOR_DISTRIBUTION` / legacy `READY_FOR_SALE`; attached build 13 is `VALID`. Public DE and US listings confirm 0.3.0, released 2026-10-01. |
| iOS app on Apple Silicon Macs | Public listing includes compatibility with Apple M1 or later and macOS 11 or later; this is the iPad app, not the native desktop build. |
| Native macOS App Store app | Version 1.0 is `PREPARE_FOR_SUBMISSION`, with no build attached. Native 0.13.0/build 14 is now available for internal TestFlight. |
| Provisioning | Active `IOS_APP_STORE` and newly created `MAC_APP_STORE` profiles, bound to the existing Distribution certificate. Existing account/API credentials work. |
| Local native macOS app | Installed 0.13.10 ad-hoc signed app, separate from the public iOS release. |
| Desktop GitHub bundles | `v*` tag or `release.yml` dispatch; macOS ARM, Windows and Linux jobs configured. |

[Public App Store listing](https://apps.apple.com/de/app/crispaudio/id6791876962) ·
[App Store Connect record](https://appstoreconnect.apple.com/apps/6791876962) ·
[Sanitized API evidence](evidence/apple-store-status-2026-10-15.json).

The previous statement that the iOS upload had not been checked against Apple
release status is superseded by this live check. The September 13
[failed native Mac upload](https://github.com/CrispStrobe/crispaudio/actions/runs/34760697731)
is historical evidence about that desktop pipeline, not a problem with the live
iOS listing. It does not establish that every distribution route needs a fresh
profile. The initial read-only verification made no account changes. The later
explicitly authorized TestFlight work created the Mac profile and submitted the
beta builds described above.

A generic `v*` release tag also triggers iOS upload; `mac-v*` triggers the separate
native Mac workflow. Neither is part of the local software checkpoint.

## Local 0.13.0 — inspectors, exact controls and native-rack recording

Track Settings edits one selected track in a modeless inspector. Recording settings
also leave the timeline accessible; advanced controls stay collapsed. Mixer and FX
numbers support live entry and accelerated touch scrubbing, with cancellation and
one Undo per gesture. Keyboard precision and displayed units are retained.

Recording with AU/VST3 racks prepares the wet accompaniment before opening input.
Playback and dry capture then share one Web Audio frame clock, including loop take
boundaries across stalled UI frames. Continuous native microphone processing and
native automation-pass recording remain unsupported.

Validation: 1,726 frontend tests pass; ESLint and application/fixture TypeScript
checks pass. Media tests pass 145 + 3, including eight real AU/VST3 stream tests;
10 optional media integrations remain ignored. Tauri tests pass 37 with one ignored,
and the locked iOS simulator compile passes. Chrome and WebKit verify compact
inspectors and sample sessions; Chrome additionally checks actual emulated touch
number scrubbing and trim handles. Comp versions, linked edits, save/reopen and
range export comparisons pass. Physical touch devices were not checked.

The muted native recording probe verifies a delayed wet impulse at frame 24,096,
shared capture timing, retained original audio, loop takes across a 650 ms UI stall,
pre-input cancellation, one Undo and released helpers. An isolated ad-hoc signed,
hardened App Sandbox probe passes the same workflow and observes three helper
processes launched from the signed app bundle. It uses generated input and a
bundled test plugin; an additional run passes an external VST3 fixture in Downloads
via the existing static entitlement. PowerBox-selected folder access and Apple acceptance remain open.

Mac helpers now ship as sidecar executables, signed individually with inherited
sandbox rights. Store packaging checks their presence, signatures, team,
architectures and entitlements. The Store preflight rejects missing or mismatched
profiles, final app/team entitlements or signing certificates, missing hardened runtime and invalid helper
sandbox rights. The Store workflow derives identity entitlements from the validated
profile. Ten profile/CMS/signature boundary tests, nine actual Mac signature
regressions and two uploader-result checks pass. See [Mac distribution preparation](MACOS_SIGNING.md) and
[sanitized evidence](evidence/interaction-recording-0.13.0.json).

The preceding 0.12.1 iOS CI run passed; its general run was superseded. The
0.13.0 CI runs remain queued. The signed local app is installed with one autosave
retained and a fresh full-data/previous-app backup; the standalone CLI is unchanged. The source push
starts new CI runs; no release workflow or Apple upload was requested.

## Local 0.12.1 — compact recording and numeric controls

Record and its smaller settings arrow use separate borderless controls, with a
larger arrow hit area on touch screens. Waveform display uses one dropdown and an
info button; per-track overrides are available in the track context menu and Track
Settings and are saved with the project. View sets the default display mode.
Slider readouts accept exact values in their displayed units. Shared numeric
fields support vertical touch/pen adjustment, tap-to-type, range validation and
cancellation. Display-only waveform changes preserve native playback/preview caches.

Validation: ESLint, TypeScript and the normal Mac bundle pass. Chrome and WebKit
check desktop/390px layouts, per-track waveform settings and exact dB entry;
Chrome additionally checks real emulated touch swipes. The 1,714-test frontend
suite passes 1,713 tests before the paste-field focus correction; all 11 focused
number-field and modal-focus tests pass after that correction. Earlier slider
animation assertions now check the exact editable value while the track animates.
The signed local 0.12.1 app is installed, with one autosave retained and a fresh
backup of app data and the previous app. No new physical microphone or audible
playback check, release tag, workflow dispatch or Apple upload.

## Local 0.12.0 — continuous native effects

Mac AU/VST3 racks offer **Live / Preview** beside Play. Live supports pause/resume,
history-preserving seek, continuous loops, live fader/pan/mute/solo/send controls,
plugin parameters/bypass, track/master meters and master loudness. The selected
output can be rebound; device/DSP faults stop visibly. Direct and queued
WAV/FLAC/AAC delivery include the native mix. The enabled Apple-effect sample and
[playback guide](NATIVE_PLAYBACK.md) cover the workflow and limits.

Validation: 1,707 frontend tests in 175 files (including recording guards), full ESLint,
TypeScript, 144 media-library tests, three CLI tests and 40 Tauri tests pass.
The media suite includes eight actual AU/VST3 stream tests. Three consecutive
60-second runs with eight instances, 44.1 kHz sources, UI load/background playback,
injected failures and recovery pass. AU/VST3 retain clock and DSP history across
65 seconds paused. Independent wet-file decoding verifies WAV/FLAC frame counts,
AAC signal/priming and cancellation without output publication. These are muted
digital checks, not new physical speaker or commercial-plugin acceptance. The final
preview retest with the Mac unlocked verifies visible playhead movement, German
controls, cached pause/resume, seek/loop capture and cancellation.
[Machine-readable evidence](evidence/native-playback-0.12.0.json) records the scope.

The exact source checkpoint `94fa848` passes [general CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38751671025)
(frontend, media CLI, Windows/Linux/macOS Rust checks) and
[iOS simulator CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38751671010).
The iOS launch screenshot was also reviewed; this establishes simulator launch,
not physical-device or App Store acceptance.

The normal Mac bundle and locked iOS simulator compile pass. The ad-hoc-signed
0.12.0 app is installed and relaunched after a fresh full WebKit/application-data
backup; one autosave and the previous app are retained. The independent optimized
CLI is unchanged. Native microphone/automation-pass recording, monitor clicks,
custom plugin windows, external-interface and signed/sandboxed Store acceptance
remain outside this checkpoint. Native Mac profile setup remains separate from the already released iOS app;
see the verified status above. No release tag, workflow dispatch or Apple upload.

## Local 0.11.11 — rendered native-effects preview

Enabled native racks can be auditioned on Mac through an explicit rendered
preview. Play prepares a cached stereo mix; pause, seeking and range loops reuse
it. Audio edits stop playback and invalidate the cache. Existing playback-device
routing and master meters remain available. Live native processing, recording over
this preview and monitor clicks remain outside this mode.

Actual Tauri/VST3 capture checks full playback, seeking and hardware loops with a
500 ms UI stall, native helper cleanup and zero native DSP calls during playback.
The real German transport checks cached replay, cancellation and mix invalidation.
42 targeted unit tests, full ESLint/TypeScript, normal Mac bundle and locked iOS
simulator library compile pass; German 390px transport layout also passes. This
is digital capture validation, not a new physical output-device acceptance check.
The ad-hoc-signed local app is installed and relaunched with one autosave preserved
and a fresh recovery backup. The independent optimized CLI is unchanged. No release
tag or Apple upload was triggered; remote CI is separate from these local checks.

## Local 0.9.8 — playable sample sessions

File/command search opens Audio mix, Picture edit and Take workshop. They use
original deterministic PCM, supported FX and automation; the picture session
bundles a 12-second H.264 graphic and editable title, while Take workshop has
two preserved alternates and a comp region. Loading retains the previous project
and its source buffers in Undo. Desktop media paths are persisted before load.

Validation: 1,583 unit tests in 150 files, ESLint, TypeScript/Vite, Tauri app build
and locked iOS simulator library check pass. Chrome/WebKit exercise all three
sessions, playback, audible offline mixes, save/reopen, previous-session undo,
cancel, video decoding and German 390px layout. A mocked native bridge validates
media persistence calls, app-data video writes and failure without replacement.
The real optimized Apple CLI renders all three audio sessions and the picture
session's MP4, with 14-second output, audible sound and both audio/video streams.
This does not establish new physical-device acceptance or renderer bit parity.

Local 0.9.8 is installed, signed, verified and relaunched with one autosave
preserved and a fresh recovery backup. Media is bundled/generated for offline
macOS use; the CLI and native DSP remain unchanged. Both exact 0.9.7
[general CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38344461369) and
[iOS CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38344461360) succeeded.
New checkpoint remote checks remain separate. No release tag or Apple upload.

## Local 0.9.7 — coordinated armed-track recording

Record / Takes adds All armed tracks for one to eight audio tracks. Each target
retains its device/channel/monitor/latency settings; streams prepare before a
shared capture clock and the longest count-in. Punch/loop anchors are shared,
and all originals/takes/comps publish as one undo. A connection, persistence,
validation or stale-project failure cannot publish a partial group. The input
PCM budget is shared; audio-session ownership survives individual disconnects.

Validation: 1,579 unit tests in 149 files pass, with ESLint, TypeScript/Vite,
Tauri app build and locked iOS simulator library check. Chrome and Playwright
WebKit real-worklet/generated-stream audits pass two inputs, per-track settings,
one undo, retained originals, save/reopen, punch/loop, connection cleanup,
persistence failure and German 390px layout. The existing single-track Chrome
capture audit also passes count-in cancellation, right channel and interruption.
No physical microphone was requested. Independent-device latency/drift and
physical mobile capture remain acceptance work.

Local 0.9.7 is installed, signed, verified and relaunched with one autosave
preserved and a fresh recovery backup. The optimized media CLI is unchanged.
The exact previous checkpoint's
[iOS CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38343082043)
and [general CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38343082332)
both succeeded. New checkpoint remote checks remain separate. No release tag or Apple upload.

## Local 0.9.6 — clip/master supported FX automation inspectors

Expanded clip and master effects now open a focused automation inspector.
Local drafts support curve/point selection, numeric time/value, Linear/Step,
add/delete and parameter clear. Apply publishes one undo; equivalent drafts
preserve redo. Project changes, recording and clip track locks protect edits.
Other envelopes retain their original data; all clocks are project seconds.
Track lanes/passes remain separate, and arbitrary parameters are not added.

Validation: 1,575 unit tests across 148 files pass; ESLint, TypeScript/Vite,
Tauri app build and locked iOS simulator library check pass. Chrome and
Playwright WebKit exercise actual clip/master dialogs, draft cancellation,
bounds, undo/no-op/redo, locks/stale drafts, live commits without graph restart,
save/reopen and German 390px layout. Offline full/range crops match exactly.
Native PCM peak differences are 9.0637e-6 (Chrome) and 2.5481e-6 (WebKit), within
the existing 1e-4 moving-delay audit budget. This covers the tested mixed
clip/master delay case; it does not remove documented renderer precision limits.
The native media implementation and optimized CLI remain unchanged.

The local 0.9.6 app is installed, signed, verified and relaunched, retaining one
autosave and a fresh recovery backup. Playback remains fixed per the user's
prior confirmation. Physical device acceptance is unchanged. Both exact 0.9.5
[general CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38315509696) and
[iOS CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38315509728) succeeded.
The new checkpoint's remote checks are separate. No release tag or Apple upload.

## Local 0.9.5 — compact timeline and desktop menus

Secondary tools now open through native macOS menus or File/Edit/View/Tools
menus on other platforms, with the same catalog in command search. Compact
editing/mixing/recording icons remain visible. Existing tool controllers and
queues stay mounted; explanations move into collapsed Help sections. Track
Settings retains its existing controls separately from the strip mixer.

Local checks: 1,568 unit tests pass across 147 files; ESLint, TypeScript/Vite and Tauri app build
pass. Native tests pass (25, one ignored), and the locked iOS simulator library
check passes. Chrome and Playwright WebKit pass menu/search/disabled-state/undo
and German 390px checks. The real interview workflow passes range edits,
save/reopen and byte-identical browser range exports; native rendering differs
by at most one int16 unit and produces the expected five-second AV output.
Musical-time playback/save/reopen and fast dialog focus checks pass. Rack
copy/reorder now preserves time/depth/rate envelopes alongside mix/feedback.

The local 0.9.5 app is installed, signed, verified and relaunched, with one
autosave preserved and a fresh recovery backup. Existing optimized CLI retained.
Playback remains fixed per the user's prior audible confirmation. No new
physical microphone/controller/mobile acceptance is claimed. Clip/master
supported FX inspectors remain the next DAW increment; further MIDI is deferred.

The earlier iOS repair is also remotely verified: exact main 5fa86a3's
[iOS simulator CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38313174409)
succeeded. New checkpoint CI status must be checked at its exact pushed SHA;
local checks do not establish remote CI success. No release tag or Apple upload.

## Local 0.9.4 — MIDI capture alongside timeline playback

The piano roll can start/stop ordinary timeline playback and capture a reviewed
MIDI pass into a new pattern at the running audio-clock position. Channel,
velocity and sustain are retained. Stop, seek, loop/graph restart, programme end
or pattern length ends the pass; subsequent loops do not merge into that draft.
Stop playback and Apply publishes one durable editable clip in one undo step.
Existing free-running capture and cancellation remain available. See [MIDI](MIDI.md).

Validation: 1,566 frontend tests across 147 files, full lint and TypeScript pass;
25 native tests (one ignored) pass with the iOS dependency repair. Chrome and
WebKit exercise real TimelineEngine/AudioContext placement, stop, one-step
publication, seek cancellation and range-loop termination, plus the existing
piano-roll/save/reopen/source-window/input-session/offline checks. The exact
`num_threads`/libc pair and the complete Tauri library compile locally for the
ARM iOS simulator with the committed lockfile. This is a compile check; remote
unsigned-app build/launch and physical-device acceptance are separate evidence.

TypeScript/Vite/Tauri app builds pass. Local 0.9.4 is installed, ad-hoc signed,
verified and launched with one autosave preserved and a fresh recovery backup.
The optimized media CLI is unchanged. New-head remote CI is pending this push.
No release tag or Apple upload is authorized. Playback remains fixed per the user.
Live instrument tracks, automatic MIDI loop takes, richer instruments,
arrangement MIDI interchange and plugin hosting remain further M10 work; M9
paging/codecs stays deferred.

## Local 0.9.3 — MIDI notes and basic instruments

The piano roll edits source-clock notes, velocity and durations, quantises starts,
records channel notes/sustain from selected input and exports type-0 pattern MIDI.
Sine/bell patterns render to durable audio clips with retained notes, preserving
ordinary mixer/effects/export behavior and source windows through trims/splits.
New destination track and clip publication are one undo step. Native Mac input
uses CoreMIDI/midir; browsers use Web MIDI where available. See [MIDI](MIDI.md).

Validation: 1,561 frontend tests (146 files), 25 app-native tests (one ignored),
lint and TypeScript/Vite/Tauri builds pass. Native tests discover an owned virtual
CoreMIDI source, receive note/sustain packets and close the connection. Chrome and
WebKit exercise piano-roll editing, one undo, save/reopen, malformed-note rejection,
independent split-window editing, stale-draft refusal, new-track publication,
input-session/sustain capture, draft cancellation, Web MIDI disconnect cleanup and
German 390px controls. Real PCM audition remains below full scale and stops
immediately even during a release tail. Native/offline instrument output differs
by at most 7.46e-9 in the checked render. Mido 1.3.3 validates the generated SMF.
MIDI dependencies' MIT notices are included in About.

Installed app 0.9.3 is signed/verified/launched with one autosave preserved;
the optimized media CLI remains unchanged. No release tag/Apple upload. Virtual
input tests are separate from physical controller/mobile acceptance. Live
instrument tracks, MIDI file import/arrangement export, controller automation and
plugin hosting remain subsequent M10 work; M9 stays deferred. Exact 0.9.3
[desktop CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38308670258)
passes frontend/media and Windows/Linux/macOS checks, including the Windows
delivery publication fix. This checkpoint opens the owned stage for writing
without truncation before syncing and hard-linking. The writable handle follows
[Microsoft’s flush requirement](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers).

The [0.9.3 iOS run](https://github.com/CrispStrobe/crispaudio/actions/runs/38308670205)
failed during Rust compilation: `num_threads` 0.1.7 calls `libc::mach_task_self`,
but libc 0.2.190 restricts that wrapper to macOS. The iOS manifest now pins the
compatible 0.2.189 release and the lockfile retains it. The
[upstream 0.2.189 source](https://github.com/rust-lang/libc/blob/0.2.189/src/unix/bsd/apple/mod.rs)
contains the unrestricted wrapper. A separate local check compiles the exact
dependency pair for `aarch64-apple-ios-sim`; full remote simulator validation is
pending this fix's push. Failed builds now skip the unsigned-app artifact step
when no application was produced, preserving the original build error.

## Local 0.9.2 — musical timeline foundation

Saved constant quarter-note tempo, signature and bar-one origin drive a bars/beats
ruler, musical snapping and bar-aligned edit ranges. A monitor metronome follows
transport anchors through seeks and loops; tempo edits leave programme playback
running and clip clocks unchanged. See [Musical timeline](MUSICAL_TIME.md).

Validation: 1,553 frontend tests (145 files), lint and TypeScript/Vite/Tauri builds
pass. Chrome and WebKit exercise saved/reopened clocks, malformed-clock rejection,
bar labels, unchanged clip clocks, no programme restart on tempo edits, seek/loop
scheduler cleanup and German 390px controls. Real offline PCM verifies beat pulses,
silent gaps, a lookahead-boundary regression, immediate stop cancellation and
click-free programme exports. Native media code is unchanged from the validated
0.9.1 checkpoint.

Local app 0.9.2 is installed, signed, verified and launched with the existing
optimized CLI and autosave preserved. No release tag or Apple upload. This is the
first M10 increment: tempo maps, MIDI/devices/instruments/plugins and sample-accurate
music loops remain future work. Physical click audibility is not inferred from
headless PCM checks; playback remains fixed per the user. M9 stays deferred.
Exact 0.9.1 CI and iOS workflows remain queued at this audit; local results are
separate from remote workflow completion.

## Local 0.9.1 — delivery and portable project checkpoint

Delivery provides per-export settings/presets, landscape/portrait and ProRes MOV,
project/range/selected-clip exports, solo track/bus stems and a sequential queue
with cancellation, retry, final paths and settings records. Media collection
reviews missing references and copies originals/takes/video/stills into a new
relocatable folder. Cut-only OTIO exports explicitly report omitted editor state.
See [Delivery workflows and limits](DELIVERY.md).

Validation: 1,544 frontend tests pass (143 files), with 119 media/CLI tests and
23 app-native tests (10 media / one app test ignored). Lint, TypeScript/Vite,
optimized CLI and local Tauri builds pass. Chrome/WebKit exercise native range WAV,
mono WAV, routed track/bus stems, four settings records, frozen source-map offline
rendering, unchanged project undo history, cut review and German 390px layouts.
Actual Apple landscape/portrait/review/ProRes MOV exports retain requested sizes,
codec and trimmed duration; routed stem range export passes. Package tests cover
relocation, canonical deduplication, originals/stills, missing-media refusal,
no-overwrite publication and legacy project path resolution. OpenTimelineIO 0.18.1
reads the generated exchange with correct clip count and duration.

Installed local app 0.9.1 and optimized CLI are ad-hoc signed, verified and launched;
one autosave remains preserved with recovery backups. No release tag/Apple upload.
Solo stems include master/returns and need not sum to the full mix. Queue restart
persistence, pre-master summing stems, ZIP packaging, OTIO import and physical
mobile/device acceptance are outside this increment. Native video delivery uses
Apple on macOS; FLAC/AAC require linked 48 kHz sources. Existing quick exports
remain separate. The previous 0.9.0 iOS simulator build/launch passes; macOS,
Windows and Linux Rust checks pass, with remaining workflow jobs pending at audit.

## Local 0.9.0 — selected M2.3–M7 checkpoint

The desktop stack now includes twelve selected automation lanes, buses/sends and
sidechain ducking, measured loudness finishing, picture layers/keyframes/source
placement, titles/stills/captions, timeline capture/takes/comping, linked clip
speed/reverse/pitch, multicam and source-word editing. See
[workflows and platform limits](EDITOR_CHECKPOINT.md).

Validation: 1,539 frontend unit tests; 119 media/native CLI tests (10 existing
ignored); 19 app-native tests (one existing ignored). Lint, TypeScript/Vite,
optimized CLI and local Tauri app builds pass. Chrome and Playwright WebKit cover
routing/native PCM comparisons, loudness review, decoded picture/graphics,
recording/take save-open and undo, count-in cancellation, second-channel capture,
input interruption, real CLI retiming, multicam switching without restarting sound,
source-word review/extract and German 390px layouts. Capture uses synthetic input;
physical microphone permissions, acoustic calibration and mobile lifecycle remain
unverified device acceptance checks.

Actual Apple exports pass four picture-composition cases, five graphics/caption
cases and native speed/pitch/reverse/recipe checks, including restoration after
sample-rounded derivation and trimming. Legacy static chorus renders remain
byte-identical to 0.8.39. The inherited abrupt wet-chorus tail mismatch remains
(peak about 0.061742 in Chrome / 0.075000 in WebKit); no tail fix is claimed.

Installed `~/Applications/CrispAudio-local.app` 0.9.0 and the independent optimized
CLI are ad-hoc signed, verified and launched. One autosave was preserved, with a
separate recovery backup. The microphone usage description is present in the
bundle. Playback remains regarded as fixed following the user's audible test.
Physical Finder MP4 drop acceptance remains unconfirmed. No release tag or Apple
upload was triggered. The exact 0.9.0 checkpoint has successful [iOS simulator CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38291438004)
and all three platform Rust checks; remaining [CI jobs](https://github.com/CrispStrobe/crispaudio/actions/runs/38291437967)
were still pending at the 0.9.1 audit.

## Local 0.8.39 — chorus rate automation

Chorus rate is a separate 0–8 Hz lane with direct points, Linear/Step and
preset/custom shapes, saved timeline handles, protected Read/Touch/Latch/Write
recording, and an independent copy/retime clipboard. Native point, shape, pass,
paste and range-edit recipes support rate in clip, track and master racks.
Live changes preserve both oscillators and delay history; the second oscillator
runs at 1.2 times the first. Zero holds phase. Empty rate envelopes preserve the
existing static DSP. Changing earlier frequency can change later audio phase,
even when paste guards preserve the later parameter values.

Validation: 1,491 frontend unit tests and 113 native tests passed (10 existing
native tests ignored), along with lint, TypeScript/Vite, optimized CLI and local
Tauri app builds. Chrome and Playwright WebKit cover shape review, copy/retime,
recording, save/open, locks, history, live graph continuity and German 390px UI.
The expanded inline-handle audit covers 252 edits per browser with matching native
recipes. An earlier audit encountered a navigation interruption; a diagnostic
rerun completed without a browser error or extra navigation. Its cause remains
unestablished.

All 0–8 Hz rack renders and rate workflow fixtures pass the established chorus
PCM budget of peak <1e-4 and RMS <1e-5; these results do not establish the stricter
2e-6 diagnostic for every fixture. The all-rack maximum peak/RMS differences were
1.563e-5 / 1.422e-7 in Chrome and 8.970e-6 / 1.840e-6 in WebKit. GUI range renders
match full-render crops exactly. Existing depth workflows and static-tail audits
also pass their regression checks; 22 native renders are byte-identical to the
optimized 0.8.38 CLI. Abrupt wet chorus endings still exceed the PCM budget
(peak up to 0.061742 in Chrome and 0.075000 in WebKit); that existing tail limit
has not been fixed. Other documented DSP precision limits remain open.

The local app and independent optimized CLI are ad-hoc signed and verified;
autosave is preserved with a separate recovery backup. The previous installed-app
tone was audible after relaunch, confirmed by the user. A physical Finder MP4 drop
in the installed app remains unconfirmed. M2.3 remains open for further selected
FX parameters and broader curve controls. No release tag or Apple upload.

## Local 0.8.38 — playback output and Finder media drops

Settings lists real CoreAudio outputs on macOS (selection changes system output
for all apps), with a shared-master test tone. Supported browser contexts route to
the selected output and roll back a failed selection. Interrupted contexts resume,
the shared engine uses the hardware sample rate, and gesture recovery stays active.

The user initially heard no installed-app tone despite a running graph and positive
software signal. A separate macOS-native tone was audible. Quitting and reopening
the installed app restored its test tone, confirmed by the user. Repeated WebKit
GPU audio IPC failures were observed, but the root cause is not established and
this is not proof of a permanent fix. No permissions or system volume were changed.
A signal meter alone does not prove speaker audibility.

Whole-window Tauri/Finder drops switch from any panel to Timeline. Video imports
linked picture plus unmuted camera audio; audio imports tracks; project drops open
the project. Cancellation/project-change guards protect prepared video commits.
A development StrictMode mount replay originally consumed and cancelled the first
drop; deferring queue consumption to the retained mount corrected it.

Chrome and Playwright WebKit integration passed global Tauri drop events from SFX,
linked/unmuted AV, actual synthetic H.264 picture playback, audio transport and
undo/redo. The native bridge was mocked in these browser tests; this is not proof
of a physical Finder drag in the installed app. The user's real MP4 passed native
Apple extraction to a 48 kHz stereo WAV, with nonzero peak/RMS measured separately.
Earlier output-chain browser audits passed signal/clock, replay and German 390px
layout; browser routing/rollback passed in Chrome, WebKit follows system output.

Installed app 0.8.38 is ad-hoc signed/verified and launched, with one autosave
preserved and a separate full recovery backup. The existing optimized CLI is
unchanged (no media DSP changes). Final frontend: 126 files / 1486 tests passed;
lint, full TypeScript/Vite and Tauri app build passed. Native app: 18 tests passed,
one hardware-only test normally ignored; that hardware test passed explicitly on
this Mac, enumerating the real default and selecting the same UID. Media tests:
107 library + 3 CLI passed, 10 existing ignored.

M2.3 remains open; the local chorus-rate WIP is parked while this requested
playback/import increment ships. No tags or Apple uploads.

## Local 0.8.37 — select interior shape points

Installed local app and optimized standalone CLI are ad-hoc signed and verified;
the existing autosave was preserved.

The start or any interior point of an intact saved preset/custom shape now
exposes whole-span timeline handles and reopens its original shape review.
Shared endpoints select the outgoing span. Numeric, arrow and deletion edits
still target the selected point; damaged, truncated and unannotated curves keep
adjacent-segment editing. Native recipes still address the original start time.
No DSP, native recipe or project-format change.

Validation on this Mac:

- **123 frontend files / 1,478 tests passed** (three new tests), lint and full
  TypeScript/Vite build passed. Tauri app and optimized CLI builds passed.
- **107 native library + 3 CLI tests passed**, 10 existing ignored.
- Chrome and Playwright WebKit each passed **234 keyboard/pointer edits** from
  start/interior selections, with **468 exact native project comparisons**.
  No-op selection, return to baseline, cancellation, undo/redo, bounds, locks,
  stale project, recording protection, flat/Step/short spans and German 390px
  checks passed. Interior review restored original bounds/controls, unchanged
  Apply kept history, Linear flattened the whole span, and numeric editing
  affected only the actual interior point. Actual WebKit interior point click
  and German 390px screenshot passed and were visually inspected.
- Existing custom-shape regression: ten cases per browser, native generation,
  save/open, live no-restart, history and exact full/range crops passed. Gain,
  pan, delay mix/feedback peaks Chrome **8.046627e-7**, WebKit **7.748604e-7**
  pass 2e-6. Chrome delay-time peak **3.774464e-5** passes 1e-4. WebKit initial
  custom delay-time still **fails 1e-4** at **2.8939545e-4**, byte-identical to
  installed 0.8.36 native output for that project; this is a known-limit report,
  not a parity pass. Revised delay-time case passes.

Other delay/FX precision and tail limits remain unresolved and were not rerun.
Browser viewport checks are not physical iOS or installed WKWebView validation.
M2.3 remains open for further selected FX parameters and broader curve editing.
No release tag or Apple upload was created.

## Local 0.8.36 — chorus depth automation

Installed local app and optimized standalone CLI are ad-hoc signed and verified;
the existing autosave was preserved.

Chorus depth now has a 0–100% lane (up to ±10 ms modulation), Linear/Step,
preset/custom shaping, saved direct handles, protected recording and an independent
`chorusDepth` clipboard. Empty depth uses insert depth, default 50%; mix retains
its 30% default. Both LFO gains update without restarting oscillators or delay
buffers; rate remains static. Native points/shapes/passes/source and portable paste
recipes use parameter `depth`; clip/track/master rendering and range retiming work.

Validation on this Mac:

- **123 frontend files / 1,475 tests passed**, including four depth tests for
  defaults/caps, tags/clipboard independence, protected edits and scheduling both
  LFO gains. Lint, full TypeScript/Vite and Tauri app/optimized CLI builds passed.
- **107 native library + 3 CLI tests passed**, 10 existing ignored. New tests cover
  points/shapes/passes/paste, mix preservation, caps/locks and retained delay history.
  The old test rejecting empty depth now checks unsupported feedback instead;
  its mix, rate and audio assertions are unchanged.
- Chrome and Playwright WebKit: four new depth shapes, copy/stretch, gain+depth
  recording, Read restoration, clip/track/master racks, native points, portable
  recipes, locks/history/stale edits/save-open/live no-restart all passed. Direct
  handles include depth: **130 edits each browser**, **260 exact native projects**.
  German 390px checks passed; WebKit depth paste screenshot inspected. Browser
  emulation is not physical iOS or installed WKWebView interaction.
- New depth audio retains the established chorus **1e-4 peak / 1e-5 RMS** budget.
  Shapes peak Chrome **6.258488e-7**, WebKit **4.097819e-7** (all pass 2e-6);
  copy peak/RMS Chrome **1.0121614e-5 / 1.6109822e-6**, WebKit
  **8.3241612e-6 / 1.5407633e-6** (both fail the stricter 2e-6 diagnostic).
  Recording peak Chrome **1.3694167e-5**, WebKit **2.8759241e-6**; strict diagnostic
  failures 2/2 and 1/2. Rack peaks Chrome **1.271069e-5**, WebKit **1.1697412e-6**;
  strict diagnostic failures 3/3 and 0/3. Full/range crops are exactly equal.
- Depth copy preserves outside envelope values to 1e-12. Its audio prefix differs
  Chrome **3.1003729e-6 peak / 5.9186208e-8 RMS**, WebKit **8.4767817e-7 /
  2.3128929e-8**. The new depth prefix uses the chorus
  budget, unlike the original mix test's unchanged 2e-7 prefix check, which passes.
  An isolated Chrome LFO-gain control render measured **4.656613e-10 seconds**
  peak difference after ramp splitting; this supports a float scheduling explanation.
  These are bounded audio differences, not claims of bit-identical outside audio.
- Existing chorus mix shape/copy/record/rack suites and ten static chorus cases per
  browser pass their unchanged budgets. **40 native WAVs** are byte-identical to
  installed 0.8.35 for those same projects; six additional abrupt-tail WAVs are
  byte-identical in the dedicated tail suite. That suite still fails full audio
  parity: Chrome **0.0617415** track/clip, **0.0562498** master; WebKit **0.0749997**
  all racks. These remain inherited known-limit reports, not parity passes. New
  depth rack tests turn mix dry at the abrupt clip end to isolate depth behavior.

Other delay, bit-crusher, distortion and reverb limitations were not fixed or
rerun. M2.3 remains open for further selected FX parameters and broader curve
editing. No release tag or Apple upload was created.

## Local 0.8.35 — direct Linear and preset curve handles

Installed local app and optimized standalone CLI 0.8.35 are ad-hoc signed and
verified; the existing autosave was preserved.

Direct lane handles now cover ordinary adjacent Linear segments and intact saved
Ease-in, Ease-out and S-curve spans, alongside custom spans. Preset controls are
mathematically equivalent cubic controls with a linear time axis. Selecting,
cancelling or returning to baseline retains project identity and preset metadata.
Changing a handle converts the whole span to saved custom points, replacing old
interiors. Step, flat, last-point, damaged-hint and sub-two-sample spans have no
handles; locks and recording remain protected. Older unannotated curves expose
only the ordinary selected-to-next-point span.

Validation on this Mac:

- **122 frontend files / 1,471 tests passed**, including three tests for equivalent
  polynomial controls, whole-span conversion/identity across five parameter
  types, outside/end metadata and excluded spans. Lint and TypeScript/Vite passed.
- **105 native library + 3 CLI tests passed**, 10 existing ignored. Tauri debug app
  and optimized CLI built. No native renderer or project schema changed.
- Chrome and Playwright WebKit each passed **120 direct keyboard/pointer edits**:
  all five shape types across ascending/descending gain/pan, delay mix/feedback/
  time and five other FX mix lanes. All **240 native recipe projects** exactly
  match GUI points. Selecting and moving back to baseline preserve original
  points/metadata/history; undo, redo, cancellation, bounds, stale edits, locks,
  recording, Step/flat/short exclusions and point counts passed.
- German 390px lane passed overflow checks; WebKit screenshot inspected. Browser
  emulation is not physical iOS or installed WKWebView interaction.
- Existing custom Bézier regression **10 cases each browser**: native points,
  audio/full-range crop, save/open, live no-restart and history checks passed,
  except the unchanged known WebKit initial long-delay case. Chrome old four
  parameters peak **8.046627e-7**, delay time **3.7744641e-5**; WebKit old four
  **7.7486038e-7**. WebKit initial custom delay time **2.8939545e-4** still exceeds
  its **1e-4** budget; native WAV is byte-identical to installed 0.8.34. This is a
  known-limit report, not a parity pass. Revised custom delay time passes.

Other existing delay, bit-crusher precision, distortion/chorus abrupt-tail and
reverb headroom limits were not fixed or rerun. M2.3 remains open for further
selected FX parameters and broader curve editing. No release tag or Apple upload.

## Local 0.8.34 — direct saved custom timeline handles

Select the first point of an intact saved custom Bézier span for two direct lane
handles. Pointer/keyboard drafts change displayed points locally; release commits
one whole-span undo step, without accumulating points. Escape, cancellation, blur
and stale project identity retain history/redo. Locked/recording/flat/preset or
invalidated spans expose no handles. Gain uses the lane's dB scale; all available
pan, delay and FX mix targets share the same saved linear-point representation.

Validation on this Mac:

- Frontend: **121 files / 1,468 tests**, lint and full TypeScript/Vite build passed.
- Native: **105 library + 3 CLI tests passed**, 10 existing ignored; optimized CLI
  and debug Tauri macOS app built.
- Real Chrome and Playwright WebKit: **24 direct keyboard/pointer edits each**
  across ascending/descending gain and pan, delay mix/feedback/time and ringmod,
  bitcrush, distortion, chorus and reverb mix. Local path preview, one-step undo,
  redo preservation, cancellation, bounds, external edits, locks and recording
  protection passed. All **48 native recipe projects** match GUI points exactly.
- German 390px lane has no horizontal overflow; WebKit screenshot inspected.
  This is browser emulation, not physical iOS or installed WKWebView interaction.
- Existing custom Bézier regression: **10 cases per browser**, native recipe,
  save/open, unchanged-shape redo, live no-restart and full/range crop checks passed.
  Chrome old four targets peak **8.046627e-7**, delay time **3.7744641e-5**;
  WebKit old four targets **7.7486038e-7**. The initial long-delay custom case
  remains **2.8939545e-4**, exceeding its unchanged **1e-4** budget; its native
  WAV is byte-identical to installed 0.8.33. This is an inherited known-limit
  report, not a parity pass. Revised custom delay time meets the existing budget.

No renderer or native schema changed. Other existing delay, bit-crusher precision,
distortion/chorus abrupt-tail and reverb headroom limits were not fixed or rerun
by this increment. M2.3 remains open for further selected FX parameters and broader
direct curve controls. No release tag or Apple upload was created.

## Features by platform

| Capability | Local desktop | iOS/iPadOS | Browser |
|---|---|---|---|
| SFX, voice tools, audio timeline | Yes | Existing mobile implementation | Yes, subject to browser codecs |
| Touch clip actions, mixer, scrubber | Yes | Shared frontend; device validation pending | Yes |
| Automatic Canon/H6 synchronization | Installed FFmpeg/FFprobe required | No | No |
| Video preview + edited MP4 remux | Desktop only | No | No |
| Linked interview project paths | Local desktop | Mac paths inaccessible | No |
| Portable audio project | Yes | Embedded audio | Embedded audio |

## Remaining release gates

- Test the shared editor on actual iPhone and iPad: portrait/landscape, Files,
  export/share, VoiceOver, audio interruptions, foreground/background transitions,
  and memory use with the intended interview length.
- For a complete mobile interview product, implement in-process/native media
  extraction, correlation input, production resampling, video preview, and MP4
  composition/export. Do not expose desktop subprocess commands as working iOS
  features. Add security-scoped media persistence/relocation and a streaming cache.
- For macOS App Store, fix signing/profile validation and validate sandbox file
  access. The Homebrew FFmpeg dependency of the local app has not been established
  as a usable Mac App Store deployment strategy. Bundle/integrate an appropriate
  licensed media implementation before advertising that workflow in the store.
- Check current main CI before tagging. Verify Apple builds in ASC after upload.

See [the interview walkthrough](INTERVIEW_WALKTHROUGH.md) for the working desktop
workflow and the current iOS audio-only preparation/edit/remux workflow.

## Local verification of the October touch changes

Frontend lint/build and 1,147 tests pass. The macOS app was rebuilt and its local
ad-hoc signature verified. Browser workflow checks passed at 375×667, 390×844,
844×390, 1024×768, and 1440×1000, including microphone import/switching, common
splits, seeking, inspector dialogs, touch selection vs. deliberate arrangement,
and undo. The guided desktop setup used mocked native IPC with real excerpt WAV
decoding/video preview; this is not a native dialog/IPC end-to-end test.
No native screenshot capture was repeated after the WindowServer crash.

## Local visual timeline build 0.4.0

Installed and launched `~/Applications/CrispAudio-local.app` with the prepared
MVI_8251 project. Both bundle version fields now read 0.4.0. No Apple upload or
release tag was triggered.

Added a larger/fullscreen viewer, approximate 33 ms seeking, shared-clock video
filmstrip, normalized waveforms and a two-mic alignment inspection overlay.
One source video is locked to its original clock; a persisted, undoable in/out
range exports a single section. Multiple video clips/multicam remain future work.
Desktop FFmpeg is still required; these video features are not available on iOS.

Validation: 1,154 frontend tests, lint/build, 16 native Rust tests and six media
Rust tests pass. Generated-media integration checks cover accurate section first
picture, duration and both audio alternatives, plus invalid ranges/short mixes.
The GUI trimmed-mix backend path has a regression test preventing a second seek.
Full-length compressed video/camera audio hashes still match. Browser checks
cover five touch/desktop viewports; the desktop IPC mock exercised real video
thumbnail generation, alignment comparison and range entry at MacBook size.
This does not establish native WebKit thumbnail or iOS device behavior. Local
native build/signature and process launch were verified without OS screen capture.

## Generic timeline build 0.4.1

The local macOS app now provides a general audio timeline with optional video,
adjacent transport, visible horizontal navigation, independent time zoom/lane
height, Fit all, New project/reset, full project files and reusable track files.
Solo temporarily overrides stored mute in both playback and export. Standalone
camera import is supported; silent video remains unsupported. Auto-sync tracks
reviews native correlation results and applies offsets as one undoable edit;
clock drift is reported, not corrected by this action. Desktop video import still
renders corrected recorder audio. The expanded viewer requests native fullscreen
and has an in-window fallback; Escape restores a fullscreen mode it entered.

Verification: 1,162 frontend tests, lint/build, 17 native Rust tests, six media
Rust tests and generated-media CLI checks pass. Browser checks cover five screen
sizes and the final compact command rows. Mocked native IPC with real media
exercised preview/show/hide/expansion, panning/fit, auto-sync review/apply/undo,
reset/undo and portable track save/load with fresh IDs. These browser checks do
not independently validate native WebKit playback or macOS fullscreen behavior.
The ad-hoc-signed local app is rebuilt/reopened. No release tag or Apple upload.
See [Timeline workflow](TIMELINE_WORKFLOW.md).

## Local 0.5.0 precision and picture editing

The local macOS app adds fitted video overview, draggable cursors, magnetic edge
snapping, precise nudges, track/segment fade envelopes and single-source picture
clips/transitions. Source files remain untouched. Picture and sound edit
independently. Advanced preview is approximate; page peel is a shaded 2D fold.
No new Apple release/tag/upload was requested.

Validation: 1,167 frontend tests, lint/production build, 17 native tests, 8 media
tests; existing generated-media CLI regression and new real-FFmpeg picture
composition checks (cuts, black gaps, fades, 17 transitions, section + trimmed mix,
invalid overlaps). Browser checks at five sizes cover video split/dissolve, fitted
overview under zoom, nudging, mouse/touch cursor dragging, non-activating touch
labels, Voice handoff/return, and rendered audio fade amplitudes including resume.
These use real browser media/audio with mocked native file dialogs/IPC; they do
not replace native WebKit/fullscreen or physical iPhone/iPad testing.

The previous main CI failure exposed FFT tie-dependent confidence for periodic
audio. Sync now rejects templates with a distant correlation peak within 2% of
the winner, excluding a 100 ms neighbourhood of one peak. Repeating tones and
identical broadband material require review on every platform. Unique noisy
signals, inverted quiet signals and measured clock drift remain covered.

## Local 0.6.0 workspace update

See MEDIA_WORKSPACE.md. New desktop work is not an Apple upload or TestFlight
release. New project format is v3; v1/v2 inputs remain supported. Native FFmpeg
operations are desktop-only; no iOS video engine or physical-device validation is
claimed. GUI multi-hour audio remains bounded by decoded-buffer memory.

Verified locally on 2026-10-08: 1,200 frontend tests, 13 media tests and 18
native tests pass; ESLint, TypeScript/Vite and the macOS app build pass. Real
FFmpeg integration covers mixed source dimensions/rates, 40 cuts without
accumulated frame drift, linked CLI edits, rendered automation, project MP4,
loudness and overwrite protection. Browser integration covers two cameras with
linked audio, split/unlink, markers, ripple, transcript import/search/seek,
rendered automation and five desktop/phone viewport sizes. Canon first-frame
capture was checked in WebKit and Chrome; the thumbnail strip additionally uses
a native decoded first tile to avoid WKWebView's black initial canvas. The local
0.6.0 bundle was installed and launched with the preceding arrangement backed up.

Filmstrip follow-up: 1,206 frontend tests pass, including trimmed-start coverage,
multiple-camera retention and serial decoder cancellation. Production image CSP
was checked in WebKit and Chrome with native asset URLs. Real FFmpeg tests
validate thumbnail dimensions, picture pixels and overwrite rejection. Browser
workspace checks also cover per-camera images and IndexedDB audio recovery.
The updated local 0.6.0 app was rebuilt and installed; no Apple upload was made.

## Local 0.6.1 shared timeline

Editable video now shares the audio ruler's zoom, horizontal scroll and cursor.
Project overview is separate in the navigation bar; the playback viewer stays
fitted. The native scrollbar width matches the timeline viewport even with the
workspace open, avoiding scroll position feedback/clamping against window width.

Verified: 1,209 frontend tests, lint, TypeScript/Vite and macOS app build. Browser
checks assert congruent clip/cursor coordinates, overview keyboard and pointer
navigation, real emulated touch swipes without clip mutations, five viewport
sizes and the preceding media workspace/recovery regressions. These are browser
checks, not physical iOS validation. No Apple upload is part of this local update.


## Local 0.6.2 timeline usability

Adds video removal with audio retained/links cleared; mouse, emulated touch and
keyboard track reordering; shared 24–640 px row height; inline help; editable POS
and minimum canvas duration; automatic two-picture dissolves on partial overlap;
selected audio S-curve crossfades; a portal-based expanded viewer; staged,
cancellable import into an existing track or a new track per file. Duration and
trash controls remain available in touch layouts. Desktop import retains paths
and avoids the former full encoded-file copy before decoding.

Verified locally: 1,228 frontend tests, ESLint, TypeScript/Vite, 18 native tests,
13 media tests and the macOS bundle build. Real FFmpeg checks include the new
extended black tail, linked CLI edits and preceding composition regressions.
Browser checks exercise real mouse/touch/keyboard ordering, row extremes, help,
POS/DUR edits, linked overlap dissolves, applied audio fade curves, expanded
viewer viewport geometry, removal/undo, both import destinations and five
viewport sizes. A 253.72 s H6 mono WAV imported in 3.6–4.7 s in Chrome with
responsive timer ticks, including fixture transfer, decode and waveform scan.
That is a browser measurement, not a native file-read or compressed-audio promise.
Native macOS fullscreen was requested through permitted window APIs; these browser
checks do not prove physical fullscreen, iOS hardware behavior or long-file memory
paging. No Apple upload or release tag is part of this local update.

The ad-hoc-signed 0.6.2 local app is installed and running at
`~/Applications/CrispAudio-local.app`. Before quitting 0.6.1, the current autosave
and complete WebKit recovery store were backed up under the private validation
folder (`ux/native-autosave-before-062.json`, `ux/recovery-before-062/WebKit`).
The ordinary Workspace → Recover last arrangement action can resume the cache;
installation does not substitute an older interview project for current work.


## Local 0.6.3 preview and position follow-up

Picture gaps and extended tails now show intentional black without preparing an
unrelated default camera or holding up audio startup. The hidden last decoder is
retained across gaps. Expanded frame stepping follows project FPS and the full
canvas. Fullscreen failure notices stay inside the viewer; late browser requests
are exited after close, and preexisting fullscreen is preserved. Typed POS uses
the scrubber's viewport-follow rules while stopping playback for an exact seek.

Verified: all 1,234 frontend tests, lint, TypeScript/Vite and macOS bundle build.
New regressions cover gap startup, secondary-source decoder retention, fullscreen
tail stepping, late browser fullscreen completion, visible failure notices and
typed position scrolling. Browser checks additionally exercise real audio
playback inside a picture gap, no extra source preparation, visible cursor after
typed seek, expanded black tail/frame stepping, Escape and picture restoration.
Native fullscreen and physical iOS remain outside these browser checks.

Installed and launched the ad-hoc-signed local 0.6.3 app. Current autosave and
WebKit recovery were preserved in the private validation folder under
`ux/native-autosave-before-063.json` and `ux/recovery-before-063/WebKit`.
Temporary Vite servers from this editor validation were stopped. No Apple upload
or release tag was requested. Native/media code is unchanged from tested 0.6.2.


## Local 0.6.4 interaction follow-up

Expanded viewer now traps focus and owns keyboard events. Left/Right steps frames,
Space toggles playback, Escape closes and focus returns to the compact expand
button. Underlying clip editing shortcuts cannot alter the arrangement from the
viewer. Track grips scroll at vertical edges, permit drops over waveforms and
cancel on Escape/pointer cancellation/lost capture. Compact header controls fit
24–96 px rows, preserve readable names and retain audible/silent status; full
mixer controls return at 56 px on desktop and 96 px on touch. Playhead hit regions
are clipped to the viewport instead of extending over neighbouring headers.

Verified: all 1,235 frontend tests, lint, TypeScript/Vite and macOS bundle build.
Browser integration uses 14 tracks to check mouse and emulated touch edge-scroll
drops, cancellation, Undo and unchanged timing; compact header geometry at 24,
56, 80 and 96 px; zero-position header hit testing; selected clips under isolated
viewer arrows/Delete/Undo/Space; Tab wrap, Escape/focus restoration and four
responsive viewports. Native fullscreen/physical iOS remain outside these browser
checks. Both desktop and iOS CI for preceding 0.6.3 completed successfully.

The ad-hoc-signed 0.6.4 local app is installed and launched. Current autosave and
complete WebKit recovery were preserved under the private validation folder's
`ux/native-autosave-before-064.json` and `ux/recovery-before-064/WebKit`. The test
preview server was stopped. Native/media implementation is unchanged; no Apple
upload or release tag was requested.

## Local 0.6.5 inspector follow-up

Existing picture overlaps can change transition style while retaining their exact
interval and linked audio. Changing overlap length or removing a linked overlap
requires unlinking. Typed picture edits commit on Enter and cancel on Escape;
source-bound violations reject the whole edit, including linked sound. Merely
focusing a numeric field does not round timing or create undo history. Inspector
edits preserve linked selection IDs and update their time bounds. Toolbar layout
and overflow-menu fixes from the parallel layout update are included.

Verified: 79 frontend suites / 1,247 tests, lint, and desktop/phone-sized browser
checks for linked style changes, bounds rejection, Escape, picture-only fades,
linked move/Undo, unlinked overlap duration and responsive inspector layout.
Browser media uses short real media fixtures with mocked native file commands;
these checks do not establish physical iOS behavior. Both desktop and iOS CI for
0.6.4 passed. Native/media implementation is unchanged.

TypeScript/Vite and the macOS bundle build passed. The combined ad-hoc-signed
0.6.5 app is installed and launched at `~/Applications/CrispAudio-local.app`.
The current autosave and WebKit recovery store were preserved under the private
validation folder's `ux/native-autosave-before-065.json` and
`ux/recovery-before-065/WebKit`. No Apple upload or release tag is included.

## Local 0.6.6 toolbar follow-up

Video/sync actions and More share the top scrolling toolbar. Explicit square
icon targets center SVGs in transport and toolbar controls. The More menu portals
above app panels at z-index 1000 and stays within the main content area when space
permits. Touch tooltip portals escape toolbar clipping. The waveform display
switch and navigation gesture hint use icons with hover/hold help; project
navigation has no permanent overview heading. Explicit WebKit selection rules
prevent accidental label selection while retaining editable/diagnostic text.

Chrome and WebKit browser checks at 1440×960, 1024×768 and 390×844 verify icon
centering, a single file/media toolbar row, menu hit testing and viewport bounds,
unselectable navigation and no page overflow. Physical iOS is not covered.

All 79 frontend suites / 1,247 tests, lint, TypeScript/Vite and macOS bundle build
passed. The ad-hoc-signed 0.6.6 local app is installed and running. Current autosave
and full WebKit recovery were backed up as `ux/native-autosave-before-066.json`
and `ux/recovery-before-066/WebKit` in the private validation folder. No Apple
submission or release tag is included; native/media code is unchanged.

## Local 0.6.7 contextual help

The top question mark toggles an inspection mode instead of opening a manual.
Highlighted controls show one explanation beside the hovered, focused or tapped
control, including disabled actions. Help taps and editing keys cannot modify
the arrangement. Escape, the help toggle or the status close button exits help.
English/German topics cover move/trim, snapping, clip edits, track ordering,
transport, mixer, time fields, imports and navigation. Focusing and leaving a
POS/DUR field also preserves its exact unrounded value without a commit.

Verified: full frontend run passed 80 suites / 1,250 tests; the final time-field
precision regression and contextual-help suite then passed all six focused tests.
Lint passed. Chrome and WebKit integration at desktop, tablet and phone sizes
verified anchored explanations, viewport bounds, hover, tap without activation,
keyboard focus, Escape and restored editing. Physical iOS remains untested.

TypeScript/Vite and the macOS app bundle build passed. The ad-hoc-signed local
0.6.7 app is installed and launched. Autosave and full WebKit recovery were backed
up under the private validation folder's `ux/native-autosave-before-067.json`
and `ux/recovery-before-067/WebKit`. No release tag or Apple upload is included.

## Local 0.6.8 native menus and SFX view

macOS now installs File, Edit, View, Playback, Window and Help menus. Custom
commands route to existing frontend actions; lazy timeline activation retains a
pending file/view command. AppKit responder actions handle focused text editing;
clip commands use the project clipboard. Undo/Redo selects the active panel's
history. Enabled states follow selection, clipboard, history, modal/help state
and asynchronous commands. Native accelerators own their shortcuts to avoid
applying the same command twice. Menu labels follow English/German UI language.

SFX presets use sound-type icons and wrapping labels on neutral cards. Playback
and export commands use compact icon controls. A single active-output waveform
replaces two misleading copies of the same buffer; duration, peak and RMS report
that actual output. Secondary analysis and quality/preset-file panels collapse.
See `docs/SFX_WORKFLOW.md` for the workflow and possible later visualizations.

Verified: 81 frontend suites / 1,257 tests, lint, TypeScript/Vite, Rust check and
18 native library tests. Routing regressions cover lazy activation, text editing,
modal/help guards, asynchronous duplicate protection and active SFX history.
Chrome/WebKit checks at desktop, tablet and phone sizes verify all 16 preset icons,
German label bounds, active-slot waveform labeling, menu dispatch from SFX into
Timeline, zoom/height and Undo/Redo. These browser checks omit native OS menu
clicks; physical macOS responder behavior and physical iOS remain outside them.

The macOS app bundle build passed. The ad-hoc-signed 0.6.8 local app is installed
and launched. Current autosave and WebKit recovery were backed up under the
private validation folder's `ux/native-autosave-before-068.json` and
`ux/recovery-before-068/WebKit`. No Apple upload or release tag is included.

## Local 0.6.9 — simultaneous SFX slots and real spectrograms

SFX presets are one always-visible horizontally scrollable row. A/B waveforms
now use separate cached slot renders, preserving the actual noise samples when
switching slots. Output refreshes after undo, morphing and sample-rate changes.
Voice uses the same neutral icon preset strip and compact action controls, with
parallel original/processed waveforms. Its old loudness-based pseudo-spectrum
has been replaced with a genuine time-frequency analysis.

Both panels show Hann-window 1024-point FFT spectrograms, actual time/frequency
axes and a fixed −90 to 0 dBFS amplitude scale. Work is bounded at 256 uniformly
spaced windows; longer buffers explicitly say they are sampled overviews. Voice
analyzes its first channel. See `docs/SFX_WORKFLOW.md` for limits and workflow.

Verified: 82 frontend suites / 1,261 tests, lint, TypeScript/Vite and macOS app
bundle build. New tests check tone frequency/amplitude, frequency changes over
time, silence, bounded long-buffer analysis and independent stable A/B renders.
Chrome and WebKit checks cover both panels in German at 1440, 1024 and 390 px,
including single-row preset bounds, horizontal scrolling, parallel waveforms and
populated spectrogram canvases. Physical iOS testing remains pending.

Installed and launched ad-hoc-signed 0.6.9 at `~/Applications/CrispAudio-local.app`.
Backups: private validation `ux/native-autosave-before-069.json` and
`ux/recovery-before-069/WebKit`. No release tag or Apple upload was triggered.

## Local 0.6.10 — collapsible analysis, fades and shared FX racks

Frequency spectrum bars are restored beside the spectrogram in SFX and Voice.
Presets and waveform sections can collapse; spectrum/spectrogram start closed
and unmount their analysis while hidden. Spectrum labels follow sample rate.

Clip, track and master racks share parameter editing, reordering, bypass,
removal and independent copy/replace. Track/master racks are in the mixer.
Realtime playback now runs master FX consistently with offline GUI export, and
stop/restart disposes its effect graph and modulation oscillators. Rack edits
stop playback so the next audition uses the reviewed settings.

The fade tool applies durations/curves to selected AV clips in one undo step,
without moving or trimming them. Video has draggable, frame-quantized fade
handles and an opacity envelope. Overlapping video fade-in/out is accepted
within each clip length; preview multiplication matches the native filters.
See [Fades and effects](DAW_EFFECTS.md) for workflow and current limitations.

Verified: 85 frontend suites / 1,269 tests, lint, TypeScript/Vite, 13 media tests
and one explicitly run FFmpeg integration test. The FFmpeg test exports a white
clip with overlapping fades and measures the expected 25% midpoint luminance.
Chrome and WebKit German desktop/phone checks cover collapse/reopen, both FFT
views, batch AV fades, picture fade dragging/undo and cross-scope rack copy.
Their actual Web Audio engines produce identical samples for realtime-graph
versus export-graph rendering with chorus and a low-pass master filter; maximum
sample difference is zero in each browser. These are buffer/graph tests, not a
physical output-device or iOS test.

The macOS bundle passed, was ad-hoc signed, installed at
`~/Applications/CrispAudio-local.app` and launched as 0.6.10. Current autosave and
WebKit recovery were backed up under private validation
`ux/native-autosave-before-0610.json` and `ux/recovery-before-0610/WebKit`.
No Apple upload or release tag was triggered. Native CLI project rendering still
rejects unsupported FX; GUI export is required for full Web Audio racks.

## Local 0.6.11 verification

Installed and opened `~/Applications/CrispAudio-local.app` version 0.6.11 on
October 8, 2026, preserving and backing up the native WebKit data and autosave.
Ad-hoc signature verification passed. No release tag or Apple upload was made.

- Frontend: 87 suites / 1,274 tests passed; lint and TypeScript/Vite build passed.
- Native desktop command tests: 18 passed.
- Shared media: 15 tests passed, two FFmpeg integration tests opt-in. The colour
  export/bypass integration test was explicitly run and passed with real FFmpeg.
- WebKit browser: actual video decoding and anonymous CORS canvas pixel access,
  colour inspector controls, CSS preview, exact custom-transition reference
  pixels, bypass/reset, desktop and phone layout bounds passed. WebKit reported
  no Canvas2D filter support; the explicit RGB path still passed.
- The native app bundle built successfully. Device testing on iPhone/iPad and
  Apple distribution remain separate release gates.

See [picture colour correction](VIDEO_COLOR.md) for GUI and CLI usage.

## Local 0.6.12 verification

Added per-picture rotation and mirroring; see [orientation workflow](VIDEO_ORIENTATION.md).
The local macOS bundle is ad-hoc signed; this work does not trigger an Apple upload.

- Frontend coverage: 89 suites / 1,280 tests passed across the suite and targeted
  reruns. Three worker-start timeouts in the full run passed with one worker;
  the viewer suite was rerun after the final transition-layer fix (11 tests).
- Shared media: 16 regular tests passed. All three opt-in FFmpeg integration tests
  passed, covering colour/bypass, overlapping fades, and a quarter-turn followed
  by mirroring with measured corner colours and black padding.
- WebKit: actual video preview orientation, deterministic canvas corner pixels,
  colour transition regression, bypass/reset and English/German desktop/phone
  bounds passed without page errors. Preview reference pixels matched exactly.
- Lint, TypeScript/Vite and the native app bundle build passed. Physical iOS/iPadOS
  testing and Apple distribution remain separate release gates.

The preview separates source orientation from composition transitions, so a wipe
or slide keeps its screen direction after source rotation. Resize recalculates
picture fitting, including the expanded viewer. Source thumbnails are unchanged.


## Local formats and Apple media backend 0.7.0

Adds 24-bit FLAC audio export across SFX, Voice and Timeline, native macOS 13+
media preparation and edited MP4/MOV export, explicit export backend selection,
and optional FFmpeg WebM VP9/Opus and AV1/Opus exports. Full Glint/libFLAC/wrapper
copyright notices are embedded in About. See MEDIA_FORMATS_AND_LICENSES.md for
format variants, codec patent scope and the remaining compatibility dependency.

Validation: 90 frontend suites / 1,283 tests; actual WebKit worker FLAC output
passed `flac -t` with its final MD5 and decoded within 24-bit quantization error.
WebKit export options passed EN/DE desktop/phone layout checks with mocked IPC.
Native reference renders covered colour/bypass, orientation and multiplicative
fades; integration covered black gaps/tails, section audio, native MOV, unsupported
transition rejection and optional VP9/AV1 WebM codec identification. Browser checks
are not native IPC or physical iOS validation.

The native Apple helper is desktop macOS only. Advanced transitions, CLI project
audio rendering, long-file alignment/DSP and WebM still require optional FFmpeg.
No permissive-only bundled WebM implementation is claimed. No Apple upload or
release tag was triggered for this milestone. Store sandboxing/signing and actual
iOS device validation remain release gates.

Installed and launched ad-hoc-signed `~/Applications/CrispAudio-local.app` 0.7.0.
The existing native autosave and WebKit state were backed up privately and retained.
Final checks: frontend lint/typecheck/production bundle; 16 media unit tests,
one CLI parser test, 18 Tauri tests, four explicit media integration tests,
including a two-source native dissolve and native reference renders with the
application's FFmpeg/FFprobe paths set to nonexistent files. Desktop signature
verification passed. No release tag, TestFlight or App Store submission was made.


## Local native transitions build 0.7.1

Installed and launched `~/Applications/CrispAudio-local.app` 0.7.1 with its ad-hoc
signature verified and the existing autosave/WebKit state backed up and retained.
Every listed transition now has an Apple renderer, including directional
wipes/pushes, black/white dips, blur, zoom, pixelation, whip, glitch and shaded 2D
page peel. Whip/glitch/page peel require a Metal GPU with dynamic library support;
older Intel GPUs have not been established as compatible. Strict Apple mode fails
explicitly instead of switching backends. Complex renderers/previews are approximate
equivalents, not pixel-identical FFmpeg replacements.

All 21 media tests (including five explicit integration tests) and the CLI parser
test passed. The 17-transition frame test also passed with the application's
FFmpeg/FFprobe paths unavailable. It verifies intact endpoints, overlap effects,
dip midpoints and all four wipe/push directions. Existing orientation, colour,
multiplicative fades, section audio and black gap/tail tests passed. Frontend lint,
typecheck and production desktop bundle passed.

Actual 640×360 interview footage was rendered with native whip, glitch and page
peel, then decoded and visually inspected. The 2.4-second excerpts took 1.609,
0.385 and 0.381 seconds respectively in one run; these small excerpts are not a
full-resolution benchmark. Validation artifacts remain outside git. The previous
0.7.0 commit passed GitHub CI and the unsigned iOS simulator build; that does not
establish native video support on iOS. No release tag or Apple submission was made.


## Local native CLI mixer build 0.7.2

Installed and launched `~/Applications/CrispAudio-local.app` 0.7.2 and installed
`~/Applications/crispaudio-cli-local`. Both local ad-hoc signatures verify.
The existing native autosave and WebKit state were backed up and retained.

The CLI streams linked projects to 48 kHz stereo float WAV. It supports mono and
stereo pan, stored mute overridden by solo, source trims/offsets, overlaps, gains,
clip/track fade curves, automation and low/high-pass clip/track/master racks.
Unsupported enabled DSP fails explicitly. PCM WAV inputs are read directly;
other mono/stereo layouts use Apple float decoding/resampling on Mac. Standard
WAV size and 256 audible clip limits apply. The GUI still renders through Web Audio
with duration-sized buffers; this is not a GUI disk-paging change.

Validation: six actual WebKit TimelineEngine vs native CLI renders (mono/stereo,
left/centre/right pan, overlapping clips, sampled fades, automation and all three
filter racks) agreed within maximum 1.42e-7 / RMS 1.15e-8. Native decoding/resampling
from 44.1 kHz/24-bit mono and full project-to-section-video export passed with the
application's FFmpeg/FFprobe paths unavailable. Integer PCM depths, gain headroom,
source offsets, cancellation/cleanup, bounds and no-overwrite have unit coverage.
All 27 media tests, including six integration tests, and the CLI parser test
passed; frontend lint/typecheck and the production desktop bundle passed. See MEDIA_FORMATS_AND_LICENSES.md for scope.

The real 253.72-second MVI_8251 linked project produced a stereo 48 kHz float mix
in 10.53 seconds with 4,259,840 bytes peak CLI resident memory in one debug run.
That excludes OS cache/other processes and is not whole-GUI memory use. Its 30–38 s
section also rendered natively to 1920×1080 H.264/AAC MP4 (8.0 s output) in 15.1 s,
including the full audio mix. Validation files remain private outside git.
No release tag, TestFlight or App Store submission was made.

## Local native effects build 0.7.3

Installed, ad-hoc signed and launched `~/Applications/CrispAudio-local.app` 0.7.3;
updated the signed `~/Applications/crispaudio-cli-local` command too. Backed up
native WebKit state and confirmed the autosaved arrangement remained unchanged.
No Apple submission, release tag or TestFlight upload was made.

Native CLI clip/track/master racks now support bit crushing and ring modulation
in addition to low/high-pass filters. Fixed two shared GUI DSP bugs: ring
modulation scales the carrier instead of adding it at full strength regardless
of mix, and symmetric bit-crusher quantisation keeps silence at zero. Existing
saved values still load, but these effects intentionally sound different from
older builds. Voice uses the corrected ring-modulator graph too.

Validation: 90 frontend suites / 1,284 tests passed, ESLint passed, and the Tauri
production frontend plus debug macOS bundle built successfully. Media Rust tests:
23 passed, six desktop integration tests remained opt-in; one CLI parser test
passed. New PCM regressions check wet/dry endpoints, silence, quantisation and
absolute oscillator phase for later clips. Previous 0.7.2 desktop and iOS CI
both passed; this build's CI is triggered by its main push.

Six real WebKit OfflineAudioContext/native CLI comparisons combine overlapping
clips, later starts, nonlinear fades, automation, pan and all three racks.
Wet/dry settings 0, 0.35 and 1 passed for both effects. Maximum sample error was
3.51e-5 for bit crushing (RMS 3.35e-7) and 3.06e-7 for ring modulation (RMS
2.72e-8). These are fixture measurements, not proof of sample-identical behavior
for all inputs. Implementation follows the Web Audio waveshaper interpolation
and additive AudioParam semantics: https://www.w3.org/TR/webaudio-1.0/.
Private reproducible harness and PCM/results are outside git:
`.crisperweaver-deps/crispaudio-browser/native-mix-073.mjs` and
`transcripts/2026-Studienwoche/CrispAudio-validation/ux/native-mix-073/` under
`~/code`. Native rendering was tested with FFmpeg/FFprobe paths disabled;
FFmpeg only decoded the resulting WAV for the independent comparison.

No codec dependencies or licensing scope changed. Native delay, chorus, reverb,
oversampled distortion and compressor remain unsupported and fail explicitly;
GUI Web Audio handles them. Disk-paged GUI rendering, a permissive-only WebM
backend and iOS picture export are still unfinished.

## Local native delay/chorus build 0.7.4

Installed, ad-hoc signed and launched `~/Applications/CrispAudio-local.app` 0.7.4;
updated and verified the signed standalone CLI too. Native WebKit state was backed
up and the autosaved arrangement was confirmed unchanged. No release tag,
TestFlight upload or Apple submission was made.

Native clip/track/master racks now include delay and chorus. Delay preserves
fractional timing and the measured macOS WebKit feedback-branch latency of 128
frames; its direct delay is not clamped to that minimum. An impulse through the
actual GUI graph at zero delay appears immediately, then repeats at frame 128;
a 48-frame delay first appears at frame 48 and repeats at frame 224. This is a
measured WebKit compatibility choice, not a claim that all Web Audio engines
have identical cyclic timing. Chorus retains the two wet delay lines and their
absolute render-context LFO phases. Existing GUI effects/settings are unchanged.
Tails continue inside the chosen canvas; clip fades still follow clip FX.
All audible racks have a 64 MiB delay-buffer budget and a 1024-enabled-effect
limit, checked before buffer allocation. Reverb/distortion/compressor remain
explicit native errors and work through GUI Web Audio export.

Validation: 27 media Rust tests and one CLI parser test passed; six older desktop
integration tests remain opt-in and were not rerun for this DSP-only change.
New regressions verify one-frame clip tails, stereo echoes, fractional interpolation,
chorus dry/wet endpoints and allocation/count limits. ESLint, frontend TypeScript
compilation/production bundling and the debug macOS app build passed. Full frontend
1,284-test coverage last ran in 0.7.3; that commit's desktop and iOS CI both passed.
This build changes native DSP, documentation and version labels; its main push
triggers fresh CI.

`scripts/test-native-effects.mjs` is a reusable 27-case comparison with actual
WebKit `TimelineEngine` rendering: stereo/mono, all three racks, delayed starts,
overlaps, pan, sampled fades, automation, maximum two-second delay and modulation.
FFmpeg/FFprobe are disabled, and WAV/extensible float PCM is read directly.
The largest measured sample error/RMS was 8.35e-7/8.82e-8 for delay,
3.56e-5/1.07e-6 for chorus, 3.51e-5/3.35e-7 for bit crushing and
3.06e-7/2.72e-8 for ring modulation. Fixture results do not establish universal
sample identity. The harness retains its owned temporary fixtures; an archived
copy lives outside git at `~/code/transcripts/2026-Studienwoche/CrispAudio-validation/ux/native-effects-074/`.

A real interview section, source time 30–38 seconds, rendered with clip delay
and master chorus in 0.77 seconds (0.68 user / 0.05 system), about 10.4 times faster
than playback, in the debug CLI. Peak CLI RSS was 4,440,064 bytes (4.23 MiB).
This single warm-cache run uses directly decoded 48 kHz WAV and excludes OS cache
and other processes; it is not a general codec or release-build benchmark.
Its derived project and WAV are outside git under `ux/real-interview-074-41c0dujw/`
in that same private validation folder. Original sources/projects were unchanged.

No codec dependencies or licensing scope changed. GUI disk-paged rendering,
permissive-only WebM and iOS picture export remain unfinished.

## Local native convolution build 0.7.5

Installed, ad-hoc signed and launched `~/Applications/CrispAudio-local.app` 0.7.5;
installed and verified the optimised release build of the standalone CLI at
`~/Applications/crispaudio-cli-local`. Backed up native WebKit state and confirmed
the autosaved arrangement unchanged. No release tag, TestFlight upload or Apple
submission was made.

Native clip/track/master racks now include convolution reverb. Its seeded stereo
impulse, 0.1–5 second length, decay and dry/wet blend match the existing GUI.
RMS normalisation uses WebKit's -58 dB calibration rather than the specification's
rounded constant. References: [WebKit](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/audio/Reverb.cpp),
[Web Audio](https://www.w3.org/TR/webaudio-1.0/#ConvolverNode). The convolution code
is our implementation, using the existing RustFFT dependency; no WebKit code is
bundled or ported. Thirty-two direct early samples plus nonuniform FFT tail
bands and a uniform later frequency-delay line introduce no extra latency.
Mono sources become stereo before the track's pan law, including at mix=0.
Conservative convolution-buffer reservations share the existing 64 MiB budget;
very large racks fail explicitly. Preparation observes cancellation. FFT plan
metadata and general process memory are separate from that DSP-buffer budget.
Distortion and compression remain explicit native errors; GUI export handles them.

Validation: 30 media Rust tests and one CLI parser test passed; six existing
native-video integration tests remain opt-in and were not rerun for this DSP
change. New checks compare partition boundaries with independent sparse
convolution, verify seeded stereo reproducibility, and render a one-frame clip's
complete reverb tail. ESLint, frontend TypeScript/production build and the debug
macOS bundle passed. All 35 real WebKit/native release-CLI comparisons passed,
including eight reverb cases (sizes, mono, dry/wet endpoints, short decay,
impulses and five-second tails). Maximum reverb sample error was 3.20e-7;
maximum RMS error was 8.43e-8. Fixtures establish measured agreement, not
sample identity for every possible project/browser. A development-server
reload interrupted an earlier run; the full stable-file rerun passed.
Archived fixtures/results are outside git under
`~/code/transcripts/2026-Studienwoche/CrispAudio-validation/ux/native-reverb-075/`.

The real interview's source time 30–38 seconds, with master reverb size=0.5,
decay=1.5 and mix=0.3, rendered in 0.30 seconds (0.25 user / 0.03 system) with
the release CLI, about 26.7 times faster than playback. Peak CLI RSS was
12,681,216 bytes (12.09 MiB). The debug CLI took 16.32 seconds; its PCM was
identical to the release output for this section. These are single warm-cache
runs on direct 48 kHz WAV, excluding OS cache and other processes; do not
extrapolate them to all codecs or effects. Private derived project/audio lives
under `ux/real-reverb-075-nby481qp/` in that same validation folder. Originals
were unchanged. The GUI audio renderer still uses Web Audio.

RustFFT 6.4.1 and its strength_reduce, transpose, num-complex, num-integer,
num-traits and primal-check dependencies were already linked. Their MIT option
notices are now bundled in About, and the generated manifest has 24 entries.
No new codec/GPL dependency was added. GUI disk-paged rendering, permissive-only
WebM and iOS picture export remain unfinished.

## Local native oversampling build 0.7.6

Installed, ad-hoc signed and launched `~/Applications/CrispAudio-local.app` 0.7.6;
updated and verified the optimised `~/Applications/crispaudio-cli-local`. Native
WebKit state was backed up and the autosaved arrangement confirmed unchanged.
No release tag, TestFlight upload or Apple submission was made.

Native clip/track/master racks now support timeline distortion: the existing
256-entry Float32 tanh curve and four-times oversampling. Two upsampling stages
and two downsampling stages retain the GUI wet path's 192-frame filter delay
(4 ms at 48 kHz); dry sound stays immediate. Do not move clips or automation to
compensate. Filter tails continue after short clips inside the chosen canvas.
Stereo state is bounded and reserved in the shared DSP budget before allocation.
Timeline does not yet expose other distortion algorithms; GUI settings/behaviour
remain unchanged. Compressor is the only remaining unsupported native rack type.

Resampling kernels and phase conventions adapt WebKit's [UpSampler](https://github.com/WebKit/WebKit/blob/ae88abe108bcccf28bd309adeed1d0522595e901/Source/WebCore/platform/audio/UpSampler.cpp)
and [DownSampler](https://github.com/WebKit/WebKit/blob/ae88abe108bcccf28bd309adeed1d0522595e901/Source/WebCore/platform/audio/DownSampler.cpp)
under BSD-3-Clause. Their copyright and complete licence are retained in the Rust
source and bundled About notice; the source revision is pinned. The generated
manifest has 25 entries. This is compatible with the requested permissive licence
scope and adds no codec, GPL binary or package dependency.

Validation: 33 media Rust tests plus one CLI parser test passed; six existing
video integration tests remain opt-in and were not rerun for this DSP change.
New checks cover exact dry output, silence, stereo polarity, wet impulse delay
and a one-frame clip's filter tail. ESLint, frontend TypeScript/production build,
release CLI and debug macOS app bundle passed. All 47 actual WebKit/native
comparisons passed, including 12 distortion cases across drive/mix settings,
mono, unfiltered impulses and 18/19.5 kHz tones. Maximum distortion sample error
was 3.86e-6 and maximum RMS error 1.41e-7. The high-frequency case's maximum error
was 6.86e-7; tests compare waveforms and timing, not a universal proof of alias
suppression or sample identity. Archived fixtures/results live outside git under
`~/code/transcripts/2026-Studienwoche/CrispAudio-validation/ux/native-distortion-076/`.
The previous 0.7.5 commit passed both desktop and iOS CI; this push triggers new CI.

The real interview source section 30–38 seconds, with master drive=0.5 and
mix=0.4, rendered in 0.45 seconds (0.43 user / 0.01 system) using the optimised
CLI, about 17.8 times faster than playback. Peak CLI RSS was 2,703,360 bytes
(2.58 MiB). This single warm-cache run uses direct 48 kHz WAV and excludes OS
cache and other processes; do not extrapolate to all codecs or racks. The private
derived project and WAV live under `ux/real-distortion-076-4p_7hl9t/` in the same
validation folder. Original sources/projects were unchanged.

Compression still requires GUI export. GUI disk-paged rendering, permissive-only
WebM and iOS picture export also remain unfinished.

## Local 0.7.7 — native stereo-linked compression

Installed and launched `~/Applications/CrispAudio-local.app` version 0.7.7 and
replaced `~/Applications/crispaudio-cli-local` with the optimised standalone CLI.
Both ad-hoc signatures verified. WebKit state and the one saved autosave were
backed up under `ux/recovery-before-077/`; the autosave JSON remains unchanged.
No release tag or Apple upload was requested for this local increment.

Every current timeline rack type now works in native linked-project CLI export.
Compression reproduces the Mac GUI's soft knee, maximum-of-stereo detector,
automatic makeup, adaptive release and 288-frame lookahead at 48 kHz. Its control
envelope uses 32-frame project-clock divisions. Clip racks with a compressor
process pre-start silence without consuming source samples. Mono becomes stereo
before pan. Fixed state counts toward the shared 64 MiB DSP budget. Unknown
enabled types still fail; source files and saved projects remain untouched.

The implementation adapts WebKit DynamicsCompressorKernel at revision
`ae88abe108bcccf28bd309adeed1d0522595e901` under BSD-3-Clause. The Google 2011
copyright and full notice are retained in the Rust source and bundled in About;
the generated manifest now contains 26 entries. No new dependency was added.

Validation: 35 media Rust tests and one CLI parser test passed, including linked
stereo impulse delay and finite zero-release/silence output. Six existing native
video integrations remain opt-in and were not repeated for this audio change.
ESLint, TypeScript/production build, optimised CLI and debug macOS app bundle
passed. The complete actual-WebKit/native comparison passed 56 cases, nine for
compression including defaults, 1:1 ratio, mono, parameter endpoints, unequal
stereo bursts, impulses, overlapping clips and all three rack levels. Compressor
cases below full scale had maximum sample error 1.17e-6 and RMS error 5.41e-8.
Extreme cascaded makeup exceeds unity in float output; above full scale the
comparison scales tolerances by the reference peak and does not alter PCM.
The largest compressor peak-normalised sample error was 1.17e-6. An initial full
run exceeded tolerance on an existing chorus case; the unchanged repeat passed.
No chorus change is included, and browser-run variability remains a validation
limitation. Fixtures/results are archived outside git in `ux/native-compressor-077/`.
Both desktop and iOS CI passed the previous 0.7.6 commit; this push starts new CI.

The interview's 30–38 second section with default master compression rendered
in 0.20 seconds (0.10 user / 0.02 system), 40 times faster than playback, using
the optimised CLI. Peak CLI RSS was 2,703,360 bytes (2.58 MiB). This single
warm-cache measurement uses direct 48 kHz PCM and excludes OS cache and other
processes; it is not a general codec/rack benchmark. The derived project and WAV
are in `ux/real-compressor-077-oh72nntf/`; originals were not rewritten.

GUI disk-paged rendering, permissive-only WebM and iOS picture export remain
unfinished. The CLI audio endpoint still writes float WAV; GUI encoder workers
provide the separate compressed-audio formats.

## Local 0.7.8 — native mixing in GUI video export

Installed and launched `~/Applications/CrispAudio-local.app` version 0.7.8;
updated the optimised standalone CLI. Both ad-hoc signatures verified. The one
saved autosave remains unchanged; WebKit data and its JSON are backed up under
`ux/recovery-before-078/`. No release tag or Apple upload was triggered.

Mac GUI video export now streams the audio of linked 48 kHz mono/stereo projects
with the same bounded native DSP mixer used by the CLI. The IPC request carries
paths and project settings, never decoded PCM. Native mixing feeds the selected
picture backend: Apple MP4/MOV or optional FFmpeg compatibility/WebM. Native
mix errors remain visible without an automatic audio-mixer fallback. The owned
full-clock mix retains prior effect history for a later selected section and
is sought exactly once during composition. Temporary media is removed on all
exits. Cancellation uses the same registered/retried media-job mechanism for
both native and Web Audio paths.

Only audible referenced sources determine eligibility. Solo overrides stored
mute state; muted/unreferenced generated sounds do not block native rendering.
Audible in-memory sounds, multichannel sources, non-48-kHz projects and other
platforms retain Web Audio. Import and playback still hold decoded source buffers;
this removes the extra full render/PCM transfer during eligible video export.
Audio-only GUI export remains on Web Audio and the encoder worker. No new codec
or dependency was added; the 26-entry licence manifest remains unchanged.

Validation: 16 targeted frontend tests passed, including seven new eligibility,
error, fallback, cleanup and cancellation checks. ESLint, TypeScript/production
build, optimised CLI and debug macOS bundle passed. All 35 ordinary media Rust
tests and the CLI parser test passed; seven native video integrations are opt-in.
The new native section integration was explicitly run and passed: source audio
is silent outside seconds 1–2, and both ends of that selected export contain the
expected tone. It also checks section length, invalid range and output protection.
The six older picture integrations were not repeated; DSP waveforms were unchanged
and the previous version's 56 WebKit/native comparisons were not repeated here.
Both desktop and iOS CI passed 0.7.7; this push starts new CI.

A private derivative of the real interview project exported seconds 30–38 with
default master compression in 5.37 seconds (2.85 user / 0.62 system). This includes
mixing the original full 253.72-second audio clock and composing the eight-second
picture section. Apple probing reports exactly 8.0 seconds, stereo 48 kHz and video;
independent decoding produced 384,000 frames with RMS 0.0833. macOS time reported
peak RSS 68,386,816 bytes (65.2 MiB); this is not a complete memory measurement of
the editor, OS cache or concurrent processes. No universal speedup is inferred
from this single run. The project, output and measurements live outside git in
`ux/real-video-export-078-vnnokm9p/`; original recordings/projects were untouched.

Remaining work includes disk-paged import/playback and audio-only GUI export,
permissive-only WebM and iOS picture composition.

## Local 0.7.9 — direct desktop timeline WAV

Installed and launched `~/Applications/CrispAudio-local.app` version 0.7.9 and
updated the optimised standalone CLI. Both ad-hoc signatures verified; the one
autosave JSON remains unchanged. WebKit state and autosave are backed up under
`ux/recovery-before-079/`. No release tag or Apple upload was triggered.

Eligible Mac timeline WAV exports use the linked native mixer directly. The save
dialog runs first, then the cancellable job writes the mix in blocks to a new
file. No rendered AudioBuffer, PCM IPC payload, encoded Blob or duration-sized
result cache is created. Direct jobs share the export hook's controller guards,
so late failures/completions cannot overwrite a restarted job. Native errors
are shown with their detail. Existing output files remain protected; cancelled
or failed staging is cleaned up before publication.

WAV honors the GUI's 8/16/24/32-bit integer setting: clamp at full scale, use the
same asymmetric negative-tie rounding as JavaScript, and retain no dither.
WAV8 uses the correct unsigned disk representation through signed Hound samples.
GUI WAV32 remains integer PCM. CLI/video default float32 still preserves peaks
above unity; the new `--wav-bit-depth` flag explicitly selects native PCM. It
accepts the same four depths, conflicts with video and rejects explicit FFmpeg
mixing. DSP and source files are unchanged. Compressed GUI exports, audible
in-memory sources, multichannel/non-48-kHz projects and other platforms retain
the former Web Audio/worker path. Import/playback still hold decoded source buffers.

Validation: 36 media Rust tests passed, including independent PCM values for
silence, positive/negative half levels, rounding ties and clipped headroom at
all depths; output protection and invalid-depth rejection are checked. Both CLI
parser tests passed. Seven older picture integrations remain opt-in and were
not repeated for this WAV writer change. All 21 targeted frontend tests passed,
including direct-job cancellation/restart, save-dialog cancellation, late dialog
results and surfaced failures. ESLint, TypeScript/production build, optimised CLI
and debug macOS bundle passed. The optional actual-WebKit PCM harness passed all
four depths with byte-identical audio payloads for random stereo, boundary/tie
samples and clipping. Container headers are not required to match. Fixtures and
results are archived outside git under `ux/native-pcm-079/`. DSP calculations
were unchanged; the prior 56 effect comparisons were not repeated. CI for 0.7.8
is still queued/running at this checkpoint; the new push also starts CI.

The full 253.72-second interview, with default master compression, exported to
stereo 48 kHz/24-bit PCM in 2.62 seconds (2.18 user / 0.18 system), about 97 times
faster than playback. Peak CLI RSS was 2,719,744 bytes (2.59 MiB); this single
warm-cache direct-PCM run excludes editor buffers, OS cache and other processes.
Independent RIFF inspection confirmed 12,178,560 frames and the selected depth;
file size is 73,071,428 bytes. The private derived project, WAV and measurement
are under `ux/real-pcm-079-8gwtf97h/`; originals were not rewritten.

No codec or dependency was added; the 26-entry licence manifest is unchanged.
Remaining work includes disk-paged import/playback, streaming compressed-audio
export, permissive-only WebM and iOS picture composition.

## Local 0.7.10 — native Mac FLAC

Installed and launched `~/Applications/CrispAudio-local.app` version 0.7.10;
updated the optimised standalone CLI. Both ad-hoc signatures verified. The one
autosave JSON remains unchanged, with WebKit data and JSON backed up under
`ux/recovery-before-0710/`. No release tag or Apple upload was triggered.

Eligible Mac timeline FLAC now uses the native mixer and Apple system encoder.
The CLI accepts a `.flac` output through the same route. An owned float WAV holds
the full-clock mix; a 4096-frame AVAudioFile buffer feeds the encoder, then the
finished FLAC is published atomically after checking rate, stereo channels,
24-bit depth, frame count and populated STREAMINFO MD5. Cancellation kills the
owned helper and removes temporary files. Native errors remain visible; explicit
FFmpeg mixing is rejected for this FLAC endpoint. No new codec/dependency or
redistributed binary was added; the 26-entry licence manifest remains unchanged.

Signed 24-bit quantisation matches the existing GUI libFLAC worker, including
negative ties and clipped headroom. It uses the 8388608 scale, distinct from
integer WAV's 8388607 scale. Apple's compression preset differs from the worker's
level 5, so compressed bytes and size need not match. Audible in-memory sounds,
other rates/platforms and other formats keep the worker. Native export needs disk
space for the full float WAV plus encoded output; import/playback buffers are
still loaded. The GUI's direct-job helper now handles both WAV and FLAC.

An early encoder prototype attempted an extra read after the input's final frame;
AVAudioFile rejected it on the real WAV. The production loop reads only remaining
frames and scopes the writer so finalisation completes before metadata inspection.
The full-file and boundary checks below passed with that correction. About's
update check also now compares stable version components numerically, so 0.7.10
is correctly newer than 0.7.9 and does not advertise an older tag as an update.

Validation: all 37 ordinary media Rust tests and both CLI parser tests passed;
eight platform integration tests remain opt-in. The new FLAC integration was
explicitly run and passed, with exact signed PCM, clipped/tie values and an
independent MD5 comparison. Seven older picture integrations were not repeated.
All 22 targeted export frontend tests plus two version-comparison tests passed.
ESLint, TypeScript/production build, release CLI and debug macOS app bundle passed.
Actual WebKit TimelineEngine + GUI FLAC worker and native FLAC decoded to exactly
the same 28,800 PCM bytes; both stored the independent MD5 for 4,800 stereo frames.
FFmpeg was disabled for native rendering and used only for reference decoding.
Archived fixtures/results live outside git under `ux/native-flac-0710/`. Native
DSP and WAV writing were unchanged; prior DSP/PCM suites were not repeated. Both
desktop and iOS CI passed 0.7.9; this push starts new CI.

The full 253.72-second interview with default master compression exported in
5.69 seconds (4.51 user / 0.41 system), about 45 times faster than playback.
macOS time reported peak RSS 15,925,248 bytes (15.2 MiB); this is a single
warm-cache direct-PCM-source run, not total editor/OS-cache/process-tree memory.
Output is 24,890,545 bytes, about 34% of the corresponding 24-bit WAV's size.
Independent decoding confirmed 12,178,560 stereo 48 kHz frames and matched the
stored MD5 `55c90365aa870825be259c39850c02ef`. The derived project, FLAC and
measurement live under `ux/real-flac-0710-u_9ywxnh/`; originals were not rewritten.

Remaining work includes disk-paged import/playback, streaming MP3/AAC/Opus
export, permissive-only WebM and iOS picture composition. Native FLAC was tested
on this Mac; unsupported system encoder configurations fail explicitly.

## Local 0.7.11 — native Mac AAC-LC

Installed and launched `~/Applications/CrispAudio-local.app` version 0.7.11
and updated the optimised standalone CLI. Both ad-hoc signatures verified.
The one autosave JSON remains unchanged; WebKit data and the JSON backup are
under `ux/recovery-before-0711/`. No release tag or Apple upload was triggered.

Eligible linked 48 kHz Mac timeline AAC export now uses the native mixer and
Apple system encoder, retaining the existing `.aac` ADTS format. The GUI
passes its configured bitrate; CLI `render-project` accepts
`--audio-bitrate-kbps 96|128|192|256|320` (default 192 for AAC). Other projects
and platforms retain the existing worker. WAV and FLAC paths remain available.
No codec dependency or redistributed binary was added; the 26-entry licence
manifest remains unchanged.

The encoder uses 4096-frame buffers from an owned float WAV, with finite-sample
validation and clipping rather than automatic normalisation. A bounded ADTS
parser verifies AAC-LC, stereo 48 kHz, packet completeness and the actual
packet clock before atomic no-overwrite publication. Cancellation removes
owned temporary files. Explicit FFmpeg mixing is rejected for this endpoint;
FFmpeg was used only as an independent reference decoder in validation.
Disk space is needed for the temporary WAV plus encoded output. Import and
playback buffers are still loaded.

ADTS has no gapless metadata. The five bitrate signal tests measured 2,112
priming frames (44 ms) plus end padding. WAV/FLAC remain the choices for exact
timeline exchange. Duration estimates based on ADTS bitrate can be inaccurate;
validation uses packet counts and independent decoded frame counts instead.

Validation: all 38 ordinary media Rust tests and three CLI parser tests passed;
nine platform integrations are opt-in. The new AAC integration was explicitly
run at all five bitrates and passed, checking independently decoded stereo
bursts, priming alignment, signal error, packet clock and no-overwrite behavior.
The FLAC PCM/checksum integration was repeated and passed because encoder
orchestration is shared. Seven older picture integrations were not repeated.
All 23 targeted export frontend tests, ESLint, TypeScript/production build,
release CLI and debug macOS app bundle passed. Prior DSP/PCM/WebKit suites
were not repeated because those implementations are unchanged. The 0.7.10
iOS CI passed; desktop CI was still queued at this milestone. This push
starts new CI.

The full 253.72-second interview with default master compression exported
at 192 kbps in 4.67 seconds (4.03 user / 0.35 system), about 54 times faster
than playback. Output is 6,173,961 bytes. Independent ADTS inspection and
full decoding agreed on 11,896 packets / 12,181,504 stereo frames, or
253.781333 seconds including priming and padding. Source duration remains
12,178,560 frames. macOS time reported peak RSS 15,761,408 bytes (15.0 MiB);
this single warm-cache direct-PCM-source run excludes editor buffers, OS
cache and other processes. The derived project, AAC and validation JSON
are under `ux/real-aac-0711-hqkpne2a/`; originals were not rewritten.

Remaining work includes disk-paged import/playback, streaming MP3/Opus export,
permissive-only WebM and iOS picture composition. Native AAC was tested on
this Mac; unsupported system encoder configurations fail explicitly.

## Local 0.7.12 — native Mac M4A/AAC

Installed and launched `~/Applications/CrispAudio-local.app` version 0.7.12 and
updated the optimised standalone CLI. Both ad-hoc signatures verified. The one
autosave JSON remains unchanged, with WebKit data and JSON backed up under
`ux/recovery-before-0712/`. No release tag or Apple upload was triggered.

The eligible Mac timeline's AAC save dialog now offers ADTS `.aac` and real
MPEG-4 audio `.m4a`. CLI `.m4a` output follows the same native AAC-LC route at
96/128/192/256/320 kbps (default 192). This does not add M4A to the global
SFX/Voice/worker formats; other platforms/non-linked projects keep ADTS export.
No codec dependency or redistributed codec binary was added; the 26-entry
licence manifest remains unchanged.

The system writer records priming/padding metadata. A second strict helper
operation checks its final Core Audio packet table and AAC-LC format before
publication: valid frames exactly match the source, and packets * 1024 equal
valid + priming + remainder, with bounded priming/padding and stereo 48 kHz.
The reader reports M4A AAC-LC ASBD flags=0; flags=2 belong to the CAF object-type
convention and incorrectly reject this valid M4A layout. Gapless-aware readers
can trim the metadata; encoded timestamps/duration fields need not equal the
valid PCM frame count. AAC remains lossy. Video rendering continues to use PCM;
WAV/FLAC remain lossless intermediates. Temporary float WAV disk-space and
loaded import/playback buffer limits are unchanged.

Validation: all 39 ordinary media Rust tests and three CLI parser tests passed;
ten platform integrations are opt-in. The new M4A integration passed all five
bitrates, plus 1/1023/1024/24001-frame boundaries, checking independent FFmpeg
decoded length, unshifted stereo signal error and no-overwrite behavior. The
ADTS AAC and FLAC PCM/checksum integrations were repeated and passed because
orchestration and the Swift helper are shared. Seven picture integrations were
not repeated. All 26 targeted frontend tests, ESLint, TypeScript/production
build, release CLI and debug macOS app bundle passed.

The new optional `scripts/test-native-m4a.mjs` also passed in real headless
WebKit at all five bitrates: each decoded exactly 24,001 stereo 48 kHz frames,
with unshifted RMS error below 0.004. Native rendering disabled FFmpeg/FFprobe.
The default Playwright browser revision was not installed, so the harness used
its explicit executable override with the existing WebKit 2336 installation.
No browser download, OS screenshot or permission reset was performed. Fixtures
and results are archived outside git under `ux/native-m4a-0712/`. Prior DSP/PCM
suites were not repeated because those implementations are unchanged.

The full 253.72-second interview with default master compression exported to
192 kbps M4A, producing 6,152,129 bytes. Independent full decoding confirmed
exactly 12,178,560 stereo 48 kHz frames. Export took 11.91 seconds (8.12 user /
1.52 system), with macOS time peak RSS 16,171,008 bytes (15.4 MiB). WebKit/native
bitrate tests ran concurrently: this is not an isolated speed benchmark and
should not be compared directly with the previous AAC/FLAC timings. Memory
excludes editor buffers, OS cache and other processes. The derived project,
M4A and validation JSON are under `ux/real-m4a-0712-mnv2wqgx/`; originals were
not rewritten.

At validation time, 0.7.11 desktop CI remained queued and its iOS CI was running;
this push starts new CI. Remaining work includes disk-paged import/playback,
streaming MP3/Opus export, permissive-only WebM and iOS picture composition.

## Local 0.8.0 — range and lock foundation (M1 in progress)

Installed and launched the ad-hoc-signed local app and updated the optimised
standalone CLI; both signatures verified. The one autosaved project JSON remains
unchanged, with WebKit/JSON backed up under `ux/recovery-before-080/`. The first
LaunchServices open immediately after quit returned -609; a fresh `open -n`
succeeded after the previous process had exited. No release tag/Apple upload.

Added independent saved editRange, ruler range mode/handles, exact bounds,
keyboard adjustment and audio/picture highlighting. Play range uses its bounds;
Loop repeats the selected playback interval. Normal play/export remain full
project operations. A gain gate scheduled on the audio clock blocks source and
FX-tail output at the range end, independent of delayed UI frames. Loop restart
still uses the existing RAF scheduler; seamless musical looping is not claimed.
macOS Playback commands and Cmd/Ctrl+Shift+Space share the same range actions.
Contextual help and EN/DE labels are included. The empty-project welcome overlay
now begins below the ruler rather than covering its input surface.

Persisted audio/picture locks protect clip changes, deletion, source replacement
and linked/clipboard edits, enforced on both action and direct setState commits.
Blocked edits leave the entire commit and clipboard/history unchanged. Mute,
solo, track level/pan/automation/inserts, copy and lane order remain available.
Undo/redo restores whole historical snapshots; explicit project load/reset is
allowed. CLI recipes reject changed protected audio/picture clip data. No effect,
codec or third-party dependency was added.

Validation: all 94 frontend test files / 1309 tests passed, including central
lock rejection, linked edits, mixing/copy access, unlock/undo, serialization,
range validation and transport stop/loop overshoot. ESLint and TypeScript/web
build passed. All 40 ordinary media Rust tests and three CLI parser tests passed;
ten platform integrations remain opt-in. This milestone changes editing/live
playback rather than native DSP/codec implementations, so older codec/picture
integrations were not repeated. Release CLI and debug macOS app bundle passed.

Actual headless WebKit tested ruler drag 2–4 seconds and keyboard end adjustment
to 4.001. An OfflineAudioContext exercised the live TimelineEngine graph with
a delay effect: audible samples inside the range, exactly zero after its boundary.
The optional reproducible harness is `scripts/test-timeline-range.mjs`. Its first
run found the empty-overlay problem; subsequent development-server HMR produced
separate dynamic-import store instances, so the final passing check used a fresh
owned server. This is WebKit validation, not a physical iOS claim. No OS screenshot
or permission reset was used. Full interview export was not repeated because
export/mixing semantics were unchanged. Shared optional metadata reads remain
compatible with project v3.

M1 remains in progress: range export, scoped lift/extract/insert, ripple
participation, transition-aware ripple, advanced trims and named groups follow.
M2–M10 are still planned. Long-recording paging and additional codecs remain
lower priority as requested; see the active roadmap in PLAN.md.

## Local 0.8.1 — reviewed scoped range edits (M1 in progress)

Installed and launched the ad-hoc-signed Mac app and optimised CLI. Signatures
verified, one autosaved arrangement preserved exactly; backup is under
`ux/recovery-before-081/`. No tag or Apple upload.

GUI and CLI now support lift/extract/insert-gap, saved track/picture participation,
linked scope protection, untouched transitions, automation boundary values and
optional canvas/marker/transcript retiming. The dialog previews duration and
blocked operations. Boundaries through blends or transcript cues still require
review first; advanced transition trims remain planned.

Validation: 95 frontend files / 1315 tests, ESLint, TypeScript/web build, 43
ordinary media Rust tests and three parser tests passed. Release CLI and debug
Mac bundle passed. Actual headless WebKit tested partial-link rejection, saved
scope, apply and undo. Native/GUI semantic parity passed for all three operations
and the real Canon/H6 interview. A private derivative removed 45–47 seconds;
native Apple WAV export measured 251.720 seconds, stereo 48 kHz, matching the
shortened arrangement. Originals and source media were untouched. No physical
iOS claim or new dependency. Older codec integrations were not rerun because
their implementations were unchanged. Range export, advanced trims, named groups
and M2–M10 remain outstanding; paging/codecs stay deferred.

## Local 0.8.2 — selected range export (M1 in progress)

Installed/launched signed local app and optimised CLI; one autosave preserved,
WebKit/JSON backup under `ux/recovery-before-082/`. No Apple submission/tag.
Explicit selected audio export retains full DSP preroll and crops at rounded
sample bounds. Native output remains bounded; browser export retains preroll
AudioBuffer memory. File menu action and EN/DE labels included. Video range
can explicitly reuse the selected interval; CLI --start/--end covers both media.

95 frontend files / 1316 tests, lint, TS/web build, 44 ordinary Rust media tests,
three parser tests, release CLI and debug app bundle passed. Native FLAC, AAC
and M4A opt-in integrations were rerun and passed. Actual WebKit delay-tail range
export was identical to a full-render slice (1920 frames, maximum error zero).
The private real interview derivative exported 44–48 seconds as WAV, FLAC, M4A
and MP4. WAV matched the full-mix PCM slice byte for byte; WAV/FLAC/MP4 measured
4 seconds. M4A's packet duration was 4.053333 seconds, but reference decoding
returned exactly 192000 stereo frames / 4 seconds. Original project untouched.
Seven other opt-in integrations were not rerun. Physical mobile validation and
advanced trim/groups/mixer/picture-stack milestones remain outstanding.

## Local 0.8.3 — reviewed trims and edit navigation (M1 in progress)

Installed/launched the signed local app and optimised CLI, preserved the one
autosave exactly, backed up WebKit/JSON under `ux/recovery-before-083/`.
Added rolling shared cuts, ripple left/right trims, trim-to-playhead and edit-point
navigation with macOS menu/browser shortcuts, contextual help and EN/DE labels.
Source handles, lane locks, ambiguous neighbours, incomplete right link groups
and unsupported picture blends are checked. Ripple uses saved lane participation
and the existing explicit range contract; its global-retiming defaults apply.
Slide editing, advanced blend trims, named groups and command search remain.

Validation: 96 frontend files / 1323 tests, ESLint, TypeScript/web build, 45
ordinary media Rust tests and three parser tests passed; release CLI/debug Mac
bundle passed. Actual WebKit dialog tested source-limit rejection, rolling Apply,
undo and navigation. Eight native/GUI trim cases matched. The real Canon/H6
project was copied, all three microphone clips linked to picture, and split at
45 seconds. A roll moved the cut to 45.08 with unchanged sample-rounded length;
ripple shortening moved it to 44.92 and reduced the arrangement to 253.64 seconds.
The derivative's 44–46 second WAV rendered stereo 48 kHz / exactly two seconds.
Private fixtures are under `ux/trim-edit-083/`; source project/media untouched.
A precision regression compares outer endpoints within double precision and
exact sample counts; decimal binary representation may differ by one floating
unit. Ten opt-in platform/codec integrations were not repeated: their code was
unchanged. No dependency, tag, Apple upload or physical mobile validation added.

## Local 0.8.4 — named groups and command search (M1 in progress)

Installed/launched the signed local app and optimised CLI. One autosaved project
preserved exactly; WebKit/JSON backup under `ux/recovery-before-084/`. No tag or
Apple upload. Named groups are separate from AV links; grouping is persisted and
can be disabled for individual edits. Splits/range fragments retain membership;
pastes and loaded tracks get independent group identities. Grouped scope and
lane locks reject indirect edits. Group labels appear in audio/picture clips,
and snapping excludes the whole moving group. Source unlink remains independent.

Find command provides searchable timeline actions and shortcut hints, via toolbar,
Cmd/Ctrl+K and Mac Edit menu. It closes before command dispatch to avoid its own
modal guard blocking the action. Group controls and search are EN/DE localized.

Validation: 97 frontend files / 1329 tests, lint, TypeScript/web build, native
media/CLI tests, release CLI and debug Mac bundle passed. Actual WebKit checked
group creation/selection, disabling groups while retaining AV links, command
execution after closing search, and German controls at 390×844 without input/button
overflow. Four native/GUI semantic cases matched. A private real Canon/H6 copy
grouped all microphones/picture and moved them one second; the corresponding
two-second passages before/after movement had byte-identical PCM. Originals
untouched; fixtures under `ux/edit-groups-084/`. Physical mobile validation is
still pending. DSP/codec implementations/dependencies were unchanged, so ten
opt-in platform integrations were not repeated. Slide/advanced blend trims and
M2–M10 remain outstanding. Prior main iOS CI passed; desktop CI remained queued.

## Local 0.8.5 — CrispASR and spoken-word cuts (2026-10-09)

Desktop app/CLI built, installed and launched at local 0.8.5; ad hoc signatures
verified and the existing autosave preserved. Frontend: 99 files / 1,339 tests;
native: 48 media tests + 3 CLI tests (10 optional integrations ignored). Lint,
typecheck, web build, release CLI and desktop bundle passed. External local CrispASR + Cohere Q8 + Apache-2.0
German wav2vec2 forced alignment; models and ASR executable are not bundled.
Real MVI_8251 browser word deletion verified all three microphones/picture,
undo/redo/reopen and CLI parity. The final 44.96–45.48 s cut removes 0.52 s;
2-second rendered WAV is byte-identical to the corresponding original PCM with
that interval removed. Exported MP4 audio and video both measure 2 seconds at
25 fps. See SPEECH_EDITING.md. Final GUI harness used installed headless Chrome;
WebKit initially exercised deletion, but its externally stored runtime later
stalled during page startup. No OS capture/TCC reset was performed.

No release tag or Apple submission for this increment. Mobile ASR remains pending.

## Local 0.8.6 — keep pasted transcript passages (2026-10-09)

Built, installed and launched local 0.8.6; ad hoc app/CLI signatures verified and
existing autosave preserved. Frontend: 101 files / 1,353 tests; native: 50 media
+ 3 CLI tests, 10 optional integrations ignored. Lint, TypeScript production web
build, release CLI and desktop bundle passed. Actual headless Chrome interview
paste workflow, repeat-resolution component tests, undo/redo/reopen, German phone
controls and native recipe parity passed. Retaining two MVI_8251 passages yields
13 timed words / 4.88 s; rendered WAV is exactly the two original PCM intervals
joined, and MP4 audio/picture duration stays within one 48 kHz sample. See
KEEP_TEXT_EDITING.md. No new dependencies or crisp-docx AGPL code introduced.

No release tag/Apple submission. Free-text comparison is GUI; CLI consumes its
reviewed `keep-words` recipe. Embedded/mobile ASR is still not implemented.

## Local 0.8.7 — fixed-content slide editing (2026-10-09)

Built, installed and launched local 0.8.7; app/CLI ad hoc signatures verified and
one existing autosave preserved. Full frontend run: 101 files / 1,357 tests, plus
the added acoustic-alignment invalidation test (12 trim tests passed). Native:
51 media tests + 3 CLI tests passed, 10 optional integrations ignored. Lint,
TypeScript production web build, release CLI and desktop bundle passed. Headless
Chrome exercised the actual Trim tools slide dialog, source-limit blocking and
undo; ten GUI/native recipe comparisons include positive/negative slides.

On a private MVI_8251 derivative, link three microphone clips and picture, split
at 45/60 seconds, then slide the middle passage +0.08 seconds at 25 fps. Source
content/duration and approximately 253.72-second canvas stay unchanged. Native
48.08–50.08-second WAV matches original 48–50-second PCM byte for byte (96,000
stereo frames). Original project/media remain unchanged; private artifacts are
under `CrispAudio-validation/ux/slide-087/` outside the repository.

Incoming picture blends and ambiguous overlapping lanes are rejected. Timeline
markers/automation stay fixed; existing acoustic alignment becomes stale and must
be regenerated before speech cuts. Shared frontend supports touch controls, but
this increment has no new iOS device validation. No release tag/Apple submission.

## Local 0.8.8 — rolling picture transitions (2026-10-09)

Built, installed and launched 0.8.8; app/CLI ad hoc signatures verified and one
existing autosave preserved. Frontend: 101 files / 1,361 tests passed. Native:
52 media tests + 3 CLI tests passed, 10 optional integrations ignored. Lint,
TypeScript production web build, release CLI and desktop bundle passed.

Headless Chrome exercised Trim tools, transition roll/undo and twelve GUI/CLI
comparisons. Unit checks cover every supported transition type in both directions,
frame edges, consumed handles and conflicts with neighbouring transitions.
A synthetic native Apple dissolve retained its 0.4-second length and 3.6-second
picture duration; its red/blue midpoint moved from 1.8 to 2.0 seconds. The optional
`scripts/test-roll-blend.py` creates and inspects these colour fixtures with
installed FFmpeg/FFprobe; Apple performs the actual project export.

On a private Canon/H6 derivative, rolling a 0.4-second picture overlap +0.08 s
moved the left end to 45.08 s and right start to 44.68 s. Three microphones
retained their relative picture/source offsets, and the 253.72-second canvas
stayed fixed. The rendered 44–46 s audio remained byte-identical (96,000 stereo
frames); exported MP4 audio/picture both measured 2 seconds. Original media/project
were untouched; private artifacts are in `ux/roll-blend-088/` outside the repo.

Slide/ripple/range blend semantics remain unfinished. No new iOS device
validation, release tag or Apple submission for this increment. README describes
current support; chronological notes stay in history.md and these records.

## Local 0.8.9 — slides through picture transitions (2026-10-09)

Built, installed and launched 0.8.9; app/CLI ad hoc signatures verified and one
existing autosave preserved. Frontend: 101 files / 1,363 tests passed. Native:
53 media tests + 3 CLI tests passed, 10 optional integrations ignored. Lint,
TypeScript production web build, release CLI and desktop bundle passed.

Slide preserves incoming/outgoing picture overlap lengths and transition types,
fixed middle source content and relative linked audio offsets. Logical edit
boundaries include incoming picture handles. Source limits, frame boundaries,
locks/groups, middle/neighbor body lengths and ambiguous extra clips are checked.
The dialog keeps source limits visible for out-of-range movement amounts.

Headless Chrome exercised the slide dialog and undo, with fourteen GUI/CLI recipe
comparisons. The synthetic native Apple check moves both 0.4-second dissolve
windows +0.2 seconds, retains 5.6-second picture duration and verifies red/blue/green
blend colours. Reproduce with `scripts/test-slide-blend.py /path/to/crispaudio`;
installed FFmpeg creates/inspects fixtures, Apple performs the project export.

A private Canon/H6 derivative slid its middle passage +0.08 seconds through two
0.4-second picture overlaps. All three microphones and picture remain linked;
middle picture content/15.4-second duration and the 253.72-second canvas stay
fixed. Rendered 48.08–50.08 s PCM matches original 48–50 s byte for byte (96,000
stereo frames). Original media/project are untouched; private artifacts remain
under `ux/slide-blend-089/`, outside this repository.

Ripple/range edits through blends remain unfinished. No new iOS device validation,
release tag or Apple submission. README remains a current capability overview;
version notes stay in history.md and these records.

## Local 0.8.10 — ripple trims through transitions (2026-10-09)

Built, installed and launched 0.8.10; app/CLI ad hoc signatures verified and one
existing autosave preserved. Frontend: 101 files / 1,366 tests passed. Native:
54 media tests + 3 CLI tests passed, 10 optional integrations ignored. Lint,
TypeScript production web build, release CLI and desktop bundle passed.

Linked ripple trims preserve incoming/outgoing transition types/overlap lengths
and selected clip/source-link identities. Reviewed shapes share existing scoped
range checks for locks, groups, automation, canvas, markers and transcript timing.
Clips ending at an insertion point are included when their reviewed shape changes.
Shortening retimes surviving aligned words; extending source speech requires new
acoustic alignment. Generic range boundaries through picture blends remain blocked.

Headless Chrome exercised the ripple dialog and undo, with eighteen GUI/CLI recipe
comparisons. The native synthetic check covers left/right shortening/extension:
incoming dissolve stays fixed, outgoing dissolve follows the new end, and picture
duration becomes 5.4/5.8 seconds as expected. Reproduce with
`scripts/test-ripple-blend.py /path/to/crispaudio`; installed FFmpeg creates/inspects
fixtures, Apple performs the actual project exports.

A private Canon/H6 derivative removes 59.92–60.00 s with a right ripple trim,
retains two 0.4-second picture overlaps and all three microphone offsets, and ends
at approximately 253.64 s. Rendered 44–61.92 s audio matches original 44–62 s with
that interval removed byte for byte (860,160 stereo frames). Native edited MP4
59–61 s audio/picture both measure 2 seconds. Original media/project are untouched;
private artifacts remain in `ux/ripple-blend-0810/`, outside the repository.

No new iOS device validation, release tag or Apple submission. Generic range blend
policies remain unfinished. README describes current support; version narratives
stay in history.md and implementation records.


## Local 0.8.11 — reviewed range cuts through blends (2026-10-09)

Built, installed and launched 0.8.11; app/CLI ad hoc signatures verified and one
existing autosave preserved. Full frontend suite passed 101 files / 1,374 tests;
final affected range/trim/project/speech suites passed 5 files / 66 tests after
adding the removed-clip review case. Native: 57 media + 3 CLI tests passed,
10 optional integrations ignored. Lint, production TypeScript/web build, release
CLI and final desktop bundle passed.

Range editing defaults to preserving picture blends. An explicit cut policy
lists crossed overlaps and resulting cut positions; a removed incoming clip is
reported as removed. Conversion uses the original outgoing clip endpoint,
advances incoming source/start by its overlap and fits shortened picture fades.
Original scope/link/group/lock guards run before conversion; initial/final picture
topology, frame edges and surviving body are checked. Uncrossed transitions stay
intact. Transcript boundaries and speech deletion/pasted keep retain their current
conservative checks. Lift keeps the entire canvas even when no clips remain.

Headless Chrome exercised the actual dialog, default rejection, explicit policy,
one-step undo and six GUI/CLI comparisons: lift/extract/insert with and without
crossed blends. The German 390-pixel dialog fits without horizontal overflow;
this is browser layout evidence, not iOS device validation. Reproduce with
`scripts/test-range-edits.mjs` and CRISPAUDIO_CHROME_EXECUTABLE / CRISPAUDIO_CLI.

The synthetic native Apple check confirms hard cuts at 2.00 / 1.84 / 2.16 seconds
for lift/extract/insert, black gaps for lift/insert, preserved outgoing dissolve
colours and expected 5.60 / 5.44 / 5.76-second durations. Reproduce with
`scripts/test-range-blend.py /path/to/crispaudio`; FFmpeg creates/inspects the
synthetic inputs while Apple performs the actual exports.

A private Canon/H6 derivative extracts 59.72–59.92 seconds through the outgoing
blend, leaves its incoming 0.4-second dissolve intact and replaces the crossed
blend with a cut at 59.80 seconds. Picture and all three microphones remain
aligned; the canvas ends at approximately 253.52 seconds. Rendered 44–61.80 s
24-bit PCM matches original 44–62 s with precisely that interval removed byte
for byte (854,400 stereo frames). The native 59–61 s MP4 has 2-second audio and
picture streams. Original media/project are untouched. Private artifacts remain
under `ux/range-blend-0811/`, outside this repository.

No release tag, Apple submission or new iOS device validation. M1 remains in
progress pending its end-to-end completion audit and interactive source-handle
feedback; the M2 mixer follows that milestone. README covers current capabilities;
chronological notes remain in history.md and these implementation records.


## Local 0.8.12 — source handles and desktop M1 workflow (2026-10-09)

Built, installed and launched 0.8.12; app/CLI ad hoc signatures verified and one
existing autosave preserved. Full frontend suite: 102 files / 1,383 tests passed;
final gesture/rendering/handle suites: 3 files / 38 tests passed after adding the
interrupted-trim cleanup regression. Lint and the final TypeScript/web/desktop
bundle passed. Native media code is unchanged; its previously tested release CLI
was used for the new actual edit/export integrations below.

Audio/video pointer trims now compute geometry from the press snapshot, use one
bounded displacement for source/timeline clocks and show source spans/reserves
for linked partners. The shortest partner handle can limit all clips. Picture
limits round inward to frame edges and retain a frame. Playback pauses before
audio trims; invalid source/topology/locks retain the last valid position with
feedback. Release commits one undo step. Escape/cancel/lost capture restores the
original project and the pre-press temporal history, including discarded redo.
Idle source-feedback views do not subscribe to project metadata; the waveform
render-invalidation tests still pass.

Headless Chrome exercised actual audio/video pointer drags, source/timeline
limits, returning from a limit, linked frame clamps, undo/redo and cancellation.
German feedback fits at 390 px with 24-pixel rows. Reproduce with
`scripts/test-source-handles.mjs`; these are browser checks, not iOS device tests.

The full synthetic interview audit used actual range and trim dialogs, two linked
microphones/picture and excluded fixed music. Extract then roll preserved links,
marker/cue retiming and outer endpoints; two-step undo/redo restored each state.
Selected-range transport advanced. Actual Save/Open file actions preserved the
arrangement and decoded sources. Five-second exported PCM is byte-identical before
and after reopen. The native two-operation edit recipe matches GUI geometry and
link membership. Native 48 kHz stereo 16-bit export has 240,000 frames and differs
from browser PCM by at most one integer step; Apple MP4 audio/picture both measure
5 seconds. Reproduce with `scripts/test-timeline-workflow.mjs`; CRISPAUDIO_CLI
adds native edit/render checks, with installed FFmpeg/FFprobe creating/inspecting
synthetic video. Neither browser script touches installed-app storage/user media.

A private Canon/H6 derivative extracts 45–47 s then rolls the resulting first cut
+0.08 s. Picture and all three microphones stay aligned, with a 251.72-second
canvas. Rendered 44–61 s PCM matches original 44–63 s with 45.08–47.08 s removed
byte for byte (816,000 stereo frames). The native 44–48 s MP4 audio/picture both
measure 4 seconds. Original media/projects are untouched; private artifacts and
validation logs stay outside git in `ux/workflow-0812/`.

Desktop M1's completion example and source-handle feedback are complete. The next
implementation is M2.1's dockable mixer; new EQ/limiter/routing follow later slices.
No new iOS device validation, release tag or Apple submission. Musical loop timing
and platform gaps remain explicit. README stays a current capability overview;
chronological details stay in history.md and these implementation records.

## Local 0.8.13 — mixer foundation

Installed and launched `~/Applications/CrispAudio-local.app` and updated
`~/Applications/crispaudio-cli-local`; ad-hoc signatures verified and one existing
autosave preserved. No Apple upload or release tag was triggered.

The Timeline bottom dock exposes track/master dB faders, pan, mute/solo, existing
inserts, stereo peak/RMS, peak hold and clipping reset. Fader/audition moves update
the running graph with 5 ms smoothing. Master gain is persisted independently of
monitor gain and applied after master effects in realtime/offline/native exports.
Meter values are sample peak/RMS, not true-peak/LUFS; advanced EQ, limiter,
automation lanes and buses remain planned. Narrow headless Chrome checks are not
physical touch-device or installed WebKit audio validation.

Validation: 103 frontend files / 1,387 tests passed; native media library 58 tests
passed with 10 existing ignored platform checks, and 3 CLI tests passed. Lint,
TypeScript/production build and local Tauri bundle passed. `test-mixer.mjs`
checks actual pointer faders, one-step undo, uninterrupted audio-clock playback,
solo/mute, nonzero anti-phase stereo meters, offline master scaling, save/load
and German 390 px layout. `test-native-pcm.mjs` with masterVolume=0.5 matches
browser offline output byte-for-byte at 8/16/24/32-bit PCM.

Evidence logs: `mixer-tests-final.log`, `mixer-native-final.log`,
`mixer-browser-final.log`, `mixer-pcm-parity.log`,
`mixer-lint-final.log`, `mixer-app-build.log`, `mixer-install.log`.
Prior 0.8.12 desktop and iOS simulator CI runs both completed successfully:
[desktop](https://github.com/CrispStrobe/crispaudio/actions/runs/37990218860),
[iOS simulator](https://github.com/CrispStrobe/crispaudio/actions/runs/37990218850).

## Local 0.8.14 — graphical EQ

Clip, track and master racks add bell (`peaking`), low/high shelving bands and
an expandable combined EQ response graph. Point drag, keyboard fine/coarse and
numeric frequency/gain/bell-Q editing are available. Live EQ moves update running
nodes with 10 ms smoothing; bypass/type/rack topology changes rebuild the graph.
Stored pass-filter Q conventions remain compatible. New bands are supported by
the native 48 kHz mixer; the optional FFmpeg compatibility mixer rejects them.
Limiter, compressor gain reduction, buses and automation lanes remain planned.

Validation: 104 frontend files / 1,392 tests passed; native media 59 passed,
10 existing ignored platform checks, and 3 CLI tests passed. Production build,
lint and local Tauri app build passed. Browser response checks cover 225 points
at 32/44.1/48 kHz with maximum error 0.00000432 dB against Web Audio. Real browser
pointer/keyboard/numeric edits verify uninterrupted playback, coalesced undo,
restore, locked-rack protection and a German 390 px layout. Thirty-three native
EQ comparisons cover extreme frequency/gain/Q impulses, stereo pan, overlapping
clips, fades/automation and a one-second excerpt of the real Canon/H6 arrangement.

DSP exports are not claimed bit-identical for EQ. One three-stage +24 dB/Q20 bell
case differs after the last clip ends at a browser render-block boundary: worst
sample error 0.000138247 and RMS 0.0000136771. The native mixer retains IIR tails;
browser tail/silence handling is a suspected cause, not an independently proven
root cause. Tests retain the original 0.0001 active-audio bound and explicitly
budget 0.0002 maximum/0.00002 RMS for new EQ tails. All 33 cases pass these bounds.
Real excerpt cases are substantially closer. No physical iOS/touch or installed
WebKit audio validation is claimed from headless Chrome.

Evidence: `eq-tests-final.log`, `eq-native-final.log`,
`eq-browser-final.log`, `eq-parity-verified.log`, `eq-lint-final.log`,
`eq-app-final.log`. Private excerpt outputs are in
`transcripts/2026-Studienwoche/CrispAudio-validation/ux/eq-0814/`; source recordings
and original projects were not modified. No release tag or Apple upload.

Installed/launched local 0.8.14 and updated the standalone CLI. Ad-hoc signatures
verified; one existing autosave preserved. Installation evidence:
`eq-install.log`.

## Local 0.8.15 — output limiter and gain reduction

Adds optional stereo-linked sample-peak limiting after master gain, with instant
attack, exponential release, no lookahead and no added latency. Ceiling is
−24..0 dBFS and release 10..2000 ms; default disabled, enabled defaults −1 dBFS /
100 ms. Compressor inserts/strips and limiter display live gain reduction without
writing meter data to project state. A strip reports the greatest insert
attenuation, not the sum. Numeric edits commit deliberately and remain undoable.

Realtime uses a bundled AudioWorklet; browser offline and native linked-project
exports use the same limiter algorithm. Saved project format remains 3; older
files remain disabled. CLI `output-limiter` recipes preserve arrangement geometry;
FFmpeg compatibility export rejects enabled limiting. True-peak/LUFS, lookahead,
automation lanes and buses/sends remain separate roadmap work.

Validation on this Mac:

- Frontend: 105 files / 1,396 tests passed; production build and lint passed.
- Native: 63 library and 3 CLI tests passed; 10 existing platform/integration tests
  remain ignored. Includes immediate transient ceiling, stereo linking, release,
  range history, master-gain order and CLI recipe validation.
- Headless Chrome and WebKit: isolated first-sample peak limited without a shift,
  stereo ratio preserved, range export exactly matches the full-render section,
  compressor/limiter telemetry, stop reset, live ceiling change without playback
  restart, one undo and German 390 px layout. Narrow inputs fit their section.
- Independently rebuilt native CLI and Chrome offline output: randomized stereo
  fixture with master gain 4 and limiter −1 dBFS / 100 ms produces byte-identical
  integer PCM at 8, 16, 24 and 32 bits. This does not establish bit-exact parity
  for arbitrary compressor/effect chains.
- Served production bundle: WebKit loads the emitted worklet asset and limits
  the first sample at −6 dBFS with correct stereo linkage.

Installed and launched local 0.8.15 plus the standalone CLI; ad-hoc signatures
verified and the saved workspace preserved. Installed WKWebView interaction and
physical iOS playback are not covered by the headless browser checks. No new
Apple release is implied.


0.8.15 source commit `16982269024cccdaf4d800caad518155fb160099` passed both remote
[CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38026090375) and
[iOS simulator CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38026090382).
Simulator success does not establish physical iOS feature validation or App Store
submission. No release tag/upload was created for this local milestone.


## Local 0.8.16 — directly editable gain automation

Built, installed and launched the local app; updated the independent standalone
CLI. Ad-hoc signatures verified and one existing autosave preserved, with the full
WebKit recovery tree backed up privately before installation. No release tag or
Apple upload. Headless browser checks do not validate installed WKWebView
interaction or physical iOS hardware.

The Timeline gain dock shows one selected track on the shared zoom/scroll clock.
Mouse/touch add and move, Delete/undo, keyboard sample/0.1 dB nudges, numeric
seconds/dB, snapping, locks and preview cancellation are supported. Release
commits one undo step; cancellation and no-op gestures retain redo/history.
Repeated keyboard edits retain point focus. Committed gain updates the running
envelope without restarting clips. Microphone-generated points remain editable
when unlocked. The project stays format 3; existing range edits retain their
boundary-value/retiming contract. Linear gain, held endpoints, unity when empty
and last-supplied duplicate timestamp semantics agree in GUI/native paths.

Validation:

- Frontend: 106 files / 1,401 tests passed with two workers; lint and production
  TypeScript/web build passed. An earlier fully concurrent run timed out in the
  existing limiter stress test during release Rust compilation; the bounded rerun
  passed without changing that test or its timeout.
- Native: 65 media library and 3 CLI tests passed; 10 existing ignored tests.
  Optimised standalone CLI and final local Tauri bundle built successfully.
- Chrome and explicit WebKit: actual Save/Open picker actions preserve envelopes;
  pointer commit, Escape with redo, pointer cancellation, no-op release,
  repeated keyboard edits, numeric edits, Delete/undo, touch tap, track locks,
  uninterrupted live gain/audio clock and German 390 px layout passed.
- Browser range envelope output differs from its full-render slice by at most
  1.49e-8 in this fixture. Randomized stereo GUI/native automation at 48 kHz,
  including duplicate time zero, matches 8-bit PCM exactly; maximum error is
  one integer step at 16/24 bits and 256 steps at 32 bits (1.19e-7 full scale).
  The native envelope uses double interpolation and Web Audio float ramps;
  arbitrary automation is not claimed bit-exact. The PCM harness keeps its
  original exact check when CRISPAUDIO_TEST_AUTOMATION is absent; automation
  explicitly permits one quantization step plus 2e-7 full-scale error.

Reproduce with `scripts/test-gain-automation.mjs` and `test-native-pcm.mjs` using
the documented Playwright/CLI environment variables; `CRISPAUDIO_TEST_AUTOMATION`
accepts a JSON GainPoint array. Pan/FX automation, envelope copy and
Read/Touch/Latch/Write remain future M2.3 work.

Evidence logs: `automation-tests-final.log`, `automation-native.log`,
`automation-lint-final.log`, `automation-browser-final.log`,
`automation-webkit-final.log`, `automation-pcm.log`,
`automation-app-build-final.log` and `automation-install.log`.


## Local 0.8.17 — gain envelope copy/paste and time stretching

The gain lane copies a selected time range or the whole envelope into an
independent session clipboard. Boundary gain values are interpolated; paste
reviews destination seconds/length and supports time compression/stretching.
One-sample guards preserve the original outside curve. Clip/source clocks,
canvas, markers and transcript timing stay fixed. Locked sources can be copied;
locked destinations reject paste. Stale dialogs reject changed projects.
Equivalent pastes are no-ops within 1e-12 gain precision; Cancel/Escape retain redo,
and committed pastes are one undo step. Clipboard data survives track/lane/project
changes in the current session but is not serialized or tracked by undo.

Native `paste-automation` accepts either a source-track range or portable relative
GainPoint data. GUI/native project results agree; gain-only recipes no longer
recompute unrelated canvas metadata. Sample guards use the project sample rate,
with the same native/GUI canvas bounds. No new curves, pan/FX automation or
Read/Touch/Latch/Write modes are added.

Validation on this Mac:

- Frontend: 107 files / 1,407 tests passed with two workers; lint and production
  TypeScript/web build passed. Native: 67 library + 3 CLI tests passed, 10 ignored.
- Chrome/WebKit actual copy, cross-track paste, numeric stretch, bounds rejection,
  locked-source copy, stale/locked-target protection, cancel with redo, one-step
  undo/redo, live playback without restart and actual Save/Open passed.
  German 390 px dialog layout and touch opening passed; these are browser checks,
  not physical iOS or installed WKWebView interaction evidence.
- A six-second source selection pasted into three seconds preserves endpoints and
  its midpoint peak. Scanning the rendered ten-second stereo fixture outside
  the one-sample guards gives maximum browser error 7.45e-9 (Chrome) / 2.98e-8
  (WebKit) against the original envelope render.
- Both native recipe forms yield the GUI's project JSON. Native 20-second float
  stereo WAV has 960,000 frames. Checked sample positions include both boundary
  guards, the pasted peak and outside audio: maximum difference 0 (Chrome) /
  2.98e-8 (WebKit). This is not a full-file bit-exact claim for arbitrary DSP.

Final local app/CLI installation preserves the existing workspace, with private
WebKit recovery backup and ad-hoc signature verification. No tag or Apple upload.
The first app bundle attempt collided with a separate web build rewriting dist;
the final app build ran on its own. Reproduce with `scripts/test-envelope-copy.mjs`
and the existing Playwright/Chrome/WebKit environment variables. Set
`CRISPAUDIO_TEST_CLI` to include native recipe/render comparisons.

Evidence: `envelope-tests-final.log`, `envelope-native.log`,
`envelope-lint-final.log`, `envelope-build-final.log`,
`envelope-browser-native.log`, `envelope-webkit-native.log`,
`envelope-app-build-final.log`, `envelope-install.log`.

## Local 0.8.18 — directly editable pan automation

M2.3 adds absolute pan points (−1 left…+1 right) in the focused automation lane.
The lane shares timeline scale and supports pointer/touch, keyboard, numeric pan
and seconds, snapping, locks, preview cancellation and one-step undo. An empty
lane uses static track pan; a nonempty lane overrides it and marks the mixer Auto.
Parameter switches cancel pending previews. Gain envelope copy remains gain-only.

Live edits reschedule only pan AudioParam events; source playback continues.
GUI/native endpoints hold, exact duplicates use the last supplied value, and
signed points interpolate linearly. Save/Open retains format 3; extract/insert
retime both envelopes. Locked automation-only tracks reject retiming. Native
`automation` recipes accept `parameter: "pan"`; `paste-automation` rejects pan
explicitly. FFmpeg audio compatibility rejects nonempty pan envelopes.

Centered mono GUI/native exports now use the same equal-power pan law as live
playback: −3.0103 dB per channel. Previously center bypassed the export panner and
was louder per channel. Stereo center and the stereo integer PCM contract remain
unchanged. Mono DSP/normalization tests now account for the center pan gain;
the exact integer rounding fixture uses stereo to isolate quantization.

Verified locally on 2026-10-11:

- 108 frontend files / **1,410 tests** pass with two workers; lint and tsc/Vite pass.
- **70 media library + 3 CLI tests** pass; 10 platform-specific tests stay ignored.
  New tests cover signed validation, last duplicates, mono/stereo centers and
  endpoints, native full/range PCM, locks, range retiming and project metadata.
- `scripts/test-pan-automation.mjs` passes in Chrome and headless WebKit: actual
  pointer/keyboard/numeric controls, cancel/switch history, live edit and lane
  deletion without restarting, static fallback, actual Save/Open, locks and
  German 390 px touch layout. Screenshots were inspected for overflow.
- Each browser compares every sample of native **192,000-frame** mono and stereo
  fixtures against GUI offline output. Chrome maximum native errors were
  1.49×10⁻⁸ (mono) / 2.98×10⁻⁸ (stereo); WebKit 8.20×10⁻⁸ / 1.64×10⁻⁷ full scale.
  GUI seeked range vs full slice errors were Chrome 2.98×10⁻⁸ / 5.22×10⁻⁸,
  WebKit 8.20×10⁻⁸ / 1.51×10⁻⁷. These are measured float-ramp/trigonometric
  differences within the explicit 2×10⁻⁷ full-scale budget, not bit identity.
- Native pan recipe duplicate canonicalization matches the GUI envelope. Existing
  direct-gain browser regression passes in Chrome; gain copy/stretch regression
  passes in WebKit, including native track-range and portable recipe parity and
  960,000-frame render/boundary sample checks (2.98×10⁻⁸ maximum sample error).
- Sequential web then Tauri app build succeeds. Local 0.8.18 app and optimized
  standalone CLI were installed, ad-hoc signed/verified and the app launched.
  Full WebKit recovery was backed up; the one autosave's metadata is unchanged.

No release tag or Apple upload. Headless WebKit is neither an installed WKWebView
interaction test nor physical iOS validation. Next: pan envelope copy/retime,
selected FX lanes, then protected automation recording modes.

## Local 0.8.19 — pan envelope copy/paste and time stretching

Pan now has the same reviewed range/whole-canvas copy and destination time/length
workflow as gain. Separate session clipboards survive project loads and cannot
cross parameter types. Copying an empty pan lane captures static pan; empty
portable pan envelopes explicitly mean center. Destination guards use the old
lane or static pan. Only pan points change; equivalent pastes preserve redo.
Native `paste-automation parameter:"pan"` supports source-track ranges and tagged
portable envelopes. Legacy untagged envelopes and default recipes remain gain.

Validation on 2026-10-11:

- **108 files / 1,412 frontend tests** pass with two workers; lint and production
  tsc/Vite build pass. **71 media library + 3 CLI tests** pass; 10 existing
  platform-specific tests remain ignored.
- Unit checks cover signed source edges, time stretching, static source/destination
  fallback, gain/media/metadata preservation, independent session clipboards,
  no-op redo and rejected parameter mismatches. Native source-range and portable
  recipe forms produce the same project.
- `scripts/test-pan-envelope-copy.mjs` passes in Chrome and headless WebKit with
  actual controls: locked source copy, interpolated edges, destination compression,
  bounds, cancel/redo, undo/redo, live paste without playback restart, actual
  Save/Open, locks/stale dialogs and German 390 px touch review. Screenshot checked.
- Across every sample in the 10-second GUI fixture outside one-sample guards,
  maximum change is Chrome 1.49×10⁻⁸ / WebKit 4.47×10⁻⁸ full scale. The pasted
  interval changes audibly as expected. Each native 20-second stereo render has
  **960,000 frames**; checked boundary/peak/outside samples differ from GUI by at
  most Chrome 7.45×10⁻⁹ / WebKit 5.96×10⁻⁸. This is not full-file bit identity.
- Existing gain envelope browser/native regression passes in Chrome: both recipe
  forms match GUI project JSON, boundary samples match native exactly and outside
  audio differs by at most 7.45×10⁻⁹.

Local 0.8.19 app and optimized CLI are rebuilt/installed with signatures verified
and recovery preserved. No release tag or Apple upload; physical iOS and installed
WKWebView interaction remain unvalidated. Next M2.3 work: selected FX parameter
lanes and protected Read/Touch/Latch/Write modes.

## Local 0.8.20 — delay wet/dry automation

The first selected FX lane edits track delay mix on the absolute timeline.
Envelopes stay attached to rack inserts; empty points use static mix. Wet/dry
ramps update live without resetting feedback history. Format-3 save/open,
scoped insert/extract retiming, locks and native `effect-automation` recipes
preserve the same contract. Clip/master DSP accepts the same metadata; the direct
lane currently exposes track inserts. Further FX parameters, FX envelope
copy/paste and protected recording modes remain M2.3 work.

Validation on 2026-10-11:

- **109 files / 1,414 frontend tests** pass with two workers; lint and production
  tsc/Vite build pass. **73 media library + 3 CLI tests** pass, 10 existing
  platform-specific tests ignored.
- Unit/native checks cover complementary seek ramps, static fallback, invalid
  parameter/bounds rejection, locked automation-only tracks, scoped range
  retiming, native delay history and range crop, duplicate timestamps and
  metadata-only recipe duration preservation.
- `scripts/test-delay-automation.mjs` passes in Chrome and headless WebKit with
  actual pointer/keyboard/numeric controls, Escape/history preservation, live
  updates without restart, static fallback, actual Save/Open, insert reorder,
  locks and German 390 px touch editing without lane overflow. Screenshot checked.
- Every sample of the **192,000-frame stereo** native render is compared with GUI
  output: maximum absolute difference Chrome **8.94×10⁻⁸**, WebKit
  **2.39×10⁻⁷** full scale. These are measured tolerances, not bit identity.
  GUI range rendering exactly matches its full-file history crop in both browsers.
  Chrome additionally compares native extract-retimed envelope JSON with GUI.
- Existing Chrome pan lane regression passes, including live updates, Save/Open,
  locks, cancellation and mono/stereo native comparisons (maximum 2.98×10⁻⁸).

Existing gain lane Chrome regression also passes, including live playback,
Save/Open and cancellation preserving redo. No release tag or Apple upload;
physical iOS and installed WKWebView interaction remain unvalidated. Local app
installation and recovery evidence follow below.

Local 0.8.20 app and independent optimized CLI are rebuilt and installed; both
signatures verify, the app launches, and the existing autosave is unchanged with
a full recovery backup. Main is the development checkpoint, not an Apple release.

## Local 0.8.21 — independent delay feedback automation

Track delay inserts now expose feedback alongside mix. Feedback uses absolute
seconds, linear held endpoints and a 0–0.95 range; empty points restore static
feedback. Live ramps preserve the delay buffer and the other parameter's
points. Format-3 save/open, rack cloning/reordering, locks and scoped range
retiming retain both envelopes. Native recipes accept
`effect-automation parameter:"feedback"`, preserving mix and media geometry.
Clip/master DSP supports both envelopes; direct lanes expose track inserts.

Validation on 2026-10-11:

- **109 files / 1,415 frontend tests** pass on the complete rerun; lint and
  production tsc/Vite build pass. Native **75 media library + 3 CLI tests** pass; 10 existing platform tests ignored.
  Tests cover feedback bounds, duplicate timestamps, mix preservation, locks,
  delay history and exact native range cropping. Focused frontend scheduling,
  serialization and retiming checks pass; lint and production tsc/Vite build pass.
- `scripts/test-delay-feedback.mjs` passes in Chrome and headless WebKit: actual
  pointer/keyboard/numeric edits, 95% keyboard clamp, rejection of 96%, Escape,
  live updates without restart, empty-lane fallback, actual Save/Open, rack
  reorder, locks, editing mix while preserving feedback, and German 390 px touch.
  Screenshot inspected. Existing mix lane browser/native regression also passes.
- Every sample of each **192,000-frame stereo** native fixture is compared with
  GUI rendering while both mix and feedback are automated. Maximum difference:
  Chrome **9.69×10⁻⁸**, WebKit **2.46×10⁻⁷** full scale. GUI range output exactly
  matches its full-file history crop. Native extract-retimed mix/feedback JSON
  matches GUI in both browsers. These measurements do not claim bit identity.
- The first broad frontend run passed 1,414 tests and timed out in the existing
  limiter test at its 5-second deadline under concurrent compilation. That test
  passes alone at the original deadline (2.95 seconds). A complete rerun uses a
  15-second local deadline; audio assertions and repo test configuration are unchanged.

Further FX parameters, FX envelope clipboard, additional curves and protected
Read/Touch/Latch/Write modes remain M2.3 work. No release tag or Apple upload;
physical iOS and installed WKWebView interaction remain unvalidated.

Local 0.8.21 app and independent optimized CLI are rebuilt/installed, signatures
verified, app launched and the existing autosave preserved with a full recovery
backup. Main remains a development checkpoint, not an Apple-distributed release.


## Local 0.8.22 — protected automation recording

Read/Touch/Latch/Write capture is available on focused track gain, pan, delay mix
and delay feedback lanes. Explicit session arming is required while stopped.
Touch restores the original envelope on release; Latch holds until Stop; Write
starts at the actual playback start. Live audition leaves project, undo and
autosave untouched. Stop opens a bounded pass review; Apply creates one undo
step and preserves the original curve outside one-sample interval guards.
Cancel retains redo. Seeks, loops, interruptions and project/source changes
cancel capture. Locked tracks and disabled delay inserts cannot arm. Arming and
mode are session-only; committed points use the existing format-3 contract.

Native `automation-pass` recipes accept the same bounded gain/pan/mix/feedback
intervals, validate locks and values, and preserve media geometry and other
parameters. JSON float round trips preserve captured clocks. Live delay scheduling
also now uses the running AudioContext clock after later playback starts/seeks.
Capture samples the engine audio clock on animation frames/control events and
quantizes points to the project sample grid; this is not hardware sample-accurate
control acquisition. Limits are 100,000 points and 1,000 intervals per pass.

Validation on 2026-10-11:

- **110 files / 1,417 frontend tests** pass with two workers and a 15-second local
  timeout; repository deadlines/audio assertions are unchanged. Native **76 media
  library + 3 CLI tests** pass, with 10 existing platform tests ignored. Lint,
  production tsc/Vite and the local app build pass.
- `scripts/test-automation-recording.mjs` passes in Chrome and headless WebKit:
  all modes/targets, actual slider mute audition, Touch return, Latch hold,
  Write's exact start, no restart, review/apply/undo/redo, cancellation and stale
  review protection, locks, actual Save/Open and German 390 px controls.
  The compact screenshot was inspected. A real seek test verifies delay scheduling
  against an already running context.
- Native recipe JSON exactly matches GUI output for all four targets. Every sample
  of each **384,000-frame stereo** fixture is compared: maximum absolute difference
  Chrome **3.95×10⁻⁷**, WebKit **2.02×10⁻⁷** full scale. These are measured
  tolerances, not bit identity. Existing gain and delay feedback Chrome/native
  regressions also pass.

Local app 0.8.22 and the independent optimized CLI are installed, signatures
verified and app launched. The existing autosave is unchanged with a full recovery
backup. FX envelope clipboard, additional curves and selected parameters remain
M2.3 work. No release tag or Apple upload; physical iOS and installed WKWebView
interaction remain unvalidated. Main is a development checkpoint.


## Local 0.8.23 — delay envelope copy and retime

Track delay mix/feedback lanes now have independent session clipboards. Copy
snapshots the selected range/full canvas, interpolated edges and static fallback
for empty lanes. Reviewed paste stretches relative point clocks into a selected
destination insert's same parameter, retaining values, other settings and media
geometry. Original outside automation survives one-sample guards. Apply creates
one undo step; Cancel and equivalent pastes retain redo. Locks, stale project/rack
reviews and armed recording protect edits. Clipboards survive project loads within
the session but are omitted from project files/history. Native
`paste-effect-automation` supports source-insert/range and tagged portable forms,
with explicit zero-based source/destination indices and mix/feedback bounds.

Validation on 2026-10-11:

- **111 files / 1,421 frontend tests** pass with two workers and a 15-second local
  timeout; repository deadlines/assertions are unchanged. Native **77 media library
  + 3 CLI tests** pass; 10 existing platform tests remain ignored. Lint, production
  tsc/Vite and the final local Tauri app bundle pass.
- `scripts/test-effect-envelope-copy.mjs` passes in Chrome and headless WebKit:
  actual locked-source copy, interpolated edges, cross-track/insert stretch,
  bounds, cancel/redo, one-step undo/redo, live playback without restart, actual
  Save/Open, locks, stale rack reviews, separate clipboards, recording protection
  and German 390 px touch. The compact dialog screenshot is inspected. Both browsers
  also check actual empty-lane static copy and equivalent paste retaining
  an existing redo branch.
- Both native recipe forms produce project JSON exactly matching GUI for each
  parameter. Every sample of each **480,000-frame stereo** fixture is compared:
  maximum absolute difference Chrome **1.61×10⁻⁷**, WebKit **8.39×10⁻⁸** full
  scale. Original envelope values outside guards are preserved; browser audio
  before the replaced interval differs by at most **1.50×10⁻⁸**. Delay history
  can affect later audio despite unchanged later envelope values. These measured
  tolerances do not claim arbitrary-DSP bit identity.
- Existing pan copy/retime Chrome workflow passes. Protected recording Chrome
  regression passes all modes/targets and native full PCM (384,000 stereo frames
  per target, maximum difference **4.03×10⁻⁷** full scale).

Local 0.8.23 app and independent optimized CLI are rebuilt/installed, signatures
verified and app launched. One existing autosave is unchanged with a full recovery
backup. Further FX parameters and additional curves remain M2.3 work. No release
tag or Apple upload; physical iOS and installed WKWebView interaction remain
unvalidated. Main remains a development checkpoint.


## Local 0.8.24 — outgoing Linear and Step automation curves

Selected gain, pan, delay mix and feedback points now expose an outgoing curve.
Linear ramps to the next point; Step holds and jumps at the next point's clock.
Missing metadata preserves Linear behavior. Pointer/keyboard/numeric edits retain
curves; locks and recording protection apply. Format-3 save/open retains the
optional field. Unsupported/null curves reject on GUI open/native point edits
and enabled native DSP. Older Linear-only builds do not interpret Step metadata.

Partial clipboard snapshots preserve the outgoing curve at their first edge.
Paste/pass outside guards restore the original curve with one-sample Linear edge
bridges. Identity checks include interval midpoints to distinguish Step from Linear
with equal point values. Range insert/extract retain the resumed curve, while lift
retains clocks. Recording remains a frame-sampled Linear draft and preserves
outside Step segments. Native per-frame evaluation and GUI scheduling use the
same outgoing rules; existing automation/effect/paste/pass/range recipes retain
curves. Further shapes and selected FX parameters remain M2.3 work.

Validation on 2026-10-11:

- **112 files / 1,427 frontend tests** pass with two workers and a 15-second local
  timeout; repository assertions/deadlines are unchanged. Native **80 media library
  + 3 CLI tests** pass, with 10 existing platform tests ignored. Lint, production
  tsc/Vite and the local app bundle pass.
- `scripts/test-step-automation.mjs` passes in Chrome and headless WebKit for all
  four targets: real curve controls/undo/redo, pointer and numeric curve retention,
  Escape retaining redo, live changes without restart, actual audible seek holding
  silence until its jump, locks, partial copy/stretch and recording outside guards,
  actual Save/Open and German 390 px controls. Compact screenshot inspected.
- Both native source-range/portable paste forms exactly match GUI project JSON;
  native insert/extract match GUI envelope metadata and media clock geometry.
  Every sample of each **192,000-frame stereo** fixture is compared: maximum
  absolute difference Chrome **9.99×10⁻⁷**, WebKit **4.18×10⁻⁷** full scale.
  GUI export range output exactly matches the full-render crop. These measurements
  are tolerances, not arbitrary-DSP bit identity.
- Existing delay copy/retime Chrome/native regression passes (480,000 stereo frames
  per parameter, maximum 1.61×10⁻⁷). Existing protected recording Chrome/native
  regression passes all modes/targets (384,000 stereo frames per target,
  maximum 3.95×10⁻⁷). Curve-only differences cannot be discarded as identity.

Local 0.8.24 app and independent optimized CLI are rebuilt/installed, both signatures
verified and app launched. One autosave is unchanged with a full recovery backup.
No release tag or Apple upload. Physical iOS and installed WKWebView interaction
remain unvalidated; main is a development checkpoint.


## Local 0.8.25 — delay-time automation

Track delay-time lanes expose 0–2000 ms controls; metadata uses seconds, bounded
0–2. Point clocks remain absolute timeline seconds. Linear/Step curves and held
endpoints apply; empty lanes use static time. Static/envelope changes schedule the
existing DelayNode without restarting playback or clearing echo history. Moving
the read head can shift pitch, and jumps can click. Clip/master metadata renders
in GUI/native DSP; direct lane controls target track inserts.

Protected Read/Touch/Latch/Write capture and review, independent time clipboard,
source-range/portable paste, static snapshots, outside guards, locks, save/open
and scoped range editing extend to time. Mix/feedback remain independent. Native
point edits/paste/pass recipes accept parameter `time` with seconds. Automated
native delays reserve full two-second history under the shared 64 MiB DSP budget.
Range interpolation uses the positive-value evaluator for time, retaining values
above one second; pan's −1…1 bound is kept on actual pan. Older builds reject time
metadata on project open/native DSP. Further curves/FX parameters remain M2.3.

Validation on 2026-10-11:

- **113 files / 1,431 frontend tests** pass with two workers/local 15-second timeout;
  repository deadlines are unchanged. Native **82 library + 3 CLI tests** pass,
  with 10 existing platform tests ignored. Lint, tsc/Vite production build, local
  Tauri app bundle and optimized CLI build pass. Dependency versions are unchanged.
- `scripts/test-delay-time.mjs` passes Chrome and headless WebKit: real millisecond
  controls/caps/static capture, recorder maximum, live static changes without
  restart, reviewed copy/paste, undo/cancel retaining redo, German 390 px layout.
  Native point and both paste forms exactly match GUI project JSON. Native
  insert/extract preserve GUI envelope/geometry across track/clip/master racks.
- Each moving-delay rack fixture compares every sample of **384,000 stereo
  frames**. Maximum absolute GUI/native difference: Chrome **6.08×10⁻⁵**,
  WebKit **6.02×10⁻⁵** full scale; new moving-delay budget 10⁻⁴. Range exports
  exactly match full-render crops. This covers the synthetic ramps/jumps and is
  not arbitrary-signal bit identity. Existing four lanes retain their 2×10⁻⁶ budget.
- Extended Step harness passes all five targets in Chrome/WebKit: curve editing,
  pointer/numeric retention, live no-restart, locks, partial copy/stretch, range
  and recorded outside guards, actual Save/Open and German compact controls.
  Every **192,000-frame stereo** fixture is compared. Moving-time maxima are
  **3.42×10⁻⁵ Chrome / 7.70×10⁻⁵ WebKit**; original four targets keep their budget.
- Protected recording harness passes both browsers with time added: reviewed
  Latch capture, original modes, draft/undo/redo/cancellation/stale/lock protections,
  Save/Open, native exact pass JSON. Each target compares **384,000 stereo frames**;
  maximum **3.95×10⁻⁷ Chrome / 2.02×10⁻⁷ WebKit**.
- Existing mix/feedback copy browser/native regression passes after the source
  server restart: 480,000 stereo frames per parameter, maximum **1.61×10⁻⁷**.
  Final English/German dictionaries preserve every old key/value and add six
  time-lane strings each; final app is rebuilt after restoring unrelated German strings.

Local app/CLI 0.8.25 installed and signatures verified; one autosave preserved
with a full recovery backup. Launch retry succeeded after macOS initially returned
−600 during the old app's quit transition. German delay-time screenshot inspected.
No release tag or Apple upload; physical iOS and installed WKWebView UI interactions
remain unvalidated. Main remains a development checkpoint.

## M2.3 reviewed automation shapes — 0.8.26

Selected gain, pan and track delay mix/feedback/time points offer a reviewed
Linear, Ease in, Ease out or S-curve for the segment to the immediate next point.
Ease shapes bake up to 16 linear intervals into ordinary editable points. End
values, the next point's outgoing curve and outside points are preserved. Gain
shaping interpolates amplitude; time uses seconds internally and milliseconds in
the review. Apply creates one undo step; preview/cancel preserve redo. Locks,
armed recording, last points, short spans and stale reviews are protected.
Native `shape-automation` recipes produce the same points without changing DSP
or format 3. Further FX parameters and free curve handles remain open M2.3 work.

Validation on 2026-10-11: **114 files / 1,435 frontend tests** and **84 library +
3 CLI tests** pass (10 existing native platform tests ignored). Lint, production
TypeScript/Vite, local Tauri app bundle and optimized CLI build pass. Dependencies
are unchanged. The shape harness completes all 15 cases in Chrome and WebKit: review, single
undo, immediate Escape/cancel retaining redo, locks/recording/stale/last-point
protection, live no-restart, identity/redo, Save/Open and German 390 px layout.
Native recipes match GUI JSON exactly; range renders match full-render crops.
Every case compares 192,000 stereo frames. Original four targets peak at
8.05×10⁻⁷ Chrome / 8.35×10⁻⁷ WebKit and pass their unchanged budget. Chrome time
peaks at 6.95×10⁻⁵ and passes 10⁻⁴. **WebKit's three long-time shapes exceed
10⁻⁴** (Ease in 1.31×10⁻³, Ease out 7.24×10⁻⁴, S-curve 1.45×10⁻⁴). Every
failing native WAV is byte-identical to the installed 0.8.25 CLI output; these
are recorded baseline failures, not audio parity passes. The harness rejects
them normally; an explicit `CRISPAUDIO_BASELINE_CLI` allows only byte-identical
baseline failures and reports their errors/budget in `knownDelayLimits`.
The existing protected-recording Chrome regression passes all five targets,
384,000 stereo frames each, maximum 3.95×10⁻⁷. German review screenshot inspected.
The new harness supplies correctly typed waveform peaks.

Known rendering limit: a long automated delay (1.2–1.8 seconds) on an abrupt DC
input differs between native and Web Audio by about **3.91×10⁻⁴ Chrome /
2.58×10⁻³ WebKit** full scale. The installed 0.8.25 CLI produces byte-identical
native audio for that generated point project, so this predates curve shaping.
The shape comparison uses a 43 Hz tone with a 50 ms onset fade for time; other
four targets keep their constant-input fixtures and 2×10⁻⁶ budget. Passing those
fixtures does not establish arbitrary-signal bit identity. DSP is unchanged.

Local 0.8.26 app and optimized CLI installed, signatures verified and app launched;
one autosave preserved with a full recovery backup. No release tag or Apple upload.
Physical iOS and installed WKWebView interactions remain unvalidated.


## M2.3 custom Bézier review — 0.8.27

The shape review now supports two custom Bézier control handles on all five
lanes. Pointer dragging, arrow keys (Shift: larger steps) and numeric Time/Value
percentages edit review state only. Time handles stay ordered; value handles
remain at 0–100% endpoint progress, including descending segments. Apply bakes
up to 15 additional ordinary linear points in one undo step. Persistent Bézier
metadata and additional FX parameters remain future work. Cancelled pointer
sessions restore the review handles; project/redo stay untouched until Apply.
GUI/native recipes use the same bounded inversion of the normalized time axis.

Validation: **115 files / 1,439 frontend tests** pass, including custom copy/retime/
range/pass guards and immediate/default modal focus regressions. **85 library + 3 CLI tests**
pass, with 10 existing platform tests ignored. Lint, final TypeScript/Vite production build,
Tauri app bundle and optimized CLI build pass. Dependencies and DSP are
unchanged. The actual browser custom-curve harness checks all five lanes,
numeric/keyboard/pointer controls, pointer cancellation, undo/cancel/redo,
lock/recording/stale/last-point protections, live no-restart, Save/Open, exact
native recipe points and range/full crop equality. Every case compares 192,000
stereo frames. Original four lanes peak at **8.05×10⁻⁷ Chrome / 7.75×10⁻⁷ WebKit**,
passing the existing 2×10⁻⁶ budget. Chrome time peaks at **3.78×10⁻⁵**, passing
10⁻⁴. **WebKit long-time custom audio exceeds 10⁻⁴ at 2.90×10⁻⁴**; its native
WAV is byte-identical to the installed 0.8.26 CLI output before upgrade. This is
an explicitly reported baseline failure, not an audio parity pass. No tolerance
was changed. The existing 15 preset-shape Chrome UI regression also passes.
WebKit mouse events quantize to whole pixels; drag assertions verify delivered
coordinates. Final Chrome/WebKit UI runs pass enlarged pointer targets and flat
no-op reviews. Equal endpoint handles stay on the flat line. German 390 px review
screenshots are inspected and fit. The review uses immediate form focus to prevent
the modal's delayed close-button focus interrupting fast numeric entry; other
dialogs keep their default focus behavior, and regression tests cover both routes.
Focus restores on close.

Local 0.8.27 app and optimized CLI installed, signatures verified and app launched.
One autosave preserved with a full recovery backup. No tags or Apple uploads;
physical iOS and installed WKWebView UI interactions remain unvalidated.


## Local 0.8.28 — ring-modulator mix automation

Track ring-modulator mix now has a 0–100% direct lane, Linear/Step points,
reviewed preset/custom shapes and protected Read/Touch/Latch/Write capture.
Empty automation uses the actual static mix (default 0.5). The ring mix session
clipboard is independent of delay mix/feedback/time; portable envelopes carry
`effectType:"ringmod"` and reject cross-effect paste. Point, shape, paste and pass
CLI recipes use parameter `mix` with the existing zero-based effect index.
Clip/track/master metadata renders in both engines; direct editing targets track
inserts. Live mix/envelope edits reschedule gains without restarting the carrier.
Carrier frequency automation is not implemented.

The native carrier now uses a float-rounded phase increment before accumulating
absolute project-clock phase. This follows the precision used by the browser
oscillator; see the primary [WebKit oscillator implementation](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/Modules/webaudio/OscillatorNode.cpp).
The initial ideal-phase comparison exceeded the unchanged 2e-6 budget (Chrome
7.55e-6, WebKit 6.73e-6); the corrected implementation passes below that budget.
It also applies to static ring modulation. Browser wavetable/float differences
remain; these comparisons do not establish arbitrary bit parity.

Validation: 116 frontend files / 1,443 tests pass with two workers and a local
15-second timeout; 88 native library + 3 CLI tests pass, with 10 existing ignored
platform tests. Chrome and WebKit actual-UI/native checks pass:

- Four preset/custom ring-mix shape cases: exact recipe/project points, every
  192,000 stereo frames/case, exact prefix/crop; maximum PCM error Chrome
  8.6799264e-7 / WebKit 3.1292439e-7.
- Copy/stretch paste: actual audition, guards, separate clipboards, static-value
  capture, undo/cancel/redo, locks/reordered review and save/open. Source-range and
  portable native recipes match GUI JSON; all 480,000 stereo frames compare,
  maximum Chrome 4.5541674e-7 / WebKit 5.9604645e-8.
- Recording: existing Read/Touch/Latch/Write protections plus ring-mix Latch
  capture, audible wet preview and Read restoration; exact native pass JSON and
  384,000 stereo frames/target (gain and ring mix). Maximum Chrome 2.1606684e-7 /
  WebKit 2.2351742e-7. Seek/Escape/cancel/stale/locks/save-open checks pass.
- Clip/track/master ring mix with later clip/source offset: all 384,000 stereo
  frames/rack, exact range crops, native point/tagged paste and insert/extract
  envelope/geometry matching. Maximum Chrome 8.7730587e-7 / WebKit 2.6822090e-7.

Live tests verify both transport play count and carrier oscillator count remain
unchanged. German 390-pixel shape/copy reviews and recording lane fit; shape screenshot
inspected after adding ring-specific help. All previous EN/DE leaves are preserved,
with eight new keys each. Owned synthetic media stays in OS temporary folders.

Existing long-delay WebKit shape/custom PCM failures from 0.8.26–27 remain known
baseline failures, not parity passes. Physical iOS and installed WKWebView UI
interaction are not validated by these browser checks. M2.3 remains open for
further selected FX parameters; buses/sends and LUFS/true-peak finishing follow.

Three existing static ring-modulator regression cases (dry/partial/wet,
137.25 Hz) also pass both browsers after the phase precision correction:
maximum Chrome 5.7742000e-7 / WebKit 1.6391277e-7; original tolerances retained.
Final lint, production TypeScript/Vite, Tauri app bundle and optimized standalone
CLI build pass. Local app and CLI 0.8.28 are installed, signed, verified and
launched, with the existing autosave preserved and a full recovery backup.
No tag or Apple upload was created for this increment.


## Local 0.8.29 — bit-crusher mix automation

Bit-crusher mix has a direct 0–100% track lane, Linear/Step points, preset/custom
shape review, protected recording and a separate tagged clipboard. Default empty
mix is 0.5; copying an empty GUI lane captures its actual static value. Delay,
ring-modulator and bit-crusher envelopes cannot cross-paste. Point/shape/paste/pass
native recipes use `mix` with the existing effect index. Clip/track/master metadata
renders in both engines and retimes with scoped range edits. Live mix updates keep
the waveshaper graph; bit-depth edits rebuild it. Bit-depth automation is not added.
The optional mix callback preserves the existing four-argument function arity.

Native waveshaper indexing now rounds input/offset/scale to float, matching the
primary [WebKit waveshaper implementation](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/Modules/webaudio/WaveShaperDSPKernel.cpp).
Six edge probes measured in Chrome/WebKit have identical wet outputs and are
native regression goldens. The initial copy comparison failed near a quantization
edge at about 1.9128e-4; it now passes the unchanged 2e-6 budget. Native track gain
also uses float automation values and float multiplication before its effect rack.

**Remaining precision limit:** combining upstream gain ramps with static bit
crushing can amplify browser float differences at steep quantization edges.
For the same recorded-gain project, the corrected native output matches Chrome
within 2.9802322e-8 but WebKit still fails 2e-6 at 1.4652312e-4. Installed 0.8.28
already fails that fixture: Chrome 4.1823834e-5 / WebKit 1.4738273e-4. This is an
existing renderer limit, not a parity pass or a byte-identical baseline exception.
New mix recording comparisons isolate mix with constant upstream gain; the shared
gain-capture regression disables the bit-crusher. No tolerance was widened.
Existing long-delay WebKit precision limits also remain as documented above.

117 frontend files / 1,448 tests pass with two workers and a local 15-second
per-test timeout. Native 92 library + 3 CLI tests pass, with 10 existing ignored
platform tests. Both Chrome and WebKit actual-UI/native bit-crusher checks pass:

- Four shape cases, all 192,000 stereo frames/case: exact native recipe points,
  exact range/full crops, point numeric bounds and keyboard edits, undo/cancel/redo,
  protected review, Save/Open, live play/waveshaper counts and German 390-pixel fit.
  Maximum PCM error Chrome 2.9802322e-8 / WebKit 2.5331974e-7.
- Copy/retime, all 480,000 stereo frames: source-range and portable native recipe
  JSON match, audible replacement, boundary guards, independent clipboards,
  static capture, undo/cancel/redo, locks/reordered review, Save/Open and German
  touch review. Maximum Chrome 2.2351742e-8 / WebKit 2.9802322e-8.
- Recording, all 384,000 stereo frames/target: shared mode protections plus
  bit-crusher Latch capture, actual wet quantization and Read restoration, exact
  native pass JSON and Save/Open. Maximum Chrome 2.9802322e-8 / WebKit 1.9371510e-7.
- Track/clip/master, all 384,000 stereo frames/rack with later clip/source offset:
  exact crop, point/tagged paste recipes and insert/extract geometry/envelopes.
  Maximum Chrome 2.9802322e-8 / WebKit 2.5331974e-7.

All previous EN/DE leaves remain unchanged, with eight new keys each. Synthetic
fixtures and debug media belong to OS temporary folders; private media untouched.
Physical iOS and installed WKWebView interactions remain unvalidated by browser
checks. M2.3 remains open for further selected FX parameters, ahead of M2.4 buses
and M2.5 loudness/true-peak finishing.

Existing 15-case gain/pan/delay shape regressions were rerun after the native gain
precision changes. Chrome passes all PCM cases (old four targets max 8.0466270e-7,
time 6.9476664e-5). WebKit's old four pass at max 8.3446503e-7; its three long-delay
cases remain failures of the original 1e-4 budget (0.0013022944, 0.0007234961,
0.0001447052), each byte-identical to the still-installed 0.8.28 CLI during the
comparison. They are reported as known baseline limits, not parity passes.
All UI/recipe/crop checks pass. Ten optimized recording/rack outputs are
byte-identical to the audited debug outputs. Final lint, TypeScript/Vite,
Tauri app bundle and optimized CLI builds pass. Shape/copy German screenshots
were inspected and fit. No dependency upgrades, tags or Apple uploads.

Local app and optimized standalone CLI 0.8.29 are installed, ad-hoc signed,
verified and launched. One autosave is preserved with a full recovery backup.
The preceding 0.8.28 main CI and iOS CI both passed before this push.

Eight shape outputs are also byte-identical after the gain precision fix; the
copy audit was repeated with the final optimized CLI in both browsers and passes
at the reported errors. Earlier copy output changed by at most 1.49e-8 after
float gain rounding; final GUI/native comparison was rerun rather than assuming
byte identity.


## Local 0.8.30 — distortion mix automation

Distortion mix adds a 0–100% track lane, Linear/Step points, reviewed preset/custom
shapes, protected Read/Touch/Latch/Write capture and a separate `distortionMix`
clipboard. Portable envelopes require `effectType:"distortion"`; cross-effect
paste rejects. Native point/shape/paste/pass recipes and scoped clip/track/master
range edits support the same metadata. Empty automation uses static mix, default
50%. Live mix changes retain the waveshaper and oversampling history; drive stays
static. Existing translations are unchanged, with eight new automation keys in
each language.

Offline range rendering now lets the context crop at its end while sources keep
their original clip duration. Previously, an artificial source stop at the crop
boundary changed Chrome oversampling in the final 23 frames by up to 2.9802322e-8.
The focused probe and full shape/rack audits now have exact range/full-crop equality.
No native oversampling kernels or shared automation evaluators changed.

Final lint, TypeScript/Vite build, macOS app bundle and optimized standalone CLI
build pass. **118 frontend files / 1,453 tests** pass with two workers and the local
15-second test timeout. **95 native library + 3 CLI tests** pass, with ten existing
platform tests ignored. Actual Chrome and WebKit audits use the optimized CLI:

| Audit | Stereo frames per case | Chrome maximum error | WebKit maximum error |
|---|---:|---:|---:|
| Four preset/custom shapes | 192,000 | 1.4901161e-7 | 4.4703484e-7 |
| Reviewed copy/retime | 480,000 | 2.6822090e-7 | 2.3096800e-7 |
| Gain and distortion mix recording | 384,000 | 8.9406967e-8 | 2.5331974e-7 |
| Clip, track and master mix racks | 384,000 | 2.3841858e-7 | 5.9604645e-7 |

All use the unchanged **2e-6** PCM budget. UI checks cover point bounds/keyboard,
locks/stale reviews, undo/cancel/redo, independent clipboards, Save/Open and live
mix edits without graph restart. Recording includes gain capture with distortion
enabled, mix capture with steady upstream gain, actual wet audition and Read
restoration, clock/seek/loop/interruption protections. Native source-range/portable
paste, point and scoped range recipes match GUI envelopes/geometry. German 390px
shape/copy layouts were inspected; these are browser checks, not physical iOS or
installed WKWebView interaction tests.

The rack fixture deliberately reaches dry mix at its abrupt 7.4s clip end. A
separate `scripts/test-distortion-tail.mjs` audit retains the **2e-6** budget and
exposes an inherited limitation at an abrupt end with nonzero wet mix. Static
track/clip/master exports at mix 0.5 differ after frame 355,200: Chrome maximum
error **0.2222395**, WebKit **0.2540395**. Active audio passes (Chrome 1.4901161e-7,
WebKit 1.1920929e-7). All six native static WAVs are byte-identical to the explicitly
supplied installed **0.8.29** CLI baseline. This proves an existing tail difference;
**these full PCM cases fail and are not parity passes**. The audit fails by default;
an explicit baseline permits reporting a known limit only after byte comparison.
The earlier automated rack fixture also failed after that end (Chrome 0.1858515,
WebKit 0.2132175). Reaching dry at the end isolates mix automation; it does not fix
arbitrary wet distortion tails. Browser outputs end the tail sooner than native.

All twelve existing static distortion cases pass their established **1e-4 peak /
1e-5 RMS** budget in both browsers; maximum peak error 3.85799e-6, RMS 1.405995e-7.
The fifteen old gain/pan/delay shape cases were rerun after the range change.
Chrome passes all PCM (gain/pan/mix/feedback maximum 8.0466271e-7; time 6.9476664e-5).
WebKit's first four targets pass at 8.3446503e-7; the three known long delay-time
cases still fail 1e-4 at 0.0013022944 / 0.0007234961 / 0.0001447052, each native WAV
byte-identical to 0.8.29. The upstream gain/static bit-crusher WebKit precision
limit documented above also remains unresolved; this increment does not claim
arbitrary DSP parity or widen any existing tolerance.

The prior 0.8.29 [CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38170644765)
and [iOS CI](https://github.com/CrispStrobe/crispaudio/actions/runs/38170644738) both
completed successfully. The new main push requires its own CI check. Local 0.8.30
app and optimized CLI are installed, ad-hoc signed, verified and launched with
autosave recovery retained. No tags or Apple uploads. M2.3 remains open for further
selected FX parameters; buses/sends and loudness finishing remain M2.4/M2.5.

## Chorus mix automation — local 0.8.31 (October 12)

Chorus mix now supports direct points, Linear/Step, reviewed preset/custom shapes,
Read/Touch/Latch/Write recording and an independent tagged copy/retime clipboard.
Native recipes and clip/track/master metadata use the same envelopes. Empty mix
uses the static insert value, default 30%. Live mix edits preserve both delay lines
and modulation phase; rate/depth remain static. M2.3 remains open for further
selected parameters and persistent curve controls.

Local validation: 119 frontend files / 1,458 tests and 101 native tests pass;
10 existing native tests remain ignored. Lint, TypeScript/Vite, Tauri app and
optimized CLI builds pass. App and standalone CLI 0.8.31 are ad-hoc signed,
verified and installed; one existing autosave was preserved with a recovery backup.
Actual Chrome and Playwright WebKit checks cover shape review, points, clipboard
retiming, protected recording, history/locks/save-open, live graph preservation,
German 390px dialogs and clip/track/master recipes. Range/full-render crops match
exactly. This does not establish physical iOS or installed WKWebView interaction.

Chorus uses its established native/browser DSP budget, **1e-4 peak / 1e-5 RMS**.
The new suites also report failures of the stricter 2e-6 mix diagnostic:

| Audit | Chrome peak / RMS | WebKit peak / RMS | Cases exceeding 2e-6 (Chrome / WebKit) |
|---|---|---|---|
| Four shape cases, 192,000 frames each | 9.2685e-6 / 2.4660e-8 | 4.1723e-7 / 6.8806e-8 | 4 / 0 |
| Copy/retime, 480,000 frames | 2.2985e-5 / 2.2134e-6 | 1.3657e-5 / 2.0944e-6 | 1 / 1 |
| Gain and mix recording, 384,000 frames each | 9.6262e-6 / 2.0396e-8 | 2.5332e-7 / 8.4433e-8 | 2 / 0 |
| Three racks, 384,000 frames each | 2.1281e-6 / 2.0135e-7 | 2.1756e-6 / 1.8590e-7 | 3 / 3 |

These are passes at the established chorus budget, **not blanket 2e-6 parity**.
Ten existing static chorus cases also pass per browser (peak 3.5640e-5 / 3.5550e-5;
RMS 1.8339e-6 / 1.0661e-6). All 20 native static WAVs are byte-identical to the
previous installed 0.8.30 CLI. Existing audit tolerances and chorus DSP are retained.

**Newly exposed inherited chorus tail limit:** the initial automated rack with
nonzero wet mix at its abrupt clip end fails full PCM: Chrome peak 0.0821082,
WebKit 0.0997399, both after the end at frame 355,200 (7.4s). The main rack fixture
explicitly reaches dry mix at 7.4s to isolate automation; it does not validate
arbitrary wet ends. `CRISPAUDIO_TEST_CHORUS_WET_END=1` retains that failing case.
The separate `scripts/test-chorus-tail.mjs` checks static 30% wet ends at all three
racks and fails its 1e-4 peak budget by default. Measured full errors reach
0.0617415 in Chrome and 0.0749997 in WebKit; active audio stays within budget
(peak 3.7584e-6 / 3.9339e-6). An explicit baseline CLI permits known-limit
reporting only when the native static WAV is byte-identical to that baseline.
All six tail WAVs match 0.8.30 exactly. This is evidence of an inherited limit,
not a tail parity pass or a fix. The earlier long WebKit delay, upstream gain /
bit-crusher precision and abrupt distortion tail limits also remain unresolved.

## Reverb mix automation — local 0.8.32 (October 12)

Reverb mix now supports direct points, Linear/Step, reviewed preset/custom shapes,
protected Read/Touch/Latch/Write recording and an independent tagged copy/retime
clipboard. Native recipes and clip/track/master metadata use the same envelopes.
Live edits retain convolution history. The existing blend is preserved: wet gain
is mix and dry gain is 1 − 0.7 × mix, retaining 30% dry at maximum mix. Empty
lanes use the static insert value, default 30%; size/decay remain static. M2.3
remains open for further selected parameters and persistent curve controls.

Local checks: 120 frontend files / 1,464 tests, 105 native tests (10 existing
ignored), lint, TypeScript/Vite, Tauri app and optimized CLI builds pass. Actual
Chrome and Playwright WebKit checks cover shape/point edits, copy/retime,
protected recording, Undo/Cancel/Redo, locks/stale review, save/open, live graph
preservation and German 390px dialogs. This does not validate physical iOS or
installed WKWebView interaction.

The new audio audits use the existing effects budget: 1e-4 peak / 1e-5 RMS,
scaled by the reference peak only above full scale. Raw errors and normalized
errors are reported, alongside the stricter absolute 2e-6 diagnostic. The shape
fixture's sustained DC excites a high reverb output (peak about 10.879), so its
raw RMS exceeds the nominal 1e-5 budget; it passes the established headroom rule.
No existing effect audit tolerance or convolution kernel was changed.

| Audit | Chrome raw peak / RMS | WebKit raw peak / RMS | Cases exceeding absolute 2e-6 (Chrome / WebKit) |
|---|---|---|---|
| Four shapes, 192,000 frames each | 4.3869e-5 / 2.4573e-5 | 5.5313e-5 / 2.5448e-5 | 4 / 4 |
| Copy/retime, 480,000 frames | 4.0531e-6 / 1.1464e-6 | 4.1723e-6 / 1.1688e-6 | 1 / 1 |
| Gain and mix recording, 384,000 frames each | 2.9802e-8 / 7.3610e-9 | 2.0862e-7 / 7.6685e-8 | 0 / 0 |
| Three racks, 384,000 frames each | 1.2219e-6 / 2.5819e-7 | 1.3858e-6 / 2.6872e-7 | 0 / 0 |

Maximum normalized shape errors are 4.0326e-6 peak / 2.2589e-6 RMS in Chrome
and 5.0846e-6 / 2.3392e-6 in WebKit. Copy output peaks about 1.004; recording
and rack peaks remain below full scale. Recording uses size=0 / decay=0.01 to
isolate gain/mix gestures and muting. The rack fixture uses size=0.5 / decay=1.5,
a later clip/source offset and **nonzero wet mix at the abrupt clip end**. Its
full PCM, including the tail through the export end, passes 2e-6 in both browsers.
Shape and rack range exports match full-render crops exactly. These results do
not establish blanket 2e-6 parity for every reverb mix envelope.

Eight existing static reverb cases pass per browser, including mono/endpoints,
impulses and long responses: peak 7.1712e-8 / 3.1867e-7, RMS 6.3859e-9 /
8.4357e-8 (Chrome / WebKit). All 16 static native WAVs match the previous
installed 0.8.31 CLI byte-for-byte. App and optimized standalone CLI 0.8.32 are
installed and ad-hoc signed/verified; one existing autosave was preserved with a
full recovery backup.

The 15 older gain/pan/delay shape cases were also checked. Chrome's final unchanged
audit passes (gain/pan/mix/feedback peak 8.0466e-7; time peak 6.9477e-5). An initial
large gain S-curve discrepancy did not reproduce in a diagnostic run or the final
unchanged audit; its cause is unresolved. WebKit retains three documented long-delay
failures at 1e-4, all native WAVs byte-identical to 0.8.31. Other previously documented
bit-crusher precision, distortion tail and chorus precision/tail limits remain
unresolved; this increment does not claim to fix them.

## Saved automation shape reviews — local 0.8.33 (October 12)

New preset/custom shapes save their review settings with the first baked point.
Select that point to reopen and revise the original whole span after save/open.
Revision replaces the existing interior points in one undo step; Linear flattens
the span. Reapplying the same shape preserves history/redo. Complete copy/stretch
and whole-span range shifts retain the dimensionless controls. Interior edits,
Step changes and partial cuts can invalidate the saved span; the tool then reviews
only the adjacent segment. Older shapes without metadata remain ordinary points.
Audio continues to use the baked linear points. Direct curve controls and further
selected FX parameters remain open in M2.3.

Local validation: 121 frontend files / 1,468 tests, 108 native tests (10 existing
ignored), lint, TypeScript/Vite, Tauri app and optimized CLI builds pass. Checks
cover malformed metadata, JSON round-trip, complete copy/stretch/range shifts,
whole-span revisions, Linear flattening and safe fallback after interior edits.
App and optimized CLI 0.8.33 are installed, ad-hoc signed and verified, with one
existing autosave preserved and a full recovery backup.

Actual Chrome and Playwright WebKit audits cover ten initial/revised custom-shape
cases across gain, pan and delay mix/feedback/time, fifteen preset regressions and
four reverb mix cases. They check restored custom settings after save/open,
whole-span bounds and stable point counts, numeric/keyboard/pointer handles,
Undo/Cancel/Redo, locks/stale reviews, no playback restart, no-op/redo and German
390px layout. The coordinate audit captures the matrix at the pointer event,
matching the control while the modal animates; its original 0.001% tolerance is
retained. An initial fixture filename collision was corrected with distinct names
for revision outputs; the CLI's overwrite protection remains intact.

All 58 native WAVs match the prior installed 0.8.32 CLI rendering the same final
points byte-for-byte. This establishes unchanged native rendering, not a pass for
inherited browser differences. Chrome custom cases pass the existing budgets
(gain/pan/mix/feedback peak 8.0466e-7; time peak 3.7745e-5). WebKit's four other
lanes pass (peak 7.7486e-7), while the initial custom long-delay case retains a
known 1e-4-budget failure at 2.8940e-4, byte-identical to 0.8.32. The revised time
case passes. The three older WebKit preset long-delay failures also remain.
Reverb retains its documented headroom-scaled budget and strict 2e-6 diagnostic
failures; measured values match the 0.8.32 evidence above. Full/range crops match
exactly. Other documented precision/tail limits remain unresolved. Physical iOS
and installed WKWebView interaction were not validated.

## Local 0.9.9 — input ownership and comp review

Installed signed 0.9.9; one autosave preserved in a fresh recovery backup. No
release tag or Apple upload. Full suite: 1,586 tests / 151 files; lint, production
web/Tauri build and locked iOS simulator library check pass. Chrome and WebKit
real-worklet input audits cover warm preview replacement, undo and late input
results. Coordinated two-input synthetic capture still passes. Comp GUI audits
cover audition without history, region replacement/removal, reset/undo, named
versions, save/reopen and German 390 px layout. Physical built-in microphone
capture and audible recorded speech are user-confirmed; additional-device hardware acceptance awaits availability.

## Local 0.10.0 — folders, fast editing and a simpler recording dialog

Signed app installed with one autosave preserved. Lint, web/Tauri build and locked
iOS simulator library check pass. Final frontend suite: 1,592 tests / 153 files.
The first full run exposed unnecessary canvas work after metadata changes; the
folder view cache now preserves track-array identity and the final full run passes.
That cache correction follows the installed build and is included in the next build.
Chrome/WebKit folder and editing workflows pass actual collapse hit geometry,
shared controls, save/reopen, exact placement, keyboard navigation, selected-group
drag, context trims and German 390 px layout. Simplified recording/comp audits pass;
single-input Chrome and coordinated-input WebKit capture/punch/loop remain checked.
User confirmed physical MacBook microphone capture and audible speech in 0.9.9.
Additional physical inputs remain unavailable; no new Apple distribution occurred.

## Local 0.10.1 — timeline interaction and touch controls

Full frontend suite: 1,594 tests / 153 files. Picture-inspector follow-up tests:
11 pass; lint, production web/Tauri build and locked iOS simulator library check
pass. Chrome/WebKit GUI audits cover the mouse editing toggle, both boundary
handles, one undo/Escape restoration, expanded context actions, focused inspectors,
information buttons, help cards, fit preferences and narrow German layouts.
Touch contexts render every shared menu command and open clip settings with taps;
Chrome touch events also drag a boundary. WebKit touch dragging and physical iPad
acceptance remain untested. Picture inspector tab/collapse/precise duration/undo
passes both browsers. FX live edits keep the graph running; offline/native checks
retain the existing moving-delay errors (9.06e-6 Chrome / 2.55e-6 WebKit), within
its established 1e-4 budget. Native media/DSP and the optimized CLI are unchanged.

## Local 0.10.2 — scoped passes and carrier frequency

Frontend: 1,597 tests / 154 files; lint and final web/Tauri build pass. Locked iOS
simulator library check passes. Media library: 118 tests pass / 10 existing ignored;
new tests prove silent-time frequency integration, zero-phase hold and exact legacy
samples with an empty frequency envelope. Optimized CLI rebuilt. Real Chrome/WebKit
clip Touch, master Latch, gesture-free Write draft, Escape, one Apply/Undo, save/reopen
and German layout audits pass. Actual native stereo float WAV comparisons with both
clip and master carrier envelopes differ by 3.13e-7 Chrome / 8.12e-6 WebKit, within
the existing moving-delay 1e-4 budget; full/range crop error is zero. Physical input
acceptance remains the user's confirmed built-in microphone; no new device claimed.

## Mac Store signing follow-up — 2026-10-15

The last upload failed with Apple's **Invalid Provisioning Profile Signature**
(HTTP 409), after app signing and package creation succeeded. It was not an AAC
patent or audio-playback error. The local keychain has an Apple Distribution
identity; no matching CrispAudio Mac Store profile was found in the standard
local profile directory. GitHub secret values cannot be retrieved for inspection.

The workflow now checks profile CMS integrity, expiry, macOS platform, exact
team/application identifier, Store distribution type and matching signing
certificate before building. Dispatch defaults to a dry run; signing verification
and package artifacts precede the separately gated upload. These checks do not
replace Apple's trust/revocation decision. The sandbox entitlements now include
microphone input, matching the existing usage description and recording feature.

To unblock submission, download/regenerate the Apple-issued Mac App Store
provisioning profile for this app and current distribution certificate, then
replace `MAC_PROFILE_BASE64` in GitHub secrets. Run the workflow in dry-run mode
before authorizing an upload. No workflow was dispatched or Apple upload attempted
for this checkpoint. Native third-party plugin hosting also needs a signed,
sandboxed Store-build acceptance pass; local ad-hoc testing does not establish it.
