// ---------------------------------------------------------------------------
// CrispAudio — VoicePanel
// Voice processor panel matching VoiceLab layout:
// Header → File drop → Presets → A/B → Actions → Visualizations → Tabbed params
// ---------------------------------------------------------------------------

import { useCallback, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
} from 'lucide-react';
import { useVoiceStore } from '../../stores/voiceStore';
import { VoiceEngine } from '../../audio/engine/VoiceEngine';
import type { VoiceSettings, VoicePresetName } from '../../types/voicelab';

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

const TABS: { id: TabId; label: string; Icon: React.ComponentType<{ className?: string }>; params: ParamDef[] }[] = [
  {
    id: 'pitch', label: 'Pitch & Speed', Icon: Settings,
    params: [
      { key: 'pitchShift', labelKey: 'voice.pitchShift', min: -24, max: 24, step: 0.5, formatValue: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} st` },
      { key: 'formantShift', labelKey: 'voice.formantShift', min: -1, max: 1, step: 0.01 },
      { key: 'speedChange', labelKey: 'voice.speed', min: 0.5, max: 2, step: 0.01, formatValue: (v) => `${v.toFixed(2)}x` },
      { key: 'vocoderFreq', labelKey: 'voice.vocoderFreq', min: 50, max: 2000, step: 1, formatValue: (v) => `${Math.round(v)} Hz` },
      { key: 'vocoderMix', labelKey: 'voice.vocoderMix', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    id: 'modulation', label: 'Modulation', Icon: Waves,
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
    id: 'effects', label: 'Effects', Icon: Zap,
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
    id: 'dynamics', label: 'Dynamics', Icon: Activity,
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
        <span className="text-sm font-medium text-gray-200">{t(def.labelKey)}</span>
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

function WaveformCanvas({ buffer, color, title }: {
  buffer: AudioBuffer | null;
  color: string;
  title: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    // Grid
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = (i / 4) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (!buffer) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No audio', w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
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
  }, [buffer, color]);

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2 text-white">{title}</h3>
      <canvas
        ref={canvasRef}
        width={400}
        height={120}
        className="w-full h-24 rounded border border-gray-700"
      />
    </div>
  );
}

function SpectrumCanvas({ buffer }: { buffer: AudioBuffer | null }) {
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

    if (!buffer) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No audio', w / 2, h / 2);
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

function LevelsMeter({ buffer }: { buffer: AudioBuffer | null }) {
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

    if (!buffer) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No audio', w / 2, h / 2);
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

// ---------------------------------------------------------------------------
// File drop zone (larger, more inviting)
// ---------------------------------------------------------------------------

function FileDropZone({ onFile }: { onFile: (buf: AudioBuffer) => void }) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function loadFile(file: File) {
    try {
      const arrayBuf = await file.arrayBuffer();
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      onFile(decoded);
      setFilename(file.name);
      await ctx.close();
    } catch {
      // silently ignore decode errors
    }
  }

  return (
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
        <span className="text-xs text-gray-500 mt-1">Drop audio file or click to upload</span>
      )}
      {filename && (
        <span className="text-xs text-green-400 mt-1">Loaded — ready to process</span>
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
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const handlePlay = useCallback(
    (buf: AudioBuffer | null) => {
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
      src.onended = () => setIsPlaying(false);
      sourceRef.current = src;
      setIsPlaying(true);
    },
    [],
  );

  const handleStop = useCallback(() => {
    sourceRef.current?.stop();
    setIsPlaying(false);
  }, []);

  const handleProcess = useCallback(async () => {
    if (!sourceBuffer) return;
    setIsProcessing(true);
    try {
      const effectiveSettings = store.getEffectiveSettings();
      const out = await voiceEngine.processAudio(sourceBuffer, effectiveSettings);
      setProcessedBuffer(out);
    } catch (err) {
      console.error('Voice processing failed:', err);
      setProcessedBuffer(sourceBuffer);
    } finally {
      setIsProcessing(false);
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

  function downloadProcessed() {
    if (!processedBuffer) return;
    const sr = processedBuffer.sampleRate;
    const numSamples = processedBuffer.length;
    const data = processedBuffer.getChannelData(0);
    const wavBuf = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(wavBuf);
    const enc = (off: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };
    enc(0, 'RIFF'); view.setUint32(4, 36 + numSamples * 2, true);
    enc(8, 'WAVE'); enc(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, sr, true);
    view.setUint32(28, sr * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); enc(36, 'data');
    view.setUint32(40, numSamples * 2, true);
    let off = 44;
    for (let i = 0; i < numSamples; i++) {
      view.setInt16(off, Math.round(Math.max(-1, Math.min(1, data[i])) * 32767), true);
      off += 2;
    }
    const blob = new Blob([wavBuf], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `crispaudio_voice_${Date.now()}.wav`;
    a.click(); URL.revokeObjectURL(url);
  }

  // Keyboard shortcuts
  useEffect(() => {
    const presetKeys: Record<string, VoicePresetName> = {
      '1': 'original', '2': 'classicRobot', '3': 'deepRobot', '4': 'alien',
      '5': 'cyborg', '6': 'radio', '7': 'metallic', '8': 'demon', '9': 'chipmunk',
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const key = e.key.toLowerCase();
      if (key === ' ') {
        e.preventDefault();
        if (isPlaying) handleStop();
        else handlePlay(processedBuffer ?? sourceBuffer);
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
  }, [isPlaying, handlePlay, handleStop, handleProcess, setActiveSlot, loadPreset, processedBuffer, sourceBuffer]);

  const currentTab = TABS.find((t) => t.id === activeTab)!;
  const hasAudio = !!(sourceBuffer || processedBuffer);

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'linear-gradient(to bottom right, #0f172a, #111827, #0c1929)' }}>
      <div className="max-w-7xl mx-auto p-6">

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-green-400 via-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
            {t('panels.voice')}
          </h1>
          <p className="text-gray-400 text-base">Voice Synthesis &amp; Real-time Processing</p>
          <p className="text-gray-500 text-xs mt-2">
            Shortcuts: Space (play) · 1-9 (presets) · A/B (slots) · P (process)
          </p>
        </div>

        {/* ── File Drop Zone ──────────────────────────────────────── */}
        <div className="card mb-6">
          <FileDropZone onFile={setSourceBuffer} />
        </div>

        {/* ── Voice Presets ────────────────────────────────────────── */}
        <div className="card mb-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
            <Mic className="w-5 h-5" />
            Voice Presets
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
          <div className="flex flex-wrap justify-center items-center gap-4">
            {/* Slots */}
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
        </div>

        {/* ── Action Buttons ──────────────────────────────────────── */}
        <div className="flex flex-wrap justify-center gap-3 mb-6">
          <button
            onClick={isPlaying ? handleStop : () => handlePlay(processedBuffer ?? sourceBuffer)}
            disabled={!hasAudio}
            className={`px-6 py-3 rounded-lg transition-colors flex items-center gap-2 font-semibold ${
              isPlaying
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white'
            }`}
          >
            {isPlaying ? <Square className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            {isPlaying ? t('voice.stop') : t('voice.play')}
          </button>

          <button
            onClick={handleProcess}
            disabled={!sourceBuffer || isProcessing}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition-colors flex items-center gap-2 font-semibold text-white"
          >
            <Shuffle className="w-5 h-5" />
            {isProcessing ? t('voice.processing') : t('voice.process')}
          </button>

          <button
            onClick={downloadProcessed}
            disabled={!processedBuffer}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition-colors flex items-center gap-2 font-semibold text-white"
          >
            <Download className="w-5 h-5" />
            {t('voice.export')}
          </button>
        </div>

        {/* ── Visualizations ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <div className="card">
            <WaveformCanvas buffer={sourceBuffer} color="#3b82f6" title="Original Waveform" />
          </div>
          <div className="card">
            <WaveformCanvas buffer={processedBuffer} color="#a855f7" title="Processed Waveform" />
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
          <div className="tab-bar mb-6">
            {TABS.map(({ id, label, Icon }) => (
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
