# CrispAudio

`React` | `TypeScript` | `Tauri 2` | `Vite` | `Zustand` | `Vitest`

[![CI](https://github.com/CrispStrobe/crispaudio/actions/workflows/ci.yml/badge.svg)](https://github.com/CrispStrobe/crispaudio/actions/workflows/ci.yml)
[![Release](https://github.com/CrispStrobe/crispaudio/actions/workflows/release.yml/badge.svg)](https://github.com/CrispStrobe/crispaudio/actions/workflows/release.yml)

Cross-platform audio workstation combining sound synthesis, voice effects processing, and a timeline waveform editor.

Built with Tauri 2.x (Rust + React + TypeScript). Also runs as a web app.

**Live demo:** [crispaudio-psi.vercel.app](https://crispaudio-psi.vercel.app)

## Features

### SFX Synthesizer
- 4 waveform types: Square, Sawtooth, Sine, Noise (white/pink/brown)
- 16 preset generators (Pickup, Laser, Explosion, PowerUp, etc.) with keyboard shortcuts
- ADSR envelope, FM synthesis, vibrato, arpeggiator
- Effects: distortion, bit crush, chorus, delay, flanger, ring modulation, reverb
- A/B comparison with morph slider
- Undo/redo (Ctrl+Z / Ctrl+Shift+Z, 50-step history)
- Mutate: randomly tweak 2-4 params for subtle variations
- Parameter locking (preserve values during randomise/preset load)
- Slider / numeric input toggle for precise value entry
- Context-aware parameter suggestions based on waveform type
- Waveform playhead animation during playback
- 4-panel visualization: Waveform A/B, Frequency Spectrum, Signal Level (RMS + Peak dB)
- Volume Envelope display (ADSR contour) + parametric ADSR shape visualization
- Waveform zoom/scroll with minimap (Ctrl+wheel, drag pan, up to 16x)
- WAV export via native Rust encoder (8/16/24/32-bit, configurable sample rate; JS fallback for web)
- JSON preset import/export
- Shareable URL links (base64-encoded params)

### Voice Processor
- 9 voice transformation presets (Robot, Alien, Demon, Chipmunk, etc.)
- Granular pitch shifting (preserves duration)
- PSOLA time stretching
- Formant manipulation
- Full effects chain: vocoder, ring mod, tremolo, delay, chorus, reverb, filters, compressor, distortion, bit crush, noise gate
- A/B comparison with morph interpolation
- Separate Play Source / Play Processed for A/B comparison
- Throttled auto-processing on parameter changes (300ms)
- Waveform playhead animation during playback
- Undo/redo (Ctrl+Z / Ctrl+Shift+Z, 50-step history)
- Microphone recording (MediaRecorder capture)
- Parameter info tooltips on every slider
- Drag-and-drop audio file loading

### Timeline Editor
- Canvas-based waveform editor
- Cut, copy, paste, split, reorder segments
- Drag-and-drop audio files onto the canvas
- Fade in/out with configurable curves (linear, exponential, s-curve)
- Automatic crossfade on segment overlap
- Per-segment effects chains
- Zoom, scroll, snap-to-grid
- Track reordering via drag handles
- Full undo/redo history
- Project save/load (audio embedded as base64)
- Offline rendering for WAV export

### Cross-cutting
- Lazy-loaded panels and modals (React.lazy/Suspense)
- Vendor chunk splitting (React, i18n, state management)
- Mobile-responsive layout with collapsible sidebar
- Panel transition animations
- WCAG accessibility: skip-to-content, aria labels, proper tab roles, improved contrast
- Timeline autosave to localStorage (30s interval + on unload)
- Content Security Policy enabled for Tauri builds

## Keyboard Shortcuts

### SFX Panel
| Key | Action |
|-----|--------|
| `1`-`8`, `Q`, `W`, `E`, `R`, `T`, `Y`, `U` | Load preset |
| `Space` | Play / Stop |
| `L` | Toggle loop |
| `M` | Mutate (subtle variation) |
| `A` / `B` | Switch slot |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |

### Voice Panel
| Key | Action |
|-----|--------|
| `1`-`9` | Load voice preset |
| `Space` | Play / Stop |
| `P` | Process |
| `A` / `B` | Switch slot |

## Development

### Prerequisites
- Node.js 20+
- Rust 1.77+
- Platform-specific dependencies:
  - **Linux**: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libasound2-dev`
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Visual Studio Build Tools, WebView2

### Setup
```bash
npm install
```

### Development
```bash
npm run tauri dev    # Desktop app
npm run dev          # Web-only (no Tauri)
```

### Build
```bash
npm run tauri build  # Desktop app
npm run build        # Web-only
```

### Test
```bash
npm run test        # run once (845+ tests)
npm run test:watch  # watch mode
```

### Lint & Typecheck
```bash
npm run lint
npm run typecheck
```

## Architecture

### Data flow

```
                         +------------------+
                         |     React UI     |
                         |  (Components /   |
                         |   Hooks / i18n)  |
                         +--------+---------+
                                  |
                    +-------------+-------------+
                    |                           |
           +-------v--------+         +--------v--------+
           |  Zustand Store  |         |   Tauri IPC     |
           |  (zundo undo)   |         |   (invoke)      |
           +-------+--------+         +--------+--------+
                    |                           |
           +-------v--------+         +--------v--------+
           |  Audio Engine   |         |  Rust Backend   |
           |  SynthEngine    |         |  WAV encoder    |
           |  VoiceEngine    |         |  Project I/O    |
           |  TimelineEngine |         |  File dialogs   |
           +-------+--------+         +-----------------+
                    |
           +-------v--------+
           |  Web Audio API  |
           |  DSP pipeline   |
           |  Effects chain  |
           +----------------+
```

### Directory layout

```
src/                  React frontend (TypeScript)
  audio/              Audio engines, effects, DSP, presets
  components/         React components (layout, shared, sfx, voice, timeline)
  stores/             Zustand state management (with zundo undo/redo)
  hooks/              Custom React hooks
  types/              TypeScript interfaces
  i18n/               Internationalization (EN/DE)

src-tauri/            Rust backend
  src/commands/       Tauri commands (WAV export, project save/load)
```

## CI/CD

- **CI** (`ci.yml`): Lint, typecheck, test on every push/PR; Rust check on Linux, macOS, Windows
- **Release** (`release.yml`): Cross-platform builds on tag push (`v*`)
  - Linux x86_64 (.deb, .AppImage)
  - macOS ARM64 (.dmg)
  - macOS x86_64 (.dmg) — optional, non-blocking
  - Windows x86_64 (.msi)
  - iOS arm64 (.app, unsigned)
  - Android (.apk, unsigned)
- **Vercel**: Auto-deploys web version on push to main
- Branch protection requires all CI checks to pass before merging

## Contributing

1. **Fork** the repository and clone your fork locally.
2. **Create a branch** for your feature or fix: `git checkout -b feat/my-feature`.
3. **Install dependencies**: `npm install`.
4. **Make your changes** -- keep commits focused and atomic.
5. **Run the full check suite** before pushing:
   ```bash
   npm run lint && npm run typecheck && npm run test
   ```
6. **Open a Pull Request** against `main`. CI must pass before merge.

### Code style notes

- TypeScript strict mode is enabled -- avoid `any` where possible.
- React components use functional style with hooks (no class components).
- Audio DSP code lives in `src/audio/`; keep engine classes stateless where feasible.
- State management goes through Zustand stores in `src/stores/`.
- Tests use Vitest and live under `tests/`. Mirror the `src/` directory structure.
- Commit messages should be concise and describe the *why*, not just the *what*.

## License

MIT
