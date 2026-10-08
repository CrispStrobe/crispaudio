// ---------------------------------------------------------------------------
// CrispAudio — useTimeline
// Coordinate-conversion, hit-testing, drag state, and keyboard shortcuts
// for the timeline canvas.
// ---------------------------------------------------------------------------

import { projectClips } from '../lib/projectEdits';
import { snapClipStart } from '../lib/timelineSnap';
import { deleteSelection, nudgeSelection } from '../lib/timelineEditing';
import { useRef, useCallback, useEffect } from 'react';
import type { AudioSegment, TimelineTrack } from '../types/audio';
import { projectHistoryGesture, useProjectStore } from '../stores/projectStore';

// ── Constants ─────────────────────────────────────────────────────────────────

export const TRACK_HEADER_WIDTH = 160; // px — left panel width
export const TRACK_HEIGHT = 80; // px per track
export const RULER_HEIGHT = 28; // px

// How close to a segment edge (in px) to trigger a trim interaction
const TRIM_HANDLE_PX = 10;
// Fade handle height zone (top strip of segment)
const FADE_HANDLE_PX = 14;

// ── Types ─────────────────────────────────────────────────────────────────────

export type HitZone =
  | { type: 'empty'; trackIndex: number; time: number }
  | { type: 'segment'; segment: AudioSegment; trackIndex: number }
  | { type: 'trim-left'; segment: AudioSegment; trackIndex: number }
  | { type: 'trim-right'; segment: AudioSegment; trackIndex: number }
  | { type: 'fade-in'; segment: AudioSegment; trackIndex: number }
  | { type: 'fade-out'; segment: AudioSegment; trackIndex: number };

