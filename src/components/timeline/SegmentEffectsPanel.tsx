// ---------------------------------------------------------------------------
// CrispAudio — SegmentEffectsPanel
// Side panel for editing the selected segment: name, color, gain, fades,
// and per-segment effect chain.
// ---------------------------------------------------------------------------

import React, { useState } from 'react';
import {
  X,
  ChevronDown,
  ChevronRight,
  Power,
  Trash2,
  Plus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import type {
  AudioSegment,
  EffectConfig,
  EffectType,
  FadeCurve,
} from '../../types/audio';
import { ParamSlider } from '../shared/ParamSlider';

// ── Effect display metadata ───────────────────────────────────────────────────

const EFFECT_LABELS: Record<EffectType, string> = {
  reverb: 'Reverb',
  delay: 'Delay',
  chorus: 'Chorus',
  ringmod: 'Ring Mod',
  distortion: 'Distortion',
  bitcrush: 'Bit Crush',
  lowpass: 'Low Pass',
  highpass: 'High Pass',
  compressor: 'Compressor',
};

const ALL_EFFECT_TYPES: EffectType[] = [
  'reverb',
  'delay',
  'chorus',
  'ringmod',
  'distortion',
  'bitcrush',
  'lowpass',
  'highpass',
  'compressor',
];

function defaultEffect(type: EffectType): EffectConfig {
  const defaults: Record<EffectType, Record<string, number>> = {
    reverb: { size: 0.5, decay: 1.5, mix: 0.3 },
    delay: { time: 0.3, feedback: 0.4, mix: 0.3 },
    chorus: { rate: 1.5, depth: 0.5, mix: 0.3 },
    ringmod: { freq: 200, mix: 0.5 },
    distortion: { drive: 0.5, mix: 0.5 },
    bitcrush: { bits: 8, mix: 0.5 },
    lowpass: { freq: 8000, q: 1 },
    highpass: { freq: 200, q: 1 },
    compressor: { threshold: -24, ratio: 4, attack: 0.003, release: 0.25, knee: 5 },
  };
  return { type, enabled: true, params: { ...defaults[type] } };
}

// ── Effect param specs ────────────────────────────────────────────────────────

interface ParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

const EFFECT_PARAMS: Record<EffectType, ParamSpec[]> = {
  reverb: [
    { key: 'size', label: 'Size', min: 0, max: 1, step: 0.01 },
    { key: 'decay', label: 'Decay', min: 0.1, max: 10, step: 0.1, unit: 's' },
    { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01 },
  ],
  delay: [
    { key: 'time', label: 'Time', min: 0, max: 2, step: 0.01, unit: 's' },
    { key: 'feedback', label: 'Feedback', min: 0, max: 0.95, step: 0.01 },
    { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01 },
  ],
  chorus: [
    { key: 'rate', label: 'Rate', min: 0.1, max: 8, step: 0.1, unit: 'Hz' },
    { key: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01 },
    { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01 },
  ],
  ringmod: [
    { key: 'freq', label: 'Freq', min: 1, max: 2000, step: 1, unit: 'Hz' },
    { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01 },
  ],
  distortion: [
    { key: 'drive', label: 'Drive', min: 0, max: 1, step: 0.01 },
    { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01 },
  ],
  bitcrush: [
    { key: 'bits', label: 'Bits', min: 1, max: 16, step: 1 },
    { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01 },
  ],
  lowpass: [
    { key: 'freq', label: 'Cutoff', min: 20, max: 22000, step: 10, unit: 'Hz' },
    { key: 'q', label: 'Q', min: 0.1, max: 20, step: 0.1 },
  ],
  highpass: [
    { key: 'freq', label: 'Cutoff', min: 10, max: 20000, step: 10, unit: 'Hz' },
    { key: 'q', label: 'Q', min: 0.1, max: 20, step: 0.1 },
  ],
  compressor: [
    { key: 'threshold', label: 'Threshold', min: -100, max: 0, step: 1, unit: 'dB' },
    { key: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5 },
    { key: 'attack', label: 'Attack', min: 0, max: 0.5, step: 0.001, unit: 's' },
    { key: 'release', label: 'Release', min: 0, max: 2, step: 0.01, unit: 's' },
    { key: 'knee', label: 'Knee', min: 0, max: 40, step: 1, unit: 'dB' },
  ],
};

// ── Segment colour swatches ───────────────────────────────────────────────────

const COLOR_SWATCHES = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b',
  '#ef4444', '#06b6d4', '#f97316', '#ec4899',
  '#84cc16', '#a78bfa', '#34d399', '#fbbf24',
];

