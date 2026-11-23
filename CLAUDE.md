# CLAUDE.md — CrispAudio

Start with [docs/WORK_HANDOFF.md](docs/WORK_HANDOFF.md) for the current checkpoint,
ordered tasks and acceptance criteria, and [PLAN.md](PLAN.md) for the active roadmap.
Read ignored `HANDOVER.local.md` and `CLAUDE.local.md`, when available, for
machine-specific setup. Keep private paths, credentials, fixture locations and
recovery details out of tracked documentation.

**Before changing a subsystem, read its contract file** (table below). They hold
the binding implementation rules that used to live in this file.

## Quick commands

```bash
npm run dev          # Web dev server (Vite, port 5173)
npm run tauri dev    # Desktop app (Tauri + Vite)
npm run build        # Production web build (tsc -b + vite): the full frontend check
npm run tauri build  # Desktop app bundle
npm test             # Vitest; see RELEASE_STATUS.md for measured counts
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```

Rust: set `CARGO_TARGET_DIR=$HOME/.cache/shared-cargo-target`; build the
standalone media CLI with a separate target dir so it never replaces the Tauri
binary. Optional `scripts/test-*.mjs` harnesses need Playwright/browsers.

## Architecture

- **Frontend:** React 19 + TypeScript + Tailwind CSS 4 + Vite 8
- **Backend:** Tauri 2.12 (Rust); `media/` crate + CLI for native mixing, DSP,
  codecs, Apple media helpers and native recording (macOS 13+)
- **Audio paths:** realtime/GUI offline audio uses Web Audio; Mac native-insert
  Live playback uses `media/src/native_graph.rs` with a native Core Audio clock;
  linked-project exports use `media/src/audio_mix.rs`
- **State:** Zustand 5 with immer (SFX), zundo undo/redo (SFX, Voice, Timeline), persist (settings)
- **i18n:** react-i18next, EN + DE, all UI strings use `t()`
- **Tests:** Vitest + jsdom + Testing Library; Rust unit tests; `tests/release/` (Python)

### Key directories

```
src/audio/          Engines (Synth, Voice, Timeline), effects, DSP, presets
src/components/     React components: layout/, shared/, sfx/, voice/, timeline/, common/
src/stores/         Zustand stores: synth, voice, project, settings, ui
src/lib/            Utilities: export, project files, delivery, diagnostics, codecs
media/src/          Native mixer/DSP, codecs, Apple helpers, native_input/
src-tauri/          Tauri commands, entitlements, iOS project (gen/apple)
docs/contracts/     Binding implementation contracts per subsystem
tests/unit/         Vitest suites
```

## Rules that apply everywhere

- **Product boundary.** No ASR/TTS creation (CrisperWeaver) and no composition,
  instrument tracks or beat sequencing (CometBeat). Existing MIDI utilities do not
  imply a MIDI roadmap. Imported audio and transcripts stay editable.
- **No legacy compatibility** (decided 19 October 2026): nobody depends on older
  development projects. Do not add migrations or compatibility-only UI/tests;
  target the current format and reject unverifiable histories.
- **Never lose user media.** Preserve originals, active session/Undo assets and the
  installed app's running sessions. Write files by owned staging → protect → one
  synchronous publication; set `publicationStarted` before calling the store
  (subscribers can throw after mutating). Publish atomically without overwriting;
  retain files whose publication may have begun. Never delete retained files by
  project, age or path.
- **DSP parity.** Supported processing must give the same result in Web Audio and
  the native paths. Never silently omit an enabled effect; unknown effect types
  fail explicitly. Do not weaken audio tests to hide backend differences, and never
  report a known limit as a parity pass. Offline range renders process from zero
  and crop. Integer WAV dither uses one shared TPDF sequence
  (`src/audio/dsp/dither.ts` ↔ `media/src/audio_mix.rs` `Dither`): change both.
- **Realtime safety.** Audio callbacks do no file I/O, helper IPC, app locks,
  allocation-heavy work or WebKit calls; construct and drop owners off the callback.
- **Honest claims.** Synthetic tests are not physical, listening, hardware or load
  acceptance. Never claim an iOS video implementation, a permissive-only WebM
  backend, true-peak limiting/lookahead (the output limiter is sample-peak; loudness
  targeting verifies true peak by re-rendering), or sample-exact ADTS AAC.
