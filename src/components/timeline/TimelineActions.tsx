import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { projectHistoryGesture, useProjectStore } from '../../stores/projectStore';
import { Modal } from '../common/Modal';
import { SegmentEffectsPanel } from './SegmentEffectsPanel';

/** Actions are visible and keyboard/touch accessible; no right-click required. */
export function TimelineActions({ touchArrange, onTouchArrange }: { touchArrange: boolean; onTouchArrange: () => void }) {
  const { t } = useTranslation();
  const [mixer, setMixer] = useState(false);
  const [inspector, setInspector] = useState(false);
  const tracks = useProjectStore((s) => s.project.tracks);
  const selection = useProjectStore((s) => s.selection);
  const position = useProjectStore((s) => s.playheadPosition);
  const selected = tracks.flatMap((track) => track.segments).filter((clip) => selection?.segmentIds.includes(clip.id));
  const splittable = selected.filter((clip) => position > clip.startTime && position < clip.startTime + clip.duration);
  if (!tracks.length) return null;
  const button = 'min-h-11 px-3 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-40';
  return <>
    <div className="timeline-clip-actions flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-800 shrink-0" aria-label={t('timeline.clipActions')}>
      <button className={`${button} touch-arrange-toggle`} aria-pressed={touchArrange} onClick={onTouchArrange}>{t(touchArrange ? 'timeline.touchArrangeOn' : 'timeline.touchArrangeOff')}</button>
      <button className={button} onClick={() => setMixer(true)} disabled={!tracks.length}>{t('timeline.mixer')}</button>
      <span className="clip-selection-note hidden md:block text-xs text-gray-400 max-w-40 truncate">{selected.length ? t('timeline.selectedCount', { count: selected.length }) : t('timeline.tapClip')}</span>
      <button className={`${button} clip-split-selected`} disabled={!splittable.length} onClick={() => {
        const state = useProjectStore.getState();
        splittable.forEach((clip) => state.splitSegment(clip.id, position));
        state.setSelection(null);
      }}>{t('timeline.splitAtPlayhead')}</button>
      <button className={button} disabled={!tracks.some((track) => track.segments.some((clip) => position > clip.startTime && position < clip.startTime + clip.duration))} onClick={() => {
        const state = useProjectStore.getState();
        projectHistoryGesture.begin();
        try { tracks.forEach((track) => track.segments.forEach((clip) => state.splitSegment(clip.id, position))); }
        finally { projectHistoryGesture.end(); }
        state.setSelection(null);
      }}>{t('timeline.splitAll')}</button>
      <button className={button} disabled={!selected.length} onClick={() => setInspector(true)}>{t('timeline.clipSettings')}</button>
      <button className={button} disabled={!selected.length} onClick={() => useProjectStore.getState().deleteSelected()}>{t('timeline.delete')}</button>
    </div>
    <Modal isOpen={inspector && selected.length > 0} onClose={() => setInspector(false)} title={t('timeline.clipSettings')}>
      <SegmentEffectsPanel onClose={() => setInspector(false)} />
    </Modal>
    <Modal isOpen={mixer} onClose={() => setMixer(false)} title={t('timeline.mixer')} widthClass="max-w-2xl">
      <button className="timeline-tool mb-3" onClick={()=>{const state=useProjectStore.getState();tracks.forEach(track=>state.updateTrack(track.id,{solo:false}));}}>{t('editor.clearSolos')}</button>
      <p className="text-sm text-gray-400 mb-4">{t('timeline.mixerHelp')}</p>
      <div className="space-y-4">
        {mixer && tracks.map((track, i) => <section key={track.id} className="p-3 rounded-xl bg-gray-950 border border-gray-700 space-y-2">
          <input className="w-full min-h-11 bg-gray-900 rounded px-3 text-gray-100" aria-label={`${t('timeline.trackName')} ${i + 1}`} value={track.name}
            onChange={(e) => useProjectStore.getState().updateTrack(track.id, { name: e.target.value })} />
          <div className="flex flex-wrap gap-2">
            <button className={button} aria-pressed={track.muted} onClick={() => useProjectStore.getState().updateTrack(track.id, { muted: !track.muted })}>{t('timeline.mute')}</button>
            <button className={button} aria-pressed={track.solo} onClick={() => useProjectStore.getState().updateTrack(track.id, { solo: !track.solo })}>{t('timeline.solo')}</button>
            <button className={button} onClick={() => {
              const state = useProjectStore.getState();
              tracks.forEach((other) => state.updateTrack(other.id, { muted: other.id !== track.id, solo: false }));
            }}>{t('timeline.listenOnly')}</button>
            <button className={button} disabled={i === 0} aria-label={`${t('timeline.moveTrackUp')} ${track.name}`} onClick={() => useProjectStore.getState().reorderTrack(track.id, i - 1)}>↑</button>
            <button className={button} disabled={i === tracks.length - 1} aria-label={`${t('timeline.moveTrackDown')} ${track.name}`} onClick={() => useProjectStore.getState().reorderTrack(track.id, i + 1)}>↓</button>
          </div>
          <label className="flex items-center gap-3 text-sm text-gray-300">{t('timeline.trackVolume')}
            <input type="range" min={-60} max={40} step={0.5} className="slider-styled min-w-0 flex-1" value={track.volume > 0 ? Math.max(-60, 20 * Math.log10(track.volume)) : -60}
              onChange={(e) => useProjectStore.getState().updateTrack(track.id, { volume: +e.target.value <= -60 ? 0 : 10 ** (+e.target.value / 20) })} />
            <span className="w-16 text-right tabular-nums">{track.volume > 0 ? `${(20 * Math.log10(track.volume)).toFixed(1)} dB` : '−∞'}</span>
          </label>
        </section>)}
      </div>
    </Modal>
  </>;
}
