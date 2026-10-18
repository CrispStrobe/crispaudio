# Engineering checkpoint and remaining work

Updated 2026-10-18. This is the entry point for a fresh agent. The active product
roadmap is [PLAN.md](../PLAN.md); the broader accepted scope is
[DAW_GAP_ANALYSIS.md](DAW_GAP_ANALYSIS.md). Old milestone notes in those files are
historical records, not a current completion checklist.

## Start here

1. Read the ignored `HANDOVER.local.md` and `CLAUDE.local.md`, if present, for
   machine setup, private fixtures, recovery locations and local evidence files.
   Those files are intentionally absent from a fresh clone; use portable commands
   in [CLAUDE.md](../CLAUDE.md) when no local handover exists.
2. Check `git status`, the current commit and GitHub workflow results. Preserve
   existing user changes, installed sessions and original media. Never commit
   credentials, personal paths, private recordings or signing material.
3. Continue the latest scoped source checkpoint below while physical native checks
   wait. N1–N3 are implemented internally; N4/N5 still require their stated
   platform/device acceptance. Keep architecture changes bounded and reviewable;
   update the evidence and this handoff at each checkpoint.

## What is ready

The installed baseline remains 0.13.33. Source 0.13.52 fixes source plug-in
first-pass state and stale prepared results; see the latest checkpoint below.
Source 0.13.51 adds the shared source-preview
close/join barrier; see the latest checkpoint below. Source 0.13.50 adds hardware-free native
source-worker qualification and enforces 48 kHz audition admission; start at the
latest checkpoint below. Source 0.13.49 fixes AU source-window
fidelity and clears the measured offline parity blocker; start at the latest
checkpoint below. Source 0.13.48 adds the hidden native source-audition adapter.
Source 0.13.47 adds bounded ordered source
effect chains; see the latest checkpoint below. Source 0.13.46 adds automatic bounded
live-filter waveform snapshots; see the latest checkpoint below. Source 0.13.45 adds a bounded continuous
built-in source filter; see the latest checkpoint below. Source 0.13.44 extends Mix A/B to frozen live mixer values, with baked fields
protected, localized package errors and short-render preflight.
Source 0.13.43 adds bounded [reversible track freeze](TRACK_FREEZE.md).
Source 0.13.42 adds optional monitor-only
source A/B loudness matching (see [limits](RESTORATION.md)); no live app was replaced.
The isolated preview remains 0.13.41 and adds the
opt-in native recording preview described below. The established baseline includes timeline/video editing,
recording/takes/comping, compact recording controls and meters, source restoration,
FX-aware segment waveforms within documented limits, native Mac AU/VST3 playback
and a buffered native cue rack. The [README](../README.md) describes user features.
Do not reintroduce ASR/TTS creation or composition/instrument sequencing: these
belong to CrisperWeaver and CometBeat respectively. Imported audio/transcripts stay
editable. Existing MIDI utilities do not imply a MIDI expansion roadmap.

Native recording is now selectable on Mac under **Input → Mode → Native · Preview**
in the 0.13.41 preview. Compatible remains the default. Physical qualification
and the remaining N4 tasks below are still open:

| Foundation | Code entry point | Verified scope |
|---|---|---|
| Dry/cue queues and DSP worker | `media/src/native_input.rs`, `native_input/plugins.rs` | Bounded ingress, independent dry capture, static native inserts and cue fault isolation |
| Mac capture and device inventory | `native_input/macos.rs`, `macos/devices.rs` | Generated callback/clock/lifecycle tests; read-only inventory |
| Durable dry files and recovery | `native_input/recording.rs` | Checkpointed float WAV/index, verified-prefix recovery, retained originals |
| Capture/cue ownership | `native_input/session.rs`, `session/cue.rs` | Watchdogs, helper cleanup and recording-group stream budget |
| Group completion | `native_input/session/group.rs` | Up-front admission, startup rollback, all-capture stop before joins, atomic group manifest |
| Cue scheduling | `native_input/output.rs` | Host-clock mapping, fixed delay, bounded startup and drift/underrun rejection |
| Mac output | `native_input/macos/playback.rs` | Legacy cue or shared mix/backing output, explicit UID, priming/arming, per-lane reports and coherent atomic controls |
| Shared cue/backing mixer | `native_input/mix.rs` | Up to 16 lanes, independent gain/balance/mono, 64-frame ramps, whole-mixer clock binding and separate failure domains |
| Backing worker | `native_input/backing.rs` | Graph history/latency preroll off callback, bounded 16-block queue, partial reads/EOF, cancellation and helper registration |

`Output::start_shared` wires the mixer and backing reader to the Mac queue.
`Session::prepare` and `Group::prepare` now create files/cue racks before capture
opens, retaining recoverable files on abandonment. `session::monitored` now owns group/output/backing readiness, arming, polling and
ordered shutdown. Capture stops before output cleanup and file joins; backing/clock
failures prevent complete publication. Version 2 group manifests now contain validated frame placements. The editor
adapter now converts the complete set into one project transaction from the
recording UI, after every raw WAV has loaded and project identity is rechecked. None of this
establishes physical latency, sustained-load stability or independent-device sync.
See [NATIVE_INPUT.md](NATIVE_INPUT.md) for contracts and evidence links.

## Next implementation sequence

N1–N3 are implemented internally, including the durable output-clock ledger and
aligned interrupted-session recovery. The remaining app integration and hardware
qualification tasks (N4–N5) stay open. Dependencies and completion boundaries are
explicit; the installed baseline does not include these candidate changes.

### N1 — Shared hardware output and backing worker (implemented internally)

`Output::start_shared` consumes up to 16 cue lanes and a primed backing reader.
Graph/plugin rendering and graph preroll run on `backing::Worker`; the callback
only consumes fixed PCM. Latest cue controls travel as coherent atomic snapshots
and ramp over 64 frames. Cue-only errors remain isolated; backing or hardware
clock failures latch whole-output silence. The shared mixer binds all lanes to
the observed hardware clock before its first render. The legacy one-cue entry
point remains supported. This is software integration, not physical qualification
or a shipped latency promise; see N5 before making it the default.

### N2 — Preparation, arming and failure ownership (implemented internally)

`Session::prepare`/`Group::prepare` finish files/cue helpers before capture. Prepared
owners retain unopened writers and close them before joining on Drop.
`session::monitored::Prepared` waits for output-clock/backing readiness, starts the
prepared group, then arms output. Its `Run` owns polling, stop, cancellation and
Drop. Output health inspection leaves cleanup to this owner so every capture can
quiesce before output/backing shutdown and cue/file joins. Finalization failure
aborts all files instead of publishing a complete group. Cue-only failures remain
isolated. Software tests cover readiness, startup rollback, arming, raw/output loss,
shutdown failure and Drop; graph preroll compensates a generated delayed insert.

Sequential physical device opens, queue lead/conversion, real clock accuracy,
round-trip delay, drift correction and deadline/load qualification are not thereby
established. Do not turn the internal constants into shipped latency claims.

### N3 — Timing and atomic project adapter (implemented internally)

`native_input/timing.rs` stamps the complete intent before capture: boot/run scope,
integer timebase, project/record windows, lead-in, loop semantics and explicit
per-input correction. The output snapshot distinguishes its stable clock anchor
from the first frame actually mixed after arming. Placement verifies every raw
block clock and PCM checksum, rejects excessive drift and splits loop passes while
retaining original source offsets. Cue/plugin delay and legacy Web Audio latency
are never applied as recording-position compensation.

