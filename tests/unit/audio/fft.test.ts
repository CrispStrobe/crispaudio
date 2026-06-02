// ---------------------------------------------------------------------------
// FFT unit tests
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { fft, computeSpectrumBars } from '../../../src/audio/utils/fft';

describe('fft', () => {
  it('puts a pure sine wave energy at its frequency bin', () => {
    const n = 1024;
    const k = 16; // cycles across the window → bin 16
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      re[i] = Math.sin((2 * Math.PI * k * i) / n);
    }
    fft(re, im);

    const mag = (i: number) => Math.hypot(re[i], im[i]);
    let peakBin = 0;
    let peak = 0;
    for (let i = 1; i < n / 2; i++) {
      if (mag(i) > peak) {
        peak = mag(i);
        peakBin = i;
      }
    }
    expect(peakBin).toBe(k);
  });

  it('DC (constant) signal concentrates energy in bin 0', () => {
    const n = 256;
    const re = new Float32Array(n).fill(1);
    const im = new Float32Array(n);
    fft(re, im);
    expect(Math.hypot(re[0], im[0])).toBeCloseTo(n, 3);
    expect(Math.hypot(re[1], im[1])).toBeCloseTo(0, 3);
  });
});

describe('computeSpectrumBars', () => {
  it('returns normalised bars in [0, 1] with the requested length', () => {
    const buf = new Float32Array(8192);
    for (let i = 0; i < buf.length; i++) {
      buf[i] = Math.sin((2 * Math.PI * 200 * i) / 44100);
    }
    const bars = computeSpectrumBars(buf, 32);
    expect(bars.length).toBe(32);
    for (const v of bars) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // A tonal signal should produce at least one prominent bar.
    expect(Math.max(...bars)).toBeGreaterThan(0.5);
  });

  it('handles an empty buffer without throwing', () => {
    const bars = computeSpectrumBars(new Float32Array(0), 16);
    expect(bars.length).toBe(16);
    expect(Math.max(...bars)).toBe(0);
  });
});
