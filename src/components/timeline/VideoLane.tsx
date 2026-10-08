import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { useProjectStore } from '../../stores/projectStore';
import { useTimelineCanvasPlayhead } from './useTimelineCanvasPlayhead';

export const VIDEO_LANE_HEIGHT = 76;
function waitFor(video: HTMLVideoElement, event: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timeout); video.removeEventListener(event, ready); video.removeEventListener('error', fail); signal.removeEventListener('abort', fail); };
    const ready = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('Video thumbnail unavailable')); };
    const timeout = setTimeout(fail, 15000);
    video.addEventListener(event, ready, { once: true }); video.addEventListener('error', fail, { once: true }); signal.addEventListener('abort', fail, { once: true });
    if (signal.aborted) fail();
  });
}

export function VideoLane({ width }: { width: number }) {
  const { t } = useTranslation();
  const video = useProjectStore((s) => s.project.video);
  const zoom = useProjectStore((s) => s.zoomLevel);
  const scroll = useProjectStore((s) => s.scrollOffset);
  const cursor = useTimelineCanvasPlayhead(width);
  const [thumbs, setThumbs] = useState<{ time: number; url: string }[]>([]);
  const [failed, setFailed] = useState(false);
  const videoPath = video?.path, duration = video?.duration;
  useEffect(() => {
    if (!videoPath || !duration || !('__TAURI_INTERNALS__' in window)) return;
    const abort = new AbortController();
    const element = document.createElement('video');
    element.muted = true; element.playsInline = true; element.preload = 'auto'; element.crossOrigin = 'anonymous';
    const make = async () => {
      try {
        const path = await invoke<string>('prepare_video_preview', { path: videoPath });
        if (abort.signal.aborted) return;
        setThumbs([]); setFailed(false);
        const loaded = waitFor(element, 'loadeddata', abort.signal);
        element.src = convertFileSrc(path); element.load(); await loaded;
        const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
        const context = canvas.getContext('2d'); if (!context) return;
        const result: { time: number; url: string }[] = [];
        for (let i = 0; i < 8; i++) {
          const time = Math.min(duration * i / 8, Math.max(0, duration - 0.05));
          if (Math.abs(element.currentTime - time) > 0.001) {
            const seeked = waitFor(element, 'seeked', abort.signal); element.currentTime = time; await seeked;
          }
          if (abort.signal.aborted) return;
          context.drawImage(element, 0, 0, 160, 90);
          result.push({ time, url: canvas.toDataURL('image/jpeg', 0.65) });
          setThumbs([...result]);
        }
        setFailed(false);
      } catch { if (!abort.signal.aborted) setFailed(true); }
      finally { element.removeAttribute('src'); element.load(); }
    };
    void make();
    return () => { abort.abort(); element.removeAttribute('src'); element.load(); };
  }, [videoPath, duration]);
  if (!video) return null;
  const start = video.inPoint ?? 0, end = video.outPoint ?? video.duration;
  const left = -scroll * zoom, size = video.duration * zoom;
  const seek = (x: number) => useProjectStore.getState().setPlayheadPosition(Math.max(0, Math.min(video.duration, scroll + x / zoom)));
  return <div className="relative shrink-0 overflow-hidden bg-violet-950/20 border-b border-gray-700" style={{ height: VIDEO_LANE_HEIGHT, width }}>
    <button className="absolute top-1 bottom-1 rounded border border-violet-400 bg-violet-900/30 overflow-hidden text-left"
      style={{ left, width: Math.max(1, size), minHeight: 0, minWidth: 0 }} aria-label={t('video.seek')}
      onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const state = useProjectStore.getState(); state.setPlayheadPosition(Math.max(0, Math.min(video.duration, state.playheadPosition + (e.key === 'ArrowLeft' ? -1 : 1) / 30))); } }}
      onClick={(e) => { if (e.detail === 0) return; const rect = e.currentTarget.parentElement!.getBoundingClientRect(); seek(e.clientX - rect.left); }}>
      <div className="absolute inset-0 opacity-70 pointer-events-none">
        {thumbs.map((thumb) => <img key={thumb.time} src={thumb.url} alt="" className="absolute h-full object-cover" style={{ left: thumb.time * zoom, width: Math.max(80, video.duration / 8 * zoom) }} />)}
      </div>
      <span className="absolute left-2 top-1 px-1 rounded bg-black/70 text-xs text-white pointer-events-none">{video.path.split(/[\\/]/).pop()}</span>
      {failed && <span className="absolute bottom-1 left-2 text-xs text-gray-300">{t('video.noThumbnails')}</span>}
    </button>
    {start > 0 && <div className="absolute inset-y-0 left-0 bg-black/65 pointer-events-none" style={{ width: Math.max(0, (start - scroll) * zoom) }} />}
    {end < video.duration && <div className="absolute inset-y-0 right-0 bg-black/65 pointer-events-none" style={{ left: Math.max(0, (end - scroll) * zoom) }} />}
    {[start, end].map((time, i) => <div key={i} className="absolute inset-y-0 border-l-2 border-emerald-400 pointer-events-none" style={{ left: (time - scroll) * zoom }}><span className="text-[10px] bg-emerald-950 text-emerald-200 px-1">{i ? 'OUT' : 'IN'}</span></div>)}
    <div ref={cursor} className="absolute inset-y-0 w-px bg-red-400 pointer-events-none" />
  </div>;
}
