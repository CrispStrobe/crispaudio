import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SfxWaveform } from '../../../src/components/sfx/SfxWaveform';
import { VoiceWaveform } from '../../../src/components/voice/VoiceVisualizations';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let frames: Map<number, FrameRequestCallback>;
let now: number;
let visibility: DocumentVisibilityState;

function frameAt(time: number) {
  now = time;
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(now));
  });
}

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  act(() => document.dispatchEvent(new Event('visibilitychange')));
}

beforeEach(() => {
  frames = new Map();
  now = 1000;
  visibility = 'visible';
  // Include ID zero: it is a valid pending frame, not a missing frame.
  let nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)));
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  const context = new Proxy({}, {
    get: (_, key) => key === 'createLinearGradient' ? () => ({ addColorStop: vi.fn() }) : vi.fn(),
    set: () => true,
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as CanvasRenderingContext2D);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const waveforms = [
  { name: 'SFX', element: (isPlaying = true, duration = 10) => <SfxWaveform buffer={null} title="SFX" isPlaying={isPlaying} duration={duration} /> },
  { name: 'Voice', element: (isPlaying = true, duration = 10) => <VoiceWaveform buffer={null} color="#123456" title="Voice" isPlaying={isPlaying} duration={duration} /> },
];

it('keeps the SFX playback clock across zoom and reset', () => {
  const { container, getByRole, getByTitle } = render(waveforms[0].element());
  frameAt(4000);
  fireEvent.click(getByRole('button', { name: 'sfx.zoomIn' }));
  frameAt(5000);
  // Centered 1.5x view spans [1/6, 5/6]; 40% progress maps to 35%.
  expect(parseFloat(playhead(container).style.left)).toBeCloseTo(35);
  expect(playhead(container)).toHaveStyle({ display: 'block' });
  expect(frames.size).toBe(1);
  fireEvent.click(getByTitle('sfx.zoomReset'));
  frameAt(6000);
  expect(playhead(container)).toHaveStyle({ left: '50%', display: 'block' });
});

it('keeps hidden SFX zoom changes suspended and uses the latest view on resume', () => {
  const { container, getByRole } = render(waveforms[0].element());
  frameAt(2000);
  setVisibility('hidden');
  now = 4000;
  fireEvent.click(getByRole('button', { name: 'sfx.zoomIn' }));
  expect(frames.size).toBe(0);
  now = 5000;
  setVisibility('visible');
  expect(parseFloat(playhead(container).style.left)).toBeCloseTo(35);
  expect(frames.size).toBe(1);
});

function playhead(container: HTMLElement) {
  return container.querySelector('canvas + div') as HTMLDivElement;
}

describe.each(waveforms)('$name waveform visibility', ({ element }) => {
  it('starts hidden without scheduling a frame and retains its start time', () => {
    setVisibility('hidden');
    const { container } = render(element());
    expect(frames.size).toBe(0);
    now = 4000;
    setVisibility('visible');
    expect(playhead(container)).toHaveStyle({ left: '30%', display: 'block' });
    expect(frames.size).toBe(1);
  });

  it('does not queue duplicate frames on repeated visibility events', () => {
    render(element());
    setVisibility('visible');
    setVisibility('visible');
    expect(frames.size).toBe(1);
    setVisibility('hidden');
    setVisibility('hidden');
    expect(frames.size).toBe(0);
    setVisibility('visible');
    setVisibility('visible');
    expect(frames.size).toBe(1);
  });

  it.each(['visible', 'hidden'] as const)('cleans up on stop while %s and starts a fresh playback clock', (state) => {
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');
    const { container, rerender } = render(element());
    const listener = added.mock.calls.find(([event]) => event === 'visibilitychange')?.[1];
    expect(listener).toBeDefined();
    if (state === 'hidden') setVisibility('hidden');
    rerender(element(false));
    expect(frames.size).toBe(0);
    expect(removed).toHaveBeenCalledWith('visibilitychange', listener);
    expect(playhead(container)).toHaveStyle({ display: 'none' });
    now = 5000;
    setVisibility('visible');
    expect(frames.size).toBe(0);
    rerender(element());
    frameAt(6000);
    expect(playhead(container)).toHaveStyle({ left: '10%', display: 'block' });
  });

  it.each(['visible', 'hidden'] as const)('cleans up all RAFs and listeners on StrictMode unmount while %s', (state) => {
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(<StrictMode>{element()}</StrictMode>);
    expect(frames.size).toBe(1);
    if (state === 'hidden') setVisibility('hidden');
    unmount();
    expect(frames.size).toBe(0);
    const listeners = added.mock.calls.filter(([event]) => event === 'visibilitychange');
    expect(listeners.length).toBeGreaterThan(0);
    for (const [, listener] of listeners) {
      expect(removed).toHaveBeenCalledWith('visibilitychange', listener);
    }
    setVisibility('hidden');
    setVisibility('visible');
    expect(frames.size).toBe(0);
  });

  it.each([0, -1])('does not animate or subscribe with duration %s', (duration) => {
    const added = vi.spyOn(document, 'addEventListener');
    render(element(true, duration));
    expect(frames.size).toBe(0);
    expect(added.mock.calls.filter(([event]) => event === 'visibilitychange')).toHaveLength(0);
  });

  it('stays idle when stopped', () => {
    const added = vi.spyOn(document, 'addEventListener');
    render(element(false));
    setVisibility('hidden');
    setVisibility('visible');
    expect(frames.size).toBe(0);
    expect(added.mock.calls.filter(([event]) => event === 'visibilitychange')).toHaveLength(0);
  });

  it('does not restart completed visible playback on visibility changes', () => {
    const { container } = render(element());
    frameAt(11000);
    expect(frames.size).toBe(0);
    expect(playhead(container)).toHaveStyle({ display: 'none' });
    setVisibility('hidden');
    setVisibility('visible');
    expect(frames.size).toBe(0);
  });

  it('ignores an already-dequeued frame when the document becomes hidden', () => {
    const { container } = render(element());
    const callback = [...frames.values()][0];
    setVisibility('hidden');
    now = 3000;
    act(() => callback(now));
    expect(frames.size).toBe(0);
    expect(playhead(container).style.left).toBe('0%');
  });

  it('does not resume animation after playback completes while hidden', () => {
    const { container } = render(element());
    frameAt(2000);
    setVisibility('hidden');
    now = 12000;
    setVisibility('visible');
    expect(frames.size).toBe(0);
    expect(playhead(container)).toHaveStyle({ display: 'none' });
    setVisibility('hidden');
    setVisibility('visible');
    expect(frames.size).toBe(0);
  });

  it('suspends pending frames while hidden and catches up on resume', () => {
    const { container } = render(element());
    expect(frames.size).toBe(1);
    frameAt(2000);
    expect(playhead(container)).toHaveStyle({ left: '10%', display: 'block' });
    setVisibility('hidden');
    expect(frames.size).toBe(0);
    frameAt(5000);
    expect(frames.size).toBe(0);
    setVisibility('visible');
    frameAt(5000);
    expect(playhead(container)).toHaveStyle({ left: '40%', display: 'block' });
    expect(frames.size).toBe(1);
  });
});
