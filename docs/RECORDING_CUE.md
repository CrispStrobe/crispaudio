# Recording cue mix

Open the arrow beside Record, expand **Input**, then **Cue mix**. Connect the input
and enable **Monitor microphone**. The input meter shows the raw signal. Cue level
starts at **−12 dB**; type a value or drag the fader. Pan and Mono affect only the
cue. Recorded takes remain dry and keep their original placement.

The cue uses the selected playback output and monitor volume, independently of the
track fader, track pan, arrangement routing and master FX. There is no separate
headphone output or independently balanced backing mix yet. Use headphones when
monitoring a microphone to avoid acoustic feedback. **Disconnect input** releases
the microphone; disabling monitoring releases just the cue and its plug-in streams.

## Native cue inserts on Mac

Add AU/VST3 inserts in Track Settings, then enable **Native track inserts
(buffered)** in Cue mix and reconnect input. Enable monitoring to listen. Up to two
enabled native inserts per input, eight across the recording group, use their
saved static settings and order. Disabled inserts are omitted; bypass keeps the
same delay. Built-in effects and saved automation curves are not part of this cue
path. Edit native inserts while stopped; rack changes invalidate the warm input.

The whole input rack shares **4096 samples of bridge buffering**, plus the sum of
reported plug-in latencies: at 48 kHz, **85.3 ms for either one or two inserts**.
Version 0.13.33 removes the second bridge buffer that previously made a two-insert
cue add 170.7 ms before plug-in latency. The displayed FX delay
excludes device/input/output latency. This buffered path is unsuitable for tight
real-time performance. A [Rust input/worker foundation](NATIVE_INPUT.md) is under
development; hardware capture and output integration remain pending. A plug-in
fault or missed deadline mutes the cue and closes its streams; raw recording
continues through the independent capture worklet. Re-enable monitoring to retry.

Recording prepares native accompaniment first, releases warm cue streams before
that render, then starts separate cue sessions. Takes remain dry; their normal
track inserts apply during later arrangement playback. Wet capture with retained
dry originals is separate work.

Cue controls are stored per track in projects and local templates. Templates use
the default input, monitoring off and recording unarmed. Cue slider gestures create
one Undo step. Undo can mute a cue or invalidate input ownership; it never opens a
microphone or automatically enables monitoring.

## Measured scope

[Mac native checks](evidence/recording-cue-shared-buffer.json) use actual Tauri IPC,
WebKit AudioWorklets and the bundled Apple AU helper, with generated input and a
silent output sink. One/two AUBandpass and SDK ADelay VST3 chains at 48 kHz pass eight-second captures
with the expected response and empty native registry after close. Bypassed AU
impulse checks measure exactly 4096 samples of bridge delay for both rack sizes.
This does not qualify physical microphones, commercial inserts, long sessions,
background operation or heavy UI load. Smaller per-insert buffers were tried and
[rejected after missed deadlines](evidence/recording-cue-rejected-buffers.json);
there is no faster-buffer selector in the app.

`scripts/test-recording-cue.mjs` also checks real capture/native worklets with
synthetic MediaStreams and an actual AU helper through a Node pipe fixture bridge.
It compares cue gain against an offline render of the same AU, verifies raw input
stays unchanged, injects a transport fault while dry capture continues, and checks
cue controls, one Undo, project reopen and German 390 px layout. That fixture
bridge is separate from production Tauri IPC. No physical microphone or audible
speaker test is performed by these checks.
