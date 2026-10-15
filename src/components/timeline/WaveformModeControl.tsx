import {useUIStore} from '../../stores/uiStore';
import {useTranslation} from 'react-i18next';
import {HelpDetails} from '../common/HelpDetails';
import {useSettingsStore} from '../../stores/settingsStore';
import {useProjectStore} from '../../stores/projectStore';
export function WaveformModeControl({trackId}:{trackId?:string}){
 const recording=useUIStore(s=>s.timelineRecording);
 const {t}=useTranslation(),fallback=useSettingsStore(s=>s.waveformMode),track=useProjectStore(s=>s.project.tracks.find(track=>track.id===trackId));
 return <div className="flex items-center gap-1"><select disabled={!!trackId&&recording} aria-label={t('nativeMenu.Waveform Display')} className="bg-gray-800 rounded px-2 min-h-11 min-w-0 flex-1 text-sm" value={track?.waveformMode??(trackId?'':fallback)} onChange={e=>{const mode=e.target.value as 'normalized'|'level'|'';if(trackId)useProjectStore.getState().updateTrack(trackId,{waveformMode:mode||undefined});else if(mode)useSettingsStore.getState().setWaveformMode(mode);}}>
 {trackId&&<option value="">{t('timeline.waveformDefault')} · {t(fallback==='normalized'?'alignment.normalized':'alignment.atMixLevel')}</option>}
 <option value="normalized">{t('alignment.normalized')}</option><option value="level">{t('alignment.atMixLevel')}</option></select><HelpDetails><p>{t('timeline.waveformHelp')}</p></HelpDetails></div>;
}