Manifest v2 requires validated timing; v1 remains readable as untimed raw audio.
Failed alignment retains originals without publishing a complete aligned group.
Reopen recomputes timing from the checked original files. The frontend adapter
validates the complete group, decoded sources and original project identity, then
uses the existing one-transaction take/comp publisher. Tests cover Undo/Redo and
portable save/reopen. App integration still belongs to N4.

Crash recovery currently guarantees verified raw prefixes, not aligned project
recovery: activation/progress clocks are only finalized at clean stop. Persist a
trusted output-clock ledger during recording before enabling aligned interrupted
session reconciliation. Independent-device correction is not implemented; drift
is rejected. Physical accuracy remains N5.

### N4 — App integration and native recording UX (in progress)

The Mac commands and typed snapshot client now exist. A dedicated control thread
owns queues, group/backing preparation, meters, sparse cue updates and timed stop.
Native playback/recording share an output reservation. Window/snapshot close and
app shutdown cancel/join the owner; raw originals and their directory survive
failure. Routes use explicit CoreAudio UIDs and channel indices; the backend owns
the recording root. The backing worker now uses the frozen timing intent for
silent delay, count-in, preroll and loop passes, retaining graph DSP history and
compensating plug-in latency. Monitor clicks are separate from dry files/exports.

The 0.13.34 preview now connects Record/settings/meters and native-clock playhead
reports. It resolves explicit UIDs separately from browser IDs, keeps separate
native corrections, freezes the backing snapshot, handles pending-start Stop and
teardown, loads all WAVs with retained resampling provenance, then publishes one
editor transaction. Empty projects get a positive frozen graph duration without
changing the editor project. EN/DE layout and generated lifecycle checks pass.

The 0.13.35 preview adds live Monitor mix. Backing/output attenuation and each
prepared cue's level, balance and mono are ephemeral for the recording run. They
do not modify project history or saved takes. Rapid edits are coalesced, native
updates ramp over 64 frames, and initial mute applies before first mixed PCM.
Mute/last-level state survives closing settings; muted faders remain editable.

The 0.13.36 internal recovery backend adds `native_input/recovery.rs` and app
commands `native_recording_discover` / `native_recording_recover`. A plan is synced
before capture; a single latest-value disk worker atomically replaces a checksummed
output checkpoint about once a second, starting after first observed mixed PCM.
The extent is observed hardware progress, strictly smaller than the speculative
queued tail. Slow fsync does not block the recording actor or audio callback.
Recovery copies complete checksummed blocks within that extent to `recovered-v1`,
verifies all input clocks/placements and writes `recovered.json`, never a clean
`completed.json`. Originals remain untouched; all inputs must succeed. Reopen
revalidates PCM/index/timing. Existing derived results are reused, not recopied.
No checkpoint, no valid window, missing input or mismatched run means no aligned
publication. Saved host epochs are interpreted only within their frozen run.
This does not establish physical device accuracy or guarantee a zero-loss tail.

The 0.13.37 Mac preview now provides a collapsed Recovery section in recording
settings, with explicit Find → Review → Import. It filters project IDs, checks
missing/locked/unarmed targets, loads every WAV through the shared native loader,
and performs one guarded editor transaction. Incomplete takes have a distinct name
and retained note. Complete manifests go through `group::load_completed`, never raw
salvage. Metadata-only discovery is not PCM verification. Review does not edit.

`project.nativeRecordingImports` stores bounded portable run IDs in the same
transaction as takes. Undo removes both; save/reopen retains the receipt. New normal
native captures also write receipts. Path fallback considers only currently used
sources, not orphan buffers retained for Redo. Older portable projects without
receipts or source provenance cannot prove whether a historical group was imported;
review existing takes before importing those. No on-disk acknowledgement is written
before project insertion/save, and originals remain available.

The 0.13.38 preview adds owner-scoped recovery jobs, sparse status and a real
cancel signal. Full completed-file verification, raw copy and reused recovery
verification check cancellation between blocks and count actual block checks.
Window/app shutdown joins workers before releasing their reservation. The UI
cancels/discards late work on close, project changes or playback; active disk calls
can delay completion, so do not promise immediate cancellation.

Discovery now retains one owned directory iterator, filtered to the requested
project. Each page scans at most 512 entries/64 candidates; Next replaces the
current page and closes the cursor at EOF, refresh, project/window close. Starting
native recording invalidates the idle cursor. Refresh after archive changes; this
is a bounded live iterator, not a durable snapshot of a mutating directory.

Rate-converted Review is memory-only. The 0.13.40 Import coordinator owns a backend
conversion transaction, stages all WAVs, checks project/cancel/playback, protects
files durably, then publishes takes/receipts once without an intervening await.
Failure before publication aborts all owned conversions; an active write finishes
before cleanup. Successful publication, or a synchronous subscriber throwing after
publication starts, retains files for unsaved state and Undo. Lost finalization is
safe: pending/aborted work is eligible for later bounded collection; retained work
is conservatively protected. Original provenance and linked/portable reopen remain
unchanged. Old unreceipted conversions cannot be collected automatically.

Remaining N4 work:

- Helper-start cancellation now uses the owner's predicate during cue/backing
  readiness (0.13.39), with registered/late-helper kill/reap, worker join and cue
  reservation release. Silent blocked subprocess fixtures and partial-group raw
  reopen cover this software boundary. Active filesystem calls and unregistered
  blocking work can delay shutdown; real device/load behavior remains N5.
- Owned recovery conversion cleanup is implemented in 0.13.40. The backend stages
  new files separately from originals, binds tokens to the owning window, and holds
  filesystem leases against collection. Cancellation/failure before publication
  aborts the whole conversion transaction. Protection is durable before editor/Undo
  publication. Pending or explicitly aborted transactions are collected in bounded
  pages on later imports; live writers and retained files stay protected.
- Keep legacy unreceipted files and uncertain publication outcomes. No path/age
  heuristic can prove they are absent from unsaved, external or Undo projects.
  Reference-aware retained-asset/legacy cleanup belongs to the asset/session track,
  with an explicit reference catalog and review boundary; it does not block N5.
- Keep immediate Record/Stop, persistent GUI meters and a small settings dropdown.
  Advanced routing/inserts remain collapsed; show measured/configured delays
  honestly. Explicit monitor output and independent backing/cue controls are now
  implemented; hardware routing/latency acceptance remains N5. Wet capture must
  retain dry originals.
- Done when desktop/touch tests cover arm/record/stop/cancel, device selection,
  cue fault recovery, compact layout, save/reopen and one-action group Undo.

### N5 — Physical and release qualification

Use [NATIVE_RECORDING_QUALIFICATION.md](NATIVE_RECORDING_QUALIFICATION.md) and
`npm run native:preview -- --launch` on macOS 14+. The .41 isolated preview has its
own bundle/app-data/WebKit identities and no document associations; it does not
replace or import the installed session. Plist/signatures AND embedded runtime
context are verified before a window opens. Only explicit user Record/Play opens
capture/playback; first-use Record releases its temporary browser permission stream
before native input. Do not assume launch or generated tests establish speech or
listening acceptance. Record actual user/device results in the evidence matrix.

- Built-in microphone recording and playback were accepted on the existing app;
  that does not qualify the new native path. Test it separately once N1–N4 work.
- Measure physical round-trip/placement, long/load/background behavior, output
  switching, sleep/wake and hot-plug. External interfaces/webcams, commercial
  plug-ins and physical iOS require those devices/platforms to be available.
- Replay complete audio-only, audio/video and recording/comping sessions; inspect
  saved/exported files, not only previews. Include rate-converted recovery Import,
  linked/portable reopen and audible native playback; verify Undo/Redo retain files.
  Test signed/sandboxed relaunch and access.
