# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased — local version 0.8.9]

- Slide a fixed middle clip through incoming/outgoing picture transitions while
  retaining both overlap windows, transition types and linked audio offsets.
- Compare linked edit boundaries including incoming picture handles; preserve
  source content, outer endpoints and one-step undo. Keep source limits visible
  for rejected move amounts. Ripple/range operations through blends remain limited.

## [Local version 0.8.8]

- Roll existing two-clip picture transitions while preserving their type, overlap
  duration and outer endpoints; linked audio follows the same frame displacement.
- Validate source handles, frame edges and transition topology before applying;
  reject consumed overlaps, locks and conflicts with neighbouring transitions.
- Add actual Trim tools/undo/GUI–CLI checks and a synthetic native Apple render
  check for the moved dissolve window. Slide/ripple blend edits remain restricted.

## [Local version 0.8.7]

- Add reviewed slide editing in Trim tools and CLI recipes: keep selected source
  content/duration fixed while trimming neighbours across linked sound/picture.
- Show source-handle limits; enforce locks, named groups, unambiguous neighbours
  and picture frame edges. Preserve outer endpoints and support one-step undo.
- Keep timeline markers/automation fixed; changed audio invalidates existing word
  alignment. Incoming picture blends remain unsupported for advanced trims.

## [Local version 0.8.6]

- Add a pasted shortened-transcript editor with ordered word matching, timestamp
  review, explicit repeated-phrase resolution and draft/project invalidation.
- Keep only reviewed speech passages across all audio and picture lanes with one
  undo step; preserve natural pauses within contiguous passages and remove others.
- Add reviewed `keep-words` CLI recipes with GUI/native parity; remove non-frame
  trailing canvas ends exactly without residual clips.
- Accept punctuation/case/spacing differences; reject rewritten/reordered speech,
  partial acoustic words, stale alignment, locked lanes and conflicting frames.

## [Local version 0.8.5]

- Integrate local CrispASR with timeline audio rendering, microphone/mix selection,
  German forced alignment, cancellation and stale-result protection.
- Add genuine word-timed speech editing: Delete closes the matching gap across all
  audio and video lanes, retimes transcript/markers/automation, and supports undo.
- Cover words with whole video frames, display/edit timing, enforce lane locks and
  protect adjacent words, picture blends and changed audio arrangements.
- Add CLI `transcribe-project` and `delete-word` recipes; retain word timing in
  saved projects and full CrispASR JSON imports.
- Keep ASR external on desktop; no bundled models or mobile ASR claim.

## [Local version 0.8.4]

- Add persisted named edit groups independent of AV source links, group recall,
  grouping toggle and clip labels; enforce linked/grouped scope and lane locks.
- Preserve group membership through splits and range edits; give pasted and
  imported track copies independent group identities.
- Add searchable timeline commands with shortcut hints, Cmd/Ctrl+K and macOS
  Edit menu entries. Close command search before invoking dialogs/actions.
- Exclude moving group members from snap targets.

## [Local version 0.8.3]

- Add reviewed rolling cuts, ripple trims and trim-to-playhead for linked AV,
  with source-handle limits, track protection and resulting-duration preview.
- Add previous/next edit-point controls, Cmd/Ctrl+Alt+Left/Right navigation,
  macOS Edit menu actions and contextual EN/DE trim explanations.
- Add matching CLI roll, ripple-trim and trim-to-playhead recipes.

## [Local version 0.8.2]

- Add explicit selected audio-range export and a macOS File menu action.
- Preserve DSP history before the range, with sample-bounded native output and
  Web Audio cropping; normal mix exports remain full length.
- Add CLI render-project --start/--end for audio and picture, and a GUI action
  to reuse the selected time range as picture export In/Out.

## [Local version 0.8.1]

- Add reviewed range lift, extract and insert-gap with audio/picture scope,
  persistent ripple participation and a resulting-duration preview.
- Keep linked AV splits aligned, excluded tracks fixed and automation values
  at edit boundaries; explicitly choose canvas/marker/transcript retiming.
