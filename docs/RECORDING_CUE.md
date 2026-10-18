# Recording cue mix

In the default **Compatible** mode, open the arrow beside Record, expand **Input**,
then **Cue mix**. Connect the input
and enable **Monitor microphone**. The input meter shows the raw signal. Cue level
starts at **−12 dB**; type a value or drag the fader. Pan and Mono affect only the
cue. Recorded takes remain dry and keep their original placement.

The cue uses the selected playback output and monitor volume, independently of the
track fader, track pan, arrangement routing and master FX. There is no separate
headphone output or independently balanced backing mix yet. Use headphones when
monitoring a microphone to avoid acoustic feedback. **Disconnect input** releases
the microphone; disabling monitoring releases just the cue and its plug-in streams.

## Native cue inserts on Mac

Add AU/VST3 inserts in Track Settings, then enable **Native track inserts
(buffered)** in Cue mix and reconnect input. Enable monitoring to listen. Up to two
enabled native inserts per input, eight across the recording group, use their
saved static settings and order. Disabled inserts are omitted; bypass keeps the
same delay. Built-in effects and saved automation curves are not part of this cue
path. Edit native inserts while stopped; rack changes invalidate the warm input.

The whole input rack shares **4096 samples of bridge buffering**, plus the sum of
reported plug-in latencies: at 48 kHz, **85.3 ms for either one or two inserts**.
Version 0.13.33 removes the second bridge buffer that previously made a two-insert
cue add 170.7 ms before plug-in latency. The displayed FX delay
excludes device/input/output latency. This buffered path is unsuitable for tight
real-time performance. The separate [native recording preview](NATIVE_INPUT.md) now connects native
capture/output; physical hardware qualification remains pending. A plug-in
fault or missed deadline mutes the cue and closes its streams; raw recording
continues through the independent capture worklet. Re-enable monitoring to retry.

Recording prepares native accompaniment first, releases warm cue streams before
that render, then starts separate cue sessions. Takes remain dry; their normal
track inserts apply during later arrangement playback. Wet capture with retained
dry originals is separate work.

Cue controls are stored per track in projects and local templates. Templates use
the default input, monitoring off and recording unarmed. Cue slider gestures create
one Undo step. Undo can mute a cue or invalidate input ownership; it never opens a
microphone or automatically enables monitoring.

## Measured scope

[Mac native checks](evidence/recording-cue-shared-buffer.json) use actual Tauri IPC,
WebKit AudioWorklets and the bundled Apple AU helper, with generated input and a
silent output sink. One/two AUBandpass and SDK ADelay VST3 chains at 48 kHz pass eight-second captures
with the expected response and empty native registry after close. Bypassed AU
impulse checks measure exactly 4096 samples of bridge delay for both rack sizes.
This does not qualify physical microphones, commercial inserts, long sessions,
background operation or heavy UI load. Smaller per-insert buffers were tried and
[rejected after missed deadlines](evidence/recording-cue-rejected-buffers.json);
there is no faster-buffer selector in the app.

`scripts/test-recording-cue.mjs` also checks real capture/native worklets with
synthetic MediaStreams and an actual AU helper through a Node pipe fixture bridge.
It compares cue gain against an offline render of the same AU, verifies raw input
stays unchanged, injects a transport fault while dry capture continues, and checks
cue controls, one Undo, project reopen and German 390 px layout. That fixture
bridge is separate from production Tauri IPC. No physical microphone or audible
speaker test is performed by these checks.

## Native recording preview (Mac, 0.13.34)

Under **Input → Mode**, choose **Native · Preview**. Select the input device,
mono/stereo channel map and **Monitor output**. This output selection affects the
native recording session without changing the system default. Missing explicitly
selected devices are reported; they do not silently fall back to another device.
Native routes are saved separately from browser IDs; templates retain default input.

Press the usual Record button. Meters remain visible outside this panel. Native
workers own accompaniment, count-in, pre-roll, loop passes and capture timing;
GUI stalls do not supply sample positions. Stop loads the whole completed group
before inserting any takes, with one Undo. Original dry WAVs remain on disk even
if alignment, loading or project-change checks fail. Rate-converted sources retain
original-file provenance. Stop during preparation/count-in cancels without empty
project clips. Closing the settings panel alone does not stop recording.

Native timing correction is in its collapsed **Timing** section. It is independent
of compatible calibration and of cue/plug-in buffering. Positive corrections move
native takes later. Zero is uncalibrated until measured. Actual round-trip latency
and independent-device drift correction are not qualified by software checks.

This preview requires existing microphone authorization; the compatible Connect
button can request access. Routing and insert selection are frozen while recording. In 0.13.35, expand
**Monitor mix** for live listening controls; these do not modify saved cue presets. Interrupted captures retain
verified raw audio, but automatic aligned crash recovery needs a durable output
clock ledger. The existing compatible path remains available while these checks
and physical-device acceptance are completed.

## Live Monitor mix (native preview, 0.13.35)

While recording, open the arrow beside Record and expand **Monitor mix**. Adjust
**Backing** (including count-in/metronome clicks) and **Output** separately. Choose
a monitored track for cue level, balance and mono. An input must have monitoring
enabled before Record; this panel does not open new inputs or restart failed racks.
Cue faults still leave dry recording running; stop/start to prepare a fresh rack.

Type a number or use a fader. Mute keeps the native clocks, cue consumption and
recording running. Faders remain editable while muted; unmute restores that level.
Closing/reopening settings retains the current mix for this recording run. Starting
a new run uses saved presets. These controls do not create project Undo entries,
change arrangement playback/export levels or alter recorded samples/placement.

Native attenuation changes ramp over 64 frames after the callback receives them;
that ramp is not a physical latency promise. Rapid frontend edits are coalesced
and the audio callback reads atomic targets without GUI locks. Actual monitoring
latency, hardware output routing and sustained-load behavior still need N5 checks.

## Recover retained native takes (Mac preview)

Open recording settings and expand **Recovery**. **Find recordings** searches
retained native groups for the current project. Arm their target tracks, then use
**Review** to verify files and prepare all audio. **Import takes** inserts the whole
group with one Undo action. Stop playback before reviewing or importing.

Interrupted takes contain verified aligned prefixes and are labelled incomplete;
the tail can be missing. Fully finished recordings are validated separately. Run
receipts are saved with the project to prevent duplicate insertion; Undo removes
the import and its receipt. Originals stay on disk. For older portable projects
without receipts/source provenance, compare existing takes before importing.

Each search page is bounded; **Next** continues the same project-filtered search.
Review shows block-verification progress. Use Cancel or close settings to stop the
owned job; verification stops between blocks, while an active disk call can finish
first. Refresh the list after recording or archive changes. Converted audio stays
in memory during Review and is persisted only on explicit Import. No usable timing means no automatic aligned recovery.
