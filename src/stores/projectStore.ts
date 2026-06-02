// ---------------------------------------------------------------------------
// CrispAudio — projectStore
// Zustand store with temporal (undo/redo) middleware for timeline state.
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import { temporal } from 'zundo';
import type {
  TimelineProject,
  TimelineTrack,
  AudioSegment,
  AudioSource,
  TimelineSelection,
  ClipboardState,
  EffectConfig,
  FadeCurve,
} from '../types/audio';

// ── Helpers ──────────────────────────────────────────────────────────────────

function uuid(): string {
  return crypto.randomUUID();
}

function defaultProject(): TimelineProject {
  return {
    id: uuid(),
    name: 'Untitled Project',
    sampleRate: 44100,
    tracks: [],
    masterEffects: [],
    duration: 0,
  };
}

function computeProjectDuration(tracks: TimelineTrack[]): number {
  let max = 0;
  for (const track of tracks) {
    for (const seg of track.segments) {
      const end = seg.startTime + seg.duration;
      if (end > max) max = end;
    }
  }
  return max;
}

// ── State shape ───────────────────────────────────────────────────────────────

interface ProjectState {
  project: TimelineProject;
  sources: Map<string, AudioSource>;
  selection: TimelineSelection | null;
  clipboard: ClipboardState;
  playheadPosition: number;
  isPlaying: boolean;
  zoomLevel: number; // pixels per second
  scrollOffset: number; // horizontal scroll in seconds
  snapEnabled: boolean;
  loopEnabled: boolean;

  // Track actions
  addTrack: (name?: string) => void;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, patch: Partial<Pick<TimelineTrack, 'name' | 'muted' | 'solo' | 'volume' | 'pan'>>) => void;

  // Segment actions
  addSegment: (trackId: string, segment: AudioSegment) => void;
  removeSegment: (segmentId: string) => void;
  moveSegment: (segmentId: string, newStartTime: number, newTrackId?: string) => void;
  trimSegment: (segmentId: string, side: 'left' | 'right', newDuration: number, newOffset?: number) => void;
  splitSegment: (segmentId: string, splitTime: number) => void;
  setSegmentFade: (segmentId: string, side: 'in' | 'out', duration: number, curve?: FadeCurve) => void;
  setSegmentEffects: (segmentId: string, effects: EffectConfig[]) => void;
  setSegmentGain: (segmentId: string, gain: number) => void;
  setSegmentName: (segmentId: string, name: string) => void;
  setSegmentColor: (segmentId: string, color: string) => void;

  // Source management
  addSource: (source: AudioSource) => void;
  removeSource: (sourceId: string) => void;
  /**
   * Register an audio source and place a segment for it on the timeline in one
   * atomic update. Creates a track if none exists / no valid target is given.
   */
  importAudioSource: (source: AudioSource, startTime?: number, trackId?: string) => void;

  // Selection
  setSelection: (selection: TimelineSelection | null) => void;
  selectSegment: (segmentId: string, addToSelection?: boolean) => void;

  // Clipboard
  cut: () => void;
  copy: () => void;
  paste: (atTime?: number) => void;
  deleteSelected: () => void;

  // Transport
  setPlayheadPosition: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setLoopEnabled: (enabled: boolean) => void;

  // View
  setZoomLevel: (level: number) => void;
  setScrollOffset: (offset: number) => void;
  setSnapEnabled: (enabled: boolean) => void;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function findSegmentById(
  tracks: TimelineTrack[],
  segmentId: string,
): { track: TimelineTrack; segment: AudioSegment } | null {
  for (const track of tracks) {
    const segment = track.segments.find((s) => s.id === segmentId);
    if (segment) return { track, segment };
  }
  return null;
}

