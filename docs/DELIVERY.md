# Delivery, portable media and cut exchange — local 0.9.1

Open **Delivery** in the timeline toolbar. Choose a built-in archive, landscape,
portrait or review preset, then adjust the settings for this export. Named presets
are saved on this device. Each queued job retains its project, source map, settings,
range and output path; changing the editor afterward does not alter that job.
Completed outputs have a `.delivery.json` settings record.

## Export and queue

Whole project, edit range, selected clips and selected track/bus stems are separate
scopes. Selected-clip export isolates the selected sound/picture and keeps their
source clocks. Picture-only selections contain no unselected sound. Select linked
sound and picture together when both are needed. Selected-clip exports exclude
unselected titles/captions. Range exports render the earlier DSP history before
cropping to the range. Caption sidecars are clipped and shifted to start at zero.

WAV supports 16/24/32-bit integer PCM, stereo or mono. Mono averages the two rendered
channels. Linked 48 kHz projects on macOS also support FLAC and AAC with an export
bitrate. Other desktop projects use Web Audio for WAV. MP4/MOV picture delivery
uses the Apple compositor on macOS, with explicit even dimensions (64–4096) and
1–60 fps. Highest-quality delivery preserves composition dimensions. ProRes 422 /
LPCM requires MOV and a compatible Apple encoder. Resolution/frame rate changes
fit source picture to the composition; nearest frames are duplicated/dropped.
No custom video bitrate or optical flow is provided. Apple medium-quality export
was rejected for this workflow because it changed requested dimensions.

Stems are **solo exports** of the selected track or bus. They include the existing
routing, effect returns and master processing, using the same solo rules as the
mixer. A selected bus includes its upstream sources. Solo overrides stored mute
for auditioned sources. Nonlinear processing means these stems may not add back
exactly to the full mix; these are not pre-master summing stems.

Choose an output folder and add jobs to the queue. Jobs run sequentially and show
rendering/encoding/caption/settings phases, final paths and errors. Progress is by
phase and completed job count, not a fabricated percentage. Cancel queued or active
jobs; an active native job must finish cancellation before the next starts. Retry
uses the retained snapshot and a new output filename. Output publication does not
overwrite existing files. If a sidecar/settings write fails after the media completes,
the completed media remains at the displayed path. Closing the Delivery dialog
keeps the queue; leaving the timeline/unmounting it cancels the session queue. Queue snapshots now survive app restart. Interrupted jobs return as failed
with their original session/settings/source references, ready for **Retry to new
file**. They are not silently re-exported. Completed entries do not decode their
audio on restoration. Missing sources report their retained output path and remain
in storage rather than being silently replaced. Delivery/copy operations require desktop;
existing browser/mobile quick exports remain available separately.

## Collect a portable project

**Review project media** freezes a project snapshot and lists referenced files,
size and missing media. **Locate missing media** updates that reviewed snapshot;
the open editor is unchanged. Collection is blocked until all references resolve.
Choose a parent folder to create a fresh package containing `project.crispaudio.json`
and `media/`. Media paths, retained original retime paths and provenance originals,
video/still paths and alternate-take sources are collected. Embedded audio stays
inside the project JSON. Canonical duplicate files are copied once. Originals are
never moved. Copying checks cancellation, source size/change and synchronizes the
output; a failed job cleans up its own files and publishes no usable project.

Move the whole package, then open its project through the app's project picker.
Relative references resolve against that project file; normal missing-media
recovery remains available. This is a folder package, not a ZIP archive or an
exchange of installed external ASR executables/models. Very large media still
requires adequate disk space; wider paging/import rewrites remain deferred.

## Cut-only OTIO exchange

**Review cut exchange** creates an OTIO JSON snapshot before **Save OTIO cuts**.
Cuts retain source offsets, gaps, audio/video lane timing and stored mute/visibility.
Overlapping intervals are placed on additional exchange tracks without shifting
their start times. Referenced derived media is exchanged as an ordinary clip.
In-memory sources without a linked path become explicit missing references.

The review and file metadata report omitted FX/gain/pan/automation/routing, fades,
transitions, composition, titles/captions, comp metadata, markers and source speech.
Solo audition state is omitted. Compositing and layer ordering in another editor
must be reviewed. This is an export subset; OTIO import and a complete editable
project round trip are not implemented. Use the collected CrispAudio project to
retain the full editor state. Generated files use the documented legacy `Clip.1`
schema and are checked with the official OpenTimelineIO reader.

Schema reference: [OpenTimelineIO serialized data](https://github.com/AcademySoftwareFoundation/OpenTimelineIO/blob/main/docs/tutorials/otio-serialized-schema.md).
Apple codec preset: [ProRes 422/LPCM](https://developer.apple.com/documentation/avfoundation/avassetexportpresetappleprores422lpcm).

## Regions, naming and summing stems (local 0.11.0)

Save source selections as named regions in Source Editor → Ranges, or reuse the
project's existing named sections. Delivery → Named regions creates an independent
export for each interval, clipping caption sidecars to that interval. Names and
metadata is collapsed initially. Filename templates accept {project}, {region},
{track} and {index}; the unique suffix protects existing files. Title, artist and
comment are embedded as RIFF INFO in WAV, including odd-length mono PCM, and saved
in every delivery manifest. Other formats currently retain these fields in the
manifest, not embedded container tags.

Solo stems preserve the existing solo/master behavior. Pre-master summing stems
instead export individual contributions to the master input, including complete
upstream sends/buses/ducking and track processing. Other master contributions route
to a silent export-only sink. Master gain, master inserts and output limiter are
excluded. Sum every contribution to reconstruct the pre-master mix; apply master
processing once afterward. Only tracks/buses with a direct output or send to the
master are eligible. The open project and routing remain unchanged.

Queue snapshots use a separate IndexedDB database. Media with linked paths stays
linked; generated audio is embedded for recovery. Every runner persists its job
before publishing output. Cancellation and app closure retain retryable snapshots;
retry always chooses a fresh output name. Large unlinked sources above the existing
256 MiB recovery bound require a linked project first.

### Saved queue recovery (0.11.2)

Queue entries and immutable audio snapshots are separate IndexedDB records. Existing
0.11.0–0.11.1 records migrate in one transaction. Phase updates write only changed
entries; retries share the original snapshot. Opening the application restores
history without loading linked files or decoding audio. Interrupted jobs await an
explicit Retry, which loads the saved session and chooses a fresh output filename.

Failed/cancelled entries have a media-review action. Locate missing media there to
update that saved export's snapshot; the current editing session stays unchanged.
Retry rejects unavailable required audio before writing an export. Queue entries
can be removed individually; Clear finished exports removes done/cancelled entries,
retaining failed and active work. These actions remove saved queue data, never
output files. Snapshots are collected only when no remaining entry references them.
