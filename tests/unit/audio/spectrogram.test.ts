import { describe, it, expect } from 'vitest';
import { computeSpectrogram } from '../../../src/audio/utils/spectrogram';

describe('calibrated spectrogram', () => {
  it('locates a tone at its true frequency and amplitude', () => {
    const rate = 8192;
    const audio = Float32Array.from({length: rate}, (_, i) => .5 * Math.sin(2 * Math.PI * 1024 * i / rate));
    const s = computeSpectrogram(audio, rate);
    const middle = Math.floor(s.columns / 2);
    const frame = s.db.subarray(middle * s.bins, (middle + 1) * s.bins);
    let peak = 0;
    for (let k = 1; k < frame.length; k++) if (frame[k] > frame[peak]) peak = k;
    expect(peak * rate / s.fftSize).toBe(1024);
    expect(frame[peak]).toBeCloseTo(-6.0206, 2);
  });
  it('shows a frequency change in time rather than volume chunks', () => {
    const rate = 8192;
    const audio = Float32Array.from({length: rate}, (_, i) => Math.sin(2 * Math.PI * (i < rate / 2 ? 512 : 2048) * i / rate));
    const s = computeSpectrogram(audio, rate);
    const at = (x: number, hz: number) => s.db[x * s.bins + hz * s.fftSize / rate];
    expect(at(8, 512)).toBeGreaterThan(at(8, 2048) + 50);
    expect(at(24, 2048)).toBeGreaterThan(at(24, 512) + 50);
  });
  it('keeps silence at the floor and bounds work for long recordings', () => {
    const s = computeSpectrogram(new Float32Array(1_000_000), 44100);
    expect(s.columns).toBe(256);
    expect(s.sampled).toBe(true);
    expect(s.db.every(v => v === -90)).toBe(true);
    expect(s.times[255]).toBeCloseTo(999999 / 44100, 4);
    expect(computeSpectrogram(new Float32Array(), 44100).columns).toBe(0);
  });
});
