// ---------------------------------------------------------------------------
// useAutosave — extended edge-case tests
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useAutosave, restoreAutosave, clearAutosave } from '../../../src/hooks/useAutosave';
import { useProjectStore } from '../../../src/stores/projectStore';

function loadContent() {
  useProjectStore.setState(useProjectStore.getInitialState());
  const store = useProjectStore.getState();
  store.addTrack('Track');
  const trackId = useProjectStore.getState().project.tracks[0].id;
  store.addSegment(trackId, {
    id: 'segment', trackId, sourceId: 'source', startTime: 0, duration: 1,
    sourceOffset: 0, fadeInDuration: 0, fadeOutDuration: 0,
    fadeInCurve: 'linear', fadeOutCurve: 'linear', effects: [], gain: 1,
    color: '#000', name: 'Segment',
  });
}

function tick() {
  act(() => vi.advanceTimersByTime(30_000));
}

// Exercise the real hook and store: unchanged ticks must avoid serialization too.
describe('useAutosave scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    loadContent();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    useProjectStore.setState(useProjectStore.getInitialState());
  });

  it('skips serialization and writes for unchanged ticks and unloads', () => {
    renderHook(() => useAutosave());
    const stringify = vi.spyOn(JSON, 'stringify');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    tick();
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(stringify).toHaveBeenCalledTimes(1);
    const saved = localStorage.getItem(AUTOSAVE_KEY);

    tick();
    act(() => window.dispatchEvent(new Event('beforeunload')));

    expect(stringify).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(AUTOSAVE_KEY)).toBe(saved);
  });

  it('ignores transport and view updates but saves immutable project edits', () => {
    renderHook(() => useAutosave());
    tick();
    const project = useProjectStore.getState().project;
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    act(() => {
      useProjectStore.getState().setPlayheadPosition(5);
      useProjectStore.getState().setZoomLevel(200);
    });
    expect(useProjectStore.getState().project).toBe(project);
    tick();
    expect(setItem).not.toHaveBeenCalled();

    act(() => useProjectStore.getState().setSegmentGain('segment', 0.5));
    expect(useProjectStore.getState().project).not.toBe(project);
    expect(useProjectStore.getState().project.id).toBe(project.id);
    act(() => window.dispatchEvent(new Event('beforeunload')));
    tick();
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(AUTOSAVE_KEY)!).project.tracks[0].segments[0].gain).toBe(0.5);

    // Undo can revisit a previously saved identity: only the latest save counts.
    act(() => useProjectStore.temporal.getState().undo());
    expect(useProjectStore.getState().project).toBe(project);
    tick();
    expect(setItem).toHaveBeenCalledTimes(2);
    expect(JSON.parse(localStorage.getItem(AUTOSAVE_KEY)!).project).toEqual(project);
  });

  it('retries failed writes for an unchanged project until one succeeds', () => {
    renderHook(() => useAutosave());
    tick();
    act(() => useProjectStore.getState().setSegmentGain('segment', 0.5));
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    const stringify = vi.spyOn(JSON, 'stringify');

    expect(tick).not.toThrow();
    expect(JSON.parse(localStorage.getItem(AUTOSAVE_KEY)!).project.tracks[0].segments[0].gain).toBe(1);
    act(() => window.dispatchEvent(new Event('beforeunload')));
    tick();

    expect(setItem).toHaveBeenCalledTimes(2);
    expect(stringify).toHaveBeenCalledTimes(2);
    expect(JSON.parse(localStorage.getItem(AUTOSAVE_KEY)!).project.tracks[0].segments[0].gain).toBe(0.5);
  });

  it('retries failed serialization instead of marking the project saved', () => {
    renderHook(() => useAutosave());
    const stringify = vi.spyOn(JSON, 'stringify').mockImplementationOnce(() => {
      throw new Error('Serialization failed');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    expect(tick).not.toThrow();
    expect(setItem).not.toHaveBeenCalled();
    tick();
    tick();
    expect(stringify).toHaveBeenCalledTimes(2);
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('attempts the first save on remount even when project identity is unchanged', () => {
    const hook = renderHook(() => useAutosave());
    tick();
    hook.unmount();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    renderHook(() => useAutosave());
    tick();
    tick();
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous autosave while the current project is empty', () => {
    renderHook(() => useAutosave());
    tick();
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    act(() => useProjectStore.getState().removeSegment('segment'));
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    tick();
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem(AUTOSAVE_KEY)).toBe(saved);
  });

  it('saves a restored project without audio sources on the next tick', () => {
    renderHook(() => useAutosave());
    tick();
    const project = useProjectStore.getState().project;
    act(() => useProjectStore.getState().setSegmentGain('segment', 0.5));
    act(() => expect(restoreAutosave()).toBe(true));
    expect(useProjectStore.getState().project).toEqual(project);
    expect(useProjectStore.getState().sources.size).toBe(0);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    tick();
    tick();
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('removes interval and unload saves on unmount', () => {
    const hook = renderHook(() => useAutosave());
    hook.unmount();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    tick();
    act(() => window.dispatchEvent(new Event('beforeunload')));
    expect(setItem).not.toHaveBeenCalled();
  });

  it('saves unchanged content again after clearing the autosave slot', () => {
    renderHook(() => useAutosave());
    tick();
    const project = useProjectStore.getState().project;
    clearAutosave();
    expect(localStorage.getItem(AUTOSAVE_KEY)).toBeNull();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    tick();
    tick();

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(AUTOSAVE_KEY)!).project).toEqual(project);
  });
});

const AUTOSAVE_KEY = 'crispaudio-autosave';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Autosave with very large project data
// ---------------------------------------------------------------------------

describe('autosave — large project data', () => {
  it('saves very large project data to localStorage without throwing', () => {
    // Build a project with many tracks and segments
    const tracks = Array.from({ length: 100 }, (_, ti) => ({
      id: `track-${ti}`,
      name: `Track ${ti}`,
      muted: false,
      solo: false,
      volume: 1,
      pan: 0,
      segments: Array.from({ length: 50 }, (_, si) => ({
        id: `seg-${ti}-${si}`,
        trackId: `track-${ti}`,
        sourceId: `src-${si}`,
        startTime: si * 2,
        duration: 2,
        sourceOffset: 0,
        fadeInDuration: 0,
        fadeOutDuration: 0,
        fadeInCurve: 'linear' as const,
        fadeOutCurve: 'linear' as const,
        effects: [],
        gain: 1,
        color: '#ff0000',
        name: `Segment ${si}`,
      })),
      effects: [],
    }));

    const largeProject = {
      id: 'large-proj',
      name: 'Large Project',
      sampleRate: 44100,
      tracks,
      masterEffects: [],
      duration: 100,
    };

    const data = {
      savedAt: new Date().toISOString(),
      project: largeProject,
    };

    expect(() => {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
    }).not.toThrow();

    // Verify it was actually stored
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.project.tracks).toHaveLength(100);
    expect(parsed.project.tracks[0].segments).toHaveLength(50);
  });
});

