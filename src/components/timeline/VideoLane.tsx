import { clipOpacity } from '../../lib/videoPreview';
import { linkedIds, moveClips, trimClips } from '../../lib/projectEdits';
import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { captureVideoThumbnails, thumbnailIntervals, type VideoThumbnail } from '../../lib/videoThumbnails';
import { useProjectStore } from '../../stores/projectStore';
import { PlayheadHandle } from './PlayheadHandle';
import { videoClips, clipSource, frameTime } from '../../lib/videoEditing';
import { timelineDuration } from '../../lib/timelineView';
import { snapClipStart } from '../../lib/timelineSnap';
import { projectHistoryGesture } from '../../stores/projectStore';

export const VIDEO_LANE_HEIGHT = 76;
export function VideoLane({ width, touchArrange = false }: { width: number; touchArrange?: boolean }) {
  const { t } = useTranslation();
  const video = useProjectStore((s) => s.project.video);
  const height = useProjectStore(s => s.trackHeight);
  const zoom = useProjectStore((s) => s.zoomLevel);
  const scroll = useProjectStore((s) => s.scrollOffset);
  const total = useProjectStore(s => Math.max(.01,timelineDuration(s.project)));
  const selection = useProjectStore(s => s.selection);
  const selected=selection?.segmentIds??[];
  const drag = useRef<{id:string;x:number;start:number;kind:'move'|'left'|'right'|'fade-in'|'fade-out';clips:ReturnType<typeof videoClips>;project:ReturnType<typeof useProjectStore.getState>['project'];error?:string}|null>(null);
  useEffect(()=>()=>{if(drag.current){drag.current=null;projectHistoryGesture.end();}},[]);
  const [thumbnails, setThumbnails] = useState<Record<string, VideoThumbnail[]>>({});
  const [failures, setFailures] = useState<Record<string, boolean>>({});
  // Stable through selection, moves and trims; rebuild only when sources change.
  const sourcesKey = JSON.stringify([...new Map(videoClips(video).map(clip => {
    const source = clipSource(video, clip);
    return [source?.path, source && { path: source.path, duration: source.duration }];
  })).values()].filter(Boolean));
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    const abort = new AbortController();
    const sources = JSON.parse(sourcesKey) as { path: string; duration: number }[];
    void (async () => {
      for (const source of sources) {
        if (abort.signal.aborted) return;
        try {
          await captureVideoThumbnails(source.path, source.duration, abort.signal, thumbs => {
            if (!abort.signal.aborted) {
              setThumbnails(previous => ({ ...previous, [source.path]: thumbs }));
              setFailures(previous => ({ ...previous, [source.path]: false }));
            }
          });
        } catch {
          if (!abort.signal.aborted) setFailures(previous => ({ ...previous, [source.path]: true }));
        }
      }
    })();
    return () => abort.abort();
  }, [sourcesKey]);
  if (!video) return null;
  const scale=zoom, clips=videoClips(video);
  const start=video.inPoint ?? 0,end=video.outPoint ?? total;
  return <div className="relative shrink-0 overflow-hidden bg-violet-950/20 border-b border-gray-700" style={{height,width}} data-video-track>
    <div className="absolute inset-0" onPointerDown={e=>{const rect=e.currentTarget.getBoundingClientRect();const state=useProjectStore.getState();state.setIsPlaying(false);state.setSelection(null);state.setPlayheadPosition(Math.max(0,Math.min(total,scroll+(e.clientX-rect.left)/scale)));}}/>
    {clips.filter(clip=>clip.startTime+clip.duration>scroll&&clip.startTime<scroll+width/scale).map(clip=><button key={clip.id} className={`absolute top-1 bottom-1 rounded border overflow-hidden text-left ${selected.includes(clip.id)?'border-yellow-300 ring-1 ring-yellow-300':'border-violet-400'}`}
      style={{left:(clip.startTime-scroll)*scale,width:Math.max(2,clip.duration*scale),minHeight:0,minWidth:0,touchAction:touchArrange?'none':'pan-y',background:'#312e81'}} aria-label={`${t('editing.videoClip')} ${clip.sourceOffset.toFixed(3)} s`} title={clipSource(video,clip)?.name}
      onPointerDown={e=>{e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);const state=useProjectStore.getState();state.setIsPlaying(false);const selectionIds=e.shiftKey?[...new Set([...(state.selection?.segmentIds??[]),...linkedIds(state.project,[clip.id])])]:linkedIds(state.project,[clip.id]);const all=state.project.tracks.flatMap(t=>t.segments).concat([]);const group=[...all,...clips].filter(c=>selectionIds.includes(c.id));state.setSelection({startTime:Math.min(...group.map(c=>c.startTime)),endTime:Math.max(...group.map(c=>c.startTime+c.duration)),segmentIds:selectionIds});if(e.pointerType==='touch'&&!touchArrange)return;projectHistoryGesture.begin();drag.current={id:clip.id,x:e.clientX,start:clip.startTime,kind:((e.target as HTMLElement).dataset.fade || (e.target as HTMLElement).dataset.trim || 'move') as 'move'|'left'|'right'|'fade-in'|'fade-out',clips,project:state.project};}}
      onPointerMove={e=>{const moving=drag.current;if(!moving || moving.id!==clip.id || Math.abs(e.clientX-moving.x)<3)return;const state=useProjectStore.getState();const edges=[0,state.playheadPosition,...(state.project.markers??[]).map(m=>m.time),...moving.clips.filter(c=>c.id!==clip.id).flatMap(c=>[c.startTime,c.startTime+c.duration])];if(moving.kind==='fade-in'||moving.kind==='fade-out'){
        const original=moving.clips.find(c=>c.id===clip.id)!;
        const key=moving.kind==='fade-in'?'fadeIn':'fadeOut';
        const delta=(e.clientX-moving.x)/scale*(key==='fadeIn'?1:-1);
        const duration=Math.max(0,Math.min(original.duration,frameTime(original[key]+delta,state.project.frameRate??25)));
        useProjectStore.setState({project:{...moving.project,video:{...moving.project.video!,clips:moving.clips.map(c=>c.id===clip.id?{...c,[key]:duration}:c)}}});
        return;
      }if(moving.kind!=='move'){try{const delta=frameTime((e.clientX-moving.x)/scale,state.project.frameRate??25);useProjectStore.setState({project:trimClips(moving.project,[clip.id],moving.kind,delta,state.sources,true)});moving.error=undefined;}catch(error){moving.error=String(error);}return;}const time=snapClipStart(moving.start+(e.clientX-moving.x)/scale,clip.duration,edges,scale,state.snapEnabled&&!e.altKey);try{useProjectStore.setState({project:moveClips(moving.project,[clip.id],time-moving.start,true)});moving.error=undefined;}catch(error){moving.error=String(error);}}}
      onPointerUp={e=>{if(!drag.current)return;e.currentTarget.releasePointerCapture(e.pointerId);if(drag.current.error)window.dispatchEvent(new CustomEvent('crispaudio-edit-error',{detail:drag.current.error}));drag.current=null;projectHistoryGesture.end();}}
      onPointerCancel={()=>{drag.current=null;projectHistoryGesture.end();}}>
      <div className="absolute inset-0 opacity-70 pointer-events-none">{thumbnailIntervals(thumbnails[clipSource(video,clip)?.path??'']??[],clip.sourceOffset,clip.duration,clipSource(video,clip)?.duration??0).map(thumb=><img key={thumb.time} src={thumb.url} alt="" className="absolute h-full object-cover" style={{left:thumb.offset*scale,width:thumb.duration*scale}}/>)}</div>
      <span className="absolute left-1 top-0 px-1 rounded bg-black/70 text-[10px] text-white pointer-events-none">{clipSource(video,clip)?.name} · {clip.sourceOffset.toFixed(2)}–{(clip.sourceOffset+clip.duration).toFixed(2)}s{clip.transition!=='cut'?` · ${t(`editing.transition_${clip.transition}`)}`:''}</span>
      {failures[clipSource(video,clip)?.path??'']&&<span className="absolute bottom-0 left-1 text-xs text-gray-300">{t('video.noThumbnails')}</span>}
      <span data-trim="left" title={t('workspace.trimHandle')} className="absolute left-0 top-4 bottom-0 w-3 cursor-ew-resize border-l-2 border-white/60"/>
      <span data-trim="right" title={t('workspace.trimHandle')} className="absolute right-0 top-4 bottom-0 w-3 cursor-ew-resize border-r-2 border-white/60"/>
      <svg aria-hidden="true" className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${clip.duration} 1`} preserveAspectRatio="none">
        {clip.fadeIn>0&&<path d={`M 0 0 L 0 1 L ${clip.fadeIn} 0 Z`} fill="#0008"/>}
        {clip.fadeOut>0&&<path d={`M ${clip.duration-clip.fadeOut} 0 L ${clip.duration} 1 L ${clip.duration} 0 Z`} fill="#0008"/>}
        <polyline points={Array.from({length:65},(_,i)=>{const time=i*clip.duration/64;const opacity=i===64?(clip.fadeOut>0?0:1):clipOpacity(clip,clip.startTime+time);return `${time},${1-opacity}`;}).join(' ')} fill="none" stroke="#fff9" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
      </svg>
      {(['in','out'] as const).map(side=><span key={side} data-fade={`fade-${side}`} title={t(side==='in'?'timeline.fadeIn':'timeline.fadeOut')}
        className="absolute top-5 w-5 h-5 rounded-sm border border-white bg-violet-500 cursor-ew-resize shadow"
        style={{left:Math.max(0,Math.min(clip.duration*scale-20,(side==='in'?clip.fadeIn:clip.duration-clip.fadeOut)*scale-10))}}/>)}
    </button>)}
    {[start,end].map((time,i)=><div key={i} className="absolute inset-y-0 border-l border-emerald-400 pointer-events-none" style={{left:(time-scroll)*scale}}><span className="absolute bottom-4 text-[9px] bg-emerald-950 text-emerald-200">{i?'OUT':'IN'}</span></div>)}
    <PlayheadHandle width={width}/>
  </div>;
}
