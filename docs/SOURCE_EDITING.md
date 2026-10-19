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

On macOS, external source effects use cancellable helper processes. **Rendered**
remains the default: a completed preview replaces the audition buffer at its
current position. Rendering preserves the source window's length; extend it first
if you need effect tails.

## Native external-effect preview

Since **0.13.54** (mono added in **0.13.60**, contiguous selections in **0.13.61**, 44.1 kHz in **0.13.62**), the editor offers **Native · 48 kHz** beside the shared Play/Stop
controls after selecting an external effect. It supports one contiguous selection
of at least 2048 samples in an unretimed mono/stereo 44.1/48-kHz clip up to two minutes,
with all channels selected. Other rates, separate ranges, individual channels and
longer clips continue to use Rendered. The whole clip stays within the limit: a
short selection does not remove the cost of retaining and processing its history.

Native processes at 48 kHz. A 44.1-kHz source is converted before effect processing;
Rendered uses its original sample rate. These processing orders can sound different,
especially with nonlinear or sample-rate-sensitive effects. Apply always retains
the source sample rate, channel count and exact prepared samples. Boundaries round
once to the native clock; the source waveform/cursor retain the selection.

Press Play, adjust effect parameters, type or scrub their numbers, and switch
**Original / Preview** without replacing the running graph. Monitor level starts
at −12 dB or lower; a separate sample-peak limiter at −1 dBFS protects native listening.
This is not true-peak protection. Neither control affects prepared audio or Apply.
Details stay behind the mode's information button. The Rendered auto-preview
control stays disabled in Native; separate display snapshots run without stopping
the native graph.

For a partial selection, the native worker processes from the clip beginning
before emitting the selected interval. The cursor follows that selection on the
source waveform; looping returns to its start while keeping effect history.
Playback stops at the selection end and does not append an effect tail. Extend
the selection if you need that tail.

**Render preview** stops and joins native output, then makes a fresh helper pass
from restored state and current parameters. **Apply** commits only that prepared
audio into the selected samples, preserving every sample outside the selection,
the original source/offset and one Undo step. Running plug-in history,
monitor gain and the monitor limiter are excluded. A fresh pass can differ from
looping or a plug-in's real-time processing mode. A latency-changing parameter can
stop native playback; restart with the new graph or choose Rendered.

Since **0.13.63**, the waveform follows native FX parameter changes after a
350 ms pause using a fresh **source-rate** helper render. The compact **FX · rate**
badge identifies a current snapshot; Updating, Source or unavailable labels mean
no current FX snapshot is shown. Original shows dry audio. Only selected samples
are replaced in the displayed PCM, with no monitor gain/limiter applied.

Snapshots have a 64 MiB PCM allocation estimate, including encoding, IPC, decoding
and helper latency padding; plug-in internals are outside that estimate. Large
clips keep the source waveform; use Render preview to prepare them explicitly.
Jobs are cancellable, serialized even across editor replacement, and stale source,
selection or parameter results cannot publish. Temporary input/output files are
removed. A snapshot failure shows source audio and does not stop native playback.

Display snapshots never enable Apply or change project audio, analysis or loudness
matching. Those still use source/prepared audio. Source-rate snapshots can differ
from the live 48-kHz output, real-time processing and accumulated loop history.
Selection, channel, loop, source, project, lock, output-device,
recording and arrangement changes stop native preview. Source start joins an
existing arrangement output and stops other auditions. Stop input preview before
using Native. Native errors stay visible; choose Rendered explicitly to recover.

This mode is opt-in candidate software. The actual React controls have been tested
through a development-only browser/Rust null bridge with real AU/VST3 processing,
offline Web Audio substitutes and synthetic time. This does not qualify Tauri
window/command ownership, WebKit, Core Audio routing/timestamps, physical listening,
latency, hotplug or sustained load. The installed baseline is unchanged.
See [checkpoint and remaining acceptance](WORK_HANDOFF.md#shared-native-source-controls--01354-checkpoint).

Long-file streaming, broader live effect chains, native live waveform snapshots,
spectral healing, drift tracking and varied-material restoration qualification
remain in the [audio-workstation roadmap](DAW_GAP_ANALYSIS.md).

## Repeatable external-effect previews

From 0.13.52, each preview starts from the effect's restored state and the current
parameter values. Rendering again does not continue the previous render's DSP
history. Changing a parameter clears the old prepared result; render again or
use **Auto preview** before Apply. Apply commits that prepared audio and saves its
starting state and parameters with the edit history. Saved effects restore both
state and explicit parameters when selected again. This is metadata recall on the
current source, not automatic reprocessing from the retained original.


## Edit a saved external effect

On Mac since **0.13.64**, select an edited clip, open Source Editor → External effects →
**Edit saved effect**. Adjust the restored parameters, choose **Render preview**,
compare **Original / Preview**, then **Apply**. Playback and A/B use Rendered audio;
recalled recipes do not yet offer Native audition. Monitor level changes listening
only. Changing parameters invalidates the prepared audio until the next render.

Each pass starts from the retained original and restored base state, replacing the
saved operation rather than adding the effect again. The full processing window
is rendered, including history before a trimmed/split clip. The waveform shows
that full window and fixed saved effect ranges; the outline marks the current clip,
and playback uses that clip. Saved individual-channel and disjoint-range choices
stay fixed. Apply preserves the clip's timing, fades, gain, source offset and
original mapping, changes only its source reference, and adds one Undo step.
Other clips keep their old source. Undo/Redo and portable save/reopen retain the
recipe and originals. Missing originals/plugins or a changed project do not publish
partial edits. Derived files are staged, protected before publication, and rolled
back when preparation is cancelled or becomes stale.

The first slice supports **one saved plug-in operation**, matched decoded source
and derived rates of 44.1/48 kHz, one or two channels, up to two minutes and a
256 MiB PCM allocation estimate including helper latency padding. Large windows,
retimed clips and mixed operation journals remain gated with an explanation behind
(i). Arbitrary plug-in internal allocation is outside that PCM estimate. Imported
legacy recipes may not record the original file's processing rate; a new pass uses
the retained decoded source rate, rather than promising byte-identical historical
plug-in output. This does not expand Native's current channel/range/rate admission.

Editing ranges/channels or replaying mixed histories requires a later journal
replay step so earlier edits and processing-window coordinates are preserved.
