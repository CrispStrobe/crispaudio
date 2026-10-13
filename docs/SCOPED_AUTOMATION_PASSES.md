# Clip and master automation passes

Open the FX automation inspector from an expanded clip/master effect. Choose its
parameter and expand Record pass. Touch records while a control is held; Latch
continues after release; Write starts at playback start (or clip start when later).
Arm before playback, use the inspector transport and move the value slider.
Stopping opens a concise interval review. Use pass adds points to the local draft;
Apply publishes the complete inspector draft as one undo. Cancel, Escape during
capture, collapsing the record section, interruption or stale state discards capture.

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
rate, and ring-modulator/bit-crusher/distortion/reverb mix. EQ, compressor, arbitrary
plugin parameters and musical instrument automation are outside this increment.
