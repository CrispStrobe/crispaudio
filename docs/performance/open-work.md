# Open performance work

Status at the last push on `ios-native-features`. These three items are **not done** and are
recorded so they are not mistaken for finished work. Everything else from the optimization
rounds is committed, tested, and pushed.

## 1. Voice preprocessing still blocks the main thread (unmeasured)

`src/audio/engine/VoiceEngine.ts` (`processAudio`) runs three synchronous transforms before the
`OfflineAudioContext` starts:

- `granularPitchShift` — `src/audio/dsp/PitchShifter.ts`
- `formantShift` — `src/audio/dsp/FormantShifter.ts`
- `timeStretch` — `src/audio/dsp/TimeStretcher.ts`

Each is a per-sample loop over the whole buffer. The `async` method wrapper does not make them
non-blocking, so a long clip stalls the UI for the duration of the DSP.

**Why it was not done:** no baseline was ever obtained. A page-level 60 s / 48 kHz run against the
dev server returned no result (`window.voiceBaseline` stayed `null` and the browser session
stopped responding). Rewriting the pipeline without a measurement would repeat exactly the
mistake the earlier rounds avoided — desktop numbers that do not generalize.

**Next steps:**

1. Measure first, using the method in the `crispaudio-performance` skill: heartbeat timer plus a
   **delayed** `PerformanceObserver` (disconnecting right after a synchronous pass misses its long
   task), and record an output sample hash alongside elapsed time.
2. If the block is significant, move the three transforms into a module worker modeled on
   `src/lib/codec.worker.ts` / `src/lib/codecClient.ts`, copying channel data before transfer so
   caller buffers are never detached.
3. Prove equivalence against a baseline harness (seeded input, max sample difference), then
   re-run the full gates.

## 2. Native WAV IPC is not verified end-to-end

`export_wav_binary` (`src-tauri/src/commands/audio_export.rs`) compiles and is covered by unit
tests — 16 Rust tests pass, including byte-comparison against the previous native encoder at
8/16/24/32-bit and rejection of malformed payloads. The JS side
(`src/lib/wavExport.ts`) sends an 8-byte little-endian header (sample rate `u32`, bit depth `u16`,
channels `u16`) followed by interleaved `f32` samples and expects raw byte responses.

What is missing is a run inside an actual Tauri app: no `invoke('export_wav_binary', …)` has been
executed at runtime, so the browser-mock tests and the Rust unit tests have never met.

**Next steps:** `npm run tauri dev`, export a WAV from SFX and Voice, confirm the written file's
format and contents, confirm the JS-encoder fallback still triggers when the command fails, and
leave the iOS share-sheet path (`isIOSApp()` branch in `downloadWavFile`) untouched.

## 3. Real-device (iPhone / WebKit) profiling

`xcrun devicectl list devices` reports only a paired **iPad Air (3rd generation)**. No iPhone is
attached, so the device profiling item was cancelled rather than attempted.

Every optimization on this branch was measured on desktop Chrome and verified with Vitest. WebKit
behavior is unverified for at least: worker + WASM codec execution and its offline precache, the
playhead RAF suspension while a document is hidden, the `OfflineAudioContext` setup yielding in
`TimelineEngine.renderToBuffer`, and the worker-based WAV encoding.

**Next steps:** attach an iPhone with Safari Web Inspector enabled, then repeat the codec
heartbeat / long-task measurement and the timeline mixdown benchmark from
`docs/performance/`.

## Do not re-open without a stable harness

Startup work measured with Lighthouse on this machine was rejected as unreliable: two runs on
**identical** code produced TBT 1,392 ms / score 58 and 215 ms / score 90, the first carrying a
slow-CPU warning. Do not treat startup TBT as an open optimization until the harness produces
repeatable numbers.