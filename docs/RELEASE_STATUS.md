# Distribution and platform status — 2026-10-09

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

## Local 0.6.5 inspector follow-up

Existing picture overlaps can change transition style while retaining their exact
interval and linked audio. Changing overlap length or removing a linked overlap
requires unlinking. Typed picture edits commit on Enter and cancel on Escape;
source-bound violations reject the whole edit, including linked sound. Merely
focusing a numeric field does not round timing or create undo history. Inspector
edits preserve linked selection IDs and update their time bounds. Toolbar layout
and overflow-menu fixes from the parallel layout update are included.

Verified: 79 frontend suites / 1,247 tests, lint, and desktop/phone-sized browser
checks for linked style changes, bounds rejection, Escape, picture-only fades,
linked move/Undo, unlinked overlap duration and responsive inspector layout.
Browser media uses short real media fixtures with mocked native file commands;
these checks do not establish physical iOS behavior. Both desktop and iOS CI for
0.6.4 passed. Native/media implementation is unchanged.

TypeScript/Vite and the macOS bundle build passed. The combined ad-hoc-signed
0.6.5 app is installed and launched at `~/Applications/CrispAudio-local.app`.
The current autosave and WebKit recovery store were preserved under the private
validation folder's `ux/native-autosave-before-065.json` and
`ux/recovery-before-065/WebKit`. No Apple upload or release tag is included.

## Local 0.6.6 toolbar follow-up

Video/sync actions and More share the top scrolling toolbar. Explicit square
icon targets center SVGs in transport and toolbar controls. The More menu portals
above app panels at z-index 1000 and stays within the main content area when space
permits. Touch tooltip portals escape toolbar clipping. The waveform display
switch and navigation gesture hint use icons with hover/hold help; project
navigation has no permanent overview heading. Explicit WebKit selection rules
prevent accidental label selection while retaining editable/diagnostic text.

Chrome and WebKit browser checks at 1440×960, 1024×768 and 390×844 verify icon
centering, a single file/media toolbar row, menu hit testing and viewport bounds,
unselectable navigation and no page overflow. Physical iOS is not covered.

All 79 frontend suites / 1,247 tests, lint, TypeScript/Vite and macOS bundle build
passed. The ad-hoc-signed 0.6.6 local app is installed and running. Current autosave
and full WebKit recovery were backed up as `ux/native-autosave-before-066.json`
and `ux/recovery-before-066/WebKit` in the private validation folder. No Apple
submission or release tag is included; native/media code is unchanged.

## Local 0.6.7 contextual help

The top question mark toggles an inspection mode instead of opening a manual.
Highlighted controls show one explanation beside the hovered, focused or tapped
control, including disabled actions. Help taps and editing keys cannot modify
the arrangement. Escape, the help toggle or the status close button exits help.
English/German topics cover move/trim, snapping, clip edits, track ordering,
transport, mixer, time fields, imports and navigation. Focusing and leaving a
POS/DUR field also preserves its exact unrounded value without a commit.

Verified: full frontend run passed 80 suites / 1,250 tests; the final time-field
precision regression and contextual-help suite then passed all six focused tests.
Lint passed. Chrome and WebKit integration at desktop, tablet and phone sizes
verified anchored explanations, viewport bounds, hover, tap without activation,
keyboard focus, Escape and restored editing. Physical iOS remains untested.

TypeScript/Vite and the macOS app bundle build passed. The ad-hoc-signed local
0.6.7 app is installed and launched. Autosave and full WebKit recovery were backed
up under the private validation folder's `ux/native-autosave-before-067.json`
and `ux/recovery-before-067/WebKit`. No release tag or Apple upload is included.

## Local 0.6.8 native menus and SFX view

macOS now installs File, Edit, View, Playback, Window and Help menus. Custom
commands route to existing frontend actions; lazy timeline activation retains a
pending file/view command. AppKit responder actions handle focused text editing;
clip commands use the project clipboard. Undo/Redo selects the active panel's
history. Enabled states follow selection, clipboard, history, modal/help state
and asynchronous commands. Native accelerators own their shortcuts to avoid
applying the same command twice. Menu labels follow English/German UI language.

