import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import type {TimelineProject} from '../../types/audio';
import {applyNativeParameterAutomation,nativeParameterTarget,type NativeParameterTarget} from '../../lib/nativeParameterAutomation';
import {useProjectStore} from '../../stores/projectStore';
import {useUIStore} from '../../stores/uiStore';
import {ScopedAutomationRecorder} from './ScopedAutomationRecorder';
import {InspectorTransport} from './InspectorTransport';
import {Modal} from '../common/Modal';
import {InfoButton} from '../common/InfoButton';
import {ToolButton} from '../common/ToolButton';
import {RotateCcw} from 'lucide-react';
export function NativeParameterAutomation({snapshot,scope,target,name,unit,defaultValue,onClose}:{snapshot:TimelineProject;scope:string;target:NativeParameterTarget;name:string;unit:string;defaultValue?:number;onClose:()=>void}){
 const {t}=useTranslation(),resolved=nativeParameterTarget(snapshot,scope,target),original=resolved.effect.parameterAutomation?.[target.address];
 const [points,setPoints]=useState(()=>structuredClone(original?.points??[])),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [rangeReset,setRangeReset]=useState(false);
 const rangeChanged=!rangeReset&&!!original?.points.length&&(original.min!==target.min||original.max!==target.max);
 const current=useProjectStore(s=>s.project),recording=useUIStore(s=>s.timelineRecording),blocked=busy||recording||resolved.locked||current!==snapshot;
 const fallback=Math.max(0,Math.min(1,((resolved.effect.parameters[target.address]??defaultValue??target.min)-target.min)/(target.max-target.min)));
 return <Modal isOpen title={`${t('nativeRack.automation')} · ${name}`} onClose={onClose} widthClass="max-w-lg"><div className="space-y-3 text-sm"><InspectorTransport/>
  <div className="flex items-center gap-2"><span className="flex-1">{target.min}–{target.max} {unit}</span><ToolButton icon={RotateCcw} label={t('fxInspector.clear')} disabled={blocked||!points.length} onClick={()=>{setPoints([]);setRangeReset(true);}}/><InfoButton label={t('nativeRack.automation')}><p>{t('nativeRack.automationHelp')}</p></InfoButton></div>
  {rangeChanged&&points.length?<p role="alert">{t('nativeRack.rangeChanged')}</p>:<ScopedAutomationRecorder snapshot={snapshot} scope={scope} index={0} parameter="mix" nativeParameter={{...target,defaultValue,unit}} points={points} fallback={fallback} onDraft={setPoints} onBusy={setBusy}/>}
  <p className="text-xs text-gray-400">{points.length} {t('automation.recordPoints')}</p>
  {error&&<p role="alert">{error}</p>}
  <div className="flex justify-end gap-2"><button className="timeline-tool" onClick={onClose}>{t('common.cancel')}</button><button className="timeline-tool" disabled={blocked||rangeChanged&&!!points.length} onClick={()=>{try{const state=useProjectStore.getState(),next=applyNativeParameterAutomation(snapshot,state.project,scope,{...target,defaultValue},points,useUIStore.getState().timelineRecording);if(next!==state.project)useProjectStore.setState({project:next});onClose();}catch(e){setError(t(e instanceof Error?e.message:String(e)));}}}>{t('fxInspector.apply')}</button></div>
 </div></Modal>;
}