function patchSegment(
  tracks: TimelineTrack[],
  segmentId: string,
  patch: Partial<AudioSegment>,
): TimelineTrack[] {
  return tracks.map((track) => ({
    ...track,
    segments: track.segments.map((seg) =>
      seg.id === segmentId ? { ...seg, ...patch } : seg,
    ),
  }));
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useProjectStore = create<ProjectState>()(
  temporal(
    (set, get) => ({
      project: defaultProject(),
      sources: new Map(),
      selection: null,
      clipboard: { operation: null, segments: [], sourceIds: [] },
      playheadPosition: 0,
      isPlaying: false,
      zoomLevel: 100, // 100 pixels per second default
      scrollOffset: 0,
      snapEnabled: true,
      loopEnabled: false,

      // ── Tracks ──────────────────────────────────────────────────────────────

      addTrack: (name) => {
        set((state) => {
          const track: TimelineTrack = {
            id: uuid(),
            name: name ?? `Track ${state.project.tracks.length + 1}`,
            segments: [],
            muted: false,
            solo: false,
            volume: 1,
            pan: 0,
          };
          return {
            project: {
              ...state.project,
              tracks: [...state.project.tracks, track],
            },
          };
        });
      },

      removeTrack: (trackId) => {
        set((state) => {
          const tracks = state.project.tracks.filter((t) => t.id !== trackId);
          return {
            project: {
              ...state.project,
              tracks,
              duration: computeProjectDuration(tracks),
            },
          };
        });
      },

      updateTrack: (trackId, patch) => {
        set((state) => ({
          project: {
            ...state.project,
            tracks: state.project.tracks.map((t) =>
              t.id === trackId ? { ...t, ...patch } : t,
            ),
          },
        }));
      },

      // ── Segments ─────────────────────────────────────────────────────────────

      addSegment: (trackId, segment) => {
        set((state) => {
          const tracks = state.project.tracks.map((track) =>
            track.id === trackId
              ? { ...track, segments: [...track.segments, segment] }
              : track,
          );
          return {
            project: {
              ...state.project,
              tracks,
              duration: computeProjectDuration(tracks),
            },
          };
        });
      },

      removeSegment: (segmentId) => {
        set((state) => {
          const tracks = state.project.tracks.map((track) => ({
            ...track,
            segments: track.segments.filter((s) => s.id !== segmentId),
          }));
          return {
            project: {
              ...state.project,
              tracks,
              duration: computeProjectDuration(tracks),
            },
          };
        });
      },

      moveSegment: (segmentId, newStartTime, newTrackId) => {
        set((state) => {
          const found = findSegmentById(state.project.tracks, segmentId);
          if (!found) return state;

          const targetTrackId = newTrackId ?? found.track.id;
          const clampedStart = Math.max(0, newStartTime);

          let tracks = state.project.tracks.map((track) => ({
            ...track,
            segments: track.segments.filter((s) => s.id !== segmentId),
          }));

          const updatedSegment: AudioSegment = {
            ...found.segment,
            startTime: clampedStart,
            trackId: targetTrackId,
          };

          tracks = tracks.map((track) =>
            track.id === targetTrackId
              ? { ...track, segments: [...track.segments, updatedSegment] }
              : track,
          );

          return {
            project: {
              ...state.project,
              tracks,
              duration: computeProjectDuration(tracks),
            },
          };
        });
      },

      trimSegment: (segmentId, side, newDuration, newOffset) => {
        set((state) => {
          const found = findSegmentById(state.project.tracks, segmentId);
          if (!found) return state;

          const { segment } = found;
          let patch: Partial<AudioSegment>;

          if (side === 'left') {
            // Trim from left: startTime shifts forward, sourceOffset increases
            const delta = segment.duration - newDuration;
            patch = {
              startTime: Math.max(0, segment.startTime + delta),
              duration: Math.max(0.01, newDuration),
              sourceOffset: newOffset ?? Math.max(0, segment.sourceOffset + delta),
            };
          } else {
            // Trim from right: just shorten duration
            patch = {
              duration: Math.max(0.01, newDuration),
              sourceOffset: newOffset ?? segment.sourceOffset,
            };
          }

          const tracks = patchSegment(state.project.tracks, segmentId, patch);
          return {
            project: {
              ...state.project,
              tracks,
              duration: computeProjectDuration(tracks),
            },
          };
        });
      },

      splitSegment: (segmentId, splitTime) => {
        set((state) => {
          const found = findSegmentById(state.project.tracks, segmentId);
          if (!found) return state;

          const { track, segment } = found;
          const localSplit = splitTime - segment.startTime;
          if (localSplit <= 0 || localSplit >= segment.duration) return state;

          const left: AudioSegment = {
            ...segment,
            id: uuid(),
            duration: localSplit,
            fadeOutDuration: 0,
          };

          const right: AudioSegment = {
            ...segment,
            id: uuid(),
            startTime: segment.startTime + localSplit,
            duration: segment.duration - localSplit,
            sourceOffset: segment.sourceOffset + localSplit,
            fadeInDuration: 0,
          };

          const tracks = state.project.tracks.map((t) =>
            t.id === track.id
              ? {
                  ...t,
                  segments: t.segments
                    .filter((s) => s.id !== segmentId)
                    .concat([left, right]),
                }
              : t,
          );

          return {
            project: {
              ...state.project,
              tracks,
              duration: computeProjectDuration(tracks),
            },
          };
        });
      },

      setSegmentFade: (segmentId, side, duration, curve) => {
        const patch: Partial<AudioSegment> =
          side === 'in'
            ? {
                fadeInDuration: Math.max(0, duration),
                ...(curve ? { fadeInCurve: curve } : {}),
              }
            : {
                fadeOutDuration: Math.max(0, duration),
                ...(curve ? { fadeOutCurve: curve } : {}),
              };
        set((state) => ({
          project: {
            ...state.project,
            tracks: patchSegment(state.project.tracks, segmentId, patch),
          },
        }));
      },

      setSegmentEffects: (segmentId, effects) => {
        set((state) => ({
          project: {
            ...state.project,
            tracks: patchSegment(state.project.tracks, segmentId, { effects }),
          },
        }));
      },

      setSegmentGain: (segmentId, gain) => {
        set((state) => ({
          project: {
            ...state.project,
            tracks: patchSegment(state.project.tracks, segmentId, {
              gain: Math.max(0, Math.min(4, gain)),
            }),
          },
        }));
      },

      setSegmentName: (segmentId, name) => {
        set((state) => ({
          project: {
            ...state.project,
            tracks: patchSegment(state.project.tracks, segmentId, { name }),
          },
        }));
      },

      setSegmentColor: (segmentId, color) => {
        set((state) => ({
          project: {
            ...state.project,
            tracks: patchSegment(state.project.tracks, segmentId, { color }),
          },
        }));
      },

      // ── Sources ───────────────────────────────────────────────────────────────

      addSource: (source) => {
        set((state) => {
          const sources = new Map(state.sources);
          sources.set(source.id, source);
          return { sources };
        });
      },

      removeSource: (sourceId) => {
        set((state) => {
          const sources = new Map(state.sources);
          sources.delete(sourceId);
          return { sources };
        });
      },

      importAudioSource: (source, startTime = 0, trackId) => {
        set((state) => {
          const sources = new Map(state.sources);
          sources.set(source.id, source);

          let tracks = state.project.tracks;
          let targetId = trackId;

          // Fall back to the first track, or create one if the project is empty.
          if (!targetId || !tracks.some((t) => t.id === targetId)) {
            if (tracks.length > 0) {
              targetId = tracks[0].id;
            } else {
              const newTrack: TimelineTrack = {
                id: uuid(),
                name: 'Track 1',
                segments: [],
                muted: false,
                solo: false,
                volume: 1,
                pan: 0,
              };
              tracks = [...tracks, newTrack];
              targetId = newTrack.id;
            }
          }

          const segment: AudioSegment = {
            id: uuid(),
            trackId: targetId,
            sourceId: source.id,
            startTime: Math.max(0, startTime),
            duration: source.duration,
            sourceOffset: 0,
            fadeInDuration: 0,
            fadeOutDuration: 0,
            fadeInCurve: 'linear',
            fadeOutCurve: 'linear',
            effects: [],
            gain: 1,
            color: '#3b82f6',
            name: source.name,
          };

          tracks = tracks.map((t) =>
            t.id === targetId
              ? { ...t, segments: [...t.segments, segment] }
              : t,
          );

          return {
            sources,
            project: {
              ...state.project,
              tracks,
              duration: computeProjectDuration(tracks),
            },
          };
        });
      },

      // ── Selection ─────────────────────────────────────────────────────────────

      setSelection: (selection) => set({ selection }),

      selectSegment: (segmentId, addToSelection = false) => {
        set((state) => {
          const found = findSegmentById(state.project.tracks, segmentId);
          if (!found) return { selection: null };

          const { segment } = found;

          if (addToSelection && state.selection) {
            const ids = state.selection.segmentIds.includes(segmentId)
              ? state.selection.segmentIds.filter((id) => id !== segmentId)
              : [...state.selection.segmentIds, segmentId];

            // Recompute time range across all selected segments
            let minStart = Infinity;
            let maxEnd = -Infinity;
            for (const id of ids) {
              const f = findSegmentById(state.project.tracks, id);
              if (f) {
                minStart = Math.min(minStart, f.segment.startTime);
                maxEnd = Math.max(maxEnd, f.segment.startTime + f.segment.duration);
              }
            }

            return {
              selection:
                ids.length === 0
                  ? null
                  : {
                      startTime: minStart,
                      endTime: maxEnd,
                      segmentIds: ids,
                    },
            };
          }

          return {
            selection: {
              startTime: segment.startTime,
              endTime: segment.startTime + segment.duration,
              segmentIds: [segmentId],
            },
          };
        });
      },

      // ── Clipboard ─────────────────────────────────────────────────────────────

      cut: () => {
        const { selection, project } = get();
        if (!selection || selection.segmentIds.length === 0) return;

        const segments: AudioSegment[] = [];
        const sourceIds = new Set<string>();

        for (const id of selection.segmentIds) {
          const found = findSegmentById(project.tracks, id);
          if (found) {
            segments.push(found.segment);
            sourceIds.add(found.segment.sourceId);
          }
        }

        set((state) => {
          const tracks = state.project.tracks.map((track) => ({
            ...track,
            segments: track.segments.filter(
              (s) => !selection.segmentIds.includes(s.id),
            ),
          }));
          return {
            clipboard: {
              operation: 'cut',
              segments,
              sourceIds: Array.from(sourceIds),
            },
            selection: null,
            project: {
              ...state.project,
              tracks,
              duration: computeProjectDuration(tracks),
            },
          };
        });
      },

      copy: () => {
        const { selection, project } = get();
        if (!selection || selection.segmentIds.length === 0) return;

        const segments: AudioSegment[] = [];
        const sourceIds = new Set<string>();

        for (const id of selection.segmentIds) {
          const found = findSegmentById(project.tracks, id);
          if (found) {
            segments.push(found.segment);
            sourceIds.add(found.segment.sourceId);
          }
        }

        set({
          clipboard: {
            operation: 'copy',
            segments,
            sourceIds: Array.from(sourceIds),
          },
        });
      },

      paste: (atTime) => {
        const { clipboard, playheadPosition } = get();
        if (!clipboard.segments.length) return;

        const pasteTime = atTime ?? playheadPosition;
        const minStart = Math.min(...clipboard.segments.map((s) => s.startTime));
        const offset = pasteTime - minStart;

        set((state) => {
          // Group pasted segments by their original trackId; place on same track
          const newSegmentsByTrack = new Map<string, AudioSegment[]>();
          for (const seg of clipboard.segments) {
            const newSeg: AudioSegment = {
              ...seg,
              id: uuid(),
              startTime: Math.max(0, seg.startTime + offset),
            };
            const list = newSegmentsByTrack.get(seg.trackId) ?? [];
            list.push(newSeg);
            newSegmentsByTrack.set(seg.trackId, list);
          }

          const tracks = state.project.tracks.map((track) => {
            const extra = newSegmentsByTrack.get(track.id);
            if (!extra) return track;
            return { ...track, segments: [...track.segments, ...extra] };
          });

          // Select the newly pasted segments
          const newIds = Array.from(newSegmentsByTrack.values())
            .flat()
            .map((s) => s.id);
          const pastedSegments = Array.from(newSegmentsByTrack.values()).flat();
          const minT = Math.min(...pastedSegments.map((s) => s.startTime));
          const maxT = Math.max(
            ...pastedSegments.map((s) => s.startTime + s.duration),
          );

          return {
            project: {
              ...state.project,
              tracks,
              duration: computeProjectDuration(tracks),
            },
            selection: {
              startTime: minT,
              endTime: maxT,
              segmentIds: newIds,
            },
          };
        });
      },

      deleteSelected: () => {
        const { selection } = get();
        if (!selection || selection.segmentIds.length === 0) return;

        set((state) => {
          const tracks = state.project.tracks.map((track) => ({
            ...track,
            segments: track.segments.filter(
              (s) => !selection.segmentIds.includes(s.id),
            ),
          }));
          return {
            project: {
              ...state.project,
              tracks,
              duration: computeProjectDuration(tracks),
            },
            selection: null,
          };
        });
      },

      // ── Transport ─────────────────────────────────────────────────────────────

      setPlayheadPosition: (time) =>
        set({ playheadPosition: Math.max(0, time) }),

      setIsPlaying: (playing) => set({ isPlaying: playing }),

      setLoopEnabled: (enabled) => set({ loopEnabled: enabled }),

      // ── View ──────────────────────────────────────────────────────────────────

      setZoomLevel: (level) =>
        set({ zoomLevel: Math.max(10, Math.min(2000, level)) }),

      setScrollOffset: (offset) =>
        set({ scrollOffset: Math.max(0, offset) }),

      setSnapEnabled: (enabled) => set({ snapEnabled: enabled }),
    }),
    // Temporal options: only track project mutations (not playhead/view state)
    {
      partialize: (state) => ({
        project: state.project,
      }),
      limit: 100,
    },
  ),
);

// Convenience export for undo/redo
export const useTimelineHistory = () => useProjectStore.temporal.getState();
