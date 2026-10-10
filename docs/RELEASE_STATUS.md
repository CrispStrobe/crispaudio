# Distribution and platform status — 2026-10-10

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

## Local 0.7.7 — native stereo-linked compression

Installed and launched `~/Applications/CrispAudio-local.app` version 0.7.7 and
replaced `~/Applications/crispaudio-cli-local` with the optimised standalone CLI.
Both ad-hoc signatures verified. WebKit state and the one saved autosave were
backed up under `ux/recovery-before-077/`; the autosave JSON remains unchanged.
No release tag or Apple upload was requested for this local increment.

Every current timeline rack type now works in native linked-project CLI export.
Compression reproduces the Mac GUI's soft knee, maximum-of-stereo detector,
automatic makeup, adaptive release and 288-frame lookahead at 48 kHz. Its control
envelope uses 32-frame project-clock divisions. Clip racks with a compressor
process pre-start silence without consuming source samples. Mono becomes stereo
before pan. Fixed state counts toward the shared 64 MiB DSP budget. Unknown
enabled types still fail; source files and saved projects remain untouched.

The implementation adapts WebKit DynamicsCompressorKernel at revision
`ae88abe108bcccf28bd309adeed1d0522595e901` under BSD-3-Clause. The Google 2011
copyright and full notice are retained in the Rust source and bundled in About;
the generated manifest now contains 26 entries. No new dependency was added.

Validation: 35 media Rust tests and one CLI parser test passed, including linked
stereo impulse delay and finite zero-release/silence output. Six existing native
video integrations remain opt-in and were not repeated for this audio change.
ESLint, TypeScript/production build, optimised CLI and debug macOS app bundle
passed. The complete actual-WebKit/native comparison passed 56 cases, nine for
compression including defaults, 1:1 ratio, mono, parameter endpoints, unequal
stereo bursts, impulses, overlapping clips and all three rack levels. Compressor
cases below full scale had maximum sample error 1.17e-6 and RMS error 5.41e-8.
Extreme cascaded makeup exceeds unity in float output; above full scale the
comparison scales tolerances by the reference peak and does not alter PCM.
The largest compressor peak-normalised sample error was 1.17e-6. An initial full
run exceeded tolerance on an existing chorus case; the unchanged repeat passed.
No chorus change is included, and browser-run variability remains a validation
limitation. Fixtures/results are archived outside git in `ux/native-compressor-077/`.
Both desktop and iOS CI passed the previous 0.7.6 commit; this push starts new CI.

The interview's 30–38 second section with default master compression rendered
in 0.20 seconds (0.10 user / 0.02 system), 40 times faster than playback, using
the optimised CLI. Peak CLI RSS was 2,703,360 bytes (2.58 MiB). This single
warm-cache measurement uses direct 48 kHz PCM and excludes OS cache and other
processes; it is not a general codec/rack benchmark. The derived project and WAV
are in `ux/real-compressor-077-oh72nntf/`; originals were not rewritten.

GUI disk-paged rendering, permissive-only WebM and iOS picture export remain
unfinished. The CLI audio endpoint still writes float WAV; GUI encoder workers
provide the separate compressed-audio formats.

## Local 0.7.8 — native mixing in GUI video export

Installed and launched `~/Applications/CrispAudio-local.app` version 0.7.8;
updated the optimised standalone CLI. Both ad-hoc signatures verified. The one
saved autosave remains unchanged; WebKit data and its JSON are backed up under
`ux/recovery-before-078/`. No release tag or Apple upload was triggered.

Mac GUI video export now streams the audio of linked 48 kHz mono/stereo projects
with the same bounded native DSP mixer used by the CLI. The IPC request carries
paths and project settings, never decoded PCM. Native mixing feeds the selected
picture backend: Apple MP4/MOV or optional FFmpeg compatibility/WebM. Native
mix errors remain visible without an automatic audio-mixer fallback. The owned
full-clock mix retains prior effect history for a later selected section and
is sought exactly once during composition. Temporary media is removed on all
exits. Cancellation uses the same registered/retried media-job mechanism for
both native and Web Audio paths.

Only audible referenced sources determine eligibility. Solo overrides stored
mute state; muted/unreferenced generated sounds do not block native rendering.
Audible in-memory sounds, multichannel sources, non-48-kHz projects and other
platforms retain Web Audio. Import and playback still hold decoded source buffers;
this removes the extra full render/PCM transfer during eligible video export.
Audio-only GUI export remains on Web Audio and the encoder worker. No new codec
or dependency was added; the 26-entry licence manifest remains unchanged.

Validation: 16 targeted frontend tests passed, including seven new eligibility,
error, fallback, cleanup and cancellation checks. ESLint, TypeScript/production
build, optimised CLI and debug macOS bundle passed. All 35 ordinary media Rust
tests and the CLI parser test passed; seven native video integrations are opt-in.
The new native section integration was explicitly run and passed: source audio
is silent outside seconds 1–2, and both ends of that selected export contain the
expected tone. It also checks section length, invalid range and output protection.
The six older picture integrations were not repeated; DSP waveforms were unchanged
and the previous version's 56 WebKit/native comparisons were not repeated here.
Both desktop and iOS CI passed 0.7.7; this push starts new CI.

A private derivative of the real interview project exported seconds 30–38 with
default master compression in 5.37 seconds (2.85 user / 0.62 system). This includes
mixing the original full 253.72-second audio clock and composing the eight-second
picture section. Apple probing reports exactly 8.0 seconds, stereo 48 kHz and video;
independent decoding produced 384,000 frames with RMS 0.0833. macOS time reported
peak RSS 68,386,816 bytes (65.2 MiB); this is not a complete memory measurement of
the editor, OS cache or concurrent processes. No universal speedup is inferred
from this single run. The project, output and measurements live outside git in
`ux/real-video-export-078-vnnokm9p/`; original recordings/projects were untouched.

Remaining work includes disk-paged import/playback and audio-only GUI export,
permissive-only WebM and iOS picture composition.

## Local 0.7.9 — direct desktop timeline WAV

