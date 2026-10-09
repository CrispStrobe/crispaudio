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
CLI project audio mixing now uses audio_mix.rs for supported DSP;
see the 0.7.2 section below. Never claim a permissive-only
WebM backend or iOS video implementation exists. GUI mixed audio is range-trimmed;
CLI mix-is-trimmed remains explicit. Preserve atomic no-overwrite publication.


## Native CLI mixing 0.7.2

media/src/audio_mix.rs streams 1024-frame stereo float WAV blocks via Apache-2.0
Hound. Never silently omit enabled DSP: support low/high-pass filters at all
racks; bitcrush/ringmod added in 0.7.3; other effects fail explicitly. Preserve Web Audio pan law, Q in dB,
100 Hz sampled fade ramps, automation, mute/solo and source offsets. Direct
48 kHz PCM WAV decoding works without Apple; other mono/stereo sources use
Apple audio-f32 decoding. AVAssetWriter rejects float WAVE output, so that helper
operation streams AVAssetReader blocks into a WAV header directly. Keep owned
staging folders, finite PCM checks, clip/source bounds and job cancellation.
Round timing to the 48 kHz grid; permit only one rounding sample or at most 1 ms
of short native converter tail padding. CLI output is bounded by standard WAV
limits and 256 audible clips. GUI Web Audio rendering is not disk-paged yet.

## Native effects 0.7.3

Native Effect racks support low/high-pass, bitcrush and ringmod at every level.
RingModulator's intrinsic modulation gain must stay zero; scale the carrier by
mix, because AudioParam inputs add to the intrinsic value. Oscillator phase uses
absolute render-context time even for later clips. BitCrush uses symmetric
quantisation so its even-length interpolated curve maps zero to zero. Native
waveshaping interpolates the same 65536-entry Float32 curve, not a direct step.
The old GUI DC bias and mix bug are intentionally corrected for saved settings.
Delay/chorus were added in 0.7.4; reverb was added in 0.7.5; distortion was added in 0.7.6; compressor was added in 0.7.7.

## Native delay/chorus 0.7.4

Delay's requested time remains independent of WebKit's measured 128-frame
feedback-branch step. Do not replace this with a minimum 128-frame direct delay;
impulse tests and actual WebKit comparisons catch that audible mismatch. Chorus
uses float AudioParam values, two wet delay lines and absolute render-clock LFO
phase. Maintain 64 MiB total delay-buffer / 1024 enabled-effect limits before
allocation. Box the delay variant to keep other Effect values small. The portable
`scripts/test-native-effects.mjs` compares all supported racks with real WebKit,
reads float/extensible WAV directly and keeps fixtures in owned temporary folders.
Use a separate CARGO_TARGET_DIR for its CLI to avoid replacing the Tauri binary.

## Native convolution 0.7.5

media/src/reverb.rs keeps 32 direct IR samples, dyadic FFT bands, and a 4096-frame
uniform frequency-delay line for later tails. Each group's IR begins at its
block size, so block results are ready before their output clock: no added
latency or shifting automation/envelopes. Normalise the seeded stereo IR using
measured WebKit -58 dB calibration, not the rounded 0.00125 spec constant.
Reverb expands mono into stereo, including mix=0; update the track pan law.
Keep the GUI dry blend 1-0.7*mix and 48 kHz float input. Reserve conservative
convolution state before allocation inside the shared 64 MiB DSP-buffer limit;
plan metadata is outside that buffer reservation. Do not silently omit FX on
budget errors. Reverb preparation checks cancellation. RustFFT/dependency MIT
notices are bundled in About; keep them and the manifest synced to Cargo.lock.

Install the optimised standalone CLI for convolution performance measurements;
never use its build directory for the Tauri binary. Debug convolution may render
slower than playback without implying the release CLI has that performance.

## Native oversampling 0.7.6

media/src/distortion.rs adapts WebKit UpSampler/DownSampler filter kernels and
phase conventions under BSD-3-Clause. Keep its copyright header, pinned source
revision and About notice. Two 2x upsamplers, the 256-entry Float32 tanh curve,
and two 2x downsamplers retain a 192-frame wet delay at 48 kHz. Dry stays immediate;
do not shift clips/automation to compensate. Quantise intermediate samples to
float, retain the odd decimation phase and account for fixed filter state before
allocation. Timeline's existing drive/mix controls still select tanh; other curve
algorithms are not configurable timeline effects yet. Compressor was added in 0.7.7.
WebKit tests include unfiltered impulses and 18/19.5 kHz tones to verify aliasing
and timing beyond ordinary low-pass-filtered fixtures.

