# Timeline mixdown responsiveness

Fixture: scripts/benchmark-timeline.mjs, 60 seconds at 48 kHz, four tracks,
12 five-second segments per track, one shared tone source. Measured in visible
Headless Chrome 153 on macOS through Vite. Not a physical iPhone measurement.

Baseline without effects (three runs): synchronous setup 1–5.4 ms, maximum
heartbeat gap 16.8–17.2 ms. OfflineAudioContext already renders asynchronously.
With a separate reverb on every segment (size .5, decay 1.5, mix .3), setup
blocked for 1245–1937 ms and heartbeat gaps were 1245–1938 ms.

Change: yield to the event loop between offline segments once 8 ms of setup
has elapsed. Capture the source registry before yielding so registry edits do
not affect in-progress exports. Do not change real-time playback or DSP.

One isolated after-change reverb run: initial synchronous return 30.1 ms,
maximum heartbeat gap 266.4 ms, total render 38.0 seconds. Baseline total renders
were 28.7–41.3 seconds. This supports a responsiveness improvement, not an
encoding-speed claim or a hard 8 ms latency bound. A full repeated after-change
attempt disconnected from the browser; its results were unavailable and excluded.
Individual segment effects and master-effect setup remain synchronous. Timer
throttling in hidden tabs may lengthen export setup.

A separate real-browser old/new comparison used three one-second segments with
pan, gain, fades and reverb. Reverb Math.random was seeded identically in each
run and restored afterward. Both produced 144000 stereo frames at 48 kHz;
maximum absolute sample difference was 3.725290298461914e-9 (floating-point
rendering noise, not byte equality). Baseline module was temporary and removed.

Raw measured results: timeline-mixdown.json. Unit tests exercise yielding,
source registry stability, exact schedule arguments, and no timers for cheap
setup. Full suite: 1067 tests; lint, typecheck and production build passed.
