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
  Upload,
  Download,
  Save,
  FolderOpen,
  GripVertical,
  ChevronUp,
  ChevronDown,
  MessageSquare,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { serializeProject, deserializeProject } from '../../lib/projectFile';
import { saveProjectFile, openProjectFile } from '../../lib/projectIO';
import { TransportControls } from './TransportControls';
import { TimelineRuler } from './TimelineRuler';
import { TimelineCanvas } from './TimelineCanvas';
import { SegmentEffectsPanel } from './SegmentEffectsPanel';
import { TRACK_HEADER_WIDTH, TRACK_HEIGHT, RULER_HEIGHT } from '../../hooks/useTimeline';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { TimelineEngine } from '../../audio/engine/TimelineEngine';
import { computeWaveformPeaks, encodeAudioBufferToWav } from '../../audio/utils/audioBufferUtils';
import { downloadWavFile } from '../../lib/wavExport';
import type { AudioSource } from '../../types/audio';

// ── Track header ──────────────────────────────────────────────────────────────

interface TrackHeaderProps {
  trackIndex: number;
  onDragStart: (e: React.DragEvent, trackId: string) => void;
  onDragOver: (e: React.DragEvent, trackIndex: number) => void;
  onDrop: (e: React.DragEvent, trackIndex: number) => void;
  onDragEnd: () => void;
  isDragOver: boolean;
}