- Preserve unaffected picture transitions; explain blocked blend/cue boundaries.
- Add matching CLI `range-edit` recipes and align legacy ripple with that scope.

## [Local version 0.8.0]

- Add saved time ranges independent of selected clips, with ruler dragging,
  keyboard-adjustable handles, exact bounds and audio/picture highlights.
- Add range playback/loop boundaries and an audio-clock gate for the end,
  including effect tails. Add macOS Playback actions and contextual EN/DE help.
- Add audio/picture lane locks that protect direct, inspector, linked, clipboard
  and CLI recipe clip edits while leaving mixing controls available.
- Keep the empty-project welcome panel below the ruler.

## [Local version 0.7.12]

- Add native Mac M4A/AAC export in the timeline AAC save dialog and CLI.
- Validate final AAC-LC packet tables against the exact source frame count,
  retaining priming and remainder metadata for gapless decoding.
- Keep ADTS AAC available and preserve the existing bitrate controls.

## [Local version 0.7.11]

- Stream eligible Mac timeline AAC exports through the native mixer and system
  encoder, preserving AAC-LC in ADTS `.aac` and the existing bitrate choices.
- Add CLI `.aac` output and `--audio-bitrate-kbps` (96/128/192/256/320, default 192).
- Validate every ADTS packet, stereo 48 kHz layout and actual packet duration;
  bound priming/padding explicitly instead of relying on bitrate estimates.
- Share atomic publication and cancellable temporary-file ownership with FLAC.

## [Local version 0.7.10]

- Add bounded native 24-bit FLAC export in the Mac timeline GUI and CLI using
  Apple's system encoder, with the GUI's quantisation and final STREAMINFO MD5.
- Mix to an owned float WAV, encode in 4096-frame chunks and publish atomically
  only after validating duration, sample rate, channels, depth and checksum.
- Retain the codec worker for in-memory/non-48-kHz projects and other platforms.
- Compare update versions numerically so 0.7.10 orders correctly after 0.7.9.

## [Local version 0.7.9]

- Save eligible Mac timeline WAV mixes directly with the native streaming mixer,
  without a rendered AudioBuffer, encoded Blob or PCM IPC transfer.
- Preserve GUI integer PCM settings at 8/16/24/32 bits, including clipping and
  JavaScript rounding; retain float WAV for default CLI/video intermediates.
- Add native CLI `--wav-bit-depth`, direct-job progress/cancellation ownership,
  and visible export error details. Other formats retain the encoder worker.

## [Local version 0.7.8]

- Stream linked 48 kHz mono/stereo project audio from disk during macOS GUI video
  export, sharing the native CLI mixer and all current timeline rack effects.
- Keep the full project clock for video section exports; seek the mix once.
- Retain Web Audio for audible in-memory sources, other render rates/platforms.
- Share cancellable media jobs across both paths; always clean temporary mixes.
- Test source selection, failures, cancellation and actual native section audio.

## [Local version 0.7.7]

- Complete native CLI timeline racks with stereo-linked compression at clip,
  track and master level: soft knee, adaptive release, makeup and 6 ms lookahead.
- Match WebKit's 32-frame envelope clock, pre-start silence and stereo pan law.
- Retain the adapted kernel's BSD-3-Clause copyright and licence in source/About.
- Add compressor comparisons for mono, bursts, impulses and parameter extremes.

## [Local version 0.7.6]

- Add native CLI timeline distortion with the GUI's 256-entry tanh curve,
  four-times oversampling, wet/dry mix and bounded stereo filter state.
- Match the wet path's 192-frame filter delay and retain short-clip tails.
- Adapt WebKit's resampling kernels/phase conventions under BSD-3-Clause, pin
  their source revision and bundle the copyright/licence notice in About.
- Extend WebKit comparisons with drive/mix endpoints, mono, unfiltered impulses
  and 18/19.5 kHz tones. Compression is the remaining native rack effect to add.

## [Local version 0.7.5]