SFX presets use sound-type icons and wrapping labels on neutral cards. Playback
and export commands use compact icon controls. A single active-output waveform
replaces two misleading copies of the same buffer; duration, peak and RMS report
that actual output. Secondary analysis and quality/preset-file panels collapse.
See `docs/SFX_WORKFLOW.md` for the workflow and possible later visualizations.

Verified: 81 frontend suites / 1,257 tests, lint, TypeScript/Vite, Rust check and
18 native library tests. Routing regressions cover lazy activation, text editing,
modal/help guards, asynchronous duplicate protection and active SFX history.
Chrome/WebKit checks at desktop, tablet and phone sizes verify all 16 preset icons,
German label bounds, active-slot waveform labeling, menu dispatch from SFX into
Timeline, zoom/height and Undo/Redo. These browser checks omit native OS menu
clicks; physical macOS responder behavior and physical iOS remain outside them.

The macOS app bundle build passed. The ad-hoc-signed 0.6.8 local app is installed
and launched. Current autosave and WebKit recovery were backed up under the
private validation folder's `ux/native-autosave-before-068.json` and
`ux/recovery-before-068/WebKit`. No Apple upload or release tag is included.

## Local 0.6.9 — simultaneous SFX slots and real spectrograms

SFX presets are one always-visible horizontally scrollable row. A/B waveforms
now use separate cached slot renders, preserving the actual noise samples when
switching slots. Output refreshes after undo, morphing and sample-rate changes.
Voice uses the same neutral icon preset strip and compact action controls, with
parallel original/processed waveforms. Its old loudness-based pseudo-spectrum
has been replaced with a genuine time-frequency analysis.

Both panels show Hann-window 1024-point FFT spectrograms, actual time/frequency
axes and a fixed −90 to 0 dBFS amplitude scale. Work is bounded at 256 uniformly
spaced windows; longer buffers explicitly say they are sampled overviews. Voice
analyzes its first channel. See `docs/SFX_WORKFLOW.md` for limits and workflow.

Verified: 82 frontend suites / 1,261 tests, lint, TypeScript/Vite and macOS app
bundle build. New tests check tone frequency/amplitude, frequency changes over
time, silence, bounded long-buffer analysis and independent stable A/B renders.
Chrome and WebKit checks cover both panels in German at 1440, 1024 and 390 px,
including single-row preset bounds, horizontal scrolling, parallel waveforms and
populated spectrogram canvases. Physical iOS testing remains pending.

Installed and launched ad-hoc-signed 0.6.9 at `~/Applications/CrispAudio-local.app`.
Backups: private validation `ux/native-autosave-before-069.json` and
`ux/recovery-before-069/WebKit`. No release tag or Apple upload was triggered.

## Local 0.6.10 — collapsible analysis, fades and shared FX racks

Frequency spectrum bars are restored beside the spectrogram in SFX and Voice.
Presets and waveform sections can collapse; spectrum/spectrogram start closed
and unmount their analysis while hidden. Spectrum labels follow sample rate.

Clip, track and master racks share parameter editing, reordering, bypass,
removal and independent copy/replace. Track/master racks are in the mixer.
Realtime playback now runs master FX consistently with offline GUI export, and
stop/restart disposes its effect graph and modulation oscillators. Rack edits
stop playback so the next audition uses the reviewed settings.

The fade tool applies durations/curves to selected AV clips in one undo step,
without moving or trimming them. Video has draggable, frame-quantized fade
handles and an opacity envelope. Overlapping video fade-in/out is accepted
within each clip length; preview multiplication matches the native filters.
See [Fades and effects](DAW_EFFECTS.md) for workflow and current limitations.

Verified: 85 frontend suites / 1,269 tests, lint, TypeScript/Vite, 13 media tests
and one explicitly run FFmpeg integration test. The FFmpeg test exports a white
clip with overlapping fades and measures the expected 25% midpoint luminance.
Chrome and WebKit German desktop/phone checks cover collapse/reopen, both FFT
views, batch AV fades, picture fade dragging/undo and cross-scope rack copy.
Their actual Web Audio engines produce identical samples for realtime-graph
versus export-graph rendering with chorus and a low-pass master filter; maximum
sample difference is zero in each browser. These are buffer/graph tests, not a
physical output-device or iOS test.

