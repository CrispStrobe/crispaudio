# Freeze a track

Open a track’s right-click or **…** menu and choose **Freeze track**. The same
command is in **Track Settings**. Choose **Tail (s)** for delay/reverb after the last
clip, then Freeze. A snowflake marks the result. To edit the original clips or
effects again, choose **Thaw track**. Freeze and thaw each make one Undo step.

Freeze renders stereo audio from project zero through the last clip plus the chosen
tail. It includes clip gain, clip effects/fades, track fades, gain automation and
saved track effects. The original clips, sources, effects and native plug-in state
remain in the project. Frozen tracks use the render in place of those processors.

Volume, pan, mute and solo remain available in the mixer. Pan automation continues
to play; routing, pre/post-fader sends, buses and master processing remain downstream
and are not baked twice. Thaw keeps later fader/pan/mute/solo changes. Frozen clips,
routing, effects, gain automation and recording stay locked until thaw. The project
sample rate also stays fixed while any track is frozen.

## Limits and storage

- Use an unlocked, unarmed audio track. Buses, ducked tracks and linked/grouped clips
  need further routing/editing support and cannot be frozen yet.
- Choose a tail from **0–30 seconds**. Zero stops at the last clip. Tail detection
  is manual; an insufficient tail truncates the effect. Timing rounds to samples.
- The render spans at most **10 minutes from project zero** and **256 MiB of stereo
  float PCM**, whichever is smaller. Clips far along a long timeline can exceed this
  bound. Streaming freeze remains future work.
- Freeze adds a rendered source in memory and, in the desktop app, a float WAV on
  disk. Thaw retains it for Undo/Redo. Originals remain referenced in linked and
  portable projects. Do not delete these files to reclaim space.
- Cancel, playback/recording starting or project/source changes discard pending
  results. Browser offline DSP may continue until its render completes. A file
  already written is retained for future reference-aware asset cleanup.
- Linked/portable project reopen supports frozen tracks. Saved track packages retain
  originals too, but must be thawed before importing into another project; complete
  identifier/routing remapping of frozen packages is pending.

Native inserts use saved project state through the existing native export path.
Physical plug-in, device and sustained-load qualification remains separate from
built-in-effect software parity checks. Missing/corrupt retained audio blocks reopen
or thaw rather than silently losing the original.

Frozen sessions use **project format 5**. Older app versions must not edit them;
thaw all tracks and save a copy first when sharing with an older version. The
transient linked native-video fast path is skipped for frozen projects; normal
app rendering still applies buses/master processing to the frozen audio. Frozen
projects have not been qualified for editing with the standalone media CLI.

Autosave collects render and retained original source IDs. Recovery cache version 3
preserves the existing stores while preventing older clients from ignoring frozen
metadata. Layout-only restore refuses frozen sessions; linked or cached audio is
required. Shared validation checks render dimensions and original clip coverage
before freeze publication, save, recovery or thaw.

The generated built-in-effects fixture has exact before/after output equality,
including pre-fader sends, buses and master processing. Linked, portable and
IndexedDB recovery reopen also match exactly in that fixture. This is not arbitrary
plug-in or physical listening evidence. [Checked results](evidence/track-freeze.json).

Mix A/B restore currently treats a frozen track as locked; use its live mixer
controls, or thaw before restoring a different saved mix. Very short sources with
zero tail can fall below the offline renderer's 10 ms minimum; add a short tail.
