# Engineering checkpoint and remaining work

Updated 2026-10-17. This is the entry point for a fresh agent. The active product
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
3. Continue task N1 below. Keep architecture changes bounded and reviewable;
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
| Mac output | `native_input/macos/playback.rs` | One cue scheduler, explicit device UID, silent priming/arming, watchdogs and guarded shutdown |
| Shared cue/backing mixer | `native_input/mix.rs` | Up to 16 lanes, independent gain/balance/mono, 64-frame control ramps, separate cue/backing failure domains |

The last two components are **not wired together**. The group manifest is not a
project transaction and contains no qualified arrangement placement. None of this
establishes physical latency, sustained-load stability or independent-device sync.
See [NATIVE_INPUT.md](NATIVE_INPUT.md) for contracts and evidence links.

## Next implementation sequence

All items below remain open. Dependencies and completion boundaries are explicit;
accepted scope is not a claim that every item can be finished in one session.

### N1 — Shared hardware output and backing worker

- Integrate `Mixer` with the Mac output adapter while retaining silent priming,
  one-time hardware anchor binding, reentrancy guards and safe disposal.
- Render `native_graph::Graph` and native inserts on a worker. Supply tagged,
  bounded backing blocks to the output callback; no helper IPC, allocation, file
  work or application locks on that callback. Define queue budgets and underrun policy.
- Hand off bounded control updates to the exclusive render owner. Keep cue levels
  independent of arrangement faders; make device routing app-local, explicit and
  without silent fallback or global device/rate changes.
- Done when generated multi-input/backing tests verify exact timing across unequal
  blocks, ramped controls, EOF, startup deadlines, overload, clock discontinuity,
  cancellation and device loss. Existing output lifecycle tests must remain valid.

### N2 — Coordinated preparation, arming and failure ownership

- Separate file/helper preparation from capture start; the current session API
  combines these. Prepare the whole group and output before arming on one clock.
- Define one owner for capture, backing worker, cue workers and output lifetime;
  rollback partial startup and quiesce callbacks before joining workers.
- Cue-only failure may mute cue and preserve dry capture. Backing/output clock
  loss during synchronized recording must produce an explicit incomplete result;
  never publish apparently aligned clips merely because dry files survived.
- Done when failure injection at every startup/stop boundary retains recoverable
  originals, releases helpers/budgets and never publishes a partial complete group.

### N3 — Persist timing and commit takes to the project

- Persist input/host/output/project anchors, timebase and boot/session context,
  pre-roll/punch/loop pass placement and the meaning of compensation values.
- Distinguish input capture timing from cue/plugin/output delay; monitoring delay
  is not automatically recording-position compensation. Detect clock drift; define
  a correction strategy or reject unsupported device combinations explicitly.
- Convert a validated whole-group manifest into one project insertion/Undo action;
  support save/reopen and interrupted-session reconciliation without losing originals.
- Done when generated impulse/clock traces verify sample placement, negative
  pre-roll, multiple takes and loop boundaries, drift rejection, Undo and reopen.
  Keep recovery-format changes versioned/backward-compatible.

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

Code checkpoint: `962cc74` (shared native mixer). Full media suite: **278 passed,
16 ignored**. App Rust suite: **39 passed, one ignored**. Formatting and diff checks
passed. Six new mixer tests use generated PCM, without physical input/output.
See [mixer evidence](evidence/native-shared-mixer.json). No frontend, simulator,
bundle, installation or Apple upload was performed for this internal increment.

Portable commands (use a configured Rust toolchain):

```sh
cargo test --manifest-path media/Cargo.toml --features native-engine --lib --locked -- --test-threads=2
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked -- --test-threads=2
```

Hardware/optional plug-in fixtures remain separate tests with explicit prerequisites.
Do not rerun audio-producing tests or overwrite user sessions merely to refresh a
handoff. Check live CI instead of inheriting historical green claims.
