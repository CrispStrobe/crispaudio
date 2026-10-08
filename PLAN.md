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
</content>
</invoke>
