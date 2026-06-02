// ---------------------------------------------------------------------------
// CrispAudio — SFXPanel
// Main SFX synthesizer panel. DAW-style dark layout.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Play,
  Square,
  Download,
  ArrowLeftRight,
  Copy,
  RefreshCw,
  Lock,
  Unlock,
} from 'lucide-react';
import { useSynthStore, selectActiveParams } from '../../stores/synthStore';
import { type SynthParams, ALL_PRESET_NAMES, type PresetName } from '../../types/synth';
import * as sfxPresets from '../../audio/presets/sfxPresets';
import { computeSpectrumBars } from '../../audio/utils/fft';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  { value: 0, label: 'SQ', titleKey: 'sfx.waveSquare' },
  { value: 1, label: 'SAW', titleKey: 'sfx.waveSawtooth' },
  { value: 2, label: 'SIN', titleKey: 'sfx.waveSine' },
  { value: 3, label: 'NOI', titleKey: 'sfx.waveNoise' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SliderRowProps {
  label: string;
  paramKey: keyof SynthParams;
  min: number;
  max: number;
  step?: number;
  value: number;
  locked?: boolean;
  onChange: (key: keyof SynthParams, value: number) => void;
  onToggleLock?: (key: keyof SynthParams) => void;
  formatValue?: (v: number) => string;
}

function SliderRow({
  label,
  paramKey,
  min,
  max,
  step = 0.001,
  value,
  locked = false,
  onChange,
  onToggleLock,
  formatValue,
}: SliderRowProps) {
  const { t } = useTranslation();
  const display = formatValue ? formatValue(value) : value.toFixed(3);
  return (
    <div className="flex items-center gap-2" style={{ height: 22 }}>
      {/* Lock toggle */}
      {onToggleLock ? (
        <button
          onClick={() => onToggleLock(paramKey)}
          title={locked ? t('sfx.unlockParameter') : t('sfx.lockParameter')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: locked ? '#f59e0b' : '#334155',
            padding: 0,
            width: 14,
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          {locked ? <Lock size={10} /> : <Unlock size={10} />}
        </button>
      ) : (
        <div style={{ width: 14, flexShrink: 0 }} />
      )}
      {/* Label */}
      <span
        style={{
          width: 88,
          fontSize: 10,
          color: locked ? '#f59e0b' : '#64748b',
          flexShrink: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </span>
      {/* Slider */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={locked}
        onChange={(e) => onChange(paramKey, parseFloat(e.target.value))}
        style={{
          flex: 1,
          height: 4,
          accentColor: locked ? '#f59e0b' : '#3b82f6',
          cursor: locked ? 'not-allowed' : 'pointer',
          opacity: locked ? 0.5 : 1,
        }}
      />
      {/* Value readout */}
      <span
        className="font-mono"
        style={{ width: 44, fontSize: 10, color: '#475569', textAlign: 'right', flexShrink: 0 }}
      >
        {display}
      </span>
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div className="flex flex-col gap-1" style={{ marginBottom: 8 }}>
      <div
        className="flex items-center gap-2"
        style={{ marginBottom: 4 }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#3b82f6',
          }}
        >
          {title}
        </span>
        <div style={{ flex: 1, height: 1, background: '#1e2d40' }} />
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Waveform visualisation (canvas)
// ---------------------------------------------------------------------------

interface WaveformCanvasProps {
  buffer: Float32Array | null;
  width?: number;
  height?: number;
  color?: string;
}

function WaveformCanvas({
  buffer,
  width = 200,
  height = 64,
  color = '#3b82f6',
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0a1120';
    ctx.fillRect(0, 0, width, height);

    // Grid line
    ctx.strokeStyle = '#1e2d40';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    if (!buffer || buffer.length === 0) {
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      return;
    }

    const step = Math.max(1, Math.floor(buffer.length / width));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x < width; x++) {
      const idx = x * step;
      const sample = buffer[Math.min(idx, buffer.length - 1)];
      const y = ((1 - sample) / 2) * height;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [buffer, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: 'block', width: '100%', height, borderRadius: 4 }}
    />
  );
}

// ---------------------------------------------------------------------------
// Spectrum visualisation (canvas — real FFT magnitude spectrum)
// ---------------------------------------------------------------------------

function SpectrumCanvas({ buffer, width = 200, height = 64 }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0a1120';
    ctx.fillRect(0, 0, width, height);

    if (!buffer || buffer.length === 0) return;

    // Real log-spaced FFT magnitude spectrum
    const numBars = 32;
    const bars = computeSpectrumBars(buffer, numBars);
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, '#1d4ed8');
    gradient.addColorStop(0.6, '#3b82f6');
    gradient.addColorStop(1, '#93c5fd');

    const barW = Math.floor(width / numBars) - 1;
    for (let i = 0; i < numBars; i++) {
      const barH = Math.min(height, bars[i] * height);
      const x = i * (barW + 1);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, height - barH, barW, barH);
    }
  }, [buffer, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: 'block', width: '100%', height, borderRadius: 4 }}
    />
  );
}