- Refresh Apple processing/group/review status before any submission. Main pushes
  run CI; they do not submit to Apple. The recorded submission is 0.13.0/build 14;
  later local versions are not thereby distributed. Release/tag/upload actions
  must follow the release task and its checks.

## Remaining accepted product backlog

After the native recording sequence, continue these bounded tracks in order.
Use the gap inventory for current limitations rather than treating the labels as
feature parity with ocenaudio, Ardour, REAPER or other mature applications.

| Track | Work still required | Acceptance boundary |
|---|---|---|
| Source FX and restoration | Full live source FX; click detection, spectral healing/inpainting and de-hum drift tracking | Retain originals; cancellable preview, one-Undo Apply; quantify signal damage and improvement and listen to varied real recordings |
| Effect-aware waveforms | Native inserts, longer clips, scalable caches and clearly scoped track/bus/master display | Reject stale renders; bounded memory/work; explain preview scope; preserve responsive continuous edits |
| Monitor/routing depth | Arbitrary input maps, independent headphone mixes, PFL/AFL, dim/mono and retained-dry wet capture | Explicit feedback-safe routing and measured delay; fixture tests followed by actual hardware |
| Freeze/render in place | 0.13.43 implements bounded pre-fader audio-track freeze/thaw, manual tail and retained routing/originals. Remaining: clip/bus/ducked/linked/grouped freeze, streaming, frozen-package remapping and physical native parity | See [scope](TRACK_FREEZE.md); retain originals/racks, prevent double processing, release DSP, stale/cancel guards and Undo/reopen |
| Asset/session efficiency | Searchable file/region audition, portable/session templates, versions/tabs and relinking | Portable projects, missing-media recovery and complete-session acceptance; existing local track/FX templates retained |
| Plug-in UX and automation | Custom Mac plug-in windows, wider built-in live controls, fewer restarts, stronger event timing | Helper/window cleanup, saved-state roundtrip, live/export agreement and bounded scheduling |
| Recorded-audio timing | Tempo maps, transient/warp markers and grouped timing edits | Defined phase-coherent multitrack behavior; no composition/sequencer expansion |
| Finishing | True-peak limiter, dither/noise shaping, resampling/stretch quality | Reference/oversampled measurements, export metadata and listening across rates/material |
| Long sessions | Measure memory/seek first; disk paging/streaming and waveform-cache redesign | Publish memory/seek/dropout budgets and test long assets; current 32-million-frame native source limits are not streaming |
| Cross-app exchange | CometBeat stem/timing/marker contract; word-preserving CrisperWeaver export/handoff | Round-trip fixtures with timing/words intact; fixes in the owning app where required |
| Distribution/licensing | Refresh signing/Store state and third-party notices when shipping; revisit exact codec/license changes | Preserve documented distinction between license compliance and country/claim-specific patent assessment; no unsupported worldwide-clearance or country-block claims |

The codec assessment is recorded in [MEDIA_FORMATS_AND_LICENSES.md](MEDIA_FORMATS_AND_LICENSES.md).
No new patent conclusion or distribution restriction is introduced by this checkpoint.

## Verification at the code checkpoint

The 0.13.41 permission/qualification preview passes **2083 frontend tests/216 files**,
25 focused tests/3 files, lint, production frontend build and 24 release checks.
The sandboxed Mac preview bundle passes local helper/signature and embedded identity
checks and was opened separately from the installed .33 app. No recording/tone/play
was initiated by the agent; the built-in mic/meter/speech/playback question is still
awaiting a user result. Do not mark it accepted from launch/generated tests. The
59 app Rust and 334 media test runs below are unchanged-command/source baselines.
While the physical response/devices are unavailable, continue the independent
source FX/restoration sequence rather than repeatedly asking the same check.
See [preview evidence](evidence/native-recording-qualification-preview.json).

The 0.13.40 conversion-transaction checkpoint passes **2076 frontend tests/215 files**,
**59 app Rust tests (one hardware case ignored)**, 22 focused tests/3 files, lint and
21 release checks. It exercises partial group failure,
late-write cancellation, retry, project/playback changes, single Undo/Redo retention,
publication subscriber errors and lost finalization acknowledgements. Native checks
cover real filesystem locks, bounded collector continuation, invalid receipts,
symlinks/unknown contents, window/exit cleanup and retained files across fresh
store instances. See [conversion evidence](evidence/native-recording-conversion-cleanup.json)
for counts and packaging results. Production build, Mac debug bundle and local
ad-hoc sandbox/helper preflight pass.

The 0.13.39 helper-start cancellation preview passes **334 media tests (16 ignored)**
and **52 app Rust tests (one hardware case ignored)**, plus 21 release checks. It adds silent subprocess checks for
blocked cue/backing opens, helper registration racing cancellation and dry ingress
independence. Group cancellation leaves a valid empty raw WAV/index; recovery
correctly refuses to invent a take with no samples. The app regression exercises
both Stop and Cancel during backing preparation and keeps the audio reservation
until the worker has joined. See [startup evidence](evidence/native-recording-startup-cancel.json)
for native and packaging results. Production build, Mac debug bundle and local
ad-hoc sandbox/helper preflight pass. The last full frontend run is the unchanged
0.13.38 frontend recorded below; this increment changes native startup only.

The 0.13.38 recovery jobs preview passes **2068 frontend tests/214 files**
(four workers, 20-second test ceiling), **327 media tests (16 ignored)** and
**51 app Rust tests (one hardware case ignored)**. Focused final recovery/loader/UI
regression passes 25 tests/3 files, including converted linked/portable reopen.
Full lint, production build, 21 release checks and local Mac ad-hoc sandbox/helper
preflight pass. EN1100×800, DE820×650 and DE390×800 generated component reviews cover
busy progress/cancel, Next and ready Import without horizontal overflow. No physical
mic/output, install, simulator or Apple upload. Installed 0.13.33 is preserved.
See [job/pagination evidence](evidence/native-recording-recovery-jobs.json).


The 0.13.37 review/import preview passes **2064 frontend tests/214 files** with
four workers and a 20-second per-test ceiling, **324 media tests (16 ignored)** and
**47 app Rust tests (one hardware case ignored)**. Focused post-budget loader/recovery checks pass 17 tests. Full lint, production build and local Mac ad-hoc sandbox/helper
preflight pass. Generated recovery component review covers EN1100×800, DE820×650
and DE390×800 with no horizontal overflow. This is software/layout evidence only;
no microphone/output or installation was performed. Installed 0.13.33 is preserved.
See [review/import evidence](evidence/native-recording-recovery-ui.json).


The 0.13.36 recovery backend passes **323 media tests (16 ignored)** and
**47 app Rust tests (one hardware case ignored)**. The new cases include a child
process exiting without cleanup, sample-exact two-input recovery and loop placement,
corrupt PCM/torn ledgers, drift-limited prefixes, missing inputs, cancellation,
unchanged originals, repeated recovery/reopen, managed-path/symlink rejection,
bounded discovery and recovery/capture exclusion. Release checks pass 21 tests.
Frontend component sources are unchanged; the prior 2054/212-file result below
belongs to 0.13.35. Production build and local Mac bundle/signing checks pass.
No physical mic/output, simulator, installation or Apple upload. See
[recovery evidence](evidence/native-recording-crash-recovery.json).