Installed and launched `~/Applications/CrispAudio-local.app` version 0.7.9 and
updated the optimised standalone CLI. Both ad-hoc signatures verified; the one
autosave JSON remains unchanged. WebKit state and autosave are backed up under
`ux/recovery-before-079/`. No release tag or Apple upload was triggered.

Eligible Mac timeline WAV exports use the linked native mixer directly. The save
dialog runs first, then the cancellable job writes the mix in blocks to a new
file. No rendered AudioBuffer, PCM IPC payload, encoded Blob or duration-sized
result cache is created. Direct jobs share the export hook's controller guards,
so late failures/completions cannot overwrite a restarted job. Native errors
are shown with their detail. Existing output files remain protected; cancelled
or failed staging is cleaned up before publication.

WAV honors the GUI's 8/16/24/32-bit integer setting: clamp at full scale, use the
same asymmetric negative-tie rounding as JavaScript, and retain no dither.
WAV8 uses the correct unsigned disk representation through signed Hound samples.
GUI WAV32 remains integer PCM. CLI/video default float32 still preserves peaks
above unity; the new `--wav-bit-depth` flag explicitly selects native PCM. It
accepts the same four depths, conflicts with video and rejects explicit FFmpeg
mixing. DSP and source files are unchanged. Compressed GUI exports, audible
in-memory sources, multichannel/non-48-kHz projects and other platforms retain
the former Web Audio/worker path. Import/playback still hold decoded source buffers.

Validation: 36 media Rust tests passed, including independent PCM values for
silence, positive/negative half levels, rounding ties and clipped headroom at
all depths; output protection and invalid-depth rejection are checked. Both CLI
parser tests passed. Seven older picture integrations remain opt-in and were
not repeated for this WAV writer change. All 21 targeted frontend tests passed,
including direct-job cancellation/restart, save-dialog cancellation, late dialog
results and surfaced failures. ESLint, TypeScript/production build, optimised CLI
and debug macOS bundle passed. The optional actual-WebKit PCM harness passed all
four depths with byte-identical audio payloads for random stereo, boundary/tie
samples and clipping. Container headers are not required to match. Fixtures and
results are archived outside git under `ux/native-pcm-079/`. DSP calculations
were unchanged; the prior 56 effect comparisons were not repeated. CI for 0.7.8
is still queued/running at this checkpoint; the new push also starts CI.

The full 253.72-second interview, with default master compression, exported to
stereo 48 kHz/24-bit PCM in 2.62 seconds (2.18 user / 0.18 system), about 97 times
faster than playback. Peak CLI RSS was 2,719,744 bytes (2.59 MiB); this single
warm-cache direct-PCM run excludes editor buffers, OS cache and other processes.
Independent RIFF inspection confirmed 12,178,560 frames and the selected depth;
file size is 73,071,428 bytes. The private derived project, WAV and measurement
are under `ux/real-pcm-079-8gwtf97h/`; originals were not rewritten.

No codec or dependency was added; the 26-entry licence manifest is unchanged.
Remaining work includes disk-paged import/playback, streaming compressed-audio
export, permissive-only WebM and iOS picture composition.

## Local 0.7.10 — native Mac FLAC

Installed and launched `~/Applications/CrispAudio-local.app` version 0.7.10;
updated the optimised standalone CLI. Both ad-hoc signatures verified. The one
autosave JSON remains unchanged, with WebKit data and JSON backed up under
`ux/recovery-before-0710/`. No release tag or Apple upload was triggered.

Eligible Mac timeline FLAC now uses the native mixer and Apple system encoder.
The CLI accepts a `.flac` output through the same route. An owned float WAV holds
the full-clock mix; a 4096-frame AVAudioFile buffer feeds the encoder, then the
finished FLAC is published atomically after checking rate, stereo channels,
24-bit depth, frame count and populated STREAMINFO MD5. Cancellation kills the
owned helper and removes temporary files. Native errors remain visible; explicit
FFmpeg mixing is rejected for this FLAC endpoint. No new codec/dependency or
redistributed binary was added; the 26-entry licence manifest remains unchanged.

Signed 24-bit quantisation matches the existing GUI libFLAC worker, including
negative ties and clipped headroom. It uses the 8388608 scale, distinct from
integer WAV's 8388607 scale. Apple's compression preset differs from the worker's
level 5, so compressed bytes and size need not match. Audible in-memory sounds,
other rates/platforms and other formats keep the worker. Native export needs disk
space for the full float WAV plus encoded output; import/playback buffers are
still loaded. The GUI's direct-job helper now handles both WAV and FLAC.

An early encoder prototype attempted an extra read after the input's final frame;
AVAudioFile rejected it on the real WAV. The production loop reads only remaining
frames and scopes the writer so finalisation completes before metadata inspection.
The full-file and boundary checks below passed with that correction. About's
update check also now compares stable version components numerically, so 0.7.10
is correctly newer than 0.7.9 and does not advertise an older tag as an update.

Validation: all 37 ordinary media Rust tests and both CLI parser tests passed;
eight platform integration tests remain opt-in. The new FLAC integration was
explicitly run and passed, with exact signed PCM, clipped/tie values and an
independent MD5 comparison. Seven older picture integrations were not repeated.
All 22 targeted export frontend tests plus two version-comparison tests passed.
ESLint, TypeScript/production build, release CLI and debug macOS app bundle passed.
Actual WebKit TimelineEngine + GUI FLAC worker and native FLAC decoded to exactly
the same 28,800 PCM bytes; both stored the independent MD5 for 4,800 stereo frames.
FFmpeg was disabled for native rendering and used only for reference decoding.
Archived fixtures/results live outside git under `ux/native-flac-0710/`. Native
DSP and WAV writing were unchanged; prior DSP/PCM suites were not repeated. Both
desktop and iOS CI passed 0.7.9; this push starts new CI.

