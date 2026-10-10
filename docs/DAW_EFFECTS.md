# Fades and effects

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
2. Open **Mixer** in the Timeline toolbar, then **Inserts** on a track or the
   Master strip. Track racks process that lane; Master processes their sum.
   **Tracks & microphones** also provides track effects and fade settings.
3. Add reverb, delay, chorus, ring modulation, distortion, bit crushing,
   low/high-pass filtering, bell/shelf EQ or compression. Expand an effect to edit parameters.
4. Effects run top to bottom. Arrow controls reorder them; power bypasses one
   effect, trash removes it. The rack power control disables/enables all effects.
5. Copy a rack and replace another rack with the copied chain. The internal FX
   clipboard is separate from clip Copy/Paste and works across all three scopes.
   Pasted settings are independent; subsequent edits do not change the original.
6. EQ parameter edits update the running graph. Changing rack topology or other
   effect parameters reschedules playback; do not assume every parameter is live.
   Undo restores the chain/settings. Save retains clip, track and master racks.

GUI audio routing is clip gain → clip FX → clip fade → track fade/automation →
track FX → track volume/pan → master FX → master gain → optional output limiter
→ output meter → monitor volume. Realtime and offline GUI export
now use the master rack consistently. Stopping playback disconnects its graph
and stops effect modulation oscillators. Topology and most non-EQ effect edits rebuild the graph; the live controls above
do not constitute general plugin-parameter automation.

Use **DUR** to leave an explicit export tail for delay/reverb. Effects do not
silently extend the project. GUI WAV/MP4 mix export retains Web Audio effects.
Native CLI `render-project` supports the documented native rack DSP and output
limiter, and rejects unsupported processing; it must not silently drop a rack. `edit-video` uses the
same native picture fade validation/export as the GUI.

## EQ, limiter and gain reduction

Expand **Equalizer** in an Inserts rack for the enabled EQ-band response. Drag
bands, use arrow keys (Shift for coarse changes), or enter frequency/gain/Q.
The response is analytical, not a spectrogram or the complete rack's response.

On the Mixer Master strip, enable **Limiter** and set ceiling/release. Numeric
edits commit on Enter or blur; Escape cancels. It limits linked stereo sample
peaks after master gain, with instant attack and exponential release; it adds no
lookahead or delay. It is not true-peak limiting or LUFS normalization.

**GR** reports attenuation on compressor inserts and the limiter. A track/master
strip shows the greatest reduction among its own compressor inserts, not their
sum or clip-level compression. Stop clears readings. Live ceiling/release edits
keep playback running; enabling/disabling limiting rebuilds the graph.

GUI offline and native exports include limiting. Range exports process prior
sound before cropping. See [Timeline workflow](TIMELINE_WORKFLOW.md) and
[CLI settings and routing](MEDIA_WORKSPACE.md#output-limiter-and-gain-reduction).

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