The 0.13.35 live mix preview passes **2054 frontend tests across 212 files**,
**314 media tests (16 ignored)** and **46 app Rust tests (one hardware case ignored)**.
Full lint and production build pass. The Mac debug candidate passes local ad-hoc
sandbox/helper signing checks and the release-check suite passes 21 tests.
Generated monitor UI review passes EN1100×800, DE820×650 and DE390×800, including
typed levels and no horizontal overflow. This is component layout, not iOS/native
hardware acceptance. See [live mix evidence](evidence/native-recording-monitor-mix.json).

The raw/cue callback test checks independent levels, exact muted start, ramps,
invalid-update rejection and unchanged raw PCM. No microphone/output device was
opened. Installed 0.13.33 is preserved; candidate 0.13.35 is separate. Aligned crash
recovery and physical qualification remain open. Optional SDK VST3 checks were
explicitly qualified at the earlier timing checkpoint; their prerequisites remain
separate from this increment.

Portable commands (use a configured Rust toolchain):

```sh
cargo test --manifest-path media/Cargo.toml --features native-engine --lib --locked -- --test-threads=2
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked -- --test-threads=2
```

Hardware/optional plug-in fixtures remain separate tests with explicit prerequisites.
Do not rerun audio-producing tests or overwrite user sessions merely to refresh a
handoff. Check live CI instead of inheriting historical green claims.

## Source A/B matching checkpoint — 0.13.42

Optional matching is beside Original/Preview for all source drafts, including
cleanup, restoration and completed native plug-in previews. Cancellable analysis
uses the selected mono/stereo ranges and repair context, with a 0.4–120-second
budget. It attenuates the louder version, shares sample-peak headroom and gives
each crossfading voice its own gain; saved source data and Apply stay independent.
New drafts stop audition until recalculation completes. Silent/sub-gate, short and
multichannel comparisons show Unavailable. No true-peak limiting or universal
perceptual matching claim. Physical listening remains separate.

Next: reversible track freeze with original routing/FX retained, explicit thaw,
one Undo, linked/portable reopen and stale-render cancellation; then full live
source FX and further restoration selection/detection/healing. Preserve the native
qualification preview and user session; follow N5 protocol on a human result.

Validation: **2090 frontend tests / 217 files**, production build, lint and
**24 Python release checks** pass. Muted browser controls and real offline PCM
checks pass, including rapid matched switching and German 390 px layout.
[Sanitized evidence](evidence/source-audition-matching.json). No native rebuild,
installation or physical audio qualification was performed for this frontend change.

## Reversible track freeze checkpoint — 0.13.43

Track right-click/ellipsis and Track Settings open a small tail/Freeze dialog, with
help behind (i). Thaw restores baked fields while preserving current live mixer
values. Frozen content cannot be unlocked, edited, armed, rerouted or have its
sources replaced through direct store commits. Temporal Undo/Redo still restores
complete snapshots. Original sample rate is protected until thaw.

The render includes segments, fades, pre-insert gain automation and saved built-in/
native track racks, before volume/pan/output/sends. Retained freeze metadata is
structurally validated; normal source/retime/MIDI/take/effect validation runs on
both active and restored views at project load. Original source IDs participate
in project reference collection. Corrupt/missing frozen or retained audio fails
reopen. Track packages retain source IDs but frozen-package import is explicitly
blocked until full identifier/routing remapping is implemented.

Next: qualify AU/VST3 freeze with explicit software fixtures and saved-state,
latency, tail and reopen parity; then full live source FX. Further freeze work:
streaming/budgets, clip/bus/ducked tracks, linked/grouped edit semantics and package
remapping. No native-device qualification, automatic cleanup or whole-roadmap
completion is claimed. Preserve running app sessions and the pending N5 check.

Frozen saves use project format 5; legacy formats remain unchanged when no freeze
is present. Native-state metadata in originals still validates, but does not make
an original rack active. Frozen projects bypass the disk-only native-video fast
path (which accepts version 3), keeping the normal app render path. Older-app and
standalone media CLI freeze editing is not supported/qualified.

Autosave collects render and retained original source IDs. Recovery cache version 3
preserves the existing stores while preventing older clients from ignoring frozen
metadata. Layout-only restore refuses frozen sessions; linked or cached audio is
required. Shared validation checks render dimensions and original clip coverage
before freeze publication, save, recovery or thaw.

The generated built-in-effects fixture has exact before/after output equality,
including pre-fader sends, buses and master processing. Linked, portable and
IndexedDB recovery reopen also match exactly in that fixture. This is not arbitrary
plug-in or physical listening evidence. [Checked results](evidence/track-freeze.json).

Additional bounded follow-ups: allow saved Mix A/B restores to change only the
live frozen-track mixer fields while guarding baked fields; localize the frozen
track-package import guard; provide a specific preflight message for sub-10-ms
zero-tail renders. They do not affect the tested independent-track render path.

Validation for 0.13.43: **2100 frontend tests / 219 files**, production build,
final typecheck, lint and **24 Python release checks** pass. Focused freeze/
autosave/project checks pass **57 tests / 7 files**. Muted browser checks cover
built-in PCM parity, linked/portable/IndexedDB reopen, version-2-to-3 cache
migration with retained records and legacy-client rejection, forced autosave,
Undo/Redo, stale/cancel cases and German 390 px layout.
[Sanitized evidence](evidence/track-freeze.json). No native rebuild or physical
listening claim.

## Native freeze follow-up — 0.13.44

Frozen live state guards now live in a small dependency-free module, shared by
store protection and Mix A/B restore. Captured mix values can restore volume, pan,
mute and solo in one Undo without changing baked racks, clip gain or routing.
Package import guidance is localized. Sub-10-ms renders receive a specific
preflight error before allocating/rendering; add a short tail. This completes
the three small follow-ups listed at the preceding checkpoint.

The optional native harness is `scripts/test-native-track-freeze.mjs`, using
`scripts/fixtures/nativeFreezeBridge.mjs`. Supply explicit repo-built AU/VST3
helper paths, an SDK fixture folder, Playwright and Chromium through environment
variables. The bridge calls actual helper binaries, requires offline mode, bounds
packets/deadlines and kills/reaps only its own processes. It replaces Tauri IPC:
this is not native app/WebKit/signing/deadline or physical-device qualification.

Fixtures use saved state with no parameter overrides: SDK ADelay, Apple AUBandpass
and Apple AUPeakLimiter (nonzero reported latency). Compare production-graph wet
output with pre-fader freeze, then linked/portable reopen and thaw. Check sample
placement, post-clip delay tail, retained state and zero remaining helper sessions.
ADelay stores delay as float32 and floors it to samples; expected positions use
that quantization, not ideal double precision.

Next: full live source FX; extend native freeze qualification to mixed insert
chains, parameter automation, fault/cancel injection, more material/rates and
actual Tauri/WebKit. Remaining freeze topology/storage work stays in the backlog.
Do not infer completed N5 recording, physical listening or Store distribution.

The checked 0.13.44 native fixture has **zero sample difference** for all three
plug-ins before/after freeze and linked/portable thaw/reopen. ADelay tail peak is
0.2; AUPeakLimiter reports 96-sample latency and its impulse stays at frame 4090.
All 15 helper processes are reaped; registry is empty after 150 packet exchanges.
[Sanitized results](evidence/native-track-freeze.json). These are 48 kHz generated
fixtures over the test bridge, not native-app or physical acceptance.

A further state-only limiter run uses nondefault attack/release and −3 dB pre-gain.
Reported latency changes from 96 to **192 samples**; the impulse remains at frame
4090 and peak matches the independent −3 dB expectation. Freeze, linked/portable
reopen and thaw again have zero sample difference. Its seven additional helper
sessions close after 54 packet exchanges. See the nondefault run in the evidence.

