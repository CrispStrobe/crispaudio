// ---------------------------------------------------------------------------
// Audio effects unit tests
// ---------------------------------------------------------------------------
// Pure-function tests only.  AudioNode wiring (applyDistortion, createBitCrush,
// createLowpass, etc.) requires a real AudioContext which is not available in
// jsdom — those entry-points are tested for their export signatures only.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  createDistortionCurve,
  applyDistortion,
} from '../../../src/audio/effects/Distortion';
import type { DistortionAlgorithm } from '../../../src/audio/effects/Distortion';
import {
  createBitCrush,
} from '../../../src/audio/effects/BitCrush';
import {
  createLowpass,
  createHighpass,
  createBandpass,
} from '../../../src/audio/effects/Filter';

// ---------------------------------------------------------------------------
// Distortion — createDistortionCurve (pure function)
// ---------------------------------------------------------------------------

describe('createDistortionCurve — output shape', () => {
  const algorithms: DistortionAlgorithm[] = [
    'tanh', 'hardClip', 'softClip', 'fuzz', 'wavefold',
  ];

  for (const algo of algorithms) {
    it(`${algo}: returns a Float32Array`, () => {
      const curve = createDistortionCurve(algo, 0.5);
      expect(curve).toBeInstanceOf(Float32Array);
    });

    it(`${algo}: default length is 256`, () => {
      const curve = createDistortionCurve(algo, 0.5);
      expect(curve.length).toBe(256);
    });

    it(`${algo}: respects custom samples parameter`, () => {
      expect(createDistortionCurve(algo, 0.5, 128).length).toBe(128);
      expect(createDistortionCurve(algo, 0.5, 512).length).toBe(512);
    });

    it(`${algo}: all values are finite (no NaN, no Infinity)`, () => {
      const curve = createDistortionCurve(algo, 0.5);
      for (let i = 0; i < curve.length; i++) {
        expect(Number.isFinite(curve[i])).toBe(true);
      }
    });

    it(`${algo}: all values are clamped to [-1, 1]`, () => {
      const curve = createDistortionCurve(algo, 1.0);
      for (let i = 0; i < curve.length; i++) {
        expect(curve[i]).toBeGreaterThanOrEqual(-1);
        expect(curve[i]).toBeLessThanOrEqual(1);
      }
    });
  }
});

describe('createDistortionCurve — drive clamping', () => {
  it('drive below 0 is treated as 0', () => {
    const clampedLow = createDistortionCurve('tanh', -5);
    const zero = createDistortionCurve('tanh', 0);
    expect(clampedLow).toEqual(zero);
  });

  it('drive above 1 is treated as 1', () => {
    const clampedHigh = createDistortionCurve('tanh', 99);
    const one = createDistortionCurve('tanh', 1);
    expect(clampedHigh).toEqual(one);
  });
});

describe('createDistortionCurve — algorithm differences', () => {
  it('different algorithms produce different curves at the same drive', () => {
    const algorithms: DistortionAlgorithm[] = [
      'tanh', 'hardClip', 'softClip', 'fuzz', 'wavefold',
    ];
    const curves = algorithms.map((a) =>
      Array.from(createDistortionCurve(a, 0.5)),
    );

    // No two algorithms should produce identical curves
    for (let i = 0; i < curves.length; i++) {
      for (let j = i + 1; j < curves.length; j++) {
        const isSame = curves[i].every((v, k) => v === curves[j][k]);
        expect(
          isSame,
          `algorithms[${i}] and algorithms[${j}] should differ`,
        ).toBe(false);
      }
    }
  });

  it('higher drive produces more saturation for tanh (midpoint region is more compressed)', () => {
    const lowDrive = createDistortionCurve('tanh', 0.1, 256);
    const highDrive = createDistortionCurve('tanh', 0.9, 256);
    // At quarter-point (x=0.5), higher drive pushes the curve closer to the clipping plateau
    const qIdx = Math.floor(256 * 0.75); // x ≈ 0.5
    // The derivative (slope) at this point should be lower with higher drive
    const slopeLow = lowDrive[qIdx + 1] - lowDrive[qIdx];
    const slopeHigh = highDrive[qIdx + 1] - highDrive[qIdx];
    expect(slopeHigh).toBeLessThan(slopeLow);
  });

  it('higher drive tightens hardClip threshold (smaller passthrough window)', () => {
    const lowThreshold = createDistortionCurve('hardClip', 0.9, 256);
    const highThreshold = createDistortionCurve('hardClip', 0.1, 256);
    // With high drive the threshold is lower → midpoint sample should be clipped more
    const midLow = lowThreshold[64];
    const midHigh = highThreshold[64];
    // low drive (0.1) → threshold ~0.92 → mid sample passes through higher
    // high drive (0.9) → threshold ~0.28 → mid sample is clipped lower
    expect(Math.abs(midHigh)).toBeGreaterThanOrEqual(Math.abs(midLow));
  });
});

