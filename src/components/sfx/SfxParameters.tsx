import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { Lock, Unlock, Settings, Activity, Zap, Volume2 } from 'lucide-react';
import { useSynthStore, selectActiveParams } from '../../stores/synthStore';
import type { SynthParams } from '../../types/synth';

const WAVEFORM_OPTIONS = [
  { value: 0, labelKey: 'sfx.waveSquare' },
  { value: 1, labelKey: 'sfx.waveSawtooth' },
  { value: 2, labelKey: 'sfx.waveSine' },
  { value: 3, labelKey: 'sfx.waveNoise' },
];

const NOISE_OPTIONS = [
  { value: 0, labelKey: 'sfx.noiseWhite' },
  { value: 1, labelKey: 'sfx.noisePink' },
  { value: 2, labelKey: 'sfx.noiseBrown' },
];

type ParamTab = 'basic' | 'envelope' | 'effects' | 'advanced';

// ---------------------------------------------------------------------------
// Parameter Info tooltip
// ---------------------------------------------------------------------------

// Translation keys live under sfx.paramInfo.<paramKey>.title / .description

export function ParamInfoButton({ paramKey }: { paramKey: string }) {
  const { t, i18n } = useTranslation();
  const [show, setShow] = useState(false);
  const titleKey = `sfx.paramInfo.${paramKey}.title`;
  const descKey = `sfx.paramInfo.${paramKey}.description`;
  // If no translation exists for this paramKey, hide the button
  if (!i18n.exists(titleKey)) return null;

  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="w-4 h-4 rounded-full bg-blue-500/60 text-white text-[9px] flex items-center justify-center hover:bg-blue-400 transition-colors"
        type="button"
      >
        i
      </button>
      {show && (
        <div className="absolute z-50 w-64 p-3 bg-gray-800 border border-gray-600 rounded-lg shadow-lg bottom-6 left-0">
          <h4 className="font-semibold text-white text-sm mb-1">{t(titleKey)}</h4>
          <p className="text-xs text-gray-300">{t(descKey)}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slider sub-component (card-style, matching CrispFXR)
// ---------------------------------------------------------------------------

// Waveform-specific parameter suggestions
const PARAM_SUGGESTIONS: Record<number, Record<string, string>> = {
  0: { // Square
    p_duty: 'Try 0.1–0.9 for different timbres',
    p_duty_ramp: 'Sweep for filter-like effects',
  },
  2: { // Sine
    fm_freq: 'Add harmonics with FM',
    p_vib_speed: 'Natural vibrato at 4–6 Hz',
  },
  3: { // Noise
    p_lpf_freq: 'Essential for shaping noise',
    p_hpf_freq: 'Remove unwanted low-end',
  },
};

function getSuggestion(paramKey: string, waveType: number): string | null {
  return PARAM_SUGGESTIONS[waveType]?.[paramKey] ?? null;
}

interface ParamSliderProps {
  label: string;
  paramKey: keyof SynthParams;
  min: number;
  max: number;
  step?: number;
  value: number;
  locked?: boolean;
  numeric?: boolean;
  suggestion?: string | null;
  onChange: (key: keyof SynthParams, value: number) => void;
  onToggleLock?: (key: keyof SynthParams) => void;
}

function ParamSlider({
  label,
  paramKey,
  min,
  max,
  step = 0.001,
  value,
  locked = false,
  numeric = false,
  suggestion,
  onChange,
  onToggleLock,
}: ParamSliderProps) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-medium ${locked ? 'text-amber-400' : 'text-gray-200'}`}>
            {label}
          </span>
          <ParamInfoButton paramKey={paramKey} />
        </div>
        <div className="flex items-center gap-2">
          {!numeric && (
            <span className="font-mono text-xs text-gray-400 w-14 text-right">
              {value.toFixed(3)}
            </span>
          )}
          {onToggleLock && (
            <button
              onClick={() => onToggleLock(paramKey)}
              className="transition-colors"
              style={{ color: locked ? '#f59e0b' : 'var(--text-muted)' }}
              type="button"
              aria-label={locked ? `Unlock ${label}` : `Lock ${label}`}
              title={locked ? 'Unlock parameter' : 'Lock parameter'}
            >
              {locked ? <Lock size={12} /> : <Unlock size={12} />}
            </button>
          )}
        </div>
      </div>
      {numeric ? (
        <input
          type="number"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={locked}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(paramKey, Math.max(min, Math.min(max, v)));
          }}
          className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm font-mono text-gray-200 focus:outline-none focus:border-blue-500 disabled:opacity-40"
        />
      ) : (
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={locked}
          onChange={(e) => onChange(paramKey, parseFloat(e.target.value))}
          className={`w-full slider-styled ${locked ? 'slider-amber' : ''}`}
        />
      )}
      {suggestion && (
        <div className="text-xs text-blue-400 italic mt-1">{suggestion}</div>
      )}
    </div>
  );
}

export const SfxParameters = memo(function SfxParameters() {
  const { t } = useTranslation();
  const params = useSynthStore(selectActiveParams);
  const { lockedParams, toggleLock, setParams, generate } = useSynthStore(useShallow((s) => ({ lockedParams: s.lockedParams, toggleLock: s.toggleLock, setParams: s.setParams, generate: s.generate })));
  const [activeTab, setActiveTab] = useState<ParamTab>('basic');
  const [showNumeric, setShowNumeric] = useState(false);
  const isLocked = (key: keyof SynthParams) => lockedParams.has(key);
  const onChange = useCallback((key: keyof SynthParams, value: number) => {
    setParams({ [key]: value });
    generate();
  }, [setParams, generate]);
  return (
        <div className="card">
          <div className="flex justify-between items-start mb-6 flex-wrap gap-3">
            <div className="tab-bar">
              {([
                { id: 'basic' as const, labelKey: 'sfx.tabBasic', Icon: Settings },
                { id: 'envelope' as const, labelKey: 'sfx.tabEnvelope', Icon: Activity },
                { id: 'effects' as const, labelKey: 'sfx.tabEffects', Icon: Zap },
                { id: 'advanced' as const, labelKey: 'sfx.tabAdvanced', Icon: Volume2 },
              ]).map(({ id, labelKey, Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`tab-btn ${activeTab === id ? 'active' : ''}`}
                >
                  <Icon className="w-4 h-4" />
                  {t(labelKey)}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowNumeric(!showNumeric)}
              className={`px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
                showNumeric ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {showNumeric ? t('sfx.sliders') : t('sfx.numeric')}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeTab === 'basic' && (
              <>
                {/* Waveform type */}
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 text-blue-300 text-sm">{t('sfx.waveformType')}</h4>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {WAVEFORM_OPTIONS.map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={params.wave_type === opt.value}
                          onChange={() => onChange('wave_type', opt.value)}
                          className="text-blue-600"
                        />
                        <span className="text-sm text-white">{t(opt.labelKey)}</span>
                      </label>
                    ))}
                  </div>
                  {params.wave_type === 3 && (
                    <>
                      <h4 className="font-semibold mb-2 text-purple-400 text-xs">{t('sfx.noiseType')}</h4>
                      <div className="grid grid-cols-3 gap-1">
                        {NOISE_OPTIONS.map((opt) => (
                          <label key={opt.value} className="flex items-center gap-1 cursor-pointer text-xs">
                            <input
                              type="radio"
                              checked={params.noise_type === opt.value}
                              onChange={() => onChange('noise_type', opt.value)}
                              className="text-purple-600"
                            />
                            <span className="text-white">{t(opt.labelKey)}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <ParamSlider label={t('sfx.baseFreq')} paramKey="p_base_freq" min={0.001} max={2} value={params.p_base_freq} locked={isLocked('p_base_freq')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_base_freq", params.wave_type)} />
                <ParamSlider label={t('sfx.freqRamp')} paramKey="p_freq_ramp" min={-1} max={1} value={params.p_freq_ramp} locked={isLocked('p_freq_ramp')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_freq_ramp", params.wave_type)} />
                <ParamSlider label={t('sfx.freqLimit')} paramKey="p_freq_limit" min={0} max={1} value={params.p_freq_limit} locked={isLocked('p_freq_limit')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_freq_limit", params.wave_type)} />
                <ParamSlider label={t('sfx.deltaRamp')} paramKey="p_freq_dramp" min={-1} max={1} value={params.p_freq_dramp} locked={isLocked('p_freq_dramp')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_freq_dramp", params.wave_type)} />

                {/* Retrigger */}
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 text-orange-300 text-sm">{t('sfx.retrigger')}</h4>
                  <ParamSlider label={t('sfx.repeat')} paramKey="p_repeat_speed" min={0} max={1} value={params.p_repeat_speed} locked={isLocked('p_repeat_speed')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_repeat_speed", params.wave_type)} />
                </div>
              </>
            )}

            {activeTab === 'envelope' && (
              <>
                <ParamSlider label={t('sfx.attack')} paramKey="p_env_attack" min={0} max={3} value={params.p_env_attack} locked={isLocked('p_env_attack')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_env_attack", params.wave_type)} />
                <ParamSlider label={t('sfx.sustain')} paramKey="p_env_sustain" min={0} max={3} value={params.p_env_sustain} locked={isLocked('p_env_sustain')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_env_sustain", params.wave_type)} />
                <ParamSlider label={t('sfx.decay')} paramKey="p_env_decay" min={0} max={3} value={params.p_env_decay} locked={isLocked('p_env_decay')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_env_decay", params.wave_type)} />
                <ParamSlider label={t('sfx.punch')} paramKey="p_env_punch" min={0} max={3} value={params.p_env_punch} locked={isLocked('p_env_punch')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_env_punch", params.wave_type)} />
                <ParamSlider label={t('sfx.speed')} paramKey="p_vib_speed" min={0} max={1} value={params.p_vib_speed} locked={isLocked('p_vib_speed')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_vib_speed", params.wave_type)} />
                <ParamSlider label={t('sfx.strength')} paramKey="p_vib_strength" min={0} max={1} value={params.p_vib_strength} locked={isLocked('p_vib_strength')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_vib_strength", params.wave_type)} />
              </>
            )}

            {activeTab === 'effects' && (
              <>
                <ParamSlider label={t('sfx.distortion')} paramKey="distortion" min={0} max={1} value={params.distortion} locked={isLocked('distortion')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("distortion", params.wave_type)} />
                <ParamSlider label={t('sfx.bitCrush')} paramKey="bit_crush" min={0} max={1} value={params.bit_crush} locked={isLocked('bit_crush')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("bit_crush", params.wave_type)} />
                <ParamSlider label={t('sfx.smpReduce')} paramKey="sample_reduction" min={0} max={1} value={params.sample_reduction} locked={isLocked('sample_reduction')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("sample_reduction", params.wave_type)} />
                <ParamSlider label={t('sfx.lpfFreq')} paramKey="p_lpf_freq" min={0} max={1} value={params.p_lpf_freq} locked={isLocked('p_lpf_freq')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_lpf_freq", params.wave_type)} />
                <ParamSlider label={t('sfx.lpfRamp')} paramKey="p_lpf_ramp" min={-1} max={1} value={params.p_lpf_ramp} locked={isLocked('p_lpf_ramp')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_lpf_ramp", params.wave_type)} />
                <ParamSlider label={t('sfx.lpfRes')} paramKey="p_lpf_resonance" min={0} max={1} value={params.p_lpf_resonance} locked={isLocked('p_lpf_resonance')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_lpf_resonance", params.wave_type)} />
                <ParamSlider label={t('sfx.hpfFreq')} paramKey="p_hpf_freq" min={0} max={1} value={params.p_hpf_freq} locked={isLocked('p_hpf_freq')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_hpf_freq", params.wave_type)} />
                <ParamSlider label={t('sfx.hpfRamp')} paramKey="p_hpf_ramp" min={-1} max={1} value={params.p_hpf_ramp} locked={isLocked('p_hpf_ramp')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_hpf_ramp", params.wave_type)} />
                <ParamSlider label={t('sfx.chorusRate')} paramKey="chorus_rate" min={0} max={1} value={params.chorus_rate} locked={isLocked('chorus_rate')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("chorus_rate", params.wave_type)} />
                <ParamSlider label={t('sfx.chorusDepth')} paramKey="chorus_depth" min={0} max={1} value={params.chorus_depth} locked={isLocked('chorus_depth')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("chorus_depth", params.wave_type)} />
                <ParamSlider label={t('sfx.delayTime')} paramKey="delay_time" min={0} max={1} value={params.delay_time} locked={isLocked('delay_time')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("delay_time", params.wave_type)} />
                <ParamSlider label={t('sfx.delayFb')} paramKey="delay_feedback" min={0} max={1} value={params.delay_feedback} locked={isLocked('delay_feedback')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("delay_feedback", params.wave_type)} />
                <ParamSlider label={t('sfx.flangerRate')} paramKey="flanger_rate" min={0} max={1} value={params.flanger_rate} locked={isLocked('flanger_rate')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("flanger_rate", params.wave_type)} />
                <ParamSlider label={t('sfx.flangerDepth')} paramKey="flanger_depth" min={0} max={1} value={params.flanger_depth} locked={isLocked('flanger_depth')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("flanger_depth", params.wave_type)} />
                <ParamSlider label={t('sfx.flangerDly')} paramKey="flanger_delay" min={0.1} max={1} value={params.flanger_delay} locked={isLocked('flanger_delay')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("flanger_delay", params.wave_type)} />
              </>
            )}

            {activeTab === 'advanced' && (
              <>
                <ParamSlider label={t('sfx.fmFreq')} paramKey="fm_freq" min={0} max={1} value={params.fm_freq} locked={isLocked('fm_freq')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("fm_freq", params.wave_type)} />
                <ParamSlider label={t('sfx.fmDepth')} paramKey="fm_depth" min={0} max={1} value={params.fm_depth} locked={isLocked('fm_depth')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("fm_depth", params.wave_type)} />
                <ParamSlider label={t('sfx.lfoRate')} paramKey="lfo_rate" min={0} max={1} value={params.lfo_rate} locked={isLocked('lfo_rate')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("lfo_rate", params.wave_type)} />
                <ParamSlider label={t('sfx.lfoDepth')} paramKey="lfo_depth" min={0} max={1} value={params.lfo_depth} locked={isLocked('lfo_depth')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("lfo_depth", params.wave_type)} />
                <ParamSlider label={t('sfx.ringFreq')} paramKey="ring_mod_freq" min={0} max={1} value={params.ring_mod_freq} locked={isLocked('ring_mod_freq')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("ring_mod_freq", params.wave_type)} />
                <ParamSlider label={t('sfx.ringDepth')} paramKey="ring_mod_depth" min={0} max={1} value={params.ring_mod_depth} locked={isLocked('ring_mod_depth')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("ring_mod_depth", params.wave_type)} />
                <ParamSlider label={t('sfx.subBass')} paramKey="sub_bass" min={0} max={1} value={params.sub_bass} locked={isLocked('sub_bass')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("sub_bass", params.wave_type)} />

                {/* Arpeggio */}
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 text-blue-300 text-sm">{t('sfx.arpeggio')}</h4>
                  <div className="space-y-3">
                    <ParamSlider label={t('sfx.mod')} paramKey="p_arp_mod" min={-1} max={1} value={params.p_arp_mod} locked={isLocked('p_arp_mod')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_arp_mod", params.wave_type)} />
                    <ParamSlider label={t('sfx.speed')} paramKey="p_arp_speed" min={0} max={1} value={params.p_arp_speed} locked={isLocked('p_arp_speed')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_arp_speed", params.wave_type)} />
                  </div>
                </div>

                {/* Pulse Width */}
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 text-blue-300 text-sm">{t('sfx.pulseWidth')}</h4>
                  <div className="space-y-3">
                    <ParamSlider label={t('sfx.duty')} paramKey="p_duty" min={-1} max={1} value={params.p_duty} locked={isLocked('p_duty')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_duty", params.wave_type)} />
                    <ParamSlider label={t('sfx.dutyRamp')} paramKey="p_duty_ramp" min={-1} max={1} value={params.p_duty_ramp} locked={isLocked('p_duty_ramp')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_duty_ramp", params.wave_type)} />
                  </div>
                </div>

                {/* Phaser */}
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 text-blue-300 text-sm">{t('sfx.phaser')}</h4>
                  <div className="space-y-3">
                    <ParamSlider label={t('sfx.offset')} paramKey="p_pha_offset" min={-1} max={1} value={params.p_pha_offset} locked={isLocked('p_pha_offset')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_pha_offset", params.wave_type)} />
                    <ParamSlider label={t('sfx.ramp')} paramKey="p_pha_ramp" min={-1} max={1} value={params.p_pha_ramp} locked={isLocked('p_pha_ramp')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_pha_ramp", params.wave_type)} />
                  </div>
                </div>

                <ParamSlider label={t('sfx.reverbSize')} paramKey="reverb_size" min={0} max={1} value={params.reverb_size} locked={isLocked('reverb_size')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("reverb_size", params.wave_type)} />
                <ParamSlider label={t('sfx.reverbDecay')} paramKey="reverb_decay" min={0} max={1} value={params.reverb_decay} locked={isLocked('reverb_decay')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("reverb_decay", params.wave_type)} />
                <ParamSlider label={t('sfx.volume')} paramKey="sound_vol" min={0} max={1} value={params.sound_vol} locked={isLocked('sound_vol')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("sound_vol", params.wave_type)} />
              </>
            )}
          </div>
        </div>
  );
});
