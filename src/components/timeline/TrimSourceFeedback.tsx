import {createPortal} from 'react-dom';
import {useTranslation} from 'react-i18next';
import {useProjectStore} from '../../stores/projectStore';
import {sourceHandles,type TrimFeedback} from '../../lib/trimFeedback';

/** Outside clipped timeline rows; remains visible even at minimum track height. */
export function TrimSourceFeedback({feedback}:{feedback:TrimFeedback|null}){
 return feedback?<ActiveTrimSourceFeedback feedback={feedback}/>:null;
}
function ActiveTrimSourceFeedback({feedback}:{feedback:TrimFeedback}){
 const {t}=useTranslation(),project=useProjectStore(s=>s.project),sources=useProjectStore(s=>s.sources);
 let handles:ReturnType<typeof sourceHandles>=[],error=feedback.error;
 try{handles=sourceHandles(project,feedback.ids,sources).sort((a,b)=>feedback.side==='left'?a.before-b.before:a.after-b.after);}catch(e){error??=e instanceof Error?e.message:String(e);}
 return createPortal(<aside aria-label={t('trimFeedback.title')} className="fixed right-3 bottom-14 z-[2500] pointer-events-none w-80 max-w-[calc(100vw-24px)] rounded-lg border border-gray-600 bg-gray-950/95 p-3 shadow-xl text-xs text-gray-200">
  <div className="flex justify-between gap-2 mb-2"><strong>{t('trimFeedback.title')}</strong><span>{feedback.applied>=0?'+':''}{feedback.applied.toFixed(3)} s</span></div>
  <div className="max-h-[35vh] overflow-hidden space-y-2">{handles.map(h=><div key={h.id}>
   <div className="flex justify-between gap-2"><span className="truncate">{h.name}</span><span className="shrink-0 font-mono">{h.start.toFixed(3)}–{h.end.toFixed(3)} s</span></div>
   <div aria-hidden="true" className="h-2 mt-1 rounded bg-gray-700 relative overflow-hidden"><span className="absolute inset-y-0 bg-indigo-400" style={{left:`${100*h.start/h.duration}%`,width:`${100*(h.end-h.start)/h.duration}%`}}/></div>
   <div className="flex justify-between text-gray-400"><span>{t('trimFeedback.before',{seconds:h.before.toFixed(3)})}</span><span>{t('trimFeedback.after',{seconds:h.after.toFixed(3)})}</span></div>
  </div>)}</div>
  {(error||feedback.limited)&&<p role="status" className="text-amber-300 mt-2">{error?t(error.replace(/^Error: /,'')):t('trimFeedback.limit')}</p>}
 </aside>,document.body);
}