The full 253.72-second interview with default master compression exported in
5.69 seconds (4.51 user / 0.41 system), about 45 times faster than playback.
macOS time reported peak RSS 15,925,248 bytes (15.2 MiB); this is a single
warm-cache direct-PCM-source run, not total editor/OS-cache/process-tree memory.
Output is 24,890,545 bytes, about 34% of the corresponding 24-bit WAV's size.
Independent decoding confirmed 12,178,560 stereo 48 kHz frames and matched the
stored MD5 `55c90365aa870825be259c39850c02ef`. The derived project, FLAC and
measurement live under `ux/real-flac-0710-u_9ywxnh/`; originals were not rewritten.

Remaining work includes disk-paged import/playback, streaming MP3/AAC/Opus
export, permissive-only WebM and iOS picture composition. Native FLAC was tested
on this Mac; unsupported system encoder configurations fail explicitly.

## Local 0.7.11 — native Mac AAC-LC

Installed and launched `~/Applications/CrispAudio-local.app` version 0.7.11
and updated the optimised standalone CLI. Both ad-hoc signatures verified.
The one autosave JSON remains unchanged; WebKit data and the JSON backup are
under `ux/recovery-before-0711/`. No release tag or Apple upload was triggered.

Eligible linked 48 kHz Mac timeline AAC export now uses the native mixer and
Apple system encoder, retaining the existing `.aac` ADTS format. The GUI
passes its configured bitrate; CLI `render-project` accepts
`--audio-bitrate-kbps 96|128|192|256|320` (default 192 for AAC). Other projects
and platforms retain the existing worker. WAV and FLAC paths remain available.
No codec dependency or redistributed binary was added; the 26-entry licence
manifest remains unchanged.

The encoder uses 4096-frame buffers from an owned float WAV, with finite-sample
validation and clipping rather than automatic normalisation. A bounded ADTS
parser verifies AAC-LC, stereo 48 kHz, packet completeness and the actual
packet clock before atomic no-overwrite publication. Cancellation removes
owned temporary files. Explicit FFmpeg mixing is rejected for this endpoint;
FFmpeg was used only as an independent reference decoder in validation.
Disk space is needed for the temporary WAV plus encoded output. Import and
playback buffers are still loaded.

ADTS has no gapless metadata. The five bitrate signal tests measured 2,112
priming frames (44 ms) plus end padding. WAV/FLAC remain the choices for exact
timeline exchange. Duration estimates based on ADTS bitrate can be inaccurate;
validation uses packet counts and independent decoded frame counts instead.

Validation: all 38 ordinary media Rust tests and three CLI parser tests passed;
nine platform integrations are opt-in. The new AAC integration was explicitly
run at all five bitrates and passed, checking independently decoded stereo
bursts, priming alignment, signal error, packet clock and no-overwrite behavior.
The FLAC PCM/checksum integration was repeated and passed because encoder
orchestration is shared. Seven older picture integrations were not repeated.
All 23 targeted export frontend tests, ESLint, TypeScript/production build,
release CLI and debug macOS app bundle passed. Prior DSP/PCM/WebKit suites
were not repeated because those implementations are unchanged. The 0.7.10
iOS CI passed; desktop CI was still queued at this milestone. This push
starts new CI.

The full 253.72-second interview with default master compression exported
at 192 kbps in 4.67 seconds (4.03 user / 0.35 system), about 54 times faster
than playback. Output is 6,173,961 bytes. Independent ADTS inspection and
full decoding agreed on 11,896 packets / 12,181,504 stereo frames, or
253.781333 seconds including priming and padding. Source duration remains
12,178,560 frames. macOS time reported peak RSS 15,761,408 bytes (15.0 MiB);
this single warm-cache direct-PCM-source run excludes editor buffers, OS
cache and other processes. The derived project, AAC and validation JSON
are under `ux/real-aac-0711-hqkpne2a/`; originals were not rewritten.

Remaining work includes disk-paged import/playback, streaming MP3/Opus export,
permissive-only WebM and iOS picture composition. Native AAC was tested on
this Mac; unsupported system encoder configurations fail explicitly.

## Local 0.7.12 — native Mac M4A/AAC

Installed and launched `~/Applications/CrispAudio-local.app` version 0.7.12 and
updated the optimised standalone CLI. Both ad-hoc signatures verified. The one
autosave JSON remains unchanged, with WebKit data and JSON backed up under
`ux/recovery-before-0712/`. No release tag or Apple upload was triggered.

The eligible Mac timeline's AAC save dialog now offers ADTS `.aac` and real
MPEG-4 audio `.m4a`. CLI `.m4a` output follows the same native AAC-LC route at
96/128/192/256/320 kbps (default 192). This does not add M4A to the global
SFX/Voice/worker formats; other platforms/non-linked projects keep ADTS export.
No codec dependency or redistributed codec binary was added; the 26-entry
licence manifest remains unchanged.

The system writer records priming/padding metadata. A second strict helper
operation checks its final Core Audio packet table and AAC-LC format before
publication: valid frames exactly match the source, and packets * 1024 equal
valid + priming + remainder, with bounded priming/padding and stereo 48 kHz.
The reader reports M4A AAC-LC ASBD flags=0; flags=2 belong to the CAF object-type
convention and incorrectly reject this valid M4A layout. Gapless-aware readers
can trim the metadata; encoded timestamps/duration fields need not equal the
valid PCM frame count. AAC remains lossy. Video rendering continues to use PCM;
WAV/FLAC remain lossless intermediates. Temporary float WAV disk-space and
loaded import/playback buffer limits are unchanged.

Validation: all 39 ordinary media Rust tests and three CLI parser tests passed;
ten platform integrations are opt-in. The new M4A integration passed all five
bitrates, plus 1/1023/1024/24001-frame boundaries, checking independent FFmpeg
decoded length, unshifted stereo signal error and no-overwrite behavior. The
ADTS AAC and FLAC PCM/checksum integrations were repeated and passed because
orchestration and the Swift helper are shared. Seven picture integrations were
not repeated. All 26 targeted frontend tests, ESLint, TypeScript/production
build, release CLI and debug macOS app bundle passed.

