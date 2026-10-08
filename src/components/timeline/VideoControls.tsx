import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';

/** A source-clock range, not a destructive move or trim of the audio clips. */
export function VideoControls() {
  const { t } = useTranslation();
  const video = useProjectStore((s) => s.project.video);
  const [invalid, setInvalid] = useState(false);
  const setRange = useProjectStore((s) => s.setVideoRange);
  if (!video) return null;
  const start = video.inPoint ?? 0, end = video.outPoint ?? video.duration;
  return <details className="mt-2 text-sm text-gray-300">
    <summary className="min-h-11 cursor-pointer flex items-center">{t('video.range')} · {start.toFixed(2)}–{end.toFixed(2)} s</summary>
    <div className="flex flex-wrap gap-2 items-center">
      {['in', 'out'].map((point, i) => <label key={point} className="flex items-center gap-2">{t(`video.${point}`)}
        <RangeField value={i ? end : start} label={t(`video.${point}`)} max={video.duration} onCommit={(value) => {
          const a = i ? start : value, b = i ? value : end;
          const valid = Number.isFinite(value) && a >= 0 && b <= video.duration && b > a;
          setInvalid(!valid); if (valid) setRange(a, b);
        }} />
      </label>)}
      <button className="timeline-tool" onClick={() => setRange(useProjectStore.getState().playheadPosition, end)}>{t('video.setIn')}</button>
      <button className="timeline-tool" onClick={() => setRange(start, useProjectStore.getState().playheadPosition)}>{t('video.setOut')}</button>
      <button className="timeline-tool" onClick={() => { useProjectStore.getState().setIsPlaying(false); useProjectStore.getState().setPlayheadPosition(start); }}>{t('video.jumpIn')}</button>
      <button className="timeline-tool" onClick={() => setRange(0, video.duration)}>{t('video.reset')}</button>
    </div>
    {invalid && <p role="alert" className="text-xs text-amber-300 mt-2">{t('video.invalidRange')}</p>}
    <p className="text-xs text-gray-400 mt-2">{t('video.rangeHelp')}</p>
  </details>;
}

function RangeField({ value, max, label, onCommit }: { value: number; max: number; label: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  return <input className="bg-gray-800 rounded px-2 min-h-11 w-28" aria-label={label} type="number" min={0} max={max} step={0.001}
    value={focused ? draft : value} onFocus={() => { setFocused(true); setDraft(String(value)); }}
    onChange={(e) => setDraft(e.target.value)} onBlur={() => { setFocused(false); onCommit(draft.trim() ? Number(draft) : NaN); }}
    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />;
}
