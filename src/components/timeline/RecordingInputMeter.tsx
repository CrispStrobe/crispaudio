import {useTranslation} from 'react-i18next';
import {useRecordingMeterStore} from '../../stores/recordingMeterStore';
export function RecordingInputMeter({trackId,compact=false}:{trackId?:string;compact?:boolean}){
 const {t}=useTranslation(),peak=useRecordingMeterStore(s=>trackId?s.levels[trackId]?.peak??0:Math.max(0,...Object.values(s.levels).map(level=>level.peak))),active=useRecordingMeterStore(s=>trackId?!!s.levels[trackId]:Object.keys(s.levels).length>0),db=peak>0?20*Math.log10(peak):-Infinity,value=Math.max(-60,Math.min(0,db)),text=Number.isFinite(db)?`${db.toFixed(1)} dBFS`:'−∞';
 if(compact&&!active)return null;
 return <div data-recording-meter={trackId??'input'} className={compact?'w-full min-w-0':'w-24 shrink-0'} title={`${t('recording.inputLevel')}: ${text}`}><div role="meter" aria-label={t('recording.inputLevel')} aria-valuemin={-60} aria-valuemax={0} aria-valuenow={value} aria-valuetext={text} data-help="inputLevel" className={`${compact?'h-1':'h-2'} rounded bg-gray-800 overflow-hidden`}><div className={!active?'h-full bg-gray-600':peak>=.98?'h-full bg-red-400':'h-full bg-emerald-400'} style={{width:`${(value+60)/60*100}%`}}/></div>{!compact&&<output className="block text-[10px] leading-4 text-gray-400 tabular-nums text-right">{text}</output>}</div>;
}
