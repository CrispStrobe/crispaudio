import { fft } from './fft';

/** Hann-window STFT, calibrated to peak sine amplitude (dBFS).
 * Long recordings use uniformly spaced windows, capped at 256 columns.
 * This is a sampled overview, not a continuous analysis of every sample.
 */
export function computeSpectrogram(samples: Float32Array, sampleRate: number) {
  const size = 1024, bins = size / 2 + 1, hop = size / 4;
  const columns = samples.length ? Math.min(256, Math.max(1, Math.ceil(samples.length / hop))) : 0;
  const db = new Float32Array(columns * bins);
  const times = new Float32Array(columns);
  const window = Float32Array.from({ length: size }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / (size - 1)));
  const sum = window.reduce((a, b) => a + b, 0);
  const re = new Float32Array(size), im = new Float32Array(size);
  for (let x = 0; x < columns; x++) {
    const center = columns === 1 ? Math.floor(samples.length / 2) : Math.round(x * (samples.length - 1) / (columns - 1));
    times[x] = center / sampleRate;
    im.fill(0);
    for (let i = 0; i < size; i++) re[i] = (samples[center + i - size / 2] ?? 0) * window[i];
    fft(re, im);
    for (let k = 0; k < bins; k++) {
      const scale = k === 0 || k === size / 2 ? 1 : 2;
      db[x * bins + k] = Math.max(-90, 20 * Math.log10(Math.max(1e-12, scale * Math.hypot(re[k], im[k]) / sum)));
    }
  }
  return { db, times, bins, columns, fftSize: size, sampleRate, duration: samples.length / sampleRate,
    sampled: samples.length / hop > 256 };
}
