import {useEffect,useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {projectHistoryGesture,useProjectStore} from '../../stores/projectStore';
import {capturePointerHistory,restorePointerHistory} from '../../stores/pointerHistory';
import {pictureAt,pictureLocked,pictureTracks} from '../../lib/pictureComposition';
import {activeVideoClips,videoClips} from '../../lib/videoEditing';
import type {TimelineProject,PictureComposition} from '../../types/audio';

/** Handles edit composition independently of linked audio or timeline placement. */
export function PictureHandles(){
  const {t}=useTranslation(),project=useProjectStore(s=>s.project),selection=useProjectStore(s=>s.selection),time=useProjectStore(s=>s.playheadPosition);
  const clip=activeVideoClips(project.video,time).find(c=>selection?.segmentIds.includes(c.id));
  const drag=useRef<{project:TimelineProject;history:ReturnType<typeof capturePointerHistory>;x:number;y:number;width:number;height:number;value:PictureComposition;kind:'move'|'scale'}|undefined>(undefined);
  useEffect(()=>{
    const finish=()=>{if(drag.current){drag.current=undefined;projectHistoryGesture.end();}};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&drag.current){useProjectStore.setState({project:drag.current.project});restorePointerHistory(drag.current.history);finish();}};
    window.addEventListener('keydown',key);window.addEventListener('blur',finish);
    return()=>{finish();window.removeEventListener('keydown',key);window.removeEventListener('blur',finish);};
  },[]);
  if(!clip||pictureLocked(project.video,clip))return null;
  const value=pictureAt(clip,time);
  return <div className="absolute inset-0 pointer-events-none" data-picture-handles>
    {(['move','scale'] as const).map(kind=><button key={kind} aria-label={t(`picture.handle${kind==='move'?'Move':'Scale'}`)} title={t(`picture.handle${kind==='move'?'Move':'Scale'}`)} className="absolute pointer-events-auto touch-none min-w-11 min-h-11 rounded border border-white bg-black/40 text-white" style={{left:`${(value.x+.5)*100}%`,top:`${(value.y+.5)*100}%`,transform:kind==='move'?'translate(-50%,-50%)':'translate(50%,50%)'}} onPointerDown={e=>{
      e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);const bounds=e.currentTarget.parentElement!.getBoundingClientRect();const state=useProjectStore.getState();state.setIsPlaying(false);
      drag.current={project:state.project,history:capturePointerHistory(),x:e.clientX,y:e.clientY,width:bounds.width,height:bounds.height,value,kind};projectHistoryGesture.begin();
    }} onPointerMove={e=>{
      const draft=drag.current;if(!draft||!e.currentTarget.hasPointerCapture(e.pointerId))return;
      const dx=(e.clientX-draft.x)/draft.width,dy=(e.clientY-draft.y)/draft.height;
      const pose=draft.kind==='move'?{...draft.value,x:Math.max(-2,Math.min(2,draft.value.x+dx)),y:Math.max(-2,Math.min(2,draft.value.y+dy))}:{...draft.value,scale:Math.max(.05,Math.min(4,draft.value.scale+2*(dx+dy)))};
      const local=Math.max(0,time-clip.startTime+(pose.keyframeOffset??0));
      if(pose.keyframes?.length)pose.keyframes=[...pose.keyframes.filter(p=>Math.abs(p.time-local)>1/(project.frameRate??25)),{time:local,x:pose.x,y:pose.y,scale:pose.scale,rotation:pose.rotation,opacity:pose.opacity}].sort((a,b)=>a.time-b.time);
      const video=draft.project.video!;useProjectStore.setState({project:{...draft.project,video:{...video,tracks:pictureTracks(video),clips:videoClips(video).map(c=>c.id===clip.id?{...c,composition:pose}:c)}}});
    }} onPointerUp={e=>{e.currentTarget.releasePointerCapture(e.pointerId);drag.current=undefined;projectHistoryGesture.end();}} onPointerCancel={()=>{if(drag.current){useProjectStore.setState({project:drag.current.project});restorePointerHistory(drag.current.history);}drag.current=undefined;projectHistoryGesture.end();}}>{kind==='move'?'✥':'↗'}</button>)}
  </div>;
}
