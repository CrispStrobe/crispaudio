import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { trackEnvelope } from '../../lib/waveformView';
import { Modal } from '../common/Modal';

export function AlignmentView({ close }: { close: () => void }) {
  const { t } = useTranslation();
  const tracks = useProjectStore((s) => s.project.tracks);
  const sources = useProjectStore((s) => s.sources);
  const duration = useProjectStore((s) => s.project.video?.duration ?? s.project.duration);
  const [center, setCenter] = useState(useProjectStore.getState().playheadPosition);
  const [span, setSpan] = useState(2);
  const [reference, setReference] = useState(tracks.at(-1)?.id ?? '');
  const [target, setTarget] = useState(tracks[0]?.id ?? '');
  const start = Math.max(0, Math.min(center - span / 2, Math.max(0, duration - span)));
  const end = Math.min(duration, start + span);
  const envelopes = useMemo(() => [reference, target].map((id) => {
    const track = tracks.find((tr) => tr.id === id);
    return track ? trackEnvelope(track, sources, start, end, 900) : new Float32Array(900);
  }), [tracks, sources, reference, target, start, end]);
  const colors = ['#38bdf8', '#fbbf24'];
  const seek = (time: number) => { const state = useProjectStore.getState(); state.setPlayheadPosition(time); state.setScrollOffset(Math.max(0, time - span / 2)); };
  return <Modal isOpen onClose={close} title={t('alignment.title')} widthClass="max-w-5xl">
    <p className="text-sm text-gray-300 mb-4">{t('alignment.help')}</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
      {[reference, target].map((value, i) => <label key={i} className="text-sm flex gap-2 items-center" style={{ color: colors[i] }}>
        {t(i === 0 ? 'alignment.reference' : 'alignment.compare')}
        <select className="min-h-11 bg-gray-800 text-gray-100 rounded px-2 min-w-0 flex-1" value={value}
          onChange={(e) => i === 0 ? setReference(e.target.value) : setTarget(e.target.value)}>
          {tracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
        </select>
      </label>)}
    </div>
    <div className="flex flex-wrap gap-2 mb-3">
      <button className="timeline-tool" onClick={() => { setCenter(useProjectStore.getState().playheadPosition); }}>{t('alignment.atPlayhead')}</button>
      {[0, duration / 2, duration].map((time, i) => <button key={i} className="timeline-tool" onClick={() => { setCenter(time); seek(time); }}>{t(['alignment.start', 'alignment.middle', 'alignment.end'][i])}</button>)}
      <label className="text-sm text-gray-300 flex items-center gap-2">{t('alignment.window')}
        <select className="min-h-11 bg-gray-800 rounded px-2" value={span} onChange={(e) => setSpan(+e.target.value)}>
          {[0.1, 0.2, 0.5, 1, 2, 5, 10].map((seconds) => <option key={seconds} value={seconds}>{seconds} s</option>)}
        </select>
      </label>
    </div>
    <label className="text-sm text-gray-300 flex flex-wrap gap-3 items-center mb-3">{t('alignment.center')}
      <input className="min-h-11 w-32 bg-gray-800 px-2 rounded" type="number" min={0} max={duration} step={0.001} value={center}
        onChange={(e) => { const time = e.target.valueAsNumber; if (Number.isFinite(time)) { setCenter(Math.max(0, Math.min(duration, time))); seek(time); } }} />
      <input className="slider-styled flex-1 min-w-32" type="range" min={0} max={duration || 0.01} step={0.001} value={Math.min(center, duration)}
        aria-label={t('alignment.center')} onChange={(e) => { setCenter(+e.target.value); seek(+e.target.value); }} />
    </label>
    <svg viewBox="0 0 900 250" className="w-full bg-gray-950 rounded-xl border border-gray-700" role="img" aria-label={t('alignment.chart')}
      onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); const time = start + (e.clientX - rect.left) / rect.width * (end - start); setCenter(time); seek(time); }}>
      {Array.from({ length: 11 }, (_, i) => <g key={i}>
        <line x1={i * 90} x2={i * 90} y1={0} y2={225} stroke="#334155" />
        <text x={Math.min(855, i * 90 + 3)} y={243} fill="#94a3b8" fontSize={12}>{(start + i / 10 * (end - start)).toFixed(3)}s</text>
      </g>)}
      {envelopes.map((points, i) => <polyline key={i} fill="none" stroke={colors[i]} strokeWidth={1.4} opacity={0.85}
        points={Array.from(points, (value, x) => `${x},${220 - value * 200}`).join(' ')} />)}
      <line x1={(center - start) / Math.max(end - start, 0.001) * 900} x2={(center - start) / Math.max(end - start, 0.001) * 900} y1={0} y2={225} stroke="#f87171" />
    </svg>
    <p className="text-xs text-gray-400 mt-3">{t('alignment.note')}</p>
  </Modal>;
}
