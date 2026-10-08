import { convertFileSrc } from '@tauri-apps/api/core';
import { mediaJob } from '../../lib/mediaJob';
import { linkedIds, moveClips, trimClips } from '../../lib/projectEdits';
import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { previewUrl } from '../../lib/previewCache';
import { useProjectStore } from '../../stores/projectStore';
import { PlayheadHandle } from './PlayheadHandle';
import { videoClips, clipSource, frameTime } from '../../lib/videoEditing';
import { timelineDuration } from '../../lib/timelineView';
import { snapClipStart } from '../../lib/timelineSnap';
import { projectHistoryGesture } from '../../stores/projectStore';

const thumbnailCache=new Map<string,{time:number;url:string}[]>();
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

async function decodedVideoFrame(video:HTMLVideoElement,signal:AbortSignal):Promise<void>{
  if(!video.requestVideoFrameCallback)return;
  await new Promise<void>(resolve=>{
    const done=()=>{clearTimeout(timer);video.cancelVideoFrameCallback(callback);signal.removeEventListener('abort',done);resolve();};
    const timer=setTimeout(done,120);signal.addEventListener('abort',done,{once:true});const callback=video.requestVideoFrameCallback(done);
    if(signal.aborted)done();
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
  const drag = useRef<{id:string;x:number;start:number;kind:'move'|'left'|'right';clips:ReturnType<typeof videoClips>;project:ReturnType<typeof useProjectStore.getState>['project']}|null>(null);
  useEffect(()=>()=>{if(drag.current){drag.current=null;projectHistoryGesture.end();}},[]);
  const [thumbs, setThumbs] = useState<{ time: number; url: string }[]>([]);
  const [failed, setFailed] = useState(false);
  const selectedSource=clipSource(video,videoClips(video).find(c=>selected.includes(c.id)));
  const videoPath = selectedSource?.path, duration = selectedSource?.duration;
  useEffect(() => {
    if (!videoPath || !duration || !('__TAURI_INTERNALS__' in window)) return;
    const cacheKey=`decoded-v2:${videoPath}:${duration}`;const cached=thumbnailCache.get(cacheKey);if(cached){let active=true;queueMicrotask(()=>{if(active){setThumbs(cached);setFailed(false);}});return()=>{active=false;};}
    const abort = new AbortController();
    const element = document.createElement('video');
    element.muted = true; element.playsInline = true; element.preload = 'auto'; element.crossOrigin = 'anonymous';
    const make = async () => {
      try {
        let firstTile:string|undefined;
        try{const first=await mediaJob<string>('prepare_media_asset',{path:videoPath,proxy:false,thumbnail:true},abort.signal);if(first)firstTile=convertFileSrc(first);}catch{/* Browser capture remains available if native preparation fails. */}
        if(abort.signal.aborted)return;
        const url = await previewUrl(videoPath);
        if (abort.signal.aborted) return;
        setThumbs(firstTile?[{time:0,url:firstTile}]:[]); setFailed(false);
        const loaded = waitFor(element, 'loadeddata', abort.signal);
        element.src = url; element.load(); await loaded;
        const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
        const context = canvas.getContext('2d'); if (!context) return;
        const result: { time: number; url: string }[] = [];
        for (let i = 0; i < 8; i++) {
          const time = Math.min(duration * i / 8, Math.max(0, duration - 0.05));
          // Canon MP4 starts its first displayable frame after t=0. loadeddata
          // alone can leave WebKit's canvas black. Force a real first seek,
          // while keeping the thumbnail tile anchored at timeline zero.
          const sampleTime=i===0?Math.min(.12,duration/2):time;
          if (Math.abs(element.currentTime - sampleTime) > 0.001) {
            const seeked = waitFor(element, 'seeked', abort.signal); element.currentTime = sampleTime; await seeked;
          }
          await decodedVideoFrame(element,abort.signal);
          if (abort.signal.aborted) return;
          context.drawImage(element, 0, 0, 160, 90);
          result.push({ time, url: i===0&&firstTile?firstTile:canvas.toDataURL('image/jpeg', 0.65) });
          setThumbs([...result]);
        }
        thumbnailCache.set(cacheKey,result);if(thumbnailCache.size>24)thumbnailCache.delete(thumbnailCache.keys().next().value!);
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
      style={{left:clip.startTime*scale,width:Math.max(2,clip.duration*scale),minHeight:0,minWidth:0,touchAction:'none',background:'#312e81'}} aria-label={`${t('editing.videoClip')} ${clip.sourceOffset.toFixed(3)} s`} title={clipSource(video,clip)?.name}
      onPointerDown={e=>{e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);const state=useProjectStore.getState();state.setIsPlaying(false);const selectionIds=e.shiftKey?[...new Set([...(state.selection?.segmentIds??[]),...linkedIds(state.project,[clip.id])])]:linkedIds(state.project,[clip.id]);const all=state.project.tracks.flatMap(t=>t.segments).concat([]);const group=[...all,...clips].filter(c=>selectionIds.includes(c.id));state.setSelection({startTime:Math.min(...group.map(c=>c.startTime)),endTime:Math.max(...group.map(c=>c.startTime+c.duration)),segmentIds:selectionIds});projectHistoryGesture.begin();drag.current={id:clip.id,x:e.clientX,start:clip.startTime,kind:(e.target as HTMLElement).dataset.trim as 'left'|'right'||'move',clips,project:state.project};}}
      onPointerMove={e=>{const moving=drag.current;if(!moving || moving.id!==clip.id || Math.abs(e.clientX-moving.x)<3)return;const state=useProjectStore.getState();const edges=[0,state.playheadPosition,...(state.project.markers??[]).map(m=>m.time),...moving.clips.filter(c=>c.id!==clip.id).flatMap(c=>[c.startTime,c.startTime+c.duration])];if(moving.kind!=='move'){try{const delta=frameTime((e.clientX-moving.x)/scale,state.project.frameRate??25);useProjectStore.setState({project:trimClips(moving.project,[clip.id],moving.kind,delta,state.sources)});}catch{/* Retain valid trim. */}return;}const time=snapClipStart(moving.start+(e.clientX-moving.x)/scale,clip.duration,edges,scale,state.snapEnabled&&!e.altKey);try{useProjectStore.setState({project:moveClips(moving.project,[clip.id],time-moving.start)});}catch{/* Keep the last valid placement when clips would overlap. */}}}
      onPointerUp={e=>{if(!drag.current)return;e.currentTarget.releasePointerCapture(e.pointerId);drag.current=null;projectHistoryGesture.end();}}
      onPointerCancel={()=>{drag.current=null;projectHistoryGesture.end();}}>
      <div className="absolute inset-0 opacity-70 pointer-events-none">{thumbs.filter(thumb=>clipSource(video,clip)?.path===videoPath&&thumb.time>=clip.sourceOffset&&thumb.time<clip.sourceOffset+clip.duration).map(thumb=><img key={thumb.time} src={thumb.url} alt="" className="absolute h-full object-cover" style={{left:(thumb.time-clip.sourceOffset)*scale,width:Math.max(40,(duration??video.duration)/8*scale)}}/>)}</div>
      <span className="absolute left-1 top-0 px-1 rounded bg-black/70 text-[10px] text-white pointer-events-none">{clipSource(video,clip)?.name} · {clip.sourceOffset.toFixed(2)}–{(clip.sourceOffset+clip.duration).toFixed(2)}s{clip.transition!=='cut'?` · ${t(`editing.transition_${clip.transition}`)}`:''}</span>
      {failed&&<span className="absolute bottom-0 left-1 text-xs text-gray-300">{t('video.noThumbnails')}</span>}
      <span data-trim="left" title={t('workspace.trimHandle')} className="absolute left-0 top-4 bottom-0 w-3 cursor-ew-resize border-l-2 border-white/60"/>
      <span data-trim="right" title={t('workspace.trimHandle')} className="absolute right-0 top-4 bottom-0 w-3 cursor-ew-resize border-r-2 border-white/60"/>
      {clip.fadeIn>0&&<span className="absolute bottom-0 left-0 border-b border-white/70" style={{width:clip.fadeIn*scale,transform:'rotate(-15deg)',transformOrigin:'left'}}/>}
      {clip.fadeOut>0&&<span className="absolute bottom-0 right-0 border-b border-white/70" style={{width:clip.fadeOut*scale,transform:'rotate(15deg)',transformOrigin:'right'}}/>}
    </button>)}
    <div className="absolute bottom-0 h-4 text-[10px] text-violet-200 pointer-events-none">{t('editing.videoOverview')} · 0–{total.toFixed(2)} s</div>
    <div className="absolute bottom-0 h-4 border border-sky-300 bg-sky-400/20 pointer-events-none" style={{left:Math.min(width,scroll*scale),width:Math.max(0,Math.min(width-scroll*scale,width/zoom*scale))}} title={t('editing.audioWindow')}/>
    {[start,end].map((time,i)=><div key={i} className="absolute inset-y-0 border-l border-emerald-400 pointer-events-none" style={{left:time*scale}}><span className="absolute bottom-4 text-[9px] bg-emerald-950 text-emerald-200">{i?'OUT':'IN'}</span></div>)}
    <PlayheadHandle width={width} overviewDuration={total}/>
  </div>;
}
