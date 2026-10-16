# Clip and master automation passes

Open the FX automation inspector from an expanded clip/master effect. Choose its
parameter. Tap the graph to add points, drag with a mouse or finger, or select a
point number and enter time/value. Values display in %, ms or Hz while retaining
the project’s stored units and precision. Arrow keys adjust a selected point;
Shift makes larger steps. Choose Linear or Step, delete points or clear the curve
to restore the static knob. Edits stay local until Apply and cancelled gestures
restore the previous draft. The info button explains the curve’s project clock.

Use **… → Select range** to drag a time interval or type its start/end. While
range mode is active, Copy captures that interval; otherwise it captures the
whole clip or project. **Edit points** returns to point editing. Paste at playhead
keeps the copied duration; Fit paste to range stretches time into the selected
interval. Both replace only that interval with one-sample exterior guards and
stay local until Apply. Built-in inspectors share the compatible track-lane
clipboard, including static values from empty curves. Native copies match the
same plug-in, parameter address and reported range. Clipboards last for the app
session and are independent of project Undo.

Track-lane paste uses a compact review with destination time and length. Dashed
shows current automation; solid shows the proposed result and shading marks the
replacement interval. Typing or touch scrubbing updates this visual preview.
Paste commits one Undo; Cancel leaves the project intact. Source/range details,
stretch factor and boundary explanations are available from the info button.

To record, expand Record pass. Touch records while a control is held; Latch
continues after release; Write starts at playback start (or clip start when later).
Arm before playback, use the inspector transport and move the value slider.
Stopping opens a concise interval review. Use pass adds points to the local draft;
Apply publishes the complete inspector draft as one undo. Cancel, Escape during
capture, collapsing the record section, interruption or stale state discards capture.

With native inserts, these passes are available in Mac **Live** playback.
Preview and microphone capture keep pass recording disabled. Native faults,
failed audition or a playback-mode change discard an active capture; a native
fault also clears a pending review. Supported effect knobs and curves update
without replacing processors. Delay history and oscillator phase keep running.

Clips record inside their own timeline extent. Master passes use the project extent.
All times are absolute project seconds; source offsets do not change the clock.
One-sample guards preserve the original envelope outside recorded intervals.
Passes have bounded point/interval counts and protect locks and source identity.

Ring modulation now also supports carrier frequency automation (0..2000 Hz) in
track lanes, clip/master inspectors and native output. Zero holds oscillator phase.
An empty envelope keeps the previous static frequency behavior, including legacy
static values beyond the automation range. Frequency changes retain live oscillator
phase; later audio phase may differ even when subsequent parameter values match.
The frequency clipboard has its own tag and cannot overwrite the mix clipboard.

Other supported pass parameters remain delay mix/feedback/time, chorus mix/depth/
rate, and ring-modulator/bit-crusher/distortion/reverb mix. Native AU/VST3 parameter
passes are available via the automation icon next to each expanded native knob,
including track inserts. They use the same review and Apply workflow, preserve
static Read values and saved state, and run saved curves in Live/Preview/export.
Values are normalized within the plug-in’s reported range and delivered per
processing block. EQ, compressor and musical instrument automation remain separate.

Built-in and native clip curves follow content moves, nudges, slides and paste.
Split, trim and source-slip edits retain their timeline clock. Speed changes scale
curves with the content. Points moved before project zero produce a sampled zero
boundary, preserving the existing Linear/Step value for the remaining curve.
