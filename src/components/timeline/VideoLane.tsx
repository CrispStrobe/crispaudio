import {ClipTrimHandles} from './ClipTrimHandles';
import {VideoClipMenu} from './VideoClipMenu';
import {useUIStore} from '../../stores/uiStore';
import type {VideoClip} from '../../types/audio';
import type {PointerEvent} from 'react';
import {pictureTrackId,pictureLocked} from '../../lib/pictureComposition';
import {capturePointerHistory,restorePointerHistory} from '../../stores/pointerHistory';
import {pointerTrim,type TrimFeedback} from '../../lib/trimFeedback';
import {TrimSourceFeedback} from './TrimSourceFeedback';
import { clipOpacity } from '../../lib/videoPreview';
import { linkedIds, moveClips,projectClips,projectSelection } from '../../lib/projectEdits';
import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { captureVideoThumbnails, thumbnailIntervals, type VideoThumbnail } from '../../lib/videoThumbnails';
import { useProjectStore } from '../../stores/projectStore';
import { PlayheadHandle } from './PlayheadHandle';
import { videoClips, clipSource, frameTime } from '../../lib/videoEditing';
import { timelineDuration } from '../../lib/timelineView';
import { snapProjectClipStart } from '../../lib/timelineSnap';
import { projectHistoryGesture } from '../../stores/projectStore';

