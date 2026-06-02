// ---------------------------------------------------------------------------
// audioBufferUtils unit tests
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  encodeWav,
  normalizeBuffer,
  computeWaveformPeaks,
  resampleNearest,
} from '../../../src/audio/utils/audioBufferUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function silence(n: number): Float32Array {
  return new Float32Array(n);
}

function sineWave(n: number, freq = 440, sr = 44100): Float32Array {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    buf[i] = Math.sin((2 * Math.PI * freq * i) / sr);
  }
  return buf;
}

function readAscii(view: DataView, offset: number, length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

// ---------------------------------------------------------------------------
// encodeWav — header integrity
// ---------------------------------------------------------------------------

describe('encodeWav — WAV header', () => {
  it('starts with "RIFF" magic bytes', () => {
    const buf = encodeWav(new Float32Array(100), 44100, 16);
    const view = new DataView(buf);
    expect(readAscii(view, 0, 4)).toBe('RIFF');
  });

  it('has "WAVE" format marker at offset 8', () => {
    const buf = encodeWav(new Float32Array(100), 44100, 16);
    const view = new DataView(buf);
    expect(readAscii(view, 8, 4)).toBe('WAVE');
  });

  it('has "fmt " chunk at offset 12', () => {
    const buf = encodeWav(new Float32Array(100), 44100, 16);
    const view = new DataView(buf);
    expect(readAscii(view, 12, 4)).toBe('fmt ');
  });

  it('fmt subchunk size is 16 (PCM)', () => {
    const buf = encodeWav(new Float32Array(100), 44100, 16);
    const view = new DataView(buf);
    expect(view.getUint32(16, true)).toBe(16);
  });

  it('audio format is 1 (PCM)', () => {
    const buf = encodeWav(new Float32Array(100), 44100, 16);
    const view = new DataView(buf);
    expect(view.getUint16(20, true)).toBe(1);
  });

  it('num channels is 1 (mono)', () => {
    const buf = encodeWav(new Float32Array(100), 44100, 16);
    const view = new DataView(buf);
    expect(view.getUint16(22, true)).toBe(1);
  });

  it('sample rate field matches the supplied rate', () => {
    const buf = encodeWav(new Float32Array(100), 22050, 16);
    const view = new DataView(buf);
    expect(view.getUint32(24, true)).toBe(22050);
  });

  it('has "data" sub-chunk marker at offset 36', () => {
    const buf = encodeWav(new Float32Array(100), 44100, 16);
    const view = new DataView(buf);
    expect(readAscii(view, 36, 4)).toBe('data');
  });
});

// ---------------------------------------------------------------------------
// encodeWav — byte counts
// ---------------------------------------------------------------------------

describe('encodeWav — byte counts', () => {
  it('16-bit: total size is 44 + numSamples * 2', () => {
    const n = 1024;
    const buf = encodeWav(new Float32Array(n), 44100, 16);
    expect(buf.byteLength).toBe(44 + n * 2);
  });

  it('8-bit: total size is 44 + numSamples * 1', () => {
    const n = 512;
    const buf = encodeWav(new Float32Array(n), 44100, 8);
    expect(buf.byteLength).toBe(44 + n * 1);
  });

  it('24-bit: total size is 44 + numSamples * 3', () => {
    const n = 256;
    const buf = encodeWav(new Float32Array(n), 44100, 24);
    expect(buf.byteLength).toBe(44 + n * 3);
  });

  it('32-bit: total size is 44 + numSamples * 4', () => {
    const n = 128;
    const buf = encodeWav(new Float32Array(n), 44100, 32);
    expect(buf.byteLength).toBe(44 + n * 4);
  });

  it('data sub-chunk size field equals numSamples * bytesPerSample', () => {
    const n = 200;
    const buf = encodeWav(new Float32Array(n), 44100, 16);
    const view = new DataView(buf);
    expect(view.getUint32(40, true)).toBe(n * 2);
  });

  it('RIFF chunk size field equals 36 + dataLength', () => {
    const n = 300;
    const buf = encodeWav(new Float32Array(n), 44100, 16);
    const view = new DataView(buf);
    expect(view.getUint32(4, true)).toBe(36 + n * 2);
  });
});

// ---------------------------------------------------------------------------
// encodeWav — round-trip
// ---------------------------------------------------------------------------

describe('encodeWav — round-trip fidelity', () => {
  it('16-bit round-trip matches original within quantisation error (1/32767)', () => {
    const n = 64;
    const original = new Float32Array(n);
    for (let i = 0; i < n; i++) original[i] = Math.sin((2 * Math.PI * i) / n) * 0.8;

    const wav = encodeWav(original, 44100, 16);
    const view = new DataView(wav);
    const tolerance = 1 / 32767 + 1e-6;

    for (let i = 0; i < n; i++) {
      const decoded = view.getInt16(44 + i * 2, true) / 32767;
      expect(Math.abs(decoded - original[i])).toBeLessThan(tolerance);
    }
  });

  it('encodes +1 as 32767 in 16-bit', () => {
    const buf = encodeWav(new Float32Array([1.0]), 44100, 16);
    const view = new DataView(buf);
    expect(view.getInt16(44, true)).toBe(32767);
  });

  it('encodes -1 as -32767 in 16-bit', () => {
    const buf = encodeWav(new Float32Array([-1.0]), 44100, 16);
    const view = new DataView(buf);
    expect(view.getInt16(44, true)).toBe(-32767);
  });

  it('encodes 0 as 128 in 8-bit (unsigned midpoint)', () => {
    const buf = encodeWav(new Float32Array([0.0]), 44100, 8);
    const view = new DataView(buf);
    // 0.0 → (0 + 1) * 127.5 = 127.5 → rounds to 128
    expect(view.getUint8(44)).toBe(128);
  });

  it('clamps out-of-range samples before encoding', () => {
    // A sample of 2.0 should be clamped to 1.0
    const buf = encodeWav(new Float32Array([2.0]), 44100, 16);
    const view = new DataView(buf);
    expect(view.getInt16(44, true)).toBe(32767);
  });
});

// ---------------------------------------------------------------------------
// normalizeBuffer
// ---------------------------------------------------------------------------

describe('normalizeBuffer', () => {
  it('scales the peak to exactly 1.0', () => {
    const buf = new Float32Array([0.1, 0.4, -0.8, 0.3]);
    const result = normalizeBuffer(buf);
    let peak = 0;
    for (const s of result) if (Math.abs(s) > peak) peak = Math.abs(s);
    expect(peak).toBeCloseTo(1.0);
  });

  it('returns the same array object (in-place)', () => {
    const buf = new Float32Array([0.1, 0.5, -0.3]);
    const result = normalizeBuffer(buf);
    expect(result).toBe(buf);
  });

  it('of silence returns silence without dividing by zero', () => {
    const buf = silence(256);
    const result = normalizeBuffer(buf);
    for (const s of result) expect(s).toBe(0);
  });

  it('preserves relative amplitudes between samples', () => {
    const buf = new Float32Array([0.2, 0.4, 0.6]);
    const clone = buf.slice();
    normalizeBuffer(buf);
    const scale = buf[0] / clone[0];
    expect(buf[1] / clone[1]).toBeCloseTo(scale, 5);
    expect(buf[2] / clone[2]).toBeCloseTo(scale, 5);
  });

  it('single +1 sample normalizes to +1', () => {
    const buf = new Float32Array([1.0]);
    normalizeBuffer(buf);
    expect(buf[0]).toBeCloseTo(1.0);
  });
});

// ---------------------------------------------------------------------------
// computeWaveformPeaks
// ---------------------------------------------------------------------------

describe('computeWaveformPeaks', () => {
  it('returns min and max arrays with the requested number of bins', () => {
    const buf = sineWave(44100);
    const { min, max } = computeWaveformPeaks(buf, 100);
    expect(min.length).toBe(100);
    expect(max.length).toBe(100);
  });

  it('min values are <= 0 for a sine wave (it goes negative)', () => {
    const buf = sineWave(44100, 440);
    const { min } = computeWaveformPeaks(buf, 50);
    const someNeg = Array.from(min).some((v) => v < 0);
    expect(someNeg).toBe(true);
  });

  it('max values are >= 0 for a sine wave (it goes positive)', () => {
    const buf = sineWave(44100, 440);
    const { max } = computeWaveformPeaks(buf, 50);
    const somePos = Array.from(max).some((v) => v > 0);
    expect(somePos).toBe(true);
  });

  it('min[i] <= max[i] for every bin', () => {
    const buf = sineWave(1024, 100, 8000);
    const { min, max } = computeWaveformPeaks(buf, 32);
    for (let i = 0; i < 32; i++) {
      expect(min[i]).toBeLessThanOrEqual(max[i]);
    }
  });

  it('silent input gives all-zero min and max', () => {
    const { min, max } = computeWaveformPeaks(silence(1024), 16);
    for (let i = 0; i < 16; i++) {
      expect(min[i]).toBe(0);
      expect(max[i]).toBe(0);
    }
  });

  it('DC signal at +0.5 gives max bins ≈ 0.5', () => {
    const buf = new Float32Array(1024).fill(0.5);
    const { min, max } = computeWaveformPeaks(buf, 8);
    for (let i = 0; i < 8; i++) {
      expect(max[i]).toBeCloseTo(0.5);
      expect(min[i]).toBeCloseTo(0.5);
    }
  });

  it('works with numBins equal to 1', () => {
    const buf = new Float32Array([0.3, -0.5, 0.1]);
    const { min, max } = computeWaveformPeaks(buf, 1);
    expect(min[0]).toBeCloseTo(-0.5);
    expect(max[0]).toBeCloseTo(0.3);
  });
});

// ---------------------------------------------------------------------------
// resampleNearest
// ---------------------------------------------------------------------------

describe('resampleNearest', () => {
  it('returns the same array when rates are equal', () => {
    const buf = sineWave(256);
    const result = resampleNearest(buf, 44100, 44100);
    expect(result).toBe(buf);
  });

  it('halves the length when downsampling 2:1', () => {
    const buf = new Float32Array(1000).fill(1);
    const result = resampleNearest(buf, 44100, 22050);
    expect(result.length).toBe(500);
  });

  it('doubles the length when upsampling 1:2', () => {
    const buf = new Float32Array(500).fill(0.5);
    const result = resampleNearest(buf, 22050, 44100);
    expect(result.length).toBe(1000);
  });
});
