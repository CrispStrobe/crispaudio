import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineCanvas } from '../../../src/components/timeline/TimelineCanvas';
import { useProjectStore } from '../../../src/stores/projectStore';
import type { AudioSegment, AudioSource } from '../../../src/types/audio';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../src/lib/native', () => ({ haptic: vi.fn() }));

type Point = [number, number];
let frames: Map<number, FrameRequestCallback>;
let waveforms: Point[][];
let outlines: Point[][];

function frame() {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(16));
  });
}

beforeEach(() => {
  frames = new Map();
  waveforms = [];
  outlines = [];
  let nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  let path: Point[] = [];
  const context = {
    fillStyle: '', strokeStyle: '',
    beginPath: () => { path = []; },
    moveTo: (x: number, y: number) => { path = [[x, y]]; },
    lineTo: (x: number, y: number) => { path.push([x, y]); },
    fill: () => { if (context.fillStyle === 'rgba(59,130,246,0.3)') waveforms.push([...path]); },
    stroke: () => { if (context.strokeStyle === 'rgba(59,130,246,0.85)') outlines.push([...path]); },
  };
  const ctx = new Proxy(context, {
    get: (target, key) => key in target ? target[key as keyof typeof target] : vi.fn(),
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  useProjectStore.setState({ ...useProjectStore.getInitialState(), snapEnabled: false });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture() {
  const source: AudioSource = {
    id: 'source', name: 'Wave', buffer: {} as AudioBuffer,
    duration: 256, sampleRate: 44100, channels: 1,
    peaks: {
      min: Float32Array.from({ length: 4096 }, (_, i) => -(i % 17) / 16),
      max: Float32Array.from({ length: 4096 }, (_, i) => (i % 13) / 12),
    },
  };
  const segment: AudioSegment = {
    id: 'segment', sourceId: source.id, trackId: 'track', name: 'Trimmed',
    startTime: 0.125, duration: 128.06640625, sourceOffset: 31.25,
    fadeInDuration: 0, fadeOutDuration: 0, fadeInCurve: 'linear', fadeOutCurve: 'linear',
    gain: 1, effects: [], color: '#3b82f6',
  };
  useProjectStore.setState((s) => ({
    sources: new Map([[source.id, source]]), zoomLevel: 64, scrollOffset: 60.12890625,
    project: { ...s.project, tracks: [{
      id: 'track', name: 'Track', muted: false, solo: false, volume: 1, pan: 0,
      segments: [segment],
    }] },
  }));
  return { source, segment };
}

// Reference the original segment-local pixel grids, including the reverse
// fill grid anchored to its fractional right edge. Keep the neighbors needed
// to interpolate across each viewport edge, rather than resampling at x=0.
function reference(source: AudioSource, segment: AudioSegment, width: number) {
  const { zoomLevel, scrollOffset } = useProjectStore.getState();
  const left = (segment.startTime - scrollOffset) * zoomLevel;
  const right = (segment.startTime + segment.duration - scrollOffset) * zoomLevel;
  const size = right - left;
  const count = source.peaks.max.length;
  const start = segment.sourceOffset / source.duration * count;
  const range = Math.min(count, (segment.sourceOffset + segment.duration) / source.duration * count) - start;
  const point = (px: number, peaks: Float32Array): Point => [
    left + px,
    43 - peaks[Math.min(count - 1, Math.max(0, Math.floor(start + px / size * range)))] * 27,
  ];
  const upper: Point[] = [];
  const lower: Point[] = [];
  const reverse: Point[] = [];
  for (let px = 0; px <= size; px++) {
    upper.push(point(px, source.peaks.max));
    lower.push(point(px, source.peaks.min));
  }
  for (let px = size; px >= 0; px--) reverse.push(point(px, source.peaks.min));
  function crop(points: Point[]) {
    return points.filter(([x], i) => {
      const previous = points[i - 1]?.[0] ?? x;
      const next = points[i + 1]?.[0] ?? x;
      return Math.max(x, previous, next) >= 0 && Math.min(x, previous, next) <= width;
    });
  }
  return { fill: [...crop(upper), ...crop(reverse)], strokes: [crop(upper), crop(lower)] };
}

describe('timeline waveform viewport', () => {
  it.each([
    { name: 'left edge visible', scrollOffset: 0, duration: 128.06640625 },
    { name: 'right edge visible', scrollOffset: 60.12890625, duration: 61.06640625 },
    { name: 'entire fractional segment visible', scrollOffset: 0, duration: 1.06640625 },
    { name: 'subpixel right-edge intersection', scrollOffset: 61.1875, duration: 61.06640625 },
  ])('preserves the original envelopes with $name', ({ scrollOffset, duration }) => {
    const { source, segment } = fixture();
    segment.duration = duration;
    useProjectStore.setState({ scrollOffset });
    const width = 120.5;
    render(<TimelineCanvas width={width} />);
    frame();
    const expected = reference(source, segment, width);
    expect(waveforms).toEqual([expected.fill]);
    expect(outlines).toEqual(expected.strokes);
  });

  it('recomputes visible bounds after scrolling, zooming, and resizing', () => {
    const { source, segment } = fixture();
    const { rerender } = render(<TimelineCanvas width={120.5} />);
    frame();
    waveforms = [];
    outlines = [];
    act(() => useProjectStore.setState({ scrollOffset: 90.1328125, zoomLevel: 128 }));
    rerender(<TimelineCanvas width={240.25} />);
    frame();
    const expected = reference(source, segment, 240.25);
    expect(waveforms).toEqual([expected.fill]);
    expect(outlines).toEqual(expected.strokes);
  });

  it.each([-200, 300])('does not draw wholly offscreen segments at scroll offset %s', (scrollOffset) => {
    fixture();
    useProjectStore.setState({ scrollOffset });
    render(<TimelineCanvas width={120.5} />);
    frame();
    expect(waveforms).toEqual([]);
    expect(outlines).toEqual([]);
  });

  it.each([1, 2])('bounds drawing to visible CSS pixels at DPR %s without resampling trimmed peaks', (dpr) => {
    vi.stubGlobal('devicePixelRatio', dpr);
    const { source, segment } = fixture();
    const width = 120.5;
    render(<TimelineCanvas width={width} />);
    frame();
    expect(waveforms).toHaveLength(1);
    expect(outlines).toHaveLength(2);
    expect(waveforms[0].length).toBeLessThanOrEqual(2 * (Math.ceil(width) + 3));
    for (const outline of outlines) expect(outline.length).toBeLessThanOrEqual(Math.ceil(width) + 3);
    const expected = reference(source, segment, width);
    expect(waveforms[0]).toEqual(expected.fill);
    expect(outlines).toEqual(expected.strokes);
  });
});
