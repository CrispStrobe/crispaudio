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


## Local 0.6.2 timeline usability

Adds video removal with audio retained/links cleared; mouse, emulated touch and
keyboard track reordering; shared 24–640 px row height; inline help; editable POS
and minimum canvas duration; automatic two-picture dissolves on partial overlap;
selected audio S-curve crossfades; a portal-based expanded viewer; staged,
cancellable import into an existing track or a new track per file. Duration and
trash controls remain available in touch layouts. Desktop import retains paths
and avoids the former full encoded-file copy before decoding.

Verified locally: 1,228 frontend tests, ESLint, TypeScript/Vite, 18 native tests,
13 media tests and the macOS bundle build. Real FFmpeg checks include the new
extended black tail, linked CLI edits and preceding composition regressions.
Browser checks exercise real mouse/touch/keyboard ordering, row extremes, help,
POS/DUR edits, linked overlap dissolves, applied audio fade curves, expanded
viewer viewport geometry, removal/undo, both import destinations and five
viewport sizes. A 253.72 s H6 mono WAV imported in 3.6–4.7 s in Chrome with
responsive timer ticks, including fixture transfer, decode and waveform scan.
That is a browser measurement, not a native file-read or compressed-audio promise.
Native macOS fullscreen was requested through permitted window APIs; these browser
checks do not prove physical fullscreen, iOS hardware behavior or long-file memory
paging. No Apple upload or release tag is part of this local update.

The ad-hoc-signed 0.6.2 local app is installed and running at
`~/Applications/CrispAudio-local.app`. Before quitting 0.6.1, the current autosave
and complete WebKit recovery store were backed up under the private validation
folder (`ux/native-autosave-before-062.json`, `ux/recovery-before-062/WebKit`).
The ordinary Workspace → Recover last arrangement action can resume the cache;
installation does not substitute an older interview project for current work.


## Local 0.6.3 preview and position follow-up

Picture gaps and extended tails now show intentional black without preparing an
unrelated default camera or holding up audio startup. The hidden last decoder is
retained across gaps. Expanded frame stepping follows project FPS and the full
canvas. Fullscreen failure notices stay inside the viewer; late browser requests
are exited after close, and preexisting fullscreen is preserved. Typed POS uses
the scrubber's viewport-follow rules while stopping playback for an exact seek.

Verified: all 1,234 frontend tests, lint, TypeScript/Vite and macOS bundle build.
New regressions cover gap startup, secondary-source decoder retention, fullscreen
tail stepping, late browser fullscreen completion, visible failure notices and
typed position scrolling. Browser checks additionally exercise real audio
playback inside a picture gap, no extra source preparation, visible cursor after
typed seek, expanded black tail/frame stepping, Escape and picture restoration.
Native fullscreen and physical iOS remain outside these browser checks.

Installed and launched the ad-hoc-signed local 0.6.3 app. Current autosave and
WebKit recovery were preserved in the private validation folder under
`ux/native-autosave-before-063.json` and `ux/recovery-before-063/WebKit`.
Temporary Vite servers from this editor validation were stopped. No Apple upload
or release tag was requested. Native/media code is unchanged from tested 0.6.2.


## Local 0.6.4 interaction follow-up

Expanded viewer now traps focus and owns keyboard events. Left/Right steps frames,
Space toggles playback, Escape closes and focus returns to the compact expand
button. Underlying clip editing shortcuts cannot alter the arrangement from the
viewer. Track grips scroll at vertical edges, permit drops over waveforms and
cancel on Escape/pointer cancellation/lost capture. Compact header controls fit
24–96 px rows, preserve readable names and retain audible/silent status; full
mixer controls return at 56 px on desktop and 96 px on touch. Playhead hit regions
are clipped to the viewport instead of extending over neighbouring headers.

Verified: all 1,235 frontend tests, lint, TypeScript/Vite and macOS bundle build.
Browser integration uses 14 tracks to check mouse and emulated touch edge-scroll
drops, cancellation, Undo and unchanged timing; compact header geometry at 24,
56, 80 and 96 px; zero-position header hit testing; selected clips under isolated
viewer arrows/Delete/Undo/Space; Tab wrap, Escape/focus restoration and four
responsive viewports. Native fullscreen/physical iOS remain outside these browser
checks. Both desktop and iOS CI for preceding 0.6.3 completed successfully.

The ad-hoc-signed 0.6.4 local app is installed and launched. Current autosave and
complete WebKit recovery were preserved under the private validation folder's
`ux/native-autosave-before-064.json` and `ux/recovery-before-064/WebKit`. The test
preview server was stopped. Native/media implementation is unchanged; no Apple
upload or release tag was requested.