- Add native CLI convolution reverb at clip, track and master level with the
  GUI's seeded stereo response, WebKit level calibration and dry/wet blend.
- Use direct early samples and FFT tail partitions for zero added latency and
  bounded state. Propagate mono-to-stereo reverb through the track's pan law.
- Extend the reusable WebKit/native tests with reverb sizes, five-second tails,
  short decays, mono sources and impulses; add independent convolution/tail tests.
- Bundle MIT notices for the already-linked RustFFT and its arithmetic dependencies.
  Keep distortion and compressor unsupported in the CLI.

## [Local version 0.7.4]

- Add native CLI delay and chorus at clip, track and master level, with bounded
  stereo delay lines, fractional interpolation and tails inside the chosen canvas.
- Match measured macOS WebKit delay feedback timing and absolute-time chorus LFOs;
  preserve the GUI's two-line chorus mix. Keep reverb/distortion/compressor explicit.
- Bound all audible racks to 64 MiB of delay-buffer state and 1024 enabled effects.
- Add a reusable real-WebKit/native PCM comparison harness requiring no FFmpeg,
  plus impulse, tail, stereo, fractional-delay and allocation-limit regressions.

## [Local version 0.7.3]

- Add native CLI bit crushing and ring modulation at clip, track and master level.
  Keep oscillator phase on the project clock, including clips that start later.
- Fix GUI ring modulation: scale the carrier, keeping the gain's intrinsic value
  zero so the wet/dry control actually works. This also corrects Voice processing.
- Use symmetric bit-crusher quantisation, keeping silence at zero and removing
  the old negative DC bias. Saved effect settings retain their values; these two
  effects deliberately sound different from older builds because of the fixes.
- Compare actual WebKit and native renders with overlapping clips, fades and
  three racks; keep unsupported native DSP explicit. No new codec dependencies.

## [Local version 0.7.2]

- Add bounded-memory native CLI project mixing: 48 kHz float WAV, mono/stereo pan,
  mute/solo, overlapping clips, gains, sampled fade curves, gain automation and
  low/high-pass filters at clip, track and master level. Reject unsupported effects.
- Decode/resample other audio layouts through Apple into streamed float PCM;
  preserve source offsets, finite output, cancellation and atomic no-overwrite
  publication. Keep optional FFmpeg compatibility and reject multichannel sources.
- Enable full linked-project MP4/MOV export with native audio plus Apple picture
  rendering, including trimmed sections. Keep temporary mixes in owned folders.
- Bundle Apache-2.0 Hound notices. GUI disk-paged rendering, advanced CLI DSP and
  permissive-only WebM remain unfinished.

## [Local version 0.7.1]

- Add native Apple rendering for every listed picture transition: directional
  wipes/pushes, dips to black/white, blur, zoom, pixelation, whip, glitch and a
  shaded 2D page peel. Whip/glitch/page peel use cached Metal kernels and explicitly
  reject unsupported GPUs. Native complex effects are not pixel-identical to FFmpeg.
- Test all 17 transitions on real encoded frames with FFmpeg unavailable to the
  application, checking unchanged endpoints, overlap effects, dip midpoints and
  wipe/push direction. Picture changes retain the existing audio mix and timing.

## [Local version 0.7.0]

- Add worker-based 24-bit FLAC export in SFX, Voice and Timeline with lossless
  compression, final stream checksum, cancellation and MIT/BSD codec notices.
- Add a bundled MIT macOS media helper using Apple system frameworks for probing,
  thumbnails, proxies, audio extraction and MP4/MOV picture composition. Support
  cuts, cross dissolves, gaps/tails, fades, per-clip colour and orientation.
- Add explicit Apple/FFmpeg/automatic video backend choices. Strict Apple mode
  never falls back; advanced transitions remain optional FFmpeg operations.
- Add VP9/Opus and AV1/Opus WebM export through optional FFmpeg, matching GUI/CLI
  options and output validation. Offer WebM/AVI/OGV/MPEG imports where decodable.
- Document codec source licences separately from patents, including Glint's AAC-LC
  scope and the remaining permissive-only WebM/iOS/backend work.

