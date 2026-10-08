# Fades and effects — local 0.6.12

## Fade selected audio or video

1. Select one or several clips. Shift adds clips; linked picture/audio is selected
   together. Unlink if only one member should receive the batch edit.
2. Choose **Fade selected clips** (rising-line icon beside the crossfade tool).
3. Enter a duration and choose linear, exponential or S-curve for audio.
4. Apply to the beginning, end, both ends, or remove fades. Audio durations are
   sample-clock seconds; picture durations round to project video frames. Each
   fade is limited to its clip length. Position, source trims and links stay intact.
5. Close the dialog and play to review. One Undo restores the whole batch.

On the picture lane, drag either purple fade handle horizontally to change that
picture clip's fade. The drawn envelope shows its opacity; overlapping fade-in
and fade-out multiply, matching the native FFmpeg filters. Existing audio fade
handles and Clip settings remain available. Touch dragging requires Move & trim;
the fade dialog and numeric settings work without precision dragging. The video
handles edit picture only, even when linked audio is selected too.

**Blend overlapping audio** still applies complementary S-curve envelopes over
reviewed partial overlaps. It does not move clips. Picture overlaps use the
incoming transition and its duration in Clip settings. Fades to/from black and
transitions between pictures are separate controls.

## Clip, track and master effects

1. Select an audio clip and open **Clip settings** for its rack.
2. Open **Tracks & microphones** (mixer icon) and expand **Track effects** for a
   track-wide rack. **Master effects** sits below the tracks and affects the sum.
3. Add reverb, delay, chorus, ring modulation, distortion, bit crushing,
   low/high-pass filtering or compression. Expand an effect to edit parameters.
4. Effects run top to bottom. Arrow controls reorder them; power bypasses one
   effect, trash removes it. The rack power control disables/enables all effects.
5. Copy a rack and replace another rack with the copied chain. The internal FX
   clipboard is separate from clip Copy/Paste and works across all three scopes.
   Pasted settings are independent; subsequent edits do not change the original.
6. Rack edits stop playback. Play again to audition. Undo restores the previous
   chain and parameter state. Save project retains clip, track and master racks.

GUI audio routing is clip gain → clip FX → clip fade → track fade/automation →
track FX → track volume/pan → master FX → output. Realtime and offline GUI export
now use the master rack consistently. Stopping playback disconnects its graph
and stops effect modulation oscillators. Playback edits currently rebuild the
routing on restart; this is not live plugin parameter automation.

Use **DUR** to leave an explicit export tail for delay/reverb. Effects do not
silently extend the project. GUI WAV/MP4 mix export retains Web Audio effects.
Native CLI `render-project` still supports only its documented filters and rejects
unsupported processing; it must not silently drop a rack. `edit-video` uses the
same native picture fade validation/export as the GUI.

## Picture colour correction

Select a picture clip and open Clip settings → Colour correction. Adjust exposure,
contrast and saturation; use power to compare with the original, reset to clear
settings, or copy to all selected picture clips. Linked audio is unaffected.
Colour runs before picture fades/transitions in preview and native export.
See [colour workflow and CLI recipes](VIDEO_COLOR.md).

## Picture orientation

Clip settings also provides quarter-turn rotation and horizontal/vertical
mirroring. Rotated sources fit the existing frame; reset and copy-to-selection
operate on pictures only. Preview, saved projects and MP4 export retain these
settings. See [orientation workflow and CLI recipes](VIDEO_ORIENTATION.md).

## Analysis views and next editor work

SFX and Voice each have collapsible presets, parallel waveforms, an FFT frequency
spectrum and a time-frequency spectrogram. Frequency/spectrogram panels start
closed to preserve editing space and avoid hidden computation. Presets remain
one horizontal row when expanded. Spectrum bars are relative, whereas spectrogram
colours use a fixed dBFS scale. See [SFX and Voice workflow](SFX_WORKFLOW.md).

This completes the shared effects-rack and fade-editing workflow. Further DAW/
video milestones include audio sends/returns, live effect automation, recording
onto timeline lanes, stacked video compositing and multicam switching. Existing
single-picture-lane multi-source editing is not a stacked compositor or multicam
switcher. The interface and tests should not imply those features already exist.
