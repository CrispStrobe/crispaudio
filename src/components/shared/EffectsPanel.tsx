import React, { useCallback } from 'react';
import { Power } from 'lucide-react';
import ParamSlider from './ParamSlider';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EffectParam {
  key: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export interface EffectConfig {
  id: string;
  label: string;
  enabled: boolean;
  params: EffectParam[];
}

// ─── Default effect definitions ───────────────────────────────────────────────

export const DEFAULT_EFFECTS: EffectConfig[] = [
  {
    id: 'distortion',
    label: 'Distortion',
    enabled: false,
    params: [
      { key: 'drive', label: 'Drive', value: 0.3, min: 0, max: 1, step: 0.01 },
      { key: 'tone', label: 'Tone', value: 0.5, min: 0, max: 1, step: 0.01 },
      { key: 'mix', label: 'Mix', value: 0.5, min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    id: 'chorus',
    label: 'Chorus',
    enabled: false,
    params: [
      { key: 'rate', label: 'Rate', value: 0.5, min: 0, max: 1, step: 0.01 },
      { key: 'depth', label: 'Depth', value: 0.3, min: 0, max: 1, step: 0.01 },
      { key: 'mix', label: 'Mix', value: 0.4, min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    id: 'delay',
    label: 'Delay',
    enabled: false,
    params: [
      { key: 'time', label: 'Time', value: 0.25, min: 0, max: 1, step: 0.001, unit: 's' },
      { key: 'feedback', label: 'Feedback', value: 0.4, min: 0, max: 0.95, step: 0.01 },
      { key: 'mix', label: 'Mix', value: 0.3, min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    id: 'reverb',
    label: 'Reverb',
    enabled: false,
    params: [
      { key: 'size', label: 'Size', value: 0.5, min: 0, max: 1, step: 0.01 },
      { key: 'decay', label: 'Decay', value: 0.6, min: 0, max: 1, step: 0.01 },
      { key: 'mix', label: 'Mix', value: 0.3, min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    id: 'ringmod',
    label: 'Ring Mod',
    enabled: false,
    params: [
      { key: 'freq', label: 'Freq', value: 0.2, min: 0, max: 1, step: 0.001 },
      { key: 'depth', label: 'Depth', value: 0.5, min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    id: 'bitcrush',
    label: 'Bit Crush',
    enabled: false,
    params: [
      { key: 'bits', label: 'Bits', value: 0.2, min: 0, max: 1, step: 0.01 },
      { key: 'reduction', label: 'Reduction', value: 0, min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    id: 'filter',
    label: 'Filter',
    enabled: false,
    params: [
      { key: 'lpf', label: 'LPF', value: 1, min: 0, max: 1, step: 0.001 },
      { key: 'hpf', label: 'HPF', value: 0, min: 0, max: 1, step: 0.001 },
      { key: 'resonance', label: 'Resonance', value: 0, min: 0, max: 1, step: 0.01 },
    ],
  },
];

// ─── Single effect row ─────────────────────────────────────────────────────────

interface EffectRowProps {
  effect: EffectConfig;
  onToggle: (id: string) => void;
  onParamChange: (effectId: string, paramKey: string, value: number) => void;
}

const EffectRow: React.FC<EffectRowProps> = ({ effect, onToggle, onParamChange }) => {
  return (
    <div
      className={`
        border rounded-md overflow-hidden transition-colors
        ${effect.enabled ? 'border-indigo-700/60' : 'border-gray-800'}
      `}
    >
      {/* Header */}
      <div
        className={`
          flex items-center gap-2 px-2.5 py-1.5 cursor-pointer select-none
          ${effect.enabled ? 'bg-indigo-900/25' : 'bg-gray-800/60'}
        `}
        onClick={() => onToggle(effect.id)}
      >
        {/* Power toggle */}
        <button
          type="button"
          aria-label={effect.enabled ? `Disable ${effect.label}` : `Enable ${effect.label}`}
          className={`
            flex-shrink-0 w-5 h-5 flex items-center justify-center rounded
            transition-colors
            ${effect.enabled
              ? 'text-indigo-300 hover:text-indigo-200'
              : 'text-gray-600 hover:text-gray-400'}
          `}
          onClick={e => { e.stopPropagation(); onToggle(effect.id); }}
        >
          <Power className="w-3.5 h-3.5" />
        </button>

        <span
          className={`text-xs font-semibold leading-none transition-colors ${
            effect.enabled ? 'text-gray-200' : 'text-gray-500'
          }`}
        >
          {effect.label}
        </span>

        <div className="ml-auto flex items-center gap-1">
          {effect.enabled && (
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
          )}
        </div>
      </div>

      {/* Params — only shown when enabled */}
      {effect.enabled && (
        <div className="flex flex-col gap-2 px-2.5 py-2 bg-gray-900/60">
          {effect.params.map(param => (
            <ParamSlider
              key={param.key}
              label={param.label}
              value={param.value}
              min={param.min}
              max={param.max}
              step={param.step}
              unit={param.unit}
              onChange={v => onParamChange(effect.id, param.key, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Effects panel ─────────────────────────────────────────────────────────────

interface EffectsPanelProps {
  effects: EffectConfig[];
  onChange: (effects: EffectConfig[]) => void;
}

export const EffectsPanel: React.FC<EffectsPanelProps> = ({ effects, onChange }) => {
  const handleToggle = useCallback(
    (id: string) => {
      onChange(
        effects.map(e => (e.id === id ? { ...e, enabled: !e.enabled } : e))
      );
    },
    [effects, onChange]
  );

  const handleParamChange = useCallback(
    (effectId: string, paramKey: string, value: number) => {
      onChange(
        effects.map(e =>
          e.id === effectId
            ? {
                ...e,
                params: e.params.map(p =>
                  p.key === paramKey ? { ...p, value } : p
                ),
              }
            : e
        )
      );
    },
    [effects, onChange]
  );

  const enabledCount = effects.filter(e => e.enabled).length;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Header */}
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Effects Chain
        </span>
        {enabledCount > 0 && (
          <span className="text-[11px] text-indigo-400 font-mono">
            {enabledCount} active
          </span>
        )}
      </div>

      {/* Effect rows */}
      {effects.map(effect => (
        <EffectRow
          key={effect.id}
          effect={effect}
          onToggle={handleToggle}
          onParamChange={handleParamChange}
        />
      ))}
    </div>
  );
};

export default EffectsPanel;
