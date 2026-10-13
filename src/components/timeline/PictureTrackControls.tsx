import {selectPictureTimelineTrack} from '../../lib/trackSelection';
import {ToolButton} from '../common/ToolButton';
import {syncPictureScroll} from '../../lib/pictureScroll';
import {useTranslation} from 'react-i18next';
import {useProjectStore} from '../../stores/projectStore';
import {pictureTracks,pictureTrackId,LEGACY_PICTURE_TRACK} from '../../lib/pictureComposition';
import {videoClips} from '../../lib/videoEditing';
import {timelineDuration} from '../../lib/timelineView';
import {Modal} from '../common/Modal';
import {NumberField} from './NumberField';
import {useEffect,useRef,useState} from 'react';
import {Eye,EyeOff,Lock,Layers} from 'lucide-react';
import {useUIStore} from '../../stores/uiStore';
import {InfoButton} from '../common/InfoButton';
import {PictureTrackMenu} from './PictureTrackMenu';
import {openPictureTrackMenu} from '../../lib/pictureTrackMenu';

export function PictureTrackControls(){
  const {t}=useTranslation(),video=useProjectStore(s=>s.project.video),[open,setOpen]=useState(false),recording=useUIStore(s=>s.timelineRecording);
  const openedProject=useRef(useProjectStore.getState().project.id);
  const showSettings=()=>{openedProject.current=useProjectStore.getState().project.id;setOpen(true);};
  useEffect(()=>{const show=()=>{openedProject.current=useProjectStore.getState().project.id;setOpen(true);};window.addEventListener('crispaudio-picture-track-settings',show);const unsubscribe=useProjectStore.subscribe(s=>{if(s.project.id!==openedProject.current)setOpen(false);});return()=>{window.removeEventListener('crispaudio-picture-track-settings',show);unsubscribe();};},[]);
  if(!video)return null;
  const update=(patch:Partial<typeof video>)=>{const state=useProjectStore.getState();if(useUIStore.getState().timelineRecording||!state.project.video||state.project.id!==openedProject.current)return;useProjectStore.setState({project:{...state.project,video:{...state.project.video!,...patch}}});};
  const tracks=pictureTracks(video);
  return <><ToolButton icon={Layers} label={t('picture.tracks')} onClick={showSettings}/><Modal isOpen={open} onClose={()=>setOpen(false)} title={t('picture.tracks')}>
    <fieldset disabled={recording} className="space-y-3 disabled:opacity-60">
      <button className="timeline-tool" disabled={!!video.locked||tracks.length>=32} onClick={()=>update({tracks:[{id:crypto.randomUUID(),name:`${t('video.track')} ${tracks.length+1}`,visible:true,locked:false,rippleEnabled:true},...tracks]})}>{t('picture.addTrack')}</button>
      {tracks.map((track,index)=><details key={track.id} data-picture-track-section className="rounded border border-gray-700 p-2 text-xs"><summary className="min-h-11 flex items-center cursor-pointer text-sm">{track.name||t('video.track')}</summary><div className="space-y-2">
        <input className="bg-gray-800 min-h-11 w-full rounded p-2" aria-label={t('picture.name')} value={track.name||t('video.track')} onChange={e=>update({tracks:tracks.map(p=>p.id===track.id?{...p,name:e.target.value}:p)})}/>
        <div className="flex gap-3 flex-wrap">{(['visible','locked','rippleEnabled'] as const).map(key=><label className="flex items-center gap-1 min-h-11" key={key}><input type="checkbox" checked={track[key]} disabled={!!video.locked||(key!=='locked'&&track.locked)} onChange={e=>update({tracks:tracks.map(p=>p.id===track.id?{...p,[key]:e.target.checked}:p)})}/>{t(`picture.${key}`)}</label>)}</div>
        <div className="flex gap-2">{[-1,1].map(direction=><button key={direction} className="timeline-tool" disabled={index+direction<0||index+direction>=tracks.length} onClick={()=>{const next=[...tracks];[next[index],next[index+direction]]=[next[index+direction],next[index]];update({tracks:next});}}>{t(direction<0?'picture.up':'picture.down')}</button>)}
          <button className="timeline-tool" disabled={!!video.locked||track.locked||track.id===LEGACY_PICTURE_TRACK} onClick={()=>{
            const state=useProjectStore.getState();if(useUIStore.getState().timelineRecording||state.project.id!==openedProject.current)return;const removed=videoClips(video).filter(c=>pictureTrackId(c)===track.id),links=new Set(removed.map(c=>c.linkGroup).filter(Boolean));
            const next={...state.project,video:{...video,tracks:tracks.filter(p=>p.id!==track.id),clips:videoClips(video).filter(c=>pictureTrackId(c)!==track.id)},tracks:state.project.tracks.map(p=>({...p,segments:p.segments.map(c=>c.linkGroup&&links.has(c.linkGroup)?{...c,linkGroup:undefined}:c)}))};useProjectStore.setState({project:{...next,duration:timelineDuration(next)},selection:null,isPlaying:false});
          }}>{t('picture.removeTrack')}</button>
        </div>
      </div></details>)}
      <details data-picture-format-section className="rounded border border-gray-700 p-2"><summary className="min-h-11 flex items-center cursor-pointer text-sm">{t('picture.format')}</summary><div className="space-y-2">
      {(['width','height'] as const).map(key=><label key={key} className="flex justify-between items-center text-sm">{t(`picture.${key}`)}<NumberField disabled={!!video.locked} label={t(`picture.${key}`)} min={16} step={2} value={video[key]??(key==='width'?1920:1080)} onCommit={value=>{if(value>7680||value%2||!Number.isInteger(value))return false;update({[key]:value});return true;}}/></label>)}
      <label className="flex justify-between items-center text-sm">{t('picture.fps')}<NumberField disabled={!!video.locked} label={t('picture.fps')} min={1} step={.001} value={useProjectStore.getState().project.frameRate??25} onCommit={value=>{if(value>120||useUIStore.getState().timelineRecording||useProjectStore.getState().project.id!==openedProject.current)return false;const state=useProjectStore.getState();useProjectStore.setState({project:{...state.project,frameRate:value}});return true;}}/></label>
      </div></details>
    </fieldset>
    <InfoButton label={t('picture.tracks')}>{t('picture.stackHelp')}</InfoButton>
  </Modal></>;
}
export function PictureTrackHeaders(){
  const {t}=useTranslation(),video=useProjectStore(s=>s.project.video),height=useProjectStore(s=>s.trackHeight),recording=useUIStore(s=>s.timelineRecording),selection=useProjectStore(s=>s.selection);
  if(!video?.tracks)return null;
  return <div data-picture-track-scroll className="shrink-0 overflow-y-auto" style={{maxHeight:Math.min(240,height*video.tracks.length)}} onScroll={e=>syncPictureScroll(e.currentTarget)}>
    {video.tracks.map(track=><div key={track.id} data-track-header data-picture-header={track.id} data-selected={!!selection?.trackIds?.includes(track.id)||videoClips(video).some(c=>pictureTrackId(c)===track.id&&selection?.segmentIds.includes(c.id))} data-compact={height<56} data-touch-compact={height<96} className="px-2 flex items-center overflow-hidden border-b border-gray-700 bg-violet-950/30" style={{height}} onClick={e=>{if(e.target instanceof Element&&e.target.closest('button'))return;if(!recording)selectPictureTimelineTrack(track.id,e.shiftKey);}} onContextMenu={e=>{e.preventDefault();openPictureTrackMenu(track.id,e.clientX,e.clientY);}}>
      <div className="track-heading flex items-center gap-1 w-full min-w-0 h-full">
        <span data-picture-track-name className="text-xs flex-1 min-w-0 truncate text-violet-200" title={track.name}>{track.name||t('video.track')}</span>
        {(track.locked||video.locked)&&<Lock size={12} aria-hidden="true" className="shrink-0 text-amber-300"/>}
        <button type="button" disabled={recording||!!video.locked||track.locked} className="track-more shrink-0 text-gray-400 disabled:opacity-30" aria-label={`${track.name}: ${t('picture.visible')}`} aria-pressed={track.visible} onClick={()=>{const state=useProjectStore.getState();if(useUIStore.getState().timelineRecording)return;useProjectStore.setState({project:{...state.project,video:{...state.project.video!,tracks:state.project.video!.tracks!.map(p=>p.id===track.id?{...p,visible:!p.visible}:p)}}});}}>{track.visible?<Eye size={16}/>:<EyeOff size={16}/>}</button>
        <PictureTrackMenu trackId={track.id}/>
      </div>
    </div>)}
  </div>;
}
