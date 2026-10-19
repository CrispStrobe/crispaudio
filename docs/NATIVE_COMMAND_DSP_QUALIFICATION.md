# Native command and DSP qualification

This Mac test process invokes the actual generated Tauri command handlers using
MockRuntime windows. Production snapshot ownership, playback reservations, real
native worker/ring/graph, controls and helper shutdown run together. A synthetic
512-frame, 48 kHz consumer replaces the physical queue and clock.

From the repository root, reuse the existing Cargo target:

```sh
python3 scripts/test-native-command-dsp.py
python3 scripts/test-native-command-dsp.py --system-au
```

The default run checks six cases and leaves the trusted-helper case ignored.
`--system-au` explicitly enables Apple's system AUPeakLimiter fixture, including
its real helper processes. It runs all seven cases. No external interface or
third-party plug-in is required. The AU catalog is read to select that exact
Apple component; no output/input device inventory or capture is permitted.

## Safety and scope

The runner builds only a library-test executable with both `native-runtime-qa`
and `native-validation`. It accepts exactly one Cargo test artifact under the
requested target, verifies locally defined abort symbols for input/output queue
creation and both CoreAudio property query functions, then runs only the exact
`commands::native_playback::ipc_tests::dsp::` namespace. It refuses missing guards,
empty/partial suites or an ignored AU test when the helper run was requested.
The helper case additionally requires the runner's explicit environment opt-in.
The test process starts in its own session/group. Timeout, abort or interruption
terminates only that owned group and reaps the process, including helper children
that inherit it; no shared shell or installed-app process group is targeted.

The guards and tests are compiled only with `cfg(test)` and both explicit QA
features. Ordinary app binaries and ordinary library tests have no such guards.
Do not use `--include-ignored` across the entire app suite: it contains unrelated
hardware/helper fixtures. Use this runner's exact filter and explicit helper flag.

The existing output factory remains **MockRuntime only**. This adds no runtime
null switch, production factory field or selectable fake device. A normal Wry
playback command, even in a test build without these guards, still targets real
hardware. The separate real-WebKit executable remains snapshot-only.

## Checked cases

| Case | Verified behavior |
|---|---|
| Finite rendering | Raw planar CPS1 passes real commands into a running worker; track/master gains produce exact expected captured samples; finite end joins and releases ownership. |
| Live controls | Actual gain/pause/resume commands affect the worker; paused synthetic position holds; consumed PCM reaches the new graph gain. Reset/monitor commands use the same managed controls. Monitor gain does not enter raw graph PCM; physical monitor gain is not measured. |
| Recording exclusion | The actual recording-start command with a valid armed plan returns the playback-reservation error before capture. The reverse playback exclusion uses the real recording lease, without starting capture. |
| Blocked consumer | Snapshot close cancels; the playback close reply and output reservation wait until the held consumer and worker return. Final snapshot budget is zero. An already-exited renderer may free its snapshot before the consumer returns. |
| Owner/app retirement | The production cleanup coordinator joins actual workers, revokes admission and frees snapshots. Another owner can still play after one owner retires; global shutdown closes all admission. |
| Ring fault | A production fault hook faults the actual ring; status reports failure, the reservation remains until explicit close and the error-close path releases it. |
| Trusted AU | A real Apple limiter applies initial and changed gain, warm bypass and re-enable through command updates without creating another helper. Normal close reaps it. A second session restores the original project parameters, reaches Playing, then forced helper loss faults and joins cleanly. |

The null consumer observes only a bounded history of block samples. Finite-output
assertions inspect the production captured-sample summary. No test creates a
hardware queue, records sound, asks for microphone permission or changes a device.
Parent-process abort guards do not sandbox arbitrary plug-in children; this is why
the actual-helper case is restricted to the trusted Apple effect.

## Evidence boundaries and next work

This combines **actual command dispatch and real worker/DSP ownership**, with
MockRuntime windows and synthetic output time. Owner/window/app retirement calls
the production coordinator directly; MockRuntime does not deliver native OS events.
The .58 real-Wry snapshot/event test and .54 React/UI-DSP bridge remain separate
runs, not a complete React → WebKit → command → native DSP/device acceptance test.

No physical timing/listening/load, arbitrary plug-in compatibility, saved opaque
plug-in-state recall, native capture or Store/sandbox behavior is qualified here.
Full real-Wry worker/DSP acceptance needs its own explicit guarded setup before
such a claim. Physical N5 stays device/user dependent. Continue independent source
format/range/state parity, native waveform snapshots and original-based recipe
recall under the [ordered roadmap](AUDIO_WORKSTATION_ROADMAP.md).
