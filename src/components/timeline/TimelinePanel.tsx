import { ToolButton } from '../common/ToolButton';
import { FilePlus2, Scan, Wrench } from 'lucide-react';
import { timelineDuration } from '../../lib/timelineView';
import { TimelineNavigation } from './TimelineNavigation';
import { TrackFiles } from './TrackFiles';
import { AutoSyncTracks } from './AutoSyncTracks';
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
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { serializeProject, deserializeProject } from '../../lib/projectFile';
import { saveProjectFile, openProjectFile } from '../../lib/projectIO';
import { TransportControls } from './TransportControls';
import { TimelineRuler } from './TimelineRuler';
import { TimelineCanvas } from './TimelineCanvas';
import { isIOSApp } from '../../lib/native';
import { AlignmentView } from './AlignmentView';
import { VideoLane, VIDEO_LANE_HEIGHT } from './VideoLane';
import { Modal } from '../common/Modal';
import { TimelineActions } from './TimelineActions';
import { TRACK_HEADER_WIDTH, RULER_HEIGHT } from '../../hooks/useTimeline';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { TimelineEngine } from '../../audio/engine/TimelineEngine';
import { computeWaveformPeaks } from '../../audio/utils/audioBufferUtils';
import { downloadWavFile, encodeAudioBufferWav } from '../../lib/wavExport';
import { useAudioExport } from '../../hooks/useAudioExport';
import type { AudioSource } from '../../types/audio';
import { MediaTools } from './MediaTools';
import { useTimelineTransport } from '../../hooks/useTimelineTransport';

// ── Track header ──────────────────────────────────────────────────────────────

interface TrackHeaderProps {
  trackIndex: number;
  onDragStart: (e: React.DragEvent, trackId: string) => void;
  onDragOver: (e: React.DragEvent, trackIndex: number) => void;
  onDrop: (e: React.DragEvent, trackIndex: number) => void;
  onDragEnd: () => void;
  isDragOver: boolean;
}

