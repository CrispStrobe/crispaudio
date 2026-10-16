# Timeline controls

Move & trim controls mouse, pen and touch dragging. It starts enabled for mouse
work and disabled for touch selection/scrolling. Select an audio clip to show its
start/end handles. Pull a handle to shorten or extend it within source bounds;
linked clips follow, release creates one undo and Escape cancels the drag.
Switch the mode off to select clips and scroll without moving them.

Right-click an audio clip, or hold it on touch, for Clip Settings, precise placement,
trim tools, fades, speed/pitch, groups, split, copy, cut, voice effects and delete.
The menu scrolls and stays inside the viewport. The same editing commands are
available through desktop menus, command search and the touch ribbon.

Clip Settings opens a focused dialog with name, position, duration and gain.
Fades, FX and appearance start collapsed. Linked audio/picture clips expose
separate Audio/Picture tabs. Information buttons open explanations on demand.
The dialog and FX inspector retain Play/Pause/Stop access. Escape closes the
uppermost inspector; it does not close the underlying clip dialog.

View → Waveform Display chooses normalized or mix-level drawing. This changes
visual scale, not the audio mix. The occasional waveform control no longer
occupies the main toolbar.

Built-in segment effects refresh visible waveforms during slider movement.
The scheduler samples the latest edit at 120 ms intervals between renders, so
continuous movement cannot indefinitely postpone the preview. Clip gain is applied
before effects and fades after them; normalization
uses the original source level so processing level changes remain visible. The
small FX label means processed, FX… means updating (the last processed shape
stays visible), and FX: source means the original waveform is shown. The info button in clip FX explains these states.
Previews use a separate offline context, never the playback device or native
plug-in host. One render runs at a time. New trims, source replacements or placement
changes discard the preceding shape immediately. Hidden windows suspend preview
work; queued requests use the latest settings. The cache retains at most eight entries / 32 MiB. This first implementation handles clips
up to 60 seconds / 32 MiB of stereo PCM. Native inserts, over-budget clips,
evicted results and failures fall back visibly to the source. Track/bus/master
processing and tails outside the clip are excluded. Modulation phase follows a
clip-range offline render; the waveform is not a full running-mix meter.
These extensions remain accepted roadmap work.

Settings → Timeline view enables Fit all by default and chooses automatic,
always-visible or hidden touch ribbon. Fit is enabled initially, runs on project
open/import and adjusts to changed viewport width or lane layout. Manual zoom
remains available between those changes. Very many lanes can still require
scrolling because track height has a minimum.

The touch ribbon offers File, Edit, View, Playback and Tools tabs using the same
command catalog as desktop menus. Tap a tab, then a short command label; scroll
horizontally to reach additional commands. Selection/clipboard/range requirements
are respected. Hardware browser emulation does not replace physical iPad checks.

Explain Timeline Controls lets you point at, tap or focus timeline controls.
Buttons, fields, summaries, boundary handles and ribbon commands have explanation
cards. Help gestures are intercepted until help is closed, so inspection does
not alter the arrangement.

Very short selected audio clips keep distinct start/end trim buttons, even when
their waveform is narrower than the touch targets. Buttons move apart inside the
viewport and use relative pointer motion, so pressing one does not jump the clip
boundary. Their start/end icons distinguish them, and their hit targets take
priority over the playhead. Escape restores the edit; a completed drag is one undo.

The transport now contains Record/Stop, a small settings arrow and actual input
levels. The arrow opens the existing setup/take dialog; capture itself uses the
transport, and active tracks show their own input levels.

Track headers keep the name and arm control visible. The ellipsis menu and
right-click on a header offer mute, solo, arm, per-track recording setup, select
track clips, move up/down, lock/unlock and remove. Native text editing still owns
right-clicks in the name field. Taller touch rows put Arm/Mute/Solo below the name.
Compact rows keep the same actions in the menu. Capture disables header mutations;
locked tracks protect audio changes and removal. Menus close on another project,
outside clicks, scrolling, Escape or another track menu. Arrow/Home/End navigate
the menu. Recording setup opens on that track without starting microphone input.

With multiple selected audio clips, the boundary buttons follow the focused clip
(last touched or right-clicked). Context focus and dragging retain the other selected clips; a plain click or tap
selects only the clicked clip. If it is outside
the viewport, the first visible selected clip supplies the buttons. Linked trim
rules and one-undo/Escape behavior are unchanged.

Video clips use the same focused start/end boundary handles in Move & Trim mode.
The two touch targets remain separate on very short clips. Relative motion trims
linked audio and video together, supports source extension and frame-sized edits,
and records one undo step. Escape restores the gesture; loading another project
abandons it without restoring the old project. The video lane playhead is visual;
the ruler retains seeking and dragging.

Right-click or touch-and-hold a video clip for its twelve context actions:
settings, placement, trim tools, trim to playhead, fades, retiming, edit groups,
split, copy, cut and delete. The same commands remain in desktop menus and the
touch ribbon. Locked picture and recording protect mutations. Menus stay inside
the viewport, support keyboard navigation and close on Escape or an outside tap.

Track and clip selection now highlights only its rows and clip outlines. Selected
headers have a yellow stripe and name. Header Shift-click selects an anchored
track range, including empty tracks; plain click replaces it. A plain clip-body
click also replaces the selection when Move & Trim is on; dragging retains the
selected group. Shift-click clip
selection also works with Move & Trim off. Explicit edit ranges remain separate.

