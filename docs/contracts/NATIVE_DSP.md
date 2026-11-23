# Native DSP parity and the mixer — implementation contracts

Binding rules for media/src DSP (effects, delay/chorus, reverb, distortion, compressor), mixer routing, limiter. Read before changing that code.
Moved verbatim from CLAUDE.md on 2026-11-23; version numbers mark when each
contract was introduced. User-facing guides live in the other docs/ files.

## Native effects 0.7.3

Native Effect racks support low/high-pass, bitcrush and ringmod at every level.
RingModulator's intrinsic modulation gain must stay zero; scale the carrier by
mix, because AudioParam inputs add to the intrinsic value. Oscillator phase uses
absolute render-context time even for later clips. BitCrush uses symmetric
quantisation so its even-length interpolated curve maps zero to zero. Native
waveshaping interpolates the same 65536-entry Float32 curve, not a direct step.
The old GUI DC bias and mix bug are intentionally corrected for saved settings.
Delay/chorus were added in 0.7.4; reverb was added in 0.7.5; distortion was added in 0.7.6; compressor was added in 0.7.7.

## Native delay/chorus 0.7.4

Delay's requested time remains independent of WebKit's measured 128-frame
feedback-branch step. Do not replace this with a minimum 128-frame direct delay;
impulse tests and actual WebKit comparisons catch that audible mismatch. Chorus
uses float AudioParam values, two wet delay lines and absolute render-clock LFO
phase. Maintain 64 MiB total delay-buffer / 1024 enabled-effect limits before
allocation. Box the delay variant to keep other Effect values small. The portable
`scripts/test-native-effects.mjs` compares all supported racks with real WebKit,
reads float/extensible WAV directly and keeps fixtures in owned temporary folders.
Use a separate CARGO_TARGET_DIR for its CLI to avoid replacing the Tauri binary.

## Native convolution 0.7.5

media/src/reverb.rs keeps 32 direct IR samples, dyadic FFT bands, and a 4096-frame
uniform frequency-delay line for later tails. Each group's IR begins at its
block size, so block results are ready before their output clock: no added
latency or shifting automation/envelopes. Normalise the seeded stereo IR using
measured WebKit -58 dB calibration, not the rounded 0.00125 spec constant.
Reverb expands mono into stereo, including mix=0; update the track pan law.
Keep the GUI dry blend 1-0.7*mix and 48 kHz float input. Reserve conservative
convolution state before allocation inside the shared 64 MiB DSP-buffer limit;
plan metadata is outside that buffer reservation. Do not silently omit FX on
budget errors. Reverb preparation checks cancellation. RustFFT/dependency MIT
notices are bundled in About; keep them and the manifest synced to Cargo.lock.

Install the optimised standalone CLI for convolution performance measurements;
never use its build directory for the Tauri binary. Debug convolution may render
slower than playback without implying the release CLI has that performance.

## Native oversampling 0.7.6

media/src/distortion.rs adapts WebKit UpSampler/DownSampler filter kernels and
phase conventions under BSD-3-Clause. Keep its copyright header, pinned source
revision and About notice. Two 2x upsamplers, the 256-entry Float32 tanh curve,
and two 2x downsamplers retain a 192-frame wet delay at 48 kHz. Dry stays immediate;
do not shift clips/automation to compensate. Quantise intermediate samples to
float, retain the odd decimation phase and account for fixed filter state before
allocation. Timeline's existing drive/mix controls still select tanh; other curve
algorithms are not configurable timeline effects yet. Compressor was added in 0.7.7.
WebKit tests include unfiltered impulses and 18/19.5 kHz tones to verify aliasing
and timing beyond ordinary low-pass-filtered fixtures.

## Native compressor 0.7.7

media/src/compressor.rs adapts the pinned WebKit DynamicsCompressorKernel under
BSD-3-Clause (Google 2011): retain the full source/About notice. Use Float32
arithmetic, 288-frame predelay, stereo maximum detector, automatic makeup,
32-frame absolute envelope divisions and the adaptive fourth-order release.
Clip racks containing compressors process zeros from the project start without
consuming source data, matching GUI graph timing. Clamp negative clip-envelope
relative time to zero. Compressor mono inputs become stereo before pan.
Reserve fixed state in the common DSP budget before construction. Every current
rack type is supported; unknown types must still fail. Float output can exceed
unity at extreme cascaded makeup settings. Reference tests use absolute error
below full scale and peak-normalised error above it, preserving the PCM unchanged.

## Current mixer/DSP contract (0.8.24)

M2.1 mixer and M2.2 EQ/limiter/GR are implemented. M2.3 gain/pan lanes, their
reviewed copy/retime, and track delay mix/feedback lanes are available. Protected
Read/Touch/Latch/Write passes and delay mix/feedback copy/retime are available; Linear/Step point curves are available; further FX parameters/shapes remain planned. Read PLAN.md's
active section before older implementation notes. Mixer gain/pan,
audition switches, EQ parameters and limiter ceiling/release update the live
graph; delay mix automation uses complementary wet/dry ramps; feedback has
independent 0–0.95 ramps without resetting history. EffectConfig.automation
uses mix/feedback point arrays on absolute seconds, with values 0–1/0–0.95, with static fallback when empty. It follows its insert on rack reorder.
Scope-aware range edits retime clip/track/master FX envelopes; preserve locks and
excluded racks. Delay time and topology changes rebuild the graph.
Route clip gain/FX/fade → track envelope and
gain automation → track FX/level/pan → master FX/gain → optional limiter →
meter → monitor volume. Monitor volume never changes exports.

Project format 3 still reads 1/2. masterVolume defaults to 1; outputLimiter is
optional and disabled for old projects. samplePeakLimiter.ts and media/src/limiter.rs
implement instant attack, stereo linkage and exponential release without added
latency. AudioWorklet code is bundled via worker URL; verify production assets,
not only Vite modules. Offline range export must process from zero then crop.
Native AudioParam equivalents use float32 parameter/input values where needed.
Limiter is sample-peak only: no true-peak/LUFS/lookahead claims.

GainReduction reads engine telemetry on RAF without React/store transport churn.
A strip displays maximum own-insert compressor reduction, not a cascaded sum.
Graph/numeric gestures preserve one undo step; cancellation must preserve redo.
Do not weaken audio checks to conceal backend differences. Existing extreme EQ
end-tail tolerances and parity limits are documented in RELEASE_STATUS.md.

Optional synthetic browser checks: scripts/test-dynamics.mjs,
scripts/test-limiter-production.mjs and scripts/test-native-pcm.mjs. They need
Playwright/browsers and served Vite/dist respectively; no user media is committed.
Use npm run build (tsc -b) for the full frontend check. Local machine setup and
private fixture/recovery paths are in HANDOVER.local.md when present; that file
is deliberately gitignored. Never force-add it or copy secrets into tracked docs.