- **UI.** Every string in EN and DE; aria-labels on interactive elements; touch
  targets `min-h-11`; advanced controls collapsed behind InfoButton/details; phones
  keep waveform space (dialogs for mixer/inspector). Panels clean up AudioContext
  and stop playback on unmount. Use React.memo on hot leaf components.
- **Conventions.** Panels are lazy-loaded via React.lazy in App.tsx; visualisation
  components live in shared/ with ResizeObserver for HiDPI; styling uses Tailwind
  plus CSS custom properties (`--bg-primary`, `--text-muted`, …). The PWA service
  worker (vite-plugin-pwa) is web-only and disabled for Tauri. `npm run test:watch`
  runs Vitest in watch mode.
- **Version** is synced across package.json, src-tauri/tauri.conf.json,
  src-tauri/Cargo.toml and `APP_VERSION` in src/lib/diagnostics.ts (a test pins it).
- **Docs.** README describes current capabilities; version narratives go to
  history.md and CHANGELOG.md; new binding rules go to the matching
  `docs/contracts/` file, not here.

## Where to read before changing code

| Area | Contracts | Guides / engineering notes |
|---|---|---|
| Timeline, picture lane, viewport, preview, drops, waveforms, track templates | [contracts/TIMELINE.md](docs/contracts/TIMELINE.md) | TIMELINE_WORKFLOW, TIMELINE_UX, MEDIA_WORKSPACE, INTERVIEW_EDITING, INTERVIEW_WALKTHROUGH |
| Range edits, locks, trims, roll/slide/ripple, transitions, groups | [contracts/EDITING.md](docs/contracts/EDITING.md) | FAST_EDITING |
| Formats, export backends, native WAV/FLAC/AAC/M4A, CLI mixing, delivery | [contracts/MEDIA_EXPORT.md](docs/contracts/MEDIA_EXPORT.md) | MEDIA_FORMATS_AND_LICENSES, DELIVERY, MIX_REVIEW |
| Native DSP effects, mixer routing, limiter, loudness | [contracts/NATIVE_DSP.md](docs/contracts/NATIVE_DSP.md) | DAW_EFFECTS, NATIVE_AUDIO_ENGINE, NATIVE_PLAYBACK |
| Automation passes, curves, envelope copy, shape handles | [contracts/AUTOMATION.md](docs/contracts/AUTOMATION.md) | SCOPED_AUTOMATION_PASSES |
| Source Editor, restoration, saved effects, operation journals | [contracts/SOURCE_EDITING.md](docs/contracts/SOURCE_EDITING.md) | SOURCE_EDITING, RESTORATION, SOURCE_EDIT_JOURNALS |
| Recording, count-in, cue racks, native input/output/recovery | [contracts/RECORDING.md](docs/contracts/RECORDING.md) | RECORDING_REVIEW, RECORDING_CUE, NATIVE_INPUT, NATIVE_RECORDING_QUALIFICATION |
| Transcripts, word/keep-text editing, CrispASR audio tools | [contracts/SPEECH.md](docs/contracts/SPEECH.md) | SPEECH_EDITING, KEEP_TEXT_EDITING, CRISPASR_AUDIO |
| Signing, store builds, release status | — | MACOS_SIGNING, IOS_SUBMISSION, RELEASE_STATUS, STORE_LISTING |

Scope and roadmap: [DAW_GAP_ANALYSIS.md](docs/DAW_GAP_ANALYSIS.md),
[AUDIO_WORKSTATION_ROADMAP.md](docs/AUDIO_WORKSTATION_ROADMAP.md).

## CI and releases

- CI: frontend lint/typecheck/test/build; Rust check+test on Linux/macOS/Windows;
  media CLI integration. iOS CI builds with Xcode 27 and launch-tests on an iOS 27
  simulator (fails on a crash report or dead process).
- Store builds run on the `xcode-27` runner (ITMS-90725). The iOS release uploads
  only if iOS CI passed for the same commit; the macOS release launch-tests a
  sandboxed ad-hoc copy before Apple signing.
- iOS needs the UIScene manifest (`TaoSceneDelegate`) in
  `src-tauri/gen/apple/crispaudio_iOS/Info.plist` and `project.yml`: without it
  iOS 27 kills the app at launch. Keep `tauri-plugin-*` crates on the minor of
  their npm packages.
- The Mac app must not carry `com.apple.security.network.server`
  (`check-macos-app.py` enforces it).
- Main pushes do not submit to Apple. Read docs/RELEASE_STATUS.md before tagging.
  Vercel/Pages workflows run on version tags or manual dispatch.