// ---------------------------------------------------------------------------
// Amplitude meter
// ---------------------------------------------------------------------------

function AmplitudeMeter({ buffer }: { buffer: Float32Array | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const W = 16;
  const H = 96;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a1120';
    ctx.fillRect(0, 0, W, H);

    if (!buffer || buffer.length === 0) return;

    // Peak
    let peak = 0;
    for (let i = 0; i < buffer.length; i++) {
      const a = Math.abs(buffer[i]);
      if (a > peak) peak = a;
    }
    peak = Math.min(1, peak);

    const fillH = Math.floor(peak * H);
    const grad = ctx.createLinearGradient(0, H, 0, 0);
    grad.addColorStop(0, '#22c55e');
    grad.addColorStop(0.7, '#eab308');
    grad.addColorStop(1, '#ef4444');
    ctx.fillStyle = grad;
    ctx.fillRect(0, H - fillH, W, fillH);
  }, [buffer]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{ display: 'block', width: W, height: H, borderRadius: 3 }}
    />
  );
}

// ---------------------------------------------------------------------------
// A/B Comparison controls
// ---------------------------------------------------------------------------

function ABControls() {
  const { t } = useTranslation();
  const { activeSlot, morphAmount, setActiveSlot, setMorphAmount, swapSlots, copyToOther } =
    useSynthStore();

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded"
      style={{ background: '#0d1929', border: '1px solid #1e2d40' }}
    >
      {/* Slot buttons */}
      {(['A', 'B'] as const).map((slot) => (
        <button
          key={slot}
          onClick={() => setActiveSlot(slot)}
          className="font-mono font-bold rounded transition-all"
          style={{
            width: 28,
            height: 24,
            fontSize: 12,
            background: activeSlot === slot ? '#1d4ed8' : '#1e293b',
            color: activeSlot === slot ? '#bfdbfe' : '#475569',
            border: activeSlot === slot ? '1px solid #3b82f6' : '1px solid #334155',
            cursor: 'pointer',
          }}
        >
          {slot === 'A' ? t('common.slotA') : t('common.slotB')}
        </button>
      ))}

      {/* Morph slider */}
      <span style={{ fontSize: 10, color: '#475569' }}>{t('common.morph')}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={morphAmount}
        onChange={(e) => setMorphAmount(parseFloat(e.target.value))}
        style={{ width: 80, height: 4, accentColor: '#8b5cf6' }}
      />
      <span className="font-mono" style={{ fontSize: 10, color: '#475569', width: 30 }}>
        {Math.round(morphAmount * 100)}%
      </span>

      {/* Swap / copy */}
      <button
        onClick={swapSlots}
        title={t('sfx.swapAB')}
        className="flex items-center justify-center rounded"
        style={{
          width: 28,
          height: 24,
          background: '#1e293b',
          border: '1px solid #334155',
          color: '#64748b',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.color = '#94a3b8')
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.color = '#64748b')
        }
      >
        <ArrowLeftRight size={12} />
      </button>
      <button
        onClick={copyToOther}
        title={t('common.copy')}
        className="flex items-center justify-center rounded"
        style={{
          width: 28,
          height: 24,
          background: '#1e293b',
          border: '1px solid #334155',
          color: '#64748b',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.color = '#94a3b8')
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.color = '#64748b')
        }
      >
        <Copy size={12} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export controls
// ---------------------------------------------------------------------------