The macOS bundle passed, was ad-hoc signed, installed at
`~/Applications/CrispAudio-local.app` and launched as 0.6.10. Current autosave and
WebKit recovery were backed up under private validation
`ux/native-autosave-before-0610.json` and `ux/recovery-before-0610/WebKit`.
No Apple upload or release tag was triggered. Native CLI project rendering still
rejects unsupported FX; GUI export is required for full Web Audio racks.

## Local 0.6.11 verification

Installed and opened `~/Applications/CrispAudio-local.app` version 0.6.11 on
October 8, 2026, preserving and backing up the native WebKit data and autosave.
Ad-hoc signature verification passed. No release tag or Apple upload was made.

- Frontend: 87 suites / 1,274 tests passed; lint and TypeScript/Vite build passed.
- Native desktop command tests: 18 passed.
- Shared media: 15 tests passed, two FFmpeg integration tests opt-in. The colour
  export/bypass integration test was explicitly run and passed with real FFmpeg.
- WebKit browser: actual video decoding and anonymous CORS canvas pixel access,
  colour inspector controls, CSS preview, exact custom-transition reference
  pixels, bypass/reset, desktop and phone layout bounds passed. WebKit reported
  no Canvas2D filter support; the explicit RGB path still passed.
- The native app bundle built successfully. Device testing on iPhone/iPad and
  Apple distribution remain separate release gates.

See [picture colour correction](VIDEO_COLOR.md) for GUI and CLI usage.

## Local 0.6.12 verification

Added per-picture rotation and mirroring; see [orientation workflow](VIDEO_ORIENTATION.md).
The local macOS bundle is ad-hoc signed; this work does not trigger an Apple upload.

- Frontend coverage: 89 suites / 1,280 tests passed across the suite and targeted
  reruns. Three worker-start timeouts in the full run passed with one worker;
  the viewer suite was rerun after the final transition-layer fix (11 tests).
- Shared media: 16 regular tests passed. All three opt-in FFmpeg integration tests
  passed, covering colour/bypass, overlapping fades, and a quarter-turn followed
  by mirroring with measured corner colours and black padding.
- WebKit: actual video preview orientation, deterministic canvas corner pixels,
  colour transition regression, bypass/reset and English/German desktop/phone
  bounds passed without page errors. Preview reference pixels matched exactly.
- Lint, TypeScript/Vite and the native app bundle build passed. Physical iOS/iPadOS
  testing and Apple distribution remain separate release gates.

The preview separates source orientation from composition transitions, so a wipe
or slide keeps its screen direction after source rotation. Resize recalculates
picture fitting, including the expanded viewer. Source thumbnails are unchanged.


## Local formats and Apple media backend 0.7.0

Adds 24-bit FLAC audio export across SFX, Voice and Timeline, native macOS 13+
media preparation and edited MP4/MOV export, explicit export backend selection,
and optional FFmpeg WebM VP9/Opus and AV1/Opus exports. Full Glint/libFLAC/wrapper
copyright notices are embedded in About. See MEDIA_FORMATS_AND_LICENSES.md for
format variants, codec patent scope and the remaining compatibility dependency.

Validation: 90 frontend suites / 1,283 tests; actual WebKit worker FLAC output
passed `flac -t` with its final MD5 and decoded within 24-bit quantization error.
WebKit export options passed EN/DE desktop/phone layout checks with mocked IPC.
Native reference renders covered colour/bypass, orientation and multiplicative
fades; integration covered black gaps/tails, section audio, native MOV, unsupported
transition rejection and optional VP9/AV1 WebM codec identification. Browser checks
are not native IPC or physical iOS validation.

