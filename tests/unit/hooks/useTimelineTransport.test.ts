import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimelineTransport } from '../../../src/hooks/useTimelineTransport';
import { useProjectStore } from '../../../src/stores/projectStore';
import type { AudioEngineHandle } from '../../../src/hooks/useAudioEngine';
import type { TimelineEngine } from '../../../src/audio/engine/TimelineEngine';

let currentTime = 100;
let callbacks: Map<number, FrameRequestCallback>;
let nextId = 0;
const engine = { play: vi.fn(), stop: vi.fn(), setSources: vi.fn() };
const engineRef = { current: engine as unknown as TimelineEngine };
const audio = { getContext: () => ({ get currentTime() { return currentTime; } }), resume: async () => {} } as unknown as AudioEngineHandle;

beforeEach(() => {
  vi.clearAllMocks(); currentTime = 100; nextId = 0; callbacks = new Map();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { callbacks.set(++nextId, cb); return nextId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
  const project = { ...useProjectStore.getState().project, duration: 20, minimumDuration:20, editRange:undefined, tracks: [] };
  useProjectStore.setState({ project, sources: new Map(), isPlaying: false, rangePlayback:false, loopEnabled: false, playheadPosition: 2 });
});
afterEach(() => vi.unstubAllGlobals());

async function start() {
  const hook = renderHook(() => useTimelineTransport(engineRef, audio));
  await act(async () => { useProjectStore.getState().setIsPlaying(true); });
  return hook;
}

function tick() {
  const callback = [...callbacks.values()].at(-1)!;
  callbacks.clear();
  act(() => callback(0));
}

describe('audio-clock timeline transport', () => {
  it('advances from the audio clock and reschedules an explicit seek', async () => {
    const hook = await start();
    expect(engine.play).toHaveBeenLastCalledWith(expect.anything(), 2);
    currentTime = 103.5; tick();
    expect(useProjectStore.getState().playheadPosition).toBe(5.5);
    expect(engine.play).toHaveBeenCalledTimes(1);
    act(() => useProjectStore.getState().setPlayheadPosition(12));
    expect(engine.play).toHaveBeenLastCalledWith(expect.anything(), 12);
    currentTime = 104; tick();
    expect(useProjectStore.getState().playheadPosition).toBe(12.5);
    hook.unmount();
    expect(engine.stop).toHaveBeenCalled();
  });

  it('catches up after missing frames and stops at the project end', async () => {
    const hook = await start();
    currentTime = 130; tick();
    expect(useProjectStore.getState().playheadPosition).toBe(20);
    expect(useProjectStore.getState().isPlaying).toBe(false);
    expect(callbacks.size).toBe(0);
    hook.unmount();
  });

  it('restarts at the current position when track edits change the project', async () => {
    const hook = await start();
    currentTime = 102; tick();
    await act(async () => {
      useProjectStore.setState({ project: { ...useProjectStore.getState().project, name: 'Edited' } });
    });
    expect(engine.play).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Edited' }), 4);
    hook.unmount();
  });
});

it('plays and stops a selected range without consuming clip selection', async()=>{
 const state=useProjectStore.getState();state.setEditRange(3,5);
 const hook=renderHook(()=>useTimelineTransport(engineRef,audio));
 await act(async()=>state.playEditRange());
 expect(engine.play).toHaveBeenLastCalledWith(expect.anything(),3,5);
 currentTime=103;tick();
 expect(useProjectStore.getState()).toMatchObject({playheadPosition:5,isPlaying:false,rangePlayback:false});
 hook.unmount();
});
it('range looping preserves overshoot and resumes inside the selected range',async()=>{
 const state=useProjectStore.getState();state.setEditRange(3,5);state.setLoopEnabled(true);
 const hook=renderHook(()=>useTimelineTransport(engineRef,audio));await act(async()=>state.playEditRange());
 currentTime=105.25;tick();
 expect(engine.play).toHaveBeenLastCalledWith(expect.anything(),4.25,5);
 expect(useProjectStore.getState().playheadPosition).toBe(4.25);hook.unmount();
});
