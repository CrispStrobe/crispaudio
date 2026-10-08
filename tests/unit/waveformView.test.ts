import { describe, expect, it } from 'vitest';
import { sourceDisplayGain, trackEnvelope, waveformBounds } from '../../src/lib/waveformView';
import type { AudioSource, TimelineTrack } from '../../src/types/audio';

function source(): AudioSource {
  return { id: 's', name: 'quiet', duration: 4, sampleRate: 4, channels: 1,
    peaks: { min: new Float32Array([0, -.04, 0, -.01]), max: new Float32Array([0, .03, 0, .01]) },
    buffer: { getChannelData: () => new Float32Array([0, 0, 0, 0, 0, -.04, .03, 0, 0, 0, 0, 0, .01, 0, 0, 0]) } as unknown as AudioBuffer };
}
describe('waveform inspection', () => {
  it('includes a narrow transient even when many peak bins share one pixel', () => {
    expect(waveformBounds(source(), 0, 4)).toEqual([expect.closeTo(-.04), expect.closeTo(.03)]);
  });
  it('uses actual samples at deep zoom instead of repeating a coarse peak', () => {
    expect(waveformBounds(source(), 1, 1.24)).toEqual([0, 0]);
    expect(waveformBounds(source(), 1.25, 1.49)[0]).toBeCloseTo(-.04);
  });
  it('makes quiet audio visible without modifying audio or peak data', () => {
    const s = source(), before = [...s.peaks.max];
    expect(sourceDisplayGain(s)).toBeCloseTo(22.5);
    expect([...s.peaks.max]).toEqual(before);
    s.peaks = { min: new Float32Array(4), max: new Float32Array(4) };
    expect(sourceDisplayGain(s)).toBe(1);
  });
  it('compares trimmed clips on the project clock, independent of mix gain', () => {
    const track = { id: 't', muted: true, volume: .01, segments: [{ sourceId: 's', startTime: 10, sourceOffset: 1, duration: 2 }] } as TimelineTrack;
    expect([...trackEnvelope(track, new Map([['s', source()]]), 9, 13, 4)]).toEqual([0, 1, 0, 0]);
  });
});
