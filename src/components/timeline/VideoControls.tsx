import { timelineDuration } from '../../lib/timelineView';
import { ToolButton } from '../common/ToolButton';
import { Brackets } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';

/** An edited-timeline range, not a destructive move or trim of the audio clips. */
export function VideoControls() {
  const { t } = useTranslation();
  const video = useProjectStore((s) => s.project.video);
  const total=useProjectStore(s=>timelineDuration(s.project));
  const editRange=useProjectStore(s=>s.project.editRange);
  const [open,setOpen]=useState(false);
  const [invalid, setInvalid] = useState(false);
  const setRange = useProjectStore((s) => s.setVideoRange);
  if (!video) return null;
  const start = video.inPoint ?? 0, end = video.outPoint ?? total;
  return <><ToolButton icon={Brackets} label={t('video.range')} onClick={()=>setOpen(true)}/>
    <Modal isOpen={open} onClose={()=>setOpen(false)} title={t('video.range')}>
    <p className="text-sm text-gray-300 mb-3">{start.toFixed(3)}–{end.toFixed(3)} s</p>
    <div className="flex flex-wrap gap-2 items-center">
      {['in', 'out'].map((point, i) => <label key={point} className="flex items-center gap-2">{t(`video.${point}`)}
        <RangeField value={i ? end : start} label={t(`video.${point}`)} max={total} onCommit={(value) => {
          const a = i ? start : value, b = i ? value : end;
          const valid = Number.isFinite(value) && a >= 0 && b <= total && b > a;
          setInvalid(!valid); if (valid) setRange(a, b);
        }} />
      </label>)}
      <button className="timeline-tool" onClick={() => setRange(useProjectStore.getState().playheadPosition, end)}>{t('video.setIn')}</button>
      <button className="timeline-tool" onClick={() => setRange(start, useProjectStore.getState().playheadPosition)}>{t('video.setOut')}</button>
      <button className="timeline-tool" onClick={() => { useProjectStore.getState().setIsPlaying(false); useProjectStore.getState().setPlayheadPosition(start); }}>{t('video.jumpIn')}</button>
      <button className="timeline-tool" onClick={() => setRange(0, total)}>{t('video.reset')}</button>
      {editRange&&<button className="timeline-tool" onClick={()=>setRange(editRange.start,editRange.end)}>{t('ranges.useForVideo')}</button>}
    </div>
    {invalid && <p role="alert" className="text-xs text-amber-300 mt-2">{t('video.invalidRange')}</p>}
    <p className="text-xs text-gray-400 mt-2">{t('video.rangeHelp')}</p>
  </Modal></>;
}

function RangeField({ value, max, label, onCommit }: { value: number; max: number; label: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  return <input className="bg-gray-800 rounded px-2 min-h-11 w-28" aria-label={label} type="number" min={0} max={max} step={0.001}
    value={focused ? draft : value} onFocus={() => { setFocused(true); setDraft(String(value)); }}
    onChange={(e) => setDraft(e.target.value)} onBlur={() => { setFocused(false); onCommit(draft.trim() ? Number(draft) : NaN); }}
    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />;
}
