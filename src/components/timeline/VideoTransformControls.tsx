import { useTranslation } from 'react-i18next';
import { RotateCw, RotateCcw, FlipHorizontal2, FlipVertical2, Copy, Undo2 } from 'lucide-react';
import { ToolButton } from '../common/ToolButton';
import { useProjectStore } from '../../stores/projectStore';
import { videoClips } from '../../lib/videoEditing';
import { DEFAULT_VIDEO_TRANSFORM } from '../../lib/videoTransform';
import { applyVideoTransform } from '../../lib/videoTransformEdit';
import type { VideoTransform } from '../../types/audio';
export function VideoTransformControls({id}:{id:string}) {
  const {t}=useTranslation();
  const clip=useProjectStore(s=>videoClips(s.project.video).find(c=>c.id===id));
  const selected=useProjectStore(s=>s.selection?.segmentIds);
  if(!clip)return null;
  const value=clip.transform??DEFAULT_VIDEO_TRANSFORM;
  const change=(next:VideoTransform|undefined,ids=[id])=>{
    const state=useProjectStore.getState();useProjectStore.setState({project:applyVideoTransform(state.project,ids,next),isPlaying:false});
  };
  const rotate=(angle:number)=>change({...value,rotation:((value.rotation+angle+360)%360) as VideoTransform['rotation']});
  return <section aria-label={t('videoTransform.title')} className="space-y-2">
    <h3 className="text-sm font-semibold">{t('videoTransform.title')} <span className="text-gray-400 tabular-nums">{value.rotation}°</span></h3>
    <div className="flex flex-wrap gap-2">
      <ToolButton icon={RotateCcw} label={t('videoTransform.left')} onClick={()=>rotate(-90)}/>
      <ToolButton icon={RotateCw} label={t('videoTransform.right')} onClick={()=>rotate(90)}/>
      <ToolButton icon={FlipHorizontal2} label={t('videoTransform.horizontal')} aria-pressed={value.flipHorizontal} onClick={()=>change({...value,flipHorizontal:!value.flipHorizontal})}/>
      <ToolButton icon={FlipVertical2} label={t('videoTransform.vertical')} aria-pressed={value.flipVertical} onClick={()=>change({...value,flipVertical:!value.flipVertical})}/>
      <ToolButton icon={Undo2} label={t('videoTransform.reset')} onClick={()=>change(undefined)}/>
      <ToolButton icon={Copy} label={t('videoTransform.copy')} disabled={videoClips(useProjectStore.getState().project.video).filter(c=>selected?.includes(c.id)).length<2} onClick={()=>change({...value},selected)}/>
    </div>
    <p className="text-xs text-gray-400">{t('videoTransform.help')}</p>
  </section>;
}
