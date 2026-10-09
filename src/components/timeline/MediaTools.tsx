import { createPortal } from 'react-dom';
import { OverflowMenu } from '../common/OverflowMenu';
import { ToolButton } from '../common/ToolButton';
import { Film, Clapperboard } from 'lucide-react';
import { videoClips, videoTimelineDuration, validateVideoClips } from '../../lib/videoEditing';
import { timelineDuration } from '../../lib/timelineView';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { VideoViewer } from './VideoViewer';
import { Modal } from '../common/Modal';
import { useProjectStore } from '../../stores/projectStore';
import { canAlign, projectFromSession } from '../../lib/media';
import type { SyncSession } from '../../lib/media';
import type { TimelineEngine } from '../../audio/engine/TimelineEngine';
import { exportVideoProject } from '../../lib/videoProjectExport';
import { hasRecoverableAutosave, restoreAutosaveAudio } from '../../hooks/useAutosave';

interface Props { engine: React.RefObject<TimelineEngine | null>; panelTarget: HTMLElement | null }

export function MediaTools({ engine, panelTarget }: Props) {
  const { t } = useTranslation();
  const [exportOptions,setExportOptions]=useState(false);
  const [videoFormat,setVideoFormat]=useState('mp4');
  const [mediaBackend,setMediaBackend]=useState(navigator.userAgent.includes('Mac')?'apple':'ffmpeg');
  const [available, setAvailable] = useState(false);
  const [show, setShow] = useState(false);
  const [setup, setSetup] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState('');
  const [selectedAudio, setSelectedAudio] = useState<string[]>([]);
  const [session, setSession] = useState<SyncSession | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [recoverable, setRecoverable] = useState(hasRecoverableAutosave);
  const [matchLevels, setMatchLevels] = useState(false);
  const video = useProjectStore((s) => s.project.video);
  const playing = useProjectStore((s) => s.isPlaying);
  const actionRef = useRef(false);
  const exportAbort=useRef<AbortController|null>(null);
  useEffect(()=>()=>{exportAbort.current?.abort();},[]);

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    invoke<boolean>('desktop_media_available').then(setAvailable).catch(() => {});
  }, []);

  async function perform(stage: string, task: () => Promise<void>) {
    if (actionRef.current) return;
    actionRef.current = true;
    useProjectStore.getState().setIsPlaying(false);
    setError(''); setNotice(''); setBusy(stage);
    try { await task(); } catch (err) { setError(String(err)); }
    finally { actionRef.current = false;exportAbort.current=null;setBusy(''); }
  }

  const chooseVideo = () => perform(t('interview.loading'), async () => {
    const file = await open({ multiple: false, filters: [{ name: t('interview.video'), extensions: ['mp4', 'mov', 'mkv', 'm4v', 'webm', 'avi', 'ogv', 'mpeg', 'mpg'] }] });
    if (typeof file === 'string') setSelectedVideo(file);
  });
  const chooseAudio = () => perform(t('interview.loading'), async () => {
    const files = await open({ multiple: true, filters: [{ name: t('interview.audio'), extensions: ['wav', 'flac', 'm4a', 'mp3', 'aiff'] }] });
    if (files) setSelectedAudio(Array.isArray(files) ? files : [files]);
  });
  const analyze = () => perform(t('interview.analyzing'), async () => {
    const next = await invoke<SyncSession>('analyze_media', { video: selectedVideo, audio: selectedAudio });
    setSession(next); setSetup(false); setShow(true);
  });

  const loadSession = () => perform(t('interview.loading'), async () => {
    const file = await open({ multiple: false, filters: [{ name: t('interview.session'), extensions: ['json'] }] });
    if (typeof file !== 'string') return;
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const loaded = JSON.parse(await readTextFile(file)) as SyncSession;
    if (loaded.format !== 'crispaudio-sync' || loaded.version !== 1 || !Array.isArray(loaded.tracks)) throw new Error(t('interview.invalidSession'));
    setSession(loaded); setShow(true);
  });

  const recover = () => perform(t('interview.loading'), async () => {
    if (useProjectStore.getState().project.tracks.some((track) => track.segments.length) && !window.confirm(t('interview.replace'))) return;
    await restoreAutosaveAudio(new OfflineAudioContext(2, 1, 48000));
    setRecoverable(false);
  });

  const importSession = () => perform(t('interview.aligning'), async () => {
    if (!session || !canAlign(session)) return;
    const existing = useProjectStore.getState();
    if (existing.project.tracks.some((track) => track.segments.length) && !window.confirm(t('interview.replace'))) return;
    let aligned = session;
    if (!session.tracks.every((track) => track.aligned_path) || !session.camera_path) {
      const directory = await open({ directory: true, multiple: false });
      if (typeof directory !== 'string') return;
      // A fresh subdirectory makes repeated attempts safe and preserves prior renders.
      const outputDir = `${directory}/CrispAudio-${crypto.randomUUID()}`;
      aligned = await invoke<SyncSession>('align_media', { session, outputDir, allowUncertain: false });
    }
    const ctx = new OfflineAudioContext(2, 1, 48000);
    const imported = await projectFromSession(aligned, async (path) => {
      const bytes = await readFile(path);
      return ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    }, matchLevels);
    // Keep old buffers available for undo; only replace after every new file decoded.
    const sources = new Map([...existing.sources, ...imported.sources]);
    existing.loadProjectState(imported.project, sources);
    setSession(aligned); setShow(false);
  });

  const exportVideo = () => perform(t('interview.exporting'), async () => {
    const state = useProjectStore.getState();
    if (!state.project.video) return;
    const ext=['vp9','av1'].includes(videoFormat)?'webm':videoFormat;
    const output = await save({ defaultPath: `${state.project.name}.edited.${ext}`, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!output) return;
    if(state.project.video.clips){const error=validateVideoClips(videoClips(state.project.video),state.project.video.duration,state.project.video.sources);if(error)throw new Error(error);}
    const controller=new AbortController();exportAbort.current=controller;
    await exportVideoProject({ project: state.project, sources: state.sources,
      engine: engine.current, output, backend: mediaBackend, format: videoFormat,
      nativeMac: navigator.userAgent.includes('Mac') }, controller.signal);
    setExportOptions(false);
    setNotice(t('interview.exported', { path: output }));
  });

  const button = 'min-h-11 px-4 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-40';
  const controls = (<div className="timeline-media-actions">
        <ToolButton data-help="sync" icon={Film} label={t('interview.sync')} className="!bg-indigo-600 !border-indigo-500" disabled={!!busy || playing} onClick={() => setSetup(true)}/>
        {video && <ToolButton icon={Clapperboard} disabled={!!busy || playing || !videoTimelineDuration(video)} onClick={()=>setExportOptions(true)} label={t((video.inPoint ?? 0)>0 || (video.outPoint ?? videoTimelineDuration(video))<videoTimelineDuration(video)?'video.exportSection':'interview.exportVideo')}/>}
        <OverflowMenu label={t('interview.more')}>
            <button role="menuitem" className={`${button} w-full text-left`} disabled={!!busy || playing} onClick={loadSession}>{t('interview.openSession')}</button>
            {video && <button role="menuitem" className={`${button} w-full text-left`} disabled={!!busy || playing} onClick={()=>{
              const state=useProjectStore.getState(), project={...state.project,video:undefined};
              useProjectStore.setState({project:{...project,duration:timelineDuration(project)},isPlaying:false});
            }}>{t('editor.detachVideo')}</button>}
            {recoverable && <button role="menuitem" className={`${button} w-full text-left`} disabled={!!busy || playing} onClick={recover}>{t('interview.recover')}</button>}
        </OverflowMenu>
      </div>);
  if (!available) return null;
  return <>
    {controls}
    {panelTarget && (video || busy || error || notice) && createPortal(<section className="relative z-30 shrink-0 border-b border-gray-800 bg-gray-900/70 px-3 py-1" aria-label={t('interview.title')}>
      {busy && <p role="status" className="text-sm text-indigo-300 mt-2">{busy}{busy===t('interview.exporting')&&<button className="timeline-tool" onClick={()=>{exportAbort.current?.abort();}}>{t('common.cancel')}</button>}</p>}
      {error && !exportOptions && <p role="alert" className="text-sm text-red-300 break-words mt-2">{error}</p>}
      {notice && <p role="status" className="text-sm text-green-300 break-words mt-2">{notice}</p>}
      {video && <VideoViewer/>}
    </section>, panelTarget)}
    <Modal isOpen={exportOptions} onClose={()=>{if(!busy)setExportOptions(false);}} title={t('mediaFormats.title')} widthClass="max-w-lg">
      <div className="space-y-4">
        <label className="block text-sm">{t('mediaFormats.format')}<select aria-label={t('mediaFormats.format')} value={videoFormat} disabled={!!busy} className="w-full bg-gray-800 p-2 rounded mt-2" onChange={e=>{setVideoFormat(e.target.value);if(['vp9','av1'].includes(e.target.value))setMediaBackend('ffmpeg');}}>
          <option value="mp4">MP4 · H.264 / AAC</option><option value="mov">MOV · H.264 / AAC</option><option value="vp9">WebM · VP9 / Opus</option><option value="av1">WebM · AV1 / Opus</option>
        </select></label>
        <label className="block text-sm">{t('mediaFormats.backend')}<select aria-label={t('mediaFormats.backend')} value={mediaBackend} disabled={!!busy} className="w-full bg-gray-800 p-2 rounded mt-2" onChange={e=>setMediaBackend(e.target.value)}>
          <option value="apple" disabled={['vp9','av1'].includes(videoFormat)}>{t('mediaFormats.apple')}</option><option value="ffmpeg">{t('mediaFormats.ffmpeg')}</option><option value="auto">{t('mediaFormats.auto')}</option>
        </select></label>
        <p className="text-sm text-gray-400">{t(mediaBackend==='apple'?'mediaFormats.appleHelp':'mediaFormats.ffmpegHelp')}</p>
        {error && <p role="alert" className="text-sm text-red-300 break-words">{error}</p>}
        <button className={button} disabled={!!busy||playing} onClick={exportVideo}>{t('mediaFormats.export')}</button>
        {busy && <div role="status" className="text-sm text-indigo-300">{busy}<button className="timeline-tool ml-2" onClick={()=>{exportAbort.current?.abort();}}>{t('common.cancel')}</button></div>}
      </div>
    </Modal>
    <Modal isOpen={setup} onClose={() => { if (!busy) setSetup(false); }} title={t('interview.sync')} widthClass="max-w-2xl">
      <ol className="space-y-5 text-sm text-gray-300">
        <li><h3 className="font-semibold mb-2">{t('interview.pickVideo')}</h3>
          <button className={button} disabled={!!busy} onClick={chooseVideo}>{t('interview.video')}</button>
          <p className="break-all mt-2 text-gray-400">{selectedVideo || t('interview.notSelected')}</p>
        </li>
        <li><h3 className="font-semibold mb-2">{t('interview.pickAudio')}</h3>
          <button className={button} disabled={!!busy} onClick={chooseAudio}>{t('interview.audio')}</button>
          <ul className="mt-2 text-gray-400">{selectedAudio.map((path) => <li className="break-all" key={path}>{path}</li>)}</ul>
          {!selectedAudio.length && <p className="mt-2 text-gray-400">{t('interview.notSelected')}</p>}
        </li>
      </ol>
      <p className="text-sm text-gray-400 mt-4">{t('interview.setupHelp')}</p>
      {error && <p role="alert" className="text-red-300 mt-2">{error}</p>}
      <button className={`${button} mt-4 !bg-indigo-600`} disabled={!!busy || !selectedVideo} onClick={analyze}>{busy || t('interview.analyze')}</button>
    </Modal>
    <Modal isOpen={show} onClose={() => { if (!busy) setShow(false); }} title={t('interview.review')} widthClass="max-w-3xl">
      <p className="text-sm text-gray-300 mb-3">{t('interview.reviewHelp')}</p>
      <div className="space-y-3 max-h-[55vh] overflow-y-auto">
        {session?.tracks.map((track, i) => <div key={track.source.path} className="border border-gray-700 p-3 rounded text-sm">
          <p className="text-gray-100 break-all">{track.source.path.split(/[\\/]/).pop()}</p>
          <p className={track.alignment.reliable ? 'text-green-300' : 'text-amber-300'}>
            {t(track.alignment.reliable ? 'interview.reliable' : 'interview.uncertain')}
            {' · '}{t('interview.metrics', { score: track.alignment.confidence.toFixed(2), ppm: ((track.alignment.rate - 1) * 1e6).toFixed(1), residual: track.alignment.residual_ms.toFixed(1) })}
          </p>
          <label className="flex flex-wrap items-center gap-2 mt-2 min-h-11">{t('interview.offset')}
            <input type="number" step="0.001" value={track.alignment.offset} disabled={!!busy}
              className="bg-gray-900 border border-gray-600 rounded p-2 min-h-11 w-36"
              onChange={(event) => {
                const offset = event.currentTarget.valueAsNumber;
                if (!Number.isFinite(offset)) return;
                setSession((old) => old && ({ ...old, camera_path: null, tracks: old.tracks.map((tr, n) => n === i ? {
                  ...tr, aligned_path: null, alignment: { ...tr.alignment, offset, reliable: false, manual: false },
                } : { ...tr, aligned_path: null }) }));
              }} />
          </label>
          <label className="flex flex-wrap items-center gap-2 mt-2 min-h-11"><input type="checkbox" checked={track.alignment.manual} disabled={!!busy}
            onChange={(event) => {
              const manual = event.currentTarget.checked;
              setSession((old) => old && ({ ...old, tracks: old.tracks.map((tr, n) => n === i ? { ...tr, alignment: { ...tr.alignment, manual } } : tr) }));
            }} />{t('interview.confirmOffset')}</label>
        </div>)}
      </div>
      <label className="flex gap-2 text-sm text-gray-300 mt-3">
        <input type="checkbox" checked={matchLevels} disabled={!!busy} onChange={(event) => setMatchLevels(event.currentTarget.checked)} />
        {t('interview.matchLevels')}
      </label>
      {error && <p role="alert" className="text-red-300 text-sm mt-2">{error}</p>}
      <button className={`${button} mt-4`} disabled={!!busy || !session || !canAlign(session)} onClick={importSession}>
        {busy || t('interview.import')}
      </button>
    </Modal>
  </>;
}
