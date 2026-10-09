> Local 0.6.10 adds [batch fades and shared effects racks](DAW_EFFECTS.md), video
> fade handles, consistent playback/master FX and collapsible analysis views.

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


Use the top **?** to enter contextual help mode. Highlighted controls show their
explanation beside the element when hovered, focused with Tab, or tapped. Tapping
in help mode explains instead of editing. This works for disabled controls too.
Only one explanation is shown at a time; there is no manual dialog. Press Escape,
use **?** again or the help status close button to resume editing.


On macOS the menu bar provides **File** (New/Open/Save Project, Import Audio,
Export Audio Mix), **Edit** (Undo/Redo, Cut/Copy/Paste at playhead, Delete,
Select/Deselect All, Split, Add Track), **View** (zoom, fit, track height,
snapping, workspace and panels), **Playback**, **Window** and **Help**. File and
view commands switch to the timeline when needed. File Export Audio Mix always
exports the timeline mix; SFX/Voice keep their own export controls.

Use Cmd+N/O/S/I for project/file actions, Cmd+Shift+E for mix export, Cmd+=/− for
zoom and Cmd+0 to fit. Cmd+Z / Shift+Cmd+Z uses the active panel’s history.
Cmd+X/C/V edits selected timeline clips, including linked picture/sound; while a
text field is focused, macOS handles text editing instead. Cmd+A selects clips;
Shift+Cmd+A clears selection. Backspace deletes selected clips. Cmd+B splits at
the playhead; Shift+Cmd+N adds an audio track. Cmd+1/2/3 opens SFX/Voice/Timeline,
matching existing panel shortcuts. Editing menus disable unavailable actions;
modal dialogs and help mode protect the underlying arrangement.

## Time ranges and track locks — local 0.8.0

The selection-mode icon beside transport switches between clips and time ranges.
In range mode, drag the ruler to mark a range. Drag its lower edge handles or edit
the two exact time fields beside transport. Arrow keys on a focused range handle
adjust by 1 ms; Shift adjusts by 100 ms. Clip selection is retained separately.
The range highlights the ruler, audio tracks and picture lane and saves with the
project. Clear range removes only this interval, not selected clips or media.

**Play selected range** starts at its beginning and stops at its end. Enable Loop
then Play range to repeat that interval. Normal Play continues to use the whole
project; the range does not silently change normal mix/video exports. On Mac,
Playback provides Select Time Range, Play Selected Range and Clear Time Range;
Cmd/Ctrl+Shift+Space plays the range. The audio graph schedules a boundary gate,
so delayed animation cannot leak sound or FX tails beyond the range. Loop restart
still uses animation-frame rescheduling, not a seamless musical loop engine.

Use the lock icon in an audio/picture header to protect its clips. Moves, source
replacement, trims, fades, split/delete/paste and linked AV edits that would change
a locked lane are blocked as a whole, with an unlock notice. Copying remains
available. Track mute/solo/gain/pan and mix automation/track inserts remain usable;
this is an arrangement/clip lock rather than a prohibition on mixing. Lane reorder
also remains available. Source removal/replacement cannot invalidate locked audio.
Lock status persists and Undo/Redo restores complete historical snapshots.
Explicitly loading/resetting a project remains available.

CLI `edit-project` recipes also reject edits that change locked audio/picture
clips. Rendering is unaffected by locks. Advanced trim tools
follow in the next M1 slices; see PLAN.md. The optional actual
WebKit check is `scripts/test-timeline-range.mjs`, using CRISPAUDIO_TEST_URL,
CRISPAUDIO_PLAYWRIGHT_MODULE and CRISPAUDIO_WEBKIT_EXECUTABLE as needed.

## Scoped range editing — local 0.8.1

1. Select a time range and open **Edit time range** beside its numeric bounds.
2. Choose **Lift** to remove content but leave a gap, **Extract** to close it,
   or **Insert gap** to insert the selected duration at the range start.
3. Check the audio and picture lanes that should follow the edit. Leave music
   unchecked when it must stay in place. **Save scope** remembers this choice.
4. Choose whether canvas duration, global markers and transcript cues follow.
   Review the resulting duration. Excluded clips can still extend the canvas.
5. Apply once; Undo restores the complete edit. Original media is unchanged.

Linked picture and sound must both participate. Locked affected lanes block the
edit; explicitly exclude an independent locked lane or unlock it. Range boundaries
inside a video blend or transcript cue require adjustment/review first. Other
transitions remain. Existing outer fades are preserved; a cut that would leave
invalid picture fades/overlaps is blocked rather than silently changing them.
Audio automation retains values at the edit boundary and shifts with included
tracks. Picture participation quantizes boundaries to project frames.

CLI recipes use the same contract:

```json
[{"op":"range-edit","operation":"extract","start":45,"end":47,
  "trackIds":["mic-track-id"],"includeVideo":true,"retimeGlobal":true}]
```

Omit trackIds/includeVideo to use saved participation (older projects default to
all lanes). Legacy `ripple` uses extract with that scope. `edit-project` writes a
new file and refuses to overwrite one. The optional WebKit dialog/undo/parity
check is `scripts/test-range-edits.mjs`; set CRISPAUDIO_CLI for native parity and
CRISPAUDIO_PROJECT to check an existing interview without modifying it.

