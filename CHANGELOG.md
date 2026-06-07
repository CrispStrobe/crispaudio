# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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

### Changed
- SFX/Voice WAV export now uses Rust encoder (supports 8/16/24/32-bit natively)
- Color contrast improved: --text-secondary and --text-muted differentiated
- Error handling hardened: projectFile/projectIO try/catch on all async paths
- Branded loading spinner replaces plain text Suspense fallback

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
