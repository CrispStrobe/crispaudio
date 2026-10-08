import { prepareAudioImport, type AudioImportInput, type ImportPhase } from '../../lib/audioImport';
import { TimelineHelp } from './TimelineHelp';
import { TimelineWorkspace, type WorkspaceTab } from './TimelineWorkspace';
import { Library } from 'lucide-react';
import { ToolButton } from '../common/ToolButton';
import { FilePlus2, Scan, CircleHelp, AlignHorizontalJustifyCenter } from 'lucide-react';
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
import { VideoLane } from './VideoLane';
import { Modal } from '../common/Modal';
import { TimelineActions } from './TimelineActions';
import { TRACK_HEADER_WIDTH, RULER_HEIGHT } from '../../hooks/useTimeline';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { TimelineEngine } from '../../audio/engine/TimelineEngine';
import { downloadWavFile, encodeAudioBufferWav } from '../../lib/wavExport';
import { useAudioExport } from '../../hooks/useAudioExport';
import { MediaTools } from './MediaTools';
import { useTimelineTransport } from '../../hooks/useTimelineTransport';

// ── Track header ──────────────────────────────────────────────────────────────

interface TrackHeaderProps {
  trackIndex: number;
  onDragStart: (e: React.PointerEvent, trackId: string) => void;
  onDragOver: (e: React.PointerEvent, trackIndex: number) => void;
  onDrop: (e: React.PointerEvent, trackIndex: number) => void;
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
      className={`flex flex-col justify-center overflow-hidden px-2 border-b border-gray-900 bg-gray-850 select-none transition-colors ${
        isDragOver ? 'bg-indigo-900/30 border-t-2 border-t-indigo-400' : ''
      }`}
      style={{ width: TRACK_HEADER_WIDTH, height: trackHeight }}
      data-track-index={trackIndex}
      data-track-header
      data-compact={trackHeight<56}
      data-touch-compact={trackHeight<96}
    >
      <div className="track-heading flex items-center gap-1.5 mb-1">
        <button type="button" data-track-reorder
          onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);onDragStart(e,track.id);}}
          onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))onDragOver(e,trackIndex);}}
          onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId)){onDrop(e,trackIndex);e.currentTarget.releasePointerCapture(e.pointerId);}}}
          onPointerCancel={onDragEnd}
          onLostPointerCapture={onDragEnd}
          onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.stopPropagation();e.preventDefault();reorderTrack(track.id,trackIndex+(e.key==='ArrowUp'?-1:1));}}}
          className="flex-shrink-0 cursor-grab active:cursor-grabbing p-0.5 text-gray-500" style={{touchAction:'none'}} aria-label={t('timeline.reorderTrack')} title={t('timeline.reorderTrack')}>
          <GripVertical className="w-3 h-3" />
        </button>
        {/* Up/down reorder — works with touch and keyboard everywhere */}
        <div className={`track-reorder flex-shrink-0 flex flex-col -my-0.5 ${trackHeight<56?'hidden':''}`}>
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
        <span className={`track-compact-status hidden shrink-0 w-2 h-2 rounded-full ${audible?'bg-emerald-400':'bg-gray-600'}`}
          role="status" aria-label={`${track.name}: ${t(audible?'editor.audible':'editor.silent')}`} title={t(audible?'editor.audible':'editor.silent')}/>
        <input
          type="text"
          aria-label={t('timeline.trackName')}
          value={track.name}
          title={track.name}
          onChange={(e) => updateTrack(track.id, { name: e.target.value })}
          className="flex-1 min-w-0 bg-transparent text-xs font-medium text-gray-200 focus:outline-none focus:bg-gray-700 rounded px-1 py-0.5"
        />
        <button
          type="button"
          onClick={() => removeTrack(track.id)}
          className="track-remove p-0.5 text-gray-600 hover:text-red-400 transition-colors"
          aria-label={t('timeline.removeTrack')}
          title={t('timeline.removeTrack')}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <div className={`track-mixer flex items-center gap-1 ${trackHeight<56?'hidden':''}`}>
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
  const [workspace,setWorkspace]=useState<WorkspaceTab|null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(800);
  const [projectError, setProjectError] = useState('');
  const [touchArrange, setTouchArrange] = useState(false);
  const [helpOpen,setHelpOpen]=useState(false);
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

  useEffect(()=>{const failed=(e:Event)=>setProjectError((e as CustomEvent<string>).detail);window.addEventListener('crispaudio-recovery-error',failed);window.addEventListener('crispaudio-edit-error',failed);return()=>{window.removeEventListener('crispaudio-recovery-error',failed);window.removeEventListener('crispaudio-edit-error',failed);};},[]);
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

  const reorderDrag = useRef<{id:string;target:number;x:number;y:number}|null>(null);
  const updateTrackDragTarget=useCallback((x:number,y:number)=>{
    const drag=reorderDrag.current,area=tracksAreaRef.current;if(!drag||!area)return;
    drag.x=x;drag.y=y;
    const rect=area.getBoundingClientRect();
    // A track may be dragged over its waveform as well as its header.
    const headerX=rect.left+TRACK_HEADER_WIDTH/2;
    const element=document.elementFromPoint(headerX,y)?.closest<HTMLElement>('[data-track-index]');
    if(element){const index=Number(element.dataset.trackIndex);drag.target=index;setDropTargetIndex(index);}
  },[]);
  const handleTrackDragStart = useCallback(
    (e: React.PointerEvent, trackId: string) => {
      setDraggedTrackId(trackId);
      reorderDrag.current={id:trackId,target:useProjectStore.getState().project.tracks.findIndex(track=>track.id===trackId),x:e.clientX,y:e.clientY};
      e.stopPropagation();
    },
    [],
  );

  const handleTrackDragOver = useCallback(
    (e: React.PointerEvent) => {
      if (!reorderDrag.current) return;
      e.preventDefault();
      updateTrackDragTarget(e.clientX,e.clientY);
    },
    [updateTrackDragTarget],
  );

  const reorderTrack = store.reorderTrack;
  const handleTrackDrop = useCallback(
    (e: React.PointerEvent, newIndex: number) => {
      e.preventDefault();
      if (reorderDrag.current) reorderTrack(reorderDrag.current.id,reorderDrag.current.target??newIndex);
      reorderDrag.current=null;
      setDraggedTrackId(null);
      setDropTargetIndex(null);
    },
    [reorderTrack],
  );

  const handleTrackDragEnd = useCallback(() => {
    reorderDrag.current=null;
    setDraggedTrackId(null);
    setDropTargetIndex(null);
  }, []);
  useEffect(()=>{
    if(!draggedTrackId)return;
    let frame=0,last=performance.now();
    const tick=(now:number)=>{
      const drag=reorderDrag.current,area=tracksAreaRef.current;if(!drag||!area)return;
      const rect=area.getBoundingClientRect(),edge=Math.min(48,rect.height/3);
      if(edge>0&&drag.y>=rect.top&&drag.y<=rect.bottom){
        const velocity=drag.y<rect.top+edge?-(rect.top+edge-drag.y)/edge:drag.y>rect.bottom-edge?(drag.y-rect.bottom+edge)/edge:0;
        area.scrollTop+=velocity*Math.min(32,now-last)*.6;
        updateTrackDragTarget(drag.x,drag.y);
      }
      last=now;frame=requestAnimationFrame(tick);
    };
    const cancel=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();handleTrackDragEnd();}};
    frame=requestAnimationFrame(tick);document.addEventListener('keydown',cancel);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('keydown',cancel);};
  },[draggedTrackId,handleTrackDragEnd,updateTrackDragTarget]);

  const handleAddTrack = useCallback(() => store.addTrack(), [store]);
  const handleZoomIn = useCallback(() => store.setZoomLevel(store.zoomLevel * 1.25), [store]);
  const handleZoomOut = useCallback(() => store.setZoomLevel(store.zoomLevel / 1.25), [store]);
  const handleUndo = useCallback(() => useProjectStore.temporal.getState().undo(), []);
  const handleRedo = useCallback(() => useProjectStore.temporal.getState().redo(), []);

  const [importOpen,setImportOpen]=useState(false);
  const [importTarget,setImportTarget]=useState('new');
  const importTargetRef=useRef('new');
  const [pendingImport,setPendingImport]=useState<File[]|null>(null);
  const [importProgress,setImportProgress]=useState<{name:string;phase:ImportPhase;index:number;total:number}|null>(null);
  const importAbort=useRef<AbortController|null>(null);
  useEffect(()=>()=>importAbort.current?.abort(),[]);
  const handleImportFiles=useCallback(async(files:AudioImportInput[],target=importTargetRef.current)=>{
    if(!files.length)return;
    importAbort.current?.abort();const abort=new AbortController();importAbort.current=abort;
    const initial=useProjectStore.getState(),projectId=initial.project.id,at=initial.playheadPosition;
    setProjectError('');let offset=at;
    try{
      for(const [index,file] of files.entries()){
        const source=await prepareAudioImport(audioEngine.getContext(),file,abort.signal,phase=>setImportProgress({name:file.name,phase,index:index+1,total:files.length}));
        abort.signal.throwIfAborted();const state=useProjectStore.getState();
        if(state.project.id!==projectId)throw new Error(t('usability.importProjectChanged'));
        let trackId=target;
        if(target==='new'){state.addTrack(file.name);trackId=useProjectStore.getState().project.tracks.at(-1)!.id;}
        else if(!state.project.tracks.some(track=>track.id===target))throw new Error(t('usability.importTrackMissing'));
        state.importAudioSource(source,target==='new'?at:offset,trackId);offset+=source.duration;
      }
    }catch(error){if(!abort.signal.aborted)setProjectError(String(error));}
    finally{if(importAbort.current===abort){setImportProgress(null);importAbort.current=null;}}
  },[audioEngine,t]);
  const fileInputs=(files:File[])=>files.map(file=>({name:file.name,read:()=>file.arrayBuffer()}));
  const askImport=(files?:File[])=>{setPendingImport(files??null);setImportOpen(true);};
  const chooseImport=async()=>{
    setImportOpen(false);importTargetRef.current=importTarget;
    if(pendingImport){void handleImportFiles(fileInputs(pendingImport),importTarget);setPendingImport(null);return;}
    if('__TAURI_INTERNALS__' in window&&!isIOSApp()){
      try{
        const {open}=await import('@tauri-apps/plugin-dialog');const {readFile}=await import('@tauri-apps/plugin-fs');
        const paths=await open({multiple:true,filters:[{name:t('timeline.importAudio'),extensions:['wav','mp3','m4a','aac','flac','ogg','opus','aif','aiff','caf']}]});
        if(!paths)return;const list=typeof paths==='string'?[paths]:paths;
        void handleImportFiles(list.map(path=>({name:path.split(/[\\/]/).pop()??path,filePath:path,read:async()=>{const bytes=await readFile(path);return bytes.byteOffset===0&&bytes.byteLength===bytes.buffer.byteLength?bytes.buffer as ArrayBuffer:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;}})),importTarget);
      }catch(error){setProjectError(String(error));}
    }else fileInputRef.current?.click();
  };

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
          store.loadProjectState(project, new Map([...useProjectStore.getState().sources,...sources]));
        } catch (err) {
          console.error(`Failed to open project ${file.name}:`, err);
          setProjectError(`${file.name}: ${String(err)}`);
        }
      }
      const audio = opened.filter((f) => !isProject(f.name));
      if (audio.length > 0) {
        await handleImportFiles(audio.map(f=>({name:f.name,read:async()=>f.bytes})),'new');
      }
    })();
  }, [pendingOpenedCount, audioEngine, store, handleImportFiles]);

  const fitAll = useCallback(() => {
    const state = useProjectStore.getState(), duration = timelineDuration(state.project);
    state.setZoomLevel(Math.max(.1, (canvasWidth - 8) / Math.max(.01, duration)));
    state.setScrollOffset(0);
    if (tracksAreaRef.current) {
      tracksAreaRef.current.scrollTop = 0;
      const room = tracksAreaRef.current.clientHeight - RULER_HEIGHT;
      state.setTrackHeight(Math.max(24, Math.min(120, room / Math.max(1, state.project.tracks.length + (state.project.video ? 1 : 0)))));
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
      const { project, sources } = await deserializeProject(json, ctx,async path=>{
        const {open}=await import('@tauri-apps/plugin-dialog');const replacement=await open({title:`${t('workspace.relink')}: ${path}`,multiple:false});return typeof replacement==='string'?replacement:null;
      });
      store.loadProjectState(project, new Map([...useProjectStore.getState().sources,...sources]));
    } catch (err) {
      console.error('Open project failed:', err);
      setProjectError(String(err));
    }
  }, [audioEngine, store, t]);

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
          onChange={(e) => { void handleImportFiles(fileInputs(Array.from(e.target.files??[]))); e.target.value = ''; }} />
        <ToolButton icon={FilePlus2} label={t('editor.newProject')} onClick={() => setResetOpen(true)}/>
        <ToolButton icon={FolderOpen} label={t('timeline.openProject')} onClick={() => void handleOpenProject()}/>
        <ToolButton icon={Save} label={t('timeline.saveProject')} onClick={() => void handleSaveProject()}/>
        <ToolButton icon={Upload} label={t('timeline.import')} onClick={() => askImport()}/>
        <ToolButton icon={Download} label={t('timeline.export')} disabled={exportStage !== null || store.project.duration <= 0} onClick={() => void handleExportMix()}/>
        <TrackFiles context={() => audioEngine.getContext()} onError={setProjectError} />
        <AutoSyncTracks onError={setProjectError} />
        <ToolButton icon={Library} label={t('workspace.title')} aria-pressed={workspace!==null} onClick={()=>setWorkspace(old=>old?null:'media')}/>
        <ToolButton icon={Undo2} label={t('timeline.undo')} onClick={handleUndo}/>
        <ToolButton icon={Redo2} label={t('timeline.redo')} onClick={handleRedo}/>
        <ToolButton icon={Plus} label={t('timeline.addTrack')} onClick={handleAddTrack}/>
        <ToolButton icon={MessageSquare} label={t('tts.title')} onClick={()=>useUIStore.getState().openModal('tts')}/>
        <ToolButton icon={CircleHelp} label={t('usability.help')} onClick={()=>setHelpOpen(true)}/>
        {exportStage && <div className="flex flex-wrap gap-2 items-center">
          <span role="status" className="text-sm text-gray-300">{t(`audioExport.${exportStage}`)}</span>
          {exportStage === 'rendering' && <span className="text-xs text-gray-400">{t('audioExport.renderCancelNote')}</span>}
          <button className="timeline-tool" onClick={cancelExport}>{t('audioExport.cancel')}</button>
        </div>}
        {exportError != null && <span role="alert" className="text-sm text-red-400">{t('audioExport.failed')}</span>}
      </div>

      <TimelineHelp open={helpOpen} onClose={()=>setHelpOpen(false)}/>
      <Modal isOpen={importOpen} onClose={()=>setImportOpen(false)} title={t('timeline.importAudio')}>
        <p className="text-sm text-gray-300 mb-3">{t('usability.importDestinationHelp')}</p>
        <label className="text-sm text-gray-300">{t('usability.destination')}
          <select aria-label={t('usability.destination')} value={importTarget} onChange={e=>setImportTarget(e.target.value)} className="block w-full bg-gray-800 rounded p-3 my-3">
            <option value="new">{t('usability.newTrackEach')}</option>
            {store.project.tracks.map(track=><option key={track.id} value={track.id}>{track.name}</option>)}
          </select>
        </label>
        <button className="timeline-tool" onClick={()=>void chooseImport()}>{t('usability.chooseFiles')}</button>
      </Modal>
      {importProgress&&<div role="status" className="flex items-center gap-2 px-3 py-2 text-xs text-gray-300">
        <span>{importProgress.index}/{importProgress.total} · {importProgress.name} · {t(`usability.${importProgress.phase}`)}</span>
        <button className="timeline-tool" onClick={()=>importAbort.current?.abort()}>{t('audioExport.cancel')}</button>
      </div>}
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
        <ToolButton icon={Magnet} label={t('timeline.snap')} aria-pressed={store.snapEnabled} onClick={()=>store.setSnapEnabled(!store.snapEnabled)}/>
        <ToolButton icon={AlignHorizontalJustifyCenter} label={t('alignment.title')} disabled={store.project.tracks.length<2} onClick={()=>{useProjectStore.getState().setIsPlaying(false);setAlignmentOpen(true);}}/>
        <select aria-label={t('alignment.display')} className="bg-gray-800 rounded min-h-11 px-2 text-xs text-gray-200" value={waveformMode} onChange={e=>setWaveformMode(e.target.value as 'normalized'|'level')}>
          <option value="normalized">{t('alignment.normalized')}</option><option value="level">{t('alignment.level')}</option>
        </select>
        <label className="text-xs text-gray-400 flex items-center gap-2">{t('editor.trackHeight')}
          <input aria-label={t('editor.trackHeight')} className="slider-styled w-24" type="range" min={24} max={640} value={store.trackHeight} onChange={e => store.setTrackHeight(+e.target.value)} />
        </label>
      </div>
      <TimelineActions onInspector={()=>setWorkspace('edit')} touchArrange={touchArrange} onTouchArrange={() => setTouchArrange((old) => !old)} />
      </div>

      {/* Main area: headers + canvas */}
      <div className="timeline-workarea flex flex-1 min-h-0 relative">
      <div ref={tracksAreaRef} className="timeline-tracks-area relative flex flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
        onTouchStart={e => { const p = e.touches[0]; if (!touchArrange && p && !(e.target as HTMLElement).closest('[data-timeline-playhead], [data-track-reorder]')) touchPan.current = {x:p.clientX,y:p.clientY,scroll:useProjectStore.getState().scrollOffset}; }}
        onTouchEnd={() => {touchPan.current=null;}}
        onTouchMove={e => { const start=touchPan.current, p=e.touches[0]; if (!start || !p || touchArrange) return; const dx=start.x-p.clientX; if (Math.abs(dx) > Math.abs(start.y-p.clientY)+8) { const state=useProjectStore.getState(); state.setScrollOffset(Math.min(Math.max(0,timelineDuration(state.project)-canvasWidth/state.zoomLevel),Math.max(0,start.scroll+dx/state.zoomLevel))); } }} >
        {!store.project.tracks.length && !store.project.video && <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 p-5 bg-gray-950 text-center">
          <Upload className="w-10 h-10 text-indigo-400" />
          <h2 className="text-lg font-semibold text-gray-100">{t('timeline.startTitle')}</h2>
          <p className="text-sm text-gray-400 max-w-md">{t('timeline.startHelp')}</p>
          <button className="timeline-tool !bg-indigo-600 !border-indigo-500" onClick={() => askImport()}>{t('timeline.importAudio')}</button>
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

          {store.project.video && <div data-track-header data-compact={store.trackHeight<56} data-touch-compact={store.trackHeight<96} className="shrink-0 px-3 flex flex-col justify-center overflow-hidden gap-1 border-b border-gray-700 bg-violet-950/30" style={{ height: store.trackHeight }}>
            <div className="track-heading flex items-center justify-between gap-2"><span className="text-sm font-medium text-violet-200">{t('video.track')}</span>
              <button type="button" className="p-1 text-gray-400 hover:text-red-400" aria-label={t('usability.removeVideo')} title={t('usability.removeVideo')} onClick={()=>{
                const state=useProjectStore.getState();const groups=new Set(state.project.video?.clips?.map(clip=>clip.linkGroup).filter(Boolean));
                const project={...state.project,video:undefined,tracks:state.project.tracks.map(track=>({...track,segments:track.segments.map(clip=>clip.linkGroup&&groups.has(clip.linkGroup)?{...clip,linkGroup:undefined}:clip)}))};
                useProjectStore.setState({project:{...project,duration:timelineDuration(project)},selection:null,isPlaying:false});
              }}><Trash2 size={14}/></button></div>
            {store.trackHeight>=56&&<span className="track-subtitle text-xs text-gray-400">{t('editing.alignedVideoTrack')}</span>}
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
                    onClick={() => askImport()}
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

          {store.project.video && <VideoLane width={canvasWidth} touchArrange={touchArrange} />}

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
                askImport(Array.from(e.dataTransfer.files));
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

      {workspace&&<TimelineWorkspace tab={workspace} onTab={setWorkspace} onClose={()=>setWorkspace(null)}/>}
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