The new optional `scripts/test-native-m4a.mjs` also passed in real headless
WebKit at all five bitrates: each decoded exactly 24,001 stereo 48 kHz frames,
with unshifted RMS error below 0.004. Native rendering disabled FFmpeg/FFprobe.
The default Playwright browser revision was not installed, so the harness used
its explicit executable override with the existing WebKit 2336 installation.
No browser download, OS screenshot or permission reset was performed. Fixtures
and results are archived outside git under `ux/native-m4a-0712/`. Prior DSP/PCM
suites were not repeated because those implementations are unchanged.

The full 253.72-second interview with default master compression exported to
192 kbps M4A, producing 6,152,129 bytes. Independent full decoding confirmed
exactly 12,178,560 stereo 48 kHz frames. Export took 11.91 seconds (8.12 user /
1.52 system), with macOS time peak RSS 16,171,008 bytes (15.4 MiB). WebKit/native
bitrate tests ran concurrently: this is not an isolated speed benchmark and
should not be compared directly with the previous AAC/FLAC timings. Memory
excludes editor buffers, OS cache and other processes. The derived project,
M4A and validation JSON are under `ux/real-m4a-0712-mnv2wqgx/`; originals were
not rewritten.

At validation time, 0.7.11 desktop CI remained queued and its iOS CI was running;
this push starts new CI. Remaining work includes disk-paged import/playback,
streaming MP3/Opus export, permissive-only WebM and iOS picture composition.

## Local 0.8.0 — range and lock foundation (M1 in progress)

Installed and launched the ad-hoc-signed local app and updated the optimised
standalone CLI; both signatures verified. The one autosaved project JSON remains
unchanged, with WebKit/JSON backed up under `ux/recovery-before-080/`. The first
LaunchServices open immediately after quit returned -609; a fresh `open -n`
succeeded after the previous process had exited. No release tag/Apple upload.

Added independent saved editRange, ruler range mode/handles, exact bounds,
keyboard adjustment and audio/picture highlighting. Play range uses its bounds;
Loop repeats the selected playback interval. Normal play/export remain full
project operations. A gain gate scheduled on the audio clock blocks source and
FX-tail output at the range end, independent of delayed UI frames. Loop restart
still uses the existing RAF scheduler; seamless musical looping is not claimed.
macOS Playback commands and Cmd/Ctrl+Shift+Space share the same range actions.
Contextual help and EN/DE labels are included. The empty-project welcome overlay
now begins below the ruler rather than covering its input surface.

Persisted audio/picture locks protect clip changes, deletion, source replacement
and linked/clipboard edits, enforced on both action and direct setState commits.
Blocked edits leave the entire commit and clipboard/history unchanged. Mute,
solo, track level/pan/automation/inserts, copy and lane order remain available.
Undo/redo restores whole historical snapshots; explicit project load/reset is
allowed. CLI recipes reject changed protected audio/picture clip data. No effect,
codec or third-party dependency was added.

Validation: all 94 frontend test files / 1309 tests passed, including central
lock rejection, linked edits, mixing/copy access, unlock/undo, serialization,
range validation and transport stop/loop overshoot. ESLint and TypeScript/web
build passed. All 40 ordinary media Rust tests and three CLI parser tests passed;
ten platform integrations remain opt-in. This milestone changes editing/live
playback rather than native DSP/codec implementations, so older codec/picture
integrations were not repeated. Release CLI and debug macOS app bundle passed.

Actual headless WebKit tested ruler drag 2–4 seconds and keyboard end adjustment
to 4.001. An OfflineAudioContext exercised the live TimelineEngine graph with
a delay effect: audible samples inside the range, exactly zero after its boundary.
The optional reproducible harness is `scripts/test-timeline-range.mjs`. Its first
run found the empty-overlay problem; subsequent development-server HMR produced
separate dynamic-import store instances, so the final passing check used a fresh
owned server. This is WebKit validation, not a physical iOS claim. No OS screenshot
or permission reset was used. Full interview export was not repeated because
export/mixing semantics were unchanged. Shared optional metadata reads remain
compatible with project v3.

M1 remains in progress: range export, scoped lift/extract/insert, ripple
participation, transition-aware ripple, advanced trims and named groups follow.
M2–M10 are still planned. Long-recording paging and additional codecs remain
lower priority as requested; see the active roadmap in PLAN.md.

## Local 0.8.1 — reviewed scoped range edits (M1 in progress)

Installed and launched the ad-hoc-signed Mac app and optimised CLI. Signatures
verified, one autosaved arrangement preserved exactly; backup is under
`ux/recovery-before-081/`. No tag or Apple upload.

GUI and CLI now support lift/extract/insert-gap, saved track/picture participation,
linked scope protection, untouched transitions, automation boundary values and
optional canvas/marker/transcript retiming. The dialog previews duration and
blocked operations. Boundaries through blends or transcript cues still require
review first; advanced transition trims remain planned.

Validation: 95 frontend files / 1315 tests, ESLint, TypeScript/web build, 43
ordinary media Rust tests and three parser tests passed. Release CLI and debug
Mac bundle passed. Actual headless WebKit tested partial-link rejection, saved
scope, apply and undo. Native/GUI semantic parity passed for all three operations
and the real Canon/H6 interview. A private derivative removed 45–47 seconds;
native Apple WAV export measured 251.720 seconds, stereo 48 kHz, matching the
shortened arrangement. Originals and source media were untouched. No physical
iOS claim or new dependency. Older codec integrations were not rerun because
their implementations were unchanged. Range export, advanced trims, named groups
and M2–M10 remain outstanding; paging/codecs stay deferred.

## Local 0.8.2 — selected range export (M1 in progress)

Installed/launched signed local app and optimised CLI; one autosave preserved,
WebKit/JSON backup under `ux/recovery-before-082/`. No Apple submission/tag.
Explicit selected audio export retains full DSP preroll and crops at rounded
sample bounds. Native output remains bounded; browser export retains preroll
AudioBuffer memory. File menu action and EN/DE labels included. Video range
can explicitly reuse the selected interval; CLI --start/--end covers both media.

