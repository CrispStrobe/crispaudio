# Native runtime qualification

The debug Mac runtime test exercises actual Wry/WebKit IPC and native window/app
lifecycle using generated PCM. It does not start playback or recording, enumerate
devices, request microphone permission or load the product frontend.

From the repository root on macOS 14+, with working Rust/Xcode and Python tools:

```sh
python3 scripts/test-native-runtime.py
```

The runner explicitly reuses `src-tauri/target`, ignoring unrelated global target
settings. `--target-dir` selects another existing target when needed. It builds
only `crispaudio-runtime-qa` with `native-runtime-qa` and the dedicated config
overlay. Its compile-time frontend directory contains just the two test assets,
so it does not need a production frontend build or a development server. It verifies the actual embedded identity/version and distinct 16-byte
WebKit store identifier. The binary refuses the production identity, production
windows, development server or document associations before constructing an app.

The runner also checks that the executable defines both audio-queue abort guards.
It copies the binary into a fresh temporary `.app` with its own identifier, signs
that owned bundle ad hoc, verifies the signature, runs it with a 90-second deadline
and removes it afterward. It never signs/rebuilds/relaunches the installed app or
the separate manual recording preview. `--check` validates the profile without
building or opening windows. `--no-build` verifies an existing binary's identity/
version but does **not** establish source freshness; use the default for acceptance.

## What it checks

- Two real local WebKit windows invoke the production snapshot commands using
  Tauri's actual JavaScript invoke bridge, including raw `Uint8Array` CPS1 upload with planar channel samples.
- Incomplete sealing, JSON instead of raw PCM and non-finite samples are rejected.
  A valid generated stereo upload seals with the expected retained-byte budget;
  Unicode project metadata and a source entry survive command decoding. A bounded
  no-insert graph render verifies all 2,048 decoded stereo frames exactly against
  `[0.125, -0.25]`; this creates no worker, plug-in, device or output queue.
- Another window cannot write, seal or close the first window's snapshot. It
  creates an unfinished upload of its own, leaving two separate owners live.
- Rust destroys that actual peer window. The shared production `Destroyed`
  handler retires its owner and frees its upload; the main window remains live.
  A late direct admission probe for the retired owner fails.
- Explicit main-owner close returns the registry/budget to zero. A final sealed
  snapshot is deliberately retained before requesting app exit.
- Actual `RunEvent::Exit` calls the same resource-shutdown function as production.
  Afterward the registry has zero entries/bytes and rejects new admission. The
  result is emitted after the event loop returns, not guessed by the web page.

Playback and recording commands are absent from this executable's handler list;
the page verifies their representative command names are unavailable. Strong
`AudioQueueNewOutput`/`AudioQueueNewInput` symbols abort if native queues are ever
created in this process. They exist only in the debug QA executable. There is no
new null setting, test command or queue override in the ordinary app.

## Evidence boundaries and next checks

This is **snapshot-only real-runtime acceptance**. It uses a subset of handlers
and dedicated assets, not the complete product builder, shipped plug-in/capability
registration, React transport or an installed/sandboxed Store application. Ad hoc
signing here does not establish production signing or sandbox behavior. The
explicit WebKit store argument is separate from production and recording-preview
stores; cross-relaunch persistence isolation is not separately measured here.

No audio workers or plug-ins run, so worker joins, native-insert DSP, recording conflicts,
physical routing/clocks/listening/load, device loss and input/output changes are
not qualified by this result. The existing .54 UI/DSP bridge and .56 mock-runtime
IPC tests remain separate evidence. Next connect real command ownership to an
explicit test-only null sink with hardware guards, then qualify the relevant
physical/signed/platform paths. Never use a muted ordinary Wry Live run as a null
sink: it still opens hardware.

Portable runner regression tests (identity/profile/refusal and complete report
validation) are part of the release suite:

```sh
python3 -m unittest discover -s tests/release
```
