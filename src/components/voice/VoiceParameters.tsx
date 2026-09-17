import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Waves, Zap, Activity } from 'lucide-react';
import { useVoiceStore } from '../../stores/voiceStore';
import type { VoiceSettings } from '../../types/voicelab';

type TabId = 'pitch' | 'modulation' | 'effects' | 'dynamics';

interface ParamDef {
  key: keyof VoiceSettings;
  labelKey: string;
  min: number;
  max: number;
  step?: number;
  formatValue?: (v: number) => string;
}

const TABS: { id: TabId; labelKey: string; Icon: React.ComponentType<{ className?: string }>; params: ParamDef[] }[] = [
  {
    id: 'pitch', labelKey: 'voice.tabPitch', Icon: Settings,
    params: [
      { key: 'pitchShift', labelKey: 'voice.pitchShift', min: -24, max: 24, step: 0.5, formatValue: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} st` },
      { key: 'formantShift', labelKey: 'voice.formantShift', min: -1, max: 1, step: 0.01 },
      { key: 'speedChange', labelKey: 'voice.speed', min: 0.5, max: 2, step: 0.01, formatValue: (v) => `${v.toFixed(2)}x` },
      { key: 'vocoderFreq', labelKey: 'voice.vocoderFreq', min: 50, max: 2000, step: 1, formatValue: (v) => `${Math.round(v)} Hz` },
      { key: 'vocoderMix', labelKey: 'voice.vocoderMix', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    id: 'modulation', labelKey: 'voice.tabModulation', Icon: Waves,
    params: [
      { key: 'ringModFreq', labelKey: 'voice.ringModFreq', min: 1, max: 500, step: 1, formatValue: (v) => `${Math.round(v)} Hz` },
      { key: 'ringModMix', labelKey: 'voice.ringModMix', min: 0, max: 1, step: 0.01 },
      { key: 'tremoloRate', labelKey: 'voice.tremoloRate', min: 0, max: 20, step: 0.1, formatValue: (v) => `${v.toFixed(1)} Hz` },
      { key: 'tremoloDepth', labelKey: 'voice.tremoloDepth', min: 0, max: 1, step: 0.01 },
      { key: 'chorusRate', labelKey: 'voice.chorusRate', min: 0.1, max: 10, step: 0.1, formatValue: (v) => `${v.toFixed(1)} Hz` },
      { key: 'chorusDepth', labelKey: 'voice.chorusDepth', min: 0, max: 1, step: 0.01 },
      { key: 'chorusMix', labelKey: 'voice.chorusMix', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    id: 'effects', labelKey: 'voice.tabEffects', Icon: Zap,
    params: [
      { key: 'delayTime', labelKey: 'voice.delayTime', min: 0, max: 1, step: 0.01, formatValue: (v) => `${(v * 1000).toFixed(0)} ms` },
      { key: 'delayFeedback', labelKey: 'voice.delayFeedback', min: 0, max: 0.99, step: 0.01 },
      { key: 'delayMix', labelKey: 'voice.delayMix', min: 0, max: 1, step: 0.01 },
      { key: 'reverbSize', labelKey: 'voice.reverbSize', min: 0, max: 1, step: 0.01 },
      { key: 'reverbDecay', labelKey: 'voice.reverbDecay', min: 0.1, max: 10, step: 0.1, formatValue: (v) => `${v.toFixed(1)}s` },
      { key: 'reverbMix', labelKey: 'voice.reverbMix', min: 0, max: 1, step: 0.01 },
      { key: 'lowpassFreq', labelKey: 'voice.lowPass', min: 200, max: 22000, step: 10, formatValue: (v) => `${Math.round(v)} Hz` },
      { key: 'highpassFreq', labelKey: 'voice.highPass', min: 0, max: 8000, step: 10, formatValue: (v) => `${Math.round(v)} Hz` },
    ],
  },
  {
    id: 'dynamics', labelKey: 'voice.tabDynamics', Icon: Activity,
    params: [
      { key: 'compThreshold', labelKey: 'voice.compThreshold', min: -60, max: 0, step: 0.5, formatValue: (v) => `${v.toFixed(1)} dB` },
      { key: 'compRatio', labelKey: 'voice.compRatio', min: 1, max: 20, step: 0.5, formatValue: (v) => `${v.toFixed(1)}:1` },
      { key: 'distortionDrive', labelKey: 'voice.distortionDrive', min: 0, max: 1, step: 0.01 },
      { key: 'distortionMix', labelKey: 'voice.distortionMix', min: 0, max: 1, step: 0.01 },
      { key: 'bitCrushBits', labelKey: 'voice.bitCrushBits', min: 1, max: 16, step: 1, formatValue: (v) => `${Math.round(v)}-bit` },
      { key: 'bitCrushMix', labelKey: 'voice.bitCrushMix', min: 0, max: 1, step: 0.01 },
      { key: 'noiseGateThreshold', labelKey: 'voice.noiseGate', min: -96, max: 0, step: 1, formatValue: (v) => `${v.toFixed(0)} dB` },
      { key: 'masterGain', labelKey: 'voice.masterGain', min: 0, max: 2, step: 0.01, formatValue: (v) => `${v.toFixed(2)}x` },
    ],
  },
];

// ---------------------------------------------------------------------------
// Parameter info tooltips
// ---------------------------------------------------------------------------

const VOICE_PARAM_INFO: Record<string, string> = {
  pitchShift: 'Shift pitch up or down in semitones without changing speed.',
  formantShift: 'Shift vocal formants independently of pitch. Positive = brighter, negative = deeper.',
  speedChange: 'Change playback speed. 1.0 = normal, 0.5 = half speed, 2.0 = double speed.',
  vocoderFreq: 'Carrier frequency for the vocoder effect.',
  vocoderMix: 'Blend between dry signal and vocoder output.',
  ringModFreq: 'Carrier frequency for ring modulation. Creates metallic, robotic tones.',
  ringModMix: 'Blend between dry signal and ring-modulated output.',
  tremoloRate: 'Speed of volume modulation in Hz.',
  tremoloDepth: 'Amount of volume modulation.',
  chorusRate: 'Speed of chorus modulation.',
  chorusDepth: 'Width of chorus pitch variation.',
  chorusMix: 'Blend between dry and chorus output.',
  delayTime: 'Echo delay time.',
  delayFeedback: 'How much of the delayed signal feeds back. Higher = more repeats.',
  delayMix: 'Blend between dry signal and delayed output.',
  reverbSize: 'Size of the reverb space. Larger = more spacious.',
  reverbDecay: 'How long the reverb tail lasts.',
  reverbMix: 'Blend between dry signal and reverb output.',
  lowpassFreq: 'Cuts frequencies above this value. Lower = darker sound.',
  highpassFreq: 'Cuts frequencies below this value. Higher = thinner sound.',
  compThreshold: 'Level above which compression begins. Lower = more compression.',
  compRatio: 'Compression ratio. Higher = more aggressive limiting.',
  distortionDrive: 'Amount of distortion/overdrive.',
  distortionMix: 'Blend between clean and distorted signal.',
  bitCrushBits: 'Reduce bit resolution for lo-fi effect. Lower = more crushed.',
  bitCrushMix: 'Blend between clean and bit-crushed signal.',
  noiseGateThreshold: 'Silence signals below this level. Removes background noise.',
  masterGain: 'Overall output volume multiplier.',
};

function VoiceInfoButton({ paramKey }: { paramKey: string }) {
  const [show, setShow] = useState(false);
  const info = VOICE_PARAM_INFO[paramKey];
  if (!info) return null;

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
        <div className="absolute z-50 w-56 p-2.5 bg-gray-800 border border-gray-600 rounded-lg shadow-lg bottom-6 left-0">
          <p className="text-xs text-gray-300">{info}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Parameter slider card
// ---------------------------------------------------------------------------

function ParamSlider({ def, value, onChange }: {
  def: ParamDef;
  value: number;
  onChange: (key: keyof VoiceSettings, v: number) => void;
}) {
  const { t } = useTranslation();
  const display = def.formatValue ? def.formatValue(value) : value.toFixed(3);
  return (
    <div className="bg-gray-800/50 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-gray-200">{t(def.labelKey)}</span>
          <VoiceInfoButton paramKey={def.key} />
        </div>
        <span className="font-mono text-xs text-gray-400 w-16 text-right">{display}</span>
      </div>
      <input
        type="range"
        aria-label={t(def.labelKey)}
        min={def.min}
        max={def.max}
        step={def.step ?? 0.001}
        value={value}
        onChange={(e) => onChange(def.key, parseFloat(e.target.value))}
        className="w-full slider-styled"
      />
    </div>
  );
}

export const VoiceParameters = memo(function VoiceParameters() {
  const { t } = useTranslation();
  const settings = useVoiceStore((s) => s.activeSlot === 'A' ? s.settingsA : s.settingsB);
  const setSettings = useVoiceStore((s) => s.setSettings);
  const [activeTab, setActiveTab] = useState<TabId>('pitch');
  const currentTab = TABS.find((tab) => tab.id === activeTab)!;
  return (
        <div className="card">
          <div className="tab-bar mb-6" role="tablist">
            {TABS.map(({ id, labelKey, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                role="tab"
                aria-selected={activeTab === id}
                className={`tab-btn ${activeTab === id ? 'active' : ''}`}
              >
                <Icon className="w-4 h-4" />
                {t(labelKey)}
              </button>
            ))}
          </div>

          <div role="tabpanel" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {currentTab.params.map((def) => (
              <ParamSlider
                key={def.key}
                def={def}
                value={settings[def.key] as number}
                onChange={(key, v) => setSettings({ [key]: v })}
              />
            ))}
          </div>
        </div>
  );
});
