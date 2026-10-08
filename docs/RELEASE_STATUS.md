# Distribution and platform status — 2026-10-08

Pushing `main` runs CI/web deployment workflows and the unsigned iOS simulator
check. It does **not** automatically
submit an iOS or macOS build to Apple. No release tag or Apple upload was triggered
for the October interview features or touch workflow changes.

| Route | Trigger | Current evidence |
|---|---|---|
| Desktop GitHub bundles | `v*` tag or `release.yml` dispatch | macOS ARM, Windows, Linux jobs configured |
| iOS App Store Connect upload | `v*` tag or `ios-release.yml` dispatch with dry run off | Last run Aug 17 succeeded, including upload step; not independently checked against ASC processing/review status in this audit |
| macOS App Store upload | `mac-v*` tag or `macos-release.yml` dispatch | Last Sep 13 run failed: invalid provisioning profile signature |
| Local macOS testing | local Tauri build | Installed ad-hoc-signed `~/Applications/CrispAudio-local.app`; not an Apple-distributed release |

Evidence: [iOS workflow run](https://github.com/CrispStrobe/crispaudio/actions/runs/32039732193),
[macOS failed run](https://github.com/CrispStrobe/crispaudio/actions/runs/34760697731).
A successful upload step is not proof of Apple processing success, TestFlight
availability, review approval, or public release. Those states need an ASC check.
Note that a generic `v*` release tag also triggers the iOS upload workflow.

## Features by platform

| Capability | Local desktop | iOS/iPadOS | Browser |
|---|---|---|---|
| SFX, voice tools, audio timeline | Yes | Existing mobile implementation | Yes, subject to browser codecs |
| Touch clip actions, mixer, scrubber | Yes | Shared frontend; device validation pending | Yes |
| Automatic Canon/H6 synchronization | Installed FFmpeg/FFprobe required | No | No |
| Video preview + edited MP4 remux | Desktop only | No | No |
| Linked interview project paths | Local desktop | Mac paths inaccessible | No |
| Portable audio project | Yes | Embedded audio | Embedded audio |

## Remaining release gates

- Test the shared editor on actual iPhone and iPad: portrait/landscape, Files,
  export/share, VoiceOver, audio interruptions, foreground/background transitions,
  and memory use with the intended interview length.
- For a complete mobile interview product, implement in-process/native media
  extraction, correlation input, production resampling, video preview, and MP4
  composition/export. Do not expose desktop subprocess commands as working iOS
  features. Add security-scoped media persistence/relocation and a streaming cache.
- For macOS App Store, fix signing/profile validation and validate sandbox file
  access. The Homebrew FFmpeg dependency of the local app has not been established
  as a usable Mac App Store deployment strategy. Bundle/integrate an appropriate
  licensed media implementation before advertising that workflow in the store.
- Check current main CI before tagging. Verify Apple builds in ASC after upload.

See [the interview walkthrough](INTERVIEW_WALKTHROUGH.md) for the working desktop
workflow and the current iOS audio-only preparation/edit/remux workflow.

## Local verification of the October touch changes

Frontend lint/build and 1,147 tests pass. The macOS app was rebuilt and its local
ad-hoc signature verified. Browser workflow checks passed at 375×667, 390×844,
844×390, 1024×768, and 1440×1000, including microphone import/switching, common
splits, seeking, inspector dialogs, touch selection vs. deliberate arrangement,
and undo. The guided desktop setup used mocked native IPC with real excerpt WAV
decoding/video preview; this is not a native dialog/IPC end-to-end test.
No native screenshot capture was repeated after the WindowServer crash.

## Local visual timeline build 0.4.0

Installed and launched `~/Applications/CrispAudio-local.app` with the prepared
MVI_8251 project. Both bundle version fields now read 0.4.0. No Apple upload or
release tag was triggered.

Added a larger/fullscreen viewer, approximate 33 ms seeking, shared-clock video
filmstrip, normalized waveforms and a two-mic alignment inspection overlay.
One source video is locked to its original clock; a persisted, undoable in/out
range exports a single section. Multiple video clips/multicam remain future work.
Desktop FFmpeg is still required; these video features are not available on iOS.

Validation: 1,154 frontend tests, lint/build, 16 native Rust tests and six media
Rust tests pass. Generated-media integration checks cover accurate section first
picture, duration and both audio alternatives, plus invalid ranges/short mixes.
The GUI trimmed-mix backend path has a regression test preventing a second seek.
Full-length compressed video/camera audio hashes still match. Browser checks
cover five touch/desktop viewports; the desktop IPC mock exercised real video
thumbnail generation, alignment comparison and range entry at MacBook size.
This does not establish native WebKit thumbnail or iOS device behavior. Local
native build/signature and process launch were verified without OS screen capture.

## Generic timeline build 0.4.1

The local macOS app now provides a general audio timeline with optional video,
adjacent transport, visible horizontal navigation, independent time zoom/lane
height, Fit all, New project/reset, full project files and reusable track files.
Solo temporarily overrides stored mute in both playback and export. Standalone
camera import is supported; silent video remains unsupported. Auto-sync tracks
reviews native correlation results and applies offsets as one undoable edit;
clock drift is reported, not corrected by this action. Desktop video import still
renders corrected recorder audio. The expanded viewer requests native fullscreen
and has an in-window fallback; Escape restores a fullscreen mode it entered.

Verification: 1,162 frontend tests, lint/build, 17 native Rust tests, six media
Rust tests and generated-media CLI checks pass. Browser checks cover five screen
sizes and the final compact command rows. Mocked native IPC with real media
exercised preview/show/hide/expansion, panning/fit, auto-sync review/apply/undo,
reset/undo and portable track save/load with fresh IDs. These browser checks do
not independently validate native WebKit playback or macOS fullscreen behavior.
The ad-hoc-signed local app is rebuilt/reopened. No release tag or Apple upload.
See [Timeline workflow](TIMELINE_WORKFLOW.md).

## Local 0.5.0 precision and picture editing

The local macOS app adds fitted video overview, draggable cursors, magnetic edge
snapping, precise nudges, track/segment fade envelopes and single-source picture
clips/transitions. Source files remain untouched. Picture and sound edit
independently. Advanced preview is approximate; page peel is a shaded 2D fold.
No new Apple release/tag/upload was requested.

Validation: 1,167 frontend tests, lint/production build, 17 native tests, 8 media
tests; existing generated-media CLI regression and new real-FFmpeg picture
composition checks (cuts, black gaps, fades, 17 transitions, section + trimmed mix,
invalid overlaps). Browser checks at five sizes cover video split/dissolve, fitted
overview under zoom, nudging, mouse/touch cursor dragging, non-activating touch
labels, Voice handoff/return, and rendered audio fade amplitudes including resume.
These use real browser media/audio with mocked native file dialogs/IPC; they do
not replace native WebKit/fullscreen or physical iPhone/iPad testing.

The previous main CI failure exposed FFT tie-dependent confidence for periodic
audio. Sync now rejects templates with a distant correlation peak within 2% of
the winner, excluding a 100 ms neighbourhood of one peak. Repeating tones and
identical broadband material require review on every platform. Unique noisy
signals, inverted quiet signals and measured clock drift remain covered.

## Local 0.6.0 workspace update

See MEDIA_WORKSPACE.md. New desktop work is not an Apple upload or TestFlight
release. New project format is v3; v1/v2 inputs remain supported. Native FFmpeg
operations are desktop-only; no iOS video engine or physical-device validation is
claimed. GUI multi-hour audio remains bounded by decoded-buffer memory.

Verified locally on 2026-10-08: 1,200 frontend tests, 13 media tests and 18
native tests pass; ESLint, TypeScript/Vite and the macOS app build pass. Real
FFmpeg integration covers mixed source dimensions/rates, 40 cuts without
accumulated frame drift, linked CLI edits, rendered automation, project MP4,
loudness and overwrite protection. Browser integration covers two cameras with
linked audio, split/unlink, markers, ripple, transcript import/search/seek,
rendered automation and five desktop/phone viewport sizes. Canon first-frame
capture was checked in WebKit and Chrome; the thumbnail strip additionally uses
a native decoded first tile to avoid WKWebView's black initial canvas. The local
0.6.0 bundle was installed and launched with the preceding arrangement backed up.

Filmstrip follow-up: 1,206 frontend tests pass, including trimmed-start coverage,
multiple-camera retention and serial decoder cancellation. Production image CSP
was checked in WebKit and Chrome with native asset URLs. Real FFmpeg tests
validate thumbnail dimensions, picture pixels and overwrite rejection. Browser
workspace checks also cover per-camera images and IndexedDB audio recovery.
The updated local 0.6.0 app was rebuilt and installed; no Apple upload was made.

## Local 0.6.1 shared timeline

Editable video now shares the audio ruler's zoom, horizontal scroll and cursor.
Project overview is separate in the navigation bar; the playback viewer stays
fitted. The native scrollbar width matches the timeline viewport even with the
workspace open, avoiding scroll position feedback/clamping against window width.

Verified: 1,209 frontend tests, lint, TypeScript/Vite and macOS app build. Browser
checks assert congruent clip/cursor coordinates, overview keyboard and pointer
navigation, real emulated touch swipes without clip mutations, five viewport
sizes and the preceding media workspace/recovery regressions. These are browser
checks, not physical iOS validation. No Apple upload is part of this local update.
