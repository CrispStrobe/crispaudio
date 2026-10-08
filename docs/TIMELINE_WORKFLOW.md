# Timeline workflow — local 0.4.1

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
playhead into view. The bottom **Browse timeline** control, arrow buttons and
scrollbar move the visible window without moving clips or the playhead.

Trackpad horizontal motion and Shift+wheel move left/right. Plain vertical wheel
motion scrolls track lanes. Ctrl/Cmd+wheel zooms around the pointer. On touch,
sideways swipes browse in selection mode; enable Move & trim for deliberate clip
movement. The navigation slider works in either mode.

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

Video is one locked source lane. **Export range** sets a single source-clock
in/out interval. Full-length export preserves compressed video and camera audio;
a section encodes an accurate picture/audio cut. Audio clip edits do not cut the
picture. Multiple video clips, ripple picture editing and multicam remain future
work. Video import/export requires desktop FFmpeg/FFprobe; iOS/browser retain the
audio editor. See INTERVIEW_WALKTHROUGH.md for the Canon/H6 example.
