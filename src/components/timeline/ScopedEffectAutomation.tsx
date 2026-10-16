import {ScopedAutomationRecorder} from './ScopedAutomationRecorder';
import {InspectorTransport} from './InspectorTransport';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import type { EffectConfig, GainPoint, TimelineProject } from '../../types/audio';
import { applyScopedAutomation, effectParameters, scopedEffect } from '../../lib/scopedEffectAutomation';
import { delayParameterMaximum, effectParameterDefault, supportsEffectParameter } from '../../lib/effectAutomation';
import { normalizeGainPoints } from '../../lib/mixAutomation';
import { timelineDuration } from '../../lib/timelineView';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { Modal } from '../common/Modal';
import { InfoButton } from '../common/InfoButton';
import { ToolButton } from '../common/ToolButton';
import type {EffectEnvelope} from '../../lib/effectEnvelope';
import { ParameterCurveEditor } from './ParameterCurveEditor';

export function ScopedEffectAutomation({ snapshot, original, scope, index, onClose }: { snapshot: TimelineProject; original: EffectConfig; scope: string; index: number; onClose: () => void }) {
  const { t } = useTranslation();
  const parameters = effectParameters.filter(key => supportsEffectParameter(original.type, key));
  const [parameter, setParameter] = useState(parameters[0]);
  const [draft, setDraft] = useState<NonNullable<EffectConfig['automation']>>(() => structuredClone(original.automation ?? {}));
  const [shapeOpen,setShapeOpen]=useState(false);
  const [editing, setEditing] = useState(false), [validDraft,setValidDraft]=useState(true), [error, setError] = useState(''),[recordOpen,setRecordOpen]=useState(false),[passBusy,setPassBusy]=useState(false);
  const current = useProjectStore(s => s.project), recording = useUIStore(s => s.timelineRecording);
  const target = scopedEffect(snapshot, scope, index), points = normalizeGainPoints(draft[parameter]), maximum = delayParameterMaximum(parameter);
  const fallback = Math.max(0, Math.min(maximum, original.params[parameter] ?? effectParameterDefault(original.type, parameter)));
  const blocked = passBusy || recording || target.locked || current !== snapshot;
  const unit = parameter === 'time' ? 'ms' : parameter === 'rate' || parameter === 'freq' ? 'Hz' : '%';
  const displayScale = unit === 'ms' ? 1000 : unit === '%' ? 100 : 1;
  const update = useCallback((next: GainPoint[]) => { setDraft(old => ({ ...old, [parameter]: next })); setError(''); }, [parameter]);
  const apply = () => {
    try {
      const state = useProjectStore.getState(), project = applyScopedAutomation(snapshot, state.project, scope, index, original, draft, useUIStore.getState().timelineRecording);
      if (project !== state.project) useProjectStore.setState({ project });
      onClose();
    } catch (e) { setError(t(e instanceof Error ? e.message : String(e))); }
  };
  return <Modal isOpen onClose={onClose} title={t('fxInspector.title')} widthClass="max-w-lg self-start my-4"><div className="space-y-3 text-sm"><InspectorTransport/>
    <div className="flex items-center justify-between gap-2"><span className="text-gray-400">{t(scope === 'master' ? 'rack.masterEffects' : 'timeline.effects')} · {t('fxInspector.clock')}</span>
      <select className="bg-gray-800 rounded min-h-11 p-2" aria-label={t('fxInspector.parameter')} disabled={blocked || editing || !validDraft} value={parameter} onChange={e => { setParameter(e.target.value as typeof parameter); setValidDraft(true); }}>{parameters.map(key => <option key={key} value={key}>{t(`timeline.effectParams.${key}`)}</option>)}</select>
    </div>
    <div className={shapeOpen?'hidden':'flex justify-end gap-2'}><ToolButton icon={RotateCcw} label={t('fxInspector.clear')} disabled={blocked||editing||!points.length} onClick={()=>{update([]);setValidDraft(true);}}/><InfoButton label={t('fxInspector.title')}><p>{t('fxInspector.help')}</p></InfoButton></div>
    <ParameterCurveEditor key={parameter} points={points} fallback={fallback} min={0} max={maximum*displayScale} storageMax={maximum} domain={{kind:'builtin',effectType:original.type as EffectEnvelope['effectType'],parameter}} unit={unit} duration={timelineDuration(snapshot)} rate={snapshot.sampleRate} clip={scope.startsWith('clip:')?{start:target.start,end:target.end}:undefined} disabled={blocked} onChange={update} onBusy={setEditing} onValidity={setValidDraft} onShapeReview={setShapeOpen} playhead={()=>useProjectStore.getState().playheadPosition}/>
    <details hidden={shapeOpen} onToggle={e=>setRecordOpen(e.currentTarget.open)} data-scoped-record-section><summary className="min-h-11 content-center cursor-pointer">{t('fxInspector.recordPass')}</summary>{recordOpen&&<fieldset disabled={editing||!validDraft}><ScopedAutomationRecorder key={`${scope}:${index}:${parameter}`} snapshot={snapshot} scope={scope} index={index} parameter={parameter} points={points} fallback={fallback} onDraft={update} onBusy={setPassBusy}/></fieldset>}</details>
    {blocked && <p role="status" className="text-amber-300">{t(current !== snapshot ? 'fxInspector.stale' : 'fxInspector.protected')}</p>}{error && <p role="alert" className="text-red-300">{error}</p>}
    {!shapeOpen&&<div className="flex justify-end gap-2"><button className="timeline-tool" onClick={onClose}>{t('common.cancel')}</button><button className="timeline-tool" disabled={blocked||editing||!validDraft} onClick={apply}>{t('fxInspector.apply')}</button></div>}
  </div></Modal>;
}
