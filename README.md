# CrispAudio

CrispAudio combines a multitrack audio and video timeline, voice processing and
sound-effect synthesis. It supports arranging recordings, synchronizing camera
and microphone sources, mixing sound and editing footage through its transcript.
The desktop app uses Tauri, React and TypeScript; the audio tools also run in a
browser.

[![CI](https://github.com/CrispStrobe/crispaudio/actions/workflows/ci.yml/badge.svg)](https://github.com/CrispStrobe/crispaudio/actions/workflows/ci.yml)
[![Release](https://github.com/CrispStrobe/crispaudio/actions/workflows/release.yml/badge.svg)](https://github.com/CrispStrobe/crispaudio/actions/workflows/release.yml)

[Web demo](https://crispaudio-psi.vercel.app) ·
[Releases](https://github.com/CrispStrobe/crispaudio/releases) ·
[Roadmap](PLAN.md)

## Timeline and media editing

- Multitrack audio waveforms and a picture composition lane share the timeline
  ruler, playhead, zoom and scrolling. Video preview can open in a fullscreen viewer.
- Move, split, trim, slip, copy/cut/paste and reorder clips; use magnetic/grid
  snapping, frame/sample nudges and editable timecodes.
- Link sound and picture, create named edit groups, lock lanes and choose which
  lanes participate in ripple edits.
- Select and play/loop/export time ranges; lift, extract or insert gaps. Rolling
  trims, ripple trims, trim-to-playhead and slide edits have reviewed source limits.
- Apply clip/track fades, audio crossfades, picture transitions, colour correction
  and orientation changes.
- Mix with gain, pan, mute/solo, gain automation and clip/track/master effect racks.
  Current timeline effects include filters, bit crushing, ring modulation, delay,
  chorus, reverb, distortion and compression.
- Import camera and microphone recordings, review offset/drift synchronization,
  switch microphones and manage sources in the optional media workspace.
- Save/load projects with embedded or linked audio, recover autosaves and relink
  missing files. SFX and processed voice audio can be sent into the timeline.

See [Timeline workflow](docs/TIMELINE_WORKFLOW.md),
[Media workspace](docs/MEDIA_WORKSPACE.md) and the
[Canon/H6 interview walkthrough](docs/INTERVIEW_WALKTHROUGH.md).

## Transcription and spoken-text editing

Desktop transcription uses an external local **CrispASR** executable and model.
Select the timeline mix or a microphone, transcribe and obtain genuine word
timestamps through forced alignment. Deleting a timed word removes its matching
interval across audio and video. Alternatively, paste a shortened transcript,
review its matching words and retain only those passages, with one-step undo.
Repeated phrases require explicit occurrence review; rewritten/reordered wording
is rejected. Changed audio arrangements invalidate old alignment.

See [Speech editing](docs/SPEECH_EDITING.md) and
[Keep text editing](docs/KEEP_TEXT_EDITING.md) for setup and limitations.

## SFX and voice

**SFX:** square/sawtooth/sine/noise synthesis, preset generators, ADSR, FM,
vibrato, arpeggiation, effects, parameter locking and mutation. Compare A/B slots
with morphing, parallel waveforms, spectrum/spectrogram and level displays.
Export audio or JSON presets, share preset links and send sounds to the timeline.

**Voice:** load or record audio, apply voice presets, pitch/time/formant processing
and an effects chain. Compare source/processed sound and A/B slots, inspect audio
visualizations, export or return processed sound to a timeline clip.

Both views provide undo/redo, numeric controls and contextual parameter help.
The interface supports English and German, keyboard commands and touch controls.
macOS menus expose file, edit, playback and view actions.

## Formats and platform limits

| Area | Current support |
|---|---|
| GUI audio import | WAV, MP3, M4A/AAC, FLAC, Ogg/Opus, AIFF/AIF and CAF; decoding depends on codec/profile and platform |
| GUI audio export | WAV, FLAC, MP3, AAC and Ogg Opus; eligible macOS timeline exports also offer M4A |
| Desktop video import | MP4, MOV, MKV, M4V, WebM, AVI, OGV and MPEG/MPG, subject to backend codec support |
| Desktop video export | MP4/MOV H.264 + AAC through Apple frameworks or optional FFmpeg; VP9/AV1 WebM through optional FFmpeg |
| Native CLI audio export | Linked projects to WAV; macOS also supports FLAC and AAC/M4A |

macOS 13+ provides the native media backend. Whip, glitch and page-peel transitions
require compatible Metal hardware. Automatic synchronization, denoising/loudness
preparation and some format paths require separately installed FFmpeg/FFprobe.

Video composition and local CrispASR integration are desktop features. The browser
and mobile app provide audio tools; mobile ASR/video composition and iOS device
validation for newer timeline controls remain incomplete. The timeline currently
has **one picture composition lane**. GUI audio import/playback uses decoded
in-memory buffers; eligible macOS linked-project exports use native disk streaming.
Rolling, slide and linked ripple trims preserve existing picture transitions.
Range edits can explicitly replace crossed picture blends with reviewed hard cuts;
other transitions stay intact. Transcript cue boundaries still require adjustment.
Dragging audio/video clip edges shows source spans and the available material on
both sides, including linked partners. Trims stop at source/timeline limits;
linked picture trims use project frames. Escape cancels the drag and retains redo.

The Timeline mixer opens as a bottom dock with horizontally scrollable track
and master strips. Adjust dB level, pan, mute/solo and existing effects; fader and
audition changes keep playback running. Meters show stereo peak/RMS with held
peak and clipping indicators; click a meter to reset. The project master level
is saved and applies to both GUI and native CLI exports, independently of monitor
volume. New projects and older files default to unity output gain.

See [Formats, backends and licensing](docs/MEDIA_FORMATS_AND_LICENSES.md) for the
exact support matrix and [Platform/distribution status](docs/RELEASE_STATUS.md)
for release availability. The web demo and published releases can differ from
this source tree.

## Build and run

Use Node.js 22.12+ (or a newer supported LTS), npm and a current stable Rust
toolchain. Desktop builds also require:

- **macOS:** Xcode Command Line Tools.
- **Linux:** WebKitGTK 4.1, Ayatana AppIndicator, librsvg, OpenSSL, ALSA development
  packages and patchelf; see the CI workflow for package names.
- **Windows:** Visual Studio C++ Build Tools and WebView2.

```sh
npm ci
npm run dev          # Browser development
npm run tauri dev    # Desktop development
npm run build        # TypeScript check and production web build
npm run tauri build  # Desktop bundle
```

Build the standalone media CLI:

```sh
cargo build --release --manifest-path media/Cargo.toml --bin crispaudio
media/target/release/crispaudio --help
```

The CLI can probe/prepare recordings, synchronize sources, apply project edit
recipes, transcribe and render linked arrangements. See
[Interview editing and CLI](docs/INTERVIEW_EDITING.md) and the workflow guides
above for complete examples.

## Development and checks

```sh
npm run lint
npm run build
npm test
cargo test --manifest-path media/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

React components live in `src/components/`, audio engines/DSP in `src/audio/`,
editing helpers in `src/lib/` and Zustand/undo state in `src/stores/`. `src-tauri/`
contains desktop commands; `media/` contains native media processing and the CLI.
Vitest tests live in `tests/`; optional integration harnesses are in `scripts/`.

Contributions should use focused branches, include appropriate checks and open a
pull request against `main`. CI checks the frontend, Rust and media CLI. Desktop
release bundles and web deployments use version tags/manual workflows; Apple
uploads have separate workflows. Pushing `main` does not submit an Apple release.

## Documentation

- [PLAN.md](PLAN.md): priorities and unfinished roadmap items.
- [CHANGELOG.md](CHANGELOG.md): changes by version.
- [history.md](history.md): historical implementation notes formerly in this README.
- [CLAUDE.md](CLAUDE.md): repository architecture and contributor guidance.

## License

MIT. Third-party components retain their own notices; see the app's About view
and [licensing details](docs/MEDIA_FORMATS_AND_LICENSES.md). External ASR models
have separate licenses. Optional installed tools are not bundled with the app.
