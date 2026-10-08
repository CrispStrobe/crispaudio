> Local 0.6.4 adds isolated fullscreen keyboard controls, edge scrolling during
> track reorder and compact touch rows with audible/silent indicators.

> Local 0.6.3 keeps picture gaps/tails black without blocking audio; expanded
> frame stepping follows the full canvas. Typed POS brings its target into view.

> Local 0.6.2 adds editable POS/DUR, shared 24–640 px row height, working track
> grips, video removal, partial picture overlaps, audio crossfades, fullscreen
> viewer and import destinations. The **?** button explains timeline controls.
> See [Media workspace](MEDIA_WORKSPACE.md#everyday-timeline-controls).

> Local 0.6.1 puts editable video and audio on the same ruler, zoom and scroll.
> The whole-project overview is separate; only the playback viewer stays fitted.
> Local 0.6.0 adds [Media workspace](MEDIA_WORKSPACE.md): multiple picture sources,
> linked AV edits, ripple/slip/markers, mic automation, transcript exchange and recovery.
> The single-source limitations in the historical 0.5.0 walkthrough below are superseded.

# Timeline workflow — local 0.5.0

The Timeline is a general audio editor with optional video. A specific interview
is an example, not a required workspace or editing mode.

## Start, save and reuse

1. **New project → Clear arrangement** starts an empty timeline. Save first if
   wanted; Undo restores the old arrangement. Original files are never deleted.
2. **Import audio** adds audio. Selecting multiple files creates separate lanes.
3. **Open project / Save project** restore/store the full arrangement: clip
   positions, source trims, fades, gains, effects, mute/solo and video/range metadata.
   Desktop projects link existing source files when possible; keep those files.
   Browser/mobile projects embed audio. Video is linked, not embedded.
4. **Save tracks** selects lanes to store as a reusable audio project with embedded
   sources. **Load tracks** adds those lanes at their saved positions to the
   current arrangement, allocating new IDs. It does not replace the project or
   import the other project's video/master effects. **Import audio** is for raw
   recordings; **Load tracks** is for already arranged tracks.

## Navigate and compare

Transport and position are immediately above the track controls and ruler.
Use the position slider or click the ruler/video lane to seek. Seeking within a
fitted view keeps the view stable; seeking outside a zoomed view brings the
playhead into view. The bottom **Project overview**, arrow buttons and
scrollbar move the visible window without moving clips or the playhead.

Trackpad horizontal motion and Shift+wheel move left/right. Plain vertical wheel
motion scrolls track lanes. Ctrl/Cmd+wheel zooms around the pointer. On touch,
sideways swipes browse in selection mode; enable Move & trim for deliberate clip
movement. The overview window can be dragged in either mode.

**Fit all / reset view** includes the complete picture and the longest audio
clip, resets horizontal/vertical scrolling, and fits lane heights where possible.
It does not change edits, gains or playhead. Time zoom ± changes waveform time
resolution; **Track height** independently changes vertical lane size. Sources
remain at their original sample rate; zoom never changes audio resolution.

**M** stores a track's mute state. **S** temporarily solos a track, overriding its
saved mute. Multiple solos can sound together. Non-solo tracks are silent while
any solo is active. **Clear solos** restores the saved mute mix. Green/gray dots
indicate effective audibility. The mixer explains this rule. Solo affects both
playback and export; clear solos before exporting the complete intended mix.
The separate **Listen only** mixer action changes saved mute states.

**Check alignment** overlays two normalized, pre-effect envelopes. Select a
reference, compare another track, and inspect the beginning/middle/end with a
short time window. Different microphones and reverberation change shape; also
listen and, with video, inspect lips. Waveform normalization is visual only.

## Auto-sync audio tracks

1. Import two or more recordings of the same event. Existing clip positions and
   source trims are included; analysis ignores mute, gains and effects.
2. **Auto-sync tracks** chooses a reference and any number of target tracks.
3. **Analyze alignment** runs native correlation off the UI thread. Review
   confidence, offset and measured clock drift. Unreliable results cannot be
   applied. If the arrangement changes, analysis must be repeated.
4. **Apply offsets** moves target clips relative to the reference in one undoable
   edit. A positive offset moves the target earlier. Content before project time
   zero is trimmed, with original sources preserved and Undo available.

This action corrects offsets only; it reports but does not correct clock drift.
For long camera/recorder recordings, use the media import below, which renders
clock-corrected production WAVs. Analysis currently uses channel one, low-pass
averaged to 1 kHz; it is not sample-accurate phase alignment. Desktop app required.

## Optional video

**Add video + recordings** accepts a video with camera audio and optional external
recordings. Analyze, review, then import into a new project; with recorders,
offset/drift correction renders aligned 48 kHz/24-bit WAVs. Without recorders it
imports the camera's own audio. Silent videos are not supported yet.

The optional video viewer uses the same playhead as audio. **Hide video preview**
gives tracks more space; **Show video preview** restores it. The video lane stays
visible. **More → Detach video (keep audio)** makes the arrangement audio-only;
Undo restores the video. **Expand video** fills the viewer and requests native window fullscreen
when available; **Close expanded video** or Escape restores the previous window
mode. If native fullscreen is unavailable, the expanded viewer fills the app.
The viewer waits for metadata before seeking, retries a transient load once, and
provides **Retry video** for persistent failures. A missing linked file still
requires restoring its path; Retry cannot restore deleted media.

Video uses non-destructive clips from one linked source. Select the picture clip,
seek with the ruler/position slider, and **Split selected** (scissors) or **Split
all** (layers). Split all cuts audio and picture in one undo step. Drag a video
clip or use **Clip settings** to enter its timeline position, source start and
duration. Deleting a clip leaves a black gap; it does not ripple other material.
Audio stays on its own clock. Move/split audio separately when picture edits
should change the sound. Multiple source videos, stacked video lanes and multicam
are not implemented.

The video strip is a **fitted overview**, with its own 0–duration label, even when
audio zooms. The blue window shows the audio viewport; video and audio red lines
represent the same time on different scales. Drag either red line to scrub. Click
the overview background to seek; click a picture clip to select/move it. The audio
ruler retains the zoomed scale. **Fit all** restores the whole audio arrangement.

## Precision, fades and transitions

- Move clips near another start/end to snap within eight screen pixels. Audio
  considers clip edges across lanes; picture considers picture edges. Alt-drag
  bypasses snapping. Toggle the magnet in the timeline tools to disable snapping.
- Arrow left/right moves selected clips by 1 ms; Shift changes this to 100 ms;
  Alt changes it to one project audio sample. With no selection, arrows seek.
  Inputs, selectors and dialogs retain their own keys. The focused red handle
  seeks rather than moving clips.
- Touch uses the left/right nudge icons and a step selector (sample, 1/10/33/100 ms).
  Clip settings accepts exact start times. Audio touch dragging still requires
  Move & trim; picture clips have their own draggable overview hit targets.
- Audio **Clip settings** has fade-in/out durations and linear/exponential/S-curve
  shaping. The **Tracks & microphones** mixer also has track fades, timed from
  the first segment start to the last end, including gaps. Track and segment
  envelopes multiply; both realtime playback and export use them. Resuming inside
  a fade preserves its instantaneous gain.
- Picture **Clip settings** has fade-in/out to black and an incoming transition
  with duration. Changing the style of an existing overlap preserves its timing,
  including linked audio. Unlink before changing overlap length, camera source,
  or removing a linked overlap with Cut. Creating an overlap or changing its
  length moves an unlinked picture clip; audio stays in place. Adjust the sound
  if appropriate. Enter commits numeric edits; Escape cancels. Focusing and
  leaving a field preserves exact timing. Values outside source or linked-audio
  bounds are rejected rather than silently clamped.
  Overlaps must equal the transition duration,
  remain shorter than both clips and never involve three clips. Invalid overlaps
  block export rather than silently changing timing.
- Available transitions: cross dissolve, dip to black/white, wipes and pushes in
  four directions, horizontal blur, cross zoom, pixelize, whip pan, glitch and
  page peel. The page peel is a 2D mirrored fold with shading, not a 3D page
  simulation. Match cuts are made by lining up matching source frames and choosing
  Cut; there is no automatic geometry detector.
- Preview follows clip source offsets and displays black gaps. Expensive effects
  have a labelled lightweight preview; exported effects use FFmpeg at source
  resolution and frame rate (30 fps fallback for unknown frame rates). Picture
  edit boundaries quantize to video frames; audio nudges remain sample based. Video export re-encodes edited clips; completely untouched legacy
  video retains the stream-copy fast path. **Export range** now uses the edited
  timeline clock. Projects preserve clips, fades, transitions and ranges.
- Toolbar icons show names on mouse hover or keyboard focus. A touch long press
  shows the name without activating the command. Dialog form actions retain text.
  Timeline is first in the sidebar; the decorative logo is removed.
- **Apply Voice Effects** loads the selected audio clip into Voice. Process it,
  then **Apply to original clip and return** replaces that clip's source while
  keeping its position, track controls and effects. Timeline Undo restores the
  original. Loading/recording unrelated audio clears the return target. A changed
  speed can change clip length, so check neighbouring clips before export.

## CLI picture editing

Use a JSON edit document containing a linked `path` and `clips` array. Each clip
has `id`, `startTime`, `sourceOffset`, `duration`, `fadeIn`, `fadeOut`, `transition`
and `transitionDuration`. Durations and positions are seconds. For example:

```json
{"path":"/absolute/source.mp4","clips":[
  {"id":"a","startTime":0,"sourceOffset":0,"duration":5,"fadeIn":0.5,"fadeOut":0,"transition":"cut","transitionDuration":0},
  {"id":"b","startTime":4,"sourceOffset":12,"duration":5,"fadeIn":0,"fadeOut":0.5,"transition":"fade","transitionDuration":1}
]}
```

```bash
crispaudio edit-video --edit picture.json --mix timeline-mix.wav --output edited.mp4
crispaudio edit-video --edit picture.json --start 2 --end 7 \
  --mix section-mix.wav --mix-is-trimmed --output section.mp4
```

The first mix uses the edited full timeline clock. The second already contains
only the five-second selection. Omitting `--mix` intentionally produces silent
picture; original camera audio is not automatically reused after rearranging
picture. Output files must be new. CLI accepts silent source videos; the guided
GUI media import still requires camera audio. Video import/export requires desktop
FFmpeg/FFprobe; iOS/browser retain the audio editor. See INTERVIEW_WALKTHROUGH.md
for the Canon/H6 example.


The top file/media toolbar stays on one row; scroll it horizontally when space
is limited. Its ellipsis opens additional media actions above the editor panels.
The waveform icon toggles normalized display (highlighted) versus relative level;
this only changes drawing, never gain or export audio. Hover for its label, or
hold the icon on touch without activating it. The navigation help icon explains
horizontal scrolling and zoom gestures. The project overview has its own hover
help instead of a permanent text heading. Interface labels do not select during
clicks or drags; editable fields and diagnostic text remain selectable.