## Export a selected range — local 0.8.2

Select a range, then use **Export selected audio range** in the main toolbar
or macOS File menu. It uses the current export format/quality setting and adds
the range bounds to the suggested filename. Mix gain, mute/solo, automation and
effects retain their usual meaning. Normal Export Mix still exports everything.

Export processes the timeline from zero to retain effect history, then writes
only the requested sample interval. Native Mac WAV/FLAC/AAC/M4A output stays
bounded in memory; browser/in-memory export renders through the range end and
crops its AudioBuffer, so a late range still requires preroll time and memory.
Existing AAC priming/container behavior remains. No extra fade is applied.

For picture, open **Video range**, choose **Use selected time range**, review
In/Out, then use the existing video export. This explicit choice is saved; audio
edit ranges do not silently replace picture bounds.

```sh
crispaudio --backend apple render-project --input interview.crispaudio \
  --output passage.wav --start 44 --end 48
crispaudio --backend apple render-project --input interview.crispaudio \
  --output passage.mp4 --video --start 44 --end 48
```

Audio CLI bounds require the native mixer; the optional FFmpeg compatibility
mixer rejects them rather than exporting the full timeline by mistake. Picture
uses its existing frame-bounded composition behavior. Bounds are export-only;
they do not change the source project.

## Rolling, ripple and playhead trims — local 0.8.3

Select the clips **left of a shared cut**, then open **Trim tools** in the clip
toolbar or macOS Edit menu. Choose Roll to move that cut: the left clips grow or
shrink, the adjacent right clips change source offset and duration, and their
outer endpoints stay fixed. All linked audio/picture cuts must align. Ambiguous
neighbours, incomplete right-hand links, locked lanes and exhausted source handles
block the edit. Rolling also accepts a valid two-clip picture transition; its
overlap window moves while its type and duration stay fixed.

Ripple left/right trims shorten or extend the selected edge and shift following
material on saved participating lanes. Review scope under Edit time range first.
Canvas, markers, transcript and included automation follow its range contract;
crossed cue/blend boundaries require review. Positive amounts move an edge later:
positive left trims shorten; positive right trims extend. Left extensions can
reveal earlier source audio even at timeline zero. No media file is rewritten.

Trim left/right to playhead changes a shared selected edge without shifting later
clips. It may leave a gap; a picture overlap without a matching blend is blocked.
Review the duration and Apply once; Undo restores the whole operation. Picture
edits use project frame boundaries. Source limits are checked, not silently
clamped to a different requested trim.

Use **Previous/Next edit point** or Cmd/Ctrl+Alt+Left/Right to seek distinct clip
starts/ends and canvas boundaries. Playback stops; clip selection remains.

```json
[{"op":"roll","ids":["left-clip-id"],"seconds":0.08},
 {"op":"ripple-trim","ids":["left-clip-id"],"side":"right","seconds":-0.08}]
```

`trim-to-playhead` uses `side` and `at` (seconds). The recipe includes linked clips
automatically and applies the same limits. The optional WebKit/native parity
harness is `scripts/test-trim-edits.mjs`, using the range harness environment vars.

## Named edit groups and command search — local 0.8.4

Select clips, open **Named edit groups** in the clip toolbar or Mac Edit menu,
enter a name, then choose **Create / rename group from selection**. Existing
groups and source-linked clips in that selection join the group. Names appear
on clips and in the group list; click a name to recall its members. Use **Ungroup
selection** to remove membership while retaining AV links.

With **Enable group editing** on (default), selection, move/trim/split/delete and
clipboard actions include the complete group and its AV links. Members retain
relative timing during moves. Clip effects and mixing controls retain their
existing scope. Locked members block the whole protected edit. Splits and range
fragments retain membership. Pasted copies and loaded tracks get new group IDs,
so editing them cannot move the original group by mistake.

Disable group editing to work on individual members or roll one cut within a
group spanning several cuts. AV links remain active. The toggle saves with the
project and clears selection to avoid an accidental stale group edit. Range edits
require all grouped lanes in scope while grouping is enabled; disabling grouping
explicitly permits an independent lane scope. Source unlink is a separate action
and does not remove named groups. Metadata changes on locked clips require unlock.

Use **Find command** in the top bar, Cmd/Ctrl+K, or Mac Edit menu. Type part of
an action name, click a result or press Enter for the first enabled result.
Shortcut hints appear alongside actions; unavailable selection/range actions
are disabled. Escape closes search. Search closes before invoking another dialog.

CLI recipes expose the same grouping behavior:

```json
[{"op":"edit-group","ids":["mic-clip","picture-clip"],"name":"Interview"},
 {"op":"move","ids":["mic-clip"],"seconds":1},
 {"op":"group-editing","enabled":false}]
```

`ungroup` removes named membership; `unlink` only removes source links.
The optional `scripts/test-edit-groups.mjs` checks actual WebKit controls,
command dispatch, German phone-sized layout and native recipe parity.

