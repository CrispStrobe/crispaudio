import {useTranslation} from 'react-i18next';
import {ArrowUp,ArrowDown} from 'lucide-react';
import {useProjectStore} from '../../stores/projectStore';
import {useUIStore} from '../../stores/uiStore';
import {useProjectGesture} from '../../hooks/useProjectGesture';
import {FloatingInspector} from '../common/FloatingInspector';
import {HelpDetails} from '../common/HelpDetails';
import {ToolButton} from '../common/ToolButton';
import {ParamSlider} from '../shared/ParamSlider';
import {InspectorTransport} from './InspectorTransport';
import {WaveformModeControl} from './WaveformModeControl';
import {EffectChainEditor} from './EffectChainEditor';
import {NumberField} from './NumberField';
import type {FadeCurve} from '../../types/audio';
export function TrackSettingsInspector({trackId,onTrackChange,onClose}:{trackId:string;onTrackChange:(id:string)=>void;onClose:()=>void}){
 const {t}=useTranslation(),project=useProjectStore(s=>s.project),recording=useUIStore(s=>s.timelineRecording),gesture=useProjectGesture();
 const track=project.tracks.find(track=>track.id===trackId)??project.tracks[0];if(!track)return null;
 const index=project.tracks.indexOf(track),update=(patch:Parameters<ReturnType<typeof useProjectStore.getState>['updateTrack']>[1])=>useProjectStore.getState().updateTrack(track.id,patch);
 return <FloatingInspector title={t('nativeMenu.Track Settings…')} onClose={onClose}><div className="space-y-2" data-track-settings>
  <div className="flex items-center gap-1"><select className="min-h-11 min-w-0 flex-1 bg-gray-800 rounded px-2" aria-label={t('recording.track')} value={track.id} onChange={e=>{gesture.end();onTrackChange(e.target.value);}}>{project.tracks.map(track=><option key={track.id} value={track.id}>{track.name}</option>)}</select><HelpDetails><p>{t('timeline.mixerHelp')}</p></HelpDetails></div>
  <InspectorTransport/>
  <fieldset disabled={recording||!!track.locked} className="space-y-3">
   <input aria-label={t('timeline.trackName')} className="w-full min-h-11 rounded bg-gray-800 px-2 text-sm" value={track.name} onChange={e=>update({name:e.target.value})}/>
   <div className="flex gap-1">{(['muted','solo'] as const).map(key=><button key={key} className={`timeline-tool flex-1 ${track[key]?'!bg-indigo-600':''}`} aria-pressed={track[key]} onClick={()=>update({[key]:!track[key]})}>{t(key==='muted'?'timeline.mute':'timeline.solo')}</button>)}</div>
   <ParamSlider label={t('timeline.trackVolume')} value={track.volume>0?Math.max(-60,20*Math.log10(track.volume)):-60} min={-60} max={40} step={.1} unit="dB" onInteractionStart={gesture.begin} onInteractionEnd={gesture.end} liveNumber onChange={next=>update({volume:next<=-60?0:10**(next/20)})}/>
   <ParamSlider label={t('mixer.pan')} value={track.pan*100} min={-100} max={100} step={1} disabled={!!track.panAutomation?.length} onInteractionStart={gesture.begin} onInteractionEnd={gesture.end} liveNumber onChange={next=>update({pan:next/100})}/>
   <details><summary className="min-h-11 content-center cursor-pointer border-t border-gray-800">{t('fades.title')}</summary><div className="space-y-2">{(['in','out'] as const).map(side=><div key={side} className="flex flex-wrap items-center gap-1 text-xs"><span className="flex-1">{t(side==='in'?'timeline.fadeIn':'timeline.fadeOut')}</span><NumberField label={t(side==='in'?'timeline.fadeIn':'timeline.fadeOut')} value={(side==='in'?track.fadeInDuration:track.fadeOutDuration)??0} min={0} step={.001} scrubStep={.01} width="w-20" onCommit={next=>{update(side==='in'?{fadeInDuration:next}:{fadeOutDuration:next});return true;}}/><span>s</span><select aria-label={t('editing.fadeCurve')+' '+side} className="min-h-11 bg-gray-800 rounded px-2" value={(side==='in'?track.fadeInCurve:track.fadeOutCurve)??'linear'} onChange={e=>update(side==='in'?{fadeInCurve:e.target.value as FadeCurve}:{fadeOutCurve:e.target.value as FadeCurve})}>{(['linear','exponential','scurve'] as const).map(curve=><option key={curve} value={curve}>{t(curve==='linear'?'timeline.curveLinear':curve==='exponential'?'timeline.curveExponential':'timeline.curveScurve')}</option>)}</select></div>)}</div></details>
   <details><summary className="min-h-11 content-center cursor-pointer border-t border-gray-800">{t('rack.trackEffects')} · {(track.effects?.length??0)+(track.nativeEffects?.length??0)}</summary><EffectChainEditor scope={`track:${track.id}`} effects={track.effects??[]} label={`${track.name} ${t('rack.trackEffects')}`} onChange={effects=>update({effects})}/></details>
   <details><summary className="min-h-11 content-center cursor-pointer border-t border-gray-800">{t('timeline.trackActions')}</summary><div className="flex flex-wrap items-center gap-1"><ToolButton icon={ArrowUp} label={t('timeline.moveTrackUp')} disabled={index===0} onClick={()=>useProjectStore.getState().reorderTrack(track.id,index-1)}/><ToolButton icon={ArrowDown} label={t('timeline.moveTrackDown')} disabled={index===project.tracks.length-1} onClick={()=>useProjectStore.getState().reorderTrack(track.id,index+1)}/><button className="timeline-tool" onClick={()=>{const state=useProjectStore.getState();useProjectStore.setState({project:{...state.project,tracks:state.project.tracks.map(t=>({...t,muted:t.id!==track.id,solo:false}))}});}}>{t('timeline.listenOnly')}</button><button className="timeline-tool" onClick={()=>{const state=useProjectStore.getState();useProjectStore.setState({project:{...state.project,tracks:state.project.tracks.map(t=>({...t,solo:false}))}});}}>{t('editor.clearSolos')}</button></div></details>
  </fieldset>
  <WaveformModeControl trackId={track.id}/>
  <button className="timeline-tool" disabled={recording} onClick={()=>window.dispatchEvent(new CustomEvent('crispaudio-track-templates',{detail:track.id}))}>{t('templates.title')}</button>
  <details><summary className="min-h-11 content-center cursor-pointer border-t border-gray-800">{t('rack.masterEffects')}</summary><fieldset disabled={recording}><EffectChainEditor scope="master" effects={project.masterEffects} label={t('rack.masterEffects')} onChange={masterEffects=>{const state=useProjectStore.getState();useProjectStore.setState({project:{...state.project,masterEffects}});}}/></fieldset></details>
 </div></FloatingInspector>;
}
