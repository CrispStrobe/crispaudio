# CLAUDE.md — CrispAudio

## Quick commands

```bash
npm run dev          # Web dev server (Vite, port 5173)
npm run tauri dev    # Desktop app (Tauri + Vite)
npm run build        # Production web build
npm run tauri build  # Desktop app bundle
npm test             # Vitest (1147+ tests)
npm run test:watch   # Vitest watch mode
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```

## Architecture

- **Frontend:** React 19 + TypeScript + Tailwind CSS 4 + Vite 8
- **Backend:** Tauri 2 (Rust) — WAV export, project save/load, desktop media commands
- **Interview media:** internal `media/` Rust crate + CLI, desktop FFmpeg prerequisite; no mobile subprocess support
- **State:** Zustand 5 with immer (SFX), zundo (SFX + Voice + Timeline undo/redo), persist (settings)
- **i18n:** react-i18next — EN + DE, all UI strings use `t()`
- **Tests:** Vitest + jsdom + @testing-library/react

### Key directories

```
src/audio/          Audio engines (SynthEngine, VoiceEngine, TimelineEngine), effects, DSP, presets
src/components/     React components: layout/, shared/, sfx/, voice/, timeline/, common/
src/stores/         Zustand stores: synthStore, voiceStore, projectStore, settingsStore, uiStore
src/hooks/          Custom hooks (useAutosave, useAudioEngine, useTimeline, useMediaRecorder)
src/i18n/           Translation files (en/, de/)
src/lib/            Utilities (wavExport, projectIO, themeColors, openExternal)
src-tauri/          Rust backend (commands: audio_export, project)
tests/unit/         Unit tests (stores/, audio/, components/, hooks/, lib/)
```

## Conventions

- Panels are lazy-loaded via React.lazy in App.tsx
- Visualization components (WaveformDisplay, SpectrumDisplay, etc.) are in shared/ with ResizeObserver for HiDPI
- Audio processing runs in the browser (Web Audio API) — Tauri is used for file I/O and WAV encoding
- Panels must clean up AudioContext and stop playback on unmount
- CSS uses Tailwind utilities + CSS custom properties for theming (--bg-primary, --text-muted, etc.)
- All interactive elements need aria-labels (WCAG compliance)
- Use React.memo on frequently re-rendered leaf components (e.g. ParamSlider)
- Version is synced across: package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml, AboutModal CURRENT_VERSION
- PWA: service worker auto-updates via vite-plugin-pwa (web only, disabled for Tauri)

## CI

- Frontend: lint + typecheck + test + vite build
- Rust: cargo check + cargo test on Linux/macOS/Windows
- Release: triggered by `v*` tags, builds Linux/macOS/Windows/iOS/Android
- macOS App Store: separate `mac-v*` tag/manual workflow (last signing run failed).
- Main pushes do not submit to Apple. See docs/RELEASE_STATUS.md before tagging.
- Vercel: auto-deploys web version on push to main

## Interview UX

Read docs/INTERVIEW_WALKTHROUGH.md for the real Canon/H6 example. Keep user media
outside git. Microphone comparison controls alter the export mix; state this
explicitly. Touch defaults to selection/vertical scroll, with an explicit
Move & trim mode. Keep clip actions visible and use dialogs for mixer/inspector
so phones retain waveform space. Browser viewport tests are not iOS validation.

## Visual interview timeline (local 0.4.0)

`waveformView.ts` aggregates pixel intervals and uses decoded first-channel
samples at deep zoom. Display normalization never modifies audio gains.
`AlignmentView` compares normalized pre-effect envelopes on the source clock.
`VideoLane` shares zoom/scroll/playhead; one locked source video, no montage.
Video in/out points persist in `TimelineProject.video` with undo; they only select
an export interval. `export_segment` encodes accurate sections; full length keeps
stream copy. CLI mixes are full-clock files, GUI mixes are already range-trimmed;
keep that distinction or section audio will seek twice. No Apple release tag was
created for these local features. See docs/INTERVIEW_EDITING.md and RELEASE_STATUS.md.
