# Export pipeline and reverb caching

## Changes

- SFX, Voice, and Timeline exports show rendering/encoding stages and offer cancellation. Percent progress is not exposed by the synchronous codecs and is not fabricated.
- Cancellable codec jobs own exclusive workers. Aborting terminates that worker without stopping unrelated jobs. At most one idle cancellable worker is retained for reuse, in addition to the existing shared worker.
- Mono and multichannel JS WAV encoding run in the worker. Caller channel data is copied before transfer. Existing mono float32 versus multichannel PCM32 behavior is preserved rather than silently changing WAV formats.
- Native mono WAV export uses `export_wav_binary`: an 8-byte little-endian header (sample rate u32, bit depth u16, channels u16), followed by interleaved float32 samples. Rust returns a raw byte response and encodes on a blocking task. The old JSON command remains available for compatibility.
- Each mounted panel retains one successful encoded blob, keyed by immutable source identity and encoding settings. Timeline includes project and source-map identity. Aborted or failed encodes cannot populate the cache or initiate saving.
- Reverb impulses use seeded stereo diffusion and a private LRU cache bounded by eight entries and 16 MiB of retained sample data. Keys include sample rate, sample-rounded duration, and clamped decay. Oversized impulses are not retained. The public impulse generator returns fresh buffers.

## Behavior and limitations

Seeded reverb deliberately changes the previously random diffusion realization. Envelope and wet/dry formulas are unchanged, but this is not byte-identical to previous random renders.

Cancellation discards results and prevents a save from starting. Already-running OfflineAudioContext DSP and native WAV encoding may continue consuming CPU. Once a native save/share dialog has opened, that dialog owns cancellation. Source/project cache keys assume immutable updates.

The generated service-worker registration already waits for `window.load`; it was left unchanged. This is not proof that registration always follows React's first paint, and no additional startup gain is claimed.

## Verification

- Full frontend suite: 1,109 tests across 56 files passed with `NODE_ENV=test npm test -- --maxWorkers=1 --testTimeout=20000`.
- The preceding two-worker run hit five 5-second timeouts, including three existing playback tests; there were no assertion mismatches in that run. Project timeout defaults were not modified.
- ESLint, TypeScript checking, production Vite/PWA build, and `git diff --check` passed.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml`: 16 tests passed using isolated CARGO_HOME/RUSTUP_HOME. Binary payload tests compare against the previous native encoder at 8/16/24/32 bits and reject malformed payloads.
- Controlled worker tests cover transfer ownership, cancellation isolation, restart, and failures. Hook/panel tests cover stage transitions, cancellation, stale completions, unmount, and cache invalidation.
- Production artifact inspection confirms worker JS, Glint WASM, and both locale chunks remain precached. This inspection is not a new offline browser test.

Native Tauri IPC has not been verified end-to-end in a running app. No iPhone was available through devicectl; only a paired iPad was listed. No new iPhone timings, throughput gain, or perceptual equivalence is claimed.
