// ---------------------------------------------------------------------------
// audioAnalysis unit tests
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  computeRMS,
  computePeak,
  detectClipping,
  computeSpectrum,
  linearToDbfs,
  dbfsToLinear,
} from '../../../src/audio/utils/audioAnalysis';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function silence(n: number): Float32Array {
  return new Float32Array(n);
}

/** Generate a full-scale sine wave with an exact integer number of cycles. */
function sineWave(fftSize: number, binIndex: number): Float32Array {
  const buf = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    buf[i] = Math.sin((2 * Math.PI * binIndex * i) / fftSize);
  }
  return buf;
}

// ---------------------------------------------------------------------------
// computeRMS
// ---------------------------------------------------------------------------

describe('computeRMS', () => {
  it('returns 0 for an empty buffer', () => {
    expect(computeRMS(new Float32Array(0))).toBe(0);
  });

  it('returns 0 for a silent buffer', () => {
    expect(computeRMS(silence(1024))).toBe(0);
  });

  it('returns ~0.707 for a full-scale sine wave', () => {
    // RMS of sin = 1/sqrt(2) ≈ 0.7071
    const buf = sineWave(4096, 8); // 8 cycles, exact bin fit
    expect(computeRMS(buf)).toBeCloseTo(1 / Math.SQRT2, 2);
  });

  it('returns 1.0 for a DC signal of +1', () => {
    const buf = new Float32Array(512).fill(1);
    expect(computeRMS(buf)).toBeCloseTo(1.0);
  });

  it('returns 0.5 for a DC signal of +0.5', () => {
    const buf = new Float32Array(512).fill(0.5);
    expect(computeRMS(buf)).toBeCloseTo(0.5);
  });
});

// ---------------------------------------------------------------------------
// computePeak
// ---------------------------------------------------------------------------

describe('computePeak', () => {
  it('returns 0 for an empty buffer', () => {
    expect(computePeak(new Float32Array(0))).toBe(0);
  });

  it('returns 0 for a silent buffer', () => {
    expect(computePeak(silence(128))).toBe(0);
  });

  it('returns the correct max absolute value for a known signal', () => {
    const buf = new Float32Array([0.1, -0.9, 0.5, 0.8, -0.4]);
    expect(computePeak(buf)).toBeCloseTo(0.9);
  });

  it('handles a buffer with only negative samples', () => {
    const buf = new Float32Array([-0.3, -0.7, -0.2]);
    expect(computePeak(buf)).toBeCloseTo(0.7);
  });

  it('returns 1.0 for a full-scale sine wave', () => {
    const buf = sineWave(4096, 4);
    expect(computePeak(buf)).toBeCloseTo(1.0, 2);
  });
});

// ---------------------------------------------------------------------------
// detectClipping
// ---------------------------------------------------------------------------

describe('detectClipping', () => {
  it('returns false for a silent buffer', () => {
    expect(detectClipping(silence(256))).toBe(false);
  });

  it('returns false for samples well below the default threshold', () => {
    const buf = new Float32Array(256).fill(0.5);
    expect(detectClipping(buf)).toBe(false);
  });

  it('returns true when a sample equals the default threshold (0.999)', () => {
    const buf = new Float32Array(256);
    buf[100] = 0.999;
    expect(detectClipping(buf)).toBe(true);
  });

  it('returns true when a sample exceeds the default threshold', () => {
    const buf = new Float32Array([0.1, 0.2, 1.0, 0.3]);
    expect(detectClipping(buf)).toBe(true);
  });

  it('returns true for a negative sample whose absolute value exceeds threshold', () => {
    const buf = new Float32Array([-1.0]);
    expect(detectClipping(buf)).toBe(true);
  });

  it('respects a custom threshold', () => {
    const buf = new Float32Array([0.5, 0.6, 0.7]);
    expect(detectClipping(buf, 0.65)).toBe(true);
    expect(detectClipping(buf, 0.75)).toBe(false);
  });

  it('returns false for an empty buffer', () => {
    expect(detectClipping(new Float32Array(0))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeSpectrum
// ---------------------------------------------------------------------------

describe('computeSpectrum', () => {
  it('returns a Float32Array of length fftSize/2', () => {
    const buf = sineWave(2048, 10);
    const spec = computeSpectrum(buf, 2048);
    expect(spec.length).toBe(1024);
  });

  it('uses default fftSize of 2048', () => {
    const buf = sineWave(2048, 10);
    const spec = computeSpectrum(buf);
    expect(spec.length).toBe(1024);
  });

  it('works with fftSize 512', () => {
    const buf = sineWave(512, 4);
    const spec = computeSpectrum(buf, 512);
    expect(spec.length).toBe(256);
  });

  it('pure sine at bin k has a peak at bin k', () => {
    const fftSize = 1024;
    const k = 16; // choose a mid-range bin
    const buf = sineWave(fftSize, k);
    const spec = computeSpectrum(buf, fftSize);

    // Find the bin with the maximum magnitude
    let maxIdx = 0;
    let maxVal = -Infinity;
    for (let i = 0; i < spec.length; i++) {
      if (spec[i] > maxVal) {
        maxVal = spec[i];
        maxIdx = i;
      }
    }
    expect(maxIdx).toBe(k);
  });

  it('silent input produces all-zero spectrum', () => {
    const spec = computeSpectrum(silence(2048), 2048);
    for (let i = 0; i < spec.length; i++) {
      expect(spec[i]).toBeCloseTo(0);
    }
  });

  it('zero-pads if input is shorter than fftSize', () => {
    const short = new Float32Array(512); // half of fftSize
    short.fill(0.5);
    // Should not throw
    const spec = computeSpectrum(short, 1024);
    expect(spec.length).toBe(512);
  });

  it('throws RangeError for non-power-of-two fftSize', () => {
    const buf = new Float32Array(100);
    expect(() => computeSpectrum(buf, 100)).toThrow(RangeError);
  });

  it('throws RangeError for fftSize of 0', () => {
    expect(() => computeSpectrum(new Float32Array(0), 0)).toThrow(RangeError);
  });

  it('full-scale sine at exactly one bin has magnitude close to 1.0', () => {
    const fftSize = 2048;
    const k = 32;
    const buf = sineWave(fftSize, k);
    const spec = computeSpectrum(buf, fftSize);
    expect(spec[k]).toBeCloseTo(1.0, 1);
  });
});

// ---------------------------------------------------------------------------
// linearToDbfs / dbfsToLinear
// ---------------------------------------------------------------------------

describe('linearToDbfs', () => {
  it('returns 0 dBFS for linear amplitude 1.0', () => {
    expect(linearToDbfs(1.0)).toBeCloseTo(0);
  });

  it('returns -6 dBFS for roughly half amplitude (0.501)', () => {
    expect(linearToDbfs(0.501)).toBeCloseTo(-6, 0);
  });

  it('returns -Infinity for amplitude 0', () => {
    expect(linearToDbfs(0)).toBe(-Infinity);
  });

  it('returns -Infinity for negative amplitude', () => {
    expect(linearToDbfs(-0.5)).toBe(-Infinity);
  });
});

describe('dbfsToLinear', () => {
  it('returns 1.0 for 0 dBFS', () => {
    expect(dbfsToLinear(0)).toBeCloseTo(1.0);
  });

  it('round-trips with linearToDbfs', () => {
    const original = 0.42;
    const dbfs = linearToDbfs(original);
    const back = dbfsToLinear(dbfs);
    expect(back).toBeCloseTo(original, 5);
  });
});
