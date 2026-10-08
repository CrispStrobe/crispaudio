# Media workspace — local 0.6.3

CrispAudio edits audio-only projects and audio plus video projects. Open **Workspace**
(the library icon in the main toolbar) for Media, Clip inspector, Microphone mix,
and Transcript tabs. On desktop its width is draggable; on a phone it is an
optional overlay with a close button. Preview can be hidden or expanded separately.

## Everyday timeline controls

- **?** explains Move & trim, zoom, reorder, overlaps, import and fullscreen.
  The main toolbar holds undo/redo, add track and TTS; zoom and row height are
  directly above the tracks. There is no separate View & tools dialog.
- Drag an audio header's six-dot handle onto another header; arrow keys and the
  adjacent up/down buttons also reorder. This changes display order, not timing.
- Height changes video and audio together from 24 to 640 px. Compact audio rows
  hide mixer controls; use Workspace → Microphone mix to adjust those controls.
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
  Escape or Close expanded video returns to the timeline; unavailable native
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
