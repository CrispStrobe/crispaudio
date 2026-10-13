import {HelpDetails} from '../common/HelpDetails';
import {useTranslation} from 'react-i18next';
import {useProjectStore} from '../../stores/projectStore';
import {NumberField} from './NumberField';
import {DEFAULT_PICTURE,pictureAt,pictureTracks,pictureTrackId,pictureLocked,validPicture} from '../../lib/pictureComposition';
import {videoClips} from '../../lib/videoEditing';
import type {PictureComposition,PictureKeyframe} from '../../types/audio';

export function PictureCompositionControls({id}:{id:string}){
  const {t}=useTranslation(),project=useProjectStore(s=>s.project),time=useProjectStore(s=>s.playheadPosition);
  const video=project.video,clip=videoClips(video).find(c=>c.id===id);if(!video||!clip)return null;
  const value=pictureAt(clip,time),stored=clip.composition??DEFAULT_PICTURE,local=Math.max(0,time-clip.startTime+(stored.keyframeOffset??0));
  const fields=['x','y','scale','rotation','opacity'] as const;
  const frame=(patch:Partial<PictureKeyframe>={}):PictureKeyframe=>({time:local,x:value.x,y:value.y,scale:value.scale,rotation:value.rotation,opacity:value.opacity,...patch});
  const update=(patch:Partial<PictureComposition>,record=false)=>{
    const composition={...stored,...patch};
    if(record||stored.keyframes?.length){const keyframe=frame(Object.fromEntries(fields.filter(key=>patch[key]!==undefined).map(key=>[key,patch[key]])));composition.keyframes=[...(stored.keyframes??[]).filter(p=>Math.abs(p.time-local)>1/(project.frameRate??25)),keyframe].sort((a,b)=>a.time-b.time);}
    if(!validPicture(composition))return false;
    const state=useProjectStore.getState();if(state.project!==project||pictureLocked(video,clip))return false;
    useProjectStore.setState({project:{...project,video:{...video,tracks:pictureTracks(video),clips:videoClips(video).map(c=>c.id===id?{...c,composition}:c)}}});return true;
  };
  return <fieldset disabled={pictureLocked(video,clip)} className="space-y-3 rounded border border-gray-700 p-3">
    <legend className="text-sm">{t('picture.composition')}</legend>
    <label className="flex justify-between items-center gap-2 text-sm">{t('picture.track')}<select aria-label={t('picture.track')} className="bg-gray-800 min-h-11 max-w-48" value={pictureTrackId(clip)} onChange={e=>{const state=useProjectStore.getState();useProjectStore.setState({project:{...state.project,video:{...video,clips:videoClips(video).map(c=>c.id===id?{...c,videoTrackId:e.target.value}:c)}}});}}>{pictureTracks(video).map(track=><option key={track.id} value={track.id}>{track.name||t('video.track')}</option>)}</select></label>
    {fields.map(key=><label key={key} className="flex justify-between gap-2 items-center text-sm">{t(`picture.${key}`)}<NumberField label={t(`picture.${key}`)} value={Number((value[key]*(key==='rotation'?1:100)).toFixed(3))} min={key==='x'||key==='y'?-200:key==='rotation'?-180:key==='scale'?5:0} step={key==='rotation'?1:.1} onCommit={number=>update({[key]:number/(key==='rotation'?1:100)})}/></label>)}
    <div className="grid grid-cols-2 gap-2">{(['left','top','right','bottom'] as const).map(key=><label className="text-xs" key={key}>{t(`picture.crop${key[0].toUpperCase()+key.slice(1)}`)}<NumberField width="w-full min-h-11" label={t(`picture.crop${key[0].toUpperCase()+key.slice(1)}`)} min={0} step={.1} value={stored.crop[key]*100} onCommit={number=>update({crop:{...stored.crop,[key]:number/100}})}/></label>)}</div>
    <button className="timeline-tool" disabled={time<clip.startTime||time>clip.startTime+clip.duration} onClick={()=>update({},true)}>{t('picture.addKeyframe')}</button>
    {(stored.keyframes??[]).map(p=><div key={p.time} className="flex items-center gap-2 text-xs"><button className="min-h-11 flex-1 text-left" onClick={()=>useProjectStore.getState().setPlayheadPosition(Math.max(0,clip.startTime+p.time-(stored.keyframeOffset??0)))}>{p.time.toFixed(3)} s · {Math.round(p.opacity*100)}%</button><select className="bg-gray-800 min-h-11 max-w-28" aria-label={t('picture.easing')} value={p.easing??'linear'} onChange={e=>{const state=useProjectStore.getState();const composition={...stored,keyframes:stored.keyframes?.map(other=>other.time===p.time?{...other,easing:e.target.value as PictureKeyframe['easing']}:other)};useProjectStore.setState({project:{...state.project,video:{...video,clips:videoClips(video).map(c=>c.id===id?{...c,composition}:c)}}});}}>{(['linear','step','ease-in','ease-out','ease-in-out'] as const).map(kind=><option key={kind} value={kind}>{t(`picture.curve.${kind}`)}</option>)}</select><button className="min-h-11" onClick={()=>{
      const state=useProjectStore.getState();const composition={...stored,keyframes:stored.keyframes?.filter(other=>other.time!==p.time)};useProjectStore.setState({project:{...state.project,video:{...video,clips:videoClips(video).map(c=>c.id===id?{...c,composition}:c)}}});
    }}>{t('timeline.delete')}</button></div>)}
    <HelpDetails><p>{t('picture.keyframeHelp')}</p></HelpDetails>
  </fieldset>;
}
