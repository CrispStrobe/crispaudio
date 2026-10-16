# Native effects playback on Mac

Add AU or VST3 inserts through the mixer or clip effects. New inserts are enabled.
The selector beside Play offers **Live** and **Preview**. This feature requires the
installed Mac app; browser and iOS sessions can retain the project data.

| Action | Live | Preview |
|---|---|---|
| Play | Prepares sources and plugin history, then processes continuously | Renders and caches the complete wet mix |
| Pause / resume | Retains DSP state and queued audio | Reuses the cached mix |
| Seek | Rebuilds history to the new position | Seeks within the cached mix |
| Loop | Musical time wraps; effect tails continue | Repeats the rendered range |
| Fader, pan, mute/solo, sends, native parameters/bypass | Update the running graph | Stop playback and invalidate the mix |
| Supported track, clip and master FX knobs and automation | Update without resetting effect history or oscillator phase | Stop playback and invalidate the mix |
| Clip edits, routing, insert order or other built-in FX changes | Restart from the current position | Require another render |
| Meters | Track/master peak and RMS, master LUFS/true peak | Master meter |

Controls that update live on tracks, clips and master: wet/dry mix for delay, chorus, reverb, distortion,
ring modulation and bitcrush; delay time/feedback; chorus depth/rate; ring frequency.
Undo and Redo of supported controls also retain the running graph. Reordering
built-in effects rebuilds the graph, including two effects of the same type.
Stable processor identities survive save/reopen; pasting creates fresh processors. Saved automation takes priority over
a base value until the curve is cleared. Other settings, such as reverb decay or
distortion drive, still restart playback.

In Settings, select the playback device. Changing it during Live playback closes
the old output and prepares the current position on the selected device. A missing
device, stalled audio clock, plugin failure or underrun stops playback and reports
an error. Reconnect/select an output and press Play to retry. It never silently
continues through a failed native graph.

Audio runs at 48 kHz. Other source rates are converted from frozen copies before
playback; project and original source buffers retain their rates. Native snapshots
are bounded to 256 MB. Live loops need at least 2,048 frames (about 43 ms); use
Preview for shorter loops. Large projects may require Preview. Starting late in a long
project takes time because plugins must process the earlier history.

Microphone recording with native racks prepares a fixed wet accompaniment before
opening input, then plays it on the same audio clock as capture. Takes and input
monitoring stay dry; track inserts apply when the take is played back. Loop takes
remain aligned across delayed UI frames. The accompaniment cannot be changed
during the take. Preparation is bounded to a 128 MiB stereo buffer and can be
cancelled with Record/Stop before the microphone opens.

Track level, pan and built-in effect wet/dry mix passes work in **Live** on
Mac. Open a track's automation lane, choose Touch, Latch or Write, arm the pass and press Play. Adjust
the recording slider or editable value, then stop, review and Apply. Applying
creates one Undo step; audition does not change the project or saved plug-in state.
Touch release restores Read. Escape, interruption or a playback fault discards
the draft. Delay, chorus, reverb, distortion, ring modulation and bitcrush support
wet/dry passes without resetting delay buffers, reverb tails or oscillator state.
Delay time and feedback, chorus depth and rate, and ring frequency can also be
recorded and restored to Read while processors keep running. Native delays in all three scopes
reserve their full two-second history before playback, within the shared 64 MiB
effect-state budget. Oscillator phase continues through automation edits, Read restoration
and loops; envelope readers follow project time when a loop wraps.
For clip/master passes, open the effect automation inspector and expand Record
pass. Use pass adds the reviewed capture to the inspector draft; Apply publishes
that draft as one Undo step. Clip capture stays within the clip’s timeline extent;
points use absolute project time. Native playback failures discard active or
pending-review captures.

These passes use the native playback clock and control-block updates;
they do not provide sample-accurate timestamped control delivery. Detected seek
or loop discontinuities discard an active pass.

