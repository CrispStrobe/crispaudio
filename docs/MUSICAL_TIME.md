# Musical timeline — 0.9.2

Open **Timeline → Musical time** to set quarter-note BPM (20–300), beats per bar,
beat note value and the seconds position of bar 1. These settings are a saved,
undoable overlay on the existing absolute audio/video clock. Changing tempo or
signature never moves clips, source offsets, automation points or edit ranges;
it changes where future grid points and clicks fall.

Choose **Bars / beats** for the ruler, or keep seconds. Labels show bar.beat;
time before bar 1 uses preceding bar numbers. The grid offers bars, quarters,
eighths, sixteenths and eighth-note triplets. The global snapping control bypasses
all snapping. Choosing **Existing seconds grid** returns to the existing grid.
Musical snapping applies to audio/picture clip moves, ruler seeks/range dragging,
existing timeline selection gestures and automation placement. Magnetic clip
edges take precedence. Picture trim handles retain their frame-clock behavior;
graphics/caption moves and marker handles retain their existing timing controls.

Enable **Metronome while playing / recording** to hear monitor-only clicks through
the selected playback output. The denominator sets the clicked beat; 6/8 at
120 quarter-note BPM clicks every 0.25 seconds, six clicks per bar, with one
higher-pitched accent at bar start. Click level is independent of programme track
and master processing, followed by the shared monitor volume. The click does not
enter offline/native exports or the electronic recording input graph. Recording
count-in remains the existing seconds-based count-in.

Set a start bar and 1–64 bars, then **Set bar range**. A range exceeding the current
project requires explicit **Extend empty canvas if needed**. The operation creates
one undo step and retains all existing media timing. **Play range in a loop** uses
the existing range transport. Subsequent tempo changes leave that seconds-based
range unchanged; set it again to align it to the new tempo. Removing the overlay
retains clips, ranges and canvas duration.

Clicks are scheduled ahead on the Web Audio clock and reset on transport seeks
and loop restarts. Stopping cancels pending nodes. Long background timer stalls
can miss clicks; missed beats are skipped rather than played in a burst. Existing
frame-driven loop restarts are not sample-accurate music loops. This increment
provides one constant tempo/signature, not tempo maps, swing, compound-meter
accent groups, MIDI sequencing/devices, instrument tracks or plugin hosting.
Those are subsequent M10 work. M9 paging/codec expansion stays deferred.

Validation covers musical arithmetic and magnetic precedence, malformed saved
settings, actual Chrome/WebKit PCM click timing and silence between clicks,
stop cancellation, click-free exports, saved/reopened settings/ranges, unchanged
clip clocks and programme playback during tempo edits, seek/loop scheduler cleanup,
bar labels and German controls at 390px. Headless tests do not establish physical
speaker or microphone acceptance; existing playback remains fixed per the user.