Validation for 0.13.44: focused **25 tests / 4 files**, production build, lint,
**24 release checks**, native helper fixtures and the muted GUI regression pass.
The broad frontend run had **2101 passes and one 20-second timeout** in Timeline
export caching; rerunning that entire export file alone with the same limit
passed all **11 tests**. This suggests load sensitivity, not a reproduced functional
failure; do not describe the broad run as entirely green. Details are in the
[native freeze evidence](evidence/native-track-freeze.json).


## Continuous source filter — 0.13.45 checkpoint

`SourceFilter.ts` owns the persistent high-pass → low-pass → attenuating level
chain and smooth dry/wet bypass. `SourceLiveFilter.tsx` provides one collapsed
EN/DE section with editable slider numbers. SourceEditor routes its existing
source audition through the graph, updates parameters without replacing voices,
and closes every graph on Stop, end, source replacement, recording, arrangement
playback and unmount. Filter audition excludes click-repair context. Other preview
tools supersede the live filter. Native source controls now say Auto preview and
omit the duplicate numeric field beside each already editable slider.

Prepare stops audition, renders the same static graph, scatters joined selections
back into a source copy and publishes only if source/project/selection/settings,
recording and preview-generation guards still match. Cancel discards late output;
OfflineAudioContext itself is not forcibly terminated. Apply retains original PCM
and numeric recipe metadata in the existing one-Undo source edit path. No format
change. Source-rate rendering and a resampling live context need not be identical;
loops preserve filter history, unlike the first prepared pass. No automatic edge
fade/tail extension. Bounds: 8–192 kHz, mono/stereo selected channels, 120 seconds,
256 MiB estimated copies. Waveform/analysis update after Prepare, not each slider.

Next source tasks, in order:
1. Add versioned/cancellable background snapshots for live-filter waveforms; never
   overwrite a newer setting/selection or publish preview PCM into the project.
   Measure latency, peak memory and UI responsiveness on bounded larger fixtures.
2. Generalize the graph to a small ordered built-in chain with explicit dry/wet,
   latency/tail handling and render parity; keep compact controls and retained
   originals. Test disjoint selections, first/looped passes and resampling rates.
3. Add a persistent native source stream with latency-aligned dry/wet comparison,
   live parameter updates, helper fault/cancel cleanup and offline Apply parity.
   Reuse native graph ownership/contracts; do not rename rendered previews as Live.
4. Continue restoration detection/healing/drift qualification and the scoped freeze
   cases above. Physical N5 and the existing user question remain pending.

No native rebuild, app replacement, physical playback/mic check, tag or Apple
submission is part of this source checkpoint. Both running sessions stay intact.

Validation: **34 focused tests / 6 files**, production build, lint and **24 release
checks** pass. Muted browser qualification checks exact audition/static-render PCM
at 8, 44.1, 48, 96 and 192 kHz, an independent Butterworth response expectation,
live parameter updates with one voice/two persistent filters, smooth bypass,
unchanged excluded samples/channels, cancelled late renders, one-Undo Apply,
linked/portable reopen, graph cleanup and German 390 px layout. The existing
source A/B/matching browser regression also passes. [Sanitized results](evidence/source-live-filter.json).
Full frontend suite was not rerun; the preceding checkpoint's timeout/retry remains
recorded above. These checks do not establish physical listening quality or native
app/WebKit acceptance.


## Live-filter waveform snapshots — 0.13.46 checkpoint

`useSourceFilterWaveform.ts` keeps display-only PCM separate from audition/draft,
analysis, project and Undo. Request identity includes settings, channels/ranges,
channel, rate and project/source-map identity. Results display only for an exact
current request; Original bypass restores source immediately. Pending, unsupported,
over-budget and failed snapshots show labelled source fallback. `LatestPreview`
debounces 150 ms, permits one actual in-flight task and one latest replacement,
and waits for settlement even when Abort cannot stop Web Audio's native DSP.
Prepare pauses the queue and waits before allocating its render. Validation/copy
loops now check cancellation and yield between 64K-sample chunks when an 8 ms
work budget expires. The canvas inputs/selections are memoized so slider/playhead
rerenders do not repeatedly scan unchanged PCM. `drawSourceWaveform.ts` also
draws in cancellable 8 ms work slices to a temporary canvas and publishes only a
complete current frame; snapshot readiness includes drawing completion. This avoids
large redraws blocking the slider/transport while keeping zoom/selection geometry.

Automatic admission uses a **64 MiB allocation estimate** (including source-window
copy and scratch); explicit Prepare keeps the existing 256 MiB / 120-second bounds.
No global/resident-memory ceiling is claimed. Unselected channels/ranges remain
exact. Snapshots use the same static graph as Prepare, with empty initial history;
they do not visualize each loop's accumulated filter history, changing smoothing
transients or resampling differences. Analysis remains source-based until Prepare.
No project format, native logic, installation or Apple submission change.

Next source tasks:
1. Add a bounded ordered built-in source chain with compact controls, explicit
   bypass, latency/tail policy, retained originals and one-Undo Apply. Check DSP
   parity at several rates, disjoint selections and first/looped passes. Persist
   recipe order explicitly; the current single-filter parameter record cannot
   encode an ordered chain.
2. Add persistent native source streams with latency-aligned dry/wet, live
   parameter updates, fault/cancel ownership and offline Apply parity. Native
   source Auto preview remains rendered until those contracts are qualified.
3. Extend waveform qualification to source/window extremes, repeated edits and
   actual Tauri/WebKit on supported platforms. Measure OS resident peak memory
   and sustained responsiveness; allocation estimates exclude browser/native
   overhead. Native graphs cannot be forcibly stopped by Abort.
4. Continue restoration detection/healing/drift and remaining freeze topology/
   automation/fault cases. The existing .41 speech question and physical N5 remain
   pending; preserve both user app sessions and do not repeat hardware actions.

Validation: **40 focused tests / 7 files**, production build, lint (full run plus
final changed-file checks), **24 release checks**, muted live-filter GUI and
source A/B regression checks pass. Automatic and prepared canvas frames match;
Original restores source pixels; excluded PCM, retained originals, one-Undo Apply,
linked/portable reopen, unsupported multichannel fallback and German 390 px layout
pass. Cancelled drawing never publishes a partial/stale frame.

A generated 20-second 48 kHz stereo fixture admits **38,400,000 estimated bytes**,
runs at most one offline graph, and publishes only final settings after a burst.
The checked latest render took about **67 ms**; the full editor update took about
**362 ms**, including debounce. Neither measured phase recorded a browser long
task after warmup. Maximum heartbeat gaps were 13.4 ms for rendering and 61 ms
for the editor check. These are observations from one generated fixture, not
cross-device responsiveness or resident-memory guarantees. Broader sustained,
Tauri/WebKit and OS memory profiling remain open. [Sanitized results](evidence/source-filter-waveform.json).
Full frontend suite was not rerun; the preceding broad timeout/retry remains
recorded at its checkpoint. Both original running app sessions remain intact.


## Ordered source chains — 0.13.47 checkpoint

`sourceChainRecipe.ts` defines a version-1 ordered recipe of 1–6 stages, each with
stable ID, kind, enabled flag and value. Supported kinds are highpass/lowpass
(Butterworth Q), attenuating gain and hard clipper ceiling. IDs are unique and
bounded; kinds, count, version and finite parameter ranges are validated. Topology
keys use structured serialization, so separator-containing IDs cannot collide.
`SourceEdit.operations[].chain` stores the recipe on type `chain`; legacy filter
parameter records remain valid. Save/load and the shared recovery/freeze guard
validate active, comp-base and frozen retained source recipes. Project format is
unchanged because the clip plays derived PCM; older apps need not rerender recipe
metadata. Unsupported chain versions are rejected by current readers.

