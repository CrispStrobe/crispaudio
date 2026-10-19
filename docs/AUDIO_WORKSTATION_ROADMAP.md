# Audio workstation roadmap

Accepted 19 October 2026. Work proceeds in the order below. This is the remaining
product scope, not a claim that the features or platform checks are complete.
Use [WORK_HANDOFF.md](WORK_HANDOFF.md) for the current source checkpoint and
[DAW_GAP_ANALYSIS.md](DAW_GAP_ANALYSIS.md) for the comparison with other editors.

CrispAudio owns recording, audio editing/restoration, mixing, delivery and sound
for video. Composition, instruments and sequencing belong to CometBeat. ASR/TTS
creation belongs to CrisperWeaver. Imported audio and timed transcripts remain
editable. Preserve the compact interface: direct controls for common jobs;
context/desktop menus and collapsed sections for advanced settings; equivalent
reachable touch actions and accessible numeric entry.

Source progress **0.13.67** adds bounded ordered replay for verified mixed source
histories: saved external effects plus basic audio/channel tools, explicit effect
selection, per-operation windows and one owned replacement/Undo. Initial limits are
eight operations, a 30-second first window and 44.1/48-kHz mono/stereo within the PCM
budget. Legacy/retimed and chain/restoration histories stay gated. Next: qualified
legacy migration, ordinary source-preview owned staging and deliberate admission
expansions; the remaining workstation/platform phases stay open.

Source progress **0.13.66** captures complete window coordinates for new source
operation histories and validates retained PCM on save/reopen/recovery. Later trims
preserve earlier full windows. This is mixed-replay groundwork; processor replay,
selection and qualification remain open, and insufficient legacy histories stay
gated. [Contract](SOURCE_EDIT_JOURNALS.md), [current handoff](WORK_HANDOFF.md).

Source progress **0.13.65** adds editable masks for the saved single-effect slice:
exact/disjoint sample ranges, all/individual channels and saved/clip/full-window
presets. Full-window original rendering, outside dry PCM, one Undo/Redo and portable
reopen remain the contract. Mixed replay still needs explicit operation-window
provenance; Native recall/admission and the rest of the workstation roadmap remain
open. See the current handoff for scoped acceptance criteria.

Source checkpoint **0.13.64** adds a first saved-effect recall slice: a single
plug-in operation reprocesses the retained original full window, with Rendered
preview, trimmed history, one Undo/Redo and owned file publication. Mixed journals,
new range/channel editing and retimed clips remain gated until replay and coordinate
mapping are defined. Other native admission expansions remain separate. Continue
from the current handoff; this does not complete the workstation roadmap.

Source checkpoint **0.13.63** adds automatic bounded native FX waveform snapshots
without restarting the running graph. These are fresh source-rate renders, separate
from instantaneous 48-kHz output, analysis and Apply. Next independent source work
is original-based recipe recall; format/channel/range expansion still needs its
own evidence. See the current handoff for ordered acceptance criteria.

## 1. Native runtime acceptance

Source .58 qualifies real-Wry snapshot IPC/events; .59 qualifies actual commands
with native worker/DSP through MockRuntime. These are separate results. Full Wry
playback/product integration and physical checks remain open; independent source
editing work can continue meanwhile.

- Qualify actual Wry/WebKit raw snapshot IPC, argument rejection, cross-window
  ownership, window destruction and app exit using an isolated debug executable.
  Keep the installed app and the recording preview sessions intact.
- Qualify combined real command ownership and production DSP with an explicit
  test-only null sink and hardware tripwires. Existing mock IPC and UI/Rust bridge
  runs remain separate evidence until this combined path is tested.
- Finish physical N5: listening, capture/placement, device changes/disconnect,
  helper loss, sleep/resume, sustained load, actual interfaces and platform builds.
  Built-in compatible recording works; that does not qualify every native path.

Acceptance: no stale owner can publish/use a snapshot; close waits for admitted
workers, releases resources and reports faults. Separate software, WebKit,
signed/sandboxed and physical evidence. Keep Rendered default and Native opt-in
until the relevant admission paths are qualified. Physical checks do not block
independent software work; do not repeat an unanswered recording question.

## 2. Complete source-effect editing

