# CrispAudio — Active roadmap

Updated 2026-10-09, during local 0.8.5 implementation. This section is the current plan.
The implementation records below are historical; their old priorities, missing
feature lists and test counts do not describe the current application.

## Current requested milestone: ASR and spoken-word editing

Implemented local 0.8.5: desktop CrispASR adapter, mix/microphone choice, German
forced word alignment, spoken-word deletion across all sound/picture, frame
coverage, undo/save/load, CLI transcription and word recipes. See
[Speech editing](docs/SPEECH_EDITING.md) for scope and real interview checks.
This fulfills the newly requested speech-editing increment; it does not complete
the remaining DAW/video roadmap. Embedded/mobile ASR, multiword text selection,
inline re-alignment after text correction and speaker-aware editing remain future
extensions. Existing priority/deferred paging decisions below remain in force.

## Product direction and priority decision

Build a useful general audio and video editor in complete, reviewable increments.
The first target is recording, arranging, mixing and finishing interviews,
voiceovers and short videos, with SFX/Voice integrated into the same project.
Grow toward music-production DAW workflows afterward. This ordering reflects our
current footage and feature base; it is not a claim of parity with an established
DAW or NLE.

**Long-recording import/playback optimisation is recorded but deferred.** The user
does not currently regard it as urgent. Native exports already stream the mix;
additional format/export milestones and a disk-paging rewrite must not displace
core editing, mixing and picture tools. Fix reproducible crashes, data loss or
incorrect results as part of the affected feature, even when performance work
is deferred. Reconsider paging only if measured memory/latency blocks the actual
projects needed for a milestone.

## Evidence and existing baseline

Verified by inspecting the current data model, editing helpers, timeline workspace,
playback/render paths and native media backends. Existing capabilities include:

- Audio tracks; multiple picture sources on **one** composition lane; linked AV
  groups; move/split/trim/slip; copy/cut/paste; basic all-track range ripple deletion.
- Clip/track fades, reviewed audio crossfades, picture transitions, source offsets,
  magnetic/grid snapping, frame/sample nudges, markers, editable POS/canvas length.
- Track gain/pan/mute/solo; gain automation points and waveform overlay; nine
  built-in clip/track/master effects. Voice processing can return to a timeline clip.
- Media bin/inspector, offset/drift analysis, reviewed microphone switching,
  transcript import/edit/navigation/export, basic picture orientation and colour.
- Save/load, linked/portable audio projects, recovery and relinking; native Mac
  WAV/FLAC/AAC/M4A and MP4/MOV paths; optional installed FFmpeg compatibility.

These are foundations to extend, not features to reinvent. In particular,
Range edits preserve unaffected picture transitions and reject boundaries through
a blend pending advanced trim semantics; gain automation has point
entry rather than a full direct-edit lane; `project.video.clips` is a single
composition lane; timeline effects lack parametric EQ, a dedicated limiter,
sends/buses and general parameter automation. Timeline recording/takes are not
implemented. SFX/Voice recording elsewhere does not fulfil that requirement.
Several older workflow documents describe superseded layouts/limits; update the
relevant document with each milestone rather than treating it as current evidence.

