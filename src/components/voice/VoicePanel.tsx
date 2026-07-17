// ---------------------------------------------------------------------------
// CrispAudio — VoicePanel
// Voice processor panel matching VoiceLab layout:
// Header → File drop → Presets → A/B → Actions → Visualizations → Tabbed params
// ---------------------------------------------------------------------------

import { useCallback, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { exportWav, downloadWavFile } from '../../lib/wavExport';
import {
  Upload,
  Play,
  Square,
  Download,
  ArrowLeftRight,
  Mic,
  Shuffle,
  Settings,
  Waves,
  Zap,
  Activity,
  Undo2,
  Redo2,
  SendHorizontal,
} from 'lucide-react';
import { useVoiceStore } from '../../stores/voiceStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { computeWaveformPeaks } from '../../audio/utils/audioBufferUtils';
import { useMediaRecorder } from '../../hooks/useMediaRecorder';
import { VoiceEngine } from '../../audio/engine/VoiceEngine';
import type { VoiceSettings, VoicePresetName } from '../../types/voicelab';
import { canvasBgGradient, canvasBgFlat, canvasGridColor, canvasTextColor, canvasEmptyColor } from '../../lib/themeColors';

const voiceEngine = new VoiceEngine();

// ---------------------------------------------------------------------------
// Preset config
// ---------------------------------------------------------------------------

const PRESET_NAMES: VoicePresetName[] = [
  'original', 'classicRobot', 'deepRobot', 'alien', 'cyborg',
  'radio', 'metallic', 'demon', 'chipmunk',
];

const PRESET_COLORS: Record<VoicePresetName, string> = {
  original: 'bg-slate-600',
  classicRobot: 'bg-red-600',
  deepRobot: 'bg-purple-600',
  alien: 'bg-green-600',
  cyborg: 'bg-blue-600',
  radio: 'bg-yellow-600',
  metallic: 'bg-orange-600',
  demon: 'bg-pink-600',
  chipmunk: 'bg-indigo-600',
};

const PRESET_SHORTCUTS: Record<VoicePresetName, string> = {
  original: '1', classicRobot: '2', deepRobot: '3', alien: '4', cyborg: '5',
  radio: '6', metallic: '7', demon: '8', chipmunk: '9',
};

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Visualizations
// ---------------------------------------------------------------------------

function WaveformCanvas({ buffer, color, title, isPlaying, duration }: {
  buffer: AudioBuffer | null;
  color: string;
  title: string;
  isPlaying?: boolean;
  duration?: number;
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = canvasBgGradient(ctx, h);
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = canvasGridColor();
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = (i / 4) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (!buffer) {
      ctx.fillStyle = canvasEmptyColor();
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('voice.noAudio'), w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }

    if (isPlaying) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
    }

    const data = buffer.getChannelData(0);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const step = data.length / w;
    for (let i = 0; i < w; i++) {
      const sample = data[Math.floor(i * step)] || 0;
      const y = (sample * h * 0.4) + (h / 2);
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [buffer, color, isPlaying, t]);

  // Playhead animation
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

function SpectrumCanvas({ buffer }: { buffer: AudioBuffer | null }) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = canvasBgFlat();
    ctx.fillRect(0, 0, w, h);

    if (!buffer) {
      ctx.fillStyle = canvasEmptyColor();
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('voice.noAudio'), w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }

    const data = buffer.getChannelData(0);
    const numBars = 32;
    const chunkSize = Math.max(1, Math.floor(data.length / numBars));
    const barW = Math.floor(w / numBars) - 1;

    // Compute RMS per chunk
    const bars: number[] = [];
    let maxRms = 0;
    for (let i = 0; i < numBars; i++) {
      let sum = 0;
      for (let j = 0; j < chunkSize; j++) {
        const s = data[i * chunkSize + j] ?? 0;
        sum += s * s;
      }
      const r = Math.sqrt(sum / chunkSize);
      bars.push(r);
      if (r > maxRms) maxRms = r;
    }

    if (maxRms === 0) return;

    for (let i = 0; i < numBars; i++) {
      const norm = bars[i] / maxRms;
      const barH = Math.min(h, norm * h * 0.85);
      const hue = 240 - (i / numBars) * 120;
      const lightness = 40 + norm * 30;
      ctx.fillStyle = `hsl(${hue}, 70%, ${lightness}%)`;
      ctx.fillRect(i * (barW + 1), h - barH, barW, barH);
    }
  }, [buffer, t]);

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2 text-white">{t('voice.frequencySpectrum')}</h3>
      <canvas
        ref={canvasRef}
        width={200}
        height={100}
        className="w-full h-20 rounded border border-gray-700"
      />
    </div>
  );
}