- Whole mono/stereo 48 kHz audition is admitted in 0.13.60; one contiguous
  selection follows in 0.13.61, and 44.1 kHz in 0.13.62. Broaden further rate/
  multiple-range/channel cases, with state, latency, first-pass, loop and Apply parity
  tests before enabling each case. Keep arbitrary unsupported formats rejected.
- Add bounded effect-aware native waveform snapshots with stale-generation
  rejection. Distinguish source/processed snapshots from instantaneous monitor
  output and track/bus/master scope. Preserve responsive sliders/playback.
- Recall printed processing recipes and reprocess from retained originals,
  rather than cumulatively applying the same chain to already processed samples.
- Broaden useful effect chains and live parameters; reduce unnecessary restarts.

Acceptance: position-preserving Original/Processed comparison, monitor gain excluded
from Apply, correct restored state and effect tails, retained originals, one Undo,
reopen/Redo, bounded memory and cancellation. Include desktop and narrow/touch UX.

## 3. Large recordings and sessions

- Measure current decode/resident memory, waveform generation, seek preparation,
  edit time, dropout behavior and project reopen on representative sessions.
  Define explicit memory/seek budgets before redesigning the engine.
- Implement disk-backed/paged PCM access and bounded read-ahead rather than
  loading every source into GUI memory. Own cancellation and file access per job.
- Build multiresolution waveform caches with source/content identity, invalidation,
  bounded disk use, missing/corrupt cache recovery and background prioritization.
- Extend native snapshots and freeze beyond current bounds only with streaming
  ownership and measured guarantees. Preserve sample positions and FX history.

Acceptance: long-source fixture plus multitrack audio/video session; published
memory/seek results, deterministic output/edits, responsive cancellation and reopen.
Keep generated fixtures temporary and bounded; no large committed media or second
build/toolchain cache. Sparse/synthetic measurements are not listening evidence.

## 4. Monitoring, routing and plug-ins

- App-local output selection; explicit input-channel maps; independent headphone/
  backing mixes; lower input monitoring delay with reported buffer/plug-in latency.
- Listen before/after fader, dim/mono and feedback-safe cue routing. Preserve dry
  takes; make wet-capture choices explicit and latency-correct.
- Custom Mac plug-in windows, state/preset roundtrip, missing/crashed plug-in
  recovery and broader commercial plug-in qualification.
- Broader live automation and reliable compensation across supported clips,
  tracks, sends, buses, sidechains and changing plug-in latency. Existing routing,
  compensation and automation are partial foundations, not missing wholesale.

Acceptance: rendered/live agreement, no double delay/processing, window/helper
cleanup, owned devices, independent cue levels and dry capture surviving cue faults.
Use software fixtures first; external hardware and each platform need separate checks.

## 5. Session efficiency and delivery

- Searchable local file/region browser with cancellable audition; portable session
  templates; project snapshots/version comparison and useful navigation.
- Reference-aware asset cleanup covering saved, unsaved, recovery and Undo/Redo
  ownership. Never infer unused from current project, file age or location alone.
- Extend existing bounded freeze/thaw to linked/grouped/ducked and bus workflows,
  streaming renders and frozen-package remapping. Keep sources/racks/tails intact.
- True-peak limiting, dither/noise-shaping choices and systematic resampling/
  stretch-quality checks; predictable region/stem delivery using existing exports.
- Define CometBeat stem/timing/marker roundtrips; keep word-preserving transcript
  export changes in CrisperWeaver when that is the missing side of the contract.

Acceptance: complete audio-only, recording/comping and video jobs through save,
linked/portable reopen, missing-media recovery and inspection of exported files.
No duplicate processing, lost originals, unsafe cleanup or mislabeled metering.

## 6. Restoration and recorded-audio timing

- Automatic click detection, conservative spectral healing/inpainting and hum
  drift tracking, with varied real recordings and audible A/B evaluation.
- Transient/warp markers, tempo maps and grouped timing edits for recorded audio.
  Define phase-coherent multichannel behavior before exposing group operations.

Acceptance: quantify improvement AND damage to wanted audio; keep cancellable
preview, retained originals and one-Undo Apply. Timing changes preserve deliberate
links to video, markers/transcripts and phase relationships. No new composition
or speech-generation environment is implied.

Every checkpoint updates its evidence, handoff and release status. Main-source CI
success does not mean an installed app, TestFlight build or Store release is current.