Established-product references used to organise the gaps:
[REAPER's recording, routing, automation and takes](https://www.reaper.fm/about.php),
[REAPER User Guide](https://www.reaper.fm/userguide.php), and
[Resolve's editing, trim, layered picture, titles and multicam workflows](https://www.blackmagicdesign.com/products/davinciresolve/edit/).
This roadmap's priority ordering is our product judgement, not a ranking from
those sources or an instruction to reproduce their entire UI.

## Order of importance

| Order | Feature gap | Why it matters |
|---|---|---|
| 1 | Complete range/trim/ripple editing and track protection | Cutting, rearranging and tightening material is the central editor workflow. |
| 2 | Proper mixer, parametric EQ, limiter, metering and editable automation | We must be able to balance and finish the sound, not merely apply effects. |
| 3 | Stacked video tracks and basic compositing | B-roll, overlays and picture-in-picture require more than one picture lane. |
| 4 | Titles, lower thirds, still images and real caption tracks | These are essential deliverables for interviews and short videos. |
| 5 | Timeline recording, monitoring, punch/loop and takes | Import-only editing is insufficient for a recording DAW and voiceover workflow. |
| 6 | Non-destructive speed/time/pitch tools | Needed for timing corrections, slow motion and arranging recorded material. |
| 7 | Multicam and deeper transcript-based editing | High value once the underlying timeline and picture stack are mature. |
| 8 | Delivery presets, stems, queue and project interchange | Enables repeatable finishing and collaboration with other tools. |
| 9 | Long-recording performance and additional streaming codecs | Important scaling work, deliberately deferred behind usable editing features. |
| 10 | Music sequencing, MIDI/instruments and plugin hosting | Required for broad music DAW parity, but a separate substantial product expansion. |

## Implementation roadmap

M1 is in progress; M2–M10 remain planned. Deliver small slices in the listed
order; update this plan with actual completion and validation evidence. Do not
assign release numbers or dates before the work is scoped. Desktop implementation,
web fallback and iOS support/device validation must be recorded separately.

### M1 — Make everyday timeline editing complete (in progress)

Local 0.8.0 implements the first slice: saved independent time ranges, ruler
selection/handles/numeric bounds, selected-range playback and loop boundaries,
contextual help/EN–DE/macOS playback commands, and persisted audio/picture clip
locks enforced on direct/linked edits and CLI recipes. Range shading covers audio
and picture. Local 0.8.1 adds reviewed scoped lift/extract/insert-gap, saved ripple
participation, linked scope checks, automation boundary values and explicit
canvas/marker/transcript retiming, with GUI/CLI parity and undo validation.
Unaffected picture transitions remain; boundaries through blends or transcript
cues require review rather than silently damaging them. M1 is not complete:
advanced transition trims and slide editing remain.
Local 0.8.2 adds explicit selected audio-range export with full DSP preroll,
native bounded output, CLI audio/video export bounds and a reviewed action to
reuse the selected range for picture export. Real interview WAV samples match
the full mix slice; WebKit preserves delay history and exact sample counts.
Local 0.8.3 adds reviewed rolling cuts, ripple trims and trim-to-playhead with
source-handle/link/lock checks, edit-point navigation and macOS commands. GUI/CLI
parity covers eight cases; real linked Canon/H6 trims were rendered. Rolling
requires abutting cuts, not blends. These conservative limits remain explicit.
Local 0.8.4 adds named edit groups distinct from AV links, a persisted grouping
toggle, independent clipboard/track-import copies, and command search with
shortcut hints. Grouped scopes/locks are enforced in GUI and CLI; WebKit covers
group controls, command execution and German phone-sized layouts. Snap targets
exclude moving group members. These additions do not add effects or mixing routes.
Loop restarts use the existing frame-driven scheduler; this is not sample-accurate
seamless musical looping. Paging and new codec work remain deferred.

1. Add explicit **time-range selection**, with range handles and a visible choice
   between clip selection and range selection. Reuse the existing selection model.
   Play/loop/export a selected range; clear it without losing clip selection.
2. Introduce track lock and explicit ripple participation/sync-lock. Locked tracks
   cannot be moved, trimmed, split or deleted by indirect edits; explain any blocked
   operation. Define how linked groups interact with locks before exposing controls.
3. Extend existing ripple deletion to lift versus extract, close-gap and insert-gap
   operations, with selected-track/all-participating-track scope. Handle transition
   boundaries and retime automation, markers and transcript cues deliberately.
   Do not silently discard those objects or require all transitions to be removed.
4. Add rolling trim (adjust a shared cut while keeping total length), ripple trim,
   trim-to-playhead and previous/next edit navigation. Keep slip editing visible;
   add slide after rolling/ripple semantics are stable. Show source handles and
   limits while dragging, with numeric/frame/sample control in the inspector.
5. Add persistent named edit groups distinct from AV source links, and a simple
   command search/shortcut reference for these actions. Keep common actions in the
   timeline/context menus and macOS menus; use the existing inspector on touch.

Completion example: remove an interview digression and tighten a cut with the
camera and two microphones in sync; music may stay fixed or ripple by explicit
choice. Preview, range export, save/reopen and undo/redo preserve the same result.
CLI recipes expose deterministic range/trim/ripple operations where applicable.

### M2 — Make sound mixing a first-class workflow

1. Add a dockable mixer with track/master strips: peak/RMS meters, peak hold,
   clipping indication, dB faders, pan, mute/solo and inserts. On phones/tablets,
   show a focused strip or horizontal strip list rather than shrinking everything.
2. Add graphical parametric EQ (high/low-pass, shelves and bell bands) and a
   dedicated output limiter. Show compressor gain reduction. Keep current saved
   effect presets compatible; define effect order and latency explicitly.
3. Turn existing gain automation into directly editable lanes: add/move/delete
   points, numeric edits, curves and safe copy/retime. Extend to pan and selected FX
   parameters, then Read/Touch/Latch/Write modes with visible protection against
   overwriting an envelope accidentally.
4. Add buses and sends: start with track-to-bus routing and shared reverb/delay;
   specify pre/post-fader sends and feedback-cycle rejection. Sidechain/ducking
   follows the routing model; it should not be an unrelated special-case graph.
5. Add master loudness/true-peak readout and a target-based finishing action with
   a reviewable result. Keep existing microphone automation and loudness analysis
   integrated rather than duplicating them.

Completion example: balance question/answer microphones, EQ both, automate level,
add shared room reverb and export a controlled mix. Playback and supported native
renders use the same routing, automation and effects, with meaningful audio checks.

### M3 — Allow layered video and basic compositing

1. Migrate the single picture lane to ordered video tracks, reading all existing
   projects unchanged. Persist order, visibility, lock, linked audio and clips;
   update editing/selection/overview/serialization before adding compositor effects.
2. Implement top-down picture composition with opacity and normal alpha blending,
   gaps, independent lane overlaps and transitions. Preview and native exports must
   interpret the same stack. Remove the current two-picture/single-lane assumptions
   only when the new renderer supports those cases.
3. Add position, scale, crop and rotation controls with handles in the viewer;
   then keyframes for transform/opacity. Start with ordinary linear interpolation
   and extend to easing. Retain source orientation and frame-accurate timing.
4. Add source preview with source In/Out, insert/overwrite and append actions,
   reusing the media bin. Support silent picture imports. Make project resolution,
   frame rate and aspect ratio explicit, including portrait output.

Completion example: add B-roll above the interview, a picture-in-picture shot and
an opacity fade; reopen and export the same composition without moving its sound.

### M4 — Finish videos with titles, graphics and captions

1. Add still-image clips and a text/title track: editable text, font/size/alignment,
   colour/background, safe-area guides and a small set of lower-third templates.
2. Add a distinct caption track with timed cue editing and preview. Reuse existing
   transcript exchange; transcript text and delivery captions are related objects,
   not automatically the same artifact. Support SRT/VTT export and optional burn-in.
3. Add simple keyframed title position/opacity and reusable title presets. Validate
   wrapping, DE text, missing fonts and touch editing at the target output size.

Completion example: deliver the interview with speaker names, opening/closing title
and corrected German captions. Native picture export includes the selected text
and graphics; sidecar captions remain separately available.

### M5 — Record directly into the arrangement

1. Add timeline track arming, input device/channel selection, input meters and
   explicit monitoring state. Record at the playhead with a count-in, preserve
   original captured media and allow immediate playback/undo. Begin with one input
   track; simultaneous multi-input recording requires platform-specific validation.
2. Add recording latency calibration/placement and dropped-frame/device-change
   reporting. Ensure monitored sound is not recorded again as an unintended loop.
3. Add punch In/Out and loop recording; store passes as takes, then take lanes and
   comp regions with adjustable crossfades. Keep the source takes recoverable.
4. Add appropriate macOS menu/keyboard/touch controls; document mobile permission,
   interruption and background behaviour only after device testing.

Completion example: record a voiceover with the attached USB microphone over an
existing scene, replace a sentence by punch-in, choose the best take and export.

### M6 — Change timing without destructive round trips

1. Add explicit clip playback rate and reverse, with linked AV time mapping and
   source bounds. Distinguish changing speed/pitch together from preserving pitch.
2. Add pitch-preserving stretch for audio and explicit pitch transposition; use
   cached derived media if needed, retaining the original and the editable settings.
3. Add video speed changes and later speed ramps. Define frame duplication versus
   interpolation clearly; optical-flow slow motion is a later quality extension.
4. Keep automation/fades/source offsets and linked clips correct under rate changes;
   expand precision/sync tests and CLI recipe/export support alongside the GUI.

Completion example: retime a scene and its linked sound, adjust a voiceover to fit,
then revert the processing without losing the original source.

### M7 — Multicam and transcript-driven interview editing

1. Build a multicam clip/group using saved sync results and the layered picture
   model. Display angle previews and switch angle at the playhead while keeping
   continuous independently mixed microphone sound.
2. Separate source transcript timestamps from edited-timeline cues. Add word-level
   selection/search and a reviewed proposal to lift/extract selected speech; reuse
   M1 edits so picture, linked sound, markers and automation remain consistent.
3. Add scene/section organisation, transcript correction and speaker labels;
   retain human review for ambiguous microphone/speaker/angle decisions.
4. Integrate CrispASR through an explicit CLI/backend contract when transcription
   is added. Do not create a new shared cross-app engine just for this integration.

Completion example: shorten a multi-angle interview by transcript selection and
choose shots while preserving the reviewed Tr1/LR microphone mix.

### M8 — Repeatable delivery and interchange

1. Add per-export settings/presets for resolution/frame rate, range, audio layout,
   codec/quality and caption delivery. Do not hide all delivery choices in global
   defaults. Validate before rendering and explain unsupported platform choices.
2. Add track/bus stems, selected-clip exports and a cancellable render queue with
   clear progress, output paths and retry. Reuse current job ownership/publication.
3. Add collect/copy project media and portable project packaging with missing-media
   review. Extend current relinking/recovery rather than replacing it.
4. Add interchange incrementally: first an honest cut-only EDL/OTIO-style subset,
   then broader exchange if licenses and mappings allow. Report omitted FX/routing/
   titles; never present a lossy interchange as a complete project round trip.

Completion example: deliver a landscape/portrait version, caption sidecar and
separate dialogue/music stems from one saved project, with reproducible settings.

### M9 — Deferred scaling and codec work

This records the previous performance proposal; it is not the next priority.

1. Measure real Canon/H6 import time, peak memory, waveform readiness, seek latency
   and playback stability, including reopen/recovery. Establish actual constraints.
2. Add native chunked decoding, cached multiresolution waveform peaks and bounded
   audio read-ahead around the playhead for linked desktop sources. Adapt import,
   project loading and recovery together; retain browser/in-memory paths.
3. Validate crossfades, FX history, seeking and AV synchronization with the paged
   path. Share the source/routing contract with the existing native mixer; no need
   for a separate shared cross-application engine.
4. Extend MP3/Opus streaming only through a genuine incremental encoder/container
   API; the existing whole-buffer Glint call is not streaming. A bundled permissive
   WebM path is separate work, not implied by invoking optional installed FFmpeg.

Move an individual item forward only when it blocks a higher-priority milestone
or measured real-project use, and record why the priority changed.

### M10 — Broader music DAW capabilities (later product expansion)

- Add tempo/time-signature and bars/beats rulers, metronome, musical snapping and
  loops before MIDI sequencing; preserve the existing absolute AV clock.
- Add MIDI device input, piano roll, quantisation and basic instruments, then
  instrument tracks and MIDI export. These are substantial new engine features.
- Evaluate desktop plugin hosting after the bus/automation/latency model is solid;
  check SDK/dependency licences and build/platform isolation before choosing a
  format. Desktop plugins do not automatically work in web/iOS builds.
- Add advanced musical stretch/warp, freeze/render-in-place, folders and larger
  session organisation once the preceding workflows justify them.

This milestone is necessary for broad music-production parity, but it should not
consume the interview/video editor's near-term milestones.

## Delivery rules and milestone acceptance

- Prefer built-in MIT/BSD/Apache-compatible implementations and existing system
  APIs; review each new dependency's actual license/notices before adding it.
  Optional installed FFmpeg remains explicit; do not silently bundle GPL tools.
- Implement project state, migration, undo/redo and saved representation with the
  feature. CLI edit/render behaviour should match GUI semantics where meaningful;
  GUI-only gestures and live device workflows do not need artificial CLI mirrors.
- Desktop video preview and export must share composition/time semantics; label
  approximations explicitly. Never ship a control whose renderer ignores it.
- EN/DE, keyboard/macOS menus, mouse and touch, contextual help, accessibility and
  compact layouts are part of each feature, not a final polishing phase.
- Test relevant edit invariants and audio/picture results, then validate the actual
  Canon/H6 interview or USB-mic voiceover workflow. Browser headless checks and
  simulator CI do not establish physical iOS recording/video correctness.
- Update the relevant workflow docs and RELEASE_STATUS with actual support/limits.
  Build/install a reviewable local milestone; tags and Apple distribution remain
  separate actions governed by the existing release workflow.

## First concrete implementation slice

Start M1 with visible time-range selection, range playback/looping and track lock
semantics. Follow with scoped lift/extract and transition-aware ripple edits.
Use the interview plus two microphones and a background-music track to verify the
behaviour. This brings immediate editing capability without waiting for new codecs
or a disk-paged playback architecture.

---

# Historical implementation records (archived)

The following material is retained for provenance. Completed items and obsolete
baselines below must not override the active roadmap above.

# Interaction follow-up — local 0.6.4

Implemented fullscreen focus/keyboard isolation, long-list track drag scrolling,
Escape/capture cancellation, compact touch header geometry and status indicators.
Playhead hit targets no longer extend into neighbouring track controls.

# Preview and seeking follow-up — local 0.6.3

Fixed gap/tail preview loading, fullscreen request completion after close, visible
fullscreen failure notices, frame stepping across the extended canvas and typed
position viewport follow. Browser playback in intentional black is covered.

# Timeline usability — local 0.6.2

Implemented video removal/undo, pointer and keyboard track ordering, shared row
height extremes, help, editable position/canvas duration, automatic partial-video
dissolves, reviewed audio crossfades, portal fullscreen viewer and staged audio
import into existing/new tracks. Longer canvas exports black picture and silence.
Two simultaneous picture clips on one lane remain the composition limit.

# Shared timeline — local 0.6.1

Video clips now follow the audio ruler, zoom and horizontal scroll. A separate
ProjectOverview navigates the entire arrangement; VideoViewer remains fitted.
This supersedes the earlier fitted editable picture lane.

# Media workspace progress — local 0.6.0

Implemented multiple picture sources on one composition lane; linked AV editing;
frame trim/slip/ripple, configurable grid and markers; saved sync and optional audio
drift correction; reviewed mic switching, shared automation, noise reduction and
loudness measurement; transcript exchange/editing; optional resizable workspace;
proxies, cancellation, recovery and media relocation. CLI recipes and linked-source
rendering share the internal desktop media crate. See docs/MEDIA_WORKSPACE.md.

Remaining architecture work: fully paged GUI audio (CLI already streams files),
stacked multicam/linked clip rate changes, native mobile video composition and
physical-device tests. These are not claimed by 0.6.0. Browser/touch checks do not
prove iOS native behavior. Keep advanced transition preview limitations visible.

## Precision and picture editing (2026-10-08, local 0.5.0)

Implemented fitted video overview, draggable playhead, magnetic edges, exact/ms/sample
nudges, track fade envelopes and Voice round trips. Single-source picture clips now
support split/move/source trim/delete and timed transitions in GUI + CLI. Export
validates overlaps and never ripples audio implicitly. See TIMELINE_WORKFLOW.md.
Remaining: multiple picture sources/lanes, linked AV groups/ripple editing, frame-rate
selection, full 3D page simulation, native mobile video engine and device validation.

# CrispAudio — Production Readiness Plan

## Generic timeline workflow (2026-10-08, local 0.4.1)

- Replace the interview workspace with generic optional media tools.
- Move transport adjacent to tracks; expose Fit all, time zoom, track height,
  horizontal navigation and correct trackpad wheel axes.
- Implement New project/reset with undo, full project files, reusable track files,
  standalone camera import, and offset-only track auto-sync with drift reporting.
- Guard video readiness, retry loading, expand viewer with native fullscreen and
  fallback; preserve video duration through audio edits.
- Define consistent temporary Solo override of saved Mute for playback/export.
- Remaining: drift correction for arbitrary already edited tracks, silent-video
  import, multiple picture clips/multicam, native/device UX validation.

## Interview editing (2026-10-08, Codex — implemented)

- Merge `ios-native-features` into main and verify existing gates.
- Add an internal desktop media module and standalone `crispaudio` CLI: probe,
  correlate multiple anchors, estimate offset/drift, preserve channel count,
  render aligned 24-bit audio, and remux video without re-encoding its picture.
- Add a GUI sync/import workflow, video preview, confidence review, manual offset
  adjustment, and export of the edited timeline onto the original video.
- Preserve sample precision in portable projects and persist video/source metadata.
- Verify synthetic offset/drift cases plus the real Canon/H6 interview. Keep all
  personal recordings and generated media outside the repository.
- Verified: frontend lint/build/tests; native macOS app build and 16 Rust tests;
  five media DSP tests; generated-media CLI integration tests; browser GUI flow
  calling the real CLI; full Canon/H6 export with unchanged picture/camera hashes
  and residual alignment <= 1.75 ms across beginning/middle/end checks.
- Multiple picture clips/ripple editing/multicam, speaker-to-mic automation, and transcript navigation are
  follow-up work, documented in `docs/INTERVIEW_EDITING.md`.
- No separate cross-application engine. FFmpeg/FFprobe are desktop prerequisites;
  web/mobile keep the existing audio editor.

## Visual timeline and video workflow (2026-10-08, local 0.4.0)

- Implemented source-normalized waveforms, transient-preserving aggregation and
  deep-zoom samples, plus a normalized two-mic alignment overlay.
- Added the shared-clock filmstrip lane, larger/fullscreen video viewer and
  approximate time stepping. Single locked video; no arbitrary montage yet.
- Persisted in/out range; GUI and CLI export accurate encoded sections while
  preserving stream-copy behavior for the full recording.
- Local version bumped to 0.4.0; this does not itself submit an Apple release.

## Touch workflow and release readiness (2026-10-08)

- Fixed global CSS reset overriding Tailwind spacing utilities.
- Implemented guided file setup, explicit microphone comparison, preview toggle,
  waveform fit, position scrubber, visible clip split/delete actions, track mixer,
  and dialog-based clip inspector. Shared vertical scrolling keeps headers aligned.
- Touch selects/scrolls by default; moving/trimming is an explicit mode. Batch WAV
  import creates separate microphone tracks. iOS saves portable embedded audio.
- Documented exact Canon/H6 CLI and GUI steps and current distribution evidence.
- Open: real-device iPhone/iPad validation; full native mobile video workflow;
  macOS App Store signing and sandbox/media packaging. Do not describe the new
  interview feature as available on iOS or submitted to Apple.

## Historical v0.3.0 baseline

> **Status: COMPLETE (v0.3.0)** — All items addressed. CI gates green: eslint clean,
> `tsc --noEmit` clean, 845 JS + 11 Rust tests pass, `vite build` succeeds.
> PWA service worker, full i18n (EN+DE), WCAG accessible, mobile responsive.
>
> | Item | Status |
> |------|--------|
> | P0.1 SFX presets/waveforms/sliders dead (immer MapSet) | ✅ done |
> | P0.2 Voice processing stub → real VoiceEngine | ✅ done |
> | P1.1 Settings screen | ✅ done |
> | P1.2 About dialog | ✅ done |
> | P1.3 Third-party licenses list | ✅ done |
> | P1.4 i18n init + full string migration | ✅ done (init + all 3 panels + nav/modals/status bar; EN/DE at 263-key parity, all `t()` keys verified) |
> | P1.5 Timeline audio import | ✅ done |
> | P1.6 Timeline export mix | ✅ done |
> | P1.7 Tauri backend / persistence | ✅ done — project save/load (audio embedded as base64 WAV) via Tauri dialog + save_project/load_project; dead `ProjectData` removed. (`export_wav` command still unused; exports use the JS WAV encoder by design.) |
> | P2.1 SFX auto-generate on mount | ✅ done |
> | P2.2 StatusBar clock | ✅ done (panel-aware live playhead) |
> | P2.3 Timeline undo/redo hook misuse | ✅ done |
> | P2.4 Fake spectrum (SpectrumCanvas) | ✅ done (real radix-2 FFT magnitude spectrum + tests) |
> | P2.5 Dead/duplicated code | ✅ done (removed unused EffectsPanel, SpectrumAnalyzer) |
> | P2.6 A/B copy ignores locks | ✅ resolved by design — "copy to other" / swap are slot-level ops that intentionally replace the whole target slot; locks only guard preset/randomise within a slot |
> | P2.7 Build-fix commit | ✅ done |
>
> **All plan items addressed.** Remaining backend command `export_wav` is left
> as scaffolding (exports use the JS encoder); not a blocker.


Status of the build: **compiles, lints clean, 331 unit tests pass, `tauri build` produces a
signed-less `.dmg`/`.app`.** The problem is not the build — it is that large parts of the app
are **not wired end-to-end**. The UI renders but most interactions are dead.

This document captures the findings from a full audit of `crispaudio` compared against the
original working apps it was assembled from:

- **crispfxr-app** (`/Volumes/backups/code/crispfxr-app`) — original working SFX synth.
- **voicelab** (`/Volumes/backups/code/voicelab`) — original working voice processor.
- **CrispSorter** (`/Volumes/backups/code/CrispSorter`) — sibling Tauri+React app (only the Rust
  backend is present locally; its frontend isn't on disk, so Settings/About/Licenses are rebuilt
  from crispaudio's own primitives rather than copied).

---

## 0. Severity legend

- **P0 — blocker**: a headline feature is completely dead. Ship-stopper.
- **P1 — major**: a whole feature area is unusable or absent.
- **P2 — polish**: correctness/quality issues, not blockers.

---

## P0 — Blockers (core interactions dead)

### P0.1 — SFX: clicking presets / waveforms / sliders does nothing  ✅ ROOT CAUSE FOUND
**Symptom:** clicking any preset or waveform (and moving any SFX slider, and "Randomise")
has no effect — no sound, no visual change.

**Root cause:** immer's MapSet plugin is never enabled in the running app.
- `synthStore` is created with the `immer` middleware and stores `lockedParams: new Set()`
  (`src/stores/synthStore.ts:110`).
- `setParams` (`synthStore.ts:121`) and `loadPreset` (`synthStore.ts:164`) read that Set
  **through the immer draft** (`state.lockedParams.has(key)`), which forces immer to proxy the Set.
- `enableMapSet()` is only called in `tests/setup.ts:7` — **never** in `src/main.tsx`.
- At runtime immer throws `[Immer] The plugin for 'MapSet' has not been loaded`. The throw happens
  inside the Zustand `set()` call inside the React `onClick`; React swallows it, no state update,
  no re-render, no audio. The click is a silent no-op.

This single defect kills **all** SFX parameter interaction (presets, waveforms, every slider,
randomise) because they all funnel through `setParams`/`loadPreset`.

**Fix:** call `enableMapSet()` once at app startup in `src/main.tsx` (mirror `tests/setup.ts`).
Belt-and-suspenders: also call it at the top of `synthStore.ts` before `create(...)`.

**Reference behaviour (crispfxr-app):** generation and playback are decoupled — clicking a preset
regenerates the buffer but does **not** auto-play; the user presses Play/Space. crispaudio already
mirrors this (`handlePreset` → `loadPreset` + `generate`; explicit Play button). So no UX change is
needed beyond unblocking the throw.

**Acceptance:** click a preset → waveform canvas redraws + Play enabled; click waveform → buffer
changes; sliders update the waveform; Play produces sound; WAV export works.

### P0.2 — Voice: processing is a stub; every effect is a no-op  ✅ CONFIRMED
**Symptom:** loading audio, selecting a voice preset, and moving effect sliders produce no audible
change; "Processed" output always equals the source; export writes the unmodified input.

**Root cause:** `handleProcess` in `src/components/voice/VoicePanel.tsx:483-492` is a literal
pass-through stub:
```ts
// Stub process — in a real build this would call VoiceEngine
setTimeout(() => { setProcessedBuffer(sourceBuffer); ... }, 400);
```
The real DSP pipeline `src/audio/engine/VoiceEngine.ts` is complete and correct
(`class VoiceEngine { async processAudio(source, settings): Promise<AudioBuffer> }`,
granular pitch shift + formant + time-stretch + a 10-node OfflineAudioContext effect chain) but is
**never imported or instantiated anywhere**.

**Fix:** replace the stub with a real call:
```ts
const engine = new VoiceEngine();               // or module-singleton
const out = await engine.processAudio(sourceBuffer, currentSettings);
setProcessedBuffer(out);
```
`currentSettings` = the active slot's settings (or morphed) from `voiceStore`. Make `handleProcess`
async and guard against overlapping runs. Consider debounced auto-process on settings change to
match voicelab's `throttledProcess` (150 ms), or keep the explicit "Process" button — pick one and
make it consistent.

**Acceptance:** load a clip, pick "Robot"/"Chipmunk" → processed waveform differs and playback sounds
transformed; export writes the processed audio.

---

## P1 — Major gaps

### P1.1 — No Settings screen  ✅ CONFIRMED ABSENT
- There is **no** settings/preferences UI anywhere. The Sidebar **already renders a Settings gear
  button** (`src/components/layout/Sidebar.tsx:108-131`) but it has **no `onClick`** — dead element.
- A reusable `Modal` already exists (`src/components/common/Modal.tsx`: portal, Esc, focus-trap,
  backdrop click, `X` button) — build Settings as Modal content.
**Plan:**
  - Add modal state to `uiStore` (`activeModal: 'settings'|'about'|'licenses'|null`, `openModal`,
    `closeModal`).
  - Wire the gear button `onClick={() => openModal('settings')}`.
  - New `settingsStore` with zustand `persist` (localStorage to start; optionally back with
    `@tauri-apps/plugin-store` later to match CrispSorter).
  - Settings to expose: **theme**, **language (EN/DE)**, **default export sample rate / bit depth**.
  - Language dropdown calls `i18n.changeLanguage(lng)` and persists it (see P1.4).

### P1.2 — No About dialog  ✅ CONFIRMED ABSENT
**Plan:** `AboutModal` (Modal content) showing app name, version, identifier
(`com.crispstrobe.crispaudio`), short description, and repo/homepage links.
  - Version via `getVersion()` from `@tauri-apps/api/app` (source of truth:
    `src-tauri/tauri.conf.json:4` `"version": "0.1.0"`).
  - External links opened via `@tauri-apps/plugin-opener` (`openUrl`) — add the plugin (npm
    `@tauri-apps/plugin-opener` + `tauri-plugin-opener` crate + register in `lib.rs` + capability),
    mirroring CrispSorter. Fallback: `<a target="_blank">` if we choose not to add the plugin.

### P1.3 — No third-party licenses list  ✅ CONFIRMED ABSENT
**Plan:** `LicensesModal` rendering a scrollable list.
  - **JS deps**: add a script `licenses:gen` using `license-checker`/`license-checker-rspack`
    → `src/generated/licenses.json`, imported into the component.
  - **Rust deps** (optional): `cargo-about generate` with `about.toml` for `src-tauri` crates.
  - Each row: name, version, SPDX license, repo link (opened via opener).

### P1.4 — i18n built but never initialized or used  ✅ CONFIRMED
- `src/i18n/index.ts` configures i18next (EN+DE, detector, fallback `en`) and full EN/DE
  translation files exist — but `src/i18n/index.ts` is **never imported** (notably not in
  `main.tsx`) and **no component calls `t()`** (all strings hardcoded English). DE is unreachable.
**Plan (incremental):**
  - Import `./i18n` in `src/main.tsx` so i18next initializes.
  - Add the language switcher in Settings (P1.1).
  - Migrate user-facing strings to `t()` progressively (panels first). Full migration is large;
    do high-traffic surfaces (panel titles, buttons, Settings/About) now, backfill the rest.

### P1.5 — Timeline: cannot import audio (unusable)  ✅ CONFIRMED
- `projectStore.addSource` / `addSegment` are **never called by any component** — there is no media
  pool, no file import, no drag-drop that creates a segment. Tracks exist but are permanently empty,
  so `project.duration` stays 0 and playback has nothing to schedule. The TimelineEngine itself is
  real and fully wired for playback.
**Plan:** add a media-import affordance (toolbar "Import audio" button + drag-drop onto a track) that
  decodes the file to an AudioBuffer, calls `addSource`, and creates a segment via `addSegment` at the
  playhead. Reuse `FileDropZone` decode logic.

### P1.6 — Timeline: no export  ✅ CONFIRMED
- `TimelineEngine.renderToBuffer` (`TimelineEngine.ts:131`) is never called; no "Export Mix" button
  (the `timeline.export` i18n key exists but is unused).
**Plan:** add an "Export Mix" button to the transport/toolbar → `renderToBuffer()` → WAV encode →
  download (reuse the shared WAV writer; ideally the Rust `export_wav`, see P1.7).

### P1.7 — Entire Tauri backend is unused  ✅ CONFIRMED
- No `invoke`/`@tauri-apps/api` usage anywhere in `src`. The 5 registered commands
  (`open_audio_file`, `save_audio_file`, `export_wav`, `save_project`, `load_project`) are all dead.
- `struct ProjectData` is never constructed (the dead-code warning). Project save/load is not wired
  on either side; there is **no persistence at all** (closing the app loses everything).
**Plan (phased):**
  - Short term: at least one real `invoke` path — use Rust `export_wav` (proper multi-bit-depth
    encoder) for SFX/Voice/Timeline export instead of the three hand-rolled JS WAV writers, OR keep
    JS export and explicitly decide the Rust export is for "Save As…" via native dialog.
  - Decide project persistence: wire `save_project`/`load_project` to a real Save/Open flow, fix
    `ProjectData` (construct it or remove it), and add autosave/restore. If out of scope for now,
    document it as a known limitation rather than leaving dead code.

---

## P2 — Polish / correctness

- **P2.1 SFX auto-generate on mount:** `buffer` starts `null` and nothing calls `generate()` on
  load, so Play/Export are disabled until the first interaction. Call `generate()` once on mount
  (after `enableMapSet`) so the default sound is ready.
- **P2.2 StatusBar clock is fake:** `StatusBar.tsx:64` hardcodes `formatTime(0)`; it also only reads
  `useSynthStore`, so it's blank in Voice/Timeline modes. Wire it to the active panel's playhead.
- **P2.3 Timeline undo/redo misuses hooks:** `TimelinePanel.tsx:208-209` call `useTimelineHistory()`
  (a hook) inside a `useCallback` body, operating on a stale snapshot. Refactor to call
  `useProjectStore.temporal.getState().undo()/.redo()` directly in the handler.
- **P2.4 SpectrumCanvas is a fake static RMS approximation** (`SFXPanel.tsx:249`), not a real FFT.
  Cosmetic; optionally replace with an AnalyserNode FFT.
- **P2.5 Dead/duplicated code:** `samplesToAudioBuffer`/`playSamples` exported from `SynthEngine.ts`
  are unused (SFXPanel re-implements playback inline); `useAudioEngine` hook is unused. Consolidate.
- **P2.6 A/B `copyToOther`/`swapSlots`** do a full overwrite that ignores locked params (design
  quirk; confirm intended).
- **P2.7 Build-tree edits already made** (to get it compiling) are uncommitted: typed-array generic
  annotations + unused-var removals across 8 files, plus `Cargo.toml` feature-list no-op change.
  Commit these on a branch with the rest.

---

## Suggested execution order

1. **P0.1** SFX immer fix (one line, unblocks the whole synth) + **P2.1** auto-generate on mount.
2. **P0.2** Voice: wire `VoiceEngine.processAudio` (kills the biggest "doesn't work" complaint).
3. **P1.4** init i18n in `main.tsx` (prereq for Settings language switch).
4. **P1.1 / P1.2 / P1.3** Settings + About + Licenses modals; wire the Sidebar gear button.
5. **P1.5 / P1.6** Timeline import + export (makes the third feature usable).
6. **P1.7** one real Tauri `invoke` path (export_wav) + decide project persistence.
7. **P2** polish pass; commit on a branch; rebuild + retest + manual smoke test.

## Verification per step
- `npm run typecheck && npm run lint && npm run test` after each change.
- Manual smoke test via `npm run tauri dev` for audio (unit tests can't hear sound).
- Final `npm run tauri build` to confirm the bundle still builds.
