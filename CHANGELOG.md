# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased — local version 0.5.0]

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
