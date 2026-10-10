import {EqualizerGraph} from './EqualizerGraph';
import React, { useState } from 'react';
import { create } from 'zustand';
import { ChevronDown, ChevronRight, Power, Trash2, Copy, ClipboardPaste, ArrowUp, ArrowDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EffectConfig, EffectType } from '../../types/audio';
import { ParamSlider } from '../shared/ParamSlider';
import { ToolButton } from '../common/ToolButton';

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
  peaking: 'Bell EQ', lowshelf: 'Low Shelf', highshelf: 'High Shelf',
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
  'peaking', 'lowshelf', 'highshelf',
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
    peaking: {freq:1000,q:1,gain:0}, lowshelf:{freq:200,gain:0}, highshelf:{freq:4000,gain:0},
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
  peaking: [{key:'freq',label:'Freq',min:20,max:22000,step:1,unit:'Hz'},{key:'gain',label:'Gain',min:-24,max:24,step:.1,unit:'dB'},{key:'q',label:'Q',min:.1,max:20,step:.1}],
  lowshelf: [{key:'freq',label:'Freq',min:20,max:22000,step:1,unit:'Hz'},{key:'gain',label:'Gain',min:-24,max:24,step:.1,unit:'dB'}],
  highshelf: [{key:'freq',label:'Freq',min:20,max:22000,step:1,unit:'Hz'},{key:'gain',label:'Gain',min:-24,max:24,step:.1,unit:'dB'}],
  compressor: [
    { key: 'threshold', label: 'Threshold', min: -100, max: 0, step: 1, unit: 'dB' },
    { key: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5 },
    { key: 'attack', label: 'Attack', min: 0, max: 0.5, step: 0.001, unit: 's' },
    { key: 'release', label: 'Release', min: 0, max: 2, step: 0.01, unit: 's' },
    { key: 'knee', label: 'Knee', min: 0, max: 40, step: 1, unit: 'dB' },
  ],
};

interface EffectRowProps {
  effect: EffectConfig;
  index: number;
  onUpdate: (index: number, patch: Partial<EffectConfig>) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: number) => void;
  count: number;
}

const EffectRow: React.FC<EffectRowProps> = ({ effect, index, onUpdate, onRemove, onMove, count }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const specs = EFFECT_PARAMS[effect.type] ?? [];

  return (
    <div className="border border-gray-700 rounded overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 bg-gray-800">
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="min-w-11 min-h-11 grid place-items-center text-gray-400 hover:text-gray-200 transition-colors"
          aria-label={expanded ? t('timeline.collapse') : t('timeline.expand')} aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        <span className="text-xs font-medium text-gray-200 flex-1 min-w-16 break-words">
          {t(`timeline.effectNames.${effect.type}`, EFFECT_LABELS[effect.type])}
        </span>

        <button
          type="button"
          onClick={() => onUpdate(index, { enabled: !effect.enabled })}
          className={`min-w-11 min-h-11 grid place-items-center transition-colors ${
            effect.enabled
              ? 'text-green-400 hover:text-green-300'
              : 'text-gray-600 hover:text-gray-400'
          }`}
          aria-label={effect.enabled ? t('timeline.disableEffect') : t('timeline.enableEffect')} aria-pressed={effect.enabled}
          title={effect.enabled ? t('timeline.enabled') : t('timeline.disabled')}
        >
          <Power className="w-3.5 h-3.5" />
        </button>

        <ToolButton icon={ArrowUp} label={t('rack.moveUp')} disabled={index === 0} onClick={() => onMove(index, -1)}/>
        <ToolButton icon={ArrowDown} label={t('rack.moveDown')} disabled={index === count - 1} onClick={() => onMove(index, 1)}/>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="min-w-11 min-h-11 grid place-items-center text-gray-600 hover:text-red-400 transition-colors"
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

const useEffectClipboard = create<{effects: EffectConfig[] | null}>(() => ({effects: null}));
const clone = (effects: EffectConfig[]) => effects.map(effect => ({...effect, params: {...effect.params}}));

/** Same ordered processing rack at clip, track and master scope. */
export function EffectChainEditor({effects, onChange, label}: {
  effects: EffectConfig[]; onChange: (effects: EffectConfig[]) => void; label: string;
}) {
  const {t} = useTranslation();
  const clipboard = useEffectClipboard(s => s.effects);
  const update = (index: number, patch: Partial<EffectConfig>) => onChange(effects.map((e, i) => i === index ? {...e, ...patch} : e));
  const move = (index: number, direction: number) => {
    const next = clone(effects), target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]]; onChange(next);
  };
  return <section aria-label={label} className="space-y-2 effect-rack">
    <div className="flex flex-wrap gap-2 items-center">
      <select className="min-h-11 bg-gray-800 rounded p-2 text-sm min-w-0 max-w-full" aria-label={t('timeline.addEffect')} value=""
        onChange={e => {if(e.target.value) onChange([...effects, defaultEffect(e.target.value as EffectType)]);}}>
        <option value="">{t('timeline.addEffect')}</option>
        {ALL_EFFECT_TYPES.map(type => <option key={type} value={type}>{t(`timeline.effectNames.${type}`, EFFECT_LABELS[type])}</option>)}
      </select>
      <ToolButton icon={Copy} label={t('rack.copy')} disabled={!effects.length} onClick={() => useEffectClipboard.setState({effects: clone(effects)})}/>
      <ToolButton icon={ClipboardPaste} label={t('rack.paste')} disabled={!clipboard} onClick={() => clipboard && onChange(clone(clipboard))}/>
      <ToolButton icon={Power} label={t(effects.some(e => e.enabled) ? 'rack.bypass' : 'rack.enable')} disabled={!effects.length}
        onClick={() => {const enabled = !effects.some(e => e.enabled); onChange(effects.map(e => ({...e, enabled})));}}/>
    </div>
    <EqualizerGraph effects={effects} onChange={onChange}/>
    <p className="text-xs text-gray-400">{t('rack.orderHelp')}</p>
    {!effects.length && <p className="text-xs text-gray-500 py-2">{t('timeline.noEffects')}</p>}
    {effects.map((effect, i) => <EffectRow key={`${i}-${effect.type}`} effect={effect} index={i} count={effects.length} onUpdate={update}
      onRemove={index => onChange(effects.filter((_, j) => j !== index))} onMove={move}/>)}
  </section>;
}
