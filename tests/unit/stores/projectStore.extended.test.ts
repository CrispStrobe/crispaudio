// ---------------------------------------------------------------------------
// projectStore extended tests — edge cases for importAudioSource, splitSegment
// bounds, clipboard operations, trimSegment, setSegmentFade, loadProjectState
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../../../src/stores/projectStore';
import type { AudioSegment, AudioSource, TimelineProject } from '../../../src/types/audio';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSegment(overrides: Partial<AudioSegment> = {}): AudioSegment {
  return {
    id: crypto.randomUUID(),
    trackId: '',
    sourceId: 'src-1',
    startTime: 0,
    duration: 2,
    sourceOffset: 0,
    fadeInDuration: 0,
    fadeOutDuration: 0,
    fadeInCurve: 'linear',
    fadeOutCurve: 'linear',
    effects: [],
    gain: 1,
    color: '#ffffff',
    name: 'test segment',
    ...overrides,
  };
}

/** Minimal AudioSource mock (jsdom has no AudioBuffer). */
function makeSource(overrides: Partial<AudioSource> = {}): AudioSource {
  const buf = {
    length: 44100,
    numberOfChannels: 1,
    sampleRate: 44100,
    duration: 1.0,
    getChannelData: () => new Float32Array(44100),
  } as unknown as AudioBuffer;

  return {
    id: crypto.randomUUID(),
    name: 'test.wav',
    buffer: buf,
    peaks: { min: new Float32Array(100), max: new Float32Array(100) },
    duration: 1.0,
    sampleRate: 44100,
    channels: 1,
    ...overrides,
  };
}

function resetStore(): void {
  useProjectStore.setState({
    project: {
      id: crypto.randomUUID(),
      name: 'Untitled Project',
      sampleRate: 44100,
      tracks: [],
      masterEffects: [],
      duration: 0,
    },
    sources: new Map(),
    selection: null,
    clipboard: { operation: null, segments: [], sourceIds: [] },
    playheadPosition: 0,
    isPlaying: false,
    zoomLevel: 100,
    scrollOffset: 0,
    snapEnabled: true,
    loopEnabled: false,
  });
}

beforeEach(resetStore);

// ---------------------------------------------------------------------------
// importAudioSource
// ---------------------------------------------------------------------------