AU/VST3 parameter passes are available from the automation icon beside each
expanded native parameter knob, at clip, track or master scope. Arm Touch, Latch
or Write before playback; stop, review, Use pass and Apply. Clear removes the
curve and restores the static knob. Saved curves also run in Preview and GUI
exports. Native Live samples curves once per worker block (normally 512 frames);
Preview/export bridges sample once per 4096-frame block. Curves use absolute
project time with held ends and Linear/Step segments, compensating upstream
latency. Native history preparation can use larger blocks. These are block updates, not sample-accurate parameter events. Static
Read values and saved plug-in state remain separate from temporary audition.
Native clip curves follow content moves (including slides, grouped moves and
nudges), pasted placement and speed scaling. Trimming, splitting or slipping a
source retains the curve’s timeline clock. When earlier points move before zero,
a boundary point preserves the original value and Linear/Step segment at zero.
Ripple insert/extract retimes curves in the selected clip/track scope and comp
backups; master follows the global-retiming policy. Lift retains curve clocks.
One-sample guards preserve the join values. Locked automation-only tracks remain
protected, and edits exceeding saved-curve limits are rejected atomically.
Mix snapshots retain native curves and refuse changed arrangement geometry.

A changed reported parameter range requires clearing the old curve before a new
pass. At most 32 lanes and 100,000 total points per insert are accepted, with
parameter packet limits checked before processing.

Preview pass capture, microphone capture, continuous native input monitoring,
monitor clicks, custom plug-in windows and
MIDI instruments remain outside this automation mode.

## Try the included session

1. Open **File → Sample sessions**, then **Native plug-ins (Mac)**.
2. Choose **Live** and press Play.
3. Open the mixer, expand AUBandpass in the master rack and change Frequency.
4. Compare Bypass; pause and resume; select the edit range and enable Loop.
5. Choose **Preview** to compare the rendered alternative.
6. Export directly or add WAV, FLAC and AAC jobs to Delivery. Both routes include
   the native effects. Native export stops live playback to release its instances.

The sample uses an Apple effect supplied with macOS and generated original audio.
No third-party plugin installation or external recording is required.

## Selected plug-in folders on Mac

Choose **VST3 folder…** in the plug-in picker to add effects outside the standard
locations. CrispAudio remembers up to eight selected folders using macOS bookmarks
and restores access when it opens again. Native scan, preview and playback helpers
receive their own access to these folders. Plug-in-folder bookmarks request read-only
access and stay in the app's private data, outside saved projects.

Folders selected in earlier versions may need to be selected once again. If a drive
is disconnected or a folder is unavailable, reconnect it and reselect the folder.
Moving a plug-in changes its saved identifier; choose it again in affected racks.
Plug-in-folder access remains separate from media and output-folder access below.

## Files and saved projects on Mac

Native file selections and desktop drops retain media access for reopening and
native processing. Saved project files retain write access. **File → Media Folder
Access…** grants access to a whole recording or output folder; this also groups
its files under one saved bookmark. There are up to 256 media/project/folder records,
separate from the eight plug-in folders. Selecting a containing folder replaces
covered individual records; existing records are never silently evicted at the limit.

Native WAV, FLAC, AAC and video renders use private temporary storage when it
is on the destination volume. The parent publishes the completed file atomically
without overwriting an existing destination; the Save dialog is sufficient. On
another volume (or when its filesystem cannot be identified), staging stays beside
the destination and the app asks for that output folder once before rendering.
Projects saved with audio assets beside them still need folder access. Cancelling
either picker leaves the save/render unstarted. Ordinary media-file bookmarks request read access;
explicitly selected media/output folders and saved project files request write access.
Helpers receive matching resource bookmarks for their request, alongside plug-in folders.

Project drops include `.crispaudio.json` and resolve media paths relative to the
project. Desktop files opened by other apps retain their paths; MP4 video goes to
native preparation without first transferring the whole movie to JavaScript. The
mobile integration continues importing document-picker bytes. Missing or moved
sources still use relinking; moved paths are not rewritten automatically.

## Developer validation

The silent native runner uses a real selected Core Audio device with queue volume
zero. Its captured PCM verifies DSP behavior; this does not establish physical
speaker audibility or qualify every third-party plugin/interface.

