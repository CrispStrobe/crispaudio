# CrispAudio

Cross-platform audio workstation combining sound synthesis, voice effects processing, and a timeline waveform editor.

Built with Tauri 2.x (Rust + React + TypeScript).

## Features

### SFX Synthesizer
- 4 waveform types: Square, Sawtooth, Sine, Noise (white/pink/brown)
- 16 preset generators (Pickup, Laser, Explosion, PowerUp, etc.)
- ADSR envelope, FM synthesis, vibrato, arpeggiator
- Effects: distortion, bit crush, chorus, delay, flanger, ring modulation
- A/B comparison with morph slider
- WAV export (8/16/24/32-bit, configurable sample rate)

### Voice Processor
- 9 voice transformation presets (Robot, Alien, Demon, Chipmunk, etc.)
- Granular pitch shifting (preserves duration)
- PSOLA time stretching
- Formant manipulation
- Full effects chain: vocoder, ring mod, tremolo, delay, chorus, reverb, filters, compressor, distortion, bit crush, noise gate
- A/B comparison with morph interpolation

### Timeline Editor
- Canvas-based DaVinci Resolve-style waveform editor
- Cut, copy, paste, split, reorder segments
- Drag-and-drop audio files
- Fade in/out with configurable curves (linear, exponential, s-curve)
- Automatic crossfade on segment overlap
- Per-segment effects chains
- Zoom, scroll, snap-to-grid
- Full undo/redo history
- Offline rendering for export

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
npm run tauri dev
```

### Build
```bash
npm run tauri build
```

### Test
```bash
npm run test        # run once
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
  stores/             Zustand state management
  hooks/              Custom React hooks
  types/              TypeScript interfaces
  i18n/               Internationalization (EN/DE)

src-tauri/            Rust backend
  src/commands/       Tauri commands (file I/O, WAV export, project save/load)
```

## CI/CD

- **CI** (`ci.yml`): Lint, typecheck, test, build check on every PR
- **Release** (`release.yml`): Cross-platform Tauri builds on tag push (`v*`)
  - Linux x86_64 (.deb, .AppImage)
  - macOS ARM64 (.dmg)
  - macOS x86_64 (.dmg)
  - Windows x86_64 (.msi, .exe)

## License

MIT
