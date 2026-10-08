import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readFile, remove } from '@tauri-apps/plugin-fs';
import { Modal } from '../common/Modal';
import { useProjectStore } from '../../stores/projectStore';
import { canAlign, projectFromSession } from '../../lib/media';
import type { SyncSession } from '../../lib/media';
import type { TimelineEngine } from '../../audio/engine/TimelineEngine';
import { encodeAudioBufferWav } from '../../lib/wavExport';
import { hasRecoverableAutosave, restoreAutosaveAudio } from '../../hooks/useAutosave';

interface Props { engine: React.RefObject<TimelineEngine | null> }

export function InterviewTools({ engine }: Props) {
  const { t } = useTranslation();
  const [available, setAvailable] = useState(false);
  const [show, setShow] = useState(false);
  const [setup, setSetup] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState('');
  const [selectedAudio, setSelectedAudio] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(true);
  const [session, setSession] = useState<SyncSession | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [recoverable, setRecoverable] = useState(hasRecoverableAutosave);
  const [matchLevels, setMatchLevels] = useState(false);
  const video = useProjectStore((s) => s.project.video);
  const playing = useProjectStore((s) => s.isPlaying);
  const tracks = useProjectStore((s) => s.project.tracks);
  const videoRef = useRef<HTMLVideoElement>(null);
  const actionRef = useRef(false);

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    invoke<boolean>('desktop_media_available').then(setAvailable).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    if (video && available) {
      invoke<string>('prepare_video_preview', { path: video.path }).then((path) => {
        if (active) setPreviewUrl(convertFileSrc(path));
      }).catch((err) => { if (active) setError(String(err)); });
    }
    return () => { active = false; };
  }, [video, available]);

  // Use the same timeline position for video and audio; never use camera audio
  // alongside the selected timeline microphone. Avoid seeking on every frame.
  useEffect(() => {
    const sync = () => {
      const el = videoRef.current;
      if (!el) return;
      const state = useProjectStore.getState();
      if (Math.abs(el.currentTime - state.playheadPosition) > 0.08) el.currentTime = state.playheadPosition;
      if (state.isPlaying && el.paused) void el.play().catch((err) => setError(String(err)));
      if (!state.isPlaying && !el.paused) el.pause();
    };
    const unsubscribe = useProjectStore.subscribe(sync);
    const element = videoRef.current;
    sync();
    return () => { unsubscribe(); element?.pause(); };
  }, [previewUrl, showPreview]);

  async function perform(stage: string, task: () => Promise<void>) {
    if (actionRef.current) return;
    actionRef.current = true;
    useProjectStore.getState().setIsPlaying(false);
    setError(''); setNotice(''); setBusy(stage);
    try { await task(); } catch (err) { setError(String(err)); }
    finally { actionRef.current = false; setBusy(''); }
  }

  const chooseVideo = () => perform(t('interview.loading'), async () => {
    const file = await open({ multiple: false, filters: [{ name: t('interview.video'), extensions: ['mp4', 'mov', 'mkv', 'm4v'] }] });
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
    if (!state.project.video || !engine.current) return;
    const output = await save({ defaultPath: `${state.project.name}.edited.mp4`, filters: [{ name: 'MP4', extensions: ['mp4'] }] });
    if (!output) return;
    const rendered = await engine.current.renderToBuffer(state.project, 0, state.project.video.duration);
    const wav = await encodeAudioBufferWav(rendered, 24);
    const mix = await invoke<string>('stage_share_file', new Uint8Array(await wav.arrayBuffer()), {
      headers: { 'x-file-name': `video-mix-${crypto.randomUUID()}.wav` },
    });
    try {
      await invoke('export_media', { session: state.project.video.session, output, mix });
      setNotice(t('interview.exported', { path: output }));
    } finally { await remove(mix).catch(() => {}); }
  });

  const button = 'min-h-11 px-4 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-40';
  if (!available) return <details className="shrink-0 px-3 py-2 border-b border-gray-800 text-sm text-gray-400">
    <summary className="cursor-pointer min-h-11 flex items-center">{t('interview.mobileTitle')}</summary>
    <p className="pb-2 max-w-2xl">{t('interview.mobileHelp')}</p>
  </details>;
  return <>
    <section className="shrink-0 border-b border-gray-800 bg-gray-900/70 px-3 py-3" aria-label={t('interview.title')}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-40">
          <h2 className="font-semibold text-gray-100 text-sm">{video ? t('interview.editTitle') : t('interview.title')}</h2>
          <p className="text-xs text-gray-400 mt-1">{video ? t('interview.editHelp') : t('interview.steps')}</p>
        </div>
        <button className={`${button} !bg-indigo-600 !border-indigo-500`} disabled={!!busy || playing} onClick={() => setSetup(true)}>{t('interview.sync')}</button>
        {video && <button className={button} disabled={!!busy || playing} onClick={exportVideo}>{t('interview.exportVideo')}</button>}
        <details className="relative">
          <summary className={`${button} cursor-pointer flex items-center`}>{t('interview.more')}</summary>
          <div className="absolute right-0 top-full mt-2 z-20 p-2 rounded-xl border border-gray-700 bg-gray-900 shadow-xl w-64 space-y-2">
            <button className={`${button} w-full text-left`} disabled={!!busy || playing} onClick={loadSession}>{t('interview.openSession')}</button>
            {recoverable && <button className={`${button} w-full text-left`} disabled={!!busy || playing} onClick={recover}>{t('interview.recover')}</button>}
          </div>
        </details>
      </div>
      {busy && <p role="status" className="text-sm text-indigo-300 mt-2">{busy}</p>}
      {error && <p role="alert" className="text-sm text-red-300 break-words mt-2">{error}</p>}
      {notice && <p role="status" className="text-sm text-green-300 break-words mt-2">{notice}</p>}
      {video && <div className="mt-3 flex flex-wrap gap-3 items-start">
        {showPreview && previewUrl && <video key={previewUrl} ref={videoRef} src={previewUrl} muted playsInline preload="metadata"
          aria-label={t('interview.preview')} className="bg-black rounded-xl w-64 max-w-full max-h-36 object-contain"
          onLoadedMetadata={() => { if (videoRef.current) videoRef.current.currentTime = useProjectStore.getState().playheadPosition; }}
          onError={() => setError(t('interview.previewFailed'))} />}
        <div className="flex-1 min-w-40">
          <p className="text-xs text-gray-400 mb-2">{t('interview.listenHelp')}</p>
          <div className="flex flex-wrap gap-2">{tracks.map((track) => <button key={track.id} className={button}
            aria-pressed={!track.muted && !tracks.some((other) => other.id !== track.id && !other.muted)}
            onClick={() => {
              const state = useProjectStore.getState();
              tracks.forEach((other) => state.updateTrack(other.id, { muted: other.id !== track.id, solo: false }));
            }}>{track.name}</button>)}</div>
          <button className="min-h-11 text-xs text-gray-400 underline" onClick={() => setShowPreview((old) => !old)}>{t(showPreview ? 'interview.hidePreview' : 'interview.showPreview')}</button>
        </div>
      </div>}
    </section>
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
      <button className={`${button} mt-4 !bg-indigo-600`} disabled={!!busy || !selectedVideo || !selectedAudio.length} onClick={analyze}>{busy || t('interview.analyze')}</button>
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
