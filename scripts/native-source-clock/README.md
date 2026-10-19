# Native source worker qualification

This macOS-only test executable compiles the production native playback worker,
ring, PCM consumer, clock-position calculation, graph and AU/VST3 transport. A
null driver models a 512-frame, 48 kHz consumer and two pending buffers. The worker
and plug-in helpers use their production real-time process mode and scheduling.
Generated audio is inspected in memory; no output device is opened.

The driver replaces AudioQueue creation with an abort tripwire and device
inventory with a panic. Normal app builds have no selectable null-output mode.
The actual-helper tests are ignored in ordinary app tests; use this isolated
executable to include them. Running the executable outside the test runner exits
with instructions. Unsupported operating systems reject compilation.

From the repository root, point to a trusted Steinberg fixture folder containing
ADelay (the AU fixtures are Apple's system bandpass and peak limiter):

```sh
CARGO_TARGET_DIR="$PWD/src-tauri/target" \
CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 \
CRISPAUDIO_TEST_PLUGIN_FOLDER="/path/to/trusted/VST3/fixtures" \
cargo test --manifest-path scripts/native-source-clock/Cargo.toml --locked -- \
  --include-ignored --test-threads=1 --nocapture
```

Reuse the existing Cargo target to avoid duplicating build caches. The media
crate builds and embeds the repository's current native helpers. Machine-specific
compiler/toolchain setup belongs in ignored local handover files. Do not rebuild
or overwrite an active app bundle to run these tests.

Checks cover exact latency-aligned first/last samples and a partial final block;
parameter/bypass/level changes on one helper; retained delay history and project
clock wrap across loops; worker pause/control/resume; cancellation, helper loss,
changed latency and silent fault output; pre-cancelled startup; and shared ring/
consumer guards. `SOURCE_NULL_*` lines contain portable result summaries.

The clock and pending buffers are simulated. This does not qualify AudioQueue
creation, timestamps, pause/resume, device selection or hotplug, physical latency,
listening, WebKit/Tauri IPC or sustained load. Source-editor integration remains
separate. Native source audition currently admits 48 kHz input only; per-rate
helper comparisons do not establish matching resampling and Apply semantics.

## Browser-to-Rust null bridge

The ignored `bridge::source_bridge_server` test becomes a JSON-line stdin server
only with `CRISPAUDIO_SOURCE_BRIDGE=1` and an explicit JSON list of trusted fixture
plug-in IDs. The Node fixture supplies these automatically. With no opt-in it
returns immediately, so the normal `--include-ignored` command never waits on stdin.
The regular executable still exits with instructions; no app command, runtime
null setting or listening port is added.

Build the test executable with fault injection enabled, reusing the existing target:

```sh
CARGO_TARGET_DIR="$PWD/src-tauri/target" CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 \
cargo test --manifest-path scripts/native-source-clock/Cargo.toml \
  --features native-validation --locked --no-run
```

Cargo prints the test executable path. Set `CRISPAUDIO_TEST_NULL_BRIDGE` to that
explicit path. The browser check also requires `CRISPAUDIO_PLAYWRIGHT_MODULE`,
`CRISPAUDIO_CHROME_EXECUTABLE`, current repository-built
`CRISPAUDIO_TEST_MEDIA_HELPER` / `CRISPAUDIO_TEST_VST3_HELPER`, and the trusted
`CRISPAUDIO_TEST_PLUGIN_FOLDER` containing `adelay.vst3`. With an isolated Vite
server already running:

```sh
CRISPAUDIO_TEST_URL=http://127.0.0.1:5197 \
node scripts/test-native-source-bridge.mjs
```

The fixture serves a blank page, imports the production `NativeSourceAudition`,
uploads its production CPS1 packets and drives the production Rust snapshot
registry, live controls, worker and helper DSP. Only command dispatch, owner
identity and queue time are simulated. The test wire wraps binary packets in JSON
arrays; this does not change the app's binary upload. Requests/responses are
bounded to 2 MiB, sources to one stereo 48 kHz buffer of at most ten seconds,
and effects to one explicitly trusted master fixture insert. Output must be
muted, device overrides and unsupported commands are rejected, and AudioQueue /
inventory traps remain installed. The driver has no recording implementation.

Checks include live control application, latency-aligned warm bypass/monitor
level, replacement and external ownership handoff, output-change stop, cancellation
with replies held at actual upload/start boundaries, helper failure and finite end.
An active preview is deliberately abandoned at EOF; the driver joins it and
reports zero sessions, snapshots and retained bytes before exit. The Node fixture
has per-command/shutdown deadlines and reaps its owned process group on failure.
Pure Rust checks exercise command admission and malformed/incomplete upload cleanup.

This is real browser-to-Rust child-process IPC with production DSP, **not Tauri
command/window ownership, WebKit, actual Source Editor UI, Core Audio or hardware
qualification**. Reuse it when integrating shared source controls; do not claim
that those UI/platform paths have already passed.

## Actual Source Editor controls

With the same environment and isolated Vite server, run:

```sh
node scripts/test-source-native-ui.mjs
```

This mounts the real React Source Editor, stores and arrangement engine. It uses
OfflineAudioContext substitutes for all Web Audio contexts, rejects microphone
access and forces muted output only on the test wire. Plug-in discovery is limited
to the trusted AU peak limiter and VST3 delay. Generated source/render/apply files
stay inside one temporary directory, removed on exit. Set the optional
`CRISPAUDIO_TEST_SCREENSHOT_PREFIX` to save desktop/narrow screenshots locally.

The checks exercise shared Play/Stop, default Rendered mode, live parameter and
monitor editing, warm bypass without replacing DSP, private output protection,
fresh preparation, exact raw-sample Apply, original retention and one Undo. They
also exercise pending-start replacement, visible helper failure, explicit recovery,
source/range/channel/project/loop/lock/output changes, recording/other-audition
transitions, arrangement owner joining, Reset and close. A cancellable audition
request models an active input; the actual recording component's rejection is
covered separately by frontend unit tests.

This extends qualification to the actual React controls through the null bridge.
Tauri command/window ownership, recording exclusivity in the native registry,
WebKit, real devices/clocks, listening and sustained load remain unqualified.
A 375-pixel desktop Chromium viewport does not qualify iOS.
