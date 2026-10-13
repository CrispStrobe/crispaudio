import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {NumberField} from './NumberField';
import {ParamSlider} from '../shared/ParamSlider';
import {InfoButton} from '../common/InfoButton';
import {useProjectStore,projectHistoryGesture} from '../../stores/projectStore';
import {useUIStore} from '../../stores/uiStore';
import {applyClipFades} from '../../lib/clipFades';
import {videoClips} from '../../lib/videoEditing';
import {pictureLocked} from '../../lib/pictureComposition';
import {envelopeValue} from '../../lib/audioEnvelope';
import type {FadeCurve} from '../../types/audio';

export function ClipFadeTools(){
 const {t}=useTranslation(),project=useProjectStore(s=>s.project),ids=useProjectStore(s=>s.selection?.segmentIds??[]),recording=useUIStore(s=>s.timelineRecording);
 const [duration,setDuration]=useState(.25),[curve,setCurve]=useState<FadeCurve>('scurve'),gesture=useRef(false);
 const audio=project.tracks.flatMap(track=>track.locked?[]:track.segments.filter(c=>ids.includes(c.id))),picture=videoClips(project.video).filter(c=>ids.includes(c.id)&&!pictureLocked(project.video,c)),selected=[...audio,...picture],first=audio.length?audio[0]:picture[0];
 const begin=()=>{if(!gesture.current&&!recording&&selected.length){gesture.current=true;projectHistoryGesture.begin();}};
 const end=()=>{if(gesture.current){gesture.current=false;projectHistoryGesture.end();}};
 useEffect(()=>{const end=()=>{if(gesture.current){gesture.current=false;projectHistoryGesture.end();}};window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);window.addEventListener('blur',end);return()=>{end();window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);window.removeEventListener('blur',end);};},[]);
 const apply=(side:'in'|'out'|'both',value=duration,stopPlayback=false)=>{if(useUIStore.getState().timelineRecording)return;const state=useProjectStore.getState();useProjectStore.setState({project:applyClipFades(state.project,state.selection?.segmentIds??[],side,value,curve),...(stopPlayback?{isPlaying:false}:{})});};
 const fadeIn=first?('fadeInDuration' in first?first.fadeInDuration:first.fadeIn):0,fadeOut=first?('fadeOutDuration' in first?first.fadeOutDuration:first.fadeOut):0;
 const inCurve=first&&'fadeInCurve' in first?first.fadeInCurve:'linear',outCurve=first&&'fadeOutCurve' in first?first.fadeOutCurve:'linear';
 return <fieldset disabled={recording||!selected.length} className="space-y-3 mt-3" data-live-fades>
  <div className="flex items-center justify-between text-sm"><span>{selected.length} · {t('fades.title')}</span><InfoButton label={t('fades.title')}><p>{t('fades.help',{count:ids.length})}</p><p>{t('fades.videoHelp')}</p><p>{t('fades.liveHelp')}</p></InfoButton></div>
  {first&&<div className="sticky top-0 z-10 bg-gray-900"><svg data-fade-preview role="img" aria-label={t('fades.preview')} viewBox="0 0 300 64" className="w-full h-16 bg-gray-950 rounded border border-gray-700"><path d="M 0 58 H 300" stroke="#475569"/><polyline fill="none" stroke="#fde047" strokeWidth="2" points={Array.from({length:121},(_,i)=>{const x=i/120;return `${x*300},${58-envelopeValue(x*first.duration,first.duration,fadeIn,fadeOut,inCurve,outCurve)*52}`;}).join(' ')}/></svg></div>}
  <div onPointerDown={e=>{if((e.target as Element).matches('input[type=range]'))begin();}} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key)&&(e.target as Element).matches('input[type=range]'))begin();}} onKeyUp={end} onBlur={end}>
   <ParamSlider label={t('timeline.fadeIn')} value={fadeIn} min={0} max={selected.length?Math.min(...selected.map(c=>c.duration)):1} step={.01} unit="s" onChange={v=>apply('in',v)}/>
   <ParamSlider label={t('timeline.fadeOut')} value={fadeOut} min={0} max={selected.length?Math.min(...selected.map(c=>c.duration)):1} step={.01} unit="s" onChange={v=>apply('out',v)}/>
  </div>
  <label className="flex items-center justify-between gap-3 text-sm">{t('editing.fadeCurve')}<select className="min-h-11 bg-gray-800 rounded p-2" value={curve} aria-label={t('editing.fadeCurve')} onChange={e=>{const next=e.target.value as FadeCurve;setCurve(next);const state=useProjectStore.getState();let project=state.project;for(const clip of audio){project=applyClipFades(project,[clip.id],'in',clip.fadeInDuration,next);project=applyClipFades(project,[clip.id],'out',clip.fadeOutDuration,next);}useProjectStore.setState({project});}}>{(['linear','exponential','scurve'] as const).map(v=><option key={v} value={v}>{t(v==='linear'?'timeline.curveLinear':v==='exponential'?'timeline.curveExponential':'timeline.curveScurve')}</option>)}</select></label>
  <details><summary className="min-h-11 content-center cursor-pointer">{t('fades.presets')}</summary><label className="flex items-center justify-between gap-3 text-sm">{t('editing.duration')}<NumberField value={duration} min={0} step={.001} label={t('fades.duration')} onCommit={v=>{setDuration(v);return true;}}/></label><div className="flex flex-wrap gap-2 mt-2">{(['in','out','both'] as const).map(side=><button className="timeline-tool" key={side} onClick={()=>apply(side,duration,true)}>{t(`fades.${side}`)}</button>)}<button className="timeline-tool" onClick={()=>apply('both',0,true)}>{t('fades.clear')}</button></div></details>
 </fieldset>;
}
