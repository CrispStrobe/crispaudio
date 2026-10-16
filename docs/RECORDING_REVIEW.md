# Recording and comp review

Press the red Record button beside Play to start capture. Press it again to stop
and save. A missing recording track is created; an eligible unarmed track is
armed automatically. Explicit setup targets and locked tracks remain protected.
Count-in and pre-roll start off. Configured lead-in phases are visible beside
Record. The settings arrow opens Record / takes without requesting input or
starting capture. Close setup before using the transport.

Input levels appear beside Record and in each active input track's header, with
the dialog closed. They measure microphone input before mix gain/effects and do
not enter project history. Red indicates near full scale. Automatically opened
inputs are released after Stop. An explicitly connected preview can stay warm
until Disconnect, a device/setup change, or leaving the timeline.

Choose a track in setup; expand Input setup for device/channel, Connect or monitor.
Expand Recording options for bar-based count-in and pre-roll, the existing silent
start delay, punch/loop or simultaneous armed tracks.
Keep monitoring off with speakers; use headphones for monitored recording. Each
input buffers a short startup reserve before the common playback clock starts, so a
slower worklet startup cannot shift one take relative to the others. That reserve is
retained in the original but excluded from the visible take. Independent physical
input clocks may still drift and require device acceptance checks.

## Count-in and pre-roll

In Recording options choose **Count-in** and **Pre-roll**, each off or one to four
bars. Tempo, meter and click level come from Musical time; projects without these
settings use 120 BPM, 4/4 and the default click level. Count-in plays clicks even
when the normal metronome is off; a click level of zero still mutes them. Existing
project `countIn` seconds remain a separate **Start delay**, never converted to bars.

The sequence is silent delay → count-in → backing pre-roll → take. Playback and
clicks use a scheduled audio-frame anchor, not a UI countdown timer. Count-in
clicks are scheduled ahead and cancel together. Pre-roll plays existing project
audio before the cursor or punch/loop in-point, clamped at project zero. An earlier
cursor still provides the existing punch run-up. Count-in follows the project's
beat phase, including a cursor between bar boundaries; this does not add tempo maps.

Selected count-in/delay/pre-roll is limited to 60 seconds. Simultaneously armed
tracks use the longest setting of each kind on one common clock. Native insert
accompaniment uses its prepared wet buffer and can play an intro before hardware
looping. Count-in and pre-roll run once before loop passes, rather than on each lap.

The input meter remains active throughout. Lead-in input remains available in the
raw recording as source handles, but the published take starts at the recording
point. Saved latency compensation still applies; existing placement without
pre-roll is preserved. Stop before that point creates no take or recording file. Device loss,
project changes and leaving the timeline stop the click, backing and capture.
Digital clicks are monitor-only; they are not routed into capture or exports.
Timing/calibration and lead-in changes preserve an already connected input preview;
changing its device or channel reconnects it.

Changing the project, selected track, device or input channel releases the old
preview connection. Undoing an input change also releases it. A delayed permission
result cannot reconnect an input to a different project.

Expand Takes & comp to review recorded takes. Each take has a Play icon for raw audition. Select a timeline range to audition
only that interval. Raw audition bypasses clip/track/master effects and uses unity
source gain. Comp audition uses the project mix, effects and routing with the
chosen track soloed. Both stop the main transport, preserve project history and
stop when the project changes, main transport starts or the dialog closes.

Select a take interval and choose it. Each comp region has a take selector,
boundaries, crossfade and Remove icon. Removal restores that interval from the
preserved pre-comp arrangement. Reset restores the complete original arrangement;
alternate takes and their recorded files remain available. Undo restores the comp.

Expand Comp versions, enter a short name and save. Click a version name to recall
its choices, then audition the comp. Save another version to compare alternatives.
Recalling a version is one undo; recalling an identical version changes nothing.
Versions are saved in the project, limited to 32 per track, and follow range edits.
Deleting a version leaves the current mix and recorded originals intact.

Software audits use generated MediaStreams with real capture worklets. They do
not validate physical microphone permission, audibility or independent device drift.
The current hardware check is the MacBook built-in microphone; a webcam or interface
can be added later for simultaneous-device checks.

## Reuse input and FX setups

Open **Edit → Track Templates…** (also in the touch Edit ribbon and Track Settings).
Choose mono, stereo or speech low-cut, then **Add track**. To keep your setup,
expand **Save from track**, choose the source track, enter a name and save it.
The library is local to this app/device (up to 64 custom entries).

Templates copy level, pan, waveform mode, input channel/timing/latency, built-in FX
and stored native FX state. Each new track is empty and selected, with fresh FX
instances; Undo removes it in one step. Audio, takes, automation and project routing
are excluded. The default input replaces hardware IDs, and monitoring/arming are
off. Check device, channel and latency before capture. Native templates require the
same plug-ins and use their last saved state, rather than querying a live window.
Portable template files, complete session templates and custom native-window state
capture remain separate work. No new physical microphone check is needed for this
settings-only increment; the existing built-in microphone acceptance still stands.
