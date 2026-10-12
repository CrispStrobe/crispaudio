# MIDI notes and basic instruments — 0.9.3

Open **Timeline → MIDI / Piano roll**. Choose an existing audio track or **New audio
track**, the insert time and pattern length. Click in the roll to add notes; drag
notes to move them, or use focused-note arrows/Delete. The inspector sets pitch,
start, length and velocity. **Quantize starts** uses the selected seconds/note grid
and preserves note durations except at the pattern boundary. Choose Sine or Soft
bell, and use the audition keyboard to hear the instrument through the selected
playback output.

**Apply to timeline** renders the pattern to a mono audio source and retains the
editable notes on the clip. The clip works with ordinary track gain/pan, effects,
automation, buses, sends, delivery jobs and native exports. New audio track creation
and clip placement are one undo step. Application requires stopped transport and
an unlocked audio destination; a changed project/source snapshot rejects publication.
Desktop/mobile app audio sources are durably stored before committing. Browser
projects embed the rendered PCM when saved. Original source revisions remain
available through undo and are never overwritten.

Select a MIDI clip and reopen the panel to edit its original note source. Notes
use source seconds; moving, trimming, splitting, copying and range edits keep the
normal audio source-offset mapping. Editing one copy creates a new source for that
copy. Other copies retain their previous notes and sound. Editing keeps the visible
trimmed window; extending notes does not automatically extend that clip, and a
pattern too short for the current window is rejected. Linked/retimed clips need to
be detached/restored before note replacement. Tempo changes affect the grid and
MIDI file conversion, not already captured source seconds or rendered media.

For a controller, press **Find inputs**, select an input, then **Connect input**.
The Mac app uses native CoreMIDI through midir; MIDI-capable browsers request
input-only Web MIDI access without SysEx. **Record notes** captures immediately
into the local pattern draft using the audio clock at event receipt, including
channel, velocity and sustain. It stops at the pattern length; **Finish capture**
ends it earlier. Existing notes remain in the draft. **Stop all notes** cancels
monitor voices and finishes capture. Closing the panel discards unapplied edits
and disconnects input; changing project or applying into a locked track is guarded.
Window blur finishes capture and silences audition until focus returns. Device
removal ends capture; native device discovery polls every two seconds. No MIDI
output, device programming or SysEx is exposed.

**Export pattern MIDI** writes a standard type-0 `.mid` file with PPQ480, the current
quarter-note tempo/time signature, channel notes and baked sustain durations.
Export includes the full source pattern, not just a trimmed clip window. The file
contains notes, not the rendered instrument sound; choose an instrument when
opening it in another sequencer. There is no MIDI file import in this increment.

Limits: one connected input; patterns up to 120 seconds, 2,048 notes and 600 total
voice seconds; source sample rates 8–192 kHz, with pitches above Nyquist rejected.
Rendered polyphony is peak-normalised if necessary. Live audition has eight voices
(oldest voice stolen) and a lower monitor level to keep chord peaks bounded. Input
arrival timing is not calibrated sample-accurate MIDI recording; no transport-synced
MIDI overdubbing, punch/count-in or hardware-output clock is added. Instrument
tracks with live sequencing, richer instruments, arrangement MIDI export/import,
CC/pitch-bend automation, plugin hosting and sample-accurate musical loops remain
subsequent M10 work. M9 paging/codec expansion stays deferred.

Validation includes real native CoreMIDI virtual-source discovery/note/sustain
receipt and disconnect, channel/sustain recording and source PCM arithmetic, MIDI
format reading with Mido 1.3.3, and Chrome/WebKit piano-roll editing, one undo,
save/reopen, split-window editing, draft cancellation, input-session handling,
Web MIDI disconnect cleanup, bounded audition PCM and immediate stop, native/offline
render comparison and German 390px layout. These are virtual-device/headless
checks, not physical controller or mobile acceptance.

Implementation reference: [midir input API](https://docs.rs/midir/0.11.1/midir/struct.MidiInput.html).
The MIT notices for midir/coremidi/coremidi-sys are included in About → Licenses.
