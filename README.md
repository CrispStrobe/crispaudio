# CrispAudio

Desktop interview synchronization, external microphone alignment, video preview
and edited-audio video export are available in the Timeline and standalone CLI.
Local version 0.6.4 aligns video and audio under one ruler, zoom and scroll, with a
separate project overview for navigation. The optional viewer keeps its picture
fitted. Linked clips, transitions, magnetic edges, fades and track auto-sync work
in the generic timeline. See [the timeline workflow](docs/TIMELINE_WORKFLOW.md)
and [Media workspace](docs/MEDIA_WORKSPACE.md). Use **?** for control help. POS and
DUR accept typed timecodes; row height includes video. Import audio chooses an
existing or new track. Partial picture overlaps dissolve; selected audio overlaps
can crossfade. Expanded video opens a separate fullscreen viewer.
See [Interview editing and CLI](docs/INTERVIEW_EDITING.md) for setup, the
[Canon/H6 walkthrough](docs/INTERVIEW_WALKTHROUGH.md) for concrete steps, and
[iOS/macOS release status](docs/RELEASE_STATUS.md) for platform limits. The audio
editor has touch controls; automatic video sync and MP4 export remain desktop-only.

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
- WCAG accessibility: skip-to-content, aria labels, tab roles, keyboard nav, color contrast
- Timeline autosave to localStorage (30s interval + on unload)
- Content Security Policy enabled for Tauri builds
- PWA offline support via service worker
- Keyboard shortcuts help overlay (press `?`)
- "Check for Updates" via GitHub releases API
- Full i18n: EN + DE with 100% string coverage (including parameter tooltips)
- Branded loading screen with CrispAudio logo
- HiDPI-sharp canvas rendering via ResizeObserver + DPR scaling
- Audio cleanup on panel switch (prevents orphaned playback)
- Error feedback for failed file imports and JSON parsing

## Keyboard Shortcuts

### Global
| Key | Action |
|-----|--------|
| `Ctrl+1` / `2` / `3` | Switch to SFX / Voice / Timeline |
| `Ctrl+,` | Open Settings |
| `?` | Show shortcuts help |

### SFX Panel
| Key | Action |
|-----|--------|
| `1`-`8`, `Q`, `W`, `E`, `R`, `T`, `Y`, `U` | Load preset |
| `Space` | Play / Stop |
| `L` | Toggle loop |
| `M` | Mutate (subtle variation) |
| `A` / `B` | Switch slot |
| `Ctrl+Wheel` | Zoom waveform |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |

### Voice Panel
| Key | Action |
|-----|--------|
| `1`-`9` | Load voice preset |
| `Space` | Play / Stop |
| `P` | Process |
| `A` / `B` | Switch slot |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |

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

## Media workspace (local 0.6.0)

Multiple camera files and linked audio/picture clips, frame trims/slip/ripple,
markers, reviewed microphone switching, gain automation, transcript editing,
lightweight proxies and recovery are described in [Media workspace](docs/MEDIA_WORKSPACE.md).
The desktop CLI also edits project recipes and renders linked arrangements.
Video remains desktop-only; GUI audio is decoded in memory. See the workflow for
limits and supported CLI processing.

### Media formats and native backend (local 0.7.0)

Audio export now includes 24-bit FLAC alongside WAV, MP3, AAC and Opus. Mac video
export offers a native Apple backend for MP4/MOV cuts, dissolves, fades, colour and
orientation, plus explicitly optional FFmpeg compatibility for other transitions
and VP9/AV1 WebM. See [formats, CLI and licensing](docs/MEDIA_FORMATS_AND_LICENSES.md)
for the exact support matrix and remaining platform limitations.

Local 0.7.1 also renders every listed picture transition through Apple frameworks.
Whip, glitch and page peel require a compatible Metal GPU; the export selector
retains optional FFmpeg compatibility. Complex preview/native/FFmpeg renderers
are approximate equivalents, with a shaded 2D page fold rather than 3D geometry.

Local 0.7.2 adds streaming native CLI mixing of linked projects to float WAV,
including pan, fades, automation and low/high-pass racks. On Mac, supported
linked projects can render directly to MP4/MOV with `--video --backend apple`,
without FFmpeg. Unsupported DSP fails explicitly; GUI rendering retains broader
FX support and currently uses decoded audio buffers.

Local 0.7.3 extends native CLI racks with bit crushing and ring modulation.
It also fixes their GUI processing: bit crushing keeps silence at zero, and
ring modulation now has a working wet/dry control. Delay, chorus, reverb,
oversampled distortion and compression still require GUI rendering.

Local 0.7.4 adds native CLI delay and chorus with stereo tails and bounded delay
buffers, checked against actual macOS WebKit rendering. Reverb, oversampled
distortion and compression still require GUI export. See the reusable DSP
comparison instructions in `docs/MEDIA_WORKSPACE.md`.

Local 0.7.5 adds native convolution reverb matching the GUI's seeded stereo
response and macOS WebKit level calibration, with bounded FFT buffers and no
added latency. Distortion and compression still require GUI export.