95 frontend files / 1316 tests, lint, TS/web build, 44 ordinary Rust media tests,
three parser tests, release CLI and debug app bundle passed. Native FLAC, AAC
and M4A opt-in integrations were rerun and passed. Actual WebKit delay-tail range
export was identical to a full-render slice (1920 frames, maximum error zero).
The private real interview derivative exported 44–48 seconds as WAV, FLAC, M4A
and MP4. WAV matched the full-mix PCM slice byte for byte; WAV/FLAC/MP4 measured
4 seconds. M4A's packet duration was 4.053333 seconds, but reference decoding
returned exactly 192000 stereo frames / 4 seconds. Original project untouched.
Seven other opt-in integrations were not rerun. Physical mobile validation and
advanced trim/groups/mixer/picture-stack milestones remain outstanding.

## Local 0.8.3 — reviewed trims and edit navigation (M1 in progress)

Installed/launched the signed local app and optimised CLI, preserved the one
autosave exactly, backed up WebKit/JSON under `ux/recovery-before-083/`.
Added rolling shared cuts, ripple left/right trims, trim-to-playhead and edit-point
navigation with macOS menu/browser shortcuts, contextual help and EN/DE labels.
Source handles, lane locks, ambiguous neighbours, incomplete right link groups
and unsupported picture blends are checked. Ripple uses saved lane participation
and the existing explicit range contract; its global-retiming defaults apply.
Slide editing, advanced blend trims, named groups and command search remain.

Validation: 96 frontend files / 1323 tests, ESLint, TypeScript/web build, 45
ordinary media Rust tests and three parser tests passed; release CLI/debug Mac
bundle passed. Actual WebKit dialog tested source-limit rejection, rolling Apply,
undo and navigation. Eight native/GUI trim cases matched. The real Canon/H6
project was copied, all three microphone clips linked to picture, and split at
45 seconds. A roll moved the cut to 45.08 with unchanged sample-rounded length;
ripple shortening moved it to 44.92 and reduced the arrangement to 253.64 seconds.
The derivative's 44–46 second WAV rendered stereo 48 kHz / exactly two seconds.
Private fixtures are under `ux/trim-edit-083/`; source project/media untouched.
A precision regression compares outer endpoints within double precision and
exact sample counts; decimal binary representation may differ by one floating
unit. Ten opt-in platform/codec integrations were not repeated: their code was
unchanged. No dependency, tag, Apple upload or physical mobile validation added.

## Local 0.8.4 — named groups and command search (M1 in progress)

Installed/launched the signed local app and optimised CLI. One autosaved project
preserved exactly; WebKit/JSON backup under `ux/recovery-before-084/`. No tag or
Apple upload. Named groups are separate from AV links; grouping is persisted and
can be disabled for individual edits. Splits/range fragments retain membership;
pastes and loaded tracks get independent group identities. Grouped scope and
lane locks reject indirect edits. Group labels appear in audio/picture clips,
and snapping excludes the whole moving group. Source unlink remains independent.

Find command provides searchable timeline actions and shortcut hints, via toolbar,
Cmd/Ctrl+K and Mac Edit menu. It closes before command dispatch to avoid its own
modal guard blocking the action. Group controls and search are EN/DE localized.

Validation: 97 frontend files / 1329 tests, lint, TypeScript/web build, native
media/CLI tests, release CLI and debug Mac bundle passed. Actual WebKit checked
group creation/selection, disabling groups while retaining AV links, command
execution after closing search, and German controls at 390×844 without input/button
overflow. Four native/GUI semantic cases matched. A private real Canon/H6 copy
grouped all microphones/picture and moved them one second; the corresponding
two-second passages before/after movement had byte-identical PCM. Originals
untouched; fixtures under `ux/edit-groups-084/`. Physical mobile validation is
still pending. DSP/codec implementations/dependencies were unchanged, so ten
opt-in platform integrations were not repeated. Slide/advanced blend trims and
M2–M10 remain outstanding. Prior main iOS CI passed; desktop CI remained queued.

## Local 0.8.5 — CrispASR and spoken-word cuts (2026-10-09)

Desktop app/CLI built, installed and launched at local 0.8.5; ad hoc signatures
verified and the existing autosave preserved. Frontend: 99 files / 1,339 tests;
native: 48 media tests + 3 CLI tests (10 optional integrations ignored). Lint,
typecheck, web build, release CLI and desktop bundle passed. External local CrispASR + Cohere Q8 + Apache-2.0
German wav2vec2 forced alignment; models and ASR executable are not bundled.
Real MVI_8251 browser word deletion verified all three microphones/picture,
undo/redo/reopen and CLI parity. The final 44.96–45.48 s cut removes 0.52 s;
2-second rendered WAV is byte-identical to the corresponding original PCM with
that interval removed. Exported MP4 audio and video both measure 2 seconds at
25 fps. See SPEECH_EDITING.md. Final GUI harness used installed headless Chrome;
WebKit initially exercised deletion, but its externally stored runtime later
stalled during page startup. No OS capture/TCC reset was performed.

No release tag or Apple submission for this increment. Mobile ASR remains pending.

## Local 0.8.6 — keep pasted transcript passages (2026-10-09)

Built, installed and launched local 0.8.6; ad hoc app/CLI signatures verified and
existing autosave preserved. Frontend: 101 files / 1,353 tests; native: 50 media
+ 3 CLI tests, 10 optional integrations ignored. Lint, TypeScript production web
build, release CLI and desktop bundle passed. Actual headless Chrome interview
paste workflow, repeat-resolution component tests, undo/redo/reopen, German phone
controls and native recipe parity passed. Retaining two MVI_8251 passages yields
13 timed words / 4.88 s; rendered WAV is exactly the two original PCM intervals
joined, and MP4 audio/picture duration stays within one 48 kHz sample. See
KEEP_TEXT_EDITING.md. No new dependencies or crisp-docx AGPL code introduced.

No release tag/Apple submission. Free-text comparison is GUI; CLI consumes its
reviewed `keep-words` recipe. Embedded/mobile ASR is still not implemented.

## Local 0.8.7 — fixed-content slide editing (2026-10-09)