`SourceChain.ts` builds one static Web Audio graph, retaining bypassed stage
history. Value/bypass changes smooth AudioParams without replacing the voice or
nodes. Structural changes stop source audition in the host; direct graph topology
updates reject before mutation. No seamless graph replacement/state transfer is
claimed. Allocation failure disconnects owned nodes; Stop/recording/source changes
and unmount use existing graph ownership. The clipper uses gain → non-oversampled
identity WaveShaper clamp → reciprocal gain. Reciprocal exponential ramps avoid
boosting below-threshold audio during ceiling edits, including rapid changes. It
is a nonlinear peak cap, not a
lookahead/true-peak limiter. Changing order can change audio. No added lookahead,
appended tails or automatic selection-edge fades. Concatenated ranges and first/
looped-pass differences follow the existing source preview policy.

`SourceChainControls.tsx` adds a compact list, one expanded value at a time, bypass,
up/down/remove icons and an add selector. Arrange converts current filter values;
Add can convert and append in one action. Max six, at least one stage; keyboard and
touch use ordinary buttons, with no drag-only dependency. Existing automatic
64 MiB waveform budget and explicit 256 MiB / 120-second Prepare budget remain.
Display PCM never feeds back into the live chain. Apply retains original audio and
records the whole chain in one Undo step. Saved recipes are audit metadata, not
an automatic active rack on reopen: current audio is already printed. Recall/edit
from a retained base needs explicit design to avoid double processing.

Next, in order:
1. Persistent native source streaming: respect the selected output device and
   existing audio ownership; bound stream/clock lifecycle, align dry/wet latency,
   update parameters without helper rerenders, isolate fault/cancel,
   and verify offline Apply parity. Native source Auto preview is still rendered.
2. Broader built-in chains: EQ/dynamics and time effects need parameter schemas,
   latency/tail policy and real DSP/render tests. Seamless add/remove/reorder needs
   bounded parallel graphs, fades and state-history policy; do not just reconnect
   an active graph. Add presets/recall only with explicit retained-base semantics.
3. Continue repeated-drag/source-window extremes, sustained load, WebKit/iOS and
   OS resident-memory measurements. Keep physical N5, the existing .41 human
   question and remaining freeze/restoration topology/detection work separate.

No native rebuild, hardware action, installed app replacement, tag or Apple upload.
Both user app sessions remain preserved; private machine details stay ignored.

Validation: **53 focused tests / 10 files**, production build, lint (full plus final
changed-file checks), **24 release checks**, the new muted chain GUI/DSP harness
and the legacy filter/waveform browser regression pass.

At 8, 44.1, 48, 96 and 192 kHz, audition/Prepare have **zero sample difference** and
excluded ranges/channels remain exact. Independent gain/clip-order expectations,
per-stage/global bypass and quiet-signal rapid ceiling ramps pass; the latter's
maximum absolute error is about 5.36e-8 against a 1e-7 float tolerance. Automatic/
prepared canvas pixels match. One-Undo Apply, Undo/Redo, recipe order/original
retention, linked/portable embedded-source reopen, unsupported-version rejection,
recording-start node cleanup and German 390 px six-stage layout pass.

The generated 20-second stereo six-stage fixture admits **38,400,000 estimated
bytes** and keeps one offline graph in flight while publishing only newest settings.
The checked latest render took about **160 ms**, full editor update **448 ms**
including debounce; no browser long tasks were observed after warmup. Maximum
heartbeat gaps were about 20.2 ms for rendering and 61.5 ms in the editor. These
are fixture observations, not timing/resident-memory guarantees. No Tauri/WebKit
or physical listening claim. [Sanitized evidence](evidence/source-effect-chain.json).
Full frontend suite was not rerun; historical broad-run timeout/retry remains at
its checkpoint. No native rebuild, installation or Apple upload.


## Native source audition foundation — 0.13.48 checkpoint

Historical status: the measured AU offline parity blocker below is resolved by
0.13.49. Continue at the latest checkpoint; native streaming UI remains hidden.

`NativeSourceAudition.ts` is internal and **not wired into SourceEditor**. It
builds a private full-clip project with one enabled AU/VST3 insert, unity clip/
track gains and no arrangement FX, fades, automation or output limiter. Input is
mono/stereo, 8–192 kHz, at least 2048 output frames and at most 120 seconds, also
subject to a 256 MiB allocation estimate (five stereo float copies at the larger
source/resampled length). Invalid PCM/effect/control values reject before native
ownership. Window PCM and effect state are copied before asynchronous work;
original sources and the editable project are untouched. This is an allocation
estimate, not a resident-memory ceiling or responsiveness qualification.

The first comparison exposed the arrangement's -3 dB center-pan treatment of mono
sources. The adapter now duplicates mono before stereo balance, preserving its
source level. This does **not** establish that a mono plug-in and a dual-mono
stereo instance sound identical: AU bandpass currently demonstrates a difference.

The adapter reuses `NativePlaybackController`, the native output clock, existing
warm dry history/latency compensation and the backend's exclusive playback/input
owner. Default-device resolution follows the selected macOS output. It stops on
output-change events, cancellation, natural end and faults; restarts wait for old
preparation/cleanup. Parameters, bypass and attenuating monitor gain update the
same session; edits during preparation are published when it becomes ready. A
late failed update cannot stop a replacement. `NativePlaybackController.play`
now accepts an optional source/project validity predicate and passes it through
snapshot upload/start. The eventual UI owner must supply Abort/current identity,
poll and stop on recording/arrangement start, source/selection changes and close.
No persistent state capture or Apply behavior is implemented by this adapter.

### Acceptance blocker and next implementation

`scripts/test-native-source-plan.mjs` compares actual repo-built helper renders
(the existing source Prepare path) with the production offline native graph of
the new plan. It uses generated 48 kHz mono/stereo impulses/tones and saved state;
Node pipes replace Tauri IPC. No native output queue, microphone, user bundle or
real-time scheduling is used. Default execution is a **strict gate and currently
fails**. `CRISPAUDIO_NATIVE_SOURCE_CHARACTERIZE=1` emits measurements while keeping
`parityAccepted:false`; a successful characterization run is not parity acceptance.
Private helper/fixture/browser locations belong in ignored handover files.

Measured maximum absolute differences: VST3 ADelay **0** in mono/stereo, stereo
AUBandpass about **1.16e-38**, mono AUBandpass about **0.01110**, and mono/stereo
AUPeakLimiter about **0.14159**. Limiter reports **192 samples** and its compensated
onset is correct; VST3 delay has the independently expected 960-frame delay with
explicit 0.02 parameters. All six static bypass comparisons have **zero error**.
Every fixture session/helper is closed. The limiter amplitude discrepancy remains
unexplained; do not infer a particular cause or loosen the parity threshold.
[Sanitized measurements](evidence/native-source-plan.json).

Continue in this order:
1. Isolate AU source-render vs stream channel layout, format/parameter/state
   initialization and first-pass history. Compare the original-channel helper
   path with the stereo graph before choosing mono semantics. Inspect
   `media/apple/Plugins.swift` (`processPlugin` and `streamPluginBody`). Fix the
   cause or implement a shared stream-based Prepare path with explicit saved-state,
   sample-rate/channel, crop/tail and original-retention behavior. Keep the strict
   gate; extend it to changed parameters, rates and retained-state-only cases.
