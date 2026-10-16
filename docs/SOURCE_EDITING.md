# Work on a source recording

Select an audio clip, then choose **Edit → Source Editor…**. On touch, use the
Edit ribbon or command search. The editor works on that clip's source window;
arrangement playback includes the track, clip and master FX separately.

## Listen and compare

Drag to select samples. Shift or **+** adds a separate range. **Play** joins the
selected ranges for listening; the cursor jumps over the excluded portions.
Choose a channel, zoom into samples, or enable zero-crossing snapping as needed.

Open **Cleanup** and prepare normalization, silence, DC removal or boundary fades.
Use **Original / Preview** beside playback to compare without restarting. A short
crossfade preserves the listening position. Loop changes, new cleanup previews and
Reset keep playing. For an active normalization preview, valid target edits update
what you hear while typing or scrubbing; Escape restores the initial value.

Here, **Original** means the clip's current source before this draft. **Restore
original** in Cleanup returns to the retained recording after an applied source
edit. These are separate actions. Comparison does not automatically match loudness.

## Keep an edit

**Apply** creates a derived source and one Undo step. The original audio remains
available. Only the selected ranges and channels change. Reset discards the draft.
Selecting ranges/channels, applying, starting recording, starting arrangement
playback or closing the editor stops audition and releases its audio nodes.

**Find active audio** locates the useful sound around silence. **Keep range** trims
linked material too; locked linked tracks prevent a partial edit. Named ranges can
be saved as project regions for delivery.

## Channel tools and manual click repair

Expand **Channels & repair**, choose an operation, then use the wand button to
prepare its preview. **Invert polarity** affects the chosen channels/ranges.
For stereo operations, choose **All channels**: swap L/R, write their average into
both channels, or copy one side to the other. Mono mix keeps two channels and can
cancel opposite-polarity audio. No automatic gain boost or boundary fade is added;
listen at selection edges. Apply first if you want to combine several operations,
since preparing a preview replaces the current draft.

For an isolated click, turn **Zero crossings** off and select just the damaged
samples. **Ranges** allows exact start/end sample entry. Choose **Repair click**
and **Zoom to selection**; close zoom shows the connected samples and sample dots.
Select the damaged channel, leave two clean samples before and after each gap,
and keep at least two clean samples between separate gaps. Each gap must be at
most 1 ms (48 samples at 48 kHz, 44 at 44.1 kHz).

With **Repair click** chosen, audition includes 100 ms before and after the gaps,
merging overlapping listening windows. This adds listening context only; the repair
still changes just the selected samples. Entering/leaving repair listening mode
stops audition so it can start with the new window.

The preview fills the gap with a cubic curve bounded by the two clean anchor
levels. Compare it with Original in that context before Apply. Only
selected samples change; length, channel count and timing stay intact. Apply writes
a derived source, retains the original, and creates one Undo step.

This is conservative interpolation for short isolated clicks. It cannot recover
lost waveform detail in a long dropout, a missing transient or a clipped passage.
Repair is unavailable at window edges or without enough clean context; extend the
clip/source window if clean material exists outside it. No automatic click detector
or spectral editing is included in this increment.

## Measure and use native effects

Expand **Analysis** for peak/RMS, DC, clipping, loudness/true peak, spectrum and
spectrogram. These describe the selected source audio, independent of timeline FX.

On macOS, native source previews run in cancellable helper processes. A completed
preview replaces the audition buffer at its current position. Parameter changes
still need a helper render; this is not a new continuously running native FX graph.
Processing preserves the source window's length, so extend it first for effect tails.

Continuous comparison currently uses in-memory audio. Long-file streaming,
audition level/loudness matching, full live source FX and further restoration
(spectral repair, de-hum and declipping) remain work
in the [audio-workstation roadmap](DAW_GAP_ANALYSIS.md).
