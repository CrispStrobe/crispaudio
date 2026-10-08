import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useProjectStore} from '../../stores/projectStore';
import { trimClips, moveClips, slipClips } from '../../lib/projectEdits';
import {updateVideoClips} from '../../lib/timelineEditing';
import {videoClips,videoSources,frameTime,VIDEO_TRANSITIONS,validateVideoClips} from '../../lib/videoEditing';
import type {VideoClip} from '../../types/audio';
export function VideoClipSettings({id}:{id:string}) {
  const {t}=useTranslation(),video=useProjectStore(s=>s.project.video),[error,setError]=useState('');
  const clips=videoClips(video),clip=clips.find(c=>c.id===id);
  if(!video||!clip)return null;
  const change=(patch:Partial<VideoClip>)=>{
    if(clip.linkGroup&&('startTime' in patch||'duration' in patch||'sourceOffset' in patch)){try{const state=useProjectStore.getState();let project=state.project;if(patch.startTime!==undefined)project=moveClips(project,[id],patch.startTime-clip.startTime);if(patch.sourceOffset!==undefined)project=slipClips(project,[id],patch.sourceOffset-clip.sourceOffset,state.sources);if(patch.duration!==undefined)project=trimClips(project,[id],'right',patch.duration-clip.duration,state.sources);useProjectStore.setState({project,isPlaying:false});setError('');}catch{setError(t('editing.invalidVideo'));}return;}
    const next=clips.map(c=>c.id===id?{...c,...patch}:c),invalid=validateVideoClips(next,video.duration,video.sources);
    if(invalid){setError(t('editing.invalidVideo'));return;}setError('');updateVideoClips(next);
  };
  return <div className="space-y-4">
    <label className="block text-sm text-gray-200">{t('workspace.media')}<select disabled={!!clip.linkGroup} aria-label={t('workspace.media')} className="w-full bg-gray-800 rounded p-2" value={clip.sourceId??'legacy-video'} onChange={e=>{const source=videoSources(video).find(s=>s.id===e.target.value)!;change({sourceId:source.id==='legacy-video'?undefined:source.id,sourceOffset:0,duration:Math.min(clip.duration,source.duration)});}}>{videoSources(video).map(source=><option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
    <p className="text-sm text-gray-400">{t('editing.videoHelp')}</p>
    {(['startTime','sourceOffset','duration','fadeIn','fadeOut'] as const).map(key=><label key={key} className="flex items-center justify-between gap-3 text-sm text-gray-200">{t(`editing.${key}`)}<input key={`${id}-${key}-${clip[key]}`} type="number" min={0} step={1/(useProjectStore.getState().project.frameRate??25)} defaultValue={clip[key]} aria-label={t(`editing.${key}`)} className="bg-gray-800 rounded p-2 w-32" onBlur={e=>change({[key]:frameTime(Number(e.currentTarget.value),useProjectStore.getState().project.frameRate??25)})} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>)}
    <label className="flex items-center justify-between gap-3 text-sm text-gray-200">{t('editing.transition')}<select disabled={!!clip.linkGroup} value={clip.transition} className="bg-gray-800 p-2 rounded max-w-52" aria-label={t('editing.transition')} onChange={e=>{
      const type=e.target.value as VideoClip['transition'];
      const sorted=[...clips].sort((a,b)=>a.startTime-b.startTime),previous=sorted[sorted.findIndex(c=>c.id===id)-1];
      if(type!=='cut'&&!previous){setError(t('editing.needPrevious'));return;}
      const duration=type==='cut'?0:Math.min(clip.transitionDuration||.5,clip.duration/2,previous!.duration/2);
      change({transition:type,transitionDuration:duration,...(previous?{startTime:previous.startTime+previous.duration-duration}:{})});
    }}>{VIDEO_TRANSITIONS.map(type=><option key={type} value={type}>{t(`editing.transition_${type}`)}</option>)}</select></label>
    <label className="flex items-center justify-between gap-3 text-sm text-gray-200">{t('editing.transitionDuration')}<input key={`${id}-transition-${clip.transitionDuration}`} type="number" min={.001} step={.001} defaultValue={clip.transitionDuration} disabled={clip.transition==='cut'||!!clip.linkGroup} aria-label={t('editing.transitionDuration')} className="bg-gray-800 rounded p-2 w-32" onBlur={e=>{const value=Number(e.currentTarget.value);const sorted=[...clips].sort((a,b)=>a.startTime-b.startTime),previous=sorted[sorted.findIndex(c=>c.id===id)-1];if(previous)change({transitionDuration:value,startTime:previous.startTime+previous.duration-value});}}/></label>
    <p className="text-xs text-gray-400">{t('editing.transitionTiming')}</p>
    <p className="text-xs text-gray-400">{t('editing.advancedTransitions')}</p>
    {error&&<p role="alert" className="text-amber-300 text-sm">{error}</p>}
  </div>;
}
