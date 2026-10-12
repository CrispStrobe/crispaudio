import {syncPictureScroll} from '../../lib/pictureScroll';
import {useTranslation} from 'react-i18next';
import {useProjectStore} from '../../stores/projectStore';
import {pictureTracks,pictureTrackId,LEGACY_PICTURE_TRACK} from '../../lib/pictureComposition';
import {videoClips} from '../../lib/videoEditing';
import {timelineDuration} from '../../lib/timelineView';
import {Modal} from '../common/Modal';
import {NumberField} from './NumberField';
import {useState} from 'react';

export function PictureTrackControls(){
  const {t}=useTranslation(),video=useProjectStore(s=>s.project.video),[open,setOpen]=useState(false);
  if(!video)return null;
  const update=(patch:Partial<typeof video>)=>{const state=useProjectStore.getState();useProjectStore.setState({project:{...state.project,video:{...state.project.video!,...patch}}});};
  const tracks=pictureTracks(video);
  return <><button className="timeline-tool" onClick={()=>setOpen(true)}>{t('picture.tracks')}</button><Modal isOpen={open} onClose={()=>setOpen(false)} title={t('picture.tracks')}>
    <div className="space-y-3">
      <button className="timeline-tool" disabled={tracks.length>=32} onClick={()=>update({tracks:[{id:crypto.randomUUID(),name:`${t('video.track')} ${tracks.length+1}`,visible:true,locked:false,rippleEnabled:true},...tracks]})}>{t('picture.addTrack')}</button>
      {tracks.map((track,index)=><div key={track.id} className="rounded border border-gray-700 p-2 space-y-2 text-xs">
        <input className="bg-gray-800 min-h-11 w-full rounded p-2" aria-label={t('picture.name')} value={track.name||t('video.track')} onChange={e=>update({tracks:tracks.map(p=>p.id===track.id?{...p,name:e.target.value}:p)})}/>
        <div className="flex gap-3 flex-wrap">{(['visible','locked','rippleEnabled'] as const).map(key=><label className="flex items-center gap-1 min-h-11" key={key}><input type="checkbox" checked={track[key]} onChange={e=>update({tracks:tracks.map(p=>p.id===track.id?{...p,[key]:e.target.checked}:p)})}/>{t(`picture.${key}`)}</label>)}</div>
        <div className="flex gap-2">{[-1,1].map(direction=><button key={direction} className="timeline-tool" disabled={index+direction<0||index+direction>=tracks.length} onClick={()=>{const next=[...tracks];[next[index],next[index+direction]]=[next[index+direction],next[index]];update({tracks:next});}}>{t(direction<0?'picture.up':'picture.down')}</button>)}
          <button className="timeline-tool" disabled={track.locked||track.id===LEGACY_PICTURE_TRACK} onClick={()=>{
            const state=useProjectStore.getState(),removed=videoClips(video).filter(c=>pictureTrackId(c)===track.id),links=new Set(removed.map(c=>c.linkGroup).filter(Boolean));
            const next={...state.project,video:{...video,tracks:tracks.filter(p=>p.id!==track.id),clips:videoClips(video).filter(c=>pictureTrackId(c)!==track.id)},tracks:state.project.tracks.map(p=>({...p,segments:p.segments.map(c=>c.linkGroup&&links.has(c.linkGroup)?{...c,linkGroup:undefined}:c)}))};useProjectStore.setState({project:{...next,duration:timelineDuration(next)},selection:null,isPlaying:false});
          }}>{t('picture.removeTrack')}</button>
        </div>
      </div>)}
      {(['width','height'] as const).map(key=><label key={key} className="flex justify-between items-center text-sm">{t(`picture.${key}`)}<NumberField label={t(`picture.${key}`)} min={16} step={2} value={video[key]??(key==='width'?1920:1080)} onCommit={value=>{if(value>7680||value%2||!Number.isInteger(value))return false;update({[key]:value});return true;}}/></label>)}
      <label className="flex justify-between items-center text-sm">{t('picture.fps')}<NumberField label={t('picture.fps')} min={1} step={.001} value={useProjectStore.getState().project.frameRate??25} onCommit={value=>{if(value>120)return false;const state=useProjectStore.getState();useProjectStore.setState({project:{...state.project,frameRate:value}});return true;}}/></label>
      <p className="text-xs text-gray-400">{t('picture.stackHelp')}</p>
    </div>
  </Modal></>;
}
export function PictureTrackHeaders(){
  const {t}=useTranslation(),video=useProjectStore(s=>s.project.video),height=useProjectStore(s=>s.trackHeight);
  if(!video?.tracks)return null;
  return <div data-picture-track-scroll className="shrink-0 overflow-y-auto" style={{maxHeight:Math.min(240,height*video.tracks.length)}} onScroll={e=>syncPictureScroll(e.currentTarget)}>
    {video.tracks.map(track=><div key={track.id} data-track-header className="px-2 flex gap-1 items-center border-b border-gray-700 bg-violet-950/30" style={{height}}>
      <span className="text-xs flex-1 min-w-0 truncate" title={track.name}>{track.name||t('video.track')}</span>
      {(['visible','locked'] as const).map(key=><button key={key} className="min-h-11 min-w-8 text-xs" aria-label={`${track.name}: ${t(`picture.${key}`)}`} aria-pressed={track[key]} onClick={()=>{const state=useProjectStore.getState();useProjectStore.setState({project:{...state.project,video:{...state.project.video!,tracks:video.tracks!.map(p=>p.id===track.id?{...p,[key]:!p[key]}:p)}}});}}>{key==='visible'?(track.visible?'V':'—'):(track.locked?'🔒':'🔓')}</button>)}
    </div>)}
  </div>;
}