## [Local version 0.6.12]

- Add per-picture 90° rotation and horizontal/vertical mirroring, reset and copy
  to selected picture clips, with undo and saved project settings.
- Fit rotated pictures inside the existing frame without stretching. Apply
  screen-axis mirroring after rotation in CSS/canvas preview and native export.
- Add CLI `orientation` recipes with bounds validation. Leave linked sound,
  trims, canvas duration and export range unchanged for appearance-only recipes.
- Apply colour correction to source pixels before fitting/padding so black bars
  remain black, including custom transition previews.

## [Local version 0.6.11]

- Add per-picture-clip exposure, contrast and saturation, with bypass, reset and
  apply-to-selected-picture controls. Slider dragging creates one Undo step.
- Save colour settings in projects and apply them before fades/transitions in
  both preview and native FFmpeg export. Preserve each source's appearance in
  custom canvas transitions, including WebKit without Canvas filter support.
- Add a validated CLI `color` recipe operation. Colour-only recipes preserve
  linked audio, clip timing, export ranges and explicit canvas duration.

## [Local version 0.6.10]

- Restore FFT frequency bars alongside the spectrogram in SFX and Voice. Make
  presets, waveforms and analysis collapsible; spectrum/spectrogram start closed.
  Correct spectrum labels for the actual sample rate; skip hidden chart analysis.
- Add an ordered effects rack for clips, tracks and master: parameters, bypass,
  remove, reorder and copy/replace chains across scopes. Track/master racks are
  in the mixer; clip racks remain in Clip settings.
- Route realtime playback through master effects just like GUI export. Dispose
  effect nodes, feedback paths and modulation oscillators on stop/restart.
- Add multi-selection AV fade controls with durations/curves and single-step undo.
  Add frame-quantized video fade handles and envelope overlays on the timeline.
- Allow overlapping video fade-in/out envelopes within each clip's duration and
  multiply preview opacity to match FFmpeg export.

## [Local version 0.6.9]

- Keep SFX presets in one always-visible, horizontally scrollable row. Apply the
  same neutral icon preset strip and compact action buttons to Voice.
- Restore side-by-side SFX A/B waveforms with independent rendered buffers;
  keep noise samples stable when switching slots. Refresh output after undo,
  morph and sample-rate changes.
- Add genuine Hann-window FFT spectrograms for SFX output and Voice source or
  processed audio, with time/frequency axes and a fixed −90 to 0 dBFS scale.
  Cap analysis at 256 windows; label long audio as a sampled overview.
- Replace Voice's misleading spectrum (previously a time-domain loudness chart)
  and preserve parallel source/processed waveforms.

## [Local version 0.6.8]

- Add macOS File, Edit, View, Playback, Window and Help menus with standard
  shortcuts, enabled states and English/German labels. Project commands can open
  the timeline from another view. Text fields retain native AppKit editing.
- Route timeline clip editing through the existing clipboard/history, and
  Undo/Redo through the active panel’s history. Prevent duplicate shortcut actions.
- Compact SFX playback/export tools into icon controls. Presets use sound-type
  icons, neutral cards and wrapping localized names instead of colored blocks.
- Show one accurately labeled output waveform instead of two copies of the
  current buffer. Add duration/peak/RMS feedback; collapse detailed analysis and
  secondary quality/preset-file controls.

## [Local version 0.6.7]

- Replace the help manual dialog with contextual help mode: highlight controls
  and show one explanation beside the hovered, focused or tapped element.
- Help gestures cannot activate editing actions. Escape, the help toggle or its
  close button returns to editing. Disabled controls can also be explained.
- Add English/German explanations for transport, snapping, waveform display,
  clip editing, linked selections, mixer and track controls.

## [Local version 0.6.6]

- Center toolbar and transport SVGs in explicit square targets on WebKit.
- Keep video actions and More in the top scrolling toolbar; position More above
  app panels and within the content area. Touch tooltips escape scrolling panels.