Built, installed and launched local 0.8.7; app/CLI ad hoc signatures verified and
one existing autosave preserved. Full frontend run: 101 files / 1,357 tests, plus
the added acoustic-alignment invalidation test (12 trim tests passed). Native:
51 media tests + 3 CLI tests passed, 10 optional integrations ignored. Lint,
TypeScript production web build, release CLI and desktop bundle passed. Headless
Chrome exercised the actual Trim tools slide dialog, source-limit blocking and
undo; ten GUI/native recipe comparisons include positive/negative slides.

On a private MVI_8251 derivative, link three microphone clips and picture, split
at 45/60 seconds, then slide the middle passage +0.08 seconds at 25 fps. Source
content/duration and approximately 253.72-second canvas stay unchanged. Native
48.08–50.08-second WAV matches original 48–50-second PCM byte for byte (96,000
stereo frames). Original project/media remain unchanged; private artifacts are
under `CrispAudio-validation/ux/slide-087/` outside the repository.

Incoming picture blends and ambiguous overlapping lanes are rejected. Timeline
markers/automation stay fixed; existing acoustic alignment becomes stale and must
be regenerated before speech cuts. Shared frontend supports touch controls, but
this increment has no new iOS device validation. No release tag/Apple submission.

## Local 0.8.8 — rolling picture transitions (2026-10-09)

Built, installed and launched 0.8.8; app/CLI ad hoc signatures verified and one
existing autosave preserved. Frontend: 101 files / 1,361 tests passed. Native:
52 media tests + 3 CLI tests passed, 10 optional integrations ignored. Lint,
TypeScript production web build, release CLI and desktop bundle passed.

Headless Chrome exercised Trim tools, transition roll/undo and twelve GUI/CLI
comparisons. Unit checks cover every supported transition type in both directions,
frame edges, consumed handles and conflicts with neighbouring transitions.
A synthetic native Apple dissolve retained its 0.4-second length and 3.6-second
picture duration; its red/blue midpoint moved from 1.8 to 2.0 seconds. The optional
`scripts/test-roll-blend.py` creates and inspects these colour fixtures with
installed FFmpeg/FFprobe; Apple performs the actual project export.

On a private Canon/H6 derivative, rolling a 0.4-second picture overlap +0.08 s
moved the left end to 45.08 s and right start to 44.68 s. Three microphones
retained their relative picture/source offsets, and the 253.72-second canvas
stayed fixed. The rendered 44–46 s audio remained byte-identical (96,000 stereo
frames); exported MP4 audio/picture both measured 2 seconds. Original media/project
were untouched; private artifacts are in `ux/roll-blend-088/` outside the repo.

Slide/ripple/range blend semantics remain unfinished. No new iOS device
validation, release tag or Apple submission for this increment. README describes
current support; chronological notes stay in history.md and these records.

## Local 0.8.9 — slides through picture transitions (2026-10-09)

Built, installed and launched 0.8.9; app/CLI ad hoc signatures verified and one
existing autosave preserved. Frontend: 101 files / 1,363 tests passed. Native:
53 media tests + 3 CLI tests passed, 10 optional integrations ignored. Lint,
TypeScript production web build, release CLI and desktop bundle passed.

Slide preserves incoming/outgoing picture overlap lengths and transition types,
fixed middle source content and relative linked audio offsets. Logical edit
boundaries include incoming picture handles. Source limits, frame boundaries,
locks/groups, middle/neighbor body lengths and ambiguous extra clips are checked.
The dialog keeps source limits visible for out-of-range movement amounts.

Headless Chrome exercised the slide dialog and undo, with fourteen GUI/CLI recipe
comparisons. The synthetic native Apple check moves both 0.4-second dissolve
windows +0.2 seconds, retains 5.6-second picture duration and verifies red/blue/green
blend colours. Reproduce with `scripts/test-slide-blend.py /path/to/crispaudio`;
installed FFmpeg creates/inspects fixtures, Apple performs the project export.

A private Canon/H6 derivative slid its middle passage +0.08 seconds through two
0.4-second picture overlaps. All three microphones and picture remain linked;
middle picture content/15.4-second duration and the 253.72-second canvas stay
fixed. Rendered 48.08–50.08 s PCM matches original 48–50 s byte for byte (96,000
stereo frames). Original media/project are untouched; private artifacts remain
under `ux/slide-blend-089/`, outside this repository.

Ripple/range edits through blends remain unfinished. No new iOS device validation,
release tag or Apple submission. README remains a current capability overview;
version notes stay in history.md and these records.

## Local 0.8.10 — ripple trims through transitions (2026-10-09)

Built, installed and launched 0.8.10; app/CLI ad hoc signatures verified and one
existing autosave preserved. Frontend: 101 files / 1,366 tests passed. Native:
54 media tests + 3 CLI tests passed, 10 optional integrations ignored. Lint,
TypeScript production web build, release CLI and desktop bundle passed.

Linked ripple trims preserve incoming/outgoing transition types/overlap lengths
and selected clip/source-link identities. Reviewed shapes share existing scoped
range checks for locks, groups, automation, canvas, markers and transcript timing.
Clips ending at an insertion point are included when their reviewed shape changes.
Shortening retimes surviving aligned words; extending source speech requires new
acoustic alignment. Generic range boundaries through picture blends remain blocked.

Headless Chrome exercised the ripple dialog and undo, with eighteen GUI/CLI recipe
comparisons. The native synthetic check covers left/right shortening/extension:
incoming dissolve stays fixed, outgoing dissolve follows the new end, and picture
duration becomes 5.4/5.8 seconds as expected. Reproduce with
`scripts/test-ripple-blend.py /path/to/crispaudio`; installed FFmpeg creates/inspects
fixtures, Apple performs the actual project exports.

A private Canon/H6 derivative removes 59.92–60.00 s with a right ripple trim,
retains two 0.4-second picture overlaps and all three microphone offsets, and ends
at approximately 253.64 s. Rendered 44–61.92 s audio matches original 44–62 s with
that interval removed byte for byte (860,160 stereo frames). Native edited MP4
59–61 s audio/picture both measure 2 seconds. Original media/project are untouched;
private artifacts remain in `ux/ripple-blend-0810/`, outside the repository.

No new iOS device validation, release tag or Apple submission. Generic range blend
policies remain unfinished. README describes current support; version narratives
stay in history.md and implementation records.


