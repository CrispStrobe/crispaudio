// ---------------------------------------------------------------------------
// CrispAudio — SFXPanel
// SFX synthesizer panel matching CrispFXR-web layout:
// Header → Master/A-B → Play/Export → Visualizations → Envelope →
// Presets → Audio Quality → Tabbed Parameters
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Play,
  Square,
  Download,
  Upload,
  ArrowLeftRight,
  Copy,
  RefreshCw,
  Lock,
  Unlock,
  Zap,
  Headphones,
  Settings,
  Activity,
  Volume2,
  Repeat,
  Shuffle,
  Undo2,
  Redo2,
  Share2,
  FileJson,
} from 'lucide-react';
import { useSynthStore, selectActiveParams } from '../../stores/synthStore';
import { type SynthParams, ALL_PRESET_NAMES, type PresetName } from '../../types/synth';
import * as sfxPresets from '../../audio/presets/sfxPresets';
import { computeSpectrumBars } from '../../audio/utils/fft';

// ---------------------------------------------------------------------------
// Preset visual config
// ---------------------------------------------------------------------------

const PRESET_COLORS: Record<PresetName, string> = {
  pickupCoin: 'bg-yellow-500',
  laserShoot: 'bg-red-500',
  explosion: 'bg-orange-500',
  powerUp: 'bg-green-500',
  hitHurt: 'bg-purple-500',
  jump: 'bg-blue-500',
  ambient: 'bg-teal-500',
  random: 'bg-gray-500',
  blipSelect: 'bg-cyan-400',
  zapElectric: 'bg-lime-400',
  wooshWind: 'bg-indigo-500',
  droneBuzz: 'bg-pink-500',
  clickUI: 'bg-amber-500',
  glitchDigital: 'bg-fuchsia-500',
  portalWarp: 'bg-emerald-500',
  warningAlarm: 'bg-red-700',
};

const PRESET_SHORTCUTS: Partial<Record<PresetName, string>> = {
  pickupCoin: '1',
  laserShoot: '2',
  explosion: '3',
  powerUp: '4',
  hitHurt: '5',
  jump: '6',
  ambient: '7',
  random: '8',
  blipSelect: '9',
  zapElectric: 'Q',
  wooshWind: 'W',
  droneBuzz: 'E',
  clickUI: 'R',
  glitchDigital: 'T',
  portalWarp: 'Y',
  warningAlarm: 'U',
};

const PRESET_LABEL_KEYS: Record<PresetName, string> = {
  pickupCoin: 'sfx.preset_pickupCoin',
  laserShoot: 'sfx.preset_laserShoot',
  explosion: 'sfx.preset_explosion',
  powerUp: 'sfx.preset_powerUp',
  hitHurt: 'sfx.preset_hitHurt',
  jump: 'sfx.preset_jump',
  ambient: 'sfx.preset_ambient',
  random: 'sfx.preset_random',
  blipSelect: 'sfx.preset_blipSelect',
  zapElectric: 'sfx.preset_zapElectric',
  wooshWind: 'sfx.preset_wooshWind',
  droneBuzz: 'sfx.preset_droneBuzz',
  clickUI: 'sfx.preset_clickUI',
  glitchDigital: 'sfx.preset_glitchDigital',
  portalWarp: 'sfx.preset_portalWarp',
  warningAlarm: 'sfx.preset_warningAlarm',
};

const WAVEFORM_OPTIONS = [
  { value: 0, label: 'Square', titleKey: 'sfx.waveSquare' },
  { value: 1, label: 'Sawtooth', titleKey: 'sfx.waveSawtooth' },
  { value: 2, label: 'Sine', titleKey: 'sfx.waveSine' },
  { value: 3, label: 'Noise', titleKey: 'sfx.waveNoise' },
];

const NOISE_OPTIONS = [
  { value: 0, label: 'White' },
  { value: 1, label: 'Pink' },
  { value: 2, label: 'Brown' },
];

type ParamTab = 'basic' | 'envelope' | 'effects' | 'advanced';

