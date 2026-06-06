# CLAUDE.md — CrispAudio

## Quick commands

```bash
npm run dev          # Web dev server (Vite, port 5173)
npm run tauri dev    # Desktop app (Tauri + Vite)
npm run build        # Production web build
npm run tauri build  # Desktop app bundle
npm test             # Vitest (800+ tests)
npm run test:watch   # Vitest watch mode
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```

## Architecture

- **Frontend:** React 19 + TypeScript + Tailwind CSS 4 + Vite 8
- **Backend:** Tauri 2 (Rust) — WAV export, project save/load
- **State:** Zustand 5 with immer (SFX), zundo (timeline undo/redo), persist (settings)
- **i18n:** react-i18next — EN + DE, all UI strings use `t()`
- **Tests:** Vitest + jsdom + @testing-library/react

### Key directories

```
src/audio/          Audio engines (SynthEngine, VoiceEngine, TimelineEngine), effects, DSP, presets
src/components/     React components: layout/, shared/, sfx/, voice/, timeline/, common/
src/stores/         Zustand stores: synthStore, voiceStore, projectStore, settingsStore, uiStore
src/hooks/          Custom hooks (useAutosave, useAudioEngine, useTimeline)
src/i18n/           Translation files (en/, de/)
src/lib/            Utilities (wavExport, projectIO, themeColors, clipboard, openExternal)
src-tauri/          Rust backend (commands: audio_export, project)
tests/unit/         Unit tests (stores/, audio/, components/, hooks/, lib/)
```

## Conventions

- Panels are lazy-loaded via React.lazy in App.tsx
- Visualization components (WaveformDisplay, SpectrumDisplay, etc.) are in shared/
- Audio processing runs in the browser (Web Audio API) — Tauri is used for file I/O and WAV encoding
- CSS uses Tailwind utilities + CSS custom properties for theming (--bg-primary, --text-muted, etc.)
- All interactive elements need aria-labels (WCAG compliance)
- Version is synced across: package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml, AboutModal CURRENT_VERSION

## CI

- Frontend: lint + typecheck + test + vite build
- Rust: cargo check + cargo test on Linux/macOS/Windows
- Release: triggered by `v*` tags, builds Linux/macOS/Windows/iOS/Android
- Vercel: auto-deploys web version on push to main