describe('projectStore — importAudioSource', () => {
  it('creates a track when the project has none', () => {
    const src = makeSource();
    useProjectStore.getState().importAudioSource(src);

    const state = useProjectStore.getState();
    expect(state.project.tracks).toHaveLength(1);
    expect(state.project.tracks[0].segments).toHaveLength(1);
  });

  it('registers the source in the sources map', () => {
    const src = makeSource();
    useProjectStore.getState().importAudioSource(src);

    expect(useProjectStore.getState().sources.has(src.id)).toBe(true);
  });

  it('places the segment at the given startTime', () => {
    const src = makeSource({ duration: 2.5 });
    useProjectStore.getState().importAudioSource(src, 3.0);

    const seg = useProjectStore.getState().project.tracks[0].segments[0];
    expect(seg.startTime).toBe(3.0);
    expect(seg.duration).toBe(2.5);
  });

  it('falls back to an existing track when no trackId is given', () => {
    useProjectStore.getState().addTrack('Existing');
    const src = makeSource();
    useProjectStore.getState().importAudioSource(src);

    expect(useProjectStore.getState().project.tracks).toHaveLength(1);
    expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(1);
  });

  it('creates a new track when the given trackId does not exist', () => {
    useProjectStore.getState().addTrack('Existing');
    const src = makeSource();
    useProjectStore.getState().importAudioSource(src, 0, 'nonexistent-id');

    // Should fall back to the first existing track
    const tracks = useProjectStore.getState().project.tracks;
    expect(tracks).toHaveLength(1);
    expect(tracks[0].segments).toHaveLength(1);
  });

  it('uses the specified track when trackId is valid', () => {
    useProjectStore.getState().addTrack('T1');
    useProjectStore.getState().addTrack('T2');
    const t2Id = useProjectStore.getState().project.tracks[1].id;

    const src = makeSource();
    useProjectStore.getState().importAudioSource(src, 0, t2Id);

    expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(0);
    expect(useProjectStore.getState().project.tracks[1].segments).toHaveLength(1);
  });

  it('updates project duration after import', () => {
    const src = makeSource({ duration: 5.0 });
    useProjectStore.getState().importAudioSource(src, 2.0);

    expect(useProjectStore.getState().project.duration).toBe(7.0);
  });

  it('clamps negative startTime to 0', () => {
    const src = makeSource();
    useProjectStore.getState().importAudioSource(src, -5);

    const seg = useProjectStore.getState().project.tracks[0].segments[0];
    expect(seg.startTime).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// splitSegment — edge cases
// ---------------------------------------------------------------------------

describe('projectStore — splitSegment edge cases', () => {
  function addSeg(startTime: number, duration: number, sourceOffset = 0) {
    useProjectStore.getState().addTrack();
    const trackId = useProjectStore.getState().project.tracks[0].id;
    const seg = makeSegment({ trackId, startTime, duration, sourceOffset });
    useProjectStore.getState().addSegment(trackId, seg);
    return seg;
  }

  it('is a no-op when split time equals segment end', () => {
    const seg = addSeg(1, 3); // ends at t=4
    useProjectStore.getState().splitSegment(seg.id, 4.0);
    expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(1);
  });

  it('is a no-op when split time equals segment start', () => {
    const seg = addSeg(2, 4);
    useProjectStore.getState().splitSegment(seg.id, 2.0);
    expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(1);
  });

  it('is a no-op when split time is beyond segment end', () => {
    const seg = addSeg(0, 2);
    useProjectStore.getState().splitSegment(seg.id, 10.0);
    expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(1);
  });

  it('is a no-op for a nonexistent segment id', () => {
    addSeg(0, 2);
    useProjectStore.getState().splitSegment('no-such-id', 1.0);
    expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(1);
  });

  it('preserves sourceOffset in left segment', () => {
    const seg = addSeg(0, 4, 2.0);
    useProjectStore.getState().splitSegment(seg.id, 1.0);

    const segs = useProjectStore.getState().project.tracks[0].segments;
    const left = segs.find((s) => s.startTime === 0)!;
    expect(left.sourceOffset).toBe(2.0);
  });

  it('right segment sourceOffset accounts for original offset', () => {
    const seg = addSeg(0, 4, 2.0);
    useProjectStore.getState().splitSegment(seg.id, 1.0);

    const segs = useProjectStore.getState().project.tracks[0].segments;
    const right = segs.find((s) => s.startTime === 1.0)!;
    expect(right.sourceOffset).toBeCloseTo(3.0); // 2.0 + 1.0
  });

  it('left segment clears fadeOut, right segment clears fadeIn', () => {
    useProjectStore.getState().addTrack();
    const trackId = useProjectStore.getState().project.tracks[0].id;
    const seg = makeSegment({
      trackId,
      startTime: 0,
      duration: 4,
      fadeInDuration: 0.5,
      fadeOutDuration: 0.5,
    });
    useProjectStore.getState().addSegment(trackId, seg);
    useProjectStore.getState().splitSegment(seg.id, 2.0);

    const segs = useProjectStore.getState().project.tracks[0].segments;
    const left = segs.find((s) => s.startTime === 0)!;
    const right = segs.find((s) => s.startTime === 2.0)!;
    expect(left.fadeOutDuration).toBe(0);
    expect(right.fadeInDuration).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// trimSegment
// ---------------------------------------------------------------------------

describe('projectStore — trimSegment', () => {
  function addSeg(startTime: number, duration: number) {
    useProjectStore.getState().addTrack();
    const trackId = useProjectStore.getState().project.tracks[0].id;
    const seg = makeSegment({ trackId, startTime, duration, sourceOffset: 0 });
    useProjectStore.getState().addSegment(trackId, seg);
    return seg;
  }

  it('trims from the right — shortens duration', () => {
    const seg = addSeg(0, 4);
    useProjectStore.getState().trimSegment(seg.id, 'right', 2.0);

    const trimmed = useProjectStore.getState().project.tracks[0].segments[0];
    expect(trimmed.duration).toBeCloseTo(2.0);
    expect(trimmed.startTime).toBe(0);
  });

  it('trims from the left — shifts startTime and sourceOffset', () => {
    const seg = addSeg(1.0, 4.0);
    useProjectStore.getState().trimSegment(seg.id, 'left', 2.0);

    const trimmed = useProjectStore.getState().project.tracks[0].segments[0];
    expect(trimmed.duration).toBeCloseTo(2.0);
    // Original duration was 4, new is 2, so delta = 2
    expect(trimmed.startTime).toBeCloseTo(3.0); // 1 + 2
    expect(trimmed.sourceOffset).toBeCloseTo(2.0); // 0 + 2
  });

  it('enforces minimum duration of 0.01', () => {
    const seg = addSeg(0, 4);
    useProjectStore.getState().trimSegment(seg.id, 'right', -5);

    const trimmed = useProjectStore.getState().project.tracks[0].segments[0];
    expect(trimmed.duration).toBeCloseTo(0.01);
  });

  it('is a no-op for nonexistent segment', () => {
    addSeg(0, 4);
    useProjectStore.getState().trimSegment('nope', 'right', 1.0);

    expect(useProjectStore.getState().project.tracks[0].segments[0].duration).toBe(4);
  });

  it('accepts explicit newOffset when trimming left', () => {
    const seg = addSeg(0, 4);
    useProjectStore.getState().trimSegment(seg.id, 'left', 2.0, 1.0);

    const trimmed = useProjectStore.getState().project.tracks[0].segments[0];
    expect(trimmed.sourceOffset).toBeCloseTo(1.0);
  });

  it('updates project duration after trim', () => {
    const seg = addSeg(0, 10);
    useProjectStore.getState().trimSegment(seg.id, 'right', 3.0);

    expect(useProjectStore.getState().project.duration).toBeCloseTo(3.0);
  });
});

// ---------------------------------------------------------------------------
// setSegmentFade
// ---------------------------------------------------------------------------

describe('projectStore — setSegmentFade', () => {
  function addSeg() {
    useProjectStore.getState().addTrack();
    const trackId = useProjectStore.getState().project.tracks[0].id;
    const seg = makeSegment({ trackId, startTime: 0, duration: 4 });
    useProjectStore.getState().addSegment(trackId, seg);
    return seg;
  }

  it('sets fade-in duration', () => {
    const seg = addSeg();
    useProjectStore.getState().setSegmentFade(seg.id, 'in', 0.5);

    const updated = useProjectStore.getState().project.tracks[0].segments[0];
    expect(updated.fadeInDuration).toBeCloseTo(0.5);
  });

  it('sets fade-out duration', () => {
    const seg = addSeg();
    useProjectStore.getState().setSegmentFade(seg.id, 'out', 1.0);

    const updated = useProjectStore.getState().project.tracks[0].segments[0];
    expect(updated.fadeOutDuration).toBeCloseTo(1.0);
  });

  it('sets fade curve when provided', () => {
    const seg = addSeg();
    useProjectStore.getState().setSegmentFade(seg.id, 'in', 0.3, 'exponential');

    const updated = useProjectStore.getState().project.tracks[0].segments[0];
    expect(updated.fadeInCurve).toBe('exponential');
  });

  it('sets fade-out curve when provided', () => {
    const seg = addSeg();
    useProjectStore.getState().setSegmentFade(seg.id, 'out', 0.3, 'scurve');

    const updated = useProjectStore.getState().project.tracks[0].segments[0];
    expect(updated.fadeOutCurve).toBe('scurve');
  });

  it('clamps negative fade duration to 0', () => {
    const seg = addSeg();
    useProjectStore.getState().setSegmentFade(seg.id, 'in', -2);

    const updated = useProjectStore.getState().project.tracks[0].segments[0];
    expect(updated.fadeInDuration).toBe(0);
  });

  it('does not change curve when none is provided', () => {
    const seg = addSeg();
    useProjectStore.getState().setSegmentFade(seg.id, 'in', 0.5);

    const updated = useProjectStore.getState().project.tracks[0].segments[0];
    expect(updated.fadeInCurve).toBe('linear'); // default from makeSegment
  });
});

// ---------------------------------------------------------------------------
// clipboard edge cases — cut/copy/paste with multiple segments
// ---------------------------------------------------------------------------

describe('projectStore — clipboard multi-segment', () => {
  function setupTwoSegments() {
    useProjectStore.getState().addTrack();
    const trackId = useProjectStore.getState().project.tracks[0].id;
    const s1 = makeSegment({ trackId, startTime: 0, duration: 2 });
    const s2 = makeSegment({ trackId, startTime: 3, duration: 1 });
    useProjectStore.getState().addSegment(trackId, s1);
    useProjectStore.getState().addSegment(trackId, s2);
    useProjectStore.getState().selectSegment(s1.id);
    useProjectStore.getState().selectSegment(s2.id, true);
    return { trackId, s1, s2 };
  }

  it('copy captures multiple selected segments', () => {
    setupTwoSegments();
    useProjectStore.getState().copy();

    expect(useProjectStore.getState().clipboard.segments).toHaveLength(2);
  });

  it('cut removes all selected segments', () => {
    setupTwoSegments();
    useProjectStore.getState().cut();

    expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(0);
    expect(useProjectStore.getState().clipboard.segments).toHaveLength(2);
  });

  it('paste after copy preserves relative positions', () => {
    setupTwoSegments();
    useProjectStore.getState().copy();
    useProjectStore.getState().paste(10.0);

    const segs = useProjectStore.getState().project.tracks[0].segments;
    expect(segs).toHaveLength(4); // 2 original + 2 pasted

    // Pasted segments should be offset: first at 10, second at 13
    const pasted = segs.filter((s) => s.startTime >= 10);
    expect(pasted).toHaveLength(2);
    const starts = pasted.map((s) => s.startTime).sort((a, b) => a - b);
    expect(starts[1] - starts[0]).toBeCloseTo(3); // same relative gap
  });

  it('paste selects the newly pasted segments', () => {
    setupTwoSegments();
    useProjectStore.getState().copy();
    useProjectStore.getState().paste(10.0);

    const selection = useProjectStore.getState().selection;
    expect(selection).not.toBeNull();
    expect(selection!.segmentIds).toHaveLength(2);
  });

  it('clipboard sourceIds are populated correctly', () => {
    setupTwoSegments();
    useProjectStore.getState().copy();

    const cb = useProjectStore.getState().clipboard;
    expect(cb.sourceIds.length).toBeGreaterThan(0);
    expect(cb.sourceIds).toContain('src-1');
  });
});

// ---------------------------------------------------------------------------
// deleteSelected — edge cases
// ---------------------------------------------------------------------------

describe('projectStore — deleteSelected edge cases', () => {
  it('only deletes selected segments, leaving others', () => {
    useProjectStore.getState().addTrack();
    const trackId = useProjectStore.getState().project.tracks[0].id;
    const s1 = makeSegment({ trackId, startTime: 0, duration: 1 });
    const s2 = makeSegment({ trackId, startTime: 2, duration: 1 });
    const s3 = makeSegment({ trackId, startTime: 4, duration: 1 });
    useProjectStore.getState().addSegment(trackId, s1);
    useProjectStore.getState().addSegment(trackId, s2);
    useProjectStore.getState().addSegment(trackId, s3);

    // Select only s1 and s3
    useProjectStore.getState().selectSegment(s1.id);
    useProjectStore.getState().selectSegment(s3.id, true);
    useProjectStore.getState().deleteSelected();

    const remaining = useProjectStore.getState().project.tracks[0].segments;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(s2.id);
  });

  it('updates project duration after deletion', () => {
    useProjectStore.getState().addTrack();
    const trackId = useProjectStore.getState().project.tracks[0].id;
    const seg = makeSegment({ trackId, startTime: 0, duration: 10 });
    useProjectStore.getState().addSegment(trackId, seg);
    useProjectStore.getState().selectSegment(seg.id);
    useProjectStore.getState().deleteSelected();

    expect(useProjectStore.getState().project.duration).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// loadProjectState
// ---------------------------------------------------------------------------

describe('projectStore — loadProjectState', () => {
  it('replaces the entire project', () => {
    useProjectStore.getState().addTrack('Old Track');

    const newProject: TimelineProject = {
      id: 'new-proj-id',
      name: 'Loaded Project',
      sampleRate: 48000,
      tracks: [
        {
          id: 'tk-1',
          name: 'Loaded Track',
          segments: [],
          muted: false,
          solo: false,
          volume: 1,
          pan: 0,
        },
      ],
      masterEffects: [],
      duration: 0,
    };
    const sources = new Map<string, AudioSource>();
    const src = makeSource({ id: 'loaded-src' });
    sources.set(src.id, src);

    useProjectStore.getState().loadProjectState(newProject, sources);

    const state = useProjectStore.getState();
    expect(state.project.name).toBe('Loaded Project');
    expect(state.project.sampleRate).toBe(48000);
    expect(state.project.tracks).toHaveLength(1);
    expect(state.project.tracks[0].name).toBe('Loaded Track');
    expect(state.sources.has('loaded-src')).toBe(true);
  });

  it('resets selection, clipboard, playhead, and isPlaying', () => {
    // Set up some state first
    useProjectStore.getState().addTrack();
    useProjectStore.getState().setPlayheadPosition(5.0);
    useProjectStore.getState().setIsPlaying(true);

    const newProject: TimelineProject = {
      id: 'p2',
      name: 'P2',
      sampleRate: 44100,
      tracks: [],
      masterEffects: [],
      duration: 0,
    };

    useProjectStore.getState().loadProjectState(newProject, new Map());

    const state = useProjectStore.getState();
    expect(state.selection).toBeNull();
    expect(state.clipboard.segments).toHaveLength(0);
    expect(state.playheadPosition).toBe(0);
    expect(state.isPlaying).toBe(false);
  });

  it('recomputes project duration from loaded tracks', () => {
    const seg = makeSegment({
      trackId: 'tk-1',
      startTime: 2,
      duration: 5,
    });

    const newProject: TimelineProject = {
      id: 'p3',
      name: 'P3',
      sampleRate: 44100,
      tracks: [
        {
          id: 'tk-1',
          name: 'T1',
          segments: [seg],
          muted: false,
          solo: false,
          volume: 1,
          pan: 0,
        },
      ],
      masterEffects: [],
      duration: 0, // pass 0 — should be recomputed
    };

    useProjectStore.getState().loadProjectState(newProject, new Map());

    expect(useProjectStore.getState().project.duration).toBe(7); // 2 + 5
  });
});
