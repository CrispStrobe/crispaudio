# Mix comparison and exported-file review

Tools → Mix A/B captures the current mix into A or B. Close the dialog to change
levels, pan, automation, clip fades or effects, master processing, limiter,
routing, sends or ducking, then capture the other slot. Capture is undoable.
Project files preserve both snapshots. Names, colors, folders and ordering stay
with the current arrangement. Moving, trimming, adding or removing clips/tracks
makes snapshots stale: recapture before comparing or applying them.

Prepare the selected range (otherwise up to 20 seconds from the playhead). Both
versions render with their DSP history and start on one audio clock. Switching A/B
changes gains without restarting playback or editing the project. Matching only
attenuates the louder measured version to the quieter version's integrated LUFS.
Silence or an unavailable loudness reading uses unity gain. Measurements always
describe the original rendered versions, before audition matching. Apply restores
one snapshot in one undo; protected track changes fail atomically. Project/source
changes invalidate prepared buffers. Closing, cancelling or starting recording
stops owned auditions. Playback uses the existing selected output device.

Eligible linked Mac projects use the existing native renderer and owned temporary
WAV files. Browser/unlinked comparisons use full DSP history with a 256 MiB prefix
budget. Audition buffers remain in memory. LUFS and true-peak estimates use the
existing application meters; sample peak and RMS describe all decoded samples.
This does not add a certified broadcast meter.

File → Review Export opens a **saved file**, not a fresh render of the timeline.
A finished delivery job also has a review action. Format, duration, channels,
sample rate and WAV bit depth come from that file. Playback and meters use its
decoded audio. Video audio is extracted through the existing media preparation
path; Open file opens the complete movie for visual and sync inspection. Large
files beyond the 256 MiB decoded-audio budget can be opened in the system player.
Review never replaces project clips or sources.

Validation: mix snapshot schema/lock/staleness/JSON round-trip tests; Chrome and
WebKit capture, prepare, A/B, restore/undo and German narrow-layout checks; mocked
Tauri bridge backed by real Apple CLI comparison WAVs and actual saved-WAV review.
Installed Mac menus/build are checked separately; these bridge tests are not a
physical iPad or multi-interface test.