The native Apple helper is desktop macOS only. Advanced transitions, CLI project
audio rendering, long-file alignment/DSP and WebM still require optional FFmpeg.
No permissive-only bundled WebM implementation is claimed. No Apple upload or
release tag was triggered for this milestone. Store sandboxing/signing and actual
iOS device validation remain release gates.

Installed and launched ad-hoc-signed `~/Applications/CrispAudio-local.app` 0.7.0.
The existing native autosave and WebKit state were backed up privately and retained.
Final checks: frontend lint/typecheck/production bundle; 16 media unit tests,
one CLI parser test, 18 Tauri tests, four explicit media integration tests,
including a two-source native dissolve and native reference renders with the
application's FFmpeg/FFprobe paths set to nonexistent files. Desktop signature
verification passed. No release tag, TestFlight or App Store submission was made.


## Local native transitions build 0.7.1

Installed and launched `~/Applications/CrispAudio-local.app` 0.7.1 with its ad-hoc
signature verified and the existing autosave/WebKit state backed up and retained.
Every listed transition now has an Apple renderer, including directional
wipes/pushes, black/white dips, blur, zoom, pixelation, whip, glitch and shaded 2D
page peel. Whip/glitch/page peel require a Metal GPU with dynamic library support;
older Intel GPUs have not been established as compatible. Strict Apple mode fails
explicitly instead of switching backends. Complex renderers/previews are approximate
equivalents, not pixel-identical FFmpeg replacements.

All 21 media tests (including five explicit integration tests) and the CLI parser
test passed. The 17-transition frame test also passed with the application's
FFmpeg/FFprobe paths unavailable. It verifies intact endpoints, overlap effects,
dip midpoints and all four wipe/push directions. Existing orientation, colour,
multiplicative fades, section audio and black gap/tail tests passed. Frontend lint,
typecheck and production desktop bundle passed.

Actual 640×360 interview footage was rendered with native whip, glitch and page
peel, then decoded and visually inspected. The 2.4-second excerpts took 1.609,
0.385 and 0.381 seconds respectively in one run; these small excerpts are not a
full-resolution benchmark. Validation artifacts remain outside git. The previous
0.7.0 commit passed GitHub CI and the unsigned iOS simulator build; that does not
establish native video support on iOS. No release tag or Apple submission was made.


## Local native CLI mixer build 0.7.2

Installed and launched `~/Applications/CrispAudio-local.app` 0.7.2 and installed
`~/Applications/crispaudio-cli-local`. Both local ad-hoc signatures verify.
The existing native autosave and WebKit state were backed up and retained.

The CLI streams linked projects to 48 kHz stereo float WAV. It supports mono and
stereo pan, stored mute overridden by solo, source trims/offsets, overlaps, gains,
clip/track fade curves, automation and low/high-pass clip/track/master racks.
Unsupported enabled DSP fails explicitly. PCM WAV inputs are read directly;
other mono/stereo layouts use Apple float decoding/resampling on Mac. Standard
WAV size and 256 audible clip limits apply. The GUI still renders through Web Audio
with duration-sized buffers; this is not a GUI disk-paging change.

Validation: six actual WebKit TimelineEngine vs native CLI renders (mono/stereo,
left/centre/right pan, overlapping clips, sampled fades, automation and all three
filter racks) agreed within maximum 1.42e-7 / RMS 1.15e-8. Native decoding/resampling
from 44.1 kHz/24-bit mono and full project-to-section-video export passed with the
application's FFmpeg/FFprobe paths unavailable. Integer PCM depths, gain headroom,
source offsets, cancellation/cleanup, bounds and no-overwrite have unit coverage.
All 27 media tests, including six integration tests, and the CLI parser test
passed; frontend lint/typecheck and the production desktop bundle passed. See MEDIA_FORMATS_AND_LICENSES.md for scope.

The real 253.72-second MVI_8251 linked project produced a stereo 48 kHz float mix
in 10.53 seconds with 4,259,840 bytes peak CLI resident memory in one debug run.
That excludes OS cache/other processes and is not whole-GUI memory use. Its 30–38 s
section also rendered natively to 1920×1080 H.264/AAC MP4 (8.0 s output) in 15.1 s,
including the full audio mix. Validation files remain private outside git.
No release tag, TestFlight or App Store submission was made.