// ---------------------------------------------------------------------------
// Parameter Info tooltip
// ---------------------------------------------------------------------------

const PARAM_INFO: Record<string, { title: string; description: string }> = {
  waveform: { title: 'Waveform Display', description: 'Time-domain shape of the audio signal. Y-axis is amplitude (-1 to 1), X-axis is time.' },
  spectrum: { title: 'Frequency Spectrum', description: 'Shows which frequencies are present. Taller bars = more prominent frequency. Logarithmic scale.' },
  amplitude: { title: 'Signal Level', description: 'RMS (average loudness) and Peak level in dB. Red peak = clipping.' },
  envelope: { title: 'Volume Envelope', description: 'Overall volume shape from start to finish, shaped by Attack, Sustain, and Decay.' },
  p_base_freq: { title: 'Base Frequency', description: 'Fundamental pitch. Higher = higher pitch.' },
  p_freq_ramp: { title: 'Frequency Slide', description: 'Pitch slides up (+) or down (-) over time.' },
  p_freq_limit: { title: 'Frequency Floor', description: 'Minimum pitch for downward slides.' },
  p_freq_dramp: { title: 'Delta Slide', description: 'Accelerates/decelerates the pitch slide.' },
  p_env_attack: { title: 'Attack', description: 'How quickly the sound fades in.' },
  p_env_sustain: { title: 'Sustain', description: 'How long the sound holds at full volume.' },
  p_env_punch: { title: 'Punch', description: 'Extra burst of volume at the start of sustain.' },
  p_env_decay: { title: 'Decay', description: 'How quickly the sound fades out.' },
  p_vib_strength: { title: 'Vibrato Depth', description: 'Amount of pitch wobble.' },
  p_vib_speed: { title: 'Vibrato Speed', description: 'Rate of pitch wobble.' },
  p_arp_mod: { title: 'Arpeggio Mod', description: 'Pitch jump amount for arpeggio effect.' },
  p_arp_speed: { title: 'Arpeggio Speed', description: 'Rate of arpeggio pitch jumps.' },
  distortion: { title: 'Distortion', description: 'Adds harmonic crunch and grit.' },
  bit_crush: { title: 'Bit Crush', description: 'Reduces resolution for retro/lo-fi effect.' },
  p_lpf_freq: { title: 'Low-pass Filter', description: 'Cuts high frequencies. Lower = darker sound.' },
  p_hpf_freq: { title: 'High-pass Filter', description: 'Cuts low frequencies. Higher = thinner sound.' },
  chorus_rate: { title: 'Chorus Rate', description: 'Speed of chorus modulation.' },
  delay_time: { title: 'Delay Time', description: 'Echo delay length.' },
  flanger_rate: { title: 'Flanger Rate', description: 'Speed of flanger sweep.' },
  fm_freq: { title: 'FM Frequency', description: 'Modulator frequency for FM synthesis.' },
  fm_depth: { title: 'FM Depth', description: 'Amount of frequency modulation.' },
  ring_mod_freq: { title: 'Ring Mod Freq', description: 'Carrier frequency for ring modulation.' },
  ring_mod_depth: { title: 'Ring Mod Depth', description: 'Amount of ring modulation.' },
};