- Replace long waveform-display and navigation hints with icon hover help.
- Prevent accidental selection of interface labels on macOS/iOS WebKit while
  keeping input and diagnostic text selectable. Project overview uses hover help.

## [Local version 0.6.5]

- Change the style of existing linked picture overlaps without moving audio.
  Existing overlap lengths survive style changes; unlink before changing length.
- Numeric picture fields commit on Enter and cancel on Escape. Merely focusing
  a field preserves exact timing; out-of-bounds edits are rejected visibly.
- Keep linked audio/video selection and its bounds after inspector edits.
- Compact toolbar layout and keep overflow menus visible above scroll panels.

## [Local version 0.6.4]

- Expanded viewer traps focus, isolates editing shortcuts, steps frames with
  Left/Right and toggles playback with Space; closing restores the expand button.
- Track grips auto-scroll near vertical edges and accept drops over waveforms.
  Escape, cancelled pointers and lost capture stop the drag; timing stays intact.
- Compact touch rows fit names, grips and trash, hide mixer controls below 96 px
  and retain an audible/silent indicator. Desktop compact rows remain below 56 px.
- Confine the playhead hit area to the timeline so it cannot cover adjacent
  track header controls at the viewport edges.

## [Local version 0.6.3]

- Picture gaps and the extended canvas stay black without reloading the default
  camera or blocking audio startup. The viewer remains available in empty regions.
- Fullscreen frame stepping follows the whole canvas and project frame rate.
  Failure notices remain inside the expanded viewer. A late browser fullscreen
  request is exited if the viewer has already closed; existing fullscreen is kept.
- Typing POS scrolls an off-screen target into view without disturbing a visible
  target. Scrubber and typed position use the same viewport rules.

## [Local version 0.6.2]

- Remove the video lane while keeping audio; undo restores links and picture.
- Pointer/touch/keyboard track reordering replaces the ineffective native drag handle.
- Shared audio/video row height from 24–640 px; timeline help explains controls.
- Editable POS/DUR fields accept seconds or timecodes. Extended canvas adds silent
  audio and black picture to the exported tail, without trimming existing clips.
- Drag partial video overlaps to create dissolves; crossfade selected overlapping
  audio with S-curve envelopes. Two simultaneous picture clips are supported.
- Expanded viewer escapes panel transforms, requests fullscreen and keeps playback
  controls. Remove the redundant View & tools dialog and duplicate zoom controls.
- Audio import chooses existing/new tracks, shows cancellable preparation stages,
  yields during waveform scans and retains desktop paths for efficient saves.

## [Local version 0.6.1]

- Align editable video with audio and the ruler under shared zoom/scroll.
- Separate whole-project navigation from the video track; drag the overview
  window to browse and the red cursor to seek. Playback picture stays fitted.
- Touch selection mode browses video without moving clips; Move & trim permits
  deliberate picture editing.

## [Local version 0.6.0]

- Follow-up: retain thumbnails for every camera, cover trimmed clip starts,
  permit native thumbnail images in the app policy, and expose first-thumbnail
  preparation through the CLI (`prepare --thumbnail`).

- Media bin, multiple video source files, linked audio/picture groups, copy/paste,
  frame trims, slip, ripple intervals, named draggable markers and frame rate/grid.
- Optional resizable inspector and touch overlay; timed transcript import/search,
  cue selection, corrected SRT export and passage removal across all tracks.
- Reviewed microphone section suggestions, visible shared gain automation,
  speech processing, conservative noise reduction and EBU R128 level matching.
- Saved sync decisions and optional audio drift correction; linked references
  remain guarded and picture drift requires unlinking first.
- Lightweight proxies, cancellable desktop exports, IndexedDB audio recovery,
  missing-file relocation and durable saved assets for cache-derived audio.
- CLI project recipes and linked-project WAV/MP4 rendering with explicit DSP
  limitations; multi-source picture export quantizes absolute frame boundaries.
- Fix misleading first black thumbnail on the Canon interview (one tile covered
  31.7 s); wait for a displayable frame, and avoid retargeting pending video seeks.
