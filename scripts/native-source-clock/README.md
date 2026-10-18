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
