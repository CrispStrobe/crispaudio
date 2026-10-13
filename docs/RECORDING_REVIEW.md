# Recording and comp review

Press the red Record button beside Play to start capture. Press it again to stop
and save. A missing recording track is created; an eligible unarmed track is
armed automatically. Explicit setup targets and locked tracks remain protected.
The default count-in is zero; a configured count-in is honored and visible in the
transport. The settings arrow opens Record / takes without requesting input or
starting capture. Close setup before using the transport.

Input levels appear beside Record and in each active input track's header, with
the dialog closed. They measure microphone input before mix gain/effects and do
not enter project history. Red indicates near full scale. Automatically opened
inputs are released after Stop. An explicitly connected preview can stay warm
until Disconnect, a device/setup change, or leaving the timeline.

Choose a track in setup; expand Input setup for device/channel, Connect or monitor.
Expand Recording options for count-in, punch/loop or simultaneous armed tracks.
Keep monitoring off with speakers; use headphones for monitored recording. Each
input buffers a short pre-roll before the common playback clock starts, so a
slower worklet startup cannot shift one take relative to the others. Pre-roll is
retained in the original but excluded from the visible take. Independent physical
input clocks may still drift and require device acceptance checks.

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