function ExportBar() {
  const { t } = useTranslation();
  const { sampleRate, bitDepth, buffer, setExportSettings } = useSynthStore();

  const sampleRates = [8000, 11025, 22050, 44100, 48000];
  const bitDepths = [8, 16, 24, 32];

  function downloadWav() {
    if (!buffer) return;
    // Minimal WAV writer
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
    view.setUint16(20, 1, true); // PCM
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
  }

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded"
      style={{ background: '#0d1929', border: '1px solid #1e2d40' }}
    >
      <span style={{ fontSize: 10, color: '#475569' }} title={t('sfx.sampleRate')}>{t('sfx.sampleRateShort')}</span>
      <select
        value={sampleRate}
        onChange={(e) => setExportSettings(parseInt(e.target.value), bitDepth)}
        style={{
          background: '#1e293b',
          border: '1px solid #334155',
          color: '#94a3b8',
          borderRadius: 4,
          padding: '2px 4px',
          fontSize: 10,
          cursor: 'pointer',
        }}
      >
        {sampleRates.map((r) => (
          <option key={r} value={r}>
            {r >= 1000 ? `${r / 1000}k` : r}
          </option>
        ))}
      </select>

      <span style={{ fontSize: 10, color: '#475569' }} title={t('sfx.bitDepth')}>{t('sfx.bitDepthShort')}</span>
      <select
        value={bitDepth}
        onChange={(e) => setExportSettings(sampleRate, parseInt(e.target.value))}
        style={{
          background: '#1e293b',
          border: '1px solid #334155',
          color: '#94a3b8',
          borderRadius: 4,
          padding: '2px 4px',
          fontSize: 10,
          cursor: 'pointer',
        }}
      >
        {bitDepths.map((d) => (
          <option key={d} value={d}>
            {d}-bit
          </option>
        ))}
      </select>

      <div style={{ flex: 1 }} />

      <button
        onClick={downloadWav}
        disabled={!buffer}
        className="flex items-center gap-2 px-3 py-1 rounded font-medium transition-all"
        style={{
          background: buffer ? '#1d4ed8' : '#1e293b',
          color: buffer ? '#bfdbfe' : '#334155',
          border: `1px solid ${buffer ? '#3b82f6' : '#334155'}`,
          fontSize: 11,
          cursor: buffer ? 'pointer' : 'not-allowed',
        }}
      >
        <Download size={12} />
        {t('sfx.exportWav')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function SFXPanel() {
  const { t } = useTranslation();
  const store = useSynthStore();
  const params = selectActiveParams(store);
  const { lockedParams, toggleLock, loadPreset, generate, setParams, isPlaying, buffer } = store;

  // Play audio via Web Audio API
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const handlePlay = useCallback(() => {
    if (!buffer) return;
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext({ sampleRate: store.sampleRate });
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    sourceRef.current?.stop();
    const ab = ctx.createBuffer(1, buffer.length, store.sampleRate);
    ab.getChannelData(0).set(buffer);
    const src = ctx.createBufferSource();
    src.buffer = ab;
    src.connect(ctx.destination);
    src.start();
    src.onended = () => store.setIsPlaying(false);
    sourceRef.current = src;
    store.setIsPlaying(true);
  }, [buffer, store]);

  const handleStop = useCallback(() => {
    sourceRef.current?.stop();
    store.setIsPlaying(false);
  }, [store]);

  const handleRandomise = useCallback(() => {
    const fn = sfxPresets['random' as keyof typeof sfxPresets] as (() => SynthParams) | undefined;
    if (fn) store.setParams(fn());
    generate();
  }, [store, generate]);

  // Auto-generate on param change
  const onChange = useCallback(
    (key: keyof SynthParams, value: number) => {
      setParams({ [key]: value } as Partial<SynthParams>);
      generate();
    },
    [setParams, generate],
  );

  const handlePreset = useCallback(
    (name: PresetName) => {
      loadPreset(name);
      generate();
    },
    [loadPreset, generate],
  );

  // Generate an initial buffer on mount so Play / Export are usable immediately
  // (the store starts with buffer === null and nothing else triggers generation).
  useEffect(() => {
    if (!buffer) generate();
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLocked = (k: keyof SynthParams) => lockedParams.has(k);

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: '#0f172a', overflow: 'hidden' }}
    >
      {/* ── Top toolbar ─────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 py-2 shrink-0"
        style={{ borderBottom: '1px solid #1e2d40', background: '#0a1120' }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#3b82f6',
          }}
        >
          {t('panels.sfx')}
        </span>
        <div style={{ flex: 1 }} />
        {/* Play / Stop */}
        <button
          onClick={isPlaying ? handleStop : handlePlay}
          disabled={!buffer}
          className="flex items-center gap-1.5 px-3 py-1 rounded font-medium transition-all"
          style={{
            background: isPlaying ? '#7f1d1d' : (buffer ? '#14532d' : '#1e293b'),
            color: isPlaying ? '#fca5a5' : (buffer ? '#86efac' : '#334155'),
            border: `1px solid ${isPlaying ? '#dc2626' : (buffer ? '#22c55e' : '#334155')}`,
            fontSize: 11,
            cursor: buffer ? 'pointer' : 'not-allowed',
          }}
        >
          {isPlaying ? <Square size={12} /> : <Play size={12} />}
          {isPlaying ? t('sfx.stop') : t('sfx.play')}
        </button>
        {/* Regenerate */}
        <button
          onClick={handleRandomise}
          className="flex items-center gap-1.5 px-3 py-1 rounded font-medium transition-all"
          style={{
            background: '#1e293b',
            color: '#64748b',
            border: '1px solid #334155',
            fontSize: 11,
            cursor: 'pointer',
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.color = '#94a3b8')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.color = '#64748b')
          }
        >
          <RefreshCw size={12} />
          {t('sfx.randomise')}
        </button>
      </div>

      {/* ── Preset grid ─────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1 px-4 py-2 shrink-0 flex-wrap"
        style={{ borderBottom: '1px solid #1e2d40', background: '#0d1929' }}
      >
        {ALL_PRESET_NAMES.map((name) => (
          <button
            key={name}
            onClick={() => handlePreset(name)}
            className="rounded transition-all"
            style={{
              padding: '2px 8px',
              fontSize: 10,
              fontWeight: 500,
              background: '#1e293b',
              color: '#64748b',
              border: '1px solid #334155',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#1d4ed8';
              (e.currentTarget as HTMLButtonElement).style.color = '#bfdbfe';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#3b82f6';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#1e293b';
              (e.currentTarget as HTMLButtonElement).style.color = '#64748b';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#334155';
            }}
          >
            {t(PRESET_LABEL_KEYS[name])}
          </button>
        ))}
      </div>

      {/* ── A/B row ─────────────────────────────────────────────────── */}
      <div className="px-4 py-2 shrink-0" style={{ borderBottom: '1px solid #1e2d40' }}>
        <ABControls />
      </div>

      {/* ── Main 3-column area ──────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 gap-0">
        {/* Left col: Waveform + Volume/Freq controls */}
        <div
          className="flex flex-col gap-3 px-3 py-3 overflow-y-auto"
          style={{ width: 200, borderRight: '1px solid #1e2d40', flexShrink: 0 }}
        >
          {/* Waveform selector */}
          <Section title={t('sfx.waveform')}>
            <div className="grid grid-cols-2 gap-1">
              {WAVEFORM_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onChange('wave_type', opt.value)}
                  title={t(opt.titleKey)}
                  className="rounded font-mono font-bold transition-all"
                  style={{
                    height: 28,
                    fontSize: 10,
                    background: params.wave_type === opt.value ? '#1d4ed8' : '#1e293b',
                    color: params.wave_type === opt.value ? '#bfdbfe' : '#475569',
                    border: `1px solid ${params.wave_type === opt.value ? '#3b82f6' : '#334155'}`,
                    cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Main controls */}
          <Section title={t('sfx.main')}>
            <SliderRow
              label={t('sfx.baseFreq')}
              paramKey="p_base_freq"
              min={0.001}
              max={2}
              value={params.p_base_freq}
              locked={isLocked('p_base_freq')}
              onChange={onChange}
              onToggleLock={toggleLock}
            />
            <SliderRow
              label={t('sfx.volume')}
              paramKey="sound_vol"
              min={0}
              max={1}
              value={params.sound_vol}
              locked={isLocked('sound_vol')}
              onChange={onChange}
              onToggleLock={toggleLock}
            />
            <SliderRow
              label={t('sfx.subBass')}
              paramKey="sub_bass"
              min={0}
              max={1}
              value={params.sub_bass}
              locked={isLocked('sub_bass')}
              onChange={onChange}
              onToggleLock={toggleLock}
            />
          </Section>

          {/* Pitch */}
          <Section title={t('sfx.pitch')}>
            <SliderRow
              label={t('sfx.freqRamp')}
              paramKey="p_freq_ramp"
              min={-1}
              max={1}
              value={params.p_freq_ramp}
              locked={isLocked('p_freq_ramp')}
              onChange={onChange}
              onToggleLock={toggleLock}
            />
            <SliderRow
              label={t('sfx.deltaRamp')}
              paramKey="p_freq_dramp"
              min={-1}
              max={1}
              value={params.p_freq_dramp}
              locked={isLocked('p_freq_dramp')}
              onChange={onChange}
              onToggleLock={toggleLock}
            />
            <SliderRow
              label={t('sfx.freqLimit')}
              paramKey="p_freq_limit"
              min={0}
              max={1}
              value={params.p_freq_limit}
              locked={isLocked('p_freq_limit')}
              onChange={onChange}
              onToggleLock={toggleLock}
            />
          </Section>
        </div>

        {/* Center col: Parameter sliders by category */}
        <div
          className="flex-1 min-w-0 overflow-y-auto px-3 py-3 flex flex-col gap-3"
        >
          {/* Envelope */}
          <Section title={t('sfx.envelope')}>
            <SliderRow label={t('sfx.attack')} paramKey="p_env_attack" min={0} max={3} value={params.p_env_attack} locked={isLocked('p_env_attack')} onChange={onChange} onToggleLock={toggleLock} formatValue={(v) => `${v.toFixed(2)}s`} />
            <SliderRow label={t('sfx.sustain')} paramKey="p_env_sustain" min={0} max={3} value={params.p_env_sustain} locked={isLocked('p_env_sustain')} onChange={onChange} onToggleLock={toggleLock} formatValue={(v) => `${v.toFixed(2)}s`} />
            <SliderRow label={t('sfx.punch')} paramKey="p_env_punch" min={0} max={3} value={params.p_env_punch} locked={isLocked('p_env_punch')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.decay')} paramKey="p_env_decay" min={0} max={3} value={params.p_env_decay} locked={isLocked('p_env_decay')} onChange={onChange} onToggleLock={toggleLock} formatValue={(v) => `${v.toFixed(2)}s`} />
          </Section>

          {/* Vibrato */}
          <Section title={t('sfx.vibrato')}>
            <SliderRow label={t('sfx.strength')} paramKey="p_vib_strength" min={0} max={1} value={params.p_vib_strength} locked={isLocked('p_vib_strength')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.speed')} paramKey="p_vib_speed" min={0} max={1} value={params.p_vib_speed} locked={isLocked('p_vib_speed')} onChange={onChange} onToggleLock={toggleLock} />
          </Section>

          {/* Arpeggio */}
          <Section title={t('sfx.arpeggio')}>
            <SliderRow label={t('sfx.mod')} paramKey="p_arp_mod" min={-1} max={1} value={params.p_arp_mod} locked={isLocked('p_arp_mod')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.speed')} paramKey="p_arp_speed" min={0} max={1} value={params.p_arp_speed} locked={isLocked('p_arp_speed')} onChange={onChange} onToggleLock={toggleLock} />
          </Section>

          {/* Pulse */}
          <Section title={t('sfx.pulseWidth')}>
            <SliderRow label={t('sfx.duty')} paramKey="p_duty" min={-1} max={1} value={params.p_duty} locked={isLocked('p_duty')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.dutyRamp')} paramKey="p_duty_ramp" min={-1} max={1} value={params.p_duty_ramp} locked={isLocked('p_duty_ramp')} onChange={onChange} onToggleLock={toggleLock} />
          </Section>

          {/* Phaser */}
          <Section title={t('sfx.phaser')}>
            <SliderRow label={t('sfx.offset')} paramKey="p_pha_offset" min={-1} max={1} value={params.p_pha_offset} locked={isLocked('p_pha_offset')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.ramp')} paramKey="p_pha_ramp" min={-1} max={1} value={params.p_pha_ramp} locked={isLocked('p_pha_ramp')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.repeat')} paramKey="p_repeat_speed" min={0} max={1} value={params.p_repeat_speed} locked={isLocked('p_repeat_speed')} onChange={onChange} onToggleLock={toggleLock} />
          </Section>

          {/* Filters */}
          <Section title={t('sfx.filters')}>
            <SliderRow label={t('sfx.lpfFreq')} paramKey="p_lpf_freq" min={0} max={1} value={params.p_lpf_freq} locked={isLocked('p_lpf_freq')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.lpfRamp')} paramKey="p_lpf_ramp" min={-1} max={1} value={params.p_lpf_ramp} locked={isLocked('p_lpf_ramp')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.lpfRes')} paramKey="p_lpf_resonance" min={0} max={1} value={params.p_lpf_resonance} locked={isLocked('p_lpf_resonance')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.hpfFreq')} paramKey="p_hpf_freq" min={0} max={1} value={params.p_hpf_freq} locked={isLocked('p_hpf_freq')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.hpfRamp')} paramKey="p_hpf_ramp" min={-1} max={1} value={params.p_hpf_ramp} locked={isLocked('p_hpf_ramp')} onChange={onChange} onToggleLock={toggleLock} />
          </Section>

          {/* FM */}
          <Section title={t('sfx.fmSynthesis')}>
            <SliderRow label={t('sfx.fmFreq')} paramKey="fm_freq" min={0} max={1} value={params.fm_freq} locked={isLocked('fm_freq')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.fmDepth')} paramKey="fm_depth" min={0} max={1} value={params.fm_depth} locked={isLocked('fm_depth')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.lfoRate')} paramKey="lfo_rate" min={0} max={1} value={params.lfo_rate} locked={isLocked('lfo_rate')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.lfoDepth')} paramKey="lfo_depth" min={0} max={1} value={params.lfo_depth} locked={isLocked('lfo_depth')} onChange={onChange} onToggleLock={toggleLock} />
          </Section>

          {/* Effects */}
          <Section title={t('sfx.effects')}>
            <SliderRow label={t('sfx.distortion')} paramKey="distortion" min={0} max={1} value={params.distortion} locked={isLocked('distortion')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.bitCrush')} paramKey="bit_crush" min={0} max={1} value={params.bit_crush} locked={isLocked('bit_crush')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.smpReduce')} paramKey="sample_reduction" min={0} max={1} value={params.sample_reduction} locked={isLocked('sample_reduction')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.chorusRate')} paramKey="chorus_rate" min={0} max={1} value={params.chorus_rate} locked={isLocked('chorus_rate')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.chorusDepth')} paramKey="chorus_depth" min={0} max={1} value={params.chorus_depth} locked={isLocked('chorus_depth')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.reverbSize')} paramKey="reverb_size" min={0} max={1} value={params.reverb_size} locked={isLocked('reverb_size')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.reverbDecay')} paramKey="reverb_decay" min={0} max={1} value={params.reverb_decay} locked={isLocked('reverb_decay')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.delayTime')} paramKey="delay_time" min={0} max={1} value={params.delay_time} locked={isLocked('delay_time')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.delayFb')} paramKey="delay_feedback" min={0} max={1} value={params.delay_feedback} locked={isLocked('delay_feedback')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.ringFreq')} paramKey="ring_mod_freq" min={0} max={1} value={params.ring_mod_freq} locked={isLocked('ring_mod_freq')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.ringDepth')} paramKey="ring_mod_depth" min={0} max={1} value={params.ring_mod_depth} locked={isLocked('ring_mod_depth')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.flangerRate')} paramKey="flanger_rate" min={0} max={1} value={params.flanger_rate} locked={isLocked('flanger_rate')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.flangerDepth')} paramKey="flanger_depth" min={0} max={1} value={params.flanger_depth} locked={isLocked('flanger_depth')} onChange={onChange} onToggleLock={toggleLock} />
            <SliderRow label={t('sfx.flangerDly')} paramKey="flanger_delay" min={0.1} max={1} value={params.flanger_delay} locked={isLocked('flanger_delay')} onChange={onChange} onToggleLock={toggleLock} />
          </Section>
        </div>

        {/* Right col: Visualisations */}
        <div
          className="flex flex-col gap-3 px-3 py-3"
          style={{ width: 200, borderLeft: '1px solid #1e2d40', flexShrink: 0 }}
        >
          <Section title={t('sfx.waveform')}>
            <WaveformCanvas buffer={buffer} width={176} height={72} />
          </Section>
          <Section title={t('sfx.spectrum')}>
            <SpectrumCanvas buffer={buffer} width={176} height={64} />
          </Section>
          <Section title={t('sfx.amplitude')}>
            <div className="flex justify-center">
              <AmplitudeMeter buffer={buffer} />
            </div>
          </Section>
        </div>
      </div>

      {/* ── Export bar ──────────────────────────────────────────────── */}
      <div className="px-4 py-2 shrink-0" style={{ borderTop: '1px solid #1e2d40' }}>
        <ExportBar />
      </div>
    </div>
  );
}