function LevelsMeter({ buffer }: { buffer: AudioBuffer | null }) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = canvasBgFlat();
    ctx.fillRect(0, 0, w, h);

    if (!buffer) {
      ctx.fillStyle = canvasEmptyColor();
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('voice.noAudio'), w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }

    const data = buffer.getChannelData(0);
    let peak = 0;
    let rmsSum = 0;
    for (let i = 0; i < data.length; i++) {
      const s = Math.abs(data[i]);
      if (s > peak) peak = s;
      rmsSum += s * s;
    }
    const rms = Math.sqrt(rmsSum / data.length);

    const dbRange = 60;
    const peakDb = peak > 0 ? 20 * Math.log10(peak) : -100;
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -100;
    const peakH = Math.max(0, (peakDb + dbRange) / dbRange) * h;
    const rmsH = Math.max(0, (rmsDb + dbRange) / dbRange) * h;

    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(0, h - rmsH, w * 0.4, rmsH);

    ctx.fillStyle = peak > 0.95 ? '#ef4444' : '#10b981';
    ctx.fillRect(w * 0.5, h - peakH, w * 0.4, peakH);

    ctx.fillStyle = canvasTextColor();
    ctx.font = '10px monospace';
    ctx.fillText('RMS', 2, 12);
    ctx.fillText('PEAK', w * 0.5 + 2, 12);
    ctx.fillText(`${rmsDb.toFixed(1)}dB`, 2, h - 2);
    ctx.fillText(`${peakDb.toFixed(1)}dB`, w * 0.5 + 2, h - 2);
  }, [buffer, t]);

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2 text-white">{t('voice.signalLevel')}</h3>
      <canvas
        ref={canvasRef}
        width={200}
        height={100}
        className="w-full h-20 rounded border border-gray-700"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// File drop zone (larger, more inviting)
// ---------------------------------------------------------------------------