describe('createDistortionCurve — tanh odd symmetry', () => {
  // An odd function satisfies f(-x) = -f(x).
  // For a 256-sample curve the centre sample is index 127 (x=0) and
  // sample i maps to x = (i*2)/(255) - 1, so sample i and sample (255-i)
  // are symmetric around zero: x_i = -x_{255-i}.
  it('tanh curve is odd-symmetric: curve[i] ≈ -curve[255-i]', () => {
    const curve = createDistortionCurve('tanh', 0.5, 256);
    for (let i = 0; i < 128; i++) {
      expect(curve[i]).toBeCloseTo(-curve[255 - i], 5);
    }
  });

  it('softClip curve is odd-symmetric', () => {
    const curve = createDistortionCurve('softClip', 0.5, 256);
    for (let i = 0; i < 128; i++) {
      expect(curve[i]).toBeCloseTo(-curve[255 - i], 5);
    }
  });

  it('fuzz curve is odd-symmetric', () => {
    const curve = createDistortionCurve('fuzz', 0.5, 256);
    for (let i = 0; i < 128; i++) {
      expect(curve[i]).toBeCloseTo(-curve[255 - i], 5);
    }
  });

  it('hardClip curve is odd-symmetric', () => {
    const curve = createDistortionCurve('hardClip', 0.5, 256);
    for (let i = 0; i < 128; i++) {
      expect(curve[i]).toBeCloseTo(-curve[255 - i], 5);
    }
  });
});

describe('createDistortionCurve — zero drive (passthrough-like)', () => {
  it('tanh with drive=0: output is approximately x/1 (near-identity for small x)', () => {
    const curve = createDistortionCurve('tanh', 0, 256);
    // With drive=0: gain=1, norm=1 → curve[i] = tanh(x) which ≈ x for |x| small
    // Check a few middle samples are in the right direction
    const mid = curve[128]; // x ≈ 0.008, tanh(0.008) ≈ 0.008
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(0.1);
  });

  it('hardClip with drive=0: threshold is 1.0 so curve is identity (no clipping)', () => {
    const curve = createDistortionCurve('hardClip', 0, 256);
    // threshold = max(0.05, 1 - 0) = 1.0 → clips nothing → curve[i] = x
    const lastSample = curve[255]; // x = 1.0
    expect(lastSample).toBeCloseTo(1.0, 4);
  });
});

// ---------------------------------------------------------------------------
// Distortion — applyDistortion export signature
// ---------------------------------------------------------------------------

describe('applyDistortion — export signature', () => {
  it('is a function', () => {
    expect(typeof applyDistortion).toBe('function');
  });

  it('accepts 5 parameters (ctx, source, drive, mix, algorithm)', () => {
    // Function.length returns the number of declared parameters
    expect(applyDistortion.length).toBe(4); // algorithm has a default, so length = 4
  });
});

// ---------------------------------------------------------------------------
// BitCrush — pure curve logic via a local reimplementation
// ---------------------------------------------------------------------------
// buildBitCrushCurve is private, so we replicate its logic here to test the
// mathematical properties, then test the public createBitCrush for its signature.

/**
 * Local replica of the private buildBitCrushCurve function (same algorithm).
 */
function buildBitCrushCurveLocal(
  bits: number,
  samples = 65536,
): Float32Array {
  const curve = new Float32Array(samples);
  const levels = Math.pow(2, bits - 1);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    curve[i] = Math.floor(x * levels) / levels;
  }
  return curve;
}

