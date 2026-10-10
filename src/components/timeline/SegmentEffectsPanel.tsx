import { EffectChainEditor } from './EffectChainEditor';
// ---------------------------------------------------------------------------
// CrispAudio — SegmentEffectsPanel
// Side panel for editing the selected segment: name, color, gain, fades,
// and per-segment effect chain.
// ---------------------------------------------------------------------------

import React from 'react';
import {
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import type {
  AudioSegment,
  FadeCurve,
} from '../../types/audio';
import { ParamSlider } from '../shared/ParamSlider';

// ── Segment colour swatches ───────────────────────────────────────────────────

const COLOR_SWATCHES = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b',
  '#ef4444', '#06b6d4', '#f97316', '#ec4899',
  '#84cc16', '#a78bfa', '#34d399', '#fbbf24',
];

const FADE_CURVES: FadeCurve[] = ['linear', 'exponential', 'scurve'];

// ── Sub-components ────────────────────────────────────────────────────────────

// ── Main panel ────────────────────────────────────────────────────────────────

export const SegmentEffectsPanel: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { t } = useTranslation();
  const store = useProjectStore();

  // Find the selected segment
  const selection = store.selection;
  if (!selection || selection.segmentIds.length === 0) return null;

  // Use the first selected segment for editing
  const segId = selection.segmentIds[0];
  let segment: AudioSegment | null = null;
  for (const track of store.project.tracks) {
    const found = track.segments.find((s) => s.id === segId);
    if (found) { segment = found; break; }
  }
  if (!segment) return null;

  const seg = segment;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleClose = () => onClose ? onClose() : store.setSelection(null);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    store.setSegmentName(seg.id, e.target.value);

  const handleGainChange = (val: number) => store.setSegmentGain(seg.id, val);

  const handleFadeIn = (val: number) =>
    store.setSegmentFade(seg.id, 'in', val);

  const handleFadeOut = (val: number) =>
    store.setSegmentFade(seg.id, 'out', val);

  const handleFadeInCurve = (curve: FadeCurve) =>
    store.setSegmentFade(seg.id, 'in', seg.fadeInDuration, curve);

  const handleFadeOutCurve = (curve: FadeCurve) =>
    store.setSegmentFade(seg.id, 'out', seg.fadeOutDuration, curve);

  const handleColorChange = (color: string) =>
    store.setSegmentColor(seg.id, color);

  return (
    <div className="flex flex-col h-full bg-gray-900 w-full flex-shrink-0 overflow-hidden">
      {/* A dialog provides its own heading and close control. */}
      {!onClose && <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 flex-shrink-0">
        <span className="text-sm font-semibold text-gray-200">{t('timeline.segment')}</span>
        <button
          type="button"
          onClick={handleClose}
          className="p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-700 transition-colors"
          aria-label={t('timeline.closePanel')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>}

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
        {/* Name */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">{t('timeline.name')}</label>
          <input
            type="text"
            aria-label={t('timeline.name')}
            value={seg.name}
            onChange={handleNameChange}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <label className="flex items-center justify-between gap-3 text-sm text-gray-300">{t('editing.startTime')}<input key={`${seg.id}-${seg.startTime}`} type="number" min={0} step={.001} defaultValue={seg.startTime} aria-label={t('editing.startTime')} className="bg-gray-800 rounded p-2 w-32" onBlur={e=>{const value=Number(e.currentTarget.value);if(Number.isFinite(value)&&value>=0)store.moveSegment(seg.id,value);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>
        <p className="text-xs text-gray-400">{t('editing.precisionHelp')}</p>
        {/* Color */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">{t('timeline.color')}</label>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => handleColorChange(color)}
                className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${
                  seg.color === color
                    ? 'border-white scale-110'
                    : 'border-transparent'
                }`}
                style={{ backgroundColor: color }}
                aria-label={t('timeline.colorSwatch', { color })}
              />
            ))}
          </div>
        </div>

        {/* Gain */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">{t('timeline.gain')}</label>
          <ParamSlider
            label={t('timeline.gain')}
            value={seg.gain}
            min={0}
            max={4}
            step={0.01}
            onChange={handleGainChange}
          />
        </div>

        {/* Fades */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-400">{t('timeline.fades')}</label>

          <div className="space-y-1">
            <ParamSlider
              label={t('timeline.fadeIn')}
              value={seg.fadeInDuration}
              min={0}
              max={seg.duration}
              step={0.01}
              unit="s"
              onChange={handleFadeIn}
            />
            <div className="flex items-center gap-1">
              {FADE_CURVES.map((curve) => (
                <button
                  key={curve}
                  type="button"
                  onClick={() => handleFadeInCurve(curve)}
                  className={`flex-1 text-[10px] py-0.5 rounded border transition-colors ${
                    seg.fadeInCurve === curve
                      ? 'border-indigo-500 bg-indigo-900/40 text-indigo-300'
                      : 'border-gray-700 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {curve === 'linear' ? t('timeline.curveLinear') : curve === 'exponential' ? t('timeline.curveExponential') : t('timeline.curveScurve')}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <ParamSlider
              label={t('timeline.fadeOut')}
              value={seg.fadeOutDuration}
              min={0}
              max={seg.duration}
              step={0.01}
              unit="s"
              onChange={handleFadeOut}
            />
            <div className="flex items-center gap-1">
              {FADE_CURVES.map((curve) => (
                <button
                  key={curve}
                  type="button"
                  onClick={() => handleFadeOutCurve(curve)}
                  className={`flex-1 text-[10px] py-0.5 rounded border transition-colors ${
                    seg.fadeOutCurve === curve
                      ? 'border-indigo-500 bg-indigo-900/40 text-indigo-300'
                      : 'border-gray-700 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {curve === 'linear' ? t('timeline.curveLinear') : curve === 'exponential' ? t('timeline.curveExponential') : t('timeline.curveScurve')}
                </button>
              ))}
            </div>
          </div>
        </div>

        <EffectChainEditor scope={`clip:${seg.id}`} effects={seg.effects} label={t('timeline.effects')} onChange={effects => {
          store.setIsPlaying(false); store.setSegmentEffects(seg.id, effects);
        }}/>

        {/* Segment info */}
        <div className="space-y-1 border-t border-gray-800 pt-3">
          <p className="text-xs text-gray-600">
            {t('timeline.segmentStart')}: {seg.startTime.toFixed(3)}s
          </p>
          <p className="text-xs text-gray-600">
            {t('timeline.segmentDuration')}: {seg.duration.toFixed(3)}s
          </p>
          <p className="text-xs text-gray-600">
            {t('timeline.segmentOffset')}: {seg.sourceOffset.toFixed(3)}s
          </p>
        </div>
      </div>
    </div>
  );
};

export default SegmentEffectsPanel;
