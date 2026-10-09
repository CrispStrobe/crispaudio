import {useMemo,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Modal} from '../common/Modal';
import {useProjectStore} from '../../stores/projectStore';
import {rollCut,rippleTrim,trimToPlayhead,slideClips,slideLimits,TrimEditError} from '../../lib/trimEdits';
import {RangeEditError} from '../../lib/rangeEdits';
const modes=['slide','roll','ripple-left','ripple-right','playhead-left','playhead-right'] as const;
export function TrimEditDialog({onClose}:{onClose:()=>void}){
 const {t}=useTranslation(),project=useProjectStore(s=>s.project),sources=useProjectStore(s=>s.sources),selection=useProjectStore(s=>s.selection),position=useProjectStore(s=>s.playheadPosition);
 const [mode,setMode]=useState<typeof modes[number]>('roll'),[delta,setDelta]=useState(1/(project.frameRate??25));
 const preview=useMemo(()=>{let limits:ReturnType<typeof slideLimits>|undefined;try{
  const ids=selection?.segmentIds??[];
  limits=mode==='slide'?slideLimits(project,ids,sources):undefined;
  return {limits,project:mode==='slide'?slideClips(project,ids,delta,sources):mode==='roll'?rollCut(project,ids,delta,sources):mode.startsWith('ripple')?rippleTrim(project,ids,mode.endsWith('left')?'left':'right',delta,sources):trimToPlayhead(project,ids,mode.endsWith('left')?'left':'right',position,sources)};
 }catch(error){return {limits,error:error instanceof TrimEditError||error instanceof RangeEditError?t(error.message):String(error)};}},[project,sources,selection,mode,delta,position,t]);
 return <Modal isOpen onClose={onClose} title={t('trimEdits.title')} widthClass="max-w-lg"><div className="space-y-3 text-sm text-gray-200">
  <p className="text-gray-400">{t('trimEdits.help')}</p>
  <label className="block">{t('trimEdits.mode')}<select className="block w-full bg-gray-800 rounded p-2" value={mode} onChange={e=>setMode(e.target.value as typeof mode)}>{modes.map(m=><option key={m} value={m}>{t(`trimEdits.${m}`)}</option>)}</select></label>
  {!mode.startsWith('playhead')&&<label className="block">{t('trimEdits.delta')}<input className="bg-gray-800 p-2 rounded w-32 mx-2" type="number" step={1/(project.frameRate??25)} value={Number.isFinite(delta)?delta:''} onChange={e=>setDelta(e.target.value.trim()?Number(e.target.value):NaN)}/></label>}
  {mode==='slide'&&<p className="text-gray-400">{t('trimEdits.slideHelp')}</p>}
  {preview.limits&&<p className="text-xs text-gray-400">{t('trimEdits.slideLimits',{min:preview.limits.min.toFixed(3),max:preview.limits.max.toFixed(3),start:preview.limits.start.toFixed(3),end:preview.limits.end.toFixed(3)})}</p>}
  {mode.startsWith('ripple')&&<p className="text-amber-200">{t('trimEdits.rippleHelp')}</p>}
  {preview.error&&<p role="alert" className="text-amber-300">{preview.error}</p>}
  {preview.project&&<p>{t('rangeEdits.duration',{before:project.duration.toFixed(3),after:preview.project.duration.toFixed(3)})}</p>}
  <button className="timeline-tool bg-indigo-600 disabled:opacity-30" disabled={!preview.project} onClick={()=>{
   const state=useProjectStore.getState();if(!preview.project||state.project!==project)return;
   useProjectStore.setState({project:preview.project,isPlaying:false,rangePlayback:false,selection:null,playheadPosition:Math.min(position,preview.project.duration)});
   if(useProjectStore.getState().project===preview.project)onClose();
  }}>{t('rangeEdits.apply')}</button>
 </div></Modal>;
}