export type DragState =
  | { kind: 'none' }
  | {
      kind: 'move';
      segmentId: string;
      originalStartTime: number;
      originalTrackIndex: number;
      startX: number;
      startY: number;
    }
  | {
      kind: 'trim-left';
      segmentId: string;
      originalStartTime: number;
      originalDuration: number;
      originalOffset: number;
      startX: number;
    }
  | {
      kind: 'trim-right';
      segmentId: string;
      originalDuration: number;
      startX: number;
    }
  | {
      kind: 'fade-in';
      segmentId: string;
      originalFadeDuration: number;
      startX: number;
    }
  | {
      kind: 'fade-out';
      segmentId: string;
      originalFadeDuration: number;
      startX: number;
    };

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTimeline() {
  const trackHeight = useProjectStore((state) => state.trackHeight);
  const zoomLevel = useProjectStore((state) => state.zoomLevel);
  const scrollOffset = useProjectStore((state) => state.scrollOffset);
  const snapEnabled = useProjectStore((state) => state.snapEnabled);
  const dragState = useRef<DragState>({ kind: 'none' });

  // ── Coordinate conversion ─────────────────────────────────────────────────

  const pixelsToTime = useCallback(
    (px: number): number => {
      return scrollOffset + px / zoomLevel;
    },
    [scrollOffset, zoomLevel],
  );

  const timeToPixels = useCallback(
    (time: number): number => {
      return (time - scrollOffset) * zoomLevel;
    },
    [scrollOffset, zoomLevel],
  );

  const canvasXToTime = useCallback(
    (canvasX: number): number => {
      // canvasX is relative to the canvas left edge (track header already excluded)
      return pixelsToTime(canvasX);
    },
    [pixelsToTime],
  );

  const canvasYToTrackIndex = useCallback(
    (canvasY: number): number => {
      return Math.floor(canvasY / trackHeight);
    },
    [trackHeight],
  );

  // ── Snapping ──────────────────────────────────────────────────────────────

  const snapTime = useCallback(
    (time: number): number => {
      if (!snapEnabled) return time;
      // Snap to 0.1s grid (adjustable later)
      const grid = useProjectStore.getState().project.snapGrid??0.1;
      if(!grid)return time;
      return Math.round(time / grid) * grid;
    },
    [snapEnabled],
  );

  // ── Hit testing ───────────────────────────────────────────────────────────

  const hitTest = useCallback(
    (canvasX: number, canvasY: number): HitZone => {
      const time = canvasXToTime(canvasX);
      const trackIndex = canvasYToTrackIndex(canvasY);
      const { tracks } = useProjectStore.getState().project;

      if (trackIndex < 0 || trackIndex >= tracks.length) {
        return { type: 'empty', trackIndex, time };
      }

      const track: TimelineTrack = tracks[trackIndex];
      const localY = canvasY - trackIndex * useProjectStore.getState().trackHeight;

      // Test each segment in reverse order (top-most rendered last = highest z)
      for (let i = track.segments.length - 1; i >= 0; i--) {
        const seg = track.segments[i];
        const segLeft = timeToPixels(seg.startTime);
        const segRight = timeToPixels(seg.startTime + seg.duration);

        if (canvasX < segLeft || canvasX > segRight) continue;

        const distLeft = canvasX - segLeft;
        const distRight = segRight - canvasX;

        // Fade-in handle: top strip on the left side
        if (localY < FADE_HANDLE_PX && distLeft < timeToPixels(seg.startTime + seg.fadeInDuration) - segLeft + TRIM_HANDLE_PX) {
          return { type: 'fade-in', segment: seg, trackIndex };
        }

        // Fade-out handle: top strip on the right side
        const fadeOutStartPx = timeToPixels(seg.startTime + seg.duration - seg.fadeOutDuration);
        if (localY < FADE_HANDLE_PX && canvasX >= fadeOutStartPx - TRIM_HANDLE_PX) {
          return { type: 'fade-out', segment: seg, trackIndex };
        }

        // Trim left edge
        if (distLeft <= TRIM_HANDLE_PX) {
          return { type: 'trim-left', segment: seg, trackIndex };
        }

        // Trim right edge
        if (distRight <= TRIM_HANDLE_PX) {
          return { type: 'trim-right', segment: seg, trackIndex };
        }

        return { type: 'segment', segment: seg, trackIndex };
      }

      return { type: 'empty', trackIndex, time };
    },
    [canvasXToTime, canvasYToTrackIndex, timeToPixels],
  );

  // ── Mouse event handlers (to attach to the canvas) ────────────────────────

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
      const canvasX = e.clientX - rect.left;
      const canvasY = e.clientY - rect.top;

      const hit = hitTest(canvasX, canvasY);
      const store = useProjectStore.getState();

      if (hit.type === 'empty') {
        if (dragState.current.kind !== 'none') projectHistoryGesture.end();
        // Click on empty space → move playhead (no drag)
        store.setPlayheadPosition(snapTime(canvasXToTime(canvasX)));
        store.setSelection(null);
        dragState.current = { kind: 'none' };
        return;
      }

      projectHistoryGesture.begin();
      const { segment, trackIndex } = hit as { segment: AudioSegment; trackIndex: number };

      if (hit.type === 'segment') {
        store.selectSegment(segment.id, e.shiftKey);
        dragState.current = {
          kind: 'move',
          segmentId: segment.id,
          originalStartTime: segment.startTime,
          originalTrackIndex: trackIndex,
          startX: canvasX,
          startY: canvasY,
        };
      } else if (hit.type === 'trim-left') {
        store.selectSegment(segment.id, e.shiftKey);
        dragState.current = {
          kind: 'trim-left',
          segmentId: segment.id,
          originalStartTime: segment.startTime,
          originalDuration: segment.duration,
          originalOffset: segment.sourceOffset,
          startX: canvasX,
        };
      } else if (hit.type === 'trim-right') {
        store.selectSegment(segment.id, e.shiftKey);
        dragState.current = {
          kind: 'trim-right',
          segmentId: segment.id,
          originalDuration: segment.duration,
          startX: canvasX,
        };
      } else if (hit.type === 'fade-in') {
        store.selectSegment(segment.id, false);
        dragState.current = {
          kind: 'fade-in',
          segmentId: segment.id,
          originalFadeDuration: segment.fadeInDuration,
          startX: canvasX,
        };
      } else if (hit.type === 'fade-out') {
        store.selectSegment(segment.id, false);
        dragState.current = {
          kind: 'fade-out',
          segmentId: segment.id,
          originalFadeDuration: segment.fadeOutDuration,
          startX: canvasX,
        };
      }
    },
    [hitTest, snapTime, canvasXToTime],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const store = useProjectStore.getState();
      const ds = dragState.current;
      if (ds.kind === 'none') return;

      const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
      const canvasX = e.clientX - rect.left;
      const canvasY = e.clientY - rect.top;
      const dx = canvasX - ds.startX;

      if (ds.kind === 'move') {
        const dtTime = dx / zoomLevel;
        const clip = store.project.tracks.flatMap(track => track.segments).find(clip => clip.id === ds.segmentId);
        const edges = [0, store.playheadPosition, ...(store.project.markers??[]).map(m=>m.time), ...store.project.tracks.flatMap(track => track.segments.filter(clip => clip.id !== ds.segmentId).flatMap(clip => [clip.startTime, clip.startTime + clip.duration]))];
        const newStart = snapClipStart(ds.originalStartTime + dtTime, clip?.duration ?? 0, edges, zoomLevel, store.snapEnabled && !e.altKey);
        const newTrackIndex = Math.max(
          0,
          Math.min(
            store.project.tracks.length - 1,
            ds.originalTrackIndex + Math.round((canvasY - ds.startY) / useProjectStore.getState().trackHeight),
          ),
        );
        const newTrackId = store.project.tracks[newTrackIndex]?.id;
        try{store.moveSegment(ds.segmentId, newStart, newTrackId);}catch{/* Retain the last valid linked placement. */}
      } else if (ds.kind === 'trim-left') {
        const dtTime = dx / zoomLevel;
        const newDuration = Math.max(0.01, ds.originalDuration - dtTime);
        const newOffset = Math.max(0, ds.originalOffset + dtTime);
        try{store.trimSegment(ds.segmentId, 'left', newDuration, newOffset);}catch{/* Retain valid linked trim. */}
      } else if (ds.kind === 'trim-right') {
        const dtTime = dx / zoomLevel;
        const newDuration = Math.max(0.01, ds.originalDuration + dtTime);
        try{store.trimSegment(ds.segmentId, 'right', newDuration);}catch{/* Retain valid linked trim. */}
      } else if (ds.kind === 'fade-in') {
        const dtTime = dx / zoomLevel;
        const newFade = Math.max(0, ds.originalFadeDuration + dtTime);
        store.setSegmentFade(ds.segmentId, 'in', newFade);
      } else if (ds.kind === 'fade-out') {
        const dtTime = -dx / zoomLevel;
        const newFade = Math.max(0, ds.originalFadeDuration + dtTime);
        store.setSegmentFade(ds.segmentId, 'out', newFade);
      }
    },
    [zoomLevel],
  );

  const onMouseUp = useCallback(() => {
    if (dragState.current.kind === 'none') return;
    dragState.current = { kind: 'none' };
    projectHistoryGesture.end();
  }, []);

  useEffect(() => {
    const endings = ['mouseup', 'pointerup', 'pointercancel', 'blur'] as const;
    for (const event of endings) window.addEventListener(event, onMouseUp);
    return () => {
      for (const event of endings) window.removeEventListener(event, onMouseUp);
      onMouseUp();
    };
  }, [onMouseUp]);

  // ── Cursor style based on hover zone ─────────────────────────────────────

  const getCursor = useCallback(
    (canvasX: number, canvasY: number): string => {
      const hit = hitTest(canvasX, canvasY);
      switch (hit.type) {
        case 'trim-left':
        case 'trim-right':
          return 'ew-resize';
        case 'fade-in':
        case 'fade-out':
          return 'col-resize';
        case 'segment':
          return 'grab';
        default:
          return 'default';
      }
    },
    [hitTest],
  );

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't steal shortcuts when focused on input elements
      const target = e.target as HTMLElement;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable=true], [role=dialog]')) return;

      const store = useProjectStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;

      if (!ctrl && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
        e.preventDefault();
        nudgeSelection((e.code === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 0.1 : e.altKey ? 1 / store.project.sampleRate : 0.001));
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        store.setIsPlaying(!store.isPlaying);
        return;
      }

      if (e.code === 'Delete' || e.code === 'Backspace') {
        e.preventDefault();
        deleteSelection();
        return;
      }

      if (ctrl && e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        useProjectStore.temporal.getState().undo();
        return;
      }

      if (ctrl && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) {
        e.preventDefault();
        useProjectStore.temporal.getState().redo();
        return;
      }

      if (ctrl && e.code === 'KeyC') {
        e.preventDefault();
        store.copy();
        return;
      }

      if (ctrl && e.code === 'KeyX') {
        e.preventDefault();
        store.cut();
        return;
      }

      if (ctrl && e.code === 'KeyV') {
        e.preventDefault();
        store.paste();
        return;
      }

      if (ctrl && e.code === 'KeyA') {
        e.preventDefault();
        // Select all segments
        const clips=projectClips(store.project),allIds=clips.map(c=>c.id);
        const minStart=Math.min(...clips.map(c=>c.startTime)),maxEnd=Math.max(...clips.map(c=>c.startTime+c.duration));
        if (allIds.length > 0) {
          store.setSelection({
            startTime: minStart,
            endTime: maxEnd,
            segmentIds: allIds,
          });
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    pixelsToTime,
    timeToPixels,
    canvasXToTime,
    canvasYToTrackIndex,
    snapTime,
    hitTest,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    getCursor,
    dragState,
  };
}
