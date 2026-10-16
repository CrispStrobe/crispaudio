# Restore a source recording

Select a clip and open **Edit → Source Editor…**, then expand **Restoration**.
Choose a tool and use the wand to prepare a preview. Compare **Original / Preview**
while listening, then **Apply** for one Undo step. The original recording remains
available. Preparing another preview replaces the current draft; apply first to
combine operations. After changing settings, prepare again to hear the new result.

Preparation runs in a cancellable worker. Changing the source, selection, settings,
lock or recording state cancels pending work. Use source windows up to 32 MiB and
eight channels at 8–192 kHz, with at most 30 seconds selected. Split/trim a shorter
clip window first when needed. Saved time, channel count and unselected samples
remain unchanged. Audition level under **Audition** affects both A/B versions,
separately from saved audio. Hot sources/previews lower monitor level for sample-peak
headroom; this is not automatic loudness matching or a true-peak limiter.

## De-hum

Enter the measured mains frequency, usually **50 Hz** or **60 Hz**. **Advanced**
contains harmonic count and notch width. Start with narrow filters and compare;
wanted content at those frequencies is also reduced. Context before/after each
selection reduces filter start-up effects, and 5 ms transitions stay inside the
selected edges. Ranges must be at least 20 ms; total filter context is capped at
120 seconds. Drift, source-window edges and short selections can limit suppression.

The offline filter runs forward/backward using notch coefficients from the
[Audio EQ Cookbook](https://webaudio.github.io/Audio-EQ-Cookbook/audio-eq-cookbook.html).
It does not estimate or track drifting mains automatically.

## Spectral attenuation

Select time ranges in the source waveform. Drag vertically in the spectrogram to
choose a frequency band, or enter its bounds and reduction. The logarithmic
frequency axis expands bass/midrange detail while keeping 0 Hz selectable. Cancelled
mouse/touch gestures restore the previous band; exact numeric bounds remain available.
The graph joins the
selected time portions and shows the first chosen channel; processing respects
your channel choice. The highlighted band affects all selected time portions.

The 2048-point FFT requires at least 2048 samples per range and a band at least one
FFT bin wide (about 23 Hz at 48 kHz). Soft frequency edges and 5 ms time transitions
reduce abrupt boundaries. Nearby frequencies can be affected by the soft edge.
This reduces selected spectral energy; it does not reconstruct missing audio or
provide a painted spectral healing/inpainting brush. Preserve wanted sound by
using modest reduction and reviewing A/B in context.

## Short hard-clipped peaks

Set **Clip level (%)** to the flat-top amplitude: **100%** is full scale (0 dBFS),
**50%** is half amplitude. This is the input clipping level, not an output target.
The tool estimates same-polarity flat runs of at least two samples up to **2 ms**, using two clean neighbours on
both sides. Long, edge or unsuitable runs are skipped; the preview reports counts.
Unclipped samples stay exact. A selection containing no reconstructable peaks
returns a message instead of applying an empty edit.

Reconstructed float peaks may exceed full scale. Monitoring adds headroom while
saved PCM retains that level; manage track/output gain when finishing the mix.
Reconstruction cannot undo heavy distortion, reconstruct a lost transient reliably,
or infer the original waveform uniquely. It is not a general limiter or declipper
for heavily damaged recordings.

## Qualification

Automated fixtures measure wanted-tone retention, mains/harmonic rejection,
spectral-band attenuation, hard-clip error and headroom. Browser checks cover real
workers, cancellation, unchanged channels/ranges, retained originals, float WAV,
linked project reopen, render, parameter metadata and Undo/Redo. These measurements
are specific to synthetic fixtures; varied recordings and physical listening remain
separate acceptance work. Additional nonstationary fixtures cover changing voice-like
envelopes, percussion and pitch sweeps. Run `node scripts/qualify-source-restoration.mjs`
for a repeatable report ([checked results](evidence/source-restoration-material.json)).
At 8–192 kHz, de-hum improves interior reference error by roughly 44 dB. A 24 dB
band reduction improves interior error by about 24 dB on these fixtures; clean-signal
error energy is also checked. These are time-domain reference-error measurements,
not perceptual quality scores. The voice-like signal is synthesis, not speech.

Declipping improves reference error by only about **0.5 dB for percussion** and
**1.1 dB for the noisy voice-like signal**, compared with **27 dB for the sweep**.
Many candidate peaks are deliberately skipped. Check A/B carefully; do not expect
large or audible recovery on arbitrary damaged recordings. No parity with mature
dedicated restoration suites is claimed. See [the gap inventory](DAW_GAP_ANALYSIS.md) for the remaining work.

Integer-PCM full-scale plateaus are accepted within a small ceiling tolerance;
non-flat ordinary peaks and isolated single-sample candidates are skipped.
