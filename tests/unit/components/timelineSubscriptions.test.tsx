import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelinePanel } from '../../../src/components/timeline/TimelinePanel';
import { TransportControls } from '../../../src/components/timeline/TransportControls';
import { useProjectStore } from '../../../src/stores/projectStore';

const { translate, engine, playback } = vi.hoisted(() => ({
  playback: { stop: vi.fn(), play: vi.fn(), setSources: vi.fn() },
  translate: vi.fn((key: string) => key),
  engine: { getContext: vi.fn(() => ({})), masterGain: {}, resume: vi.fn() },
}));
vi.mock('react-i18next', async (importOriginal) => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: translate }) }));
vi.mock('../../../src/hooks/useAudioEngine', () => ({ useAudioEngine: () => engine }));
vi.mock('../../../src/audio/engine/TimelineEngine', () => ({ TimelineEngine: class { setSources = playback.setSources; play = playback.play; stop = playback.stop; } }));
vi.mock('../../../src/components/timeline/TimelineCanvas', () => ({ TimelineCanvas: () => null }));
vi.mock('../../../src/components/timeline/TimelineRuler', () => ({ TimelineRuler: () => null }));
vi.mock('../../../src/components/timeline/SegmentEffectsPanel', () => ({ SegmentEffectsPanel: () => null }));

beforeEach(() => {
  useProjectStore.setState({ ...useProjectStore.getInitialState() });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

function animationClock() {
  let id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => { frames.set(++id, cb); return id; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((key: number) => frames.delete(key)));
  return { frames, tick: (now: number) => act(() => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((cb) => cb(now));
  }) };
}

describe('timeline subscription isolation', () => {
  it('stops owned playback and cancels animation on unmount', () => {
    const { unmount } = render(<TimelinePanel />);
    act(() => useProjectStore.getState().setIsPlaying(true));
    expect(playback.play).toHaveBeenCalledTimes(1);
    unmount();
    expect(playback.stop).toHaveBeenCalledTimes(1);
    expect(useProjectStore.getState().isPlaying).toBe(false);
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('suspends hidden animation and catches up once when visible', () => {
    const clock = animationClock();
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    render(<TimelinePanel />);
    act(() => useProjectStore.getState().setIsPlaying(true));
    clock.tick(1000);
    expect(useProjectStore.getState().playheadPosition).toBe(1);
    visibility.mockReturnValue('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(clock.frames.size).toBe(0);
    expect(playback.stop).not.toHaveBeenCalled();
    visibility.mockReturnValue('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(clock.frames.size).toBe(1);
    clock.tick(5000);
    expect(useProjectStore.getState().playheadPosition).toBe(5);
    expect(clock.frames.size).toBe(1);
  });

  it('ends playback without leaving a scheduled frame', () => {
    const clock = animationClock();
    vi.spyOn(performance, 'now').mockReturnValue(0);
    useProjectStore.setState((s) => ({ project: { ...s.project, duration: 1 } }));
    render(<TimelinePanel />);
    act(() => useProjectStore.getState().setIsPlaying(true));
    clock.tick(2000);
    expect(useProjectStore.getState().isPlaying).toBe(false);
    expect(useProjectStore.getState().playheadPosition).toBe(1);
    expect(playback.stop).toHaveBeenCalledTimes(1);
    expect(clock.frames.size).toBe(0);
  });

  it('rerenders only the edited track header', () => {
    useProjectStore.getState().addTrack('First');
    useProjectStore.getState().addTrack('Second');
    render(<TimelinePanel />);
    translate.mockClear();
    const second = useProjectStore.getState().project.tracks[1];
    act(() => useProjectStore.getState().updateTrack(second.id, { name: 'Renamed' }));
    expect(screen.getByDisplayValue('Renamed')).toBeTruthy();
    expect(translate.mock.calls.filter(([key]) => key === 'timeline.trackName')).toHaveLength(1);
  });

  it('keeps panel and track headers out of playhead updates', () => {
    useProjectStore.getState().addTrack('First');
    render(<TimelinePanel />);
    translate.mockClear();
    act(() => useProjectStore.getState().setPlayheadPosition(1));
    expect(translate).not.toHaveBeenCalledWith('timeline.addTrack');
    expect(translate).not.toHaveBeenCalledWith('timeline.trackName');
  });
  it('does not rerender transport buttons on position or unrelated track updates', () => {
    render(<TransportControls />);
    translate.mockClear();
    act(() => useProjectStore.getState().setPlayheadPosition(2));
    expect(screen.getByText('00:02.00')).toBeTruthy();
    expect(translate).not.toHaveBeenCalledWith('timeline.play');
    act(() => useProjectStore.getState().addTrack('Other'));
    expect(translate).not.toHaveBeenCalledWith('timeline.play');
  });
});
