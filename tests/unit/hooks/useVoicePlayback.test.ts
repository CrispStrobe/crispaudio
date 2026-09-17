import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useVoicePlayback } from '../../../src/hooks/useVoicePlayback';

const buffer: AudioBuffer = {
  sampleRate: 44100, duration: 1, length: 3, numberOfChannels: 1,
  getChannelData: () => new Float32Array(3), copyFromChannel: vi.fn(), copyToChannel: vi.fn(),
};

function setup() {
  const resumes: { resolve: () => void; reject: (error: Error) => void }[] = [];
  const context = {
    state: 'suspended', destination: {}, close: vi.fn(async () => {}),
    resume: vi.fn(() => new Promise<void>((resolve, reject) => { resumes.push({ resolve, reject }); })),
    createBufferSource: vi.fn(() => ({
      buffer: null as AudioBuffer | null, onended: null as (() => void) | null,
      connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(),
    })),
  };
  vi.stubGlobal('AudioContext', class { constructor() { return context; } });
  return { context, resumes, ...renderHook(() => useVoicePlayback()) };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('handles resume rejection without starting playback', async () => {
  const { context, resumes, result } = setup();
  let pending!: Promise<void>;
  act(() => { pending = result.current.handlePlay(buffer, 'source'); });
  await act(async () => {
    const assertion = expect(pending).resolves.toBeUndefined();
    resumes[0].reject(new Error('resume denied'));
    await assertion;
  });
  expect(context.createBufferSource).not.toHaveBeenCalled();
  expect(result.current.isPlaying).toBe(false);
});

it('does not start a pending play after unmount', async () => {
  const { context, resumes, result, unmount } = setup();
  act(() => { void result.current.handlePlay(buffer, 'source'); });
  unmount();
  await act(async () => resumes[0].resolve());
  expect(context.createBufferSource).not.toHaveBeenCalled();
  expect(context.close).toHaveBeenCalledOnce();
});

it('only starts the newest request when resumes resolve out of order', async () => {
  const { context, resumes, result } = setup();
  act(() => { void result.current.handlePlay(buffer, 'source'); });
  act(() => { void result.current.handlePlay(buffer, 'processed'); });
  await act(async () => resumes[1].resolve());
  await act(async () => resumes[0].resolve());
  expect(context.createBufferSource).toHaveBeenCalledOnce();
  expect(result.current.playingBuffer).toBe('processed');
  const source = context.createBufferSource.mock.results[0].value;
  act(() => source.onended?.());
  expect(result.current.isPlaying).toBe(false);
  expect(source.disconnect).toHaveBeenCalledOnce();
  act(() => result.current.handleStop());
  expect(source.disconnect).toHaveBeenCalledOnce();
});

it('waits for resume and cancels a pending play on stop', async () => {
  const { context, resumes, result } = setup();
  act(() => { void result.current.handlePlay(buffer, 'source'); });
  expect(context.createBufferSource).not.toHaveBeenCalled();
  act(() => result.current.handleStop());
  await act(async () => resumes[0].resolve());
  expect(context.createBufferSource).not.toHaveBeenCalled();
  expect(result.current.isPlaying).toBe(false);
});
