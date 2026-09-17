// ---------------------------------------------------------------------------
// CrispAudio — VoicePanel
// Voice processor panel matching VoiceLab layout:
// Header → File drop → Presets → A/B → Actions → Visualizations → Tabbed params
// ---------------------------------------------------------------------------

import { useCallback, useRef, useState, useEffect } from 'react';
import { VoiceParameters } from './VoiceParameters';
import { useVoicePlayback } from '../../hooks/useVoicePlayback';
import { useShallow } from 'zustand/react/shallow';
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
  Undo2,
  Redo2,
  SendHorizontal,
} from 'lucide-react';
import { useVoiceStore } from '../../stores/voiceStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { computeWaveformPeaks } from '../../audio/utils/audioBufferUtils';
import { useMediaRecorder } from '../../hooks/useMediaRecorder';
import { VoiceEngine } from '../../audio/engine/VoiceEngine';
import type { VoicePresetName } from '../../types/voicelab';
import { VoiceWaveform, VoiceSpectrum, VoiceLevels } from './VoiceVisualizations';
import { haptic } from '../../lib/native';

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
      let decoded: AudioBuffer;
      try {
        // decodeAudioData detaches its input, so hand it a copy and keep the
        // original bytes for the glint fallback below.
        decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
      } catch {
        // Formats the platform can't decode natively (e.g. Ogg-Opus in iOS
        // WKWebView) — fall back to glint's decoder.
        const { decodeCompressedToBuffer } = await import('../../lib/codecs');
        decoded = await decodeCompressedToBuffer(ctx, new Uint8Array(arrayBuf));
      }
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
        role="button"
        tabIndex={0}
        aria-label={t('voice.loadAudioFile')}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) loadFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
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
          accept="audio/*,.m4a,.mp3,.wav,.aac,.flac,.opus,.ogg"
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
  const settings = useVoiceStore((s) => s.activeSlot === 'A' ? s.settingsA : s.settingsB);
  const { activeSlot, morphAmount, sourceBuffer, processedBuffer, isProcessing, selectedPreset, setSourceBuffer, loadPreset, setIsProcessing, setProcessedBuffer, setActiveSlot, setMorphAmount, swapSlots, getEffectiveSettings } = useVoiceStore(useShallow((s) => ({
    activeSlot: s.activeSlot,
    morphAmount: s.morphAmount,
    sourceBuffer: s.sourceBuffer,
    processedBuffer: s.processedBuffer,
    isProcessing: s.isProcessing,
    selectedPreset: s.selectedPreset,
    setSourceBuffer: s.setSourceBuffer,
    loadPreset: s.loadPreset,
    setIsProcessing: s.setIsProcessing,
    setProcessedBuffer: s.setProcessedBuffer,
    setActiveSlot: s.setActiveSlot,
    setMorphAmount: s.setMorphAmount,
    swapSlots: s.swapSlots,
    getEffectiveSettings: s.getEffectiveSettings,
  })));
  const { isPlaying, playingBuffer, handlePlay, handleStop } = useVoicePlayback();

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

  // Staleness counter to discard results from outdated processAudio calls
  const processGenRef = useRef(0);

  const handleProcess = useCallback(async () => {
    if (!sourceBuffer) return;
    const gen = ++processGenRef.current;
    setIsProcessing(true);
    try {
      const effectiveSettings = getEffectiveSettings();
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
  }, [sourceBuffer, getEffectiveSettings, setIsProcessing, setProcessedBuffer]);

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
    const { defaultExportFormat: fmt, defaultBitrateKbps: kbps } =
      useSettingsStore.getState();
    let blob: Blob;
    if (fmt === 'wav') {
      blob = await exportWav(data, processedBuffer.sampleRate, 16);
    } else {
      const { encodeMono } = await import('../../lib/codecs');
      blob = await encodeMono(data, processedBuffer.sampleRate, fmt, kbps);
    }
    await downloadWavFile(blob, `crispaudio_voice_${Date.now()}.${fmt}`);
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
                onClick={() => {
                  loadPreset(name);
                  haptic('selection');
                }}
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
                aria-label={t('voice.morph')}
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
            <VoiceWaveform buffer={sourceBuffer} color="#3b82f6" title={t('voice.originalWaveform')} isPlaying={isPlaying && playingBuffer === 'source'} duration={sourceBuffer?.duration} />
          </div>
          <div className="card">
            <VoiceWaveform buffer={processedBuffer} color="#a855f7" title={t('voice.processedWaveform')} isPlaying={isPlaying && playingBuffer === 'processed'} duration={processedBuffer?.duration} />
          </div>
          <div className="card">
            <VoiceSpectrum buffer={processedBuffer ?? sourceBuffer} />
          </div>
          <div className="card">
            <VoiceLevels buffer={processedBuffer ?? sourceBuffer} />
          </div>
        </div>

        <VoiceParameters />

      </div>
    </div>
  );
}
