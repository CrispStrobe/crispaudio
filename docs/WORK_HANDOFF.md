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
3. Continue task N4 below; N1–N3 are implemented as internal software paths. Keep architecture changes bounded and reviewable;
   update the acceptance evidence and this handoff at each checkpoint.

## What is ready

The installed baseline remains 0.13.33; source/local candidate 0.13.36 adds the
opt-in native recording preview described below. The established baseline includes timeline/video editing,
recording/takes/comping, compact recording controls and meters, source restoration,
FX-aware segment waveforms within documented limits, native Mac AU/VST3 playback
and a buffered native cue rack. The [README](../README.md) describes user features.
Do not reintroduce ASR/TTS creation or composition/instrument sequencing: these
belong to CrisperWeaver and CometBeat respectively. Imported audio/transcripts stay
editable. Existing MIDI utilities do not imply a MIDI expansion roadmap.

Native recording is now selectable on Mac under **Input → Mode → Native · Preview**
in the 0.13.36 candidate. Compatible remains the default. Physical qualification
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

N1–N3 are implemented internally. App integration and hardware qualification
(N4–N5) stay open; aligned interrupted-session recovery also needs a durable
output-clock ledger before it can be qualified. Dependencies and
completion boundaries are explicit; none of this enables the installed recording
path by itself.

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

Remaining N4 work:

- **Next: recovery UI and reconciliation.** The 0.13.36 internal backend now
  persists in-run output timing and recovers verified aligned prefixes (details
  below). Add a compact collapsed Recovery section/menu action, typed client and
  explicit preview/import. Filter by project ID, show missing/locked/unarmed
  targets, label takes incomplete, load every WAV before one editor transaction
  and one Undo. Preserve project-reference guards during async decode/resampling.
  Reuse the native loading/provenance adapter; do not duplicate timestamp maths.
- Reconcile `completed.json` groups separately: a crash after backend completion
  but before editor insertion needs no raw-prefix salvage. Validate with
  `group::load_completed`, avoid duplicate insertion across save/reopen, and keep
  recovery receipt identity out of private machine paths. Add import receipts or
  project provenance before marking anything handled; Undo must remain possible.
- Discovery currently caps at 512 root entries/64 candidates and reports
  `truncated`; add bounded pagination before claiming arbitrary archive coverage.
  Rejected/no-ledger groups remain raw-only and must never be auto-aligned.
  Recovery commands currently finish a bounded worker even if the inspector
  closes; add owned cancellation/status before exposing long recovery operations.
- Keep immediate Record/Stop, persistent GUI meters and a small settings dropdown.
  Advanced routing/inserts remain collapsed; show measured/configured delays
  honestly. Explicit monitor output and independent backing/cue controls are now
  implemented; hardware routing/latency acceptance remains N5. Wet capture must
  retain dry originals.
- Qualification must include cancellation while helpers are opening, independent
  cue/backing levels and recorded WAV inspection. Preparation checks cancellation
  between bounded helper/graph startup steps; it is not an instant-cancel promise.
- Done when desktop/touch tests cover arm/record/stop/cancel, device selection,
  cue fault recovery, compact layout, save/reopen and one-action group Undo.

### N5 — Physical and release qualification

- Built-in microphone recording and playback were accepted on the existing app;
  that does not qualify the new native path. Test it separately once N1–N4 work.
- Measure physical round-trip/placement, long/load/background behavior, output
  switching, sleep/wake and hot-plug. External interfaces/webcams, commercial
  plug-ins and physical iOS require those devices/platforms to be available.
- Replay complete audio-only, audio/video and recording/comping sessions; inspect
  saved/exported files, not only previews. Test signed/sandboxed relaunch and access.
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
| Source FX and restoration | Full live source FX; automatic A/B loudness matching; click detection, spectral healing/inpainting and de-hum drift tracking | Retain originals; cancellable preview, one-Undo Apply; quantify signal damage and improvement and listen to varied real recordings |
| Effect-aware waveforms | Native inserts, longer clips, scalable caches and clearly scoped track/bus/master display | Reject stale renders; bounded memory/work; explain preview scope; preserve responsive continuous edits |
| Monitor/routing depth | Arbitrary input maps, independent headphone mixes, PFL/AFL, dim/mono and retained-dry wet capture | Explicit feedback-safe routing and measured delay; fixture tests followed by actual hardware |
| Freeze/render in place | Reversible clip/track render, tails, routing semantics and DSP release | Source/rack retained; unfreeze restores state; audible/export parity and Undo/reopen |
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
