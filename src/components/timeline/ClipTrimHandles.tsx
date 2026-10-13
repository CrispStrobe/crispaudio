import type {PointerEvent} from 'react';
import {PanelLeft,PanelRight} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import type {TimelineTrack,AudioSegment,TimelineSelection} from '../../types/audio';
export function ClipTrimHandles({tracks,selection,activeSegmentId,zoom,scroll,width,height,onBegin,onMove,onEnd,onCancel}:{tracks:TimelineTrack[];selection:TimelineSelection|null;activeSegmentId?:string|null;zoom:number;scroll:number;width:number;height:number;onBegin:(e:PointerEvent<HTMLButtonElement>,seg:AudioSegment,row:number,side:'left'|'right')=>void;onMove:(e:PointerEvent<HTMLButtonElement>)=>void;onEnd:(e:PointerEvent<HTMLButtonElement>)=>void;onCancel:()=>void}){
 const {t}=useTranslation();
 if(width<=0)return null;
 const size=Math.min(44,width/2),clamp=(x:number,max:number)=>Math.max(0,Math.min(max,x));
 const eligible=tracks.flatMap(track=>track.locked?[]:track.segments).filter(seg=>selection?.segmentIds.includes(seg.id)&&[seg.startTime,seg.startTime+seg.duration].some(time=>(time-scroll)*zoom>=0&&(time-scroll)*zoom<=width));
 const activeId=eligible.find(seg=>seg.id===activeSegmentId)?.id??eligible[0]?.id;
 return <>{tracks.flatMap((track,row)=>track.locked?[]:track.segments.filter(seg=>seg.id===activeId).flatMap(seg=>{
  const boundaries={left:(seg.startTime-scroll)*zoom,right:(seg.startTime+seg.duration-scroll)*zoom},visible=(side:'left'|'right')=>boundaries[side]>=0&&boundaries[side]<=width;
  let left=clamp(boundaries.left-size/2,width-size),right=clamp(boundaries.right-size/2,width-size);
  // Keep both ends reachable when the clip is smaller than the touch targets.
  // The trim gesture uses pointer delta, so separating buttons never jumps a boundary.
  if(visible('left')&&visible('right')&&right-left<size){left=clamp((left+right-size)/2,width-2*size);right=left+size;}
  return (['left','right'] as const).map(side=>{
   if(!visible(side))return null;
   const Icon=side==='left'?PanelLeft:PanelRight;
   return <button key={`${seg.id}:${side}`} type="button" data-clip-trim-handle={side} data-clip-trim-segment={seg.id} data-help="trim" aria-label={`${seg.name}: ${t(side==='left'?'editing.trimStartHandle':'editing.trimEndHandle')}`} className="absolute z-20 flex items-center justify-center rounded text-white bg-gray-950/70 border border-indigo-300/80 hover:bg-indigo-800/80" style={{left:side==='left'?left:right,top:row*height+Math.max(4,(height-44)/2),width:size,height:Math.min(44,height-8),touchAction:'none',cursor:'ew-resize'}} onPointerDown={e=>onBegin(e,seg,row,side)} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onCancel} onLostPointerCapture={onCancel}><Icon size={16}/></button>;
  });
 }))} </>;
}