function ParamInfoButton({ paramKey }: { paramKey: string }) {
  const [show, setShow] = useState(false);
  const info = PARAM_INFO[paramKey];
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
        <div className="absolute z-50 w-64 p-3 bg-gray-800 border border-gray-600 rounded-lg shadow-lg bottom-6 left-0">
          <h4 className="font-semibold text-white text-sm mb-1">{info.title}</h4>
          <p className="text-xs text-gray-300">{info.description}</p>
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
              style={{ color: locked ? '#f59e0b' : '#4b5563' }}
              type="button"
            >
              {locked ? <Lock size={12} /> : <Unlock size={12} />}
            </button>
          )}
        </div>
      </div>
      {numeric ? (
        <input
          type="number"
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

// ---------------------------------------------------------------------------
// Visualizations
// ---------------------------------------------------------------------------

function WaveformCanvas({
  buffer,
  isPlaying,
  title,
  duration,
}: {
  buffer: Float32Array | null;
  isPlaying?: boolean;
  title: string;
  duration?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);

  // Draw the static waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#1f2937');
    gradient.addColorStop(1, '#111827');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = (i / 4) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (!buffer || buffer.length === 0) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No signal', w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }

    if (isPlaying) {
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 10;
    }

    ctx.strokeStyle = isPlaying ? '#10b981' : '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const step = buffer.length / w;
    for (let i = 0; i < w; i++) {
      const sample = buffer[Math.floor(i * step)] || 0;
      const y = (sample * h * 0.4) + (h / 2);
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [buffer, isPlaying]);

  // Animate playhead during playback
  useEffect(() => {
    const el = playheadRef.current;
    if (!el) return;

    if (isPlaying && duration && duration > 0) {
      startTimeRef.current = performance.now();

      const tick = () => {
        const elapsed = (performance.now() - startTimeRef.current) / 1000;
        const progress = Math.min(elapsed / duration, 1);
        el.style.left = `${progress * 100}%`;
        el.style.display = 'block';
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          el.style.display = 'none';
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    } else {
      el.style.display = 'none';
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, duration]);

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2 text-white">{title}</h3>
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={400}
          height={120}
          className="w-full h-24 rounded border border-gray-700"
        />
        <div
          ref={playheadRef}
          className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none"
          style={{ display: 'none', left: 0 }}
        />
      </div>
    </div>
  );
}

function SpectrumCanvas({ buffer }: { buffer: Float32Array | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, w, h);

    if (!buffer || buffer.length === 0) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No signal', w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }

    const numBars = 32;
    const bars = computeSpectrumBars(buffer, numBars);
    const maxVal = Math.max(...bars);
    if (maxVal === 0) return;

    const barW = Math.floor(w / numBars) - 1;
    for (let i = 0; i < numBars; i++) {
      const norm = bars[i] / maxVal;
      const barH = Math.min(h, norm * h * 0.85);
      const x = i * (barW + 1);
      const hue = 240 - (i / numBars) * 120;
      const lightness = 40 + norm * 30;
      ctx.fillStyle = `hsl(${hue}, 70%, ${lightness}%)`;
      ctx.fillRect(x, h - barH, barW, barH);
    }

    // Freq labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '9px monospace';
    ctx.fillText('20Hz', 2, h - 2);
    ctx.fillText('1kHz', w * 0.4, h - 2);
    ctx.fillText('20kHz', w - 32, h - 2);
  }, [buffer]);

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2 text-white">Frequency Spectrum</h3>
      <canvas
        ref={canvasRef}
        width={200}
        height={100}
        className="w-full h-20 rounded border border-gray-700"
      />
    </div>
  );
}

function AmplitudeMeter({ buffer }: { buffer: Float32Array | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, w, h);

    if (!buffer || buffer.length === 0) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No signal', w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }

    let peak = 0;
    let rmsSum = 0;
    for (let i = 0; i < buffer.length; i++) {
      const s = Math.abs(buffer[i]);
      if (s > peak) peak = s;
      rmsSum += s * s;
    }
    const rms = Math.sqrt(rmsSum / buffer.length);

    const dbRange = 60;
    const peakDb = peak > 0 ? 20 * Math.log10(peak) : -100;
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -100;
    const peakH = Math.max(0, (peakDb + dbRange) / dbRange) * h;
    const rmsH = Math.max(0, (rmsDb + dbRange) / dbRange) * h;

    // RMS bar
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(0, h - rmsH, w * 0.4, rmsH);

    // Peak bar
    ctx.fillStyle = peak > 0.95 ? '#ef4444' : '#10b981';
    ctx.fillRect(w * 0.5, h - peakH, w * 0.4, peakH);

    // Labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px monospace';
    ctx.fillText('RMS', 2, 12);
    ctx.fillText('PEAK', w * 0.5 + 2, 12);
    ctx.fillText(`${rmsDb.toFixed(1)}dB`, 2, h - 2);
    ctx.fillText(`${peakDb.toFixed(1)}dB`, w * 0.5 + 2, h - 2);
  }, [buffer]);

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2 text-white">Signal Level</h3>
      <canvas
        ref={canvasRef}
        width={200}
        height={100}
        className="w-full h-20 rounded border border-gray-700"
      />
    </div>
  );
}

