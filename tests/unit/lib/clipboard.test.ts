// ---------------------------------------------------------------------------
// clipboard utility unit tests
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { copySegments, cutSegments, pasteSegments } from '../../../src/lib/clipboard';
import type { AudioSegment, ClipboardState } from '../../../src/types/audio';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _idCounter = 0;
function makeSegment(overrides: Partial<AudioSegment> = {}): AudioSegment {
  _idCounter++;
  return {
    id: `seg-${_idCounter}`,
    trackId: 'track-1',
    sourceId: 'source-1',
    startTime: 0,
    duration: 2,
    sourceOffset: 0,
    fadeInDuration: 0,
    fadeOutDuration: 0,
    fadeInCurve: 'linear',
    fadeOutCurve: 'linear',
    effects: [],
    gain: 1,
    color: '#aabbcc',
    name: 'segment',
    ...overrides,
  };
}

function makeSegmentWithEffect(): AudioSegment {
  return makeSegment({
    effects: [
      { type: 'reverb', enabled: true, params: { size: 0.5, decay: 0.4 } },
    ],
  });
}

// ---------------------------------------------------------------------------
// copySegments
// ---------------------------------------------------------------------------

describe('copySegments', () => {
  it('returns clipboard with operation "copy"', () => {
    const cb = copySegments([makeSegment()]);
    expect(cb.operation).toBe('copy');
  });

  it('stores all supplied segments', () => {
    const segs = [makeSegment(), makeSegment()];
    const cb = copySegments(segs);
    expect(cb.segments).toHaveLength(2);
  });

  it('returns empty sourceIds for empty input', () => {
    expect(copySegments([]).sourceIds).toHaveLength(0);
  });

  it('de-duplicates sourceIds', () => {
    const s1 = makeSegment({ sourceId: 'same' });
    const s2 = makeSegment({ sourceId: 'same' });
    const cb = copySegments([s1, s2]);
    expect(cb.sourceIds).toHaveLength(1);
    expect(cb.sourceIds[0]).toBe('same');
  });

  it('collects distinct sourceIds', () => {
    const s1 = makeSegment({ sourceId: 'a' });
    const s2 = makeSegment({ sourceId: 'b' });
    const cb = copySegments([s1, s2]);
    expect(new Set(cb.sourceIds)).toEqual(new Set(['a', 'b']));
  });

  it('deep-clones segment effects (changes to original do not affect clipboard)', () => {
    const seg = makeSegmentWithEffect();
    const cb = copySegments([seg]);
    seg.effects[0].params['size'] = 999;
    expect(cb.segments[0].effects[0].params['size']).toBe(0.5);
  });

  it('returns an empty segments array for empty input', () => {
    expect(copySegments([]).segments).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// cutSegments
// ---------------------------------------------------------------------------

describe('cutSegments', () => {
  it('returns clipboard with operation "cut"', () => {
    const cb = cutSegments([makeSegment()]);
    expect(cb.operation).toBe('cut');
  });

  it('stores all supplied segments', () => {
    const segs = [makeSegment(), makeSegment(), makeSegment()];
    const cb = cutSegments(segs);
    expect(cb.segments).toHaveLength(3);
  });

  it('de-duplicates sourceIds', () => {
    const s1 = makeSegment({ sourceId: 'x' });
    const s2 = makeSegment({ sourceId: 'x' });
    expect(cutSegments([s1, s2]).sourceIds).toHaveLength(1);
  });

  it('each segment in clipboard is a copy, not the same reference', () => {
    const seg = makeSegment();
    const cb = cutSegments([seg]);
    expect(cb.segments[0]).not.toBe(seg);
  });

  it('preserves all segment fields', () => {
    const seg = makeSegment({ startTime: 4.5, duration: 1.5, gain: 0.8 });
    const cb = cutSegments([seg]);
    expect(cb.segments[0].startTime).toBe(4.5);
    expect(cb.segments[0].duration).toBe(1.5);
    expect(cb.segments[0].gain).toBe(0.8);
  });
});

// ---------------------------------------------------------------------------
// pasteSegments
// ---------------------------------------------------------------------------

describe('pasteSegments', () => {
  function clipboard(segs: AudioSegment[]): ClipboardState {
    return { operation: 'copy', segments: segs, sourceIds: [] };
  }

  it('returns an empty array for an empty clipboard', () => {
    const result = pasteSegments({ operation: null, segments: [], sourceIds: [] }, 2.0);
    expect(result).toHaveLength(0);
  });

  it('gives each pasted segment a new unique ID', () => {
    const seg = makeSegment({ startTime: 0 });
    const result = pasteSegments(clipboard([seg]), 1.0);
    expect(result[0].id).not.toBe(seg.id);
  });

  it('aligns the earliest segment to atTime', () => {
    const seg = makeSegment({ startTime: 2.0 });
    const result = pasteSegments(clipboard([seg]), 5.0);
    // minStart = 2.0, offset = 5.0 - 2.0 = 3.0 → new startTime = 2.0 + 3.0 = 5.0
    expect(result[0].startTime).toBeCloseTo(5.0);
  });

  it('preserves relative time offsets between multiple segments', () => {
    const s1 = makeSegment({ startTime: 0, duration: 1 });
    const s2 = makeSegment({ startTime: 3, duration: 1 });
    const result = pasteSegments(clipboard([s1, s2]), 2.0);
    const gap = result[1].startTime - result[0].startTime;
    expect(gap).toBeCloseTo(3.0); // original gap preserved
  });

  it('preserves duration of pasted segments', () => {
    const seg = makeSegment({ startTime: 0, duration: 4.5 });
    const result = pasteSegments(clipboard([seg]), 1.0);
    expect(result[0].duration).toBeCloseTo(4.5);
  });

  it('deep-clones effects so originals in clipboard are unaffected', () => {
    const seg = makeSegmentWithEffect();
    const cb = clipboard([seg]);
    const result = pasteSegments(cb, 0.0);
    result[0].effects[0].params['size'] = 999;
    expect(cb.segments[0].effects[0].params['size']).toBe(0.5);
  });

  it('targets the given trackId when provided', () => {
    const seg = makeSegment({ trackId: 'track-original', startTime: 0 });
    const result = pasteSegments(clipboard([seg]), 0.0, 'track-new');
    expect(result[0].trackId).toBe('track-new');
  });

  it('keeps original trackId when no trackId override is given', () => {
    const seg = makeSegment({ trackId: 'track-original', startTime: 0 });
    const result = pasteSegments(clipboard([seg]), 0.0);
    expect(result[0].trackId).toBe('track-original');
  });

  it('clamps pasted startTime to minimum 0 when offset would go negative', () => {
    const seg = makeSegment({ startTime: 10 });
    const result = pasteSegments(clipboard([seg]), 0.0);
    // startTime = max(0, 10 + (0 - 10)) = max(0, 0) = 0
    expect(result[0].startTime).toBeGreaterThanOrEqual(0);
  });

  it('generates unique IDs for each segment in a batch paste', () => {
    const segs = [
      makeSegment({ startTime: 0 }),
      makeSegment({ startTime: 1 }),
      makeSegment({ startTime: 2 }),
    ];
    const result = pasteSegments(clipboard(segs), 0.0);
    const ids = result.map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
