// ---------------------------------------------------------------------------
// projectStore unit tests
// ---------------------------------------------------------------------------
// The store is a Zustand singleton; we reset it before each test.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../../../src/stores/projectStore';
import type { AudioSegment } from '../../../src/types/audio';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSegment(overrides: Partial<AudioSegment> = {}): AudioSegment {
  return {
    id: crypto.randomUUID(),
    trackId: '',          // caller must set or override
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

function resetStore(): void {
  // Wipe the project to a pristine empty state
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

beforeEach(() => {
  resetStore();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('projectStore — initial state', () => {
  it('project has an empty tracks array', () => {
    expect(useProjectStore.getState().project.tracks).toHaveLength(0);
  });

  it('clipboard is empty', () => {
    const cb = useProjectStore.getState().clipboard;
    expect(cb.operation).toBeNull();
    expect(cb.segments).toHaveLength(0);
  });

  it('selection is null', () => {
    expect(useProjectStore.getState().selection).toBeNull();
  });

  it('playhead starts at 0', () => {
    expect(useProjectStore.getState().playheadPosition).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// addTrack / removeTrack
// ---------------------------------------------------------------------------

describe('projectStore — addTrack', () => {
  it('adds a track to the project', () => {
    useProjectStore.getState().addTrack();
    expect(useProjectStore.getState().project.tracks).toHaveLength(1);
  });

  it('uses the supplied name', () => {
    useProjectStore.getState().addTrack('My Track');
    expect(useProjectStore.getState().project.tracks[0].name).toBe('My Track');
  });

  it('auto-generates a name when none is given', () => {
    useProjectStore.getState().addTrack();
    const name = useProjectStore.getState().project.tracks[0].name;
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });

  it('adding multiple tracks increments their auto-names', () => {
    useProjectStore.getState().addTrack();
    useProjectStore.getState().addTrack();
    const tracks = useProjectStore.getState().project.tracks;
    expect(tracks).toHaveLength(2);
    expect(tracks[0].id).not.toBe(tracks[1].id);
  });

  it('new track starts with an empty segments array', () => {
    useProjectStore.getState().addTrack();
    expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(0);
  });
});

describe('projectStore — removeTrack', () => {
  it('removes a track by ID', () => {
    useProjectStore.getState().addTrack('A');
    useProjectStore.getState().addTrack('B');
    const id = useProjectStore.getState().project.tracks[0].id;
    useProjectStore.getState().removeTrack(id);
    expect(useProjectStore.getState().project.tracks).toHaveLength(1);
    expect(useProjectStore.getState().project.tracks[0].name).toBe('B');
  });

  it('is a no-op for an unknown track ID', () => {
    useProjectStore.getState().addTrack();
    useProjectStore.getState().removeTrack('does-not-exist');
    expect(useProjectStore.getState().project.tracks).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// addSegment / removeSegment
// ---------------------------------------------------------------------------

describe('projectStore — addSegment', () => {
  it('adds a segment to the correct track', () => {
    useProjectStore.getState().addTrack();
    const trackId = useProjectStore.getState().project.tracks[0].id;
    const seg = makeSegment({ trackId, startTime: 1.0, duration: 2.0 });
    useProjectStore.getState().addSegment(trackId, seg);

    const segments = useProjectStore.getState().project.tracks[0].segments;
    expect(segments).toHaveLength(1);
    expect(segments[0].id).toBe(seg.id);
  });

  it('updates the project duration', () => {
    useProjectStore.getState().addTrack();
    const trackId = useProjectStore.getState().project.tracks[0].id;
    const seg = makeSegment({ trackId, startTime: 3.0, duration: 2.0 });
    useProjectStore.getState().addSegment(trackId, seg);
    expect(useProjectStore.getState().project.duration).toBe(5.0);
  });
});

describe('projectStore — removeSegment', () => {
  it('removes a segment by ID', () => {
    useProjectStore.getState().addTrack();
    const trackId = useProjectStore.getState().project.tracks[0].id;
    const seg = makeSegment({ trackId });
    useProjectStore.getState().addSegment(trackId, seg);
    useProjectStore.getState().removeSegment(seg.id);
    expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(0);
  });

  it('is a no-op for unknown segment ID', () => {
    useProjectStore.getState().addTrack();
    const trackId = useProjectStore.getState().project.tracks[0].id;
    const seg = makeSegment({ trackId });
    useProjectStore.getState().addSegment(trackId, seg);
    useProjectStore.getState().removeSegment('phantom-id');
    expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// moveSegment
// ---------------------------------------------------------------------------

describe('projectStore — moveSegment', () => {
  it('changes the startTime of a segment', () => {
    useProjectStore.getState().addTrack();
    const trackId = useProjectStore.getState().project.tracks[0].id;
    const seg = makeSegment({ trackId, startTime: 0 });
    useProjectStore.getState().addSegment(trackId, seg);
    useProjectStore.getState().moveSegment(seg.id, 5.0);

    const moved = useProjectStore.getState().project.tracks[0].segments[0];
    expect(moved.startTime).toBe(5.0);
  });

  it('clamps startTime to minimum of 0', () => {
    useProjectStore.getState().addTrack();
    const trackId = useProjectStore.getState().project.tracks[0].id;
    const seg = makeSegment({ trackId, startTime: 2.0 });
    useProjectStore.getState().addSegment(trackId, seg);
    useProjectStore.getState().moveSegment(seg.id, -10);

    const moved = useProjectStore.getState().project.tracks[0].segments[0];
    expect(moved.startTime).toBe(0);
  });

  it('can move segment to another track', () => {
    useProjectStore.getState().addTrack('T1');
    useProjectStore.getState().addTrack('T2');
    const t1 = useProjectStore.getState().project.tracks[0];
    const t2 = useProjectStore.getState().project.tracks[1];

    const seg = makeSegment({ trackId: t1.id });
    useProjectStore.getState().addSegment(t1.id, seg);
    useProjectStore.getState().moveSegment(seg.id, 1.0, t2.id);

    expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(0);
    expect(useProjectStore.getState().project.tracks[1].segments).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// splitSegment
// ---------------------------------------------------------------------------

describe('projectStore — splitSegment', () => {
  function addSegAt(startTime: number, duration: number) {
    useProjectStore.getState().addTrack();
    const trackId = useProjectStore.getState().project.tracks[0].id;
    const seg = makeSegment({ trackId, startTime, duration });
    useProjectStore.getState().addSegment(trackId, seg);
    return { trackId, seg };
  }

  it('creates two segments from one', () => {
    const { seg } = addSegAt(0, 4.0);
    useProjectStore.getState().splitSegment(seg.id, 2.0); // split at t=2

    const segs = useProjectStore.getState().project.tracks[0].segments;
    expect(segs).toHaveLength(2);
  });

  it('left segment ends at split point', () => {
    const { seg } = addSegAt(0, 4.0);
    useProjectStore.getState().splitSegment(seg.id, 2.0);
    const segs = useProjectStore.getState().project.tracks[0].segments;
    const left = segs.find((s) => s.startTime === 0)!;
    expect(left.duration).toBeCloseTo(2.0);
  });

  it('right segment starts at split point', () => {
    const { seg } = addSegAt(0, 4.0);
    useProjectStore.getState().splitSegment(seg.id, 2.0);
    const segs = useProjectStore.getState().project.tracks[0].segments;
    const right = segs.find((s) => s.startTime === 2.0)!;
    expect(right).toBeDefined();
    expect(right.duration).toBeCloseTo(2.0);
  });

  it('both halves get new unique IDs', () => {
    const { seg } = addSegAt(0, 4.0);
    useProjectStore.getState().splitSegment(seg.id, 2.0);
    const segs = useProjectStore.getState().project.tracks[0].segments;
    expect(segs[0].id).not.toBe(seg.id);
    expect(segs[1].id).not.toBe(seg.id);
    expect(segs[0].id).not.toBe(segs[1].id);
  });

  it('is a no-op when split time is outside the segment', () => {
    const { seg } = addSegAt(1.0, 2.0);
    useProjectStore.getState().splitSegment(seg.id, 0.5); // before start
    expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(1);
  });

  it('preserves the source offset in the right segment', () => {
    const { seg } = addSegAt(0, 4.0);
    useProjectStore.getState().splitSegment(seg.id, 2.0);
    const segs = useProjectStore.getState().project.tracks[0].segments;
    const right = segs.find((s) => s.startTime === 2.0)!;
    expect(right.sourceOffset).toBeCloseTo(seg.sourceOffset + 2.0);
  });
});

// ---------------------------------------------------------------------------
// cut / copy / paste
// ---------------------------------------------------------------------------

function setupTrackWithSegment() {
  useProjectStore.getState().addTrack();
  const trackId = useProjectStore.getState().project.tracks[0].id;
  const seg = makeSegment({ trackId, startTime: 1.0, duration: 3.0 });
  useProjectStore.getState().addSegment(trackId, seg);
  useProjectStore.getState().selectSegment(seg.id);
  return { trackId, seg };
}

describe('projectStore — copy', () => {
  it('populates clipboard with operation=copy', () => {
    setupTrackWithSegment();
    useProjectStore.getState().copy();
    expect(useProjectStore.getState().clipboard.operation).toBe('copy');
  });

  it('clipboard contains the selected segment', () => {
    const { seg } = setupTrackWithSegment();
    useProjectStore.getState().copy();
    const cb = useProjectStore.getState().clipboard;
    expect(cb.segments).toHaveLength(1);
    expect(cb.segments[0].id).toBe(seg.id);
  });

  it('does NOT remove the segment from the timeline', () => {
    setupTrackWithSegment();
    useProjectStore.getState().copy();
    expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(1);
  });

  it('is a no-op when nothing is selected', () => {
    useProjectStore.getState().addTrack();
    useProjectStore.getState().copy();
    expect(useProjectStore.getState().clipboard.segments).toHaveLength(0);
  });
});

describe('projectStore — cut', () => {
  it('populates clipboard with operation=cut', () => {
    setupTrackWithSegment();
    useProjectStore.getState().cut();
    expect(useProjectStore.getState().clipboard.operation).toBe('cut');
  });

  it('removes the selected segment from the timeline', () => {
    setupTrackWithSegment();
    useProjectStore.getState().cut();
    expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(0);
  });

  it('stores the segment in the clipboard', () => {
    const { seg } = setupTrackWithSegment();
    useProjectStore.getState().cut();
    expect(useProjectStore.getState().clipboard.segments[0].id).toBe(seg.id);
  });

  it('clears the selection after cut', () => {
    setupTrackWithSegment();
    useProjectStore.getState().cut();
    expect(useProjectStore.getState().selection).toBeNull();
  });
});

describe('projectStore — paste', () => {
  it('inserts clipboard segment(s) at the playhead position', () => {
    setupTrackWithSegment();
    useProjectStore.getState().copy();
    useProjectStore.getState().setPlayheadPosition(5.0);
    useProjectStore.getState().paste();

    const segs = useProjectStore.getState().project.tracks[0].segments;
    expect(segs).toHaveLength(2);
    // The pasted segment should be at t=5.0
    const pasted = segs.find((s) => Math.abs(s.startTime - 5.0) < 0.001);
    expect(pasted).toBeDefined();
  });

  it('pasted segments get new unique IDs', () => {
    setupTrackWithSegment();
    useProjectStore.getState().copy();
    useProjectStore.getState().paste(3.0);

    const segs = useProjectStore.getState().project.tracks[0].segments;
    expect(segs[0].id).not.toBe(segs[1].id);
  });

  it('is a no-op when clipboard is empty', () => {
    setupTrackWithSegment();
    useProjectStore.getState().paste(2.0);
    // nothing was in clipboard, segment count unchanged
    expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(1);
  });

  it('preserves duration of pasted segment', () => {
    setupTrackWithSegment();
    useProjectStore.getState().copy();
    useProjectStore.getState().paste(0.0);

    const segs = useProjectStore.getState().project.tracks[0].segments;
    const pasted = segs.find((s) => s.startTime === 0.0);
    expect(pasted?.duration).toBeCloseTo(3.0);
  });

  it('pastes at the explicit atTime argument', () => {
    setupTrackWithSegment();
    useProjectStore.getState().copy();
    useProjectStore.getState().paste(10.0);

    const segs = useProjectStore.getState().project.tracks[0].segments;
    const pasted = segs.find((s) => Math.abs(s.startTime - 10.0) < 0.001);
    expect(pasted).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// deleteSelected
// ---------------------------------------------------------------------------

describe('projectStore — deleteSelected', () => {
  it('removes all selected segments', () => {
    useProjectStore.getState().addTrack();
    const trackId = useProjectStore.getState().project.tracks[0].id;

    const s1 = makeSegment({ trackId, startTime: 0, duration: 1 });
    const s2 = makeSegment({ trackId, startTime: 2, duration: 1 });
    useProjectStore.getState().addSegment(trackId, s1);
    useProjectStore.getState().addSegment(trackId, s2);

    // Select both by using selectSegment with addToSelection
    useProjectStore.getState().selectSegment(s1.id);
    useProjectStore.getState().selectSegment(s2.id, true);

    useProjectStore.getState().deleteSelected();
    expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(0);
  });

  it('clears the selection after deletion', () => {
    setupTrackWithSegment();
    useProjectStore.getState().deleteSelected();
    expect(useProjectStore.getState().selection).toBeNull();
  });

  it('is a no-op when nothing is selected', () => {
    useProjectStore.getState().addTrack();
    const trackId = useProjectStore.getState().project.tracks[0].id;
    const seg = makeSegment({ trackId });
    useProjectStore.getState().addSegment(trackId, seg);
    // No selection
    useProjectStore.getState().deleteSelected();
    expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(1);
  });
});