## Transcription and word cuts (0.8.5)

Use Workspace → Transcript → Transcribe with CrispASR. Select a timed word and
press Delete, or use its trash button, to extract matching sound and picture
across all lanes. Undo restores the whole operation. Review/edit word times and
the displayed frame-covering cut first. See [Speech editing](SPEECH_EDITING.md)
for installation, model choices, CLI and current desktop/mobile limitations.

### Keep only text pasted into the editor (0.8.6)

Transcript → Keep pasted text accepts an edited copy of the timed transcript.
Compare first, review source ranges and resolve repeated phrases; Apply retains
only those passages across all sound and picture. Undo restores everything.
[Workflow and real interview test](KEEP_TEXT_EDITING.md).


## Slide editing (local 0.8.7)

Arrange linked footage into three neighbouring clips (cuts or valid picture
transitions). Select the middle clip, open
**Trim tools**, choose **Slide selected clip between neighbours**, then enter a
positive/negative displacement in seconds. Review the displayed source handles
and Apply. Picture-linked edits snap to frames. The selected clip keeps its source
in/out and length; the left clip's end and right clip's start change. The outer
endpoints, project length, markers and timeline automation stay fixed. Undo restores
all lanes together. Existing word alignment must be regenerated after this edit.

One unambiguous neighbour is required on each side in every selected lane. Locks,
source limits and enabled named groups apply to neighbours too. Existing picture
transition types and overlap lengths stay fixed. Use slip to change a
clip's source content without moving it; slide moves its fixed content instead.

CLI recipe: `[{"op":"slide","ids":["middle-clip-id"],"seconds":0.08}]`.
Use `crispaudio edit-project --input project.crispaudio --recipe slide.json
--output slid.crispaudio`; the input project and source media remain unchanged.


## Rolling a picture transition

Select the clips to the left of the transition and open **Trim tools → Roll cut /
transition**. Enter the signed displacement and review Apply. The left clip gains
or releases source frames; the right clip starts later/earlier and adjusts its
source offset, preserving its outer endpoint. Its incoming transition keeps the
same type and overlap duration. Linked audio moves by the same frame displacement;
its existing offset relative to picture stays unchanged. Undo restores all lanes.

The transition must already have a valid two-clip overlap matching its duration.
Both overlap edges must lie on project frame boundaries. Each neighbouring clip
must retain at least one frame outside the overlap. Source limits, locked/grouped
lanes, ambiguous neighbours and conflicts with another transition block the edit.
Generic range boundaries through picture blends remain restricted. CLI uses
`[{"op":"roll","ids":["left-clip-id"],"seconds":0.08}]` for cuts and transitions.

The optional macOS `scripts/test-roll-blend.py /path/to/crispaudio` verifies the
moved dissolve in native Apple exports using generated colour clips. It uses
installed FFmpeg/FFprobe for fixture creation/inspection; no user media is needed.


## Sliding across picture transitions

Slide in **Trim tools** accepts incoming, outgoing or two-sided picture transitions.
Picture may start before its linked audio cut; the editor compares the underlying
edit boundaries, including the incoming overlap. All middle clips retain their own
source offsets and durations while moving by the same frame displacement. Both
transition windows move, retaining their type and overlap length. Neighbours fill
the move through source trims; outer endpoints stay fixed.

Review the displayed source limits (also shown for an out-of-range amount). Each
neighbour must keep at least one frame outside its transition, and the middle clip
must keep at least one frame outside both overlaps. Ambiguous extra clips across
the three-clip span are rejected. Existing ASR alignment becomes stale; regenerate
it before speech cuts. CLI uses the same `slide` ids/seconds recipe.

Optional macOS verification: `python3 scripts/test-slide-blend.py /path/to/crispaudio`
checks both moved dissolve windows in Apple exports using synthetic colour sources.


## Ripple trims through picture transitions

Select linked clips, open **Trim tools**, choose **Ripple trim left/right edge**,
and enter the signed displacement. Positive left trims shorten; positive right
trims extend. Left trims keep the clip start fixed, change its source offset and
move following participating material by the opposite displacement. Right trims
keep the source start fixed and shift following material with the edited end.

Existing incoming/outgoing picture transition types and overlap lengths remain
fixed. The incoming window stays at the selected clip's start; the outgoing window
and following picture move with its new end. Linked sound follows the logical edit
boundary, accounting for incoming picture handles. Selected clip IDs/source links
stay intact. Review saved ripple participation first: locks and incomplete linked
or named-group scopes block the operation. Fixed lanes stay fixed.

Markers, canvas floor, included track automation and unaffected transcript cues
use the range-retiming rules. Cue boundaries still require review. Surviving word
alignment is retained after shortening; extending source speech makes old acoustic
alignment stale until re-ASR. Each selected picture must retain a frame outside
its overlaps. Source/media files are never changed; Apply is one undo step.

CLI uses `ripple-trim` with `ids`, `side` and `seconds`. The transition policy is
internal to reviewed trims: generic lift/extract/insert boundaries through blends
remain blocked. Optional native check:
`python3 scripts/test-ripple-blend.py /path/to/crispaudio`.