2. Qualify native-owned real-time source playback with an isolated silent/null
   output harness: first/looped pass, continuous edits, aligned warm dry/wet,
   latency changes, cursor/end, output changes, preparation/stop races and failures.
   Existing timeline qualification does not establish source preview/Apply parity.
3. Wire a compact opt-in source preview control into the **shared Source Editor
   Play/Stop**, with explicit rendered fallback. Preserve selected output, audio
   owner exclusion, lifecycle cancellation, no double processing, and one-Undo
   Apply retaining original/recipe. Initially restrict ranges/channels/topology to
   qualified cases. If a mono insert creates stereo output, define its audition,
   saved-source and channel-selection behavior before enabling it. Preserve monitor
   headroom for hot source/plug-in output. Add UI tests
   for recording, selection/project/source changes, another preview and unmount.
4. Continue broader built-ins, state-aware recipe recall, seamless topology,
   waveform extremes/load/resident-memory, restoration/freeze gaps and physical
   N5 as already scoped. The unanswered .41 speech check stays pending; do not
   repeat it or operate the user's hardware/app sessions.

Validation: **50 focused tests / 3 files**, production build, full lint and
**24 release checks** pass; details are recorded in RELEASE_STATUS. The optional native comparison
**has an open strict parity failure**; characterization records rather than
accepts it. No source UI behavior, native helper code/build, installed bundle,
hardware, tag or Apple submission changed. Both original app sessions are kept.


## AU source-window fidelity — 0.13.49 checkpoint

The 0.13.48 comparison blocker is resolved for its measured fixtures. The old
errors were concentrated at the clip end, rather than a general limiter gain or
mono/stereo plug-in incompatibility. `media/apple/Plugins.swift::processPlugin`
now reads bounded chunks until the **entire requested window** is present. A short
non-EOF `AVAudioFile.read` is valid and must not silently shorten scheduled input.
An incomplete read rejects. Reads never extend beyond the selected source window.

The helper schedules one source buffer with zeroed **reported latency + 4096
frames** of input padding. Keeping input supplied through the final downstream
quantum preserves pending output inside the compensated window. The writer still
emits exactly the requested source-frame count; no output tail or following source
audio is appended. This adds padding and one small read buffer, not a second full
source copy. The helper also connects the AU directly to its explicitly formatted
manual output: an implicit main mixer produced a -3 dB mono level change at
44.1 kHz in the expanded test. Rates are bounded to 8–192 kHz; zero/out-of-bounds,
huge offsets and oversized durations reject before integer conversion/allocation.
The binary stream host, native input/clock code and project format are unchanged.

### Evidence and reproduction

- Compile the **complete media helper**, not only an isolated AU entry point, with
  the recipe in `media/build.rs`, into a separate test directory. Preserve live app
  bundles and their helpers. Use an explicit `CRISPAUDIO_TEST_MEDIA_HELPER` path.
- Run `python3 scripts/test-au-source-window.py`: **52 cases, zero maximum sample
  error**, four invalid ranges rejected cleanly, every source window frame count
  exact and no remaining children. This uses Python standard library only, generated
  float WAV, actual Apple AUBandpass/AUPeakLimiter and binary stream DSP. Cases cover
  mono/stereo, 1/127/128/129/4095/4096/4097/16384 frames, 8/44.1/48/96/192 kHz,
  nonzero offsets with nonzero outside guards, EOF windows, and saved-state-only
  restore. Fixture latency reaches 768 samples at 192 kHz.
- Run the existing `node scripts/test-native-source-plan.mjs` with explicit helper,
  VST3 fixture folder and muted browser setup: **strict gate now passes**. AU/VST3
  mono/stereo comparisons are zero except stereo bandpass denormals around
  1.16e-38; all six static bypass comparisons remain exact. 18 stream sessions /
  102 packets complete, with zero remaining sessions/children. Keep the strict
  threshold; no characterization override is required.
- `scripts/test-source-plugins.mjs` now mutes Chromium and uses the current editable
  parameter number's accessible name (the old duplicate `… value` field no longer
  exists). Actual AU source-editor scan, parameter render, bypass, Apply, saved
  state, original retention and one Undo pass. The initial stale selector timeout
  was a harness issue, corrected before the final run.
- **50 focused frontend tests / 3 files**, production build, full lint, changed
  script lint and **24 release checks** pass. No broad frontend or Cargo app suite
  was rerun. Complete Swift helper compile passes with existing SDK deprecation
  notices. [Sanitized evidence](evidence/au-source-window.json). The prior .48
  failure measurements remain in their historical evidence file.

The temporary isolated AU harness helped diagnose the issue; final evidence uses
all production Swift helper sources and the real command dispatcher. Private
candidate paths/build logs stay in ignored local handover files. Neither active
app bundle was overwritten, re-signed, quit or relaunched. This is a source change,
not an installed update, native source UI activation or Apple submission.

### Continue here

1. Qualify `NativeSourceAudition` against the **native-owned real-time clock** with
   an isolated silent/null-output harness. Verify continuous parameter edits,
   aligned warm dry/wet, latency changes, first/looped history, cursor/end, device
   changes, faults, cancellation and close/replacement races. Offline exactness
   above is necessary groundwork and does not cover these timing contracts.
2. Define sample-rate semantics before UI exposure: `NativeTimelineSnapshot`
   resamples sources to **48 kHz**, whereas helper Prepare processes at source
   rate. The 52 per-rate comparisons use equal-rate render and stream paths; they
   do not compare native-owned 48 kHz audition to original-rate Apply. Adopt a
   common resampling/processing contract or initially restrict streaming to
   48 kHz sources. Do not silently claim parity across those different graphs.
3. Wire a compact opt-in control into shared Source Editor Play/Stop, retaining
   rendered fallback. Initially admit only qualified full-clip/rate/channel cases.
   Abort and join on recording/arrangement/other-preview/selection/project/source/
   close transitions. Define stereo effects on mono sources, monitor headroom,
   state capture, original retention and one-Undo Apply; test UI lifecycle and
   failure messages before enabling the control. Keep native streaming hidden
   until that bounded acceptance is complete.
4. Continue broader built-ins, base-aware recipe recall, seamless topology,
   waveform load/resident-memory and remaining restoration/freeze cases. Physical
   N5 and the unanswered .41 speech check remain separate and pending. Do not
   repeat the hardware question or operate the user's active app sessions.


## Native source null-output qualification — 0.13.50 checkpoint

The production worker, PCM consumer and cursor publisher in
`src-tauri/src/native_audio_clock/live.rs` are shared with a test-only output driver.
The normal `run` entry point still opens its selected hardware AudioQueue with two
buffers. The null driver is not a runtime option or Tauri command; it is reached
only by tests in `live/null_tests.rs`. The standalone
[scripts/native-source-clock](../scripts/native-source-clock/README.md) executable
imports these production modules, replaces device inventory with a panic and
AudioQueue creation with an abort tripwire. It builds current repository helpers
through the media crate and avoids a Tauri app/bundle rebuild. Reuse the existing
Cargo target; standalone build output is ignored.

Null consumption uses a nominal 512-frame / 48 kHz cadence and two synthetic
pending buffers. The real native worker, graph, helper transport and real-time
process/scheduling modes run unchanged. Cursor mapping uses the shared publisher,
including finite end and nonzero loop starts. It does not observe hardware time.
An already-cancelled worker now exits before scheduling/starting an insert; the
new pre-cancel test verifies no stream or output opens and shutdown completes.

