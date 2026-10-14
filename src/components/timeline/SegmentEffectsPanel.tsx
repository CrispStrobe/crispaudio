import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useProjectStore} from '../../stores/projectStore';
import {useUIStore} from '../../stores/uiStore';
import {EffectChainEditor} from './EffectChainEditor';
import {NumberField} from './NumberField';
import {ParamSlider} from '../shared/ParamSlider';
import {InfoButton} from '../common/InfoButton';
import {placeClips} from '../../lib/clipNavigation';
import {trimToPlayhead} from '../../lib/trimEdits';
import type {FadeCurve,TimelineProject} from '../../types/audio';
const COLORS=['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#f97316','#ec4899'];
/** Focused clip controls; secondary appearance, fades and FX open on demand. */
export function SegmentEffectsPanel({onClose}:{onClose?:()=>void}){
 const {t}=useTranslation(),store=useProjectStore(),recording=useUIStore(s=>s.timelineRecording),[error,setError]=useState('');
 const seg=store.project.tracks.flatMap(t=>t.segments).find(c=>store.selection?.segmentIds.includes(c.id));if(!seg)return null;
 const locked=recording||!!store.project.tracks.find(t=>t.id===seg.trackId)?.locked;
 const edit=(operation:(p:TimelineProject)=>TimelineProject)=>{try{const state=useProjectStore.getState(),next=operation(state.project);if(next!==state.project)useProjectStore.setState({project:next,isPlaying:false});setError('');return true;}catch(e){setError(t(e instanceof Error?e.message:String(e)));return false;}};
 return <div className="space-y-3 text-sm" data-clip-inspector>
  {!onClose&&<strong>{t('timeline.clipSettings')}</strong>}
  <fieldset disabled={locked} className="space-y-3">
   <label className="block text-xs text-gray-400">{t('timeline.name')}<input aria-label={t('timeline.name')} className="w-full min-h-11 bg-gray-800 rounded px-2 text-sm text-gray-200" value={seg.name} onChange={e=>store.setSegmentName(seg.id,e.target.value)}/></label>
   <div className="flex items-center gap-2"><span className="flex-1">{t('editing.startTime')}</span><NumberField label={t('editing.startTime')} value={seg.startTime} min={0} step={1/store.project.sampleRate} onCommit={v=>edit(p=>placeClips(p,[seg.id],v))}/><InfoButton label={t('editing.precisionInfo')}><p>{t('editing.precisionHelp')}</p></InfoButton></div>
   <div className="flex items-center gap-2"><span className="flex-1">{t('editing.duration')}</span><NumberField label={t('editing.duration')} value={seg.duration} min={.01} step={1/store.project.sampleRate} onCommit={v=>edit(p=>trimToPlayhead(p,[seg.id],'right',seg.startTime+v,store.sources))}/></div>
   <ParamSlider label={t('timeline.gain')} value={seg.gain} min={0} max={4} step={.01} onChange={v=>store.setSegmentGain(seg.id,v)}/>
   <details data-clip-section="fades"><summary className="min-h-11 content-center cursor-pointer border-t border-gray-800">{t('fades.title')}</summary><div className="space-y-3 pt-2">{(['in','out'] as const).map(side=>{const duration=side==='in'?seg.fadeInDuration:seg.fadeOutDuration,curve=side==='in'?seg.fadeInCurve:seg.fadeOutCurve;return <div key={side}><ParamSlider label={t(side==='in'?'timeline.fadeIn':'timeline.fadeOut')} value={duration} min={0} max={seg.duration} step={.01} unit="s" onChange={v=>store.setSegmentFade(seg.id,side,v)}/><select aria-label={t(side==='in'?'timeline.fadeIn':'timeline.fadeOut')+' '+t('fxInspector.curve')} className="min-h-11 w-full bg-gray-800 rounded px-2" value={curve} onChange={e=>store.setSegmentFade(seg.id,side,duration,e.target.value as FadeCurve)}>{(['linear','exponential','scurve'] as const).map(c=><option key={c} value={c}>{t(c==='linear'?'timeline.curveLinear':c==='exponential'?'timeline.curveExponential':'timeline.curveScurve')}</option>)}</select></div>;})}</div></details>
   <details data-clip-section="effects"><summary className="min-h-11 content-center cursor-pointer border-t border-gray-800">{t('timeline.effects')} · {seg.effects.length+(seg.nativeEffects?.length??0)}</summary><EffectChainEditor scope={`clip:${seg.id}`} effects={seg.effects} label={t('timeline.effects')} onChange={effects=>{store.setSegmentEffects(seg.id,effects);}}/></details>
   <details data-clip-section="appearance"><summary className="min-h-11 content-center cursor-pointer border-t border-gray-800">{t('editing.appearance')}</summary><div className="flex flex-wrap gap-1">{COLORS.map(color=><button key={color} type="button" aria-label={t('timeline.colorSwatch',{color})} aria-pressed={seg.color===color} className="min-w-11 min-h-11 grid place-items-center rounded hover:bg-gray-800" onClick={()=>store.setSegmentColor(seg.id,color)}><span className={`w-5 h-5 rounded-full border-2 ${seg.color===color?'border-white':'border-transparent'}`} style={{backgroundColor:color}}/></button>)}</div><span className="text-xs text-gray-500">{t('timeline.segmentOffset')}: {seg.sourceOffset.toFixed(3)} s</span></details>
  </fieldset>{error&&<p role="alert" className="text-amber-300">{error}</p>}
 </div>;
}
export default SegmentEffectsPanel;
