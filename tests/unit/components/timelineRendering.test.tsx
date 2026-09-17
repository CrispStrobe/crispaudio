import { Profiler } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineRuler } from '../../../src/components/timeline/TimelineRuler';
import { TimelineCanvas } from '../../../src/components/timeline/TimelineCanvas';
import { useProjectStore } from '../../../src/stores/projectStore';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../src/lib/native', () => ({ haptic: vi.fn() }));

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let clearRect: ReturnType<typeof vi.fn>;
function frame() {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(16));
  });
}
beforeEach(() => {
  frames = new Map();
  nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)));
  clearRect = vi.fn();
  const ctx = new Proxy({ clearRect }, { get: (target, key) => key in target ? target[key as keyof typeof target] : vi.fn(), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  useProjectStore.setState({ ...useProjectStore.getInitialState() });
});
afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('light');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('timeline drawing invalidation', () => {
  it('does not commit canvas React work for transport or project metadata updates', () => {
    const onRender = vi.fn();
    render(<Profiler id="canvas" onRender={onRender}><TimelineCanvas width={800} /></Profiler>);
    frame();
    onRender.mockClear();
    act(() => useProjectStore.getState().setPlayheadPosition(2));
    act(() => useProjectStore.setState({ isPlaying: true, loopEnabled: true }));
    act(() => useProjectStore.setState((s) => ({ project: { ...s.project, name: 'Renamed' } })));
    expect(onRender).not.toHaveBeenCalled();
  });
  it.each([TimelineCanvas, TimelineRuler])('invalidates static colors on theme changes', async (Component) => {
    render(<Component width={800} />);
    frame();
    clearRect.mockClear();
    await act(async () => { document.documentElement.classList.add('light'); });
    frame();
    expect(clearRect).toHaveBeenCalledTimes(1);
    document.documentElement.classList.remove('light');
  });
  it.each([TimelineCanvas, TimelineRuler])('rearms DPR observation and resizes backing pixels without layout changes', (Component) => {
    const queries: { media: string; listener?: () => void; removeEventListener: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal('matchMedia', vi.fn((media: string) => {
      const query = { media, listener: undefined as (() => void) | undefined, removeEventListener: vi.fn() };
      queries.push(query);
      return { ...query, addEventListener: (_: string, listener: () => void) => { query.listener = listener; } };
    }));
    vi.stubGlobal('devicePixelRatio', 1);
    const { container, unmount } = render(<Component width={800} />);
    frame();
    vi.stubGlobal('devicePixelRatio', 2);
    act(() => queries[0]?.listener?.());
    frame();
    expect(container.querySelector('canvas')?.width).toBe(1600);
    expect(queries[1]?.media).toBe('(resolution: 2dppx)');
    expect(queries[0].removeEventListener).toHaveBeenCalled();
    vi.stubGlobal('devicePixelRatio', 1.5);
    act(() => queries[1]?.listener?.());
    frame();
    expect(container.querySelector('canvas')?.width).toBe(1200);
    unmount();
    expect(queries[2].removeEventListener).toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it('keeps ruler ticks static while its overlay moves', () => {
    const { container } = render(<TimelineRuler width={800} />);
    frame();
    clearRect.mockClear();
    act(() => useProjectStore.getState().setPlayheadPosition(3));
    frame();
    expect(clearRect).not.toHaveBeenCalled();
    expect(container.querySelector('[data-timeline-playhead]')).toHaveStyle({ transform: 'translateX(300px)' });
  });
  it('moves a separate playhead overlay without repainting waveforms', () => {
    const { container } = render(<TimelineCanvas width={800} />);
    frame();
    clearRect.mockClear();
    act(() => useProjectStore.getState().setPlayheadPosition(2));
    frame();
    expect(clearRect).not.toHaveBeenCalled();
    const overlay = container.querySelector('[data-timeline-playhead]');
    expect(overlay).toHaveStyle({ transform: 'translateX(200px)' });
    expect(frames.size).toBe(0);
  });

  it('redraws when store state changes', () => {
    render(<TimelineCanvas width={800} />);
    frame();
    expect(clearRect).toHaveBeenCalledTimes(1);
    act(() => useProjectStore.getState().setZoomLevel(200));
    frame();
    expect(clearRect).toHaveBeenCalledTimes(2);
    expect(frames.size).toBe(0);
  });

  it('defers hidden changes and draws latest state once on resume', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    render(<TimelineCanvas width={800} />);
    frame();
    expect(clearRect).not.toHaveBeenCalled();
    act(() => useProjectStore.getState().setZoomLevel(200));
    expect(frames.size).toBe(0);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    frame();
    expect(clearRect).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });
  it('redraws source replacement and selection without a track edit', () => {
    const source = {
      id: 'source', name: 'Tone', buffer: {} as AudioBuffer,
      duration: 1, sampleRate: 44100, channels: 1,
      peaks: { min: new Float32Array([-0.5]), max: new Float32Array([0.5]) },
    };
    useProjectStore.getState().importAudioSource(source);
    render(<TimelineCanvas width={800} />);
    frame();
    clearRect.mockClear();
    const tracks = useProjectStore.getState().project.tracks;
    act(() => useProjectStore.getState().addSource({ ...source, peaks: { min: new Float32Array([-1]), max: new Float32Array([1]) } }));
    frame();
    expect(clearRect).toHaveBeenCalledTimes(1);
    expect(useProjectStore.getState().project.tracks).toBe(tracks);
    act(() => useProjectStore.getState().selectSegment(tracks[0].segments[0].id));
    frame();
    expect(clearRect).toHaveBeenCalledTimes(2);
  });

  it.each([TimelineCanvas, TimelineRuler])('resizes and restores the latest hidden playhead', (Component) => {
    const { container, rerender } = render(<Component width={800} />);
    frame();
    clearRect.mockClear();
    const overlay = container.querySelector('[data-timeline-playhead]');
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    act(() => useProjectStore.getState().setPlayheadPosition(9));
    rerender(<Component width={1000} />);
    expect(frames.size).toBe(0);
    expect(overlay).toHaveStyle({ transform: 'translateX(0px)' });
    visibility.mockReturnValue('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    frame();
    expect(clearRect).toHaveBeenCalledTimes(1);
    expect(container.querySelector('canvas')?.width).toBe(1000);
    expect(overlay).toHaveStyle({ transform: 'translateX(900px)', display: 'block' });
  });

  it.each([TimelineCanvas, TimelineRuler])('cancels pending drawing and removes observers on unmount', async (Component) => {
    const { container, unmount } = render(<Component width={800} />);
    const overlay = container.querySelector('[data-timeline-playhead]') as HTMLElement;
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    await act(async () => {
      document.documentElement.classList.add('light');
      document.dispatchEvent(new Event('visibilitychange'));
      useProjectStore.getState().setPlayheadPosition(2);
    });
    expect(frames.size).toBe(0);
    expect(clearRect).not.toHaveBeenCalled();
    expect(overlay.style.transform).toBe('translateX(0px)');
  });

  it('draws once on mount and leaves no idle animation work', () => {
    render(<TimelineCanvas width={800} />);
    frame();
    expect(clearRect).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    frame();
    expect(clearRect).toHaveBeenCalledTimes(1);
  });
});