## Local 0.8.11 — reviewed range cuts through blends (2026-10-09)

Built, installed and launched 0.8.11; app/CLI ad hoc signatures verified and one
existing autosave preserved. Full frontend suite passed 101 files / 1,374 tests;
final affected range/trim/project/speech suites passed 5 files / 66 tests after
adding the removed-clip review case. Native: 57 media + 3 CLI tests passed,
10 optional integrations ignored. Lint, production TypeScript/web build, release
CLI and final desktop bundle passed.

Range editing defaults to preserving picture blends. An explicit cut policy
lists crossed overlaps and resulting cut positions; a removed incoming clip is
reported as removed. Conversion uses the original outgoing clip endpoint,
advances incoming source/start by its overlap and fits shortened picture fades.
Original scope/link/group/lock guards run before conversion; initial/final picture
topology, frame edges and surviving body are checked. Uncrossed transitions stay
intact. Transcript boundaries and speech deletion/pasted keep retain their current
conservative checks. Lift keeps the entire canvas even when no clips remain.

Headless Chrome exercised the actual dialog, default rejection, explicit policy,
one-step undo and six GUI/CLI comparisons: lift/extract/insert with and without
crossed blends. The German 390-pixel dialog fits without horizontal overflow;
this is browser layout evidence, not iOS device validation. Reproduce with
`scripts/test-range-edits.mjs` and CRISPAUDIO_CHROME_EXECUTABLE / CRISPAUDIO_CLI.

The synthetic native Apple check confirms hard cuts at 2.00 / 1.84 / 2.16 seconds
for lift/extract/insert, black gaps for lift/insert, preserved outgoing dissolve
colours and expected 5.60 / 5.44 / 5.76-second durations. Reproduce with
`scripts/test-range-blend.py /path/to/crispaudio`; FFmpeg creates/inspects the
synthetic inputs while Apple performs the actual exports.

A private Canon/H6 derivative extracts 59.72–59.92 seconds through the outgoing
blend, leaves its incoming 0.4-second dissolve intact and replaces the crossed
blend with a cut at 59.80 seconds. Picture and all three microphones remain
aligned; the canvas ends at approximately 253.52 seconds. Rendered 44–61.80 s
24-bit PCM matches original 44–62 s with precisely that interval removed byte
for byte (854,400 stereo frames). The native 59–61 s MP4 has 2-second audio and
picture streams. Original media/project are untouched. Private artifacts remain
under `ux/range-blend-0811/`, outside this repository.

No release tag, Apple submission or new iOS device validation. M1 remains in
progress pending its end-to-end completion audit and interactive source-handle
feedback; the M2 mixer follows that milestone. README covers current capabilities;
chronological notes remain in history.md and these implementation records.


## Local 0.8.12 — source handles and desktop M1 workflow (2026-10-09)

Built, installed and launched 0.8.12; app/CLI ad hoc signatures verified and one
existing autosave preserved. Full frontend suite: 102 files / 1,383 tests passed;
final gesture/rendering/handle suites: 3 files / 38 tests passed after adding the
interrupted-trim cleanup regression. Lint and the final TypeScript/web/desktop
bundle passed. Native media code is unchanged; its previously tested release CLI
was used for the new actual edit/export integrations below.

Audio/video pointer trims now compute geometry from the press snapshot, use one
bounded displacement for source/timeline clocks and show source spans/reserves
for linked partners. The shortest partner handle can limit all clips. Picture
limits round inward to frame edges and retain a frame. Playback pauses before
audio trims; invalid source/topology/locks retain the last valid position with
feedback. Release commits one undo step. Escape/cancel/lost capture restores the
original project and the pre-press temporal history, including discarded redo.
Idle source-feedback views do not subscribe to project metadata; the waveform
render-invalidation tests still pass.

Headless Chrome exercised actual audio/video pointer drags, source/timeline
limits, returning from a limit, linked frame clamps, undo/redo and cancellation.
German feedback fits at 390 px with 24-pixel rows. Reproduce with
`scripts/test-source-handles.mjs`; these are browser checks, not iOS device tests.

The full synthetic interview audit used actual range and trim dialogs, two linked
microphones/picture and excluded fixed music. Extract then roll preserved links,
marker/cue retiming and outer endpoints; two-step undo/redo restored each state.
Selected-range transport advanced. Actual Save/Open file actions preserved the
arrangement and decoded sources. Five-second exported PCM is byte-identical before
and after reopen. The native two-operation edit recipe matches GUI geometry and
link membership. Native 48 kHz stereo 16-bit export has 240,000 frames and differs
from browser PCM by at most one integer step; Apple MP4 audio/picture both measure
5 seconds. Reproduce with `scripts/test-timeline-workflow.mjs`; CRISPAUDIO_CLI
adds native edit/render checks, with installed FFmpeg/FFprobe creating/inspecting
synthetic video. Neither browser script touches installed-app storage/user media.

A private Canon/H6 derivative extracts 45–47 s then rolls the resulting first cut
+0.08 s. Picture and all three microphones stay aligned, with a 251.72-second
canvas. Rendered 44–61 s PCM matches original 44–63 s with 45.08–47.08 s removed
byte for byte (816,000 stereo frames). The native 44–48 s MP4 audio/picture both
measure 4 seconds. Original media/projects are untouched; private artifacts and
validation logs stay outside git in `ux/workflow-0812/`.

Desktop M1's completion example and source-handle feedback are complete. The next
implementation is M2.1's dockable mixer; new EQ/limiter/routing follow later slices.
No new iOS device validation, release tag or Apple submission. Musical loop timing
and platform gaps remain explicit. README stays a current capability overview;
chronological details stay in history.md and these implementation records.

## Local 0.8.13 — mixer foundation

Installed and launched `~/Applications/CrispAudio-local.app` and updated
`~/Applications/crispaudio-cli-local`; ad-hoc signatures verified and one existing
autosave preserved. No Apple upload or release tag was triggered.

