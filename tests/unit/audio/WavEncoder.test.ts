// ---------------------------------------------------------------------------
// WavEncoder — detailed WAV encoding tests
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { encodeWav } from '../../../src/audio/utils/audioBufferUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function view(buf: ArrayBuffer): DataView {
  return new DataView(buf);
}

function ascii(dv: DataView, offset: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(dv.getUint8(offset + i));
  return s;
}

// Re-decode a 16-bit WAV data section back into Float32
function decode16(dv: DataView, numSamples: number): Float32Array {
  const out = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    out[i] = dv.getInt16(44 + i * 2, true) / 32767;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Magic bytes and top-level structure
// ---------------------------------------------------------------------------

describe('WAV magic bytes', () => {
  it('starts with RIFF at byte 0', () => {
    const dv = view(encodeWav(new Float32Array(10), 44100, 16));
    expect(ascii(dv, 0, 4)).toBe('RIFF');
  });

  it('has WAVE at byte 8', () => {
    const dv = view(encodeWav(new Float32Array(10), 44100, 16));
    expect(ascii(dv, 8, 4)).toBe('WAVE');
  });

  it('RIFF chunk size = total file size - 8', () => {
    const n = 200;
    const wav = encodeWav(new Float32Array(n), 44100, 16);
    const dv = view(wav);
    expect(dv.getUint32(4, true)).toBe(wav.byteLength - 8);
  });
});

// ---------------------------------------------------------------------------
// fmt chunk
// ---------------------------------------------------------------------------

describe('fmt chunk', () => {
  it('fmt marker at offset 12', () => {
    const dv = view(encodeWav(new Float32Array(10), 44100, 16));
    expect(ascii(dv, 12, 4)).toBe('fmt ');
  });

  it('fmt subchunk size is 16', () => {
    const dv = view(encodeWav(new Float32Array(10), 44100, 16));
    expect(dv.getUint32(16, true)).toBe(16);
  });

  it('audio format = 1 (PCM) for 16-bit', () => {
    const dv = view(encodeWav(new Float32Array(10), 44100, 16));
    expect(dv.getUint16(20, true)).toBe(1);
  });

  it('audio format = 1 (PCM) for 8-bit', () => {
    const dv = view(encodeWav(new Float32Array(10), 44100, 8));
    expect(dv.getUint16(20, true)).toBe(1);
  });

  it('audio format = 1 (PCM) for 24-bit', () => {
    const dv = view(encodeWav(new Float32Array(10), 44100, 24));
    expect(dv.getUint16(20, true)).toBe(1);
  });

  it('num channels = 1', () => {
    const dv = view(encodeWav(new Float32Array(10), 44100, 16));
    expect(dv.getUint16(22, true)).toBe(1);
  });

  it('sample rate field stored correctly', () => {
    const dv = view(encodeWav(new Float32Array(10), 8000, 16));
    expect(dv.getUint32(24, true)).toBe(8000);
  });

  it('byte rate = sampleRate * numChannels * bytesPerSample', () => {
    const sr = 44100;
    const dv = view(encodeWav(new Float32Array(10), sr, 16));
    expect(dv.getUint32(28, true)).toBe(sr * 1 * 2);
  });

  it('block align = numChannels * bytesPerSample', () => {
    const dv = view(encodeWav(new Float32Array(10), 44100, 16));
    expect(dv.getUint16(32, true)).toBe(1 * 2);
  });

  it('bits per sample field = 16', () => {
    const dv = view(encodeWav(new Float32Array(10), 44100, 16));
    expect(dv.getUint16(34, true)).toBe(16);
  });

  it('bits per sample field = 8', () => {
    const dv = view(encodeWav(new Float32Array(10), 44100, 8));
    expect(dv.getUint16(34, true)).toBe(8);
  });

  it('bits per sample field = 24', () => {
    const dv = view(encodeWav(new Float32Array(10), 44100, 24));
    expect(dv.getUint16(34, true)).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// data chunk
// ---------------------------------------------------------------------------

describe('data chunk', () => {
  it('data marker at offset 36', () => {
    const dv = view(encodeWav(new Float32Array(10), 44100, 16));
    expect(ascii(dv, 36, 4)).toBe('data');
  });

  it('data chunk size = numSamples * bytesPerSample (16-bit)', () => {
    const n = 512;
    const dv = view(encodeWav(new Float32Array(n), 44100, 16));
    expect(dv.getUint32(40, true)).toBe(n * 2);
  });

  it('data chunk size = numSamples * bytesPerSample (8-bit)', () => {
    const n = 256;
    const dv = view(encodeWav(new Float32Array(n), 44100, 8));
    expect(dv.getUint32(40, true)).toBe(n * 1);
  });

  it('data chunk size = numSamples * bytesPerSample (24-bit)', () => {
    const n = 128;
    const dv = view(encodeWav(new Float32Array(n), 44100, 24));
    expect(dv.getUint32(40, true)).toBe(n * 3);
  });

  it('data chunk size = numSamples * bytesPerSample (32-bit)', () => {
    const n = 64;
    const dv = view(encodeWav(new Float32Array(n), 44100, 32));
    expect(dv.getUint32(40, true)).toBe(n * 4);
  });
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

describe('round-trip encode → decode', () => {
  it('16-bit: decoded values match originals within ±1/32767', () => {
    const n = 128;
    const original = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      original[i] = Math.sin((2 * Math.PI * i) / n);
    }

    const dv = view(encodeWav(original, 44100, 16));
    const decoded = decode16(dv, n);
    const tolerance = 1 / 32767 + 1e-9;

    for (let i = 0; i < n; i++) {
      expect(Math.abs(decoded[i] - original[i])).toBeLessThan(tolerance);
    }
  });

  it('16-bit: full-scale +1 encodes as 32767', () => {
    const dv = view(encodeWav(new Float32Array([1.0]), 44100, 16));
    expect(dv.getInt16(44, true)).toBe(32767);
  });

  it('16-bit: full-scale -1 encodes as -32767', () => {
    const dv = view(encodeWav(new Float32Array([-1.0]), 44100, 16));
    expect(dv.getInt16(44, true)).toBe(-32767);
  });

  it('16-bit: DC 0 encodes as 0', () => {
    const dv = view(encodeWav(new Float32Array([0.0]), 44100, 16));
    expect(dv.getInt16(44, true)).toBe(0);
  });

  it('8-bit: sample 0.0 encodes as 128 (unsigned mid-point)', () => {
    const dv = view(encodeWav(new Float32Array([0.0]), 44100, 8));
    expect(dv.getUint8(44)).toBe(128);
  });

  it('8-bit: sample +1.0 encodes as 255', () => {
    const dv = view(encodeWav(new Float32Array([1.0]), 44100, 8));
    // (1 + 1) * 127.5 = 255
    expect(dv.getUint8(44)).toBe(255);
  });

  it('8-bit: sample -1.0 encodes as 0', () => {
    const dv = view(encodeWav(new Float32Array([-1.0]), 44100, 8));
    // (-1 + 1) * 127.5 = 0
    expect(dv.getUint8(44)).toBe(0);
  });

  it('out-of-range sample +2.0 is clamped to +1.0 before encoding', () => {
    const dv = view(encodeWav(new Float32Array([2.0]), 44100, 16));
    expect(dv.getInt16(44, true)).toBe(32767);
  });

  it('out-of-range sample -2.0 is clamped to -1.0 before encoding', () => {
    const dv = view(encodeWav(new Float32Array([-2.0]), 44100, 16));
    expect(dv.getInt16(44, true)).toBe(-32767);
  });
});
