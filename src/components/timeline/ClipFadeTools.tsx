import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberField } from './NumberField';
import { useProjectStore } from '../../stores/projectStore';
import { applyClipFades } from '../../lib/clipFades';
import type { FadeCurve } from '../../types/audio';

export function ClipFadeTools() {
  const {t} = useTranslation();
  const [duration, setDuration] = useState(.25), [curve, setCurve] = useState<FadeCurve>('scurve');
  const ids = useProjectStore(s => s.selection?.segmentIds);
  const apply = (side: 'in' | 'out' | 'both', value = duration) => {
    const state = useProjectStore.getState();
    useProjectStore.setState({project: applyClipFades(state.project, ids ?? [], side, value, curve), isPlaying: false});
  };
  return <div className="space-y-4">
    <p className="text-sm text-gray-300">{t('fades.help', {count: ids?.length ?? 0})}</p>
    <label className="flex items-center justify-between gap-3 text-sm">{t('editing.duration')}
      <NumberField value={duration} min={0} step={.001} label={t('fades.duration')} onCommit={value => {setDuration(value); return true;}}/>
    </label>
    <label className="flex items-center justify-between gap-3 text-sm">{t('editing.fadeCurve')}
      <select className="min-h-11 bg-gray-800 rounded p-2" value={curve} aria-label={t('editing.fadeCurve')} onChange={e => setCurve(e.target.value as FadeCurve)}>
        {(['linear','exponential','scurve'] as const).map(value => <option key={value} value={value}>{t(value === 'linear' ? 'timeline.curveLinear' : value === 'exponential' ? 'timeline.curveExponential' : 'timeline.curveScurve')}</option>)}
      </select>
    </label>
    <p className="text-xs text-gray-400">{t('fades.videoHelp')}</p>
    <div className="flex flex-wrap gap-2">
      {(['in','out','both'] as const).map(side => <button className="timeline-tool" key={side} disabled={!ids?.length} onClick={() => apply(side)}>{t(`fades.${side}`)}</button>)}
      <button className="timeline-tool" disabled={!ids?.length} onClick={() => apply('both', 0)}>{t('fades.clear')}</button>
    </div>
  </div>;
}
