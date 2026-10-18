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

The installed/local software baseline is 0.13.33. It includes timeline/video editing,
recording/takes/comping, compact recording controls and meters, source restoration,
FX-aware segment waveforms within documented limits, native Mac AU/VST3 playback
and a buffered native cue rack. The [README](../README.md) describes user features.
Do not reintroduce ASR/TTS creation or composition/instrument sequencing: these
belong to CrisperWeaver and CometBeat respectively. Imported audio/transcripts stay
editable. Existing MIDI utilities do not imply a MIDI expansion roadmap.

Native recording work after 0.13.33 is **internal, not connected to the app**:

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
adapter converts the complete set into one project transaction; app commands/UI
do not call it yet. None of this
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
or a shipped latency promise; see N5 before enabling it in the app.

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

### N4 — App integration and native recording UX

- Add app commands and select the native path only where its platform/routing
  contract is supported; preserve the working recording path during rollout.
- Keep immediate Record/Stop, persistent GUI meters and a small settings dropdown.
  Advanced routing/inserts remain collapsed; show measured/configured delays
  honestly. Add independent cue/backing mix, headphone routing and monitoring
  controls without adding a wall of text. Wet capture must retain dry originals.
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

The timing checkpoint adds nine Rust and five frontend tests. Full media suite:
**308 passed, 16 ignored**. Explicit native-input suite including SDK VST3 and
child-process fixtures: **143 passed**. Frontend: **2025 passed across 208 files**;
full lint and production build pass. SDK C ABI syntax and changed formatting/diff
checks pass. See [timing scope](evidence/native-recording-timing.json) and the
[preceding ownership scope](evidence/native-monitored-recording.json).
No physical microphone/output was opened. App Rust, simulator, bundle, installation
and Apple upload were not rerun for these unused internal paths. Installed 0.13.33
is unchanged; the earlier app Rust result (39 passed, one ignored) is historical.

Portable commands (use a configured Rust toolchain):

```sh
cargo test --manifest-path media/Cargo.toml --features native-engine --lib --locked -- --test-threads=2
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked -- --test-threads=2
```

Hardware/optional plug-in fixtures remain separate tests with explicit prerequisites.
Do not rerun audio-producing tests or overwrite user sessions merely to refresh a
handoff. Check live CI instead of inheriting historical green claims.
