import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {NativeTimelineRecording,type NativeInputInventory} from '../../audio/plugins/NativeTimelineRecording';
import {playbackOutputs,type PlaybackDevice} from '../../lib/audioOutput';
import {useSettingsStore} from '../../stores/settingsStore';
import type {RecordingInput} from '../../types/audio';
import {InfoButton} from '../common/InfoButton';
import {NumberField} from './NumberField';
import {ToolButton} from '../common/ToolButton';
import {RefreshCw} from 'lucide-react';
export function NativeRecordingSetup({input,disabled,onChange,onError,onEngineChange}:{input:RecordingInput;disabled:boolean;onChange:(patch:Partial<RecordingInput>)=>void;onError:(message:string)=>void;onEngineChange:()=>void}){
 const {t}=useTranslation(),[inventory,setInventory]=useState<NativeInputInventory>(),[outputs,setOutputs]=useState<PlaybackDevice[]>([]),[loading,setLoading]=useState(false);
 const native=useSettingsStore(s=>s.nativeRecording),output=useSettingsStore(s=>s.nativeRecordingOutput),setNative=useSettingsStore(s=>s.setNativeRecording),setOutput=useSettingsStore(s=>s.setNativeRecordingOutput);
 const route=input.native??{device:'',channels:input.channel==='stereo'?[0,1]:[input.channel==='right'?1:0]};
 const refresh=async()=>{setLoading(true);try{const [inputs,outputs]=await Promise.all([NativeTimelineRecording.inputs(),playbackOutputs()]);setInventory(inputs);setOutputs(outputs.devices);}catch(error){onError(String(error));}finally{setLoading(false);}};
 const selected=inventory?.devices.find(device=>route.device?device.uid===route.device:device.isDefault);
 const maps=Array.from({length:Math.min(32,selected?.channels??2)},(_,channel)=>[channel]);
 for(let channel=0;channel+1<Math.min(32,selected?.channels??2);channel++)maps.push([channel,channel+1]);
 const current=route.channels.join(',');if(!maps.some(map=>map.join(',')===current))maps.push(route.channels);
 return <div className="space-y-2" data-native-recording-setup>
  <div className="flex items-center gap-2"><label className="flex-1 flex items-center justify-between gap-2">{t('recording.engine')}<select aria-label={t('recording.engine')} className="bg-gray-800 rounded min-h-11 px-2" disabled={disabled} value={native?'native':'compatible'} onChange={event=>{onEngineChange();setNative(event.target.value==='native');if(event.target.value==='native')void refresh();}}><option value="compatible">{t('recording.compatible')}</option><option value="native">{t('recording.nativePreview')}</option></select></label><InfoButton label={t('recording.engine')}><p>{t('recording.nativeEngineHelp')}</p></InfoButton></div>
  {native&&<>
   <div className="flex gap-2 items-end"><label className="flex-1 min-w-0 flex items-center justify-between gap-2"><span className="shrink-0">{t('recording.device')}</span><select aria-label={t('recording.device')} disabled={disabled||loading} className="bg-gray-800 rounded min-h-11 min-w-0 w-40" value={route.device} onFocus={()=>{if(!inventory&&!loading)void refresh();}} onChange={event=>onChange({native:{...route,device:event.target.value,channels:[0]}})}><option value="">{t('recording.defaultInput')}</option>{route.device&&!inventory?.devices.some(device=>device.uid===route.device)&&<option value={route.device}>{t('recording.unavailableDevice')}</option>}{inventory?.devices.map(device=><option key={device.uid} value={device.uid}>{device.label}</option>)}</select></label><ToolButton icon={RefreshCw} label={t('recording.refreshDevices')} disabled={disabled||loading} onClick={()=>void refresh()}/></div>
   <label className="flex items-center justify-between gap-2"><span className="shrink-0">{t('recording.channel')}</span><select aria-label={t('recording.channel')} disabled={disabled} className="bg-gray-800 rounded min-h-11 min-w-0 w-40" value={current} onChange={event=>onChange({native:{...route,channels:event.target.value.split(',').map(Number)}})}>{maps.map(map=><option key={map.join(',')} value={map.join(',')}>{map.map(channel=>channel+1).join(' + ')} · {t(map.length===1?'recording.nativeMono':'recording.nativeStereo')}</option>)}</select></label>
   <label className="flex items-center justify-between gap-2"><span className="shrink-0">{t('recording.nativeOutput')}</span><select aria-label={t('recording.nativeOutput')} disabled={disabled||loading} className="bg-gray-800 rounded min-h-11 min-w-0 w-40" value={output} onFocus={()=>{if(!inventory&&!loading)void refresh();}} onChange={event=>setOutput(event.target.value)}><option value="">{t('recording.defaultOutput')}</option>{output&&!outputs.some(device=>device.id===output)&&<option value={output}>{t('recording.unavailableDevice')}</option>}{outputs.map(device=><option key={device.id} value={device.id}>{device.label}</option>)}</select></label>
   <label className="flex items-center min-h-11 gap-2"><input type="checkbox" disabled={disabled} checked={input.monitor} onChange={event=>onChange({monitor:event.target.checked})}/>{t('recording.monitor')}</label>
   <details><summary className="min-h-11 content-center cursor-pointer">{t('recording.timing')}</summary><div className="flex items-center gap-2"><label className="flex-1 flex justify-between items-center gap-2">{t('recording.nativeCorrection')}<NumberField label={t('recording.nativeCorrection')} disabled={disabled} min={-1000} step={.1} value={(route.correctionFrames??0)/48} onCommit={value=>{if(value>1000)return false;onChange({native:{...route,correctionFrames:Math.round(value*48)}});return true;}}/></label><InfoButton label={t('recording.nativeCorrection')}><p>{t('recording.nativeCorrectionHelp')}</p></InfoButton></div></details>
   {inventory&&inventory.permission!=='Authorized'&&<p className="text-xs text-amber-300">{t('recording.nativePermission')}</p>}
  </>}
 </div>;
}