## Native compressor 0.7.7

media/src/compressor.rs adapts the pinned WebKit DynamicsCompressorKernel under
BSD-3-Clause (Google 2011): retain the full source/About notice. Use Float32
arithmetic, 288-frame predelay, stereo maximum detector, automatic makeup,
32-frame absolute envelope divisions and the adaptive fourth-order release.
Clip racks containing compressors process zeros from the project start without
consuming source data, matching GUI graph timing. Clamp negative clip-envelope
relative time to zero. Compressor mono inputs become stereo before pan.
Reserve fixed state in the common DSP budget before construction. Every current
rack type is supported; unknown types must still fail. Float output can exceed
unity at extreme cascaded makeup settings. Reference tests use absolute error
below full scale and peak-normalised error above it, preserving the PCM unchanged.

## Native GUI video mix 0.7.8

linkedRenderDocument inspects only audible referenced sources, honoring solo's
stored-mute override. Never base64-encode PCM to prepare the native request.
Choose native on Mac only for 48 kHz projects with linked mono/stereo sources;
keep Web Audio for audible in-memory/multichannel sources and other rates.
export_linked_project_video runs jobs::run off the UI thread, calls the native
mixer directly (no compatibility audio fallback), then exports the picture with
its selected backend. Its owned full-clock mix uses mix_is_trimmed=false so a
section is sought once and retains prior effect history. Native failures must
stay visible. mediaJob owns cancellation registration/retry for both paths;
the Web Audio path removes its staged mix even if cancellation arrives after
staging. This avoids a second render/IPC buffer; import/playback are still decoded.

## Direct GUI WAV 0.7.9

useAudioExport accepts direct run jobs as well as Blob-producing requests. Direct
jobs create no Blob/cache entry, retain current-controller guards, and expose
rendering only after the save dialog returns. Cancellation must prevent stale
results/errors from replacing a restarted job. Use mediaJob for native cancels.
render_pcm writes directly in blocks at 8/16/24/32 bits. Match Timeline's JS
integer encoder, not the older mono Rust float-WAV command: clamp float to [-1,1],
quantise in double, and round with floor(x+0.5), including negative ties. WAV8
maps unsigned JS bytes to signed Hound samples by subtracting 128. WAV32 here is
integer PCM; default render()/video intermediates remain float32 and preserve
headroom. CLI --wav-bit-depth explicitly selects native PCM and conflicts with
video/explicit FFmpeg. Count output bytes at the selected depth for RIFF limits.

## Native FLAC 0.7.10

media/src/audio_encode.rs mixes to an owned float WAV, invokes the strict Apple
encode-flac helper and validates final STREAMINFO before atomic hard-link
publication. No codec dependency/FFmpeg fallback is added. Native FLAC is Mac
only, stereo 48 kHz, signed 24-bit; WAV semantics stay unchanged. Quantise with
floor(value*8388608+0.5), clamp [-8388608,8388607], then feed exactly representable
float values to AVAudioFile. This matches flacRuntime, not WAV's 8388607 scale.
Read only remaining frames: an extra read at EOF can throw on some AVAudioFile
layouts. Keep 4096-frame buffers and a function scope that releases the output
before checking STREAMINFO; ARC finalises the header/checksum. Cancel kills the
owned helper process and removes staging. No populated metadata means failure.
linkedAudioExport now handles WAV and FLAC with direct jobs; all other formats
keep the worker. Numeric stable-version comparisons handle 0.7.9 → 0.7.10.

## Native AAC 0.7.11

