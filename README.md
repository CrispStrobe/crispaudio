# CrispAudio

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
- Volume Envelope display (ADSR contour)
- WAV export via native Rust encoder (8/16/24/32-bit, configurable sample rate; JS fallback for web)
- ADSR parametric envelope display alongside buffer-based volume envelope
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
npm run test        # run once (780+ tests)
npm run test:watch  # watch mode
```

### Lint & Typecheck
```bash
npm run lint
npm run typecheck
```

## Architecture

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

## License

MIT
