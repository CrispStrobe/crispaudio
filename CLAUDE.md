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
- **Interview media:** internal `media/` Rust crate + CLI, macOS 13+ Apple backend and optional desktop FFmpeg compatibility; no mobile subprocess support
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
`VideoLane` formerly shared zoom/scroll; see the 0.5.0 section below.
Video in/out points persist in `TimelineProject.video` with undo; they only select
an export interval. `export_segment` encodes accurate sections; full length keeps
stream copy. CLI mixes are full-clock files, GUI mixes are already range-trimmed;
keep that distinction or section audio will seek twice. No Apple release tag was
created for these local features. See docs/INTERVIEW_EDITING.md and RELEASE_STATUS.md.

## Generic timeline 0.4.1

See docs/TIMELINE_WORKFLOW.md. MediaTools and VideoViewer are optional, not an
interview-specific workspace. timelineDuration includes video plus all clip ends.
Time zoom and track height are separate view state; hook hit tests and canvas/header
geometry must use the same trackHeight. TimelineNavigation plus the parent passive:
false wheel handler own horizontal browsing; plain vertical scroll stays native.
Solo overrides stored mute temporarily via audibleTracks in both engine paths.
TrackFiles loads arrangements additively with new source/track/clip IDs. AutoSyncTracks
sends binary 1 kHz mono analysis to native estimate_track_sync; applying offsets is
one project mutation, preserves original sources and reports uncorrected drift.
VideoViewer guards metadata, retries errors, and restores native fullscreen only
if it entered it. Keep the in-window expansion fallback for unsupported platforms.

## Precision/video editing 0.5.0

The video lane is now a fitted overview (own scale/window indicator), not shared
with audio zoom. videoEditing.ts derives one legacy clip when clips is undefined;
empty clips means no picture. videoTimelineDuration uses edited ends. Never use
source duration as edited duration. Video changes use atomic project mutations.
media/src/video_edit.rs validates composition and exports via FFmpeg; GUI mixes
are range-trimmed, CLI mix_is_trimmed is explicit. Audio does not follow picture
implicitly. Advanced preview is approximate and labelled; page peel is a 2D fold.
Audio track/segment envelopes share audioEnvelope.ts, including mid-fade resume.
ToolButton labels hover/focus/long press; do not activate after a touch long press.
Voice editing target survives closing Settings and resets on unrelated audio loads.

## Media workspace 0.6.0

Read docs/MEDIA_WORKSPACE.md. Picture sources are separate from clips; legacy
undefined clips still derive the original whole source. clipSource resolves
per-clip paths. projectEdits centralizes linked groups, independent split halves,
trim/slip/ripple and duration. Never move just sound when its picture is linked.
One picture composition lane is supported; arbitrary overlapping camera angles
still require explicit cuts/transitions. Audio drift correction requires unlinked
picture. Automation is scheduled by the same gain function for live/offline audio.

WebKit first-thumbnail capture must seek into a displayable first frame while its
thumbnail tile stays anchored at zero. Never retarget pending seeks on every
transport tick. Frame boundaries in FFmpeg are quantized absolutely, not by
summing rounded lengths. Keep decoder/encoder threads bounded.

Project format v3 reads v1/v2. Derived media in OS cache is copied to a sibling
.media folder on save. Cache recovery audio in IndexedDB, not localStorage PCM;
retain the last successful snapshot after errors. CLI project rendering rejects
unsupported effects/pan explicitly. Native desktop job cancellation kills its
FFmpeg child and removes owned staging output. GUI audio is not disk-paged yet.

## Shared timeline 0.6.1

Supersedes the 0.5/0.6 fitted VideoLane behavior: editable video uses the same
zoomLevel (pixels/second), scrollOffset and playhead scale as audio and ruler.
Only ProjectOverview is fitted; it navigates the common viewport, not clip edits.
VideoViewer keeps the picture fitted independently. Touch selection mode browses
video and audio; Move & trim explicitly permits touch clip movement.


## Timeline usability 0.6.2

Audio and picture use trackHeight (24–640 px). Reorder uses pointer capture and
header hit testing, not HTML5 file drag/drop. Video removal keeps sound and clears
its matching link groups. Help and all controls need EN/DE translations.
minimumDuration is the user's canvas floor; every duration recomputation must
retain it. POS/DUR edits never destroy clips. Native picture export pads a black
tail; audio exports silence. Video overlaps normalize incoming transitions only
when picture timing changes; audio-only edits must preserve implicit picture for
stream-copy export. Reject containment/triple picture stacks. Expanded viewer is
a portal outside transformed panels. Import keeps desktop paths, checks project
identity after async decode and yields during waveform scanning; decode itself
cannot be cancelled and GUI audio remains bounded by decoded-buffer memory.


## Preview and seeking 0.6.3

Only resolve a video URL for an active clip. In picture gaps retain the hidden
last decoder and an empty black frame; never mark intentional black as loading
or fall back to preparing the default camera. Stable media keys preserve that
node across gaps. Expanded frame steps clamp to timelineDuration, not picture
ends. Browser fullscreen requests can complete after close/unmount; exit late
owned requests and preserve preexisting fullscreen. Keep failure notices inside
the portal. POS and scrubber use shared viewport-follow rules.


## Interaction 0.6.4

Expanded viewer owns focus and keyboard events: arrows step frames, Space toggles
playback, Tab cycles controls and Escape restores the compact expand button. Never
let viewer keys reach timeline clip editing. Track reorder uses header-centre hit
testing even when the pointer is over a waveform; edge scrolling runs only during
an active pointer drag. Cancel RAF on Escape/cancel/lost capture/unmount. Exclude
grips from horizontal touch browsing. Playhead targets are clipped at both viewport
edges so the broad target cannot cover headers. Compact headers fit actual row
height; hide mixer below 56 px on desktop/96 px on touch and retain audible status.


## Formats and backend policy 0.7.0

Read docs/MEDIA_FORMATS_AND_LICENSES.md. FLAC export uses the pinned MIT libflacjs
wrapper and BSD libFLAC 1.3.4 in the codec worker; signed 24-bit quantization and
STREAMINFO MD5 are deliberate. Regenerate vendored assets with scripts/vendor-flac.mjs.
Full codec notices are bundled through AboutModal raw imports.
Apple media uses a build-time Swift helper embedded in the Rust crate, extracted
into an owned private temp directory per cancellable job. Apple-only mode must
never silently use FFmpeg. Export backend/format are explicit per edit; WebM VP9
and AV1 still require optional FFmpeg. Strict Apple supports every listed picture transition,
colour/orientation/fades, gaps/tails and supplied mixed audio. Whip/glitch/page peel
use a cached Metal kernel and require dynamic-library GPU support; fail explicitly
on unsupported hardware. Native and FFmpeg complex effects are not pixel-identical.
CLI project audio mixing still needs FFmpeg. Never claim a permissive-only
WebM backend or iOS video implementation exists. GUI mixed audio is range-trimmed;
CLI mix-is-trimmed remains explicit. Preserve atomic no-overwrite publication.