The Timeline bottom dock exposes track/master dB faders, pan, mute/solo, existing
inserts, stereo peak/RMS, peak hold and clipping reset. Fader/audition moves update
the running graph with 5 ms smoothing. Master gain is persisted independently of
monitor gain and applied after master effects in realtime/offline/native exports.
Meter values are sample peak/RMS, not true-peak/LUFS; advanced EQ, limiter,
automation lanes and buses remain planned. Narrow headless Chrome checks are not
physical touch-device or installed WebKit audio validation.

Validation: 103 frontend files / 1,387 tests passed; native media library 58 tests
passed with 10 existing ignored platform checks, and 3 CLI tests passed. Lint,
TypeScript/production build and local Tauri bundle passed. `test-mixer.mjs`
checks actual pointer faders, one-step undo, uninterrupted audio-clock playback,
solo/mute, nonzero anti-phase stereo meters, offline master scaling, save/load
and German 390 px layout. `test-native-pcm.mjs` with masterVolume=0.5 matches
browser offline output byte-for-byte at 8/16/24/32-bit PCM.

Evidence logs: `/tmp/mixer-tests-final.log`, `/tmp/mixer-native-final.log`,
`/tmp/mixer-browser-final.log`, `/tmp/mixer-pcm-parity.log`,
`/tmp/mixer-lint-final.log`, `/tmp/mixer-app-build.log`, `/tmp/mixer-install.log`.
Prior 0.8.12 desktop and iOS simulator CI runs both completed successfully:
[desktop](https://github.com/CrispStrobe/crispaudio/actions/runs/37990218860),
[iOS simulator](https://github.com/CrispStrobe/crispaudio/actions/runs/37990218850).

## Local 0.8.14 — graphical EQ

Clip, track and master racks add bell (`peaking`), low/high shelving bands and
an expandable combined EQ response graph. Point drag, keyboard fine/coarse and
numeric frequency/gain/bell-Q editing are available. Live EQ moves update running
nodes with 10 ms smoothing; bypass/type/rack topology changes rebuild the graph.
Stored pass-filter Q conventions remain compatible. New bands are supported by
the native 48 kHz mixer; the optional FFmpeg compatibility mixer rejects them.
Limiter, compressor gain reduction, buses and automation lanes remain planned.

Validation: 104 frontend files / 1,392 tests passed; native media 59 passed,
10 existing ignored platform checks, and 3 CLI tests passed. Production build,
lint and local Tauri app build passed. Browser response checks cover 225 points
at 32/44.1/48 kHz with maximum error 0.00000432 dB against Web Audio. Real browser
pointer/keyboard/numeric edits verify uninterrupted playback, coalesced undo,
restore, locked-rack protection and a German 390 px layout. Thirty-three native
EQ comparisons cover extreme frequency/gain/Q impulses, stereo pan, overlapping
clips, fades/automation and a one-second excerpt of the real Canon/H6 arrangement.

DSP exports are not claimed bit-identical for EQ. One three-stage +24 dB/Q20 bell
case differs after the last clip ends at a browser render-block boundary: worst
sample error 0.000138247 and RMS 0.0000136771. The native mixer retains IIR tails;
browser tail/silence handling is a suspected cause, not an independently proven
root cause. Tests retain the original 0.0001 active-audio bound and explicitly
budget 0.0002 maximum/0.00002 RMS for new EQ tails. All 33 cases pass these bounds.
Real excerpt cases are substantially closer. No physical iOS/touch or installed
WebKit audio validation is claimed from headless Chrome.

Evidence: `/tmp/eq-tests-final.log`, `/tmp/eq-native-final.log`,
`/tmp/eq-browser-final.log`, `/tmp/eq-parity-verified.log`, `/tmp/eq-lint-final.log`,
`/tmp/eq-app-final.log`. Private excerpt outputs are in
`transcripts/2026-Studienwoche/CrispAudio-validation/ux/eq-0814/`; source recordings
and original projects were not modified. No release tag or Apple upload.

Installed/launched local 0.8.14 and updated the standalone CLI. Ad-hoc signatures
verified; one existing autosave preserved. Installation evidence:
`/tmp/eq-install.log`.

## Local 0.8.15 — output limiter and gain reduction

Adds optional stereo-linked sample-peak limiting after master gain, with instant
attack, exponential release, no lookahead and no added latency. Ceiling is
−24..0 dBFS and release 10..2000 ms; default disabled, enabled defaults −1 dBFS /
100 ms. Compressor inserts/strips and limiter display live gain reduction without
writing meter data to project state. A strip reports the greatest insert
attenuation, not the sum. Numeric edits commit deliberately and remain undoable.

Realtime uses a bundled AudioWorklet; browser offline and native linked-project
exports use the same limiter algorithm. Saved project format remains 3; older
files remain disabled. CLI `output-limiter` recipes preserve arrangement geometry;
FFmpeg compatibility export rejects enabled limiting. True-peak/LUFS, lookahead,
automation lanes and buses/sends remain separate roadmap work.

Validation on this Mac:

- Frontend: 105 files / 1,396 tests passed; production build and lint passed.
- Native: 63 library and 3 CLI tests passed; 10 existing platform/integration tests
  remain ignored. Includes immediate transient ceiling, stereo linking, release,
  range history, master-gain order and CLI recipe validation.
- Headless Chrome and WebKit: isolated first-sample peak limited without a shift,
  stereo ratio preserved, range export exactly matches the full-render section,
  compressor/limiter telemetry, stop reset, live ceiling change without playback
  restart, one undo and German 390 px layout. Narrow inputs fit their section.
- Independently rebuilt native CLI and Chrome offline output: randomized stereo
  fixture with master gain 4 and limiter −1 dBFS / 100 ms produces byte-identical
  integer PCM at 8, 16, 24 and 32 bits. This does not establish bit-exact parity
  for arbitrary compressor/effect chains.
- Served production bundle: WebKit loads the emitted worklet asset and limits
  the first sample at −6 dBFS with correct stereo linkage.

Installed and launched local 0.8.15 plus the standalone CLI; ad-hoc signatures
verified and the saved workspace preserved. Installed WKWebView interaction and
physical iOS playback are not covered by the headless browser checks. No new
Apple release is implied.
