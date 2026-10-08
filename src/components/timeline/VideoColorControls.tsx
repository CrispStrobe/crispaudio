import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, Copy, Power } from 'lucide-react';
import { ToolButton } from '../common/ToolButton';
import { DEFAULT_VIDEO_COLOR } from '../../lib/videoColor';
import { applyVideoColor } from '../../lib/videoColorEdit';
import { videoClips } from '../../lib/videoEditing';
import { useProjectStore, projectHistoryGesture } from '../../stores/projectStore';
import type { VideoColor } from '../../types/audio';

export function VideoColorControls({id}:{id:string}) {
  const {t} = useTranslation();
  const clip = useProjectStore(s => videoClips(s.project.video).find(c => c.id === id));
  const selected = useProjectStore(s => s.selection?.segmentIds);
  const gesture = useRef(false);
  const end = () => {if(gesture.current){gesture.current=false;projectHistoryGesture.end();}};
  useEffect(() => {
    const finish=()=>{if(gesture.current){gesture.current=false;projectHistoryGesture.end();}};
    for(const event of ['pointerup','pointercancel','blur']) window.addEventListener(event,finish);
    return ()=>{finish();for(const event of ['pointerup','pointercancel','blur']) window.removeEventListener(event,finish);};
  },[]);
  if (!clip) return null;
  const color = clip.colorCorrection ?? DEFAULT_VIDEO_COLOR;
  const change = (value: VideoColor | undefined, ids = [id]) => {
    const state=useProjectStore.getState();
    useProjectStore.setState({project:applyVideoColor(state.project,ids,value),isPlaying:false});
  };
  return <section className="space-y-3" aria-label={t('videoColor.title')}>
    <h3 className="text-sm font-semibold">{t('videoColor.title')}</h3>
    <div className="flex gap-2 items-center">
      <ToolButton icon={Power} label={t(color.enabled?'videoColor.bypass':'videoColor.enable')} aria-pressed={color.enabled} onClick={()=>change({...color,enabled:!color.enabled})}/>
      <ToolButton icon={RotateCcw} label={t('videoColor.reset')} onClick={()=>change(undefined)}/>
      <ToolButton icon={Copy} label={t('videoColor.applySelected')} disabled={videoClips(useProjectStore.getState().project.video).filter(c=>selected?.includes(c.id)).length<2}
        onClick={()=>change({...color},selected)}/>
    </div>
    {(['exposure','contrast','saturation'] as const).map(key=><label key={key} className="block text-sm text-gray-300">
      <span className="flex justify-between gap-2 mb-2"><span>{t(`videoColor.${key}`)}</span><output className="tabular-nums">{color[key].toFixed(2)}{key==='exposure'?' EV':''}</output></span>
      <input type="range" min={key==='exposure'?-2:0} max={2} step={.01} value={color[key]} disabled={!color.enabled} aria-label={t(`videoColor.${key}`)} className="slider-styled w-full"
        onPointerDown={()=>{if(!gesture.current){gesture.current=true;projectHistoryGesture.begin();}}}
        onPointerUp={end} onPointerCancel={end} onBlur={end}
        onChange={event=>change({...color,[key]:Number(event.target.value)})}/>
    </label>)}
    <p className="text-xs text-gray-400">{t('videoColor.help')}</p>
  </section>;
}