const TrackHeader: React.FC<TrackHeaderProps> = React.memo(function TrackHeader({
  trackIndex,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragOver,
}) {
  const { t } = useTranslation();
  const track = useProjectStore((s) => s.project.tracks[trackIndex]);
  const trackHeight = useProjectStore((s) => s.trackHeight);
  const hasSolo = useProjectStore((s) => s.project.tracks.some(t => t.solo));
  const trackCount = useProjectStore((s) => s.project.tracks.length);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const reorderTrack = useProjectStore((s) => s.reorderTrack);
  if (!track) return null;

  const audible = hasSolo ? track.solo : !track.muted;
  const isFirst = trackIndex === 0;
  const isLast = trackIndex === trackCount - 1;

  return (
    <div
      className={`flex flex-col justify-center px-2 border-b border-gray-900 bg-gray-850 select-none transition-colors ${
        isDragOver ? 'bg-indigo-900/30 border-t-2 border-t-indigo-400' : ''
      }`}
      style={{ width: TRACK_HEADER_WIDTH, height: trackHeight }}
      onDragOver={(e) => onDragOver(e, trackIndex)}
      onDrop={(e) => onDrop(e, trackIndex)}
    >
      <div className="track-heading flex items-center gap-1.5 mb-1">
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
        <div className="track-reorder flex-shrink-0 flex flex-col -my-0.5">
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
          className="track-remove p-0.5 text-gray-600 hover:text-red-400 transition-colors"
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
          className={`flex items-center justify-center shrink-0 w-8 h-8 rounded text-xs font-bold transition-colors ${
            track.muted
              ? 'bg-amber-700 text-amber-200'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
          title={t(track.solo && track.muted ? 'editor.muteOverridden' : 'timeline.mute')}
          aria-label={`${t('timeline.mute')} ${track.name}`}
          aria-pressed={track.muted}
        >
          M
        </button>

        {/* Solo */}
        <button
          type="button"
          onClick={() => updateTrack(track.id, { solo: !track.solo })}
          className={`flex items-center justify-center shrink-0 w-8 h-8 rounded text-xs font-bold transition-colors ${
            track.solo
              ? 'bg-yellow-600 text-yellow-100'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
          title={t('timeline.solo')}
          aria-label={`${t('timeline.solo')} ${track.name}`}
          aria-pressed={track.solo}
        >
          S
        </button>

        <span title={t(audible ? 'editor.audible' : 'editor.silent')} className={`w-2 h-2 rounded-full ${audible ? 'bg-emerald-400' : 'bg-gray-600'}`} />
        <span className="ml-auto text-xs text-gray-400 tabular-nums" title={t('timeline.trackVolume')}>
          {track.volume > 0 ? `${(20 * Math.log10(track.volume)).toFixed(1)} dB` : '−∞'}
        </span>
      </div>
    </div>
  );
});

// ── TimelinePanel ─────────────────────────────────────────────────────────────

export const TimelinePanel: React.FC = () => {
  const store = useProjectStore(useShallow((s) => ({
    project: s.project, sources: s.sources, selection: s.selection,
    isPlaying: s.isPlaying, zoomLevel: s.zoomLevel, snapEnabled: s.snapEnabled,
    reorderTrack: s.reorderTrack, addTrack: s.addTrack,
    trackHeight: s.trackHeight, setTrackHeight: s.setTrackHeight, setZoomLevel: s.setZoomLevel, setSnapEnabled: s.setSnapEnabled,
    importAudioSource: s.importAudioSource, loadProjectState: s.loadProjectState,
  })));
  const audioEngine = useAudioEngine();
  const engineRef = useRef<TimelineEngine | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tracksAreaRef = useRef<HTMLDivElement>(null);
  const touchPan = useRef<{x: number; y: number; scroll: number} | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(800);
  const [projectError, setProjectError] = useState('');
  const [touchArrange, setTouchArrange] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [alignmentOpen, setAlignmentOpen] = useState(false);
  const [waveformMode, setWaveformMode] = useState<'normalized' | 'level'>('normalized');

  // Keep engine in sync with sources
  useEffect(() => {
    const ctx = audioEngine.getContext();
    const engine = new TimelineEngine(ctx, audioEngine.masterGain);
    engineRef.current = engine;
    return () => {
      engineRef.current = null;
      useProjectStore.getState().setIsPlaying(false);
    };
  }, [audioEngine]);

  useEffect(() => {
    engineRef.current?.setSources(store.sources);
  }, [store.sources]);

  useTimelineTransport(engineRef, audioEngine);

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
  const { stage: exportStage, error: exportError, start: startExport, cancel: cancelExport } = useAudioExport();
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

  const reorderTrack = store.reorderTrack;
  const handleTrackDrop = useCallback(
    (e: React.DragEvent, newIndex: number) => {
      e.preventDefault();
      if (draggedTrackId !== null) {
        reorderTrack(draggedTrackId, newIndex);
      }
      setDraggedTrackId(null);
      setDropTargetIndex(null);
    },
    [draggedTrackId, reorderTrack],
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
    async (files: FileList | File[] | null) => {
      if (!files || files.length === 0) return;
      setProjectError('');
      const ctx = audioEngine.getContext();
      // Decoding does not need playback permission. Awaiting resume after a
      // document picker can hang when the browser has no active user gesture.
      const batch = Array.from(files);
      const importPosition = useProjectStore.getState().playheadPosition;
      for (const [index, file] of batch.entries()) {
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
          if (batch.length > 1) {
            // Aligned microphone files must become separate tracks, not
            // overlapping clips on the first track. Keep a single default mic.
            const state = useProjectStore.getState();
            state.addTrack(file.name);
            const track = useProjectStore.getState().project.tracks.at(-1)!;
            state.updateTrack(track.id, { muted: index > 0 });
            state.importAudioSource(source, importPosition, track.id);
          } else store.importAudioSource(source, importPosition);
        } catch (err) {
          console.error(`Failed to import ${file.name}:`, err);
          setProjectError(`${file.name}: ${String(err)}`);
        }
      }
    },
    [audioEngine, store],
  );

  // Files opened from other apps ("Open in CrispAudio", Files, AirDrop):
  // projects replace the session, audio lands at the playhead.
  const pendingOpenedCount = useUIStore((s) => s.pendingOpenedFiles.length);
  useEffect(() => {
    if (pendingOpenedCount === 0) return;
    const opened = useUIStore.getState().takeOpenedFiles();
    const isProject = (name: string) => /\.(crispaudio|json)$/i.test(name);
    (async () => {
      for (const file of opened.filter((f) => isProject(f.name))) {
        try {
          const json = new TextDecoder().decode(file.bytes);
          const { project, sources } = await deserializeProject(json, audioEngine.getContext());
          store.loadProjectState(project, sources);
        } catch (err) {
          console.error(`Failed to open project ${file.name}:`, err);
          setProjectError(`${file.name}: ${String(err)}`);
        }
      }
      const audio = opened.filter((f) => !isProject(f.name));
      if (audio.length > 0) {
        await handleImportFiles(audio.map((f) => new File([f.bytes], f.name)));
      }
    })();
  }, [pendingOpenedCount, audioEngine, store, handleImportFiles]);

  const fitAll = useCallback(() => {
    const state = useProjectStore.getState(), duration = timelineDuration(state.project);
    state.setZoomLevel(Math.max(.1, (canvasWidth - 8) / Math.max(.01, duration)));
    state.setScrollOffset(0);
    if (tracksAreaRef.current) {
      tracksAreaRef.current.scrollTop = 0;
      const room = tracksAreaRef.current.clientHeight - RULER_HEIGHT - (state.project.video ? VIDEO_LANE_HEIGHT : 0);
      state.setTrackHeight(Math.min(120, room / Math.max(1, state.project.tracks.length)));
    }
  }, [canvasWidth]);
  const fittedProject = useRef('');
  useEffect(() => {
    if (canvasWidth > 0 && timelineDuration(store.project) > 0 && fittedProject.current !== store.project.id) {
      fittedProject.current = store.project.id; fitAll();
    }
  }, [store.project, canvasWidth, fitAll]);
  useEffect(() => {
    const area = tracksAreaRef.current; if (!area) return;
    const wheel = (event: WheelEvent) => {
      const state = useProjectStore.getState();
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvasWidth : 1;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const x = Math.max(0, event.clientX - area.getBoundingClientRect().left - TRACK_HEADER_WIDTH);
        const time = state.scrollOffset + x / state.zoomLevel;
        const zoom = Math.max(.1, Math.min(2000, state.zoomLevel * Math.exp(-event.deltaY * scale * .005)));
        state.setZoomLevel(zoom);
        state.setScrollOffset(Math.min(Math.max(0, timelineDuration(state.project) - canvasWidth / zoom), Math.max(0, time - x / zoom)));
      } else if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) {
        event.preventDefault();
        const delta = (event.shiftKey ? event.deltaY || event.deltaX : event.deltaX) * scale;
        state.setScrollOffset(Math.min(Math.max(0, timelineDuration(state.project) - canvasWidth / state.zoomLevel), Math.max(0, state.scrollOffset + delta / state.zoomLevel)));
      }
    };
    area.addEventListener('wheel', wheel, {passive: false}); return () => area.removeEventListener('wheel', wheel);
  }, [canvasWidth]);

  // Save the whole project (structure + embedded audio) to a .json file.
  const handleSaveProject = useCallback(async () => {
    setProjectError('');
    try {
      const used = new Set(store.project.tracks.flatMap((track) => track.segments.map((segment) => segment.sourceId)));
      const sources = new Map([...store.sources].filter(([id]) => used.has(id)));
      const json = serializeProject(store.project, sources, '__TAURI_INTERNALS__' in window && !isIOSApp() ? 'linked' : 'portable');
      await saveProjectFile(json, store.project.name || 'project');
    } catch (err) {
      console.error('Save project failed:', err);
      setProjectError(String(err));
    }
  }, [store.project, store.sources]);

  // Open a project file and replace the current session with it.
  const handleOpenProject = useCallback(async () => {
    setProjectError('');
    try {
      const json = await openProjectFile();
      if (!json) return;
      const ctx = audioEngine.getContext();
      const { project, sources } = await deserializeProject(json, ctx);
      store.loadProjectState(project, sources);
    } catch (err) {
      console.error('Open project failed:', err);
      setProjectError(String(err));
    }
  }, [audioEngine, store]);

  // Offline-render the whole project and download it as a WAV.
  const handleExportMix = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || store.project.duration <= 0) return;
    const { defaultExportFormat: fmt, defaultBitrateKbps: kbps } = useSettingsStore.getState();
    const name = store.project.name || 'crispaudio_mix';
    await startExport({
      key: [store.project, store.sources, defaultBitDepth, fmt, kbps],
      stage: 'rendering',
      produce: async (signal, setStage) => {
        const rendered = await engine.renderToBuffer(store.project, 0, undefined, signal);
        signal.throwIfAborted();
        setStage('encoding');
        if (fmt === 'wav') return encodeAudioBufferWav(rendered, defaultBitDepth, signal);
        const { encodeAudioBuffer } = await import('../../lib/codecs');
        signal.throwIfAborted();
        return encodeAudioBuffer(rendered, fmt, kbps, signal);
      },
      save: blob => downloadWavFile(blob, `${name}.${fmt}`),
    });
  }, [store.project, store.sources, defaultBitDepth, startExport]);


  return (
    <div className="timeline-editor flex flex-col h-full bg-gray-950 overflow-hidden panel-enter">

      {projectError && <p role="alert" className="text-xs text-red-300 px-3 py-2">{projectError}</p>}

      <div className="timeline-main-tools flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-800 bg-gray-900 shrink-0">
        <input ref={fileInputRef} type="file" accept="audio/*" multiple className="hidden"
          onChange={(e) => { void handleImportFiles(e.target.files); e.target.value = ''; }} />
        <ToolButton icon={FilePlus2} label={t('editor.newProject')} onClick={() => setResetOpen(true)}/>
        <ToolButton icon={FolderOpen} label={t('timeline.openProject')} onClick={() => void handleOpenProject()}/>
        <ToolButton icon={Save} label={t('timeline.saveProject')} onClick={() => void handleSaveProject()}/>
        <ToolButton icon={Upload} label={t('timeline.import')} onClick={() => fileInputRef.current?.click()}/>
        <ToolButton icon={Download} label={t('timeline.export')} disabled={exportStage !== null || store.project.duration <= 0} onClick={() => void handleExportMix()}/>
        <TrackFiles context={() => audioEngine.getContext()} onError={setProjectError} />
        <AutoSyncTracks onError={setProjectError} />
        <ToolButton icon={Wrench} label={t('timeline.viewTools')} onClick={() => setToolsOpen(true)}/>
        <Modal isOpen={toolsOpen} onClose={() => setToolsOpen(false)} title={t('timeline.viewTools')}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <ToolButton icon={Undo2} label={t('timeline.undo')} onClick={handleUndo}/>
              <ToolButton icon={Redo2} label={t('timeline.redo')} onClick={handleRedo}/>
            </div>
            <button className="timeline-tool" aria-pressed={store.snapEnabled} onClick={() => store.setSnapEnabled(!store.snapEnabled)}><Magnet size={16} />{t('timeline.snap')}</button>
            <div className="flex items-center gap-2">
              <ToolButton icon={ZoomOut} label={t('timeline.zoomOut')} onClick={handleZoomOut}/>
              <input type="range" min={0.1} max={2000} step={0.1} value={store.zoomLevel} onChange={(e) => store.setZoomLevel(+e.target.value)} className="w-28 slider-styled" aria-label={t('timeline.zoomLevel')} />
              <ToolButton icon={ZoomIn} label={t('timeline.zoomIn')} onClick={handleZoomIn}/>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="timeline-tool" disabled={store.project.tracks.length < 2} onClick={() => { useProjectStore.getState().setIsPlaying(false); setToolsOpen(false); setAlignmentOpen(true); }}>{t('alignment.title')}</button>
              <label className="text-xs text-gray-400 flex items-center gap-2">{t('alignment.display')}
                <select className="min-h-11 bg-gray-800 text-gray-100 rounded px-2" value={waveformMode} onChange={(e) => setWaveformMode(e.target.value as 'normalized' | 'level')}>
                  <option value="normalized">{t('alignment.normalized')}</option><option value="level">{t('alignment.level')}</option>
                </select>
              </label>
            </div>
            <button className="timeline-tool" aria-label={t('timeline.addTrack')} onClick={handleAddTrack}><Plus size={16} />{t('timeline.addTrack')}</button>
            <button className="timeline-tool" onClick={() => useUIStore.getState().openModal('tts')}><MessageSquare size={16} />{t('tts.title')}</button>
          </div>
        </Modal>
        {exportStage && <div className="flex flex-wrap gap-2 items-center">
          <span role="status" className="text-sm text-gray-300">{t(`audioExport.${exportStage}`)}</span>
          {exportStage === 'rendering' && <span className="text-xs text-gray-400">{t('audioExport.renderCancelNote')}</span>}
          <button className="timeline-tool" onClick={cancelExport}>{t('audioExport.cancel')}</button>
        </div>}
        {exportError != null && <span role="alert" className="text-sm text-red-400">{t('audioExport.failed')}</span>}
      </div>

      {alignmentOpen && <AlignmentView close={() => setAlignmentOpen(false)} />}
      <Modal isOpen={resetOpen} onClose={() => setResetOpen(false)} title={t('editor.newProject')}>
        <p className="text-sm text-gray-300 mb-4">{t('editor.newHelp')}</p>
        <button className="timeline-tool" onClick={() => void handleSaveProject()}>{t('timeline.saveProject')}</button>
        <button className="timeline-tool ml-2" onClick={() => {
          const state = useProjectStore.getState();
          state.loadProjectState({ id: crypto.randomUUID(), name: t('editor.untitled'), sampleRate: 48000, tracks: [], masterEffects: [], duration: 0 }, state.sources);
          state.setScrollOffset(0); state.setZoomLevel(100); state.setTrackHeight(80); setResetOpen(false);
        }}>{t('editor.clearArrangement')}</button>
      </Modal>
      <MediaTools engine={engineRef} />
      <TransportControls viewportWidth={canvasWidth} />
      <div className="timeline-command-strip flex shrink-0 overflow-x-auto">
      <div className="timeline-view-tools flex flex-wrap items-center gap-2 px-3 py-1 border-b border-gray-800 shrink-0">
        <ToolButton icon={Scan} label={t('timeline.fit')} disabled={!timelineDuration(store.project)} onClick={fitAll}/>
        <ToolButton icon={ZoomOut} label={t('timeline.zoomOut')} onClick={handleZoomOut}/>
        <ToolButton icon={ZoomIn} label={t('timeline.zoomIn')} onClick={handleZoomIn}/>
        <label className="text-xs text-gray-400 flex items-center gap-2">{t('editor.trackHeight')}
          <input aria-label={t('editor.trackHeight')} className="slider-styled w-24" type="range" min={64} max={240} value={store.trackHeight} onChange={e => store.setTrackHeight(+e.target.value)} />
        </label>
      </div>
      <TimelineActions touchArrange={touchArrange} onTouchArrange={() => setTouchArrange((old) => !old)} />
      </div>

      {/* Main area: headers + canvas */}
      <div ref={tracksAreaRef} className="timeline-tracks-area relative flex flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
        onTouchStart={e => { const p = e.touches[0]; if (!touchArrange && p && !(e.target as HTMLElement).closest('[data-video-overview], [data-timeline-playhead]')) touchPan.current = {x:p.clientX,y:p.clientY,scroll:useProjectStore.getState().scrollOffset}; }}
        onTouchEnd={() => {touchPan.current=null;}}
        onTouchMove={e => { const start=touchPan.current, p=e.touches[0]; if (!start || !p || touchArrange) return; const dx=start.x-p.clientX; if (Math.abs(dx) > Math.abs(start.y-p.clientY)+8) { const state=useProjectStore.getState(); state.setScrollOffset(Math.min(Math.max(0,timelineDuration(state.project)-canvasWidth/state.zoomLevel),Math.max(0,start.scroll+dx/state.zoomLevel))); } }} >
        {!store.project.tracks.length && !store.project.video && <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 p-5 bg-gray-950 text-center">
          <Upload className="w-10 h-10 text-indigo-400" />
          <h2 className="text-lg font-semibold text-gray-100">{t('timeline.startTitle')}</h2>
          <p className="text-sm text-gray-400 max-w-md">{t('timeline.startHelp')}</p>
          <button className="timeline-tool !bg-indigo-600 !border-indigo-500" onClick={() => fileInputRef.current?.click()}>{t('timeline.importAudio')}</button>
        </div>}
        {/* Left: track headers column */}
        <div
          className="timeline-track-headers flex flex-col flex-shrink-0 border-r border-gray-800 bg-gray-900"
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

          {store.project.video && <div className="shrink-0 px-3 flex flex-col justify-center gap-1 border-b border-gray-700 bg-violet-950/30" style={{ height: VIDEO_LANE_HEIGHT }}>
            <span className="text-sm font-medium text-violet-200">{t('video.track')}</span>
            <span className="text-xs text-gray-400">{t('editing.videoOverview')}</span>
          </div>}
          {/* Per-track headers — scroll locked to canvas */}
          <div className="flex-1">
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
          className="flex flex-col flex-1 min-w-0"
        >
          {/* Ruler */}
          <div className="flex-shrink-0" style={{ height: RULER_HEIGHT }}>
            <TimelineRuler width={canvasWidth} />
          </div>

          {store.project.video && <VideoLane width={canvasWidth} />}

          {/* Canvas (internally virtual-scrolled via store.scrollOffset) */}
          <div
            className={`flex-1 relative transition-colors ${
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
            <TimelineCanvas width={canvasWidth} touchArrange={touchArrange} waveformMode={waveformMode} />
            {isDraggingFile && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="bg-gray-900/80 backdrop-blur rounded-xl px-6 py-4 border border-indigo-500/50 text-indigo-300 font-semibold">
                  {t('timeline.dropFilesHere')}
                </div>
              </div>
            )}
          </div>
        </div>


      </div>

      <TimelineNavigation width={canvasWidth} />
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
