import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';
import { NumberField } from './NumberField';
import { useProjectStore } from '../../stores/projectStore';
import { DEFAULT_MUSIC, validMusic, musicalPosition, musicalLabel, barTime, barSeconds, type MusicalSettings } from '../../lib/musicalTime';
import { timelineDuration } from '../../lib/timelineView';
export function MusicalControls() {
    const { t } = useTranslation(), music = useProjectStore(s => s.project.music), playhead = useProjectStore(s => s.playheadPosition), editRange = useProjectStore(s => s.project.editRange), m = music ?? DEFAULT_MUSIC, [open, setOpen] = useState(false), [bar, setBar] = useState(1), [bars, setBars] = useState(4), [extend, setExtend] = useState(false), [error, setError] = useState('');
    const update = (patch: Partial<MusicalSettings>) => { const state = useProjectStore.getState(), next = { ...(state.project.music ?? DEFAULT_MUSIC), ...patch }; if (!validMusic(next))
        return false; useProjectStore.setState({ project: { ...state.project, music: next } }); return true; };
    const loop = () => { const state = useProjectStore.getState(), m = state.project.music ?? DEFAULT_MUSIC, start = barTime(bar, m), end = start + bars * barSeconds(m); if (!Number.isInteger(bar) || bar < 1 || !Number.isInteger(bars) || bars < 1 || bars > 64 || start < 0 || !Number.isFinite(end) || end > 86400) {
        setError(t('music.invalidLoop'));
        return;
    } if (end > state.project.duration + 1e-9 && !extend) {
        setError(t('music.extendRequired'));
        return;
    } const next = { ...state.project, music: m, editRange: { start, end }, ...(extend ? { minimumDuration: Math.max(state.project.minimumDuration ?? 0, end) } : {}) }; useProjectStore.setState({ project: { ...next, duration: timelineDuration(next) } }); setError(''); };
    return <><button className="timeline-tool" onClick={() => { setBar(Math.max(1, musicalPosition(useProjectStore.getState().playheadPosition, m).bar)); setOpen(true); }}>{t('music.title')}</button><Modal isOpen={open} onClose={() => setOpen(false)} title={t('music.title')}><div className="space-y-3 text-sm">
  <p className="text-xs text-gray-400">{t('music.clockNote')}</p><p role="status">{t('music.position')}: {musicalLabel(playhead, m)} · {playhead.toFixed(3)} s</p>
  <div className="grid grid-cols-2 gap-3">{(['tempo', 'numerator', 'origin', 'clickLevel'] as const).map(key => <label key={key}>{t(`music.${key}`)}<NumberField width="w-full" label={t(`music.${key}`)} value={m[key]} min={key === 'tempo' ? 20 : key === 'numerator' ? 1 : 0} step={key === 'origin' ? .001 : key === 'clickLevel' ? .05 : 1} onCommit={v => update({ [key]: v })}/></label>)}
   <label>{t('music.denominator')}<select aria-label={t('music.denominator')} className="w-full bg-gray-800 min-h-11" value={m.denominator} onChange={e => update({ denominator: Number(e.target.value) as MusicalSettings['denominator'] })}>{[1, 2, 4, 8, 16].map(v => <option key={v}>{v}</option>)}</select></label>
   <label>{t('music.ruler')}<select aria-label={t('music.ruler')} className="w-full bg-gray-800 min-h-11" value={m.ruler} onChange={e => update({ ruler: e.target.value as MusicalSettings['ruler'] })}>{['seconds', 'beats'].map(v => <option key={v} value={v}>{t(`music.${v}`)}</option>)}</select></label>
   <label>{t('music.grid')}<select aria-label={t('music.grid')} className="w-full bg-gray-800 min-h-11" value={m.grid} onChange={e => update({ grid: e.target.value as MusicalSettings['grid'] })}>{['off', 'bar', 'quarter', 'eighth', 'sixteenth', 'triplet'].map(v => <option key={v} value={v}>{t(`music.${v}`)}</option>)}</select></label>
  </div><label className="flex gap-2 min-h-11 items-center"><input type="checkbox" checked={m.metronome} onChange={e => update({ metronome: e.target.checked })}/>{t('music.metronome')}</label><p className="text-xs text-gray-400">{t('music.monitorOnly')}</p>
  <fieldset className="space-y-2 border border-gray-700 p-2 rounded"><legend>{t('music.loop')}</legend><div className="grid grid-cols-2 gap-2"><label>{t('music.startBar')}<NumberField width="w-full" label={t('music.startBar')} value={bar} min={1} step={1} onCommit={v => { if (!Number.isInteger(v) || v < 1)
        return false; setBar(v); return true; }}/></label><label>{t('music.bars')}<NumberField width="w-full" label={t('music.bars')} value={bars} min={1} step={1} onCommit={v => { if (!Number.isInteger(v) || v < 1 || v > 64)
        return false; setBars(v); return true; }}/></label></div><label className="flex gap-2 min-h-11 items-center"><input type="checkbox" checked={extend} onChange={e => setExtend(e.target.checked)}/>{t('music.extend')}</label><button className="timeline-tool" onClick={loop}>{t('music.createRange')}</button><button className="timeline-tool" disabled={!editRange} onClick={() => { const state = useProjectStore.getState(), range = state.project.editRange; if (range) {
        state.setLoopEnabled(true);
        state.playEditRange();
    } }}>{t('music.playLoop')}</button><p className="text-xs text-gray-400">{t('music.loopNote')}</p></fieldset>
  <button className="timeline-tool" disabled={!music} onClick={() => { const state = useProjectStore.getState(); useProjectStore.setState({ project: { ...state.project, music: undefined } }); }}>{t('music.reset')}</button>{error && <p role="alert" className="text-amber-300">{error}</p>}
 </div></Modal></>;
}