const TrackHeader: React.FC<TrackHeaderProps> = ({
  trackIndex,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragOver,
}) => {
  const { t } = useTranslation();
  const { project, updateTrack, removeTrack, reorderTrack } = useProjectStore();
  const track = project.tracks[trackIndex];
  if (!track) return null;

  const isFirst = trackIndex === 0;
  const isLast = trackIndex === project.tracks.length - 1;

  return (
    <div
      className={`flex flex-col justify-center px-2 border-b border-gray-900 bg-gray-850 select-none transition-colors ${
        isDragOver ? 'bg-indigo-900/30 border-t-2 border-t-indigo-400' : ''
      }`}
      style={{ width: TRACK_HEADER_WIDTH, height: TRACK_HEIGHT }}
      onDragOver={(e) => onDragOver(e, trackIndex)}
      onDrop={(e) => onDrop(e, trackIndex)}
    >
      <div className="flex items-center gap-1.5 mb-1">
        {/* Drag handle (desktop pointer) — HTML5 DnD doesn't fire on touch */}
        <div
          draggable
          onDragStart={(e) => onDragStart(e, track.id)}
          onDragEnd={onDragEnd}
          className="hidden md:block flex-shrink-0 cursor-grab active:cursor-grabbing p-0.5 text-gray-600 hover:text-gray-400 transition-colors"
          aria-label={t('timeline.reorderTrack')}
          title={t('timeline.reorderTrack')}
        >
          <GripVertical className="w-3 h-3" />
        </div>
        {/* Up/down reorder — works with touch and keyboard everywhere */}
        <div className="flex-shrink-0 flex flex-col -my-0.5">
          <button
            type="button"
            onClick={() => reorderTrack(track.id, trackIndex - 1)}
            disabled={isFirst}
            className="p-0.5 text-gray-600 hover:text-gray-300 disabled:opacity-30 disabled:hover:text-gray-600 transition-colors leading-none"
            aria-label={t('timeline.moveTrackUp')}
            title={t('timeline.moveTrackUp')}
          >
            <ChevronUp className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => reorderTrack(track.id, trackIndex + 1)}
            disabled={isLast}
            className="p-0.5 text-gray-600 hover:text-gray-300 disabled:opacity-30 disabled:hover:text-gray-600 transition-colors leading-none"
            aria-label={t('timeline.moveTrackDown')}
            title={t('timeline.moveTrackDown')}
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
        <input
          type="text"
          aria-label={t('timeline.trackName')}
          value={track.name}
          onChange={(e) => updateTrack(track.id, { name: e.target.value })}
          className="flex-1 min-w-0 bg-transparent text-xs font-medium text-gray-200 focus:outline-none focus:bg-gray-700 rounded px-1 py-0.5"
        />
        <button
          type="button"
          onClick={() => removeTrack(track.id)}
          className="p-0.5 text-gray-600 hover:text-red-400 transition-colors"
          aria-label={t('timeline.removeTrack')}
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
          title={t('timeline.mute')}
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
          title={t('timeline.solo')}
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
            className="flex-1 slider-styled"
            aria-label={t('timeline.trackVolume')}
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

  const { t } = useTranslation();
  const defaultBitDepth = useSettingsStore((s) => s.defaultBitDepth);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Track reorder drag state
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const handleTrackDragStart = useCallback(
    (e: React.DragEvent, trackId: string) => {
      setDraggedTrackId(trackId);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', trackId);
    },
    [],
  );

  const handleTrackDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      if (draggedTrackId === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropTargetIndex(index);
    },
    [draggedTrackId],
  );

  const handleTrackDrop = useCallback(
    (e: React.DragEvent, newIndex: number) => {
      e.preventDefault();
      if (draggedTrackId !== null) {
        store.reorderTrack(draggedTrackId, newIndex);
      }
      setDraggedTrackId(null);
      setDropTargetIndex(null);
    },
    [draggedTrackId, store],
  );

  const handleTrackDragEnd = useCallback(() => {
    setDraggedTrackId(null);
    setDropTargetIndex(null);
  }, []);

  const handleAddTrack = useCallback(() => store.addTrack(), [store]);
  const handleZoomIn = useCallback(() => store.setZoomLevel(store.zoomLevel * 1.25), [store]);
  const handleZoomOut = useCallback(() => store.setZoomLevel(store.zoomLevel / 1.25), [store]);
  const handleUndo = useCallback(() => useProjectStore.temporal.getState().undo(), []);
  const handleRedo = useCallback(() => useProjectStore.temporal.getState().redo(), []);

  // Decode dropped/picked audio files into sources + segments on the timeline.
  const handleImportFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const ctx = audioEngine.getContext();
      await audioEngine.resume();
      for (const file of Array.from(files)) {
        try {
          const arrayBuf = await file.arrayBuffer();
          let decoded: AudioBuffer;
          try {
            // decodeAudioData detaches its input; pass a copy so the original
            // bytes remain available for the glint fallback.
            decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
          } catch {
            // Ogg-Opus and other formats the platform can't decode natively.
            const { decodeCompressedToBuffer } = await import('../../lib/codecs');
            decoded = await decodeCompressedToBuffer(ctx, new Uint8Array(arrayBuf));
          }
          const mono = decoded.getChannelData(0);
          const bins = Math.max(1, Math.min(8000, Math.ceil(decoded.duration * 200)));
          const source: AudioSource = {
            id: crypto.randomUUID(),
            name: file.name,
            buffer: decoded,
            peaks: computeWaveformPeaks(mono, bins),
            duration: decoded.duration,
            sampleRate: decoded.sampleRate,
            channels: decoded.numberOfChannels,
          };
          store.importAudioSource(source, store.playheadPosition);
        } catch (err) {
          console.error(`Failed to import ${file.name}:`, err);
        }
      }
    },
    [audioEngine, store],
  );

  // Save the whole project (structure + embedded audio) to a .json file.
  const handleSaveProject = useCallback(async () => {
    try {
      const json = serializeProject(store.project, store.sources);
      await saveProjectFile(json, store.project.name || 'project');
    } catch (err) {
      console.error('Save project failed:', err);
    }
  }, [store.project, store.sources]);

  // Open a project file and replace the current session with it.
  const handleOpenProject = useCallback(async () => {
    try {
      const json = await openProjectFile();
      if (!json) return;
      const ctx = audioEngine.getContext();
      const { project, sources } = await deserializeProject(json, ctx);
      store.loadProjectState(project, sources);
    } catch (err) {
      console.error('Open project failed:', err);
    }
  }, [audioEngine, store]);

  // Offline-render the whole project and download it as a WAV.
  const handleExportMix = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || store.project.duration <= 0) return;
    setIsExporting(true);
    try {
      const rendered = await engine.renderToBuffer(store.project);
      const { defaultExportFormat: fmt, defaultBitrateKbps: kbps } =
        useSettingsStore.getState();
      const name = store.project.name || 'crispaudio_mix';
      let blob: Blob;
      if (fmt === 'wav') {
        blob = new Blob([encodeAudioBufferToWav(rendered, defaultBitDepth)], { type: 'audio/wav' });
      } else {
        const { encodeAudioBuffer } = await import('../../lib/codecs');
        blob = await encodeAudioBuffer(rendered, fmt, kbps);
      }
      await downloadWavFile(blob, `${name}.${fmt}`);
    } catch (err) {
      console.error('Mix export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [store.project, defaultBitDepth]);

  const showEffectsPanel =
    store.selection !== null && store.selection.segmentIds.length > 0;

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden panel-enter">
      {/* Transport bar */}
      <TransportControls />

      {/* Toolbar — scrolls horizontally on narrow screens so nothing clips */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800 bg-gray-900 flex-shrink-0 overflow-x-auto [&>*]:shrink-0">
        {/* Undo / Redo */}
        <button
          type="button"
          onClick={handleUndo}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          title={t('timeline.undoTooltip')}
          aria-label={t('timeline.undo')}
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleRedo}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          title={t('timeline.redoTooltip')}
          aria-label={t('timeline.redo')}
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
          title={t('timeline.snapToGrid')}
        >
          <Magnet className="w-3.5 h-3.5" />
          {t('timeline.snap')}
        </button>

        <div className="w-px h-5 bg-gray-700 mx-1" />

        {/* Zoom controls */}
        <button
          type="button"
          onClick={handleZoomOut}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          title={t('timeline.zoomOut')}
          aria-label={t('timeline.zoomOut')}
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
          className="w-24 slider-styled"
          aria-label={t('timeline.zoomLevel')}
        />
        <button
          type="button"
          onClick={handleZoomIn}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          title={t('timeline.zoomIn')}
          aria-label={t('timeline.zoomIn')}
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <span className="text-xs text-gray-600 ml-1 min-w-[3rem]">
          {store.zoomLevel.toFixed(0)} px/s
        </span>

        <div className="flex-1" />

        {/* Open / Save project */}
        <button
          type="button"
          onClick={() => void handleOpenProject()}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-gray-800 border border-gray-700 text-xs text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
          title={t('timeline.openProject')}
          aria-label={t('timeline.openProject')}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          {t('timeline.openProject')}
        </button>
        <button
          type="button"
          onClick={() => void handleSaveProject()}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-gray-800 border border-gray-700 text-xs text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
          title={t('timeline.saveProject')}
          aria-label={t('timeline.saveProject')}
        >
          <Save className="w-3.5 h-3.5" />
          {t('timeline.saveProject')}
        </button>

        <div className="w-px h-5 bg-gray-700 mx-1" />

        {/* Import audio */}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleImportFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-gray-800 border border-gray-700 text-xs text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
          title={t('timeline.import')}
          aria-label={t('timeline.import')}
        >
          <Upload className="w-3.5 h-3.5" />
          {t('timeline.import')}
        </button>

        {/* TTS */}
        <button
          type="button"
          onClick={() => useUIStore.getState().openModal('tts')}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-teal-800 border border-teal-700 text-xs text-teal-200 hover:text-white hover:bg-teal-700 transition-colors"
          title={t('tts.title')}
          aria-label={t('tts.title')}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {t('tts.title')}
        </button>

        {/* Export mix */}
        <button
          type="button"
          onClick={() => void handleExportMix()}
          disabled={isExporting || store.project.duration <= 0}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-gray-800 border border-gray-700 text-xs text-gray-300 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('timeline.export')}
          aria-label={t('timeline.export')}
        >
          <Download className="w-3.5 h-3.5" />
          {t('timeline.export')}
        </button>

        {/* Add track */}
        <button
          type="button"
          onClick={handleAddTrack}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-gray-800 border border-gray-700 text-xs text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
          aria-label={t('timeline.addTrack')}
        >
          <Plus className="w-3.5 h-3.5" />
          {t('timeline.addTrack')}
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
              {t('timeline.tracks')}
            </span>
          </div>

          {/* Per-track headers — scroll locked to canvas */}
          <div className="flex-1 overflow-y-hidden">
            {store.project.tracks.map((t, i) => (
              <TrackHeader
                key={t.id}
                trackIndex={i}
                onDragStart={handleTrackDragStart}
                onDragOver={handleTrackDragOver}
                onDrop={handleTrackDrop}
                onDragEnd={handleTrackDragEnd}
                isDragOver={dropTargetIndex === i && draggedTrackId !== t.id}
              />
            ))}
            {store.project.tracks.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 text-gray-500 gap-3 px-4">
                <Upload className="w-8 h-8 text-gray-600" />
                <p className="text-sm text-center">{t('timeline.noTracks')}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddTrack}
                    className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
                  >
                    + {t('timeline.addTrack')}
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-semibold transition-colors"
                  >
                    {t('timeline.importAudio')}
                  </button>
                </div>
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
          <div
            className={`flex-1 overflow-y-auto overflow-x-hidden relative transition-colors ${
              isDraggingFile ? 'bg-indigo-900/20 ring-2 ring-inset ring-indigo-500/50' : ''
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              setIsDraggingFile(true);
            }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingFile(false);
              if (e.dataTransfer.files.length > 0) {
                void handleImportFiles(e.dataTransfer.files);
              }
            }}
          >
            <TimelineCanvas width={canvasWidth} />
            {isDraggingFile && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="bg-gray-900/80 backdrop-blur rounded-xl px-6 py-4 border border-indigo-500/50 text-indigo-300 font-semibold">
                  {t('timeline.dropFilesHere')}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: segment effects panel */}
        {showEffectsPanel && <SegmentEffectsPanel />}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 px-4 py-1 bg-gray-900 border-t border-gray-800 text-xs text-gray-500 flex-shrink-0 select-none">
        <span>
          {t('timeline.trackCount', { count: store.project.tracks.length })}
        </span>
        <span>
          {t('timeline.segmentCount', { count: store.project.tracks.reduce((n, tr) => n + tr.segments.length, 0) })}
        </span>
        {store.selection && (
          <span className="text-indigo-400">
            {t('timeline.selectedCount', { count: store.selection.segmentIds.length })}
          </span>
        )}
        <span className="ml-auto">{store.project.name}</span>
      </div>
    </div>
  );
};

export default TimelinePanel;
