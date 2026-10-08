import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { useProjectStore } from '../../stores/projectStore';
import { PlayheadHandle } from './PlayheadHandle';
import { videoClips } from '../../lib/videoEditing';
import { timelineDuration } from '../../lib/timelineView';
import { updateVideoClips } from '../../lib/timelineEditing';
import { snapClipStart } from '../../lib/timelineSnap';
import { projectHistoryGesture } from '../../stores/projectStore';

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
  const total = useProjectStore(s => Math.max(.01,timelineDuration(s.project)));
  const selection = useProjectStore(s => s.selection);
  const selected=selection?.segmentIds??[];
  const drag = useRef<{id:string;x:number;start:number;clips:ReturnType<typeof videoClips>}|null>(null);
  useEffect(()=>()=>{if(drag.current){drag.current=null;projectHistoryGesture.end();}},[]);
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
  const scale=width/total, clips=videoClips(video);
  const start=video.inPoint ?? 0,end=video.outPoint ?? total;
  return <div className="relative shrink-0 overflow-hidden bg-violet-950/20 border-b border-gray-700" style={{height:VIDEO_LANE_HEIGHT,width}} data-video-overview>
    <div className="absolute inset-0" onPointerDown={e=>{const rect=e.currentTarget.getBoundingClientRect();const state=useProjectStore.getState();state.setIsPlaying(false);state.setSelection(null);state.setPlayheadPosition(Math.max(0,Math.min(total,(e.clientX-rect.left)/scale)));}}/>
    {clips.map(clip=><button key={clip.id} className={`absolute top-1 bottom-5 rounded border overflow-hidden text-left ${selected.includes(clip.id)?'border-yellow-300 ring-1 ring-yellow-300':'border-violet-400'}`}
      style={{left:clip.startTime*scale,width:Math.max(2,clip.duration*scale),minHeight:0,minWidth:0,touchAction:'none',background:'#312e81'}} aria-label={`${t('editing.videoClip')} ${clip.sourceOffset.toFixed(3)} s`}
      onPointerDown={e=>{e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);const state=useProjectStore.getState();state.setIsPlaying(false);state.setSelection({startTime:clip.startTime,endTime:clip.startTime+clip.duration,segmentIds:[clip.id]});projectHistoryGesture.begin();drag.current={id:clip.id,x:e.clientX,start:clip.startTime,clips};}}
      onPointerMove={e=>{const moving=drag.current;if(!moving || moving.id!==clip.id || Math.abs(e.clientX-moving.x)<3)return;const state=useProjectStore.getState();const edges=[0,state.playheadPosition,...moving.clips.filter(c=>c.id!==clip.id).flatMap(c=>[c.startTime,c.startTime+c.duration])];const time=snapClipStart(moving.start+(e.clientX-moving.x)/scale,clip.duration,edges,scale,state.snapEnabled&&!e.altKey);updateVideoClips(moving.clips.map(c=>c.id===clip.id?{...c,startTime:time}:c));}}
      onPointerUp={e=>{if(!drag.current)return;e.currentTarget.releasePointerCapture(e.pointerId);drag.current=null;projectHistoryGesture.end();}}
      onPointerCancel={()=>{drag.current=null;projectHistoryGesture.end();}}>
      <div className="absolute inset-0 opacity-70 pointer-events-none">{thumbs.filter(thumb=>thumb.time>=clip.sourceOffset&&thumb.time<clip.sourceOffset+clip.duration).map(thumb=><img key={thumb.time} src={thumb.url} alt="" className="absolute h-full object-cover" style={{left:(thumb.time-clip.sourceOffset)*scale,width:Math.max(40,video.duration/8*scale)}}/>)}</div>
      <span className="absolute left-1 top-0 px-1 rounded bg-black/70 text-[10px] text-white pointer-events-none">{clip.sourceOffset.toFixed(2)}–{(clip.sourceOffset+clip.duration).toFixed(2)}s{clip.transition!=='cut'?` · ${t(`editing.transition_${clip.transition}`)}`:''}</span>
      {failed&&<span className="absolute bottom-0 left-1 text-xs text-gray-300">{t('video.noThumbnails')}</span>}
      {clip.fadeIn>0&&<span className="absolute bottom-0 left-0 border-b border-white/70" style={{width:clip.fadeIn*scale,transform:'rotate(-15deg)',transformOrigin:'left'}}/>}
      {clip.fadeOut>0&&<span className="absolute bottom-0 right-0 border-b border-white/70" style={{width:clip.fadeOut*scale,transform:'rotate(15deg)',transformOrigin:'right'}}/>}
    </button>)}
    <div className="absolute bottom-0 h-4 text-[10px] text-violet-200 pointer-events-none">{t('editing.videoOverview')} · 0–{total.toFixed(2)} s</div>
    <div className="absolute bottom-0 h-4 border border-sky-300 bg-sky-400/20 pointer-events-none" style={{left:Math.min(width,scroll*scale),width:Math.max(0,Math.min(width-scroll*scale,width/zoom*scale))}} title={t('editing.audioWindow')}/>
    {[start,end].map((time,i)=><div key={i} className="absolute inset-y-0 border-l border-emerald-400 pointer-events-none" style={{left:time*scale}}><span className="absolute bottom-4 text-[9px] bg-emerald-950 text-emerald-200">{i?'OUT':'IN'}</span></div>)}
    <PlayheadHandle width={width} overviewDuration={total}/>
  </div>;
}