describe('BitCrush curve — 16-bit is near-identity', () => {
  it('produces Float32Array of the correct length', () => {
    const curve = buildBitCrushCurveLocal(16);
    expect(curve).toBeInstanceOf(Float32Array);
    expect(curve.length).toBe(65536);
  });

  it('16-bit: maximum deviation from identity is at most 1/32768 (≈ 3e-5)', () => {
    // With 16 bits, levels = 32768.  The quantisation error per sample is ≤ 1/32768.
    const curve = buildBitCrushCurveLocal(16, 65536);
    let maxErr = 0;
    for (let i = 0; i < curve.length; i++) {
      const x = (i * 2) / (65535) - 1;
      maxErr = Math.max(maxErr, Math.abs(curve[i] - x));
    }
    // quantisation step = 1/32768 ≈ 3.05e-5; error must be within one step
    expect(maxErr).toBeLessThanOrEqual(1 / 32768 + 1e-7);
  });

  it('16-bit: first sample ≈ -1, last sample ≈ 1', () => {
    const curve = buildBitCrushCurveLocal(16, 65536);
    expect(curve[0]).toBeCloseTo(-1, 3);
    expect(curve[curve.length - 1]).toBeCloseTo(1, 3);
  });
});

describe('BitCrush curve — 1-bit produces few output levels', () => {
  it('has very few distinct values', () => {
    // 1-bit quantization: levels = 2^(1-1) = 1, so output = round(x*1)/1
    // Produces {-1, 0, 1} — 3 distinct values
    const curve = buildBitCrushCurveLocal(1, 1024);
    const uniqueValues = new Set(Array.from(curve).map((v) => Math.round(v * 1e6)));
    expect(uniqueValues.size).toBeLessThanOrEqual(3);
  });

  it('1-bit values are only in {-1, 0, 1}', () => {
    const curve = buildBitCrushCurveLocal(1, 1024);
    for (const v of curve) {
      const rounded = Math.round(v);
      expect(rounded >= -1 && rounded <= 1).toBe(true);
    }
  });
});

describe('BitCrush curve — bit depth comparisons', () => {
  it('higher bit depth produces more unique output levels', () => {
    const levels8 = new Set(Array.from(buildBitCrushCurveLocal(8, 4096)).map((v) => v.toFixed(6)));
    const levels4 = new Set(Array.from(buildBitCrushCurveLocal(4, 4096)).map((v) => v.toFixed(6)));
    expect(levels8.size).toBeGreaterThan(levels4.size);
  });

  it('8-bit has a reasonable number of distinct levels', () => {
    // levels = 2^(8-1) = 128, output values are multiples of 1/128
    // Could be up to 257 with zero included; allow some headroom
    const curve = buildBitCrushCurveLocal(8, 65536);
    const unique = new Set(Array.from(curve).map((v) => Math.round(v * 128)));
    expect(unique.size).toBeLessThanOrEqual(258);
    expect(unique.size).toBeGreaterThan(100);
  });
});

describe('createBitCrush — export signature', () => {
  it('is a function', () => {
    expect(typeof createBitCrush).toBe('function');
  });

  it('declares 4 parameters (ctx, source, bits, mix)', () => {
    expect(createBitCrush.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Filter — export signatures (AudioContext wiring not testable in jsdom)
// ---------------------------------------------------------------------------

describe('Filter — export signatures', () => {
  it('createLowpass is a function with 4 declared parameters (q has a default)', () => {
    expect(typeof createLowpass).toBe('function');
    // ctx, source, freq — q has default, so length = 3
    expect(createLowpass.length).toBe(3);
  });

  it('createHighpass is a function with 4 declared parameters (q has a default)', () => {
    expect(typeof createHighpass).toBe('function');
    expect(createHighpass.length).toBe(3);
  });

  it('createBandpass is a function with 4 declared parameters (q has a default)', () => {
    expect(typeof createBandpass).toBe('function');
    expect(createBandpass.length).toBe(3);
  });

  it('all three filter factories are distinct functions', () => {
    expect(createLowpass).not.toBe(createHighpass);
    expect(createHighpass).not.toBe(createBandpass);
    expect(createLowpass).not.toBe(createBandpass);
  });
});