## Local native effects build 0.7.3

Installed, ad-hoc signed and launched `~/Applications/CrispAudio-local.app` 0.7.3;
updated the signed `~/Applications/crispaudio-cli-local` command too. Backed up
native WebKit state and confirmed the autosaved arrangement remained unchanged.
No Apple submission, release tag or TestFlight upload was made.

Native CLI clip/track/master racks now support bit crushing and ring modulation
in addition to low/high-pass filters. Fixed two shared GUI DSP bugs: ring
modulation scales the carrier instead of adding it at full strength regardless
of mix, and symmetric bit-crusher quantisation keeps silence at zero. Existing
saved values still load, but these effects intentionally sound different from
older builds. Voice uses the corrected ring-modulator graph too.

Validation: 90 frontend suites / 1,284 tests passed, ESLint passed, and the Tauri
production frontend plus debug macOS bundle built successfully. Media Rust tests:
23 passed, six desktop integration tests remained opt-in; one CLI parser test
passed. New PCM regressions check wet/dry endpoints, silence, quantisation and
absolute oscillator phase for later clips. Previous 0.7.2 desktop and iOS CI
both passed; this build's CI is triggered by its main push.

Six real WebKit OfflineAudioContext/native CLI comparisons combine overlapping
clips, later starts, nonlinear fades, automation, pan and all three racks.
Wet/dry settings 0, 0.35 and 1 passed for both effects. Maximum sample error was
3.51e-5 for bit crushing (RMS 3.35e-7) and 3.06e-7 for ring modulation (RMS
2.72e-8). These are fixture measurements, not proof of sample-identical behavior
for all inputs. Implementation follows the Web Audio waveshaper interpolation
and additive AudioParam semantics: https://www.w3.org/TR/webaudio-1.0/.
Private reproducible harness and PCM/results are outside git:
`.crisperweaver-deps/crispaudio-browser/native-mix-073.mjs` and
`transcripts/2026-Studienwoche/CrispAudio-validation/ux/native-mix-073/` under
`~/code`. Native rendering was tested with FFmpeg/FFprobe paths disabled;
FFmpeg only decoded the resulting WAV for the independent comparison.

No codec dependencies or licensing scope changed. Native delay, chorus, reverb,
oversampled distortion and compressor remain unsupported and fail explicitly;
GUI Web Audio handles them. Disk-paged GUI rendering, a permissive-only WebM
backend and iOS picture export are still unfinished.

## Local native delay/chorus build 0.7.4

Installed, ad-hoc signed and launched `~/Applications/CrispAudio-local.app` 0.7.4;
updated and verified the signed standalone CLI too. Native WebKit state was backed
up and the autosaved arrangement was confirmed unchanged. No release tag,
TestFlight upload or Apple submission was made.

Native clip/track/master racks now include delay and chorus. Delay preserves
fractional timing and the measured macOS WebKit feedback-branch latency of 128
frames; its direct delay is not clamped to that minimum. An impulse through the
actual GUI graph at zero delay appears immediately, then repeats at frame 128;
a 48-frame delay first appears at frame 48 and repeats at frame 224. This is a
measured WebKit compatibility choice, not a claim that all Web Audio engines
have identical cyclic timing. Chorus retains the two wet delay lines and their
absolute render-context LFO phases. Existing GUI effects/settings are unchanged.
Tails continue inside the chosen canvas; clip fades still follow clip FX.
All audible racks have a 64 MiB delay-buffer budget and a 1024-enabled-effect
limit, checked before buffer allocation. Reverb/distortion/compressor remain
explicit native errors and work through GUI Web Audio export.

Validation: 27 media Rust tests and one CLI parser test passed; six older desktop
integration tests remain opt-in and were not rerun for this DSP-only change.
New regressions verify one-frame clip tails, stereo echoes, fractional interpolation,
chorus dry/wet endpoints and allocation/count limits. ESLint, frontend TypeScript
compilation/production bundling and the debug macOS app build passed. Full frontend
1,284-test coverage last ran in 0.7.3; that commit's desktop and iOS CI both passed.
This build changes native DSP, documentation and version labels; its main push
triggers fresh CI.

