# Recording and comp review

Open Record / takes. Choose an audio track, arm it, select an input and connect.
The meter shows the incoming signal. Keep monitoring off when using speakers;
use headphones for monitored recording. Record a short passage, stop and play it.
Changing the project, selected track, device or input channel releases the old
preview connection. Undoing an input change also releases it. A delayed permission
result cannot reconnect an input to a different project.

Each take has a Play icon for raw audition. Select a timeline range to audition
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
