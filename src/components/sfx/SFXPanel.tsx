// ---------------------------------------------------------------------------
// CrispAudio — SFXPanel
// SFX synthesizer panel matching CrispFXR-web layout:
// Header → Master/A-B → Play/Export → Visualizations → Envelope →
// Presets → Audio Quality → Tabbed Parameters
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import { exportWav, downloadWavFile } from '../../lib/wavExport';
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
  SendHorizontal,
  Share2,
  FileJson,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useSynthStore, selectActiveParams } from '../../stores/synthStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { samplesToAudioBuffer, computeWaveformPeaks } from '../../audio/utils/audioBufferUtils';
import { type SynthParams, ALL_PRESET_NAMES, type PresetName } from '../../types/synth';
import * as sfxPresets from '../../audio/presets/sfxPresets';
import { canvasBgGradient, canvasGridColor, canvasEmptyColor } from '../../lib/themeColors';
import { SpectrumDisplay } from '../shared/SpectrumDisplay';
import { AmplitudeDisplay } from '../shared/AmplitudeDisplay';
import { EnvelopeDisplay, ADSRDisplay } from '../shared/EnvelopeDisplay';

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

function ParamInfoButton({ paramKey }: { paramKey: string }) {
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
  noSignalText = 'No signal',
}: {
  buffer: Float32Array | null;
  isPlaying?: boolean;
  title: string;
  duration?: number;
  noSignalText?: string;
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);

  const [zoomLevel, setZoomLevel] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, offset: 0 });

  const MAX_ZOOM = 16;

  // Clamp scroll offset within valid range for a given zoom
  const clampOffset = useCallback((offset: number, zoom: number) => {
    const viewSize = 1 / zoom;
    return Math.max(0, Math.min(offset, 1 - viewSize));
  }, []);

  // Handle zoom change (shared by wheel and buttons)
  const applyZoom = useCallback((newZoom: number, pivotNorm?: number) => {
    const clamped = Math.max(1, Math.min(MAX_ZOOM, newZoom));
    setZoomLevel((prevZoom) => {
      const pivot = pivotNorm ?? (scrollOffset + (1 / prevZoom) / 2);
      const newViewSize = 1 / clamped;
      const newOffset = clampOffset(pivot - newViewSize / 2, clamped);
      setScrollOffset(newOffset);
      return clamped;
    });
  }, [scrollOffset, clampOffset]);

  // Mouse wheel zoom (Ctrl or Shift held)
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!e.ctrlKey && !e.shiftKey) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const pivotX = (e.clientX - rect.left) / rect.width;
    const pivotNorm = scrollOffset + pivotX / zoomLevel;
    const factor = e.deltaY < 0 ? 1.25 : 0.8;
    applyZoom(zoomLevel * factor, pivotNorm);
  }, [zoomLevel, scrollOffset, applyZoom]);

  // Drag to pan
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (zoomLevel <= 1) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, offset: scrollOffset };
  }, [zoomLevel, scrollOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - dragStartRef.current.x) / rect.width;
    const newOffset = clampOffset(dragStartRef.current.offset - dx / zoomLevel, zoomLevel);
    setScrollOffset(newOffset);
  }, [isDragging, zoomLevel, clampOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Pointer wrappers so panning works with touch/pen as well as mouse.
  // Capture the pointer so a pan keeps tracking off-canvas.
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (zoomLevel <= 1) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    handleMouseDown(e);
  }, [zoomLevel, handleMouseDown]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    handleMouseUp();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, [handleMouseUp]);

  // Draw the static waveform (zoomed view)
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

    if (!buffer || buffer.length === 0) {
      ctx.fillStyle = canvasEmptyColor();
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(noSignalText, w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }

    // Calculate visible sample range
    const viewSize = 1 / zoomLevel;
    const startSample = Math.floor(scrollOffset * buffer.length);
    const endSample = Math.min(buffer.length, Math.ceil((scrollOffset + viewSize) * buffer.length));
    const visibleLength = endSample - startSample;

    if (isPlaying) {
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 10;
    }

    ctx.strokeStyle = isPlaying ? '#10b981' : '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const step = visibleLength / w;
    for (let i = 0; i < w; i++) {
      const idx = startSample + Math.floor(i * step);
      const sample = buffer[Math.min(idx, buffer.length - 1)] || 0;
      const y = (sample * h * 0.4) + (h / 2);
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [buffer, isPlaying, noSignalText, zoomLevel, scrollOffset]);

  // Draw minimap
  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas || zoomLevel <= 1) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    if (buffer && buffer.length > 0) {
      // Draw full waveform in minimap
      ctx.strokeStyle = '#4b5563';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const step = buffer.length / w;
      for (let i = 0; i < w; i++) {
        const sample = buffer[Math.floor(i * step)] || 0;
        const y = (sample * h * 0.4) + (h / 2);
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
      }
      ctx.stroke();

      // Draw visible region highlight
      const viewSize = 1 / zoomLevel;
      const rx = scrollOffset * w;
      const rw = viewSize * w;
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.fillRect(rx, 0, rw, h);
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.7)';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx, 0, rw, h);
    }
  }, [buffer, zoomLevel, scrollOffset]);

  // Animate playhead during playback
  useEffect(() => {
    const el = playheadRef.current;
    if (!el) return;

    if (isPlaying && duration && duration > 0) {
      startTimeRef.current = performance.now();

      const tick = () => {
        const elapsed = (performance.now() - startTimeRef.current) / 1000;
        const progress = Math.min(elapsed / duration, 1);
        // Convert global progress to zoomed view position
        const viewSize = 1 / zoomLevel;
        const viewProgress = (progress - scrollOffset) / viewSize;
        if (viewProgress >= 0 && viewProgress <= 1) {
          el.style.left = `${viewProgress * 100}%`;
          el.style.display = 'block';
        } else {
          el.style.display = 'none';
        }
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
  }, [isPlaying, duration, zoomLevel, scrollOffset]);

  const handleZoomIn = useCallback(() => {
    applyZoom(zoomLevel * 1.5);
  }, [zoomLevel, applyZoom]);

  const handleZoomOut = useCallback(() => {
    applyZoom(zoomLevel / 1.5);
  }, [zoomLevel, applyZoom]);

  const handleZoomReset = useCallback(() => {
    setZoomLevel(1);
    setScrollOffset(0);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <div className="flex items-center gap-1">
          {zoomLevel > 1 && (
            <button
              onClick={handleZoomReset}
              className="px-1.5 py-0.5 text-[10px] font-mono text-blue-300 bg-blue-900/40 rounded hover:bg-blue-800/60 transition-colors"
              title={t('sfx.zoomReset')}
            >
              {zoomLevel.toFixed(1)}x
            </button>
          )}
          <button
            onClick={handleZoomOut}
            disabled={zoomLevel <= 1}
            className="p-0.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-default transition-colors"
            title={t('sfx.zoomOut')}
            aria-label={t('sfx.zoomOut')}
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={handleZoomIn}
            disabled={zoomLevel >= MAX_ZOOM}
            className="p-0.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-default transition-colors"
            title={t('sfx.zoomIn')}
            aria-label={t('sfx.zoomIn')}
          >
            <ZoomIn size={14} />
          </button>
        </div>
      </div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={400}
          height={120}
          className={`w-full h-24 rounded border border-gray-700 ${zoomLevel > 1 ? 'cursor-grab' : ''} ${isDragging ? 'cursor-grabbing' : ''}`}
          style={{ touchAction: zoomLevel > 1 ? 'none' : 'auto' }}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handleMouseMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        <div
          ref={playheadRef}
          className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none"
          style={{ display: 'none', left: 0 }}
        />
      </div>
      {zoomLevel > 1 && (
        <canvas
          ref={minimapRef}
          width={400}
          height={16}
          className="w-full mt-1 rounded border border-gray-700/50"
          style={{ height: '16px' }}
        />
      )}
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
  const [importError, setImportError] = useState<string | null>(null);
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

  // Cleanup audio on unmount — stop playback, close context
  useEffect(() => {
    return () => {
      loopRef.current = false;
      try { sourceRef.current?.stop(); } catch { /* already stopped */ }
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      sourceRef.current = null;
      setIsPlaying(false);
    };
  }, [setIsPlaying]);

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
      setShareMsg(t('sfx.linkCopied'));
      setTimeout(() => setShareMsg(null), 2000);
    });
  }, [encodeShareLink, t]);

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
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (typeof reader.result !== 'string') {
          throw new Error('empty');
        }
        const data = JSON.parse(reader.result);
        if (!data?.params || typeof data.params !== 'object') {
          throw new Error('schema');
        }
        importParamsJSON(reader.result);
        generate();
      } catch {
        setImportError(t('common.importError'));
        setTimeout(() => setImportError(null), 3000);
      }
    };
    reader.onerror = () => {
      setImportError(t('common.importError'));
      setTimeout(() => setImportError(null), 3000);
    };
    reader.readAsText(file);
  }, [importParamsJSON, generate, t]);

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
        setActiveSlot('A'); generate();
      } else if (key === 'b') {
        setActiveSlot('B'); generate();
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
  const downloadWav = useCallback(async () => {
    if (!buffer) return;
    const { defaultExportFormat: fmt, defaultBitrateKbps: kbps } =
      useSettingsStore.getState();
    let blob: Blob;
    if (fmt === 'wav') {
      blob = await exportWav(buffer, sampleRate, bitDepth);
    } else {
      const { encodeMono } = await import('../../lib/codecs');
      blob = await encodeMono(buffer, sampleRate, fmt, kbps);
    }
    await downloadWavFile(blob, `crispaudio_sfx_${Date.now()}.${fmt}`);
  }, [buffer, sampleRate, bitDepth]);

  // Send to Timeline
  const sendToTimeline = useCallback(() => {
    if (!buffer) return;
    const ctx = audioCtxRef.current ?? new AudioContext({ sampleRate });
    if (!audioCtxRef.current) audioCtxRef.current = ctx;
    const audioBuffer = samplesToAudioBuffer(buffer, sampleRate, ctx);
    const peaks = computeWaveformPeaks(buffer, 256);
    useProjectStore.getState().importAudioSource({
      id: crypto.randomUUID(),
      name: `SFX - ${new Date().toLocaleTimeString()}`,
      buffer: audioBuffer,
      peaks,
      duration: buffer.length / sampleRate,
      sampleRate,
      channels: 1,
    });
    useUIStore.getState().setActivePanel('timeline');
  }, [buffer, sampleRate]);

  // Clipping indicator
  const isClipping = buffer ? (() => {
    for (let i = 0; i < buffer.length; i++) {
      if (Math.abs(buffer[i]) > 0.95) return true;
    }
    return false;
  })() : false;

  return (
    <div className="h-full overflow-y-auto panel-enter" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-7xl mx-auto p-3 sm:p-6">

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2 gradient-title">
            {t('panels.sfx')}
          </h1>
          <p className="text-gray-400 text-sm sm:text-base">{t('sfx.subtitle')}</p>
          {/* Keyboard shortcuts hint is irrelevant on touch/small screens */}
          <p className="hidden sm:block text-gray-500 text-xs mt-2">
            {t('sfx.shortcuts')}
          </p>

          {/* Master Controls — stack vertically on phones, row on larger */}
          <div className="flex flex-col sm:flex-row flex-wrap justify-center items-center gap-3 sm:gap-6 mt-4 sm:mt-6 mb-4">
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
                onClick={() => { setActiveSlot('A'); generate(); }}
                className={`px-4 py-2 rounded-lg transition-colors font-semibold text-sm ${
                  activeSlot === 'A' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {t('sfx.slotA')}
              </button>
              <button
                onClick={() => { copyToOther(); generate(); }}
                className="btn-surface p-2 rounded-lg"
                title={t('sfx.copyToOther')}
              aria-label={t('sfx.copyToOther')}
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={() => { swapSlots(); generate(); }}
                className="p-2 rounded-lg transition-colors bg-purple-600 hover:bg-purple-500 text-white"
                title={t('sfx.swapSlots')}
              aria-label={t('sfx.swapSlots')}
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setActiveSlot('B'); generate(); }}
                className={`px-4 py-2 rounded-lg transition-colors font-semibold text-sm ${
                  activeSlot === 'B' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {t('sfx.slotB')}
              </button>
            </div>

            {/* Morph */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{t('sfx.morph')}</span>
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
              aria-label="Undo"
            >
              <Undo2 className="w-5 h-5" />
            </button>

            <button
              onClick={handleRedo}
              className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-2 font-semibold text-white"
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo"
            >
              <Redo2 className="w-5 h-5" />
            </button>

            <button
              onClick={downloadWav}
              disabled={!buffer}
              className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition-colors flex items-center gap-2 font-semibold text-white"
            >
              <Download className="w-5 h-5" />
              {t('sfx.exportSlot', { slot: activeSlot })}
            </button>

            <button
              onClick={sendToTimeline}
              disabled={!buffer}
              className="px-5 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition-colors flex items-center gap-2 font-semibold text-white"
              aria-label={t('sfx.sendToTimeline')}
            >
              <SendHorizontal className="w-5 h-5" />
              {t('sfx.sendToTimeline')}
            </button>
          </div>
        </div>

        {/* ── Visualizations ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <div className="card relative group">
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <ParamInfoButton paramKey="waveform" />
            </div>
            <WaveformCanvas buffer={buffer} isPlaying={isPlaying && activeSlot === 'A'} title={t('sfx.waveformA')} duration={buffer ? buffer.length / sampleRate : 0} noSignalText={t('sfx.noSignal')} />
          </div>
          <div className="card relative group">
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <ParamInfoButton paramKey="waveform" />
            </div>
            <WaveformCanvas buffer={buffer} isPlaying={isPlaying && activeSlot === 'B'} title={t('sfx.waveformB')} duration={buffer ? buffer.length / sampleRate : 0} noSignalText={t('sfx.noSignal')} />
          </div>
          <div className="card relative group">
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <ParamInfoButton paramKey="spectrum" />
            </div>
            <SpectrumDisplay buffer={buffer} title={t('sfx.frequencySpectrum')} />
          </div>
          <div className="card relative group">
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <ParamInfoButton paramKey="amplitude" />
            </div>
            <AmplitudeDisplay buffer={buffer} title={t('sfx.signalLevel')} />
          </div>
        </div>

        {/* ── Envelope ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="card relative group">
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <ParamInfoButton paramKey="envelope" />
            </div>
            <EnvelopeDisplay buffer={buffer} sampleRate={sampleRate} title={t('sfx.volumeEnvelope')} />
          </div>
          <div className="card relative group">
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <ParamInfoButton paramKey="envelope" />
            </div>
            <ADSRDisplay
              attack={params.p_env_attack}
              sustain={params.p_env_sustain}
              decay={params.p_env_decay}
              punch={params.p_env_punch}
              title={t('sfx.adsrShape')}
            />
          </div>
        </div>

        {/* ── Presets ─────────────────────────────────────────────── */}
        <div className="card mb-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
            <Zap className="w-5 h-5" />
            {t('sfx.soundPresets')}
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
              <h3 className="text-base font-semibold mb-3 text-white">{t('sfx.audioQuality')}</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-2 block">{t('sfx.sampleRate')}</label>
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
                  <label className="text-xs font-medium text-gray-400 mb-2 block">{t('sfx.bitDepth')}</label>
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
                  <span className="text-xs text-gray-400">{t('sfx.clipped')}</span>
                  <div className={`w-3 h-3 rounded ${isClipping ? 'bg-red-500' : 'bg-gray-600'}`} />
                  <span className="text-xs text-gray-500">{isClipping ? t('sfx.clippedYes') : t('sfx.clippedNo')}</span>
                </div>
              </div>
            </div>

            {/* Share & Presets */}
            <div>
              <h3 className="text-base font-semibold mb-3 text-white">{t('sfx.shareAndPresets')}</h3>
              <div className="space-y-2">
                <button
                  onClick={handleShareLink}
                  className="w-full px-3 py-2 bg-green-600 hover:bg-green-500 rounded-lg transition-colors flex items-center gap-2 font-semibold text-sm text-white"
                >
                  <Share2 className="w-4 h-4" />
                  {shareMsg ?? t('sfx.shareLink')}
                </button>
                <button
                  onClick={handleExportJSON}
                  className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 font-semibold text-sm text-white"
                >
                  <FileJson className="w-4 h-4" />
                  {t('sfx.exportPreset')}
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
                    {t('sfx.importPreset')}
                  </button>
                </div>
                {importError && (
                  <div className="px-3 py-2 rounded-lg bg-red-950/50 border border-red-800 text-sm text-red-400">
                    {importError}
                  </div>
                )}
              </div>
            </div>

            {/* Export */}
            <div>
              <h3 className="text-base font-semibold mb-3 text-white">{t('sfx.export')}</h3>
              <div className="space-y-2">
                <button
                  onClick={downloadWav}
                  disabled={!buffer}
                  className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition-colors flex items-center gap-2 font-semibold text-sm text-white"
                >
                  <Download className="w-4 h-4" />
                  {t('sfx.downloadWav')}
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

      </div>
    </div>
  );
}