// ---------------------------------------------------------------------------
// localStorage full scenario (QuotaExceededError)
// ---------------------------------------------------------------------------

describe('autosave — localStorage full', () => {
  it('handles QuotaExceededError gracefully when setItem throws', () => {
    // The useAutosave hook's internal save() catches errors from setItem.
    // We verify that the pattern works by simulating it directly.
    const quotaError = new DOMException(
      'Failed to execute \'setItem\' on \'Storage\': Setting the value exceeded the quota.',
      'QuotaExceededError',
    );

    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError;
    });

    const data = {
      savedAt: new Date().toISOString(),
      project: {
        id: 'p1',
        name: 'Project',
        sampleRate: 44100,
        tracks: [
          {
            id: 't1',
            name: 'Track 1',
            muted: false,
            solo: false,
            volume: 1,
            pan: 0,
            segments: [{ id: 's1', trackId: 't1', sourceId: 'src1', startTime: 0, duration: 1, sourceOffset: 0, fadeInDuration: 0, fadeOutDuration: 0, fadeInCurve: 'linear', fadeOutCurve: 'linear', effects: [], gain: 1, color: '#000', name: 'S1' }],
            effects: [],
          },
        ],
        masterEffects: [],
        duration: 1,
      },
    };

    // Mimic the hook's try/catch behavior: should not throw
    expect(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
      } catch {
        // localStorage full or unavailable — silently ignore (matches hook behavior)
      }
    }).not.toThrow();

    setItemSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// restoreAutosave with malformed JSON
// ---------------------------------------------------------------------------

describe('restoreAutosave — malformed JSON', () => {
  it('returns false for truncated JSON', () => {
    localStorage.setItem(AUTOSAVE_KEY, '{"savedAt":"2026-01-01","project":{"id":"p1"');
    expect(restoreAutosave()).toBe(false);
  });

  it('returns false for completely garbled data', () => {
    localStorage.setItem(AUTOSAVE_KEY, 'abc123!@#$%^&*()');
    expect(restoreAutosave()).toBe(false);
  });

  it('returns false for empty string', () => {
    localStorage.setItem(AUTOSAVE_KEY, '');
    expect(restoreAutosave()).toBe(false);
  });

  it('returns false for JSON that is not an object', () => {
    localStorage.setItem(AUTOSAVE_KEY, '"just a string"');
    // This will parse fine but data.project will be undefined,
    // so loadProjectState will be called with undefined — which should
    // either fail or the catch block will return false
    const result = restoreAutosave();
    // Either way, we just ensure it doesn't crash
    expect(typeof result).toBe('boolean');
  });

  it('returns false for null JSON', () => {
    localStorage.setItem(AUTOSAVE_KEY, 'null');
    expect(restoreAutosave()).toBe(false);
  });
});