Clip and fade inspectors are modeless, movable by the grip (or arrow keys), and
collapsible. The timeline remains usable. Fade sliders change unlocked selected
clips live, draw a shared envelope preview, and group a drag into one undo. The
original duration presets remain collapsed. Capture protects fade edits.

View and the touch ribbon toggle the persisted Zoom and Navigation row. Its
inactive question-mark button is removed. Master loudness is beside Master and
Limiter and has a persisted visibility checkbox. Settings uses an accessible
gear button. Video layer headers share visibility, locking, ripple participation,
selection, ordering, settings and removal through an ellipsis/right-click menu.
Layer settings and output format open collapsed; capture disables changes.
Titles/captions and picture/output tools use icons. Safe-area guides use an icon
toggle and an information button explaining the 90%/80% guides and preview-only
behavior. No guides are included in exports.

Video body clicks follow the same rule: plain click selects one clip and its
linked audio, Shift-click extends the selection, and dragging retains the group.
Escape abandons the pending click as well as the drag; opening the touch/context
menu retains its existing selection. Track Shift ranges start at the clicked
track if their previous anchor no longer exists.

Floating inspectors retain their compact body height after moving. Collapsing a
moved panel leaves just its header; rotating or resizing keeps the panel inside
the viewport. Losing pointer capture or window focus ends panel dragging.
Picture header Shift-click can start its range from an already selected video
clip, retaining linked audio and highlighting every selected track.

Deselect All clears empty-track selections through desktop menus, command search
and the touch ribbon. Selecting an empty track leaves clip editing disabled.
The status reports selected tracks and clips separately and includes picture,
graphics and captions in the project totals. Legacy video headers show selection
along with linked audio. Folder rows keep a selection marker when collapsed,
with selected/total member counts. Clicking the folder name, Enter on its row or
the Select button includes empty members. Space/Enter activate focused controls
without starting playback. Header Shift ranges follow displayed folder order;
a hidden anchor starts a fresh range at the clicked visible track.

Without a configured or armed recording target, direct Record uses the selected
empty audio track as well as tracks containing selected clips. Existing target
priorities, lock protection and recording ownership remain in place.

Title and caption headers use compact eye/lock icons with accessible names. Their
buttons and clips fit 24-pixel rows. Locked lanes retain navigation and settings
access while blocking movement and visibility changes. During recording, lane
buttons, dragging and the titles/captions settings are disabled. Title/caption
movement is frame snapped, retains caption duration and creates one undo step.
Escape, pointer cancellation, lost capture or window focus loss cancels an active
gesture and restores its redo history; a click creates no undo step.

Title/caption headers precede picture headers consistently, including sessions
with a single legacy video lane, so every name aligns with its clips.

## Source editing (local 0.11.0)

Select an audio clip and use **Edit → Source Editor…**, Find command, the touch
ribbon's Source command or the audio clip menu. The editor displays the visible
source window of that clip. Its ranges use half-open sample boundaries. Drag to
replace a range; Shift or the + toggle adds separate ranges. Zero-crossing snapping
can be disabled for exact numeric sample boundaries. Zoom centres the selection;
Fit restores the window. The channel selector scopes processing and audition.
Play joins the selected portions without their gaps. Loop repeats that audition
through the configured playback device. Closing or starting capture stops audition.

Ranges, Cleanup, Analysis and desktop External effects start collapsed. Additional
explanations live in the information button. Normalize, Silence, Remove DC and
Edge fades create a local preview; Original compares it with the source. Apply
creates a new source in one undo step. Original sources remain referenced by the
clip, portable/linked saves and recovery. Source PCM is stored as IEEE float32
with a WAV fact chunk, retaining exact samples and headroom above full scale;
delivery retains the selected integer depth. Restore original returns the source
window before that processing group; later retiming must first be reverted through
Speed / Pitch. Keep range trims one interval using linked audio/video protections;
locked linked pictures reject the entire edit. Save regions publishes named
project sections for Delivery. Source-editor Undo/Redo operate on project history.

Analysis follows the source ranges. Spectrum/spectrogram identify the channel
shown; all-channel statistics include both channels. FFT size, Hann/Hamming and
display floor are configurable. Long spectra remain bounded sampled overviews,
not spectral-repair tools. Measure loudness analyzes the concatenated selection;
short or silent material can lack a valid integrated reading. Clip, track and
master effects apply when playing the arrangement, separately from raw source
processing and source audition.

Desktop macOS plugin controls scan installed Audio Unit/VST3 effects; VST3 folder
adds a remembered custom folder. Generic parameters, exact values, bypass and
optional refreshed audition are available. Each render runs in a cancellable
isolated helper. Apply saves the processed audio and plugin state/parameters;
normal project playback and exports use the saved audio. Reprocessing requires
the installed plugin. Reported latency is compensated; a VST3 latency change
mid-render rejects the preview. Visible windows are limited to 120 seconds and
retain their duration; extend a clip first for an effect tail. Continuous timeline
insert hosting, native plugin windows, instruments and non-macOS hosts are further
work. Validation uses Apple effects and the temporary Steinberg ADelay fixture;
no test plugin is installed in the user's plugin directories.