**15 native tests pass**, including seven actual-helper cases: exact 16,385-frame
first/last samples through a 192-frame-latency AU (error 0), live parameter/bypass/
monitor changes with one helper, a 96-frame VST3 delay retaining history over six
loops, held worker/cursor and accepted controls during pause, helper-loss/cancel
cleanup, latency-change rejection with latched zero output, and pre-cancelled
preparation. Shared tests cover malformed/reentrant consumer calls, ring wrap,
concurrent publication, dry history, parameter restore and clock/end mapping.
Every owned helper is joined/closed. These are short known fixtures and steady
control windows, not general plug-in, click-free-transition or load guarantees.
[Portable evidence](evidence/native-source-null.json).

`NativeSourceAudition.play` now rejects non-48-kHz sources **before PCM allocation
or upload**. `nativeSourcePlan` remains 8–192 kHz for offline qualification, but
native-owned playback resamples to 48 kHz while existing helper Apply runs at the
source rate. A future common-rate contract may broaden admission. Do not remove
the guard merely because the per-rate offline cases pass. **51 focused frontend
tests / 3 files**, production build, full lint, Rust format checks and **24 release
checks** pass. Full frontend and full Tauri app Cargo suites were not rerun. No
source-editor streaming control or installed app was changed.

Continue in this order:
1. Connect an opt-in native mode to **shared Source Editor Play/Stop** with short
   localized controls/help and rendered fallback. Initially admit 48 kHz full-clip
   cases only; define stereo effects on mono sources before enabling that case.
   Keep waveform/analysis expectations explicit (existing native snapshots are
   rendered), source originals intact, and Apply one Undo step.
2. Join the native owner before recording, arrangement or another preview takes
   over. Cover preparation/close/replacement races, source/project/range/channel
   edits, locks, Apply/Reset, device-change events and unmount in actual UI tests.
   Existing adapter unit tests and the null driver do not test this Tauri/UI wiring.
   Use isolated null-backed IPC/UI tests with queue/device traps; the existing
   muted native Live harness still opens an AudioQueue.
   Ensure first-pass saved state/parameters match Prepare, capture state only under
   a defined quiescence contract, and preserve monitor headroom. Qualify real-time
   vs offline process-mode differences before widening plug-in/rate support.
3. Qualify actual Core Audio timestamps and device UID selection/change/hotplug,
   hardware pause/resume, WebKit, physical latency/listening and sustained load in
   an isolated candidate when appropriate. Null output does not cover these. Keep
   the existing unanswered .41 speech question and physical N5 separate; do not
   operate or rebuild the user's active bundles to obtain these results.
4. Continue broader built-ins, retained-base recipe recall, seamless topology,
   waveform extremes/resident memory and the restoration/freeze cases already
   scoped in this handoff and DAW_GAP_ANALYSIS. Preserve the CometBeat and
   CrisperWeaver product boundaries.

No installed bundle replacement/re-sign/relaunch, hardware action, tag or Apple
upload. Private compiler/fixture locations and process details stay ignored.


## Native source ownership handoff — 0.13.51 checkpoint

`NativeSourceOwner` reserves a source preview before upload and synchronously
revokes an outgoing owner. Its retained promise joins pending preparation and
output cleanup even after the component releases its lease. A stale release
cannot remove the replacement owner. A cleanup error keeps admission closed
rather than opening an overlapping output; reload is required after such an
unrecoverable join failure. The coordinator itself has no device APIs.

`NativeSourceAudition` registers its existing Stop/close implementation with that
owner, checks its lease during preparation and joins old output even when a
replacement request fails validation. Arrangement (native and compatible), native
and compatible recording, input preview/calibration, rendered source audition,
takes and Mix A/B now await the barrier. Existing generation/abort/project checks
suppress cancelled starts after the wait. Native Record waits before inventory
and microphone authorization; the controller also checks before snapshot upload.
This handles an outgoing source owner; it is not a universal audio-owner manager.
Reverse transitions still require the source UI to stop/join the arrangement and
exclude active recording/other previews before reserving a source.

The native source UI remains hidden. Continue with compact shared Play/Stop and
rendered fallback, initially 48 kHz full-clip qualified stereo sources. Define
stereo-effect/mono output and headroom policies, original/preview and live controls,
and first-pass saved-state Prepare/Apply parity before activation. Wire source
project/range/channel/lock/reset/Apply/unmount invalidation and test actual UI
through a null-backed isolated IPC bridge with AudioQueue/device traps. The Rust
null driver tests DSP/core, not Tauri IPC; the old muted live harness opens real
hardware and must not substitute for that bridge. Then qualify Core Audio clocks,
UID routing/hotplug, WebKit and physical/load N5 separately. Broader accepted
restoration, recipe recall, waveform/scale and freeze work remains scoped above.

Validation: **2,175 frontend tests / 230 files** pass (two workers, 20-second
per-test ceiling), including **70 focused tests / 6 files** for ownership,
source audition, recording and transport. Production frontend build, full lint
and **24 release checks** pass. Rust/backend source is unchanged; the 0.13.50
15-test null-driver result remains prior evidence, not a new run. No browser,
Tauri IPC or physical-device qualification was performed for this change.
[Source ownership evidence](evidence/native-source-owner.json).
No native app build/install, audio hardware, tag or Apple upload. Both running
sessions and the pending .41 human question remain unchanged.


## Source plug-in first-pass state — 0.13.52 checkpoint

`SourcePluginEffects` now treats the state returned by effect selection
(`plugin-info`) as the stable starting state. Each render copies the current
parameters and that base before awaiting work. Render-returned state may include
processing history; it no longer seeds another preview or the saved recipe.
The recipe stores the request's base state plus its explicit parameters, reported
latency and identity. Apply still commits the prepared PCM, retains the original
and adds one Undo step. Old recipe metadata remains readable; no format migration
or automatic reprocessing is introduced. Selecting saved settings passes both
state and parameters to `plugin-info` rather than trusting state alone.

A parameter edit aborts the current job and invalidates the old plug-in draft
immediately, so Apply cannot silently commit earlier parameter values. Late
metadata/errors cannot replace newer work. Publication checks cancellation,
parent selection validity, project identity, recording and source-buffer identity.
Disable/unmount cancel pending work; received preview files are removed in finally.
EN/DE help describes Auto preview as repeated rendering. The browser regression
now checks immediate stale-Apply removal, stable request/recipe state and replay
of the saved recipe against applied PCM. It waits for bypass rendering to finish
before inspecting Apply and uses accessible button locators. Initial harness
attempts needed that wait/locator fix and explicit focus with canonical decimal
input; the final AU/VST3 runs enforce the requested values before proceeding.

Validation: **2,188 frontend tests / 231 files** pass (two workers, 20-second
per-test ceiling), including **13 source plug-in component cases**. Production
frontend build, full lint, the changed browser-script lint and **24 release
checks** pass. Backend source is unchanged; Rust suites were not rerun. The actual
AU/VST3 browser checks above are offline helper qualification, not native IPC or
physical audio acceptance.
[First-pass evidence](evidence/source-plugin-first-pass.json). Native streaming UI is still hidden: the remaining
work is shared opt-in Play/Stop, reverse owner joining/exclusion, 48 kHz full-clip
stereo admission, monitor headroom, live/original controls and a null-backed IPC/UI
bridge with queue/device traps. This checkpoint defines rendered first-pass state;
it does not establish plug-in realtime/offline equivalence or state capture from
a running graph. Mono/stereo policy, source/range/channel/lock/reset/Apply/unmount
UI invalidation and real device/WebKit/load/N5 acceptance remain as scoped in .51.
Broader recipe recall from retained originals, source FX, waveform/scale,
restoration and freeze tasks remain accepted and open.

No installed app replacement, native build, physical audio action or Apple upload.
