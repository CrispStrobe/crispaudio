import { ToolButton } from '../common/ToolButton';
import { SpectrogramDisplay } from '../shared/SpectrogramDisplay';
import { AudioLines, Bot, Cpu, Radio, Orbit, Shield, Flame, Squirrel } from 'lucide-react';
import { isNativeMac } from '../../lib/nativeMenuPlatform';
// ---------------------------------------------------------------------------
// CrispAudio — VoicePanel
// Voice processor panel matching VoiceLab layout:
// Header → File drop → Presets → A/B → Actions → Visualizations → Tabbed params
// ---------------------------------------------------------------------------

import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { VoiceParameters } from './VoiceParameters';
import { useVoicePlayback } from '../../hooks/useVoicePlayback';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from 'react-i18next';
import { exportWav, downloadWavFile } from '../../lib/wavExport';
import { useAudioExport } from '../../hooks/useAudioExport';
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
import { VoiceWaveform, VoiceLevels } from './VoiceVisualizations';
import { haptic } from '../../lib/native';

const voiceEngine = new VoiceEngine();

// ---------------------------------------------------------------------------
// Preset config
// ---------------------------------------------------------------------------

const PRESET_NAMES: VoicePresetName[] = [
  'original', 'classicRobot', 'deepRobot', 'alien', 'cyborg',
  'radio', 'metallic', 'demon', 'chipmunk',
];

