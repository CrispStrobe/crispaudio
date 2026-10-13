import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ArrowLeft,ArrowRight,ExternalLink,X} from 'lucide-react';
import {Modal} from '../common/Modal';
import {ToolButton} from '../common/ToolButton';
import {InfoButton} from '../common/InfoButton';
import {useTimelineTool} from '../../hooks/useTimelineTool';
import {dispatchNativeMenu} from '../../lib/nativeMenu';
import {useProjectStore} from '../../stores/projectStore';
import {useUIStore} from '../../stores/uiStore';
import type {SampleSession} from '../../lib/sampleSessions';
type Exercise='recording'|'comp'|'mix'|'video';
const exercises:Exercise[]=['recording','comp','mix','video'];
const samples:Record<Exercise,SampleSession>={recording:'mix',comp:'takes',mix:'mix',video:'picture'};
const commands:Record<Exercise,string[]>={recording:['recording','recording','recording','play'],comp:['recording','recording','recording','recording'],mix:['mixer','mix-review','mix-review','export'],video:['play','clip-settings','clip-settings','export-video']};
/** Modeless one-step guide: commands keep using the desktop menu/touch ribbon path. */
export function SampleWalkthroughs(){
 const {t}=useTranslation(),[picker,setPicker]=useState(false),[exercise,setExercise]=useState<Exercise>('recording'),[guide,setGuide]=useState<{exercise:Exercise;projectId:string}|null>(null),[step,setStep]=useState(0),pending=useRef<Exercise|null>(null),recording=useUIStore(s=>s.timelineRecording);
 useTimelineTool('walkthroughs',()=>{setPicker(true);pending.current=null;},!recording);
 useEffect(()=>{const loaded=(e:Event)=>{const {kind,projectId}=(e as CustomEvent<{kind:SampleSession;projectId:string}>).detail;const wanted=pending.current;pending.current=null;if(wanted&&samples[wanted]===kind){setGuide({exercise:wanted,projectId});setStep(0);}};window.addEventListener('crispaudio-sample-loaded',loaded);const unsubscribe=useProjectStore.subscribe((state)=>{setGuide(current=>current&&current.projectId!==state.project.id?null:current);});return()=>{window.removeEventListener('crispaudio-sample-loaded',loaded);unsubscribe();};},[]);
 return <><Modal isOpen={picker} onClose={()=>setPicker(false)} title={t('walkthroughs.title')}><div className="space-y-3"><select className="w-full min-h-11 bg-gray-800 rounded px-2" aria-label={t('walkthroughs.title')} value={exercise} onChange={e=>setExercise(e.target.value as Exercise)}>{exercises.map(key=><option key={key} value={key}>{t(`walkthroughs.${key}`)}</option>)}</select><div className="flex justify-end gap-2"><InfoButton label={t('walkthroughs.info')}>{t('walkthroughs.help')}</InfoButton><button className="timeline-tool" disabled={recording} onClick={()=>{pending.current=exercise;setGuide(null);setPicker(false);window.dispatchEvent(new CustomEvent('crispaudio-sample-request',{detail:samples[exercise]}));}}>{t('walkthroughs.start')}</button></div></div></Modal>{guide&&<aside role="region" aria-label={t('walkthroughs.title')} className="fixed bottom-3 right-3 z-20 w-80 max-w-[calc(100vw-1.5rem)] rounded-lg border border-gray-600 bg-gray-900 p-3 shadow-xl" data-sample-guide><div className="flex items-center gap-1"><strong className="text-sm flex-1">{t(`walkthroughs.${guide.exercise}`)} · {step+1}/4</strong><InfoButton label={t('walkthroughs.info')}>{t('walkthroughs.help')}</InfoButton><ToolButton icon={X} label={t('walkthroughs.close')} onClick={()=>setGuide(null)}/></div><p className="text-sm my-2" aria-live="polite">{t(`walkthroughs.${guide.exercise}Steps.${step}`)}</p><div className="flex justify-between"><ToolButton icon={ArrowLeft} label={t('walkthroughs.previous')} disabled={step===0} onClick={()=>setStep(s=>s-1)}/><ToolButton icon={ExternalLink} label={t('walkthroughs.open')} disabled={recording&&guide.exercise!=='recording'} onClick={()=>dispatchNativeMenu(commands[guide.exercise][step])}/>{step===3?<button className="timeline-tool" onClick={()=>setGuide(null)}>{t('walkthroughs.done')}</button>:<ToolButton icon={ArrowRight} label={t('walkthroughs.next')} onClick={()=>setStep(s=>s+1)}/>}</div></aside>}</>;
}
