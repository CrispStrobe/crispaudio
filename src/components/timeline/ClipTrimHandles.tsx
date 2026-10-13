import type {PointerEvent} from 'react';
import {GripVertical} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import type {TimelineTrack,AudioSegment,TimelineSelection} from '../../types/audio';
export function ClipTrimHandles({tracks,selection,zoom,scroll,width,height,onBegin,onMove,onEnd,onCancel}:{tracks:TimelineTrack[];selection:TimelineSelection|null;zoom:number;scroll:number;width:number;height:number;onBegin:(e:PointerEvent<HTMLButtonElement>,seg:AudioSegment,row:number,side:'left'|'right')=>void;onMove:(e:PointerEvent<HTMLButtonElement>)=>void;onEnd:(e:PointerEvent<HTMLButtonElement>)=>void;onCancel:()=>void}){
 const {t}=useTranslation();
 return <>{tracks.flatMap((track,row)=>track.locked?[]:track.segments.filter(seg=>selection?.segmentIds.includes(seg.id)).flatMap(seg=>(['left','right'] as const).map(side=>{
  const boundary=(seg.startTime+(side==='right'?seg.duration:0)-scroll)*zoom;if(boundary<0||boundary>width)return null;
  return <button key={`${seg.id}:${side}`} type="button" data-clip-trim-handle={side} data-help="trim" aria-label={`${seg.name}: ${t(side==='left'?'editing.trimStartHandle':'editing.trimEndHandle')}`} className="absolute z-10 flex items-center justify-center rounded text-white bg-gray-950/70 border border-indigo-300/80 hover:bg-indigo-800/80" style={{left:Math.max(0,Math.min(width-44,boundary-22)),top:row*height+Math.max(4,(height-44)/2),width:44,height:Math.min(44,height-8),touchAction:'none',cursor:'ew-resize'}} onPointerDown={e=>onBegin(e,seg,row,side)} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onCancel} onLostPointerCapture={onCancel}><GripVertical size={16}/></button>;
 })))} </>;
}