const FADE_CURVES: FadeCurve[] = ['linear', 'exponential', 'scurve'];

// ── Sub-components ────────────────────────────────────────────────────────────

interface EffectRowProps {
  effect: EffectConfig;
  index: number;
  onUpdate: (index: number, patch: Partial<EffectConfig>) => void;
  onRemove: (index: number) => void;
}

const EffectRow: React.FC<EffectRowProps> = ({ effect, index, onUpdate, onRemove }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const specs = EFFECT_PARAMS[effect.type] ?? [];

  return (
    <div className="border border-gray-700 rounded overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-800">
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="text-gray-400 hover:text-gray-200 transition-colors"
          aria-label={expanded ? t('timeline.collapse') : t('timeline.expand')}
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        <span className="text-xs font-medium text-gray-200 flex-1">
          {t(`timeline.effectNames.${effect.type}`, EFFECT_LABELS[effect.type])}
        </span>

        <button
          type="button"
          onClick={() => onUpdate(index, { enabled: !effect.enabled })}
          className={`transition-colors ${
            effect.enabled
              ? 'text-green-400 hover:text-green-300'
              : 'text-gray-600 hover:text-gray-400'
          }`}
          aria-label={effect.enabled ? t('timeline.disableEffect') : t('timeline.enableEffect')}
          title={effect.enabled ? t('timeline.enabled') : t('timeline.disabled')}
        >
          <Power className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => onRemove(index)}
          className="text-gray-600 hover:text-red-400 transition-colors"
          aria-label={t('timeline.removeEffect')}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Params */}
      {expanded && (
        <div className={`px-3 py-2 space-y-2 ${!effect.enabled ? 'opacity-50' : ''}`}>
          {specs.map((spec) => (
            <ParamSlider
              key={spec.key}
              label={t(`timeline.effectParams.${spec.label.toLowerCase()}`, spec.label)}
              value={effect.params[spec.key] ?? 0}
              min={spec.min}
              max={spec.max}
              step={spec.step}
              unit={spec.unit}
              disabled={!effect.enabled}
              onChange={(val) =>
                onUpdate(index, {
                  params: { ...effect.params, [spec.key]: val },
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main panel ────────────────────────────────────────────────────────────────

export const SegmentEffectsPanel: React.FC = () => {
  const { t } = useTranslation();
  const store = useProjectStore();
  const [addMenuOpen, setAddMenuOpen] = useState(false);

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

  const handleClose = () => store.setSelection(null);

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

  const handleEffectUpdate = (index: number, patch: Partial<EffectConfig>) => {
    const effects = seg.effects.map((e, i) =>
      i === index ? { ...e, ...patch } : e,
    );
    store.setSegmentEffects(seg.id, effects);
  };

  const handleEffectRemove = (index: number) => {
    const effects = seg.effects.filter((_, i) => i !== index);
    store.setSegmentEffects(seg.id, effects);
  };

  const handleAddEffect = (type: EffectType) => {
    const effects = [...seg.effects, defaultEffect(type)];
    store.setSegmentEffects(seg.id, effects);
    setAddMenuOpen(false);
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 border-l border-gray-700 w-64 flex-shrink-0 overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 flex-shrink-0">
        <span className="text-sm font-semibold text-gray-200">{t('timeline.segment')}</span>
        <button
          type="button"
          onClick={handleClose}
          className="p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-700 transition-colors"
          aria-label={t('timeline.closePanel')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
        {/* Name */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">{t('timeline.name')}</label>
          <input
            type="text"
            value={seg.name}
            onChange={handleNameChange}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

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

        {/* Effect chain */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-400">{t('timeline.effects')}</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setAddMenuOpen((x) => !x)}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('timeline.add')}
              </button>
              {addMenuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded shadow-xl z-20 py-1 min-w-[140px]">
                  {ALL_EFFECT_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      className="w-full text-left px-3 py-1 text-xs text-gray-200 hover:bg-gray-700"
                      onClick={() => handleAddEffect(type)}
                    >
                      {t(`timeline.effectNames.${type}`, EFFECT_LABELS[type])}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {seg.effects.length === 0 && (
            <p className="text-xs text-gray-600 text-center py-2">{t('timeline.noEffects')}</p>
          )}

          <div className="space-y-1.5">
            {seg.effects.map((effect, i) => (
              <EffectRow
                key={i}
                effect={effect}
                index={i}
                onUpdate={handleEffectUpdate}
                onRemove={handleEffectRemove}
              />
            ))}
          </div>
        </div>

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
