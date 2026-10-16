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

## Measure and use native effects

Expand **Analysis** for peak/RMS, DC, clipping, loudness/true peak, spectrum and
spectrogram. These describe the selected source audio, independent of timeline FX.

On macOS, native source previews run in cancellable helper processes. A completed
preview replaces the audition buffer at its current position. Parameter changes
still need a helper render; this is not a new continuously running native FX graph.
Processing preserves the source window's length, so extend it first for effect tails.

Continuous comparison currently uses in-memory audio. Long-file streaming,
audition level/loudness matching, full live source FX and further restoration
(channel/polarity, click repair, spectral repair, de-hum and declipping) remain work
in the [audio-workstation roadmap](DAW_GAP_ANALYSIS.md).
