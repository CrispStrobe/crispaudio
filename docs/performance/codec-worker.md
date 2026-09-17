# Codec worker verification

Measured in local visible Headless Chrome 153 on macOS, using Vite dev server.
Input: 60 seconds, stereo, 48 kHz, 220/440 Hz sine at 0.5 amplitude; MP3 192 kbps.
Reproduction helper: scripts/benchmark-codecs.mjs. Import it in the browser and call
`benchmarkCodecs(await import('/src/lib/codecs.ts'))`. Input generation and hashing
are outside the timed interval; observer delivery is awaited after encoding.

| Measurement (three runs) | Main thread | Worker |
| --- | --- | --- |
| Encode elapsed ms | 3499 / 3198 / 2868 | 3382 / 2639 / 2754 |
| Maximum heartbeat gap ms | 3499 / 3198 / 2869 | 26 / 17 / 17 |
| Long tasks | 1 / 1 / 1 | 0 / 0 / 0 |

These sequential runs demonstrate responsiveness, not a statistically established
encoding speedup. Output was byte-identical in all six runs: 1,440,576 bytes,
SHA-256 870009ca6cab912094a637d21cda6d95619ea25789a42db241f88c9c8e1b24e4.
The caller's 23,040,000-byte PCM buffer remained attached.
Raw results are codec-baseline.json and codec-worker.json.

Real WASM smoke checks encoded and decoded MP3, AAC and Opus at 48 kHz,
returning finite mono samples; codec delay/padding means lengths differ from
source length. This is not a perceptual quality evaluation.

Production offline check: built with Vite/PWA, loaded preview at port 4173,
waited for precache and reloaded until the service worker controlled the page.
Stopped the preview server and confirmed curl connection failure. With no codec
instance previously created on that page, imported the built codec chunk, encoded
60-second stereo MP3 using encodeAudioBuffer, and decoded using
 decodeCompressedToBuffer. The export matched the same hash; decoded audio was
stereo/48 kHz/60.024 seconds. See codec-offline.json. Both the worker JS and WASM
are now precached (WASM was previously excluded). First installation requires
network access; offline availability starts after successful precache.

Unit tests cover request correlation, reuse, exact-view copying without caller
detachment, codec errors, worker crash/message errors/restart, postMessage failure,
missing Worker, failed WASM-load retry, and allocation cleanup on thrown encoding
or decoding. No automatic main-thread fallback is used when Worker is unavailable.
The worker persists for reuse for the lifetime of the page; it is recreated after
crash. Large buffers still require an owned copy and WASM memory allocation.

Not verified: physical iPhone/WebKit, native Tauri worker loading, user cancellation,
or perceptual audio quality. Native WAV binary IPC is unchanged and out of this pass.