- Project format v3 reads v1/v2 and protects new metadata from older editors.

See [Media workspace](docs/MEDIA_WORKSPACE.md) for workflows and platform limits.

## [Local version 0.5.0]

- Draggable red playhead; audio zoom leaves a fitted picture overview with an audio-window indicator.
- Magnetic clip-edge snapping, exact positions, sample/ms keyboard and touch nudges.
- Auto-sync explicitly rejects competing near-equal correlation peaks, fixing platform-dependent confidence on periodic material.
- Parameterized track envelopes, with corrected curved/mid-fade resume behavior for segments.
- Non-destructive single-source video clips: split, move, source trim, delete/gaps, black fades and incoming transitions.
- Desktop/CLI edit-video compositor: dissolves, black/white dips, directional wipes/pushes, blur, zoom, pixelize, whip, glitch and shaded 2D page peel. Expensive interactive previews are labelled approximations.
- Timeline-first navigation, compact labelled icons with non-activating touch long press, and Voice view round trips to the original clip.
- Full project persistence includes picture edits. Video and sound remain independently editable; no ripple, multicam or multiple source videos.

## [Local version 0.4.1]

### Added
- Generic audio/video workflow with optional viewer, standalone camera import,
  New project reset, reusable Save/Load tracks, and audio-track auto-sync review.
- Visible horizontal navigation, trackpad deltaX/Shift+wheel panning, pointer
  centered zoom, lane-height controls and Fit all including picture/audio extent.
### Fixed
- Video waits for metadata before seeking and retries a transient first failure;
  expansion has a visible fallback plus native fullscreen with window restoration.
- Solo temporarily overrides saved mute consistently in playback and export.
- Transport sits beside tracks; seeking no longer destroys an already fitted view.
- Removing audio no longer truncates a linked video's timeline duration.

### Earlier October additions
- Shared video filmstrip lane, larger/fullscreen viewer, approximate 33 ms seeking,
  and a persisted in/out export range with accurate picture/audio section cuts.
- Alignment inspection overlay with selectable microphones, 100 ms–10 s windows,
  and beginning/middle/end checks on the original project clock.
- Visual waveform normalization (no audio changes), complete peak aggregation,
  and decoded sample drawing at high zoom.
- Desktop interview synchronization and drift correction, standalone media CLI,
  linked projects, video preview, and edited-audio MP4 export.
- Guided file selection/review, microphone comparison, full track mixer, timeline
  fit/scrubbing, visible clip actions, and a dialog-based clip inspector.
- Canon M50/RØDE/H6 walkthrough and explicit iOS/macOS distribution status.

### Fixed
- Put the global CSS reset in the base layer so Tailwind padding/margins work
  throughout the interface instead of being overridden.
- Touch selection no longer starts a clip move unless Move & trim is enabled.
- Track labels and waveforms share vertical scrolling.
- Batch audio import creates separate microphone tracks at the same position.
- iOS project saves embed audio instead of preserving inaccessible desktop links.
- Project pickers accept both `.crispaudio` and `.json`; file access errors are
  displayed instead of being silently treated as cancellation.
- Audio import decodes without waiting for playback permission after a picker.

### Platform limits
- Automatic video sync/export requires desktop FFmpeg. No October Apple release
  has been submitted. Mobile device testing and Mac App Store packaging remain.

## [0.3.0] - 2026-06-07