function EnvelopeDisplay({ buffer, sampleRate }: { buffer: Float32Array | null; sampleRate: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, w, h);

    if (!buffer || buffer.length === 0) return;

    const windowSize = Math.max(1, Math.floor(buffer.length / w));
    const envelope: number[] = [];
    for (let i = 0; i < w; i++) {
      let sum = 0;
      const start = i * windowSize;
      const end = Math.min(start + windowSize, buffer.length);
      for (let j = start; j < end; j++) {
        sum += buffer[j] * buffer[j];
      }
      envelope.push(Math.sqrt(sum / (end - start)));
    }

    const maxEnv = Math.max(...envelope);

    // Fill area
    ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < envelope.length; i++) {
      const norm = maxEnv > 0 ? envelope[i] / maxEnv : 0;
      ctx.lineTo(i, h - norm * h * 0.8);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // Stroke
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < envelope.length; i++) {
      const norm = maxEnv > 0 ? envelope[i] / maxEnv : 0;
      const y = h - norm * h * 0.8;
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();

    // Time labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px monospace';
    const duration = buffer.length / sampleRate;
    ctx.fillText('0s', 2, h - 2);
    ctx.fillText(`${duration.toFixed(2)}s`, w - 36, h - 2);
  }, [buffer, sampleRate]);

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2 text-white">Volume Envelope</h3>
      <canvas
        ref={canvasRef}
        width={400}
        height={60}
        className="w-full h-12 rounded border border-gray-700"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main SFXPanel
// ---------------------------------------------------------------------------

