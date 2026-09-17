import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useSfxPlayback } from '../../../src/hooks/useSfxPlayback';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('waits for resume and cancels a pending play on stop or unmount', async () => {
  let resume!: () => void;
  const context = {
    state: 'suspended', destination: {}, close: vi.fn(async () => {}),
    resume: vi.fn(() => new Promise<void>((resolve) => { resume = resolve; })),
    createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(3) })),
    createBufferSource: vi.fn(() => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() })),
  };
  vi.stubGlobal('AudioContext', class { constructor() { return context; } });
  const onPlaying = vi.fn();
  const { result, unmount } = renderHook(() => useSfxPlayback(new Float32Array(3), 44100, false, onPlaying));
  act(() => { void result.current.handlePlay(); });
  expect(context.createBufferSource).not.toHaveBeenCalled();
  act(() => result.current.handleStop());
  await act(async () => resume());
  expect(context.createBufferSource).not.toHaveBeenCalled();
  act(() => { void result.current.handlePlay(); });
  unmount();
  await act(async () => resume());
  expect(context.createBufferSource).not.toHaveBeenCalled();
  expect(context.close).toHaveBeenCalledOnce();
});