### Added
- Lazy-loaded panels and modals (React.lazy/Suspense) for faster initial load
- Vendor chunk splitting (React, i18n, state management) for better caching
- Mobile-responsive layout with collapsible sidebar and hamburger menu
- Panel transition animations (fade-in + slide)
- WCAG accessibility: skip-to-content, aria labels, tablist roles, keyboard nav, color contrast
- Timeline autosave to localStorage (30s + on beforeunload)
- Reusable SpectrumDisplay, AmplitudeDisplay, EnvelopeDisplay shared components
- ADSR parametric envelope visualization (synth param driven)
- Shared WAV export utility with Rust backend integration and JS fallback
- Microphone recording for Voice panel (MediaRecorder + AudioContext)
- Voice panel undo/redo via zundo (50-step history)
- Keyboard shortcuts help overlay (press ? to view)
- SFX waveform zoom/scroll with minimap (Ctrl+wheel zoom, drag pan, up to 16x)
- Timeline track reordering via drag handles
- "Check for Updates" in About dialog (GitHub releases API)
- PWA service worker for offline support (vite-plugin-pwa)
- Open Graph and Twitter meta tags for web SEO
- Full PARAM_INFO tooltip translations (28 entries, EN + DE)
- Complete i18n migration: all panels, shared components, FileDropZone (EN + DE)
- 845 JS tests + 11 Rust unit tests across 26 files
- Coverage threshold (50% lines) enforced in vitest config
- CHANGELOG.md, LICENSE, PWA raster icons, CLAUDE.md
- cargo test in CI, VoiceEngine/TimelineEngine structural tests
- Architecture diagram and Contributing section in README
- robots.txt and sitemap.xml for web SEO
- User-visible error feedback for file decode and JSON import failures

### Changed
- SFX/Voice WAV export now uses Rust encoder (supports 8/16/24/32-bit natively)
- Color contrast improved: --text-secondary and --text-muted differentiated
- Error handling hardened: projectFile/projectIO try/catch on all async paths
- Branded loading spinner replaces plain text Suspense fallback
- Audio playback stops cleanly on panel unmount (prevents orphaned AudioContext)
- Voice processAudio guarded against race conditions (staleness counter)
- ParamSlider wrapped in React.memo for render optimization
- Canvas visualizations use ResizeObserver + DPR scaling for sharp HiDPI rendering

### Removed
- Dead Tauri file_io commands (open_audio_file, save_audio_file)
- Dead clipboard.ts and audioAnalysis.ts utilities
- Dead ContextMenu.tsx component
- Disabled CSP replaced with proper Content-Security-Policy

## [0.2.1] - 2025

### Added
- Voice slot routing tests
- About dialog with full provider info, contact, disclaimer, and licenses

### Fixed
- Accessibility audit fixes
- Slot B presets and switching now work correctly
- Light theme gaps, gradient header contrast
- Delete orphaned LicensesModal.tsx (fixes release build)

### Changed
- Error boundary added
- Complete light theme support across all components
- Canvas visualizations made theme-aware

## [0.2.0] - 2025

### Added
- Light/dark theme toggle, loading screen, PWA manifest
- Global shortcuts, about modal (web version)
- Parameter suggestions
- Voice playhead animation, parameter tooltips, favicon
- Voice play source/processed, timeline drag-drop, playhead animation, i18n
- Numeric input toggle, share link at startup
- Undo/redo, mutate, JSON import/export, share links, auto-processing
- Deep functional tests for SFX audio generation
- 327+ unit tests: voice presets, effects, DSP, UI store
- Project save/load persistence
- Timeline audio import/export
- Settings, About, and Licenses screens
- Real FFT magnitude spectrum for SFX
- Complete i18n migration of SFX, Voice, and Timeline panels
- Mobile build workflow for iOS and Android (unsigned)
- Branch protection, Dependabot, non-blocking Intel release
- Vercel SPA rewrite rule

### Fixed
- Unused Theme import in App.tsx
- Fix 4 runtime bugs found in audit
- NaN test timeout (use lower sample rate and fast loop)
- StatusBar clock, remove dead Rust struct
- Lint errors and dead code cleanup
- TypeScript build errors
- iOS build compatibility (multiple fixes)
- Unused variable lint errors in functional tests

### Changed
- Redesign Voice panel and polish Timeline consistency
- Redesign SFX panel UX to match CrispFXR-web quality
- Unified release workflow for all platforms
- Upgrade CI and release workflows
- Wire up SFX synth and voice processing
- Remove Vite boilerplate assets

## [0.1.0] - 2024

### Added
- Initial commit: CrispAudio integrated audio workstation
