# Media workspace — local 0.6.4

CrispAudio edits audio-only projects and audio plus video projects. Open **Workspace**
(the library icon in the main toolbar) for Media, Clip inspector, Microphone mix,
and Transcript tabs. On desktop its width is draggable; on a phone it is an
optional overlay with a close button. Preview can be hidden or expanded separately.

## Everyday timeline controls

- **?** explains Move & trim, zoom, reorder, overlaps, import and fullscreen.
  The main toolbar holds undo/redo, add track and TTS; zoom and row height are
  directly above the tracks. There is no separate View & tools dialog.
- Drag an audio header's six-dot handle onto another header; arrow keys and the
  adjacent up/down buttons also reorder. Hold near the top/bottom edge to scroll
  through a long track list; drops over waveforms also work. Escape cancels the
  active drag. This changes display order, not timing.
- Height changes video and audio together from 24 to 640 px. Compact audio rows
  hide mixer controls (below 56 px on desktop, 96 px on touch); an audible/silent
  dot remains visible. Use the toolbar Mixer or Workspace → Microphone mix to
  adjust controls. Compact rows intentionally use smaller header targets.
- Each audio header has Trash. Video Trash removes picture and unlinks its audio,
  keeping all audio timings intact. Toolbar Trash removes selected clips and
  linked partners. Undo restores either operation.
- Click **POS** or **DUR**, type seconds, mm:ss.mmm or hh:mm:ss.mmm, then Enter.
  Escape cancels. A typed POS target outside the viewport scrolls into view.
  DUR sets a minimum canvas length and cannot trim existing clips.
  Saved projects retain it; exports include silence and black picture after media.
- **Import audio** asks for an existing track or a new track per file. New tracks
  start together at the playhead; multiple files on one track are consecutive.
  Ordinary audio imports are audible: review Mute/Solo before playback. Reading,
  decoding and waveform stages are shown. Cancel discards the current file after
  decoding completes; files already imported remain. Original desktop paths are
  retained for linked saves. Compressed audio still needs full decoding; this is
  not a disk-streaming editor. Waveform scanning yields to keep controls responsive.
- Drag two picture clips into a partial overlap to create a dissolve. Change the
  incoming transition in Clip settings. Complete containment and three simultaneous
  picture clips are rejected. Audio overlaps mix freely; Shift-select two partial
  overlaps and choose **Crossfade selected audio overlap** for S-curve envelopes.
- **Expand video** opens a body-level viewer that fills the viewport and requests
  native desktop/browser fullscreen. Play/pause and frame-step stay visible.
  Picture gaps and extended tails stay black without pausing audio to load a
  camera. Frame stepping uses project FPS across the full canvas.
  Left/Right steps frames and Space toggles playback. Tab stays within viewer
  controls; clip-editing shortcuts cannot alter the underlying arrangement.
  Escape or Close expanded video returns focus to the expand button; unavailable native
  fullscreen falls back to a window-filling viewer.

## The Canon / H6 interview

1. Open `MVI_8251.crispaudio` or use Add video + recordings to analyze and import
   the Canon camera, RODE jacket recording and H6 room recording. Review sync
   confidence, offset, drift and residual before importing. Keep originals.
2. Choose Fit all. Video and audio tracks share the ruler, time zoom, horizontal
   scroll and red cursor, so synchronized events line up vertically. The viewer
   above keeps its picture fitted independently of timeline zoom. The separate
   Project overview below the tracks shows the entire arrangement; drag its blue
   window to browse or its red cursor to seek. A thumbnail covers an interval;
   it is not a frame-accurate filmstrip.
3. Open Workspace → Microphone mix and select the jacket and room tracks.
   Suggest microphone sections measures each track relative to its active level,
   with hysteresis to avoid rapid switching. This is **not speaker recognition**:
   jacket/room dominance can also mean noise, movement or reverberation. Review
   every suggested section, click its timestamp to listen, and change the chosen
   microphone where necessary. Apply reviewed microphone mix replaces automation
   on those two tracks, enables them and mutes other tracks. Undo restores the mix.
4. Set crossfade duration before applying (default 80 ms). The yellow line on
   each waveform shows gain automation. Add editable points at the playhead;
   gains interpolate identically in real-time playback and offline export.
5. Speech EQ/compression is a removable track chain. Reduce recording noise
   makes a new WAV source using conservative FFT noise reduction and a rumble
   filter; the original remains available to Undo. Listen for speech artifacts.
   Match speech level measures the **whole source file**, targets −16 LUFS and
   limits gain using a −1 dB true-peak ceiling. Trims, clip gains, automation and
   processing are excluded from that measurement; it is not final-mix mastering.