The shared audio_encode pipeline now handles FLAC and AAC without changing their
DSP/float intermediates. AAC uses AVAudioFile, AAC-LC stereo 48 kHz, ADTS .aac,
selected 96/128/192/256/320 kbps and constant bitrate strategy. Clip samples at
full scale, do not normalise. Validate headers/payloads with bounded buffers,
check cancellation per packet and reject excess packets early. Actual ADTS
packet count *1024, not FFprobe's bitrate estimate, defines decoded duration.
Accept source frames through source+4096 for priming/padding; tested priming is
2112 frames, 44 ms. ADTS has no gapless trim metadata: never call it sample-exact
or use it for the video's already-trimmed PCM mix. GUI forwards bitrateKbps;
CLI --audio-bitrate-kbps requires AAC and conflicts with video/WAV depth.
Other platforms, rates and in-memory sources keep the Glint worker. Rerun the
native FLAC integration after shared pipeline changes. No dependency added.

## Native M4A 0.7.12

render_aac accepts .aac ADTS or real .m4a based on the output suffix. M4A uses
AVAudioFile's system container, then a strict validate-m4a helper reads the final
Core Audio packet table. kAudioFormatMPEG4AAC identifies LC with flags=0 here;
CAF object-type flags are not appropriate for this M4A ASBD. Verify valid frames
against the source and packets*1024 == valid+priming+remainder with checked
arithmetic, positive source, bounded priming/remainder and stereo 48 kHz.
Do not validate gapless duration using bitrate or encoded timestamps. The AAC
save dialog offers both containers; other platform/worker and SFX/Voice paths
remain ADTS. No global format option or codec dependency is added. Re-run both
AAC and FLAC integrations after changes to the shared orchestration/helper.

## Range/lock foundation 0.8.0

Optional project.editRange is independent of clip selection and video export In/Out.
Selection mode and rangePlayback are transport/view state. Play range snapshots its
bounds; the live engine takes optional endTime and gates its master output on the
audio clock. Offline/native exports remain unchanged. Existing loop restart is RAF
based, not seamless sample-accurate looping. Range pointer gestures coalesce history.

projectStore wraps action and public setState commits to reject changed segments or
removed/replaced sources on locked audio tracks, and changed clip/source/path data
on the locked picture lane. Reject the whole linked/clipboard operation. Mixing,
copy and lane order remain available. Temporal undo/redo restores full historical
snapshots; explicit loadProjectState bypasses protection and clears rangePlayback.
Use i18next's existing singleton for notices, not the UI-initialising i18n module.
CLI recipes compare protected clip data before publishing an edited document.
No API control is a substitute for this central commit guard.

## Scoped range edits 0.8.1

rangeEdits.ts and media/src/range_edit.rs share lift/extract/insert semantics.
Track/video rippleEnabled defaults true. Require the whole affected link group
in scope; locked affected lanes reject atomically. Preserve excluded lanes and
unaffected transitions. Block boundaries inside blends/cues; validate resulting
picture topology. Retime included track automation with boundary values; optional
global retiming includes minimumDuration, markers and transcript cues. GUI previews
the immutable project then commits once, rechecking project identity. CLI range-edit
and legacy ripple share this helper. Optional scripts/test-range-edits.mjs checks
the real dialog/undo and native semantic parity without comparing generated IDs.

## Range export 0.8.2

Native transient document.renderRange bounds (not saved project metadata) instruct
audio_mix to process frames from zero through end, writing only frames >= start.
Round both boundaries at 48 kHz, reject empty/invalid ranges before staging, and
size-check output frames. Never seek directly to start: DSP history would change.
FLAC/AAC encoders validate the cropped WAV's frame count. FFmpeg audio fallback
rejects renderRange. CLI --start/--end sets transient audio bounds or picture
In/Out on its document copy. GUI audio action is explicit; video range has a
reviewed reuse action. TimelineEngine.renderMixRange renders 0→rounded end then
crops; this browser path still uses preroll memory. Optional WebKit range harness
checks a delay tail against full-render samples. Never claim packet-based M4A
duration is decoded length; packet padding may remain while decode is exact.

## Advanced trim slice 0.8.3