`scripts/test-native-effects.mjs` is a reusable 27-case comparison with actual
WebKit `TimelineEngine` rendering: stereo/mono, all three racks, delayed starts,
overlaps, pan, sampled fades, automation, maximum two-second delay and modulation.
FFmpeg/FFprobe are disabled, and WAV/extensible float PCM is read directly.
The largest measured sample error/RMS was 8.35e-7/8.82e-8 for delay,
3.56e-5/1.07e-6 for chorus, 3.51e-5/3.35e-7 for bit crushing and
3.06e-7/2.72e-8 for ring modulation. Fixture results do not establish universal
sample identity. The harness retains its owned temporary fixtures; an archived
copy lives outside git at `~/code/transcripts/2026-Studienwoche/CrispAudio-validation/ux/native-effects-074/`.

A real interview section, source time 30–38 seconds, rendered with clip delay
and master chorus in 0.77 seconds (0.68 user / 0.05 system), about 10.4 times faster
than playback, in the debug CLI. Peak CLI RSS was 4,440,064 bytes (4.23 MiB).
This single warm-cache run uses directly decoded 48 kHz WAV and excludes OS cache
and other processes; it is not a general codec or release-build benchmark.
Its derived project and WAV are outside git under `ux/real-interview-074-41c0dujw/`
in that same private validation folder. Original sources/projects were unchanged.

No codec dependencies or licensing scope changed. GUI disk-paged rendering,
permissive-only WebM and iOS picture export remain unfinished.

## Local native convolution build 0.7.5

Installed, ad-hoc signed and launched `~/Applications/CrispAudio-local.app` 0.7.5;
installed and verified the optimised release build of the standalone CLI at
`~/Applications/crispaudio-cli-local`. Backed up native WebKit state and confirmed
the autosaved arrangement unchanged. No release tag, TestFlight upload or Apple
submission was made.