export function SFXPanel() {
  const { t } = useTranslation();
  const store = useSynthStore();
  const params = selectActiveParams(store);
  const {
    activeSlot, morphAmount, lockedParams,
    buffer, sampleRate, bitDepth, isPlaying,
    setActiveSlot, setMorphAmount, swapSlots, copyToOther,
    toggleLock, loadPreset: storeLoadPreset, generate, setParams,
    setIsPlaying, setExportSettings,
    mutateParams, exportParamsJSON, importParamsJSON, encodeShareLink,
  } = store;

  const [activeTab, setActiveTab] = useState<ParamTab>('basic');
  const [isLooping, setIsLooping] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [showNumeric, setShowNumeric] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Undo / Redo
  const handleUndo = useCallback(() => useSynthStore.temporal.getState().undo(), []);
  const handleRedo = useCallback(() => useSynthStore.temporal.getState().redo(), []);

  // Audio playback
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const loopRef = useRef(false);

  const handlePlayRef = useRef<() => void>(() => {});

  const handlePlay = useCallback(() => {
    if (!buffer) return;
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext({ sampleRate });
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    sourceRef.current?.stop();
    const ab = ctx.createBuffer(1, buffer.length, sampleRate);
    ab.getChannelData(0).set(buffer);
    const src = ctx.createBufferSource();
    src.buffer = ab;
    src.connect(ctx.destination);
    src.start();
    src.onended = () => {
      setIsPlaying(false);
      if (loopRef.current) {
        setTimeout(() => handlePlayRef.current(), 50);
      }
    };
    sourceRef.current = src;
    setIsPlaying(true);
  }, [buffer, sampleRate, setIsPlaying]);

  useEffect(() => { handlePlayRef.current = handlePlay; }, [handlePlay]);

  const handleStop = useCallback(() => {
    loopRef.current = false;
    setIsLooping(false);
    sourceRef.current?.stop();
    setIsPlaying(false);
  }, [setIsPlaying]);

  const toggleLoop = useCallback(() => {
    const next = !isLooping;
    setIsLooping(next);
    loopRef.current = next;
    if (next && !isPlaying && buffer) {
      handlePlay();
    }
    if (!next && isPlaying) {
      // let current play finish naturally
    }
  }, [isLooping, isPlaying, buffer, handlePlay]);

  const handleRandomise = useCallback(() => {
    const fn = sfxPresets['random' as keyof typeof sfxPresets] as (() => SynthParams) | undefined;
    if (fn) setParams(fn());
    generate();
  }, [setParams, generate]);

  const handleMutate = useCallback(() => {
    mutateParams();
    generate();
  }, [mutateParams, generate]);

  const handleShareLink = useCallback(() => {
    const link = encodeShareLink();
    navigator.clipboard.writeText(link).then(() => {
      setShareMsg('Link copied!');
      setTimeout(() => setShareMsg(null), 2000);
    });
  }, [encodeShareLink]);

  const handleExportJSON = useCallback(() => {
    const json = exportParamsJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crispaudio_sfx_preset_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportParamsJSON]);

  const handleImportJSON = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        importParamsJSON(reader.result);
        generate();
      }
    };
    reader.readAsText(file);
  }, [importParamsJSON, generate]);

  const onChange = useCallback(
    (key: keyof SynthParams, value: number) => {
      setParams({ [key]: value } as Partial<SynthParams>);
      generate();
    },
    [setParams, generate],
  );

  const handlePreset = useCallback(
    (name: PresetName) => {
      storeLoadPreset(name);
      generate();
    },
    [storeLoadPreset, generate],
  );

  // Generate initial buffer on mount
  useEffect(() => {
    if (!buffer) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const presetKeys: Record<string, PresetName> = {
      '1': 'pickupCoin', '2': 'laserShoot', '3': 'explosion', '4': 'powerUp',
      '5': 'hitHurt', '6': 'jump', '7': 'ambient', '8': 'random',
      '9': 'blipSelect', 'q': 'zapElectric', 'w': 'wooshWind', 'e': 'droneBuzz',
      'r': 'clickUI', 't': 'glitchDigital', 'y': 'portalWarp', 'u': 'warningAlarm',
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const key = e.key.toLowerCase();

      // Ctrl+Z / Ctrl+Shift+Z for undo/redo
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) { handleRedo(); } else { handleUndo(); }
        generate();
        return;
      }

      if (key === ' ') {
        e.preventDefault();
        if (isPlaying) handleStop();
        else handlePlay();
      } else if (key === 'l') {
        toggleLoop();
      } else if (key === 'a') {
        setActiveSlot('A');
      } else if (key === 'b') {
        setActiveSlot('B');
      } else if (key === 'm') {
        handleMutate();
      } else if (presetKeys[key]) {
        handlePreset(presetKeys[key]);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isPlaying, handlePlay, handleStop, toggleLoop, setActiveSlot, handlePreset, handleUndo, handleRedo, handleMutate, generate]);

  const isLocked = (k: keyof SynthParams) => lockedParams.has(k);

  // WAV export
  const downloadWav = useCallback(() => {
    if (!buffer) return;
    const numChannels = 1;
    const bitsPerSample = bitDepth;
    const numSamples = buffer.length;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = numSamples * blockAlign;
    const wavBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(wavBuffer);
    const enc = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++)
        view.setUint8(offset + i, str.charCodeAt(i));
    };
    enc(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    enc(8, 'WAVE');
    enc(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    enc(36, 'data');
    view.setUint32(40, dataSize, true);
    let offset = 44;
    if (bitsPerSample === 8) {
      for (let i = 0; i < numSamples; i++) {
        view.setUint8(offset, Math.round((buffer[i] + 1) * 127.5));
        offset += 1;
      }
    } else {
      for (let i = 0; i < numSamples; i++) {
        const s = Math.max(-1, Math.min(1, buffer[i]));
        view.setInt16(offset, Math.round(s * 32767), true);
        offset += 2;
      }
    }
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crispaudio_sfx_${Date.now()}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  }, [buffer, sampleRate, bitDepth]);

  // Clipping indicator
  const isClipping = buffer ? (() => {
    for (let i = 0; i < buffer.length; i++) {
      if (Math.abs(buffer[i]) > 0.95) return true;
    }
    return false;
  })() : false;

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'linear-gradient(to bottom right, #0f172a, #111827, #0c1929)' }}>
      <div className="max-w-7xl mx-auto p-6">

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
            {t('panels.sfx')}
          </h1>
          <p className="text-gray-400 text-base">Advanced Sound Effect Synthesizer</p>
          <p className="text-gray-500 text-xs mt-2">
            Shortcuts: A/B (slots) · 1-8,Q,W,E,R,T,Y,U (presets) · Space (play) · L (loop) · M (mutate) · Ctrl+Z (undo)
          </p>

          {/* Master Controls */}
          <div className="flex flex-wrap justify-center items-center gap-6 mt-6 mb-4">
            {/* Master Volume */}
            <div className="flex items-center gap-2">
              <Headphones className="w-4 h-4 text-gray-400" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={params.sound_vol}
                onChange={(e) => onChange('sound_vol', parseFloat(e.target.value))}
                className="w-20 slider-styled"
              />
              <span className="text-xs text-white bg-gray-800 px-2 py-1 rounded w-12 text-center font-mono">
                {Math.round(params.sound_vol * 100)}%
              </span>
            </div>

            {/* A/B Slot Selector */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveSlot('A')}
                className={`px-4 py-2 rounded-lg transition-colors font-semibold text-sm ${
                  activeSlot === 'A' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Slot A
              </button>
              <button
                onClick={copyToOther}
                className="btn-surface p-2 rounded-lg"
                title="Copy to other slot"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={swapSlots}
                className="p-2 rounded-lg transition-colors bg-purple-600 hover:bg-purple-500 text-white"
                title="Swap slots"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setActiveSlot('B')}
                className={`px-4 py-2 rounded-lg transition-colors font-semibold text-sm ${
                  activeSlot === 'B' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Slot B
              </button>
            </div>

            {/* Morph */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Morph:</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={morphAmount}
                onChange={(e) => setMorphAmount(parseFloat(e.target.value))}
                className="w-20 slider-styled"
              />
              <span className="text-xs text-white bg-gray-800 px-2 py-1 rounded w-12 text-center font-mono">
                {Math.round(morphAmount * 100)}%
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap justify-center gap-3 mt-4">
            <button
              onClick={isPlaying ? handleStop : handlePlay}
              disabled={!buffer}
              className={`px-6 py-3 rounded-lg transition-colors flex items-center gap-2 font-semibold ${
                isPlaying
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white'
              }`}
            >
              {isPlaying ? <Square className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              {isPlaying ? t('sfx.stop') : `${t('sfx.play')} ${activeSlot}`}
            </button>

            <button
              onClick={toggleLoop}
              className={`px-5 py-3 rounded-lg transition-colors flex items-center gap-2 font-semibold ${
                isLooping ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-600 hover:bg-gray-500 text-white'
              }`}
            >
              <Repeat className="w-5 h-5" />
              {isLooping ? t('sfx.stopLoop') : t('sfx.loop')}
            </button>

            <button
              onClick={handleRandomise}
              className="px-5 py-3 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors flex items-center gap-2 font-semibold text-white"
            >
              <RefreshCw className="w-5 h-5" />
              {t('sfx.randomise')}
            </button>

            <button
              onClick={handleMutate}
              className="px-5 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors flex items-center gap-2 font-semibold text-white"
            >
              <Shuffle className="w-5 h-5" />
              {t('sfx.mutate')}
            </button>

            <button
              onClick={handleUndo}
              className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-2 font-semibold text-white"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-5 h-5" />
            </button>

            <button
              onClick={handleRedo}
              className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-2 font-semibold text-white"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="w-5 h-5" />
            </button>

            <button
              onClick={downloadWav}
              disabled={!buffer}
              className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition-colors flex items-center gap-2 font-semibold text-white"
            >
              <Download className="w-5 h-5" />
              Export {activeSlot}
            </button>
          </div>
        </div>

        {/* ── Visualizations ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <div className="card relative group">
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <ParamInfoButton paramKey="waveform" />
            </div>
            <WaveformCanvas buffer={buffer} isPlaying={isPlaying && activeSlot === 'A'} title="Waveform A" duration={buffer ? buffer.length / sampleRate : 0} />
          </div>
          <div className="card relative group">
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <ParamInfoButton paramKey="waveform" />
            </div>
            <WaveformCanvas buffer={buffer} isPlaying={isPlaying && activeSlot === 'B'} title="Waveform B" duration={buffer ? buffer.length / sampleRate : 0} />
          </div>
          <div className="card relative group">
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <ParamInfoButton paramKey="spectrum" />
            </div>
            <SpectrumCanvas buffer={buffer} />
          </div>
          <div className="card relative group">
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <ParamInfoButton paramKey="amplitude" />
            </div>
            <AmplitudeMeter buffer={buffer} />
          </div>
        </div>

        {/* ── Envelope ────────────────────────────────────────────── */}
        <div className="card mb-6 relative group">
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <ParamInfoButton paramKey="envelope" />
          </div>
          <EnvelopeDisplay buffer={buffer} sampleRate={sampleRate} />
        </div>

        {/* ── Presets ─────────────────────────────────────────────── */}
        <div className="card mb-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
            <Zap className="w-5 h-5" />
            Sound Presets
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {ALL_PRESET_NAMES.map((name) => (
              <button
                key={name}
                onClick={() => handlePreset(name)}
                className={`p-3 ${PRESET_COLORS[name]} hover:opacity-80 rounded-lg transition-all transform hover:scale-105 text-sm font-semibold shadow-lg text-white`}
              >
                {t(PRESET_LABEL_KEYS[name])}
                {PRESET_SHORTCUTS[name] && (
                  <span className="block text-[10px] opacity-70 mt-0.5">({PRESET_SHORTCUTS[name]})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Audio Quality & Actions ─────────────────────────────── */}
        <div className="card mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sample Rate & Bit Depth */}
            <div>
              <h3 className="text-base font-semibold mb-3 text-white">Audio Quality</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-2 block">Sample Rate</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[44100, 22050, 11025, 8000].map((rate) => (
                      <button
                        key={rate}
                        onClick={() => setExportSettings(rate, bitDepth)}
                        className={`px-2 py-1.5 rounded text-xs transition-colors ${
                          sampleRate === rate
                            ? 'bg-orange-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {rate >= 1000 ? `${Math.round(rate / 1000)}K` : rate}
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">
                    Current: {sampleRate >= 1000 ? `${(sampleRate / 1000).toFixed(1)}K` : sampleRate}Hz
                    {sampleRate < 44100 && ' (Lo-Fi)'}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-2 block">Bit Depth</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[32, 24, 16, 8].map((bits) => (
                      <button
                        key={bits}
                        onClick={() => setExportSettings(sampleRate, bits)}
                        className={`px-2 py-1.5 rounded text-xs transition-colors ${
                          bitDepth === bits
                            ? 'bg-orange-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {bits}bit
                      </button>
                    ))}
                  </div>
                </div>
                {/* Clipping */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Clipped:</span>
                  <div className={`w-3 h-3 rounded ${isClipping ? 'bg-red-500' : 'bg-gray-600'}`} />
                  <span className="text-xs text-gray-500">{isClipping ? t('sfx.clippedYes') : t('sfx.clippedNo')}</span>
                </div>
              </div>
            </div>

            {/* Share & Presets */}
            <div>
              <h3 className="text-base font-semibold mb-3 text-white">Share &amp; Presets</h3>
              <div className="space-y-2">
                <button
                  onClick={handleShareLink}
                  className="w-full px-3 py-2 bg-green-600 hover:bg-green-500 rounded-lg transition-colors flex items-center gap-2 font-semibold text-sm text-white"
                >
                  <Share2 className="w-4 h-4" />
                  {shareMsg ?? 'Share Link'}
                </button>
                <button
                  onClick={handleExportJSON}
                  className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 font-semibold text-sm text-white"
                >
                  <FileJson className="w-4 h-4" />
                  Export Preset
                </button>
                <div className="relative">
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImportJSON(file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    onClick={() => importInputRef.current?.click()}
                    className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors flex items-center gap-2 font-semibold text-sm text-white"
                  >
                    <Upload className="w-4 h-4" />
                    Import Preset
                  </button>
                </div>
              </div>
            </div>

            {/* Export */}
            <div>
              <h3 className="text-base font-semibold mb-3 text-white">Export</h3>
              <div className="space-y-2">
                <button
                  onClick={downloadWav}
                  disabled={!buffer}
                  className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition-colors flex items-center gap-2 font-semibold text-sm text-white"
                >
                  <Download className="w-4 h-4" />
                  Download WAV
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tabbed Parameters ───────────────────────────────────── */}
        <div className="card">
          <div className="flex justify-between items-start mb-6 flex-wrap gap-3">
            <div className="tab-bar">
              {([
                { id: 'basic' as const, label: 'Basic', Icon: Settings },
                { id: 'envelope' as const, label: 'Envelope', Icon: Activity },
                { id: 'effects' as const, label: 'Effects', Icon: Zap },
                { id: 'advanced' as const, label: 'Advanced', Icon: Volume2 },
              ]).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`tab-btn ${activeTab === id ? 'active' : ''}`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowNumeric(!showNumeric)}
              className={`px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
                showNumeric ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {showNumeric ? 'Sliders' : 'Numeric'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeTab === 'basic' && (
              <>
                {/* Waveform type */}
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 text-blue-300 text-sm">Waveform Type</h4>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {WAVEFORM_OPTIONS.map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={params.wave_type === opt.value}
                          onChange={() => onChange('wave_type', opt.value)}
                          className="text-blue-600"
                        />
                        <span className="text-sm text-white">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                  {params.wave_type === 3 && (
                    <>
                      <h4 className="font-semibold mb-2 text-purple-400 text-xs">Noise Type</h4>
                      <div className="grid grid-cols-3 gap-1">
                        {NOISE_OPTIONS.map((opt) => (
                          <label key={opt.value} className="flex items-center gap-1 cursor-pointer text-xs">
                            <input
                              type="radio"
                              checked={params.noise_type === opt.value}
                              onChange={() => onChange('noise_type', opt.value)}
                              className="text-purple-600"
                            />
                            <span className="text-white">{opt.label}</span>
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
                  <h4 className="font-semibold mb-3 text-orange-300 text-sm">Retrigger</h4>
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
                  <h4 className="font-semibold mb-3 text-blue-300 text-sm">Arpeggio</h4>
                  <div className="space-y-3">
                    <ParamSlider label={t('sfx.mod')} paramKey="p_arp_mod" min={-1} max={1} value={params.p_arp_mod} locked={isLocked('p_arp_mod')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_arp_mod", params.wave_type)} />
                    <ParamSlider label={t('sfx.speed')} paramKey="p_arp_speed" min={0} max={1} value={params.p_arp_speed} locked={isLocked('p_arp_speed')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_arp_speed", params.wave_type)} />
                  </div>
                </div>

                {/* Pulse Width */}
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 text-blue-300 text-sm">Pulse Width</h4>
                  <div className="space-y-3">
                    <ParamSlider label={t('sfx.duty')} paramKey="p_duty" min={-1} max={1} value={params.p_duty} locked={isLocked('p_duty')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_duty", params.wave_type)} />
                    <ParamSlider label={t('sfx.dutyRamp')} paramKey="p_duty_ramp" min={-1} max={1} value={params.p_duty_ramp} locked={isLocked('p_duty_ramp')} onChange={onChange} onToggleLock={toggleLock} numeric={showNumeric} suggestion={getSuggestion("p_duty_ramp", params.wave_type)} />
                  </div>
                </div>

                {/* Phaser */}
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 text-blue-300 text-sm">Phaser</h4>
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

      </div>
    </div>
  );
}
