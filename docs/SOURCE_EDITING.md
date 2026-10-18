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
edit. These are separate actions. Enable **Match loudness** beside Original/Preview for optional monitor-only
matching; see the limits below.

## Build a source-effect chain

Expand **Live effects**, enable it and press the editor's Play button. High-pass,
low-pass and output sliders update the same running graph; their numbers accept
exact entry and touch scrubbing. Original/Preview switches smoothly without
restarting. Start with two fixed-Q Butterworth filters and an attenuating output
control, separate from arrangement FX. Enabling this tool replaces an unapplied
draft; apply a previous edit first to combine operations.

Use **Arrange effects** to turn those controls into an ordered list. Add up to six
high-pass, low-pass, level or clipper effects; duplicates are allowed. Expand one
row to edit its value, use its checkbox for live bypass, and arrows to move it.
Adding/removing/moving an active effect stops audition; press Play again. Numeric
and bypass changes keep the current voice and graph. The final row cannot be
removed, but it can be bypassed or the whole chain disabled.

Order matters: lowering level before a clipper reduces how much it clips; lowering
level afterward turns down the already clipped signal. The clipper caps peaks at
its ceiling, with no lookahead or oversampling. It can add distortion and aliasing;
use the output limiter/metering workflow for delivery requirements.

**Prepare** stops audition and makes a fixed waveform preview. Compare it, optionally
match its loudness, then Apply for one Undo step with the original retained.
The waveform follows adjustments after a short pause (150 ms debounce). A small
label distinguishes a current filter snapshot, updating work and source-only
fallback. Original immediately restores the source waveform; returning to Preview
uses the current matching snapshot. Automatic snapshots never change playback,
project state, saved PCM or Undo. Analysis stays on source audio until Prepare.
Native AU/VST3 **Auto preview** still performs
helper renders and is separate from this continuous built-in filter.

Processing joins selected ranges in order through one filter, then writes only
those samples/channels back. It starts with empty filter history and truncates
output at the selection end; no automatic edge fade or extra tail is added.
Looping retains filter history across cycles, so its later passes can differ from
the first prepared pass. Cutoffs cap below the source Nyquist frequency. Audition
runs at the device context rate, so resampling can differ from source-rate rendering.

Automatic waveform rendering uses a **64 MiB allocation estimate**, including the
full source-window copy and render scratch. Over-budget/unsupported windows show
source audio with a label; shorten the clip window or use Prepare. Only one
background render runs at a time, with one pending latest request. Changing
settings/source/selection discards stale output immediately. Recording and
arrangement playback suspend automatic work. Prepare cancels and
waits for background work before allocating its own render. Validation/copy loops
yield to the UI. Drawing also runs in cancellable slices and publishes a complete
frame; an active browser offline graph itself cannot be forcibly stopped.
These are first-pass static snapshots: they do not trace loop history or instantaneous
parameter smoothing. Native source streams, broader insert types and seamless topology changes remain
separate work.

Prepare supports mono/stereo selections at 8–192 kHz, up to 120 seconds selected
and a 256 MiB allocation estimate including the full source-window copy. Select one
channel when editing a multichannel source. Cancellation discards late output;
Web Audio offline rendering itself can continue until completion. Selection,
settings, source/project changes, recording and closing discard stale work.

Chain Apply stores a version-1 ordered recipe (stable stage IDs, type, enabled
state and numeric value) with the derived source. Project reopen plays that
printed PCM; the recipe is not applied a second time or loaded as a new active
chain automatically. Applying another chain processes the current source. Use
Undo or Restore original before rebuilding from unprocessed audio.

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

## Restoration previews

Open **Restoration** for de-hum, spectral attenuation and short hard-clip
reconstruction. Choose settings, prepare, compare Original/Preview and apply.
Parameters are retained with the derived source. Preparation can be cancelled;
selection/source/settings changes discard in-flight work. Expand **Audition** for
a separate editable listening level shared by A/B. Hot float sources get sample-peak
headroom; this changes monitoring only. **Match loudness** beside Original/Preview
compares integrated loudness and attenuates the louder version, with shared
sample-peak headroom. It supports measurable mono/stereo selections of
0.4–120 seconds. New previews cancel/recalculate and stop audition; press Play
when ready. Silence, short selections and multichannel comparisons show
Unavailable. Saved PCM is unchanged.

Frequency selection uses a logarithmic graph with matching mouse/touch band dragging
and exact numeric bounds. Cancellation restores the previous band.

See [Restoration tools and limits](RESTORATION.md) before using these on a recording.

## Measure and use native effects

Expand **Analysis** for peak/RMS, DC, clipping, loudness/true peak, spectrum and
spectrogram. These describe the selected source audio, independent of timeline FX.

On macOS, native source previews run in cancellable helper processes. A completed
preview replaces the audition buffer at its current position. Parameter changes
still need a helper render; this is not a new continuously running native FX graph.
Processing preserves the source window's length, so extend it first for effect tails.

Continuous comparison currently uses in-memory audio. Long-file streaming,
broader live source FX chains/native streaming and further restoration
(spectral healing, drift tracking and varied-material qualification) remain work
in the [audio-workstation roadmap](DAW_GAP_ANALYSIS.md).


## Native streaming development status

Source **Auto preview** still renders through the helper. The internal native-clock
source adapter is not exposed in this editor. Version 0.13.49 fixes incomplete AU
file reads, missing end samples and an implicit-mixer mono level change. The
original strict source-plan comparison now passes; 52 actual AU window cases at
8–192 kHz match stream DSP exactly. Silent input padding drains processing while
output remains the original clip length; following source audio is not included.
0.13.50 also checks the production real-time worker and DSP through an isolated
null consumer, including controls, loop history and cleanup. The source streaming
UI remains hidden; actual device timing/routing and editor lifecycle are still
open. Native source audition admits 48 kHz only until matching resampling/Apply
semantics are defined. The null clock does not establish physical acceptance.
The [engineering handoff](WORK_HANDOFF.md#native-source-null-output-qualification--01350-checkpoint)
records the measured scope and next acceptance steps.


Version 0.13.51 adds source-preview ownership handoff internally: pending uploads
and outputs are joined before arrangement, recording or another audition starts.
Cancelled requests cannot begin playing after that wait. The editor's native
streaming controls still await UI/state/headroom qualification; **Auto preview**
continues to render. See the [latest handoff](WORK_HANDOFF.md#native-source-ownership-handoff--01351-checkpoint).
