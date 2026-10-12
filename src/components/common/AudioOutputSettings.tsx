import {useEffect,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useAudioEngine} from '../../hooks/useAudioEngine';
import {playbackOutputs,selectPlaybackOutput,requestPlaybackOutput,canRequestPlaybackOutput,testPlaybackOutput,type PlaybackOutputs} from '../../lib/audioOutput';
export function AudioOutputSettings(){
 const {t}=useTranslation(),audio=useAudioEngine(),[outputs,setOutputs]=useState<PlaybackOutputs>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[tested,setTested]=useState(false);
 const refresh=async()=>setOutputs(await playbackOutputs());
 const perform=async(action:()=>Promise<unknown>)=>{setBusy(true);setError('');setTested(false);try{await action();await refresh();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 useEffect(()=>{let cancelled=false;const load=()=>{void playbackOutputs().then(o=>{if(!cancelled)setOutputs(o);}).catch(e=>{if(!cancelled)setError(String(e));});};load();navigator.mediaDevices?.addEventListener('devicechange',load);window.addEventListener('focus',load);return()=>{cancelled=true;navigator.mediaDevices?.removeEventListener('devicechange',load);window.removeEventListener('focus',load);};},[]);
 return <section data-audio-output className="space-y-2">
  <label htmlFor="settings-audio-output" className="text-xs font-medium text-gray-400 block">{t('audioOutput.title')}</label>
  {outputs&&outputs.mode!=='system'&&<select id="settings-audio-output" className="w-full min-h-11 bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm min-w-0" value={outputs.selectedId} disabled={busy} onChange={e=>void perform(()=>selectPlaybackOutput(e.target.value))}>
   {!outputs.devices.some(d=>d.id===outputs.selectedId)&&<option value={outputs.selectedId}>{t('audioOutput.disconnected')}</option>}
   {outputs.devices.map(d=><option key={d.id} value={d.id}>{d.label||t('audioOutput.systemDefault')}</option>)}
  </select>}
  <p className="text-xs text-gray-400">{t(outputs?.mode==='mac-system'?'audioOutput.macHelp':outputs?.mode==='system'?'audioOutput.systemHelp':'audioOutput.browserHelp')}</p>
  <div className="flex flex-wrap gap-2">
   <button className="timeline-tool" disabled={busy} onClick={()=>void perform(refresh)}>{t('audioOutput.refresh')}</button>
   {canRequestPlaybackOutput()&&<button className="timeline-tool" disabled={busy} onClick={()=>void perform(requestPlaybackOutput)}>{t('audioOutput.choose')}</button>}
   <button className="timeline-tool" disabled={busy} onClick={()=>{setBusy(true);setError('');setTested(false);void testPlaybackOutput(audio.getContext(),audio.masterGain,audio.analyser).then(()=>setTested(true)).catch(e=>setError(e instanceof Error?e.message:String(e))).finally(()=>setBusy(false));}}>{t('audioOutput.test')}</button>
  </div>
  {tested&&<p role="status" className="text-xs text-green-300">{t('audioOutput.sent')}</p>}
  {error&&<p role="alert" className="text-xs text-amber-300 break-words">{t(error,{defaultValue:error})}</p>}
 </section>;
}
