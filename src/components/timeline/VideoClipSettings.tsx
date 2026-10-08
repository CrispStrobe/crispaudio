import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { trimClips, moveClips, slipClips, projectSelection } from '../../lib/projectEdits';
import { updateVideoClips } from '../../lib/timelineEditing';
import { videoClips, videoSources, frameTime, VIDEO_TRANSITIONS, validateVideoClips } from '../../lib/videoEditing';
import { videoTransitionPatch } from '../../lib/videoTransitionEdit';
import { NumberField } from './NumberField';
import type { VideoClip } from '../../types/audio';

export function VideoClipSettings({id}: {id:string}) {
  const {t}=useTranslation(),video=useProjectStore(s=>s.project.video),fps=useProjectStore(s=>s.project.frameRate??25),[error,setError]=useState('');
  const clips=videoClips(video),clip=clips.find(candidate=>candidate.id===id);
  if(!video||!clip)return null;
  const sorted=[...clips].sort((a,b)=>a.startTime-b.startTime),previous=sorted[sorted.findIndex(candidate=>candidate.id===id)-1];
  const overlap=previous?previous.startTime+previous.duration-clip.startTime:0;
  const change=(patch:Partial<VideoClip>):boolean=>{
    const state=useProjectStore.getState(),currentVideo=state.project.video,currentClips=videoClips(currentVideo),current=currentClips.find(candidate=>candidate.id===id);
    if(!currentVideo||!current)return false;
    try{
      if(current.linkGroup&&('startTime' in patch||'duration' in patch||'sourceOffset' in patch)){
        let project=state.project;
        if(patch.startTime!==undefined)project=moveClips(project,[id],patch.startTime-current.startTime,true);
        if(patch.sourceOffset!==undefined)project=slipClips(project,[id],patch.sourceOffset-current.sourceOffset,state.sources);
        if(patch.duration!==undefined)project=trimClips(project,[id],'right',patch.duration-current.duration,state.sources,true);
        const edited=videoClips(project.video).find(candidate=>candidate.id===id)!;
        // Bounds helpers clamp pointer drags; typed values must be accepted
        // exactly or rejected, rather than silently rewriting the user's input.
        for(const key of ['startTime','sourceOffset','duration'] as const)if(patch[key]!==undefined&&Math.abs(edited[key]-patch[key]!)>1e-6)throw new Error('Source bounds');
        useProjectStore.setState({project,isPlaying:false,selection:state.selection?projectSelection(project,state.selection.segmentIds):null});
      }else{
        const next=currentClips.map(candidate=>candidate.id===id?{...candidate,...patch}:candidate);
        if(validateVideoClips(next,currentVideo.duration,currentVideo.sources))throw new Error('Invalid picture edit');
        updateVideoClips(next);useProjectStore.getState().setIsPlaying(false);
      }
      setError('');return true;
    }catch{setError(t('editing.invalidVideo'));return false;}
  };
  const transition=(type:VideoClip['transition'],duration?:number):boolean=>{
    try{
      const current=useProjectStore.getState().project.video;if(!current)return false;
      return change(videoTransitionPatch(current,id,type,duration));
    }catch{setError(t(type!=='cut'&&!previous?'editing.needPrevious':'editing.invalidVideo'));return false;}
  };
  return <div className="space-y-4">
    <label className="block text-sm text-gray-200">{t('workspace.media')}<select disabled={!!clip.linkGroup} aria-label={t('workspace.media')} className="w-full bg-gray-800 rounded p-2" value={clip.sourceId??'legacy-video'} onChange={event=>{
      const source=videoSources(video).find(candidate=>candidate.id===event.target.value)!;
      change({sourceId:source.id==='legacy-video'?undefined:source.id,sourceOffset:0,duration:Math.min(clip.duration,source.duration)});
    }}>{videoSources(video).map(source=><option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
    <p className="text-sm text-gray-400">{t('editing.videoHelp')}</p>
    {(['startTime','sourceOffset','duration','fadeIn','fadeOut'] as const).map(key=><label key={key} className="flex items-center justify-between gap-3 text-sm text-gray-200">{t(`editing.${key}`)}
      <NumberField key={`${id}-${key}`} value={clip[key]} step={1/fps} label={t(`editing.${key}`)} onCommit={value=>change({[key]:frameTime(value,fps)})} onCancel={()=>setError('')}/>
    </label>)}
    <label className="flex items-center justify-between gap-3 text-sm text-gray-200">{t('editing.transition')}<select disabled={!!clip.linkGroup&&overlap<=1e-6} value={clip.transition} className="bg-gray-800 p-2 rounded max-w-52" aria-label={t('editing.transition')} onChange={event=>transition(event.target.value as VideoClip['transition'])}>
      {VIDEO_TRANSITIONS.map(type=><option key={type} value={type} disabled={type==='cut'&&!!clip.linkGroup&&overlap>1e-6}>{t(`editing.transition_${type}`)}</option>)}
    </select></label>
    <label className="flex items-center justify-between gap-3 text-sm text-gray-200">{t('editing.transitionDuration')}
      <NumberField key={`${id}-transition`} value={clip.transitionDuration} min={1/fps} step={1/fps} disabled={clip.transition==='cut'||!!clip.linkGroup} label={t('editing.transitionDuration')} onCommit={value=>transition(clip.transition,frameTime(value,fps))} onCancel={()=>setError('')}/>
    </label>
    <p className="text-xs text-gray-400">{t('editing.transitionTiming')}</p>
    <p className="text-xs text-gray-400">{t('editing.advancedTransitions')}</p>
    {error&&<p role="alert" className="text-amber-300 text-sm">{error}</p>}
  </div>;
}
