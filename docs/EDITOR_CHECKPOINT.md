# Mixing, picture, recording and interview tools — local 0.9.0

This desktop checkpoint completes the selected M2.3–M7 workflows. The twelve
track automation targets are gain, pan, delay mix/feedback/time, ring-modulator,
bit-crusher, distortion, chorus and reverb mix, plus chorus depth/rate. They share
point/curve editing, saved handles, protected Read/Touch/Latch/Write passes,
independent copy/retime and native rendering. Arbitrary insert parameters and
new clip/master lane inspectors are broader automation work beyond this selection.

## Mix and finish

Open the mixer to add a bus or route an audio track. Output/sends must target buses
or master; feedback cycles and ducking dependency cycles are rejected before edits.
Pre-fader sends follow inserts before the fader; post-fader sends follow pan/fader.
Muted tracks do not feed sends. Solo includes the required bus path; a soloed bus
includes its upstream sources. Bus removal returns affected outputs to master and
cleans references. Bus lanes hold inserts/automation, not audio clips.

Ducking uses the routed source signal with threshold, ratio, attack and release.
The live graph and native/offline mixer use the same graph order. Limiting follows
master gain. Master loudness shows integrated/momentary/short-term values and a
4× true-peak estimate. Finishing measures the whole rendered mix at 48 kHz, reviews
the actual post-limiter result and verifies the ceiling before one-undo application.
Silence or less than 400 ms cannot produce integrated programme loudness. This is
an editing meter, not an independently certified broadcast measurement instrument.

## Picture, graphics and captions

Picture layers are ordered from top to bottom, with visibility, lock and ripple
participation. Clips can overlap on different layers; transitions are validated
within each layer. Position, scale, rotation, crop, opacity and keyframes apply on
the composition clock. Preview supports direct move/scale handles and numeric
transforms. Left trims/splits keep animation time. Source preview has separate
In/Out points and insert/overwrite/append placement; those actions place picture,
while camera-with-audio import retains its linked sound.

Graphics controls add titles/lower thirds, imported stills and project-saved title
presets. Text supports Unicode, wrapping, alignment, fonts, backgrounds, placement
and opacity/position keyframes. Separate caption cues support correction, import,
SRT/VTT sidecars and optional burn-in. Source transcription is a separate artifact.
Safe-area guides affect preview only. Layered/graphic MP4/MOV exports use Apple
frameworks on macOS. Optional FFmpeg composition export fails explicitly instead
of silently ignoring layers/graphics. Advanced transition previews retain their
existing approximations; nearest-frame retiming adds no optical flow.

## Record and comp

Open **Record / takes** (macOS Playback menu, Cmd–Shift–R) and choose a track, input
and mono left/right or stereo channel layout. Arm the track, then explicitly
connect input or record. Opening the panel alone does not request microphone
access. Monitoring is explicit and off by default; only input enters the capture
worklet. The microphone permission description is included in the Mac bundle.

Recording follows the actual audio graph clock with a seconds count-in. Punch and
loop use the edit range. Continuous loop capture stores separate passes; the last
complete pass becomes the initial comp. Raw input WAVs remain durable, including
when the project needs a different sample rate. Undo removes placement, preserving
source files and recoverable takes. Capture reports missing frames, device changes
and stop interruptions; bounds limit capture memory and loop pass count.

Calibration plays a short quiet chirp into the selected output and measures its
return through the selected input. This needs a real acoustic/loopback path.
Absent or ambiguous responses never apply a guessed latency. Review/apply the
measured correction, or enter an independently measured value. Changing the
input/channel disconnects monitoring and requires reconnecting.

Take lanes select time ranges, choose a pass and edit comp boundaries/crossfades.
Comps rebuild from the preserved base arrangement so editing a fade cannot stack
old tails. Use a separate recording track or resolve overlapping base clips;
unlink camera sound before replacing it with a comp. Range edits move take/comp
placements while retaining each original capture extent. Removed placements can
restore the original pass at the playhead. One input is supported per recording
session. Physical microphone/device latency and mobile interruption/background
behaviour remain device acceptance work; browser synthetic-input checks do not
establish those hardware results.

## Timing, multicam and source speech

**Speed / pitch** prepares derived media for the selected clip and linked AV pair,
then reviews one atomic edit. Rate is 0.25–4 and pitch is ±24 semitones. Speed can
change pitch with rate, or WSOLA can preserve it; explicit transposition keeps the
chosen duration. WSOLA is tuned for voiceovers: large changes/transients can sound
rough and should be auditioned. Video duplicates/drops nearest source frames at
the project frame rate. Originals, processing settings, fades and animation clocks
remain recoverable. Reapply after a trim uses the retained original interval;
**Review original timing** restores that interval. Retiming holds the clip start;
resolve picture overlaps first. Detach multicam cuts before retiming them.

Multicam starts from 2–9 camera clips already placed on separate picture layers.
Review synchronization with the existing sync tools, then confirm the placement.
The shared coverage becomes a scene; outside coverage stays in place. Click an
angle or press 1–9 while the panel is open to switch at the playhead. Later cuts
remain intact, and independently mixed microphones continue without restarting.
Saved angle source clocks survive splits/extracts; detaching keeps the chosen cuts.

**Source transcript** imports timed JSON/SRT/VTT or invokes the existing external
CrispASR contract using the full original source at offset zero. Configure the
executable/model/aligner in Spoken editing. SRT/VTT do not invent word timestamps.
Correct source words and speaker labels, then search/select mapped timeline words.
Repeated clips have distinct occurrences; trims/rate/reverse map source timing.
Lift/extract proposals list the precise frame-covered ranges across picture,
sound, graphics, captions, markers and sections. Locks, partially trimmed words
and unselected words cut by frame rounding block application. Apply only after
review; original source transcripts remain unchanged. Timeline captions remain
separately editable. Named sections can be created from the edit range and follow
range edits.

## CLI and platform boundary

`retime-media --input ORIGINAL --output DERIVED --settings settings.json` accepts
`offset`, `duration`, `rate`, `reverse`, `preservePitch`, `semitones`, `video` and
`frameRate`. Derived outputs never replace originals or clobber existing files.
`edit-project` supports a `retime` recipe with `ids`, a derived-media `directory`
and those settings; `restore: true` returns the selected retained original range.
Ordinary linked-project rendering uses the saved derived PCM/picture. Existing
range recipes retain recording/multicam/animation clocks and source metadata.

The local Mac build is ad-hoc signed, not an Apple distribution. No release tag or
Apple upload belongs to this checkpoint. Browser/390px touch checks cover responsive
controls and history; they are not physical iOS/Android acceptance. Existing DSP
precision/abrupt chorus-tail limits remain documented in the release status.


### Coordinated armed-track recording (0.9.7)

Open Record / Takes. Select each audio track in turn and configure its input,
channel, latency and arming. Enable All armed tracks to record one to eight
armed audio tracks; the selected-track mode remains the default. Locked armed
tracks reject the session rather than disappearing from the group.

All streams connect and become ready before the longest configured count-in.
They use the same AudioContext capture and stop frame, with per-track latency
compensation and common punch/loop pass anchors. Each track retains its own
original source and takes. Successful captures publish together as one undo;
a failed connection/persistence/comp or changed project publishes none of the
group. Already saved originals remain durable and their paths appear on errors.

The group shares a 240 MiB incoming PCM budget. Monitoring follows each track's
setting and ends after capture; disconnecting one input does not reset the audio
session while another still owns it. Different physical devices may have drift
and different hardware latency. Chrome/WebKit generated-stream checks validate
the workflow, not physical multi-device synchronization or mobile capture.
