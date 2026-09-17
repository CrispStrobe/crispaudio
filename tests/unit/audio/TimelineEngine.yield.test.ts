import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TimelineEngine } from '../../../src/audio/engine/TimelineEngine';
import type { TimelineProject, AudioSource } from '../../../src/types/audio';

let clock: number;
let cost: number;
let nodes: { buffer: AudioBuffer | null; start: ReturnType<typeof vi.fn> }[];
const rendered = {} as AudioBuffer;
const startRendering = vi.fn(async () => rendered);
function gain() {
  return { connect: vi.fn(), gain: { value: 1, setValueAtTime: vi.fn() } };
}
const context = { createGain: gain, destination: {} } as unknown as AudioContext;
const buffer = {} as AudioBuffer;
const source = { id: 'source', buffer } as AudioSource;
const project: TimelineProject = {
  id: 'p', name: 'p', sampleRate: 48000, duration: 6, masterEffects: [],
  tracks: [{ id: 't', name: 't', muted: false, solo: false, volume: 1, pan: 0,
    segments: [0, 2, 4].map(startTime => ({ id: String(startTime), trackId: 't', sourceId: 'source',
      startTime, duration: 2, sourceOffset: 0, gain: 1, effects: [], color: '', name: '',
      fadeInDuration: 0, fadeOutDuration: 0, fadeInCurve: 'linear', fadeOutCurve: 'linear' })) }],
};
beforeEach(() => {
  clock = 0; cost = 12; nodes = [];
  startRendering.mockClear();
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('OfflineAudioContext', class {
    destination = {};
    createGain = gain;
    startRendering = startRendering;
    createBufferSource() {
      clock += cost;
      const node = { buffer: null, start: vi.fn(), connect: vi.fn() };
      nodes.push(node);
      return node;
    }
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('yields between expensive segments, preserving schedule and source snapshot', async () => {
  const engine = new TimelineEngine(context);
  const registry = new Map([['source', source]]);
  engine.setSources(registry);
  const result = engine.renderToBuffer(project);
  expect(nodes).toHaveLength(1);
  expect(startRendering).not.toHaveBeenCalled();
  // Source edits during the yield must not change an in-progress export.
  registry.clear();
  engine.setSources(new Map());
  await vi.runAllTimersAsync();
  expect(await result).toBe(rendered);
  expect(nodes).toHaveLength(3);
  expect(nodes.map(node => node.buffer)).toEqual([buffer, buffer, buffer]);
  expect(nodes.map(node => node.start.mock.calls[0])).toEqual([[0, 0, 2], [2, 0, 2], [4, 0, 2]]);
  expect(startRendering).toHaveBeenCalledTimes(1);
});

it('does not delay cheap graphs', async () => {
  cost = 0;
  const engine = new TimelineEngine(context);
  engine.setSources(new Map([['source', source]]));
  const result = engine.renderToBuffer(project);
  expect(startRendering).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  expect(await result).toBe(rendered);
});
