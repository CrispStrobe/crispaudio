// ---------------------------------------------------------------------------
// wavExport tests
// ---------------------------------------------------------------------------
// Tests the JS fallback path of exportWav (Tauri invoke is not available in
// the test environment) and verifies WAV header structure for all bit depths.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { exportWav } from '../../../src/lib/wavExport';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read a WAV blob into a DataView for header inspection. */
async function wavHeader(blob: Blob): Promise<DataView> {
  const ab = await blob.arrayBuffer();
  return new DataView(ab);
}

function readString(view: DataView, offset: number, length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += String.fromCharCode(view.getUint8(offset + i));
  }
  return s;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('exportWav — JS fallback', () => {
  const sineBuffer = new Float32Array(
    Array.from({ length: 100 }, (_, i) => Math.sin((2 * Math.PI * i) / 100)),
  );

  // ---- 16-bit ----
  it('16-bit export produces a valid WAV blob', async () => {
    const blob = await exportWav(sineBuffer, 44100, 16);
    expect(blob.type).toBe('audio/wav');

    const view = await wavHeader(blob);
    expect(readString(view, 0, 4)).toBe('RIFF');
    expect(readString(view, 8, 4)).toBe('WAVE');
    expect(view.getUint16(20, true)).toBe(1); // PCM format tag
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(44100); // sample rate
    expect(view.getUint16(34, true)).toBe(16); // bits per sample

    // Total size: 44 header + 100 samples * 2 bytes = 244
    expect(blob.size).toBe(244);
  });

  // ---- 8-bit ----
  it('8-bit export works', async () => {
    const blob = await exportWav(sineBuffer, 44100, 8);
    expect(blob.type).toBe('audio/wav');

    const view = await wavHeader(blob);
    expect(readString(view, 0, 4)).toBe('RIFF');
    expect(readString(view, 8, 4)).toBe('WAVE');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(34, true)).toBe(8);
    expect(blob.size).toBe(44 + 100); // 1 byte per sample
  });

  // ---- 24-bit ----
  it('24-bit export works', async () => {
    const blob = await exportWav(sineBuffer, 44100, 24);
    expect(blob.type).toBe('audio/wav');

    const view = await wavHeader(blob);
    expect(readString(view, 0, 4)).toBe('RIFF');
    expect(readString(view, 8, 4)).toBe('WAVE');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(34, true)).toBe(24);
    expect(blob.size).toBe(44 + 100 * 3); // 3 bytes per sample
  });

  // ---- 32-bit float ----
  it('32-bit float export uses IEEE float format tag (3)', async () => {
    const blob = await exportWav(sineBuffer, 44100, 32);
    expect(blob.type).toBe('audio/wav');

    const view = await wavHeader(blob);
    expect(readString(view, 0, 4)).toBe('RIFF');
    expect(readString(view, 8, 4)).toBe('WAVE');
    expect(view.getUint16(20, true)).toBe(3); // IEEE float
    expect(view.getUint16(34, true)).toBe(32);
    expect(blob.size).toBe(44 + 100 * 4);
  });

  // ---- Empty buffer ----
  it('empty buffer produces a valid but tiny WAV', async () => {
    const blob = await exportWav(new Float32Array(0), 44100, 16);
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44); // header only, no sample data

    const view = await wavHeader(blob);
    expect(readString(view, 0, 4)).toBe('RIFF');
    expect(readString(view, 8, 4)).toBe('WAVE');
    expect(view.getUint32(40, true)).toBe(0); // data chunk size = 0
  });

  // ---- Various sample rates ----
  it('sample rate 44100 is encoded correctly', async () => {
    const blob = await exportWav(sineBuffer, 44100, 16);
    const view = await wavHeader(blob);
    expect(view.getUint32(24, true)).toBe(44100);
  });

  it('sample rate 22050 is encoded correctly', async () => {
    const blob = await exportWav(sineBuffer, 22050, 16);
    const view = await wavHeader(blob);
    expect(view.getUint32(24, true)).toBe(22050);
  });

  // ---- MIME type ----
  it('blob has correct MIME type audio/wav', async () => {
    const blob = await exportWav(sineBuffer, 44100, 16);
    expect(blob.type).toBe('audio/wav');
  });

  // ---- RIFF size field ----
  it('RIFF size field is correct (fileSize - 8)', async () => {
    const blob = await exportWav(sineBuffer, 44100, 16);
    const view = await wavHeader(blob);
    // RIFF size = total file size - 8 (for RIFF + size fields)
    expect(view.getUint32(4, true)).toBe(blob.size - 8);
  });

  // ---- Byte rate ----
  it('byte rate is sampleRate * channels * bytesPerSample', async () => {
    const blob = await exportWav(sineBuffer, 44100, 16);
    const view = await wavHeader(blob);
    // byteRate = 44100 * 1 * 2 = 88200
    expect(view.getUint32(28, true)).toBe(88200);
  });
});