6. Import CrisperWeaver SRT, VTT or `{ "segments": [{ "start": 1, "end": 2,
   "text": "Guten Tag" }] }` in Transcript. Optional offset is in seconds.
   Search, click a cue to seek/select its interval, correct captions, export SRT,
   or remove a passage across all tracks. Removing a passage closes the gap.
7. Save the full project and export edited MP4. Save/Load tracks is for reusable
   audio arrangements. Full projects include picture, links, markers, captions,
   automation and saved synchronization decisions.

## Picture and linked clips

Media → Add video sources accepts multiple desktop camera files, including
silent video. It appends their picture to the current arrangement. Optional
camera audio is placed on a new track and linked to its picture. New camera
tracks are muted when other audio is already present; review the intended mix.
The first picture in an empty project always starts at zero.

The bin keeps source recordings separate from clips. Insert picture at playhead
requires an empty interval; insert audio creates a new track. Prepare lightweight
preview caches a silent 640×360 proxy without changing the exported picture.

Shift-select clips and Link; Unlink permits independent timing/camera changes.
Linked groups move, trim, split, copy/paste and delete together. The two halves
of a split receive separate link groups. Changing a video source or changing overlap length in the inspector requires
unlinking first. Dragging linked picture into an overlap moves its sound with it;
automatic picture blending never shifts audio independently.

Clip inspector supports exact timing, project frame rate, magnetic edges and a
configurable time grid. Video trim handles and frame-step buttons complement
sample/ms keyboard nudging. Slip changes source offsets without moving clips.
Add named markers at the playhead; drag them on the ruler or click to seek.

Remove interval and close gap affects **all tracks**, later markers and captions.
It is reversible. Captions intersecting a removed interval are dropped rather
than inventing new word timings. Remove picture transitions before ripple edits.
Picture transitions and overlapping camera alternatives are not interchangeable:
this version has one composition lane, not a multicam angle-switching console.

Auto-sync tracks keeps a dated decision in the project. Audio drift correction
creates corrected sources and retains originals. Offset changes follow linked
picture; drift correction requires unlinking picture. Confidence gates and stale
project checks prevent uncertain or outdated results from being applied.

## Preview and the apparent 31-second black section

The 253.72-second Canon file had picture at its first frame. The black first
thumbnail covered `253.72 / 8 ≈ 31.7` seconds and was a WebKit frame-capture issue,
not black media. Thumbnail capture now seeks slightly into the first displayable
frame before drawing, while the tile stays anchored at zero. A decoded-frame
wait and a new cache generation avoid retaining the black thumbnail. A small
native FFmpeg first-thumbnail fallback avoids depending on WebKit canvas readiness.
Each camera retains its own strip when selection changes. Trimming between
sample times crops the preceding tile to the new clip start, avoiding empty
leading strips. Thumbnail sources decode serially to bound background load.

Playback also waits for the visible first decoded frame. Pending seeks are not
replaced every transport tick, preventing decoder starvation on large originals.
If preview is expensive, prepare a proxy or hide the viewer. Gaps in an edited
picture composition still intentionally display black.

## CLI

The CLI uses the existing internal `media/` crate. Install FFmpeg and FFprobe.
Outputs must have new filenames. Commands do not modify input recordings.

```sh
crispaudio probe camera.mp4
crispaudio analyze --video camera.mp4 --audio jacket.wav room.wav --output sync.json
crispaudio align --session sync.json --output-dir aligned
crispaudio loudness aligned/track-01.aligned.wav
crispaudio clean-audio --input aligned/track-01.aligned.wav --output jacket-clean.wav
crispaudio prepare --input camera.mp4 --output camera-preview.mp4 --proxy
crispaudio prepare --input camera.mp4 --output camera-first.jpg --thumbnail
crispaudio edit-project --input interview.crispaudio --recipe cuts.json --output edit.crispaudio
crispaudio render-project --input edit.crispaudio --output mix.wav
crispaudio render-project --input edit.crispaudio --output interview.mp4 --video
```

A recipe is an array of operations. IDs come from the project JSON:

```json
[
  { "op": "link", "ids": ["picture-id", "camera-audio-id"] },
  { "op": "split", "ids": ["picture-id"], "at": 12 },
  { "op": "marker", "at": 5, "name": "Question" },
  { "op": "ripple", "start": 20, "end": 22 }
]
```

