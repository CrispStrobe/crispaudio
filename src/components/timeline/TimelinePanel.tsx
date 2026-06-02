// ---------------------------------------------------------------------------
// CrispAudio — TimelinePanel
// Top-level layout for the DaVinci-style timeline editor.
// Structure:
//   [Toolbar]
//   [Track headers | Ruler       ]
//   [Track headers | Canvas      | EffectsPanel]
//   [Status bar                                ]
// ---------------------------------------------------------------------------

import React, {
  useRef,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  Plus,
  Trash2,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  Magnet,
  Undo2,
  Redo2,
} from 'lucide-react';
import { useProjectStore, useTimelineHistory } from '../../stores/projectStore';
import { TransportControls } from './TransportControls';
import { TimelineRuler } from './TimelineRuler';
import { TimelineCanvas } from './TimelineCanvas';
import { SegmentEffectsPanel } from './SegmentEffectsPanel';
import { TRACK_HEADER_WIDTH, TRACK_HEIGHT, RULER_HEIGHT } from '../../hooks/useTimeline';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { TimelineEngine } from '../../audio/engine/TimelineEngine';

// ── Track header ──────────────────────────────────────────────────────────────

interface TrackHeaderProps {
  trackIndex: number;
}

const TrackHeader: React.FC<TrackHeaderProps> = ({ trackIndex }) => {
  const { project, updateTrack, removeTrack } = useProjectStore();
  const track = project.tracks[trackIndex];
  if (!track) return null;

  return (
    <div
      className="flex flex-col justify-center px-2 border-b border-gray-900 bg-gray-850 select-none"
      style={{ width: TRACK_HEADER_WIDTH, height: TRACK_HEIGHT }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <input
          type="text"
          value={track.name}
          onChange={(e) => updateTrack(track.id, { name: e.target.value })}
          className="flex-1 min-w-0 bg-transparent text-xs font-medium text-gray-200 focus:outline-none focus:bg-gray-700 rounded px-1 py-0.5"
        />
        <button
          type="button"
          onClick={() => removeTrack(track.id)}
          className="p-0.5 text-gray-600 hover:text-red-400 transition-colors"
          aria-label="Remove track"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <div className="flex items-center gap-1">
        {/* Mute */}
        <button
          type="button"
          onClick={() => updateTrack(track.id, { muted: !track.muted })}
          className={`flex items-center justify-center w-6 h-5 rounded text-[10px] font-bold transition-colors ${
            track.muted
              ? 'bg-amber-700 text-amber-200'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
          title="Mute"
          aria-pressed={track.muted}
        >
          M
        </button>

        {/* Solo */}
        <button
          type="button"
          onClick={() => updateTrack(track.id, { solo: !track.solo })}
          className={`flex items-center justify-center w-6 h-5 rounded text-[10px] font-bold transition-colors ${
            track.solo
              ? 'bg-yellow-600 text-yellow-100'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
          title="Solo"
          aria-pressed={track.solo}
        >
          S
        </button>

        {/* Volume icon + slider */}
        <div className="flex-1 flex items-center gap-1">
          {track.muted ? (
            <VolumeX className="w-3 h-3 text-gray-600 flex-shrink-0" />
          ) : (
            <Volume2 className="w-3 h-3 text-gray-500 flex-shrink-0" />
          )}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={track.volume}
            onChange={(e) =>
              updateTrack(track.id, { volume: parseFloat(e.target.value) })
            }
            className="flex-1 h-1 appearance-none bg-gray-700 rounded [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gray-300 cursor-pointer"
            aria-label="Track volume"
          />
        </div>
      </div>
    </div>
  );
};

// ── TimelinePanel ─────────────────────────────────────────────────────────────

export const TimelinePanel: React.FC = () => {
  const store = useProjectStore();
  const audioEngine = useAudioEngine();
  const engineRef = useRef<TimelineEngine | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(800);
  const wasPlayingRef = useRef(false);

  // Keep engine in sync with sources
  useEffect(() => {
    const ctx = audioEngine.getContext();
    engineRef.current = new TimelineEngine(ctx, audioEngine.masterGain);
  }, [audioEngine]);

  useEffect(() => {
    engineRef.current?.setSources(store.sources);
  }, [store.sources]);

  // Playback control
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    if (store.isPlaying && !wasPlayingRef.current) {
      void audioEngine.resume();
      engine.play(store.project, store.playheadPosition);
      wasPlayingRef.current = true;
    } else if (!store.isPlaying && wasPlayingRef.current) {
      engine.stop();
      wasPlayingRef.current = false;
    }
  }, [store.isPlaying, store.playheadPosition, store.project, audioEngine]);

  // Advance playhead while playing
  useEffect(() => {
    if (!store.isPlaying) return;
    let lastTime = performance.now();
    let raf: number;

    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      const newPos = store.playheadPosition + dt;

      if (newPos >= store.project.duration && store.project.duration > 0) {
        if (store.loopEnabled) {
          store.setPlayheadPosition(0);
          engineRef.current?.play(store.project, 0);
        } else {
          store.setIsPlaying(false);
          store.setPlayheadPosition(store.project.duration);
        }
      } else {
        store.setPlayheadPosition(newPos);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.isPlaying]);

  // Track canvas width from container resize
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setCanvasWidth(entry.contentRect.width);
    });
    ro.observe(container);
    setCanvasWidth(container.clientWidth);
    return () => ro.disconnect();
  }, []);

  const handleAddTrack = useCallback(() => store.addTrack(), [store]);
  const handleZoomIn = useCallback(() => store.setZoomLevel(store.zoomLevel * 1.25), [store]);
  const handleZoomOut = useCallback(() => store.setZoomLevel(store.zoomLevel / 1.25), [store]);
  const handleUndo = useCallback(() => useTimelineHistory().undo(), []);
  const handleRedo = useCallback(() => useTimelineHistory().redo(), []);

  const showEffectsPanel =
    store.selection !== null && store.selection.segmentIds.length > 0;

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden">
      {/* Transport bar */}
      <TransportControls />

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800 bg-gray-900 flex-shrink-0">
        {/* Undo / Redo */}
        <button
          type="button"
          onClick={handleUndo}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleRedo}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-gray-700 mx-1" />

        {/* Snap toggle */}
        <button
          type="button"
          onClick={() => store.setSnapEnabled(!store.snapEnabled)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
            store.snapEnabled
              ? 'bg-indigo-900/50 text-indigo-300 border border-indigo-700'
              : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800 border border-transparent'
          }`}
          aria-pressed={store.snapEnabled}
          title="Snap to grid"
        >
          <Magnet className="w-3.5 h-3.5" />
          Snap
        </button>

        <div className="w-px h-5 bg-gray-700 mx-1" />

        {/* Zoom controls */}
        <button
          type="button"
          onClick={handleZoomOut}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          title="Zoom out"
          aria-label="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <input
          type="range"
          min={10}
          max={2000}
          step={5}
          value={store.zoomLevel}
          onChange={(e) => store.setZoomLevel(parseFloat(e.target.value))}
          className="w-24 h-1.5 appearance-none bg-gray-700 rounded [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gray-300 cursor-pointer"
          aria-label="Zoom level"
        />
        <button
          type="button"
          onClick={handleZoomIn}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          title="Zoom in"
          aria-label="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <span className="text-xs text-gray-600 ml-1 min-w-[3rem]">
          {store.zoomLevel.toFixed(0)} px/s
        </span>

        <div className="flex-1" />

        {/* Add track */}
        <button
          type="button"
          onClick={handleAddTrack}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-gray-800 border border-gray-700 text-xs text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Track
        </button>
      </div>

      {/* Main area: headers + canvas + effects panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: track headers column */}
        <div
          className="flex flex-col flex-shrink-0 border-r border-gray-800 overflow-hidden bg-gray-900"
          style={{ width: TRACK_HEADER_WIDTH }}
        >
          {/* Spacer aligns with ruler */}
          <div
            className="flex-shrink-0 border-b border-gray-800 flex items-center px-3"
            style={{ height: RULER_HEIGHT }}
          >
            <span className="text-[10px] text-gray-600 uppercase tracking-wide">
              Tracks
            </span>
          </div>

          {/* Per-track headers — scroll locked to canvas */}
          <div className="flex-1 overflow-y-hidden">
            {store.project.tracks.map((t, i) => (
              <TrackHeader key={t.id} trackIndex={i} />
            ))}
            {store.project.tracks.length === 0 && (
              <div className="flex flex-col items-center justify-center h-24 text-xs text-gray-600 gap-2 px-3">
                <p className="text-center">No tracks</p>
                <button
                  type="button"
                  onClick={handleAddTrack}
                  className="text-indigo-400 hover:text-indigo-300"
                >
                  + Add track
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Center: ruler + scrollable canvas */}
        <div
          ref={scrollContainerRef}
          className="flex flex-col flex-1 min-w-0 overflow-hidden"
        >
          {/* Ruler */}
          <div className="flex-shrink-0" style={{ height: RULER_HEIGHT }}>
            <TimelineRuler width={canvasWidth} />
          </div>

          {/* Canvas (internally virtual-scrolled via store.scrollOffset) */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden relative">
            <TimelineCanvas width={canvasWidth} />
          </div>
        </div>

        {/* Right: segment effects panel */}
        {showEffectsPanel && <SegmentEffectsPanel />}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 px-4 py-1 bg-gray-900 border-t border-gray-800 text-xs text-gray-500 flex-shrink-0 select-none">
        <span>
          {store.project.tracks.length} track
          {store.project.tracks.length !== 1 ? 's' : ''}
        </span>
        <span>
          {store.project.tracks.reduce((n, t) => n + t.segments.length, 0)} segments
        </span>
        {store.selection && (
          <span className="text-indigo-400">
            {store.selection.segmentIds.length} selected
          </span>
        )}
        <span className="ml-auto">{store.project.name}</span>
      </div>
    </div>
  );
};

export default TimelinePanel;