trimEdits.ts and project_edit::advanced_trim share roll/ripple-trim/playhead trim.
Select left clips of a common cut, resolve one abutting neighbour per lane, and
require the whole right link group. Source bounds and locks reject before commit;
rolling blends/ambiguous neighbours remain unsupported. Right roll durations use
the original outer endpoint. Compare sample counts/tolerance for floating sums,
not bitwise decimal duration equality. Ripple extension inserts the gap before
growing the target; validating a standalone extension first would wrongly reject
the old neighbour overlap. Ripple shortening delegates to range-edit. Picture
participation requires a frame-aligned ripple edge. GUI previews immutable state
and commits once; native recipes preserve unknown metadata and final lock checks.
Edit navigation skips equal boundaries and stops playback. Native accelerators
own macOS navigation; browser handles Cmd/Ctrl+Alt+Left/Right. Optional actual
WebKit script checks dialog/source limits/undo/navigation and eight recipe cases.

## Named groups / command search 0.8.4

Clip.editGroup {id,name} is separate from linkGroup and survives spread-based
splits/range fragments. Optional project.groupEditingEnabled defaults true.
linkedIds computes transitive closure across enabled named groups and AV links;
sourceOnly is used by unlink so unrelated links in an edit group are not broken.
Direct audio move/trim/split/delete paths and selection honor groups. Central lane
locks still reject whole commits. Paste and Load tracks remap edit-group IDs
independently from AV IDs; never reuse the original group's identity for copies.
Range helpers reject excluded members of affected named groups unless grouping
is explicitly disabled. Native recipe selection uses the same closure; advanced
rolling checks right-hand group completeness. Snap targets exclude all movers.

CommandSearch closes its portal synchronously before dispatchNativeMenu; otherwise
the modal guard rejects its own command. Cmd/Ctrl+K is native-owned on macOS.
EditGroups and command search use the existing Modal/ToolButton patterns, EN/DE
labels and phone wrapping. Optional test-edit-groups.mjs checks actual UI and
four native semantic cases. This metadata changes neither DSP nor codec licensing.

## CrispASR / speech editing 0.8.5

Read docs/SPEECH_EDITING.md. media::asr calls a selected external CrispASR CLI on
native rendered timeline audio (15 s chunks, strict forced alignment, full JSON).
No shell or bundled model. German auto uses wav2vec2-aligner-de. Do not invent
word times from tokens/subtitles. transcriptLayout guards moved/slipped sound;
only valid globally retimed range edits refresh it. Caption corrections clear
word alignment. Spoken deletion explicitly includes all lanes, covers whole video
frames outward, rejects adjacent speech/blends/locks and commits once. Rust
spoken_edit mirrors GUI spokenEdits; compare doubles with sub-sample tolerance.
Optional real browser harness supports WebKit or installed Chrome headlessly.

## Pasted text retention 0.8.6

Read docs/KEEP_TEXT_EDITING.md. keepSpeech.ts independently tokenizes normalized
Unicode and computes earliest/latest ordered subsequences: never replace speech
using semantic similarity or infer timestamps from text. Ambiguous mapping needs
occurrence pins or explicit earliest/latest review. Keep contiguous word runs with
natural pauses; remove the complement, including untranscribed intro/outro, across
all lanes in descending time order. Commit once, preserve locked/linked/grouped
range rules and retime transcript/markers/automation. Rust keep_words consumes
reviewed IDs, not free text; GUI exports its recipe. Native/GUI range helpers keep
an exact terminal canvas end rather than leaving a sub-frame tail. Do not import
AGPL crisp-docx code under the existing permissive dependency policy. Optional
headless script test-keep-speech.mjs uses private interview media and actual GUI.


## Slide editing 0.8.7

`trimEdits.slideClips` and `slideLimits` implement reviewed fixed-content slides;
`media/src/project_edit.rs` accepts `slide` with ids/seconds. Require matching
middle spans, abutting unique neighbours, complete link/group closure, unlocked
lanes and source handles. Picture edges/movement use project frame rate; incoming
blends are rejected. Preserve middle source offsets/durations and outer endpoints;
clamp only neighbour fades. Markers/automation remain on the timeline; existing
transcriptLayout signatures become stale and block speech cuts until re-ASR.
Optional `scripts/test-trim-edits.mjs` supports headless Chrome or WebKit, actual
dialog/undo and GUI/CLI recipe parity. M1 still requires advanced transition trims.
CrispEmbed/crisp-docx contextual word alignment is unnecessary for deletion-only
transcript matching; acoustic timestamps still come from CrispASR forced alignment.
No AGPL crisp-docx source/dependencies were copied into this MIT application.
