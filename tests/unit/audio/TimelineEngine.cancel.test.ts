import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TimelineEngine } from '../../../src/audio/engine/TimelineEngine';
import type { TimelineProject, AudioSource } from '../../../src/types/audio';

let clock: number;
let cost: number;
let nodes: { start: ReturnType<typeof vi.fn> }[];
let startRendering: ReturnType<typeof vi.fn>;
let rendering: Promise<AudioBuffer> | null;
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
  rendering = null;
  startRendering = vi.fn(() => rendering!);
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

it('rejects before any node scheduling when the signal is already aborted', async () => {
  const engine = new TimelineEngine(context);
  engine.setSources(new Map([['source', source]]));
  const controller = new AbortController();
  controller.abort();
  await expect(engine.renderToBuffer(project, 0, undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(nodes).toHaveLength(0);
  expect(startRendering).not.toHaveBeenCalled();
});

it('aborts between yields and races the native render so startRendering never resolves the export', async () => {
  const engine = new TimelineEngine(context);
  engine.setSources(new Map([['source', source]]));
  const controller = new AbortController();
  const result = engine.renderToBuffer(project, 0, undefined, controller.signal);
  expect(nodes).toHaveLength(1);
  controller.abort();
  const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
  await vi.runAllTimersAsync();
  await rejected;
  expect(nodes).toHaveLength(1);
  expect(startRendering).not.toHaveBeenCalled();
});

it('removes its abort listener if native rendering throws synchronously', async () => {
  cost = 0;
  const engine = new TimelineEngine(context);
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  startRendering.mockImplementationOnce(() => { throw new Error('native failure'); });
  await expect(engine.renderToBuffer(project, 0, undefined, controller.signal)).rejects.toThrow('native failure');
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});

it('races an abort against the native render', async () => {
  cost = 0;
  const engine = new TimelineEngine(context);
  engine.setSources(new Map([['source', source]]));
  const controller = new AbortController();
  rendering = new Promise<AudioBuffer>(() => {});
  const result = engine.renderToBuffer(project, 0, undefined, controller.signal);
  expect(startRendering).toHaveBeenCalledTimes(1);
  await Promise.resolve();
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
});