function FileDropZone({ onFile }: { onFile: (buf: AudioBuffer) => void }) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function loadFile(file: File) {
    setError(null);
    try {
      const arrayBuf = await file.arrayBuffer();
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      onFile(decoded);
      setFilename(file.name);
      await ctx.close();
    } catch {
      setError(t('common.decodeError'));
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) loadFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center rounded-2xl cursor-pointer transition-all border-2 border-dashed ${
          dragging
            ? 'border-blue-500 bg-blue-500/10 scale-[1.02]'
            : 'border-gray-600/30 bg-gray-800/30 hover:border-gray-500/50'
        }`}
        style={{ padding: '2rem', minHeight: filename ? 80 : 120 }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.m4a,.mp3,.wav,.aac,.flac"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) loadFile(file);
          }}
        />
        <Upload size={28} className={`mb-2 ${dragging ? 'text-blue-400' : 'text-gray-500'}`} />
        <span className={`text-sm ${dragging ? 'text-blue-300' : 'text-gray-400'}`}>
          {filename ? filename : t('voice.loadFile')}
        </span>
        {!filename && (
          <span className="text-xs text-gray-500 mt-1">{t('voice.dropAudio')}</span>
        )}
        {filename && (
          <span className="text-xs text-green-400 mt-1">{t('voice.loadedReady')}</span>
        )}
      </div>
      {error && (
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-950/50 border border-red-800">
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main VoicePanel
// ---------------------------------------------------------------------------

export function VoicePanel() {
  const { t } = useTranslation();
  const store = useVoiceStore();
  const {
    settingsA, settingsB, activeSlot, morphAmount,
    sourceBuffer, processedBuffer, isProcessing, selectedPreset,
    setSourceBuffer, setSettings, loadPreset, setIsProcessing,
    setProcessedBuffer, setActiveSlot, setMorphAmount, swapSlots,
  } = store;

  const settings = activeSlot === 'A' ? settingsA : settingsB;
  const [activeTab, setActiveTab] = useState<TabId>('pitch');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingBuffer, setPlayingBuffer] = useState<'source' | 'processed' | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Microphone recording
  const { isRecording, error: recordError, startRecording, stopRecording } = useMediaRecorder();
  const [isRecordProcessing, setIsRecordProcessing] = useState(false);

  const handleRecordToggle = useCallback(async () => {
    if (isRecording) {
      setIsRecordProcessing(true);
      const buf = await stopRecording();
      if (buf) {
        setSourceBuffer(buf);
      }
      setIsRecordProcessing(false);
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording, setSourceBuffer]);

  const handleUndo = useCallback(() => useVoiceStore.temporal.getState().undo(), []);
  const handleRedo = useCallback(() => useVoiceStore.temporal.getState().redo(), []);

  const handlePlay = useCallback(
    (buf: AudioBuffer | null, which: 'source' | 'processed') => {
      if (!buf) return;
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext({ sampleRate: buf.sampleRate });
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      sourceRef.current?.stop();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start();
      src.onended = () => {
        setIsPlaying(false);
        setPlayingBuffer(null);
      };
      sourceRef.current = src;
      setIsPlaying(true);
      setPlayingBuffer(which);
    },
    [],
  );

  // Cleanup audio on unmount — stop playback, close context
  useEffect(() => {
    return () => {
      try { sourceRef.current?.stop(); } catch { /* already stopped */ }
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      sourceRef.current = null;
      setIsPlaying(false);
      setPlayingBuffer(null);
    };
  }, []);

  const handleStop = useCallback(() => {
    sourceRef.current?.stop();
    setIsPlaying(false);
    setPlayingBuffer(null);
  }, []);

  // Staleness counter to discard results from outdated processAudio calls
  const processGenRef = useRef(0);

  const handleProcess = useCallback(async () => {
    if (!sourceBuffer) return;
    const gen = ++processGenRef.current;
    setIsProcessing(true);
    try {
      const effectiveSettings = store.getEffectiveSettings();
      const out = await voiceEngine.processAudio(sourceBuffer, effectiveSettings);
      // Discard result if a newer process call was started
      if (gen !== processGenRef.current) return;
      setProcessedBuffer(out);
    } catch (err) {
      if (gen !== processGenRef.current) return;
      console.error('Voice processing failed:', err);
      setProcessedBuffer(sourceBuffer);
    } finally {
      if (gen === processGenRef.current) {
        setIsProcessing(false);
      }
    }
  }, [sourceBuffer, store, setIsProcessing, setProcessedBuffer]);

  // Auto-process on settings/preset change (throttled 300ms)
  const processTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsRef = useRef(settings);
  const presetRef = useRef(selectedPreset);

  useEffect(() => {
    // Skip the very first render and only trigger on actual changes
    if (settingsRef.current === settings && presetRef.current === selectedPreset) return;
    settingsRef.current = settings;
    presetRef.current = selectedPreset;

    if (!sourceBuffer) return;

    if (processTimerRef.current) clearTimeout(processTimerRef.current);
    processTimerRef.current = setTimeout(() => {
      handleProcess();
    }, 300);

    return () => {
      if (processTimerRef.current) clearTimeout(processTimerRef.current);
    };
  }, [settings, selectedPreset, sourceBuffer, handleProcess]);

  async function downloadProcessed() {
    if (!processedBuffer) return;
    const data = processedBuffer.getChannelData(0);
    const blob = await exportWav(data, processedBuffer.sampleRate, 16);
    downloadWavFile(blob, `crispaudio_voice_${Date.now()}.wav`);
  }

  const sendToTimeline = useCallback(() => {
    if (!processedBuffer) return;
    const data = processedBuffer.getChannelData(0);
    const peaks = computeWaveformPeaks(data, 256);
    useProjectStore.getState().importAudioSource({
      id: crypto.randomUUID(),
      name: `Voice - ${new Date().toLocaleTimeString()}`,
      buffer: processedBuffer,
      peaks,
      duration: processedBuffer.duration,
      sampleRate: processedBuffer.sampleRate,
      channels: processedBuffer.numberOfChannels,
    });
    useUIStore.getState().setActivePanel('timeline');
  }, [processedBuffer]);

  // Keyboard shortcuts
  useEffect(() => {
    const presetKeys: Record<string, VoicePresetName> = {
      '1': 'original', '2': 'classicRobot', '3': 'deepRobot', '4': 'alien',
      '5': 'cyborg', '6': 'radio', '7': 'metallic', '8': 'demon', '9': 'chipmunk',
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const key = e.key.toLowerCase();

      // Ctrl+Z / Ctrl+Shift+Z for undo/redo
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) { handleRedo(); } else { handleUndo(); }
        return;
      }

      if (key === ' ') {
        e.preventDefault();
        if (isPlaying) handleStop();
        else handlePlay(processedBuffer ?? sourceBuffer, processedBuffer ? 'processed' : 'source');
      } else if (key === 'a') {
        setActiveSlot('A');
      } else if (key === 'b') {
        setActiveSlot('B');
      } else if (key === 'p') {
        handleProcess();
      } else if (presetKeys[key]) {
        loadPreset(presetKeys[key]);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isPlaying, handlePlay, handleStop, handleProcess, setActiveSlot, loadPreset, processedBuffer, sourceBuffer, handleUndo, handleRedo]);

  const currentTab = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="h-full overflow-y-auto panel-enter" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-7xl mx-auto p-3 sm:p-6">

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-green-400 via-blue-400 to-purple-400 bg-clip-text text-transparent mb-2 gradient-title-voice">
            {t('panels.voice')}
          </h1>
          <p className="text-gray-400 text-sm sm:text-base">{t('voice.subtitle')}</p>
          {/* Keyboard shortcuts hint is irrelevant on touch/small screens */}
          <p className="hidden sm:block text-gray-500 text-xs mt-2">
            {t('voice.shortcuts')}
          </p>
        </div>

        {/* ── File Drop Zone + Record ─────────────────────────────── */}
        <div className="card mb-6">
          <FileDropZone onFile={setSourceBuffer} />
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={handleRecordToggle}
              disabled={isRecordProcessing}
              className={`px-5 py-3 rounded-lg transition-colors flex items-center gap-2 font-semibold text-white ${
                isRecording
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500'
              }`}
            >
              {isRecording && (
                <span className="w-3 h-3 rounded-full bg-red-400 animate-pulse" />
              )}
              <Mic className="w-5 h-5" />
              {isRecordProcessing
                ? t('voice.recordProcessing')
                : isRecording
                  ? t('voice.stopRecording')
                  : t('voice.record')}
            </button>
            {recordError && (
              <span className="text-sm text-red-400">{recordError}</span>
            )}
          </div>
        </div>

        {/* ── Voice Presets ────────────────────────────────────────── */}
        <div className="card mb-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
            <Mic className="w-5 h-5" />
            {t('voice.presets')}
          </h3>
          <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3">
            {PRESET_NAMES.map((name) => (
              <button
                key={name}
                onClick={() => loadPreset(name)}
                className={`p-3 rounded-lg transition-all transform hover:scale-105 text-sm font-semibold shadow-lg text-white ${
                  selectedPreset === name
                    ? `${PRESET_COLORS[name]} ring-2 ring-white/30`
                    : `${PRESET_COLORS[name]} hover:opacity-80`
                }`}
              >
                {t(`voice.preset_${name}`)}
                <span className="block text-[10px] opacity-70 mt-0.5">({PRESET_SHORTCUTS[name]})</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── A/B Controls ────────────────────────────────────────── */}
        <div className="card mb-6">
          <div className="flex flex-col sm:flex-row flex-wrap justify-center items-center gap-3 sm:gap-4">
            {/* Slots */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveSlot('A')}
                aria-label={t('voice.slotA')}
                aria-pressed={activeSlot === 'A'}
                className={`px-4 py-2 rounded-lg transition-colors font-semibold text-sm ${
                  activeSlot === 'A' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {t('voice.slotA')}
              </button>
              <button
                onClick={swapSlots}
                className="p-2 rounded-lg transition-colors bg-purple-600 hover:bg-purple-500 text-white"
                title={t('voice.swapSlots')}
                aria-label={t('voice.swapSlots')}
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setActiveSlot('B')}
                aria-label={t('voice.slotB')}
                aria-pressed={activeSlot === 'B'}
                className={`px-4 py-2 rounded-lg transition-colors font-semibold text-sm ${
                  activeSlot === 'B' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {t('voice.slotB')}
              </button>
            </div>

            {/* Morph */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{t('voice.morph')}</span>
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
        </div>

        {/* ── Action Buttons ──────────────────────────────────────── */}
        <div className="flex flex-wrap justify-center gap-3 mb-6">
          {/* Play Source */}
          <button
            onClick={isPlaying ? handleStop : () => handlePlay(sourceBuffer, 'source')}
            disabled={!sourceBuffer}
            aria-label={isPlaying ? 'Stop source playback' : 'Play source audio'}
            className={`px-5 py-3 rounded-lg transition-colors flex items-center gap-2 font-semibold ${
              isPlaying
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white'
            }`}
          >
            {isPlaying ? <Square className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            {isPlaying ? t('voice.stop') : t('voice.playSource')}
          </button>

          {/* Play Processed */}
          <button
            onClick={isPlaying ? handleStop : () => handlePlay(processedBuffer, 'processed')}
            disabled={!processedBuffer}
            aria-label={isPlaying ? 'Stop processed playback' : 'Play processed audio'}
            className={`px-5 py-3 rounded-lg transition-colors flex items-center gap-2 font-semibold ${
              isPlaying
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white'
            }`}
          >
            {isPlaying ? <Square className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            {isPlaying ? t('voice.stop') : t('voice.playProcessed')}
          </button>

          {/* Process */}
          <button
            onClick={handleProcess}
            disabled={!sourceBuffer || isProcessing}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition-colors flex items-center gap-2 font-semibold text-white"
          >
            {isProcessing ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Shuffle className="w-5 h-5" />
            )}
            {isProcessing ? t('voice.processing') : t('voice.process')}
          </button>

          {/* Export */}
          <button
            onClick={downloadProcessed}
            disabled={!processedBuffer}
            className="px-5 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition-colors flex items-center gap-2 font-semibold text-white"
          >
            <Download className="w-5 h-5" />
            {t('voice.export')}
          </button>

          {/* Send to Timeline */}
          <button
            onClick={sendToTimeline}
            disabled={!processedBuffer}
            className="px-5 py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition-colors flex items-center gap-2 font-semibold text-white"
            aria-label={t('voice.sendToTimeline')}
          >
            <SendHorizontal className="w-5 h-5" />
            {t('voice.sendToTimeline')}
          </button>

          {/* Undo / Redo */}
          <button
            onClick={handleUndo}
            className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-2 font-semibold text-white"
            title={t('common.undo') + ' (Ctrl+Z)'}
            aria-label={t('common.undo')}
          >
            <Undo2 className="w-5 h-5" />
          </button>

          <button
            onClick={handleRedo}
            className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-2 font-semibold text-white"
            title={t('common.redo') + ' (Ctrl+Shift+Z)'}
            aria-label={t('common.redo')}
          >
            <Redo2 className="w-5 h-5" />
          </button>
        </div>

        {/* ── Visualizations ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <div className="card">
            <WaveformCanvas buffer={sourceBuffer} color="#3b82f6" title={t('voice.originalWaveform')} isPlaying={isPlaying && playingBuffer === 'source'} duration={sourceBuffer?.duration} />
          </div>
          <div className="card">
            <WaveformCanvas buffer={processedBuffer} color="#a855f7" title={t('voice.processedWaveform')} isPlaying={isPlaying && playingBuffer === 'processed'} duration={processedBuffer?.duration} />
          </div>
          <div className="card">
            <SpectrumCanvas buffer={processedBuffer ?? sourceBuffer} />
          </div>
          <div className="card">
            <LevelsMeter buffer={processedBuffer ?? sourceBuffer} />
          </div>
        </div>

        {/* ── Tabbed Parameters ───────────────────────────────────── */}
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

      </div>
    </div>
  );
}