const PRESET_ICONS = {
  original: AudioLines, classicRobot: Bot, deepRobot: Cpu, alien: Orbit,
  cyborg: Shield, radio: Radio, metallic: AudioLines, demon: Flame, chipmunk: Squirrel,
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
        style={{ padding: '1rem', minHeight: 76 }}
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
  const { stage: exportStage, error: exportError, start: startExport, cancel: cancelExport } = useAudioExport();
  const { t } = useTranslation();
  const timelineTarget = useUIStore(s => s.voiceEffectsTargetSegmentId);
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
        setProcessedBuffer(null);
        useUIStore.setState({voiceEffectsTargetSegmentId:null});
      }
      setIsRecordProcessing(false);
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording, setSourceBuffer, setProcessedBuffer]);

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
    await startExport({
      key: [processedBuffer, processedBuffer.sampleRate, 16, fmt, kbps],
      stage: 'encoding',
      produce: async signal => {
        if (fmt === 'wav') return exportWav(data, processedBuffer.sampleRate, 16, signal);
        const { encodeMono } = await import('../../lib/codecs');
        signal.throwIfAborted();
        return encodeMono(data, processedBuffer.sampleRate, fmt, kbps, signal);
      },
      save: blob => downloadWavFile(blob, `crispaudio_voice_${Date.now()}.${fmt}`),
    });
  }

  const sendToTimeline = useCallback(() => {
    if (!processedBuffer) return;
    const data = processedBuffer.getChannelData(0);
    const peaks = computeWaveformPeaks(data, 256);
    const source = {
      id: crypto.randomUUID(),
      name: `Voice - ${new Date().toLocaleTimeString()}`,
      buffer: processedBuffer,
      peaks,
      duration: processedBuffer.duration,
      sampleRate: processedBuffer.sampleRate,
      channels: processedBuffer.numberOfChannels,
    };
    const target = useUIStore.getState().voiceEffectsTargetSegmentId;
    const project = useProjectStore.getState();
    if (target && project.project.tracks.some(track => track.segments.some(clip => clip.id === target))) {
      project.replaceSegmentSource(target, source);
    } else project.importAudioSource(source);
    useUIStore.setState({ voiceEffectsTargetSegmentId: null, activePanel: 'timeline' });
  }, [processedBuffer]);

  // Keyboard shortcuts
  useEffect(() => {
    const presetKeys: Record<string, VoicePresetName> = {
      '1': 'original', '2': 'classicRobot', '3': 'deepRobot', '4': 'alien',
      '5': 'cyborg', '6': 'radio', '7': 'metallic', '8': 'demon', '9': 'chipmunk',
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if(isNativeMac()&&e.metaKey&&e.key.toLowerCase()==='z')return;
      const key = e.key.toLowerCase();

      // Ctrl+Z / Ctrl+Shift+Z for undo/redo
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) { handleRedo(); } else { handleUndo(); }
        return;
      }

      if(e.ctrlKey||e.metaKey||e.altKey)return;
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


  const analysisBuffer = processedBuffer ?? sourceBuffer;
  const analysisSamples = useMemo(() => analysisBuffer?.getChannelData(0) ?? null, [analysisBuffer]);

  return (
    <div className="voice-editor h-full overflow-y-auto panel-enter" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-7xl mx-auto p-3 sm:p-6">

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="mb-4">
          <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-green-400 via-blue-400 to-purple-400 bg-clip-text text-transparent mb-2 gradient-title-voice">
            {t('panels.voice')}
          </h1>
          <p className="text-gray-400 text-sm sm:text-base">{t('voice.subtitle')}</p>
        </div>

        {/* ── File Drop Zone + Record ─────────────────────────────── */}
        <div className="card mb-4">
          {timelineTarget && <p className="text-sm text-violet-300 mb-3">{t('editing.voiceTarget')}</p>}
          <FileDropZone onFile={buffer => { setSourceBuffer(buffer); setProcessedBuffer(null); useUIStore.setState({voiceEffectsTargetSegmentId:null}); }} />
          <div className="flex items-center gap-3 mt-2">
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

        <section className="mb-4" aria-label={t('voice.presets')}>
          <h2 className="text-sm font-semibold text-gray-300 mb-2">{t('voice.presets')}</h2>
          <div className="sfx-preset-grid">
            {PRESET_NAMES.map(name => {
              const Icon = PRESET_ICONS[name];
              return <button key={name} className="sfx-preset" aria-label={t(`voice.preset_${name}`)}
                aria-pressed={selectedPreset === name} title={t(`voice.preset_${name}`)}
                onClick={() => { loadPreset(name); haptic('selection'); }}>
                <Icon size={22} aria-hidden="true"/><span>{t(`voice.preset_${name}`)}</span>
                <kbd aria-hidden="true">{PRESET_SHORTCUTS[name]}</kbd>
              </button>;
            })}
          </div>
        </section>

        {/* ── A/B Controls ────────────────────────────────────────── */}
        <div className="card mb-4">
          <div className="flex flex-col sm:flex-row flex-wrap items-center gap-3 sm:gap-4">
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

        <div className="sfx-actions flex flex-wrap items-center gap-2 mb-4">
          <ToolButton icon={isPlaying ? Square : Play} label={isPlaying ? t('voice.stopSource') : t('voice.playSource')}
            onClick={isPlaying ? handleStop : () => handlePlay(sourceBuffer, 'source')} disabled={!sourceBuffer}/>
          <ToolButton icon={isPlaying ? Square : Play} label={isPlaying ? t('voice.stopProcessed') : t('voice.playProcessed')}
            onClick={isPlaying ? handleStop : () => handlePlay(processedBuffer, 'processed')} disabled={!processedBuffer}
            className="!bg-indigo-600 !border-indigo-500 !text-white"/>
          <ToolButton icon={Shuffle} label={t(isProcessing ? 'voice.processing' : 'voice.process')}
            onClick={handleProcess} disabled={!sourceBuffer || isProcessing}/>
          <ToolButton icon={Undo2} label={t('common.undo')} onClick={handleUndo}/>
          <ToolButton icon={Redo2} label={t('common.redo')} onClick={handleRedo}/>
          <ToolButton icon={Download} label={t('voice.export')} onClick={downloadProcessed} disabled={!processedBuffer || exportStage !== null}/>
          <ToolButton icon={SendHorizontal} label={t(timelineTarget ? 'editing.returnVoice' : 'voice.sendToTimeline')}
            onClick={sendToTimeline} disabled={!processedBuffer}/>
          {isProcessing && <span role="status" className="text-sm text-gray-300">{t('voice.processing')}</span>}
          {exportStage && <><span role="status" className="text-sm text-gray-300">{t(`audioExport.${exportStage}`)}</span><button onClick={cancelExport} className="timeline-tool">{t('audioExport.cancel')}</button></>}
          {exportError != null && <span role="alert" className="text-sm text-red-400">{t('audioExport.failed')}</span>}
        </div>

        {/* ── Visualizations ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="card">
            <VoiceWaveform buffer={sourceBuffer} color="#3b82f6" title={t('voice.originalWaveform')} isPlaying={isPlaying && playingBuffer === 'source'} duration={sourceBuffer?.duration} />
          </div>
          <div className="card">
            <VoiceWaveform buffer={processedBuffer} color="#a855f7" title={t('voice.processedWaveform')} isPlaying={isPlaying && playingBuffer === 'processed'} duration={processedBuffer?.duration} />
          </div>
        </div>
        <section className="card mb-4">
          <SpectrogramDisplay buffer={analysisSamples} sampleRate={analysisBuffer?.sampleRate ?? 44100}
            title={t(processedBuffer ? 'analysis.processedSpectrogram' : 'analysis.sourceSpectrogram')}/>
          <p className="text-xs text-gray-400 mt-1">{t('analysis.firstChannel')}</p>
        </section>
        <details className="mb-4">
          <summary className="text-sm text-gray-300 cursor-pointer py-2">{t('sfx.analysisDetails')}</summary>
          <div className="card"><VoiceLevels buffer={analysisBuffer}/></div>
        </details>

        <VoiceParameters />

      </div>
    </div>
  );
}
