import {useProjectGesture} from '../../hooks/useProjectGesture';
import {EditableNumber} from '../shared/EditableNumber';
import {NumberField} from './NumberField';
import {duckingDefaults} from '../../audio/dsp/ducking';
import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useProjectStore} from '../../stores/projectStore';
import type {TimelineTrack} from '../../types/audio';

export function AddBus(){
  const {t}=useTranslation();
  return <button className="min-h-11 rounded bg-gray-800 px-2 text-xs" onClick={()=>{
    const {project}=useProjectStore.getState();
    useProjectStore.setState({project:{...project,tracks:[...project.tracks,{id:crypto.randomUUID(),kind:'bus',name:`${t('routing.bus')} ${project.tracks.filter(t=>t.kind==='bus').length+1}`,segments:[],volume:1,pan:0,muted:false,solo:false}]}});
  }}>{t('routing.addBus')}</button>;
}

export function RoutingControls({track}:{track:TimelineTrack}){
  const {t}=useTranslation(),tracks=useProjectStore(s=>s.project.tracks),buses=tracks.filter(t=>t.kind==='bus'&&t.id!==track.id);
  const [error,setError]=useState(''),{begin,end}=useProjectGesture();
  const update=(patch:Parameters<ReturnType<typeof useProjectStore.getState>['updateTrack']>[1])=>{
    try{useProjectStore.getState().updateTrack(track.id,patch);setError('');}catch(e){setError(t(e instanceof Error?e.message:'routing.invalid'));}
  };
  const options=<><option value="master">{t('mixer.master')}</option>{buses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</>;
  return <details className="text-xs" aria-label={`${track.name}: ${t('routing.title')}`}>
    <summary className="min-h-11 cursor-pointer content-center">{t('routing.title')}{track.kind==='bus'?` · ${t('routing.bus')}`:''}</summary>
    <fieldset disabled={track.locked} className="space-y-2">
      <label className="block">{t('routing.output')}<select className="w-full min-h-11 bg-gray-800" aria-label={`${track.name}: ${t('routing.output')}`} value={track.output??'master'} onChange={e=>update({output:e.target.value})}>{options}</select></label>
      {(track.sends??[]).map(send=><div key={send.id} className="border border-gray-700 rounded p-1">
        <select className="w-full min-h-11 bg-gray-800" aria-label={t('routing.sendTarget')} value={send.target} onChange={e=>update({sends:track.sends?.map(s=>s.id===send.id?{...s,target:e.target.value}:s)})}>{options}</select>
        <div className="block"><span className="flex items-center justify-between gap-1">{t('routing.sendLevel')}<EditableNumber label={t('routing.sendLevel')} value={send.gain?Math.max(-61,20*Math.log10(send.gain)):-61} min={-61} max={12} step={.1} unit="dB" live onBegin={begin} onEnd={end} onChange={next=>update({sends:track.sends?.map(s=>s.id===send.id?{...s,gain:next<=-61?0:10**(next/20)}:s)})}/></span><input className="w-full min-h-11" aria-label={t('routing.sendLevel')} type="range" onPointerDown={begin} onPointerUp={end} onPointerCancel={end} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key))begin();}} onKeyUp={end} onBlur={end} min={-61} max={12} step={.1} value={send.gain?20*Math.log10(send.gain):-61} onChange={e=>update({sends:track.sends?.map(s=>s.id===send.id?{...s,gain:Number(e.target.value)<=-61?0:10**(Number(e.target.value)/20)}:s)})}/></div>
        <label className="flex min-h-11 items-center gap-1"><input type="checkbox" checked={send.preFader} onChange={e=>update({sends:track.sends?.map(s=>s.id===send.id?{...s,preFader:e.target.checked}:s)})}/>{t('routing.preFader')}</label>
        <button className="min-h-11" onClick={()=>update({sends:track.sends?.filter(s=>s.id!==send.id)})}>{t('routing.removeSend')}</button>
      </div>)}
      <button className="min-h-11" onClick={()=>update({sends:[...(track.sends??[]),{id:crypto.randomUUID(),target:buses[0]?.id??'master',gain:.3,preFader:false}]})}>{t('routing.addSend')}</button>
      <label className="block">{t('routing.ducking')}<select className="w-full min-h-11 bg-gray-800" aria-label={`${track.name}: ${t('routing.ducking')}`} value={track.ducking?.source??''} onChange={e=>update({ducking:e.target.value?{...duckingDefaults,...track.ducking,source:e.target.value}:undefined})}><option value="">{t('routing.noDucking')}</option>{tracks.filter(t=>t.id!==track.id).map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label>
      {track.ducking&&([
        ['threshold',-60,0,1],['ratio',1,20,.1],['attack',.001,1,.001],['release',.005,3,.005],['maximum',0,60,1],
      ] as const).map(([key,min,max,step])=><label className="block" key={key}>{t(`routing.${key}`)}<NumberField label={t(`routing.${key}`)} min={min} step={step} width="w-full min-h-11" value={track.ducking![key]} onCommit={value=>{if(value>max)return false;update({ducking:{...track.ducking!,[key]:value}});return true;}}/></label>)}
    </fieldset>
    {error&&<p role="alert" className="text-amber-300">{error}</p>}
  </details>;
}