Also supported: `unlink`, `move`/`slip` with `ids` and `seconds`, `trim` with
`side: "left" | "right"` and `seconds`, and `automation` with `trackId` and
`points: [{ "time": 0, "value": 1 }]`. Move/trim/slip honor linked groups and
shared source bounds. The recipe preserves unknown metadata and writes v3 files.

`render-project` requires linked audio. It renders source offsets, fades/curves,
track envelopes, mute/solo, volume and automation. High/low-pass filters are
supported. Other effects, nonzero pan and master processing fail explicitly;
use GUI export to retain their Web Audio behavior. Portable embedded audio
projects must be opened/resaved with linked sources before CLI rendering.

`edit-video` still accepts standalone picture JSON. Add `sources` and per-clip
`sourceId` for multiple files, and `frameRate` for the output clock:

```json
{
  "path": "/media/camera-a.mp4",
  "frameRate": 25,
  "sources": [{ "id": "b", "path": "/media/camera-b.mp4" }],
  "clips": [
    { "id": "a1", "startTime": 0, "sourceOffset": 0, "duration": 5,
      "transition": "cut", "transitionDuration": 0 },
    { "id": "b1", "sourceId": "b", "startTime": 5, "sourceOffset": 12,
      "duration": 5, "transition": "cut", "transitionDuration": 0 }
  ]
}
```

Sources are fitted/letterboxed to the first source dimensions. Absolute timeline
boundaries are quantized to the output frame rate to prevent accumulated rounding
from repeated cuts. With no supplied mix, `edit-video` produces silent picture.

## Persistence, recovery and limits

New files use project format v3 so older apps reject features they cannot retain.
This app reads v1/v2 projects. Desktop audio remains linked; saving derived audio
from the OS cache copies it beside the project into `<project filename>.media`.
Keep that folder with the project. Original recordings and videos stay linked.
Opening a project can locate missing video/audio files without silently dropping
tracks. Portable audio projects continue to embed PCM WAV.

Autosave stores arrangement metadata every 30 seconds and on unload. Recoverable
unsaved audio is cached in IndexedDB separately, one immutable source at a time.
The preceding snapshot remains available if a cache write fails. Errors are
visible. Recovery is not a substitute for saving: an abrupt crash before the
next successful save can lose recent edits. Single cached PCM sources over
256 MiB require an explicit linked project. Camera audio import has a 512 MiB
PCM decoding budget; import picture alone or prepare shorter audio sections.

Desktop media preparation/export jobs can be cancelled. Proxies and thumbnail
URLs are cached with bounded in-memory thumbnail/URL caches. CLI FFmpeg rendering
streams linked audio. **GUI audio still uses decoded AudioBuffers**, not a fully
paged disk streaming engine; very long multi-hour sessions need segmented input
or CLI rendering. No new iOS video backend is claimed: mobile native composition,
multicam lanes, and physical-device validation remain separate work. Advanced
transition previews retain the documented approximations.


## Native Mac transition export (local 0.7.1)

Use the existing picture clip inspector to choose a transition and its duration;
its overlap and linked timing rules remain unchanged. In **Export video**, choose
MP4 or MOV and the **Apple** media backend. Every listed picture transition can
now render through Apple frameworks, alongside colour, orientation and clip
fades. The edited Web Audio mix stays on the existing export clock.

Whip, glitch and page peel require a supported Metal GPU; this Apple Silicon Mac
was validated. For unsupported GPUs, choose **FFmpeg compatibility** explicitly
(or Automatic, which may fall back). WebM still uses optional FFmpeg. Complex
preview/native/FFmpeg effects are approximate equivalents; page peel is a shaded
2D fold. These desktop changes do not implement video composition on iOS.


## Native linked-project CLI export (local 0.7.7)

The installed local command is `~/Applications/crispaudio-cli-local`. Save a linked
project from the desktop app so its source paths remain accessible, then run:

```sh
~/Applications/crispaudio-cli-local render-project --input project.crispaudio --output mix.wav --backend apple
~/Applications/crispaudio-cli-local render-project --input project.crispaudio --output edited.mp4 --video --backend apple
```