export const VIDEO_LANE_HEIGHT = 76;
export function VideoLane({ width, touchArrange = false,trackId }: { width: number; touchArrange?: boolean;trackId?:string }) {
  const { t } = useTranslation();
  const video = useProjectStore((s) => s.project.video);
  const editRange=useProjectStore(s=>s.project.editRange);
  const height = useProjectStore(s => s.trackHeight);
  const zoom = useProjectStore((s) => s.zoomLevel);
  const scroll = useProjectStore((s) => s.scrollOffset);
  const total = useProjectStore(s => Math.max(.01,timelineDuration(s.project)));
  const selection = useProjectStore(s => s.selection);
  const selected=selection?.segmentIds??[];
  const recording=useUIStore(s=>s.timelineRecording);
  const [activeClip,setActiveClip]=useState<string|null>(null),[menu,setMenu]=useState<{x:number;y:number;clipId:string;projectId:string;touchPointerId?:number}|null>(null),hold=useRef<ReturnType<typeof setTimeout>|null>(null);
  const clickSelection=useRef<{id:string;project:ReturnType<typeof useProjectStore.getState>['project']}|null>(null);
  const holdOrigin=useRef<{x:number;y:number}|null>(null);
  const clearHold=()=>{if(hold.current)clearTimeout(hold.current);hold.current=null;holdOrigin.current=null;};
  useEffect(()=>()=>{if(hold.current)clearTimeout(hold.current);},[]);
  const lane=useRef<HTMLDivElement>(null);
  const drag = useRef<{id:string;x:number;start:number;kind:'move'|'left'|'right'|'fade-in'|'fade-out';clips:ReturnType<typeof videoClips>;project:ReturnType<typeof useProjectStore.getState>['project'];lastProject:ReturnType<typeof useProjectStore.getState>['project'];error?:string;history:ReturnType<typeof capturePointerHistory>}|null>(null);
  useEffect(()=>()=>{if(drag.current){drag.current=null;setTrimFeedback(null);projectHistoryGesture.end();}},[]);
  const [trimFeedback,setTrimFeedback]=useState<TrimFeedback|null>(null);
  useEffect(()=>{const finish=()=>{clickSelection.current=null;if(hold.current)clearTimeout(hold.current);hold.current=null;if(drag.current){drag.current=null;setTrimFeedback(null);projectHistoryGesture.end();}};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&drag.current){if(useProjectStore.getState().project===drag.current.lastProject){useProjectStore.setState({project:drag.current.project});restorePointerHistory(drag.current.history);}finish();}};window.addEventListener('blur',finish);window.addEventListener('keydown',key);return()=>{window.removeEventListener('blur',finish);window.removeEventListener('keydown',key);};},[]);
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
  const scale=zoom,allClips=videoClips(video),clips=allClips.filter(c=>!trackId||pictureTrackId(c)===trackId);
  const start=video.inPoint ?? 0,end=video.outPoint ?? total;
  const cancelDrag=()=>{clickSelection.current=null;clearHold();if(drag.current){if(useProjectStore.getState().project===drag.current.lastProject){useProjectStore.setState({project:drag.current.project});restorePointerHistory(drag.current.history);}drag.current=null;setTrimFeedback(null);projectHistoryGesture.end();}};
  const showMenu=(clip:VideoClip,x:number,y:number,touchPointerId?:number)=>{if(useUIStore.getState().timelineRecording)return;cancelDrag();const state=useProjectStore.getState();if(!videoClips(state.project.video).some(c=>c.id===clip.id))return;const ids=state.selection?.segmentIds.includes(clip.id)?state.selection.segmentIds:linkedIds(state.project,[clip.id]),group=projectClips(state.project).filter(c=>ids.includes(c.id));state.setSelection({startTime:Math.min(...group.map(c=>c.startTime)),endTime:Math.max(...group.map(c=>c.startTime+c.duration)),segmentIds:ids});setActiveClip(clip.id);setMenu({x,y,clipId:clip.id,projectId:state.project.id,touchPointerId});};
  const begin=(e:PointerEvent<HTMLElement>,clip:VideoClip,forcedKind?:'left'|'right')=>{e.stopPropagation();if(e.pointerType==='touch')e.preventDefault();if(recording)return;clickSelection.current=null;clearHold();setActiveClip(clip.id);if(e.button!==0)return;try{e.currentTarget.setPointerCapture(e.pointerId);}catch{/* The pointer may already have ended. */}const state=useProjectStore.getState();state.setIsPlaying(false);if(!e.shiftKey&&!forcedKind&&!(e.target as Element).closest('[data-fade]'))clickSelection.current={id:clip.id,project:state.project};const selectionIds=touchArrange&&!e.shiftKey&&state.selection?.segmentIds.includes(clip.id)?state.selection.segmentIds:e.shiftKey?[...new Set([...(state.selection?.segmentIds??[]),...linkedIds(state.project,[clip.id])])]:linkedIds(state.project,[clip.id]);const all=state.project.tracks.flatMap(t=>t.segments).concat([]);const group=[...all,...allClips].filter(c=>selectionIds.includes(c.id));state.setSelection({startTime:Math.min(...group.map(c=>c.startTime)),endTime:Math.max(...group.map(c=>c.startTime+c.duration)),segmentIds:selectionIds});if(e.pointerType==='touch'&&!forcedKind&&!(e.target as Element).closest('[data-fade]')){const x=e.clientX,y=e.clientY,pointerId=e.pointerId;holdOrigin.current={x,y};hold.current=setTimeout(()=>{if(useProjectStore.getState().project!==(drag.current?.lastProject??state.project)){clearHold();drag.current=null;setTrimFeedback(null);projectHistoryGesture.end();return;}cancelDrag();showMenu(clip,x,y,pointerId);},500);}if(pictureLocked(video,clip)||!touchArrange)return;projectHistoryGesture.begin();setTrimFeedback(null);drag.current={id:clip.id,x:e.clientX,start:clip.startTime,kind:forcedKind??((e.target as HTMLElement).closest<HTMLElement>('[data-fade]')?.dataset.fade || (e.target as HTMLElement).closest<HTMLElement>('[data-trim]')?.dataset.trim || 'move') as 'move'|'left'|'right'|'fade-in'|'fade-out',clips:allClips,project:state.project,lastProject:state.project,history:capturePointerHistory()};};
  const move=(e:PointerEvent<HTMLElement>,clip:VideoClip)=>{if(holdOrigin.current&&Math.hypot(e.clientX-holdOrigin.current.x,e.clientY-holdOrigin.current.y)>8)clearHold();const moving=drag.current;if(!moving || moving.id!==clip.id || moving.kind==='move'&&Math.abs(e.clientX-moving.x)<3)return;clickSelection.current=null;const state=useProjectStore.getState();if(state.project!==moving.lastProject){clearHold();drag.current=null;setTrimFeedback(null);projectHistoryGesture.end();return;}const edges=[0,state.playheadPosition,...(state.project.markers??[]).map(m=>m.time),...projectClips(moving.project).filter(c=>!linkedIds(moving.project,[clip.id]).includes(c.id)).flatMap(c=>[c.startTime,c.startTime+c.duration])];if(moving.kind==='fade-in'||moving.kind==='fade-out'){
        const original=moving.clips.find(c=>c.id===clip.id)!;
        const key=moving.kind==='fade-in'?'fadeIn':'fadeOut';
        const delta=(e.clientX-moving.x)/scale*(key==='fadeIn'?1:-1);
        const duration=Math.max(0,Math.min(original.duration,frameTime(original[key]+delta,state.project.frameRate??25)));
        useProjectStore.setState({project:{...moving.project,video:{...moving.project.video!,clips:moving.clips.map(c=>c.id===clip.id?{...c,[key]:duration}:c)}}});moving.lastProject=useProjectStore.getState().project;
        return;
      }if(moving.kind!=='move'){try{const result=pointerTrim(moving.project,clip.id,moving.kind,(e.clientX-moving.x)/scale,state.sources);useProjectStore.setState({project:result.project});moving.lastProject=useProjectStore.getState().project;setTrimFeedback(result.feedback);moving.error=undefined;}catch(error){moving.error=error instanceof Error?error.message:String(error);setTrimFeedback(previous=>({ids:linkedIds(moving.project,[clip.id]),side:moving.kind as 'left'|'right',requested:(e.clientX-moving.x)/scale,applied:previous?.applied??0,limited:false,error:String(error)}));}return;}const time=snapProjectClipStart(moving.start+(e.clientX-moving.x)/scale,clip.duration,edges,scale,state.snapEnabled&&!e.altKey,moving.project);try{useProjectStore.setState({project:moveClips(moving.project,[clip.id],time-moving.start,true)});moving.lastProject=useProjectStore.getState().project;moving.error=undefined;}catch(error){moving.error=String(error);}};
  const finish=(e:PointerEvent<HTMLElement>)=>{clearHold();const clicked=clickSelection.current;clickSelection.current=null;const state=useProjectStore.getState();if(clicked&&state.project===clicked.project)state.setSelection(projectSelection(state.project,linkedIds(state.project,[clicked.id])));const finished=drag.current;if(!finished)return;drag.current=null;setTrimFeedback(null);projectHistoryGesture.end();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(finished.error)window.dispatchEvent(new CustomEvent('crispaudio-edit-error',{detail:t(finished.error.replace(/^Error: /,''))}));};
  return <div ref={lane} className="relative shrink-0 overflow-hidden bg-violet-950/20 border-b border-gray-700" style={{height,width}} data-video-track={trackId??'picture'}>
    <div className="absolute inset-0" onPointerDown={e=>{if(recording)return;const rect=e.currentTarget.getBoundingClientRect();const state=useProjectStore.getState();state.setIsPlaying(false);state.setSelection(null);state.setPlayheadPosition(Math.max(0,Math.min(total,scroll+(e.clientX-rect.left)/scale)));}}/>
    {clips.filter(clip=>clip.startTime+clip.duration>scroll&&clip.startTime<scroll+width/scale).map(clip=><button key={clip.id} className={`absolute top-1 bottom-1 rounded border overflow-hidden text-left ${selected.includes(clip.id)?'border-yellow-300 ring-1 ring-yellow-300':'border-violet-400'}`}
      style={{left:(clip.startTime-scroll)*scale,width:Math.max(2,clip.duration*scale),minHeight:0,minWidth:0,touchAction:touchArrange?'none':'pan-y',background:'#312e81'}} data-video-clip={clip.id} data-help="videoClip" aria-label={`${t('editing.videoClip')} ${clip.sourceOffset.toFixed(3)} s`} title={clipSource(video,clip)?.name}
      onPointerDown={e=>begin(e,clip)} onPointerMove={e=>move(e,clip)} onPointerUp={finish} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag} onContextMenu={e=>{e.preventDefault();e.stopPropagation();showMenu(clip,e.clientX,e.clientY);}}>
      <div className="absolute inset-0 opacity-70 pointer-events-none">{thumbnailIntervals(thumbnails[clipSource(video,clip)?.path??'']??[],clip.sourceOffset,clip.duration,clipSource(video,clip)?.duration??0).map(thumb=><img key={thumb.time} src={thumb.url} alt="" className="absolute h-full object-cover" style={{left:thumb.offset*scale,width:thumb.duration*scale}}/>)}</div>
      <span className="absolute left-1 top-0 px-1 rounded bg-black/70 text-[10px] text-white pointer-events-none">{clip.editGroup?`${clip.editGroup.name} · `:''}{clipSource(video,clip)?.name} · {clip.sourceOffset.toFixed(2)}–{(clip.sourceOffset+clip.duration).toFixed(2)}s{clip.transition!=='cut'?` · ${t(`editing.transition_${clip.transition}`)}`:''}</span>
      {failures[clipSource(video,clip)?.path??'']&&<span className="absolute bottom-0 left-1 text-xs text-gray-300">{t('video.noThumbnails')}</span>}
      <svg aria-hidden="true" className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${clip.duration} 1`} preserveAspectRatio="none">
        {clip.fadeIn>0&&<path d={`M 0 0 L 0 1 L ${clip.fadeIn} 0 Z`} fill="#0008"/>}
        {clip.fadeOut>0&&<path d={`M ${clip.duration-clip.fadeOut} 0 L ${clip.duration} 1 L ${clip.duration} 0 Z`} fill="#0008"/>}
        <polyline points={Array.from({length:65},(_,i)=>{const time=i*clip.duration/64;const opacity=i===64?(clip.fadeOut>0?0:1):clipOpacity(clip,clip.startTime+time);return `${time},${1-opacity}`;}).join(' ')} fill="none" stroke="#fff9" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
      </svg>
      {touchArrange&&selected.includes(clip.id)&&clip.duration*scale>=88&&(['in','out'] as const).map(side=><span key={side} data-fade={`fade-${side}`} title={t(side==='in'?'timeline.fadeIn':'timeline.fadeOut')}
        className="absolute top-1 w-5 h-3 rounded-sm border border-white bg-violet-500 cursor-ew-resize shadow"
        style={{left:Math.max(0,Math.min(clip.duration*scale-20,(side==='in'?clip.fadeIn:clip.duration-clip.fadeOut)*scale-10))}}/>)}
    </button>)}
    {[start,end].map((time,i)=><div key={i} className="absolute inset-y-0 border-l border-emerald-400 pointer-events-none" style={{left:(time-scroll)*scale}}><span className="absolute bottom-4 text-[9px] bg-emerald-950 text-emerald-200">{i?'OUT':'IN'}</span></div>)}
    {editRange&&<div className="absolute inset-y-0 pointer-events-none z-10 border-x border-indigo-400 bg-indigo-500/10" style={{left:(editRange.start-scroll)*zoom,width:(editRange.end-editRange.start)*zoom}}/>}
    <TrimSourceFeedback feedback={trimFeedback}/>
    <PlayheadHandle width={width} interactive={false}/>
    {touchArrange&&!recording&&<ClipTrimHandles tracks={[{segments:clips.filter(c=>!pictureLocked(video,c)).map(c=>({...c,name:clipSource(video,c)?.name??t('editing.videoClip')}))}]} selection={selection} activeSegmentId={activeClip} zoom={zoom} scroll={scroll} width={width} height={height} onBegin={(e,clip,_row,side)=>begin(e,clip,side)} onMove={e=>{const clip=clips.find(c=>c.id===drag.current?.id);if(clip)move(e,clip);}} onEnd={finish} onCancel={cancelDrag}/>}
    <VideoClipMenu point={menu} onClose={()=>{const id=menu?.clipId;setMenu(null);if(id)Array.from(lane.current?.querySelectorAll<HTMLButtonElement>('[data-video-clip]')??[]).find(button=>button.dataset.videoClip===id)?.focus();}}/>
  </div>;
}
