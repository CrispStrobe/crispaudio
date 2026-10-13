import {InspectorTransport} from './InspectorTransport';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, RotateCcw } from 'lucide-react';
import type { EffectConfig, GainPoint, TimelineProject } from '../../types/audio';
import { applyScopedAutomation, effectParameters, scopedEffect } from '../../lib/scopedEffectAutomation';
import { delayParameterMaximum, effectParameterAt, effectParameterDefault, supportsEffectParameter } from '../../lib/effectAutomation';
import { editGainPoint, normalizeGainPoints } from '../../lib/mixAutomation';
import { timelineDuration } from '../../lib/timelineView';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { Modal } from '../common/Modal';
import { HelpDetails } from '../common/HelpDetails';
import { ToolButton } from '../common/ToolButton';
import { NumberField } from './NumberField';

export function ScopedEffectAutomation({ snapshot, original, scope, index, onClose }: { snapshot: TimelineProject; original: EffectConfig; scope: string; index: number; onClose: () => void }) {
  const { t } = useTranslation();
  const parameters = effectParameters.filter(key => supportsEffectParameter(original.type, key));
  const [parameter, setParameter] = useState(parameters[0]);
  const [draft, setDraft] = useState<NonNullable<EffectConfig['automation']>>(() => structuredClone(original.automation ?? {}));
  const [selected, setSelected] = useState<number | null>(null), [error, setError] = useState('');
  const current = useProjectStore(s => s.project), recording = useUIStore(s => s.timelineRecording);
  const target = scopedEffect(snapshot, scope, index), points = normalizeGainPoints(draft[parameter]), maximum = delayParameterMaximum(parameter);
  const end = Math.max(1, timelineDuration(snapshot), target.end, ...points.map(p => p.time));
  const point = points.find(p => p.time === selected), fallback = original.params[parameter] ?? effectParameterDefault(original.type, parameter);
  const blocked = recording || target.locked || current !== snapshot;
  const valueLabel = t('fxInspector.value') + (parameter === 'time' ? ' (s)' : parameter === 'rate' ? ' (Hz)' : '');
  const update = (next: GainPoint[], time: number | null) => { setDraft(old => ({ ...old, [parameter]: next })); setSelected(time); setError(''); };
  const add = (time: number, value: number) => update(editGainPoint(points, null, { time, value }), time);
  const edit = (patch: Partial<GainPoint>) => {
    if (!point) return false;
    const next = { ...point, ...patch }; delete next.shapeReview;
    if (next.value > maximum) return false;
    update(editGainPoint(points, point.time, next), next.time); return true;
  };
  const x = (time: number) => 12 + time / end * 576, y = (value: number) => 148 - value / maximum * 136;
  const displayed = points.length ? points : [{ time: 0, value: Math.max(0, Math.min(maximum, fallback)) }];
  let path = `M12,${y(displayed[0].value)}`;
  displayed.forEach((p, i) => { if (i && displayed[i - 1].curve === 'step') path += ` H${x(p.time)} V${y(p.value)}`; else path += ` L${x(p.time)},${y(p.value)}`; });
  path += ' H588';
  const apply = () => {
    try {
      const state = useProjectStore.getState(), project = applyScopedAutomation(snapshot, state.project, scope, index, original, draft, useUIStore.getState().timelineRecording);
      if (project !== state.project) useProjectStore.setState({ project });
      onClose();
    } catch (e) { setError(t(e instanceof Error ? e.message : String(e))); }
  };
  return <Modal isOpen onClose={onClose} title={t('fxInspector.title')} widthClass="max-w-xl"><div className="space-y-3 text-sm"><InspectorTransport/>
    <div className="flex items-center justify-between gap-2"><span className="text-gray-400">{t(scope === 'master' ? 'rack.masterEffects' : 'timeline.effects')} · {t('fxInspector.clock')}</span>
      <select className="bg-gray-800 rounded min-h-11 p-2" aria-label={t('fxInspector.parameter')} value={parameter} onChange={e => { setParameter(e.target.value as typeof parameter); setSelected(null); }}>{parameters.map(key => <option key={key} value={key}>{t(`timeline.effectParams.${key}`)}</option>)}</select>
    </div>
    <svg viewBox="0 0 600 160" className="w-full rounded bg-gray-950 border border-gray-700 touch-none" role="img" aria-label={t('fxInspector.curve')} onPointerDown={e => {
      if (blocked || e.button !== 0) return;
      const rect = e.currentTarget.getBoundingClientRect(), px = (e.clientX - rect.left) / rect.width * 600, py = (e.clientY - rect.top) / rect.height * 160;
      const nearest = points.find(p => Math.hypot(x(p.time) - px, y(p.value) - py) < 12);
      if (nearest) setSelected(nearest.time); else add(Math.max(0, Math.min(end, (px - 12) / 576 * end)), Math.max(0, Math.min(maximum, (148 - py) / 136 * maximum)));
    }}>
      {scope.startsWith('clip:') && <rect x={x(target.start)} y="12" width={Math.max(0, x(target.end) - x(target.start))} height="136" fill="#312e81" opacity=".35"/>}
      <path d={path} fill="none" stroke="#818cf8" strokeWidth="2"/>{points.map(p => <circle key={p.time} cx={x(p.time)} cy={y(p.value)} r={p.time === selected ? 6 : 4} fill={p.time === selected ? '#fbbf24' : '#a5b4fc'}/>)}
    </svg>
    <div className="flex justify-between text-xs text-gray-400"><span>0 s</span><span>{end.toFixed(3)} s</span></div>
    <div className="flex items-center gap-2">
      <select className="bg-gray-800 rounded min-h-11 p-2 min-w-0 flex-1" aria-label={t('fxInspector.point')} value={selected ?? ''} onChange={e => setSelected(e.target.value === '' ? null : Number(e.target.value))}><option value="">{t('fxInspector.point')}</option>{points.map((p, i) => <option key={p.time} value={p.time}>{i + 1} · {p.time.toFixed(3)} s · {p.value.toFixed(3)}</option>)}</select>
      <ToolButton icon={Plus} label={t('fxInspector.add')} disabled={blocked} onClick={() => { const time = Math.max(0, useProjectStore.getState().playheadPosition); add(time, effectParameterAt(points, time, fallback, parameter)); }}/>
      <ToolButton icon={Trash2} label={t('fxInspector.remove')} disabled={blocked || !point} onClick={() => update(points.filter(p => p.time !== selected), null)}/>
      <ToolButton icon={RotateCcw} label={t('fxInspector.clear')} disabled={blocked || !points.length} onClick={() => update([], null)}/>
    </div>
    {point && <div className="grid grid-cols-2 gap-2 items-end">
      <label className="text-xs text-gray-400">{t('fxInspector.time')}<NumberField width="w-full block" label={t('fxInspector.time')} value={point.time} min={0} step={1 / snapshot.sampleRate} disabled={blocked} onCommit={time => edit({ time })}/></label>
      <label className="text-xs text-gray-400">{valueLabel}<NumberField width="w-full block" label={valueLabel} value={point.value} min={0} step={.001} disabled={blocked} onCommit={value => edit({ value })}/></label>
      <select className="bg-gray-800 rounded min-h-11 p-2" aria-label={t('fxInspector.segment')} disabled={blocked} value={point.curve ?? 'linear'} onChange={e => edit({ curve: e.target.value as 'linear' | 'step' })}><option value="linear">{t('automation.linear')}</option><option value="step">{t('automation.step')}</option></select>
    </div>}
    {blocked && <p role="status" className="text-amber-300">{t(current !== snapshot ? 'fxInspector.stale' : 'fxInspector.protected')}</p>}{error && <p role="alert" className="text-red-300">{error}</p>}
    <HelpDetails><p>{t('fxInspector.help')}</p></HelpDetails>
    <div className="flex justify-end gap-2"><button className="timeline-tool" onClick={onClose}>{t('common.cancel')}</button><button className="timeline-tool" disabled={blocked} onClick={apply}>{t('fxInspector.apply')}</button></div>
  </div></Modal>;
}