The first command streams the full-clock 48 kHz float WAV mix. The second creates
that mix in an owned temporary folder and exports the saved video in/out range.
Solo, mute, pan, gains, automation, overlaps and fade ramps retain their project
meaning. Low/high-pass, bit-crusher, ring-modulator, delay, chorus, reverb, distortion and compressor effects work
at clip, track and master level. Ring modulation now correctly blends dry/carrier signals; the
bit crusher keeps silence at zero rather than introducing DC bias. All nine current
rack types work natively; unknown enabled FX fail explicitly in the CLI. Native mode never
switches to FFmpeg. Select compatibility explicitly for an unsupported native
input/video codec; its audio mixer has narrower support. Audio output currently
requires a `.wav` filename. Source media and the project file are never rewritten.

Delay and chorus retain their tails inside the chosen duration. Extend DUR before
export if you want the full decay past the last clip. Clip fades apply after clip
FX; a fade ending at zero also silences that clip's later FX tail. Track FX apply
after the track envelope. Delay feedback matches measured macOS WebKit timing,
including its 128-frame feedback step; timing on other browser engines can differ.
Chorus sums its two wet delay lines, as the GUI does. Native racks use at most
64 MiB of DSP-buffer state and 1024 enabled effects across the audible project.
Compression links the two channels and preserves the GUI's automatic makeup,
soft knee, adaptive release and 6 ms lookahead. Its control envelope updates every
32 frames on the project clock. Mono through a compressor becomes stereo before
pan. Clip compressor racks process pre-start silence without reading source audio;
this keeps their envelope clock aligned with the GUI. No latency compensation
moves clips or automation. Float WAV preserves headroom, including peaks above
unity from makeup gain; lower rack/track gain when appropriate.
Timeline distortion uses the same tanh curve and four-times oversampling as the
GUI. Its wet path arrives 192 frames (4 ms at 48 kHz) after the dry path. That
filter delay is retained intentionally, including in fades and short clip tails.
Reverb uses the same reproducible stereo response and WebKit normalisation
as the Mac GUI. Stereo reverb also changes mono-track panning to stereo panning.
At mix=1 its GUI blend retains 30% dry sound; the CLI retains that behaviour.
The 64 MiB budget includes a conservative reservation for convolution buffers.
Several maximum-size reverbs may exceed it; reduce size/count or use GUI export.

### Compare native DSP with WebKit

`scripts/test-native-effects.mjs` generates temporary mono/stereo fixtures, renders
the same saved project through the CLI and actual `TimelineEngine`, and compares
float PCM directly. It tests all three racks, overlaps, delayed starts, pan,
automation, fades, maximum delay, modulation depths, reverb sizes/decays, impulses, high-frequency oversampling and wet/dry endpoints.
It needs a separately built CLI, a running Vite server and optional Playwright
with WebKit installed; it never imports your project or changes app autosave.

```sh
npm run dev -- --host 127.0.0.1 --port 5190
# In another terminal; build the CLI into its own target, not the Tauri target:
CARGO_TARGET_DIR=media/target-cli cargo build --release --manifest-path media/Cargo.toml --bin crispaudio
CRISPAUDIO_TEST_CLI="$PWD/media/target-cli/release/crispaudio" node scripts/test-native-effects.mjs
```

Playwright can be provided through `CRISPAUDIO_PLAYWRIGHT_MODULE` (absolute path
to its `index.mjs`) without adding it to application dependencies. Optionally set
`CRISPAUDIO_WEBKIT_EXECUTABLE` or `CRISPAUDIO_TEST_URL`. The harness prints its
owned temporary folder with saved PCM, projects and `results.json`. It disables
FFmpeg/FFprobe for native renders and needs neither for PCM comparison.

Set `CRISPAUDIO_TEST_EFFECT=reverb` (or another supported type) to run just one
effect during development. The normal run covers all supported effects.

Use the optimised CLI build for timing measurements and long reverb exports.
The local installed CLI uses that build; the debug CLI can be much slower for
FFT processing even though its results match. GUI Web Audio export is unaffected
by Rust settings; native GUI exports use the optimised media crate even in the
local debug app bundle.

## Desktop GUI video export (local 0.7.8)

1. Import the camera and microphone recordings, then align/review the tracks.
2. Edit cuts, fades and rack effects on the timeline. Set video IN/OUT for a section
   or leave the whole arrangement selected. Extend DUR for effect tails as needed.
3. Click the video export icon, choose the picture format/backend and save to a new
   filename. On Mac, 48 kHz projects whose audible sources have mono/stereo disk
   paths automatically stream the mix through the native CLI DSP engine.
4. Cancel from the export panel to cancel both mixing and picture export. Temporary
   mixes are owned by the job and removed on success, failure or cancellation.

