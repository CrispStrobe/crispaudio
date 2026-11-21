import { describe, expect, it } from 'vitest';
import { TpdfDither, ditherApplies, quantize16, quantize8 } from '../../../src/audio/dsp/dither';
import { encodeAudioBufferToWav } from '../../../src/audio/utils/audioBufferUtils';

// The same constants are asserted by media/src/audio_mix.rs
// (dither_sequence_matches_gui_golden_values / dithered_pcm_matches_gui_worker...).
const GOLDEN_NOISE = [0.33414087048731744, 0.39371380349621177, -0.0475095184519887, 0.4692262208554894];
const FRAMES = [0, 0, -0.5, -0.5, 0.5, 0.5, -2, -2, 2, 2];

const stereo = (interleaved: number[], length = interleaved.length / 2) => {
  const l = new Float32Array(length), r = new Float32Array(length);
  for (let i = 0; i < interleaved.length / 2; i++) { l[i] = interleaved[2 * i]; r[i] = interleaved[2 * i + 1]; }
  return { numberOfChannels: 2, length, sampleRate: 48000, getChannelData: (c: number) => (c ? r : l) } as unknown as AudioBuffer;
};

describe('TPDF dither', () => {
  it('produces the shared native sequence', () => {
    const d = new TpdfDither();
    expect([0, 1, 2, 3].map(() => d.next())).toEqual(GOLDEN_NOISE);
  });

  it('applies only to 8 and 16 bits', () => {
    expect([8, 16, 24, 32].map(ditherApplies)).toEqual([true, true, false, false]);
  });

  it('keeps undithered quantisation identical to the previous encoder', () => {
    for (const v of [-1, -0.5, -1 / 65534, 0, 1 / 65534, 0.5, 1, 2, -2]) {
      const s = Math.max(-1, Math.min(1, v));
      expect(quantize16(v)).toBe(Math.round(s * 32767));
      expect(quantize8(v)).toBe(Math.round((s + 1) * 127.5));
    }
  });

  it('encodes the same interleaved samples as native render_pcm_dithered', () => {
    const view16 = new DataView(encodeAudioBufferToWav(stereo(FRAMES), 16, false, true));
    expect(Array.from({ length: 10 }, (_, i) => view16.getInt16(44 + 2 * i, true)))
      .toEqual([0, 0, -16384, -16383, 16384, 16383, -32767, -32768, 32767, 32766]);
    const view8 = new DataView(encodeAudioBufferToWav(stereo(FRAMES), 8, false, true));
    expect(Array.from({ length: 10 }, (_, i) => view8.getUint8(44 + i) - 128))
      .toEqual([0, 0, -64, -64, 64, 63, -128, -128, 127, 126]);
  });

  it('leaves 24-bit output and the default undithered path unchanged', () => {
    const buffer = stereo(FRAMES);
    expect(new Uint8Array(encodeAudioBufferToWav(buffer, 24, false, true)))
      .toEqual(new Uint8Array(encodeAudioBufferToWav(buffer, 24)));
    const plain = new DataView(encodeAudioBufferToWav(buffer, 16));
    expect(plain.getInt16(44 + 4, true)).toBe(-16383);
  });

  it('decorrelates quantisation error from a low-level tone', () => {
    // A -90 dBFS sine truncates to a few repeating codes without dither; with
    // TPDF the error averages to the signal (mean error near zero, no bias).
    const n = 48000, amp = 10 ** (-90 / 20), d = new TpdfDither();
    let errSum = 0;
    for (let i = 0; i < n; i++) {
      const x = amp * Math.sin((2 * Math.PI * 1000 * i) / 48000);
      errSum += quantize16(x, d) / 32767 - x;
    }
    expect(Math.abs(errSum / n)).toBeLessThan(1 / 32767 / 20);
  });
});
