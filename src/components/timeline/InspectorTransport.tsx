import {Play,Pause,Square} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import {useProjectStore} from '../../stores/projectStore';
import {useUIStore} from '../../stores/uiStore';
import {useAudioEngine} from '../../hooks/useAudioEngine';
import {ToolButton} from '../common/ToolButton';
/** Transport remains usable while a focused inspector owns keyboard/modal focus. */
export function InspectorTransport(){
 const {t}=useTranslation(),playing=useProjectStore(s=>s.isPlaying),recording=useUIStore(s=>s.timelineRecording),audio=useAudioEngine();
 return <div className="flex gap-1" data-inspector-transport><ToolButton icon={playing?Pause:Play} label={t(playing?'timeline.pause':'timeline.play')} disabled={recording} onClick={()=>{if(playing)useProjectStore.getState().setIsPlaying(false);else void audio.resume().then(()=>{if(!useUIStore.getState().timelineRecording)useProjectStore.getState().setIsPlaying(true);}).catch(error=>window.dispatchEvent(new CustomEvent('crispaudio-edit-error',{detail:String(error)})));}}/><ToolButton icon={Square} label={t('timeline.stop')} disabled={recording} onClick={()=>useProjectStore.getState().setIsPlaying(false)}/></div>;
}