The native path keeps the complete project clock so effects started earlier still
contribute to a later section. It sends no decoded PCM across IPC and creates no
extra full-length Web Audio render. Muted/unreferenced in-memory sounds do not
block it; a soloed track remains audible even with its mute button stored on.
If an audible source is generated in memory, the project rate differs from 48 kHz,
or the platform is not Mac, the existing Web Audio export path remains available.
Native mixing errors remain visible; they never silently select another mixer.
The picture backend selector still applies to MP4/MOV/WebM composition.

This improves export memory, not import/playback: source buffers already loaded
in Web Audio remain in the editor. Audio-only GUI exports still use the encoder
worker and Web Audio rendering. CLI usage and supported audio formats are unchanged.

## Direct timeline WAV export (local 0.7.9)

Set audio export format to WAV and choose the bit depth in Settings. On Mac,
linked 48 kHz mono/stereo timeline projects now open the save dialog first, then
stream the mix to a new `.wav` file. No extra rendered AudioBuffer, encoded Blob,
PCM transfer through IPC or duration-sized export cache is created. Cancel in
render progress to stop the registered media job. Existing destination files
are protected; choose a new filename. Native errors remain visible.

WAV uses integer PCM at 8, 16, 24 or 32 bits, preserving the former GUI encoder's
clipping and rounding. Float peaks above unity are clipped for integer export;
no automatic normalisation or dither is applied. Generated/in-memory sources,
other project rates/platforms and compressed formats retain the prior Web Audio
and codec-worker path. Source buffers remain loaded for import/playback.

The CLI exposes the same integer writer without changing its float default:

```sh
~/Applications/crispaudio-cli-local render-project --input project.crispaudio --output mix-24.wav --wav-bit-depth 24 --backend apple
```

The flag accepts only 8/16/24/32, cannot be combined with `--video`, and requires
the native mixer. Without the flag CLI WAV output remains stereo 48 kHz float32,
which also remains the video mix format so headroom is retained until encoding.

For exact native integer PCM parity, use the same optional Playwright/WebKit
configuration and Vite server described above, then run:

```sh
CRISPAUDIO_TEST_CLI="$PWD/media/target-cli/release/crispaudio" node scripts/test-native-pcm.mjs
```

This compares all PCM bytes with actual `TimelineEngine` rendering and the GUI
WAV encoder at four depths, including random stereo samples, silence, rounding
ties and values above full scale. WAV container headers may differ. Fixtures and
results stay in a fresh temporary folder; FFmpeg is disabled for native mixing.

## Native Mac timeline FLAC (local 0.7.10)

Select FLAC in Settings, export the timeline and choose a new `.flac` destination.
The same linked 48 kHz mono/stereo eligibility used for native WAV applies. FLAC
always uses signed 24-bit PCM, independent of the WAV bit-depth preference. The
native mixer writes an owned float WAV, then Apple's encoder reads 4096-frame
chunks and writes FLAC. Cancelling either phase removes the temporary files.
Publication waits for a valid STREAMINFO rate, stereo layout, 24-bit depth, frame
count and populated MD5. Original recordings and project files stay unchanged.

```sh
~/Applications/crispaudio-cli-local render-project --input project.crispaudio --output mix.flac --backend apple
```

CLI `.flac` output is supported on Mac through the native mixer/system encoder;
explicit FFmpeg mode is rejected. WAV defaults and `--wav-bit-depth` are unchanged.
Generated/in-memory sounds, other project rates and other platforms keep the
GUI's libFLAC worker, including its level-5 preset. Both paths use identical
24-bit sample quantisation; encoder presets mean compressed file bytes may differ.
The native path requires temporary disk space for its full float WAV and encoded
output. RAM remains bounded, but import/playback buffers still live in Web Audio.

The helper uses Apple's [sequential AVAudioFile API](https://developer.apple.com/documentation/avfaudio/avaudiofile)
and [FLAC format](https://developer.apple.com/documentation/coreaudiotypes/kaudioformatflac).
No extra codec library is bundled or dependency added. Existing MIT/BSD/Apache
notices remain intact for the application and its worker codecs.

For a real-WebKit FLAC parity check, use the optional Playwright/WebKit setup
above and run `scripts/test-native-flac.mjs` with `CRISPAUDIO_TEST_CLI` pointing
at the separate release CLI. The native render disables FFmpeg/FFprobe; reference
decoding requires FFmpeg (`CRISPAUDIO_REFERENCE_FFMPEG` may specify its path).
The test compares decoded PCM and both STREAMINFO MD5 values, not compressed
bytes. Fixtures/results stay in a fresh temporary directory.
