import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import type {NativeRecordingController} from '../../audio/plugins/NativeRecordingController';
import type {RecordingInput} from '../../types/audio';
import {ParamSlider} from '../shared/ParamSlider';
import {InfoButton} from '../common/InfoButton';
const db=(gain:number)=>20*Math.log10(Math.max(.001,gain));
/** Ephemeral listening controls; never update project fields during capture. */
export function NativeRecordingMix({controller,targets,selectedId,disabled,onError}:{controller:NativeRecordingController;targets:{trackId:string;name:string;input:RecordingInput}[];selectedId:string;disabled:boolean;onError:(message:string)=>void}){
 const {t}=useTranslation(),[state,setState]=useState(()=>controller.monitorState()),[selected,setSelected]=useState(selectedId),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const send=(task:Promise<void>)=>{void task.catch(error=>{if(alive.current)onError(t(error instanceof Error?error.message:String(error)));});};
 const target=targets.find(target=>target.trackId===selected)??targets[0],cue=state.cues[target.trackId],enabled=target.input.monitor;
 const level=(key:'backing'|'output',value:number)=>{const mix={...controller.monitorState().mix,[key]:value};send(controller.mix(mix));setState(controller.monitorState());};
 const changeCue=(patch:Partial<typeof cue>)=>{const next={...controller.monitorState().cues[target.trackId],...patch};send(controller.cue(target.trackId,next));setState(controller.monitorState());};
 return <details data-recording-section="live-mix"><summary className="min-h-11 content-center cursor-pointer border-t border-gray-800">{t('recording.liveMix')}</summary><div className="space-y-2 pt-2">
  <div className="flex justify-end"><InfoButton label={t('recording.liveMix')}><p>{t('recording.liveMixHelp')}</p></InfoButton></div>
  <fieldset disabled={disabled} className="space-y-2">
   {(['backing','output'] as const).map(key=><div key={key} className="flex items-end gap-2"><div className="min-w-0 flex-1"><ParamSlider label={t(`recording.mix_${key}`)} min={-60} max={0} step={.1} value={db(state.mix[key]===0?state.lastMix[key]:state.mix[key])} unit="dB" liveNumber disabled={disabled} onChange={value=>{send(controller.mixLevel(key,10**(value/20)));setState(controller.monitorState());}}/></div><label className="flex gap-1 min-h-11 items-center text-xs"><input type="checkbox" checked={state.mix[key]===0} onChange={event=>level(key,event.target.checked?0:state.lastMix[key])}/>{t('recording.mixMute')}</label></div>)}
   <label className="flex justify-between items-center gap-2">{t('recording.track')}<select aria-label={t('recording.mixTrack')} className="bg-gray-800 min-w-0 w-40 min-h-11 rounded" value={target.trackId} onChange={event=>setSelected(event.target.value)}>{targets.map(target=><option key={target.trackId} value={target.trackId}>{target.name}</option>)}</select></label>
   <fieldset disabled={!enabled} className="space-y-2">
    <div className="flex gap-2 items-end"><div className="flex-1 min-w-0"><ParamSlider label={t('recording.cueLevel')} min={-60} max={12} step={.1} value={Math.min(12,db(cue.gain===0?state.lastCueGains[target.trackId]:cue.gain))} unit="dB" liveNumber disabled={disabled||!enabled} onChange={value=>{send(controller.cueLevel(target.trackId,Math.min(4,10**(value/20))));setState(controller.monitorState());}}/></div><label className="flex gap-1 min-h-11 items-center text-xs"><input type="checkbox" checked={cue.gain===0} onChange={event=>changeCue({gain:event.target.checked?0:state.lastCueGains[target.trackId]})}/>{t('recording.mixMute')}</label></div>
    <ParamSlider label={t('recording.cuePan')} min={-1} max={1} step={.01} value={cue.pan} liveNumber disabled={disabled||!enabled} onChange={pan=>changeCue({pan})}/>
    <label className="flex gap-2 items-center min-h-11"><input type="checkbox" checked={cue.mono} onChange={event=>changeCue({mono:event.target.checked})}/>{t('recording.cueMono')}</label>
   </fieldset>{!enabled&&<p className="text-xs text-gray-400">{t('recording.mixNoCue')}</p>}
  </fieldset>
 </div></details>;
}