Native clip/track/master racks now include convolution reverb. Its seeded stereo
impulse, 0.1–5 second length, decay and dry/wet blend match the existing GUI.
RMS normalisation uses WebKit's -58 dB calibration rather than the specification's
rounded constant. References: [WebKit](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/audio/Reverb.cpp),
[Web Audio](https://www.w3.org/TR/webaudio-1.0/#ConvolverNode). The convolution code
is our implementation, using the existing RustFFT dependency; no WebKit code is
bundled or ported. Thirty-two direct early samples plus nonuniform FFT tail
bands and a uniform later frequency-delay line introduce no extra latency.
Mono sources become stereo before the track's pan law, including at mix=0.
Conservative convolution-buffer reservations share the existing 64 MiB budget;
very large racks fail explicitly. Preparation observes cancellation. FFT plan
metadata and general process memory are separate from that DSP-buffer budget.
Distortion and compression remain explicit native errors; GUI export handles them.

Validation: 30 media Rust tests and one CLI parser test passed; six existing
native-video integration tests remain opt-in and were not rerun for this DSP
change. New checks compare partition boundaries with independent sparse
convolution, verify seeded stereo reproducibility, and render a one-frame clip's
complete reverb tail. ESLint, frontend TypeScript/production build and the debug
macOS bundle passed. All 35 real WebKit/native release-CLI comparisons passed,
including eight reverb cases (sizes, mono, dry/wet endpoints, short decay,
impulses and five-second tails). Maximum reverb sample error was 3.20e-7;
maximum RMS error was 8.43e-8. Fixtures establish measured agreement, not
sample identity for every possible project/browser. A development-server
reload interrupted an earlier run; the full stable-file rerun passed.
Archived fixtures/results are outside git under
`~/code/transcripts/2026-Studienwoche/CrispAudio-validation/ux/native-reverb-075/`.

The real interview's source time 30–38 seconds, with master reverb size=0.5,
decay=1.5 and mix=0.3, rendered in 0.30 seconds (0.25 user / 0.03 system) with
the release CLI, about 26.7 times faster than playback. Peak CLI RSS was
12,681,216 bytes (12.09 MiB). The debug CLI took 16.32 seconds; its PCM was
identical to the release output for this section. These are single warm-cache
runs on direct 48 kHz WAV, excluding OS cache and other processes; do not
extrapolate them to all codecs or effects. Private derived project/audio lives
under `ux/real-reverb-075-nby481qp/` in that same validation folder. Originals
were unchanged. The GUI audio renderer still uses Web Audio.

RustFFT 6.4.1 and its strength_reduce, transpose, num-complex, num-integer,
num-traits and primal-check dependencies were already linked. Their MIT option
notices are now bundled in About, and the generated manifest has 24 entries.
No new codec/GPL dependency was added. GUI disk-paged rendering, permissive-only
WebM and iOS picture export remain unfinished.

## Local native oversampling build 0.7.6

Installed, ad-hoc signed and launched `~/Applications/CrispAudio-local.app` 0.7.6;
updated and verified the optimised `~/Applications/crispaudio-cli-local`. Native
WebKit state was backed up and the autosaved arrangement confirmed unchanged.
No release tag, TestFlight upload or Apple submission was made.

Native clip/track/master racks now support timeline distortion: the existing
256-entry Float32 tanh curve and four-times oversampling. Two upsampling stages
and two downsampling stages retain the GUI wet path's 192-frame filter delay
(4 ms at 48 kHz); dry sound stays immediate. Do not move clips or automation to
compensate. Filter tails continue after short clips inside the chosen canvas.
Stereo state is bounded and reserved in the shared DSP budget before allocation.
Timeline does not yet expose other distortion algorithms; GUI settings/behaviour
remain unchanged. Compressor is the only remaining unsupported native rack type.

Resampling kernels and phase conventions adapt WebKit's [UpSampler](https://github.com/WebKit/WebKit/blob/ae88abe108bcccf28bd309adeed1d0522595e901/Source/WebCore/platform/audio/UpSampler.cpp)
and [DownSampler](https://github.com/WebKit/WebKit/blob/ae88abe108bcccf28bd309adeed1d0522595e901/Source/WebCore/platform/audio/DownSampler.cpp)
under BSD-3-Clause. Their copyright and complete licence are retained in the Rust
source and bundled About notice; the source revision is pinned. The generated
manifest has 25 entries. This is compatible with the requested permissive licence
scope and adds no codec, GPL binary or package dependency.

Validation: 33 media Rust tests plus one CLI parser test passed; six existing
video integration tests remain opt-in and were not rerun for this DSP change.
New checks cover exact dry output, silence, stereo polarity, wet impulse delay
and a one-frame clip's filter tail. ESLint, frontend TypeScript/production build,
release CLI and debug macOS app bundle passed. All 47 actual WebKit/native
comparisons passed, including 12 distortion cases across drive/mix settings,
mono, unfiltered impulses and 18/19.5 kHz tones. Maximum distortion sample error
was 3.86e-6 and maximum RMS error 1.41e-7. The high-frequency case's maximum error
was 6.86e-7; tests compare waveforms and timing, not a universal proof of alias
suppression or sample identity. Archived fixtures/results live outside git under
`~/code/transcripts/2026-Studienwoche/CrispAudio-validation/ux/native-distortion-076/`.
The previous 0.7.5 commit passed both desktop and iOS CI; this push triggers new CI.

The real interview source section 30–38 seconds, with master drive=0.5 and
mix=0.4, rendered in 0.45 seconds (0.43 user / 0.01 system) using the optimised
CLI, about 17.8 times faster than playback. Peak CLI RSS was 2,703,360 bytes
(2.58 MiB). This single warm-cache run uses direct 48 kHz WAV and excludes OS
cache and other processes; do not extrapolate to all codecs or racks. The private
derived project and WAV live under `ux/real-distortion-076-4p_7hl9t/` in the same
validation folder. Original sources/projects were unchanged.

Compression still requires GUI export. GUI disk-paged rendering, permissive-only
WebM and iOS picture export also remain unfinished.
