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

Saved Mix A/B versions can restore frozen-track volume, pan, mute and solo.
Changes to baked processing, routing or clip gain remain blocked until thaw.
For very short sources, choose a tail so the rendered duration is at least 10 ms;
the dialog reports this before starting an unsupported zero-tail render.

## Checked native inserts

At 48 kHz, generated stereo impulse/tone fixtures using the actual repo-built
helpers produce exact before/after freeze equality for SDK **ADelay**, Apple
**AUBandpass** and **AUPeakLimiter**. Saved-state-only restore, linked/portable
reopen, thaw and post-clip delay tails are checked. The limiter reports 96 samples
of latency; the test verifies compensation preserves impulse position. All 15
helper sessions are closed and reaped after 150 packet exchanges.

The harness uses a Node pipe bridge in place of Tauri IPC and the real production
browser offline graph. It does not qualify native WebKit, signed builds, physical
listening, arbitrary plug-ins, mixed chains, parameter automation or sustained
load. [Native freeze results](evidence/native-track-freeze.json).

A further state-only limiter run uses nondefault attack/release and −3 dB pre-gain.
Reported latency changes from 96 to **192 samples**; the impulse remains at frame
4090 and peak matches the independent −3 dB expectation. Freeze, linked/portable
reopen and thaw again have zero sample difference. Its seven additional helper
sessions close after 54 packet exchanges. See the nondefault run in the evidence.

To reproduce the optional checks, run the development server on port 5197 (or set
`CRISPAUDIO_TEST_URL`), then set `CRISPAUDIO_TEST_MEDIA_HELPER`,
`CRISPAUDIO_TEST_VST3_HELPER`, `CRISPAUDIO_TEST_PLUGIN_FOLDER`,
`CRISPAUDIO_PLAYWRIGHT_MODULE` and `CRISPAUDIO_CHROME_EXECUTABLE` to your local
current helper/fixture/browser installations. Run:

```sh
node scripts/test-native-track-freeze.mjs
CRISPAUDIO_NATIVE_FREEZE_CASE='AU limiter nonzero latency' CRISPAUDIO_NATIVE_FREEZE_NONDEFAULT=1 node scripts/test-native-track-freeze.mjs
```

The second invocation checks nondefault limiter state and changed latency. The
harness is optional and requires macOS Audio Units plus the SDK fixture; it does
not download plug-ins or operate a microphone/speaker device.
