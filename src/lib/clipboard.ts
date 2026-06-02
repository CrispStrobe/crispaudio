// ---------------------------------------------------------------------------
// CrispAudio — clipboard helpers
// Pure functions; store integration lives in projectStore.
// ---------------------------------------------------------------------------

import type { AudioSegment, ClipboardState } from '../types/audio';

function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Build clipboard state for a cut operation.
 * Segments are stored as-is (the caller removes them from the project).
 */
export function cutSegments(segments: AudioSegment[]): ClipboardState {
  return {
    operation: 'cut',
    segments: segments.map((s) => ({ ...s })),
    sourceIds: Array.from(new Set(segments.map((s) => s.sourceId))),
  };
}

/**
 * Build clipboard state for a copy operation (deep-clone segment data).
 */
export function copySegments(segments: AudioSegment[]): ClipboardState {
  return {
    operation: 'copy',
    segments: segments.map((s) => ({
      ...s,
      effects: s.effects.map((e) => ({ ...e, params: { ...e.params } })),
    })),
    sourceIds: Array.from(new Set(segments.map((s) => s.sourceId))),
  };
}

/**
 * Produce new segments placed at `atTime` on `trackId`.
 *
 * When pasting multiple segments the relative time distances between them are
 * preserved.  The earliest segment's startTime is aligned to `atTime`.
 *
 * If `trackId` is provided the paste targets that specific track; otherwise
 * each segment keeps its original trackId (multi-track paste).
 */
export function pasteSegments(
  clipboard: ClipboardState,
  atTime: number,
  trackId?: string,
): AudioSegment[] {
  if (!clipboard.segments.length) return [];

  const minStart = Math.min(...clipboard.segments.map((s) => s.startTime));
  const timeOffset = atTime - minStart;

  return clipboard.segments.map((seg) => ({
    ...seg,
    id: uuid(),
    trackId: trackId ?? seg.trackId,
    startTime: Math.max(0, seg.startTime + timeOffset),
    effects: seg.effects.map((e) => ({ ...e, params: { ...e.params } })),
  }));
}
