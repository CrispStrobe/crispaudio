// ---------------------------------------------------------------------------
// projectStore — replaceSegmentSource and send-to-timeline workflow tests
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../../../src/stores/projectStore';
import type { AudioSegment, AudioSource } from '../../../src/types/audio';

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
// importAudioSource — send-to-timeline workflow
// ---------------------------------------------------------------------------

describe('projectStore — importAudioSource (send-to-timeline)', () => {
  it('creates a track and segment when project has no tracks', () => {
    const src = makeSource();
    useProjectStore.getState().importAudioSource(src);
    const { project, sources } = useProjectStore.getState();
    expect(project.tracks).toHaveLength(1);
    expect(project.tracks[0].segments).toHaveLength(1);
    expect(sources.has(src.id)).toBe(true);
  });

  it('places segment on existing track when one exists', () => {
    useProjectStore.getState().addTrack('Track 1');
    const src = makeSource();
    useProjectStore.getState().importAudioSource(src);
    const { project } = useProjectStore.getState();
    expect(project.tracks).toHaveLength(1);
    expect(project.tracks[0].segments).toHaveLength(1);
  });

  it('places segment at specified startTime', () => {
    useProjectStore.getState().addTrack('Track 1');
    const src = makeSource();
    useProjectStore.getState().importAudioSource(src, 5.0);
    const seg = useProjectStore.getState().project.tracks[0].segments[0];
    expect(seg.startTime).toBe(5.0);
  });

  it('segment duration matches source duration', () => {
    useProjectStore.getState().addTrack('Track 1');
    const src = makeSource({ duration: 3.5 });
    useProjectStore.getState().importAudioSource(src);
    const seg = useProjectStore.getState().project.tracks[0].segments[0];
    expect(seg.duration).toBe(3.5);
  });

  it('segment references the source by ID', () => {
    useProjectStore.getState().addTrack('Track 1');
    const src = makeSource();
    useProjectStore.getState().importAudioSource(src);
    const seg = useProjectStore.getState().project.tracks[0].segments[0];
    expect(seg.sourceId).toBe(src.id);
  });

  it('segment inherits source name', () => {
    useProjectStore.getState().addTrack('Track 1');
    const src = makeSource({ name: 'SFX - 12:00:00' });
    useProjectStore.getState().importAudioSource(src);
    const seg = useProjectStore.getState().project.tracks[0].segments[0];
    expect(seg.name).toBe('SFX - 12:00:00');
  });

  it('updates project duration after import', () => {
    useProjectStore.getState().addTrack('Track 1');
    const src = makeSource({ duration: 4.0 });
    useProjectStore.getState().importAudioSource(src, 2.0);
    expect(useProjectStore.getState().project.duration).toBe(6.0);
  });

  it('multiple imports create multiple segments', () => {
    const src1 = makeSource({ name: 'SFX 1' });
    const src2 = makeSource({ name: 'Voice 1' });
    useProjectStore.getState().importAudioSource(src1, 0);
    useProjectStore.getState().importAudioSource(src2, 2);
    const { project, sources } = useProjectStore.getState();
    expect(project.tracks[0].segments).toHaveLength(2);
    expect(sources.size).toBe(2);
  });

  it('clamps negative startTime to 0', () => {
    useProjectStore.getState().addTrack('Track 1');
    const src = makeSource();
    useProjectStore.getState().importAudioSource(src, -5);
    const seg = useProjectStore.getState().project.tracks[0].segments[0];
    expect(seg.startTime).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// replaceSegmentSource
// ---------------------------------------------------------------------------

describe('projectStore — replaceSegmentSource', () => {
  it('replaces a segment source with a new one', () => {
    const originalSource = makeSource({ id: 'original-src' });
    useProjectStore.getState().importAudioSource(originalSource);
    const segId = useProjectStore.getState().project.tracks[0].segments[0].id;

    const newSource = makeSource({ id: 'new-src', name: 'Voice FX', duration: 1.5 });
    useProjectStore.getState().replaceSegmentSource(segId, newSource);

    const state = useProjectStore.getState();
    const seg = state.project.tracks[0].segments[0];
    expect(seg.sourceId).toBe('new-src');
    expect(seg.duration).toBe(1.5);
    expect(seg.sourceOffset).toBe(0);
  });

  it('registers the new source in the sources map', () => {
    const originalSource = makeSource({ id: 'original-src' });
    useProjectStore.getState().importAudioSource(originalSource);
    const segId = useProjectStore.getState().project.tracks[0].segments[0].id;

    const newSource = makeSource({ id: 'new-src' });
    useProjectStore.getState().replaceSegmentSource(segId, newSource);

    expect(useProjectStore.getState().sources.has('new-src')).toBe(true);
  });

  it('preserves the original source in sources map', () => {
    const originalSource = makeSource({ id: 'original-src' });
    useProjectStore.getState().importAudioSource(originalSource);
    const segId = useProjectStore.getState().project.tracks[0].segments[0].id;

    const newSource = makeSource({ id: 'new-src' });
    useProjectStore.getState().replaceSegmentSource(segId, newSource);

    expect(useProjectStore.getState().sources.has('original-src')).toBe(true);
    expect(useProjectStore.getState().sources.has('new-src')).toBe(true);
  });

  it('does not affect other segments on the same track', () => {
    const src1 = makeSource({ id: 'src-1' });
    const src2 = makeSource({ id: 'src-2' });
    useProjectStore.getState().importAudioSource(src1, 0);
    useProjectStore.getState().importAudioSource(src2, 2);

    const seg1Id = useProjectStore.getState().project.tracks[0].segments[0].id;
    const newSource = makeSource({ id: 'new-src' });
    useProjectStore.getState().replaceSegmentSource(seg1Id, newSource);

    const segments = useProjectStore.getState().project.tracks[0].segments;
    expect(segments[0].sourceId).toBe('new-src');
    expect(segments[1].sourceId).toBe('src-2');
  });

  it('resets sourceOffset to 0', () => {
    const src = makeSource({ id: 'src-1' });
    useProjectStore.getState().importAudioSource(src);
    const segId = useProjectStore.getState().project.tracks[0].segments[0].id;
    // Manually set a non-zero sourceOffset
    useProjectStore.getState().trimSegment(segId, 'left', 0.5, 0.3);

    const newSource = makeSource({ id: 'new-src', duration: 2.0 });
    useProjectStore.getState().replaceSegmentSource(segId, newSource);

    const seg = useProjectStore.getState().project.tracks[0].segments[0];
    expect(seg.sourceOffset).toBe(0);
    expect(seg.duration).toBe(2.0);
  });

  it('updates project duration when new source is longer', () => {
    const src = makeSource({ id: 'src-1', duration: 1.0 });
    useProjectStore.getState().importAudioSource(src, 0);
    expect(useProjectStore.getState().project.duration).toBe(1.0);

    const segId = useProjectStore.getState().project.tracks[0].segments[0].id;
    const newSource = makeSource({ id: 'new-src', duration: 5.0 });
    useProjectStore.getState().replaceSegmentSource(segId, newSource);

    expect(useProjectStore.getState().project.duration).toBe(5.0);
  });

  it('no-op when segmentId does not exist', () => {
    const src = makeSource({ id: 'src-1' });
    useProjectStore.getState().importAudioSource(src, 0);
    const before = useProjectStore.getState().project.tracks[0].segments[0];

    const newSource = makeSource({ id: 'new-src' });
    useProjectStore.getState().replaceSegmentSource('nonexistent', newSource);

    const after = useProjectStore.getState().project.tracks[0].segments[0];
    expect(after.sourceId).toBe(before.sourceId);
    // But the new source is still registered
    expect(useProjectStore.getState().sources.has('new-src')).toBe(true);
  });
});