```sh
CRISPAUDIO_NATIVE_VALIDATION_NATIVE_LIVE=1 node scripts/test-native-timeline-tauri.mjs
```

For generated-input recording with real native effects and muted output:

```sh
CRISPAUDIO_NATIVE_VALIDATION_RECORDING=1 node scripts/test-native-timeline-tauri.mjs
```

It checks the wet plugin signal, dry original persistence, shared-clock take
placement, one Undo, loop capture across a UI stall, cancellation before input
and stream/helper cleanup. It opens no physical microphone.

For the sustained pause check, run `python3 scripts/test-native-long-pause.py`
after building the helpers. It opens no audio device and verifies both the held
clock and VST3 delay history after 65 seconds idle.

The fixture requires the existing VST3 ADelay test bundle and helper scan binaries
(documented by the runner's `CRISPAUDIO_TEST_*` overrides). It checks loop tails,
seek history, pause retention, live controls, UI stalls, 44.1 kHz conversion,
multi-instance routing, background playback, injected faults, recovery and the
German transport. The callback keeps four fixed PCM slots and two output buffers;
all graph construction, plugin calls, metering and control messages run elsewhere.


Dedicated render, pipe-I/O and plugin threads use Mach real-time deadlines after
preparation. The pipe threads are part of the audio deadline too; ordinary QoS
there can delay the entire graph. See Apple's [Mach scheduling documentation](https://developer.apple.com/library/archive/documentation/Darwin/Conceptual/KernelProgramming/scheduler/scheduler.html).
Pauses have no helper idle timeout; command watchdogs and owner-EOF cleanup remain
active. Audio Unit temporary Objective-C objects are released per packet.

To check a real selected folder outside Downloads and restore it in a second launch:

```sh
# Build the separate native-validation executable first. Requires the ADelay fixture.
python3 scripts/test-macos-folders.py --automate-picker --keep
```

The test temporarily opens its own native folder picker. Omit `--automate-picker`
to select the generated test folder manually; automation needs macOS Accessibility
access. The runner launches via macOS Launch Services and selects only its
prefilled fixture through AX; it never types into the frontmost application. If
Assistive Access is denied, use manual picker mode. It verifies denial before selection/restoration, parent access, external VST3
discovery and streaming, and Swift Audio Unit rendering from generated audio in the
selected folder. It does not play audio or open a physical microphone.

To check selected media/project files and output folders outside Downloads:

```sh
python3 scripts/test-macos-resources.py --automate-picker --keep
```

Five isolated launches select a generated WAV, a format-4 project and its output
folder, then restore them. The probe checks native reads, project writes, read-only
source access after relaunch, rejection of an unselected neighboring file in both
parent and helper, and native encoding into the selected output folder. It does
not perform a physical Finder drag or validate physical iOS hardware.

To check atomic publication with write access restricted to the named output file:

```bash
python3 scripts/test-macos-export-publication.py
```

This noninteractive Seatbelt probe denies sibling scratch files and checks exclusive
publication and scratch cleanup. It does not exercise an actual Save panel grant
or replace the signed-app resource tests above.

## Moved media on Mac

After restarting CrispAudio, a saved bookmark can follow a renamed or moved file
or selected media folder. Project opening, autosave recovery and saved-delivery
decoding apply that location before reading linked audio or video. Recovery sends
only path lists to the native backend; embedded project audio stays in the frontend.
The next saved
project contains the recovered paths; opening does not rewrite the project file.

Only missing paths with a unique, accessible bookmarked identity are recovered.
Existing paths remain unchanged. Folder recovery stays inside the selected folder
and does not follow symlinks outside it. Offline volumes are not mounted during
startup; reconnect and reopen or use the existing relink picker. Moves that macOS
cannot resolve, copies to another volume and ambiguous history still need relinking.

Each resource retains at most 16 previous locations in private bookmark storage.
Old storage records remain readable. Individual move histories remain retained
when their current files are covered by a newly selected folder, so grouping may
retain those records within the existing 256-resource limit.
