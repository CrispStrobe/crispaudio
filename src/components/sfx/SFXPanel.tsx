// ---------------------------------------------------------------------------
// CrispAudio — SFXPanel
// SFX synthesizer panel matching CrispFXR-web layout:
// Header → Master/A-B → Play/Export → Visualizations → Envelope →
// Presets → Audio Quality → Tabbed Parameters
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SfxParameters, ParamInfoButton } from './SfxParameters';
import { useSfxPlayback } from '../../hooks/useSfxPlayback';
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
  Zap,
  Headphones,
  Repeat,
  Shuffle,
  Undo2,
  Redo2,
  SendHorizontal,
  Share2,
  FileJson,
} from 'lucide-react';
import { useSynthStore, selectActiveParams } from '../../stores/synthStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { samplesToAudioBuffer, computeWaveformPeaks } from '../../audio/utils/audioBufferUtils';
import { type SynthParams, ALL_PRESET_NAMES, type PresetName } from '../../types/synth';
import * as sfxPresets from '../../audio/presets/sfxPresets';
import { SfxWaveform } from './SfxWaveform';
import { SpectrumDisplay } from '../shared/SpectrumDisplay';
import { AmplitudeDisplay } from '../shared/AmplitudeDisplay';
import { EnvelopeDisplay, ADSRDisplay } from '../shared/EnvelopeDisplay';
import { haptic } from '../../lib/native';

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

// ---------------------------------------------------------------------------
// Main SFXPanel
// ---------------------------------------------------------------------------

export function SFXPanel() {
  const { t } = useTranslation();
  const params = useSynthStore(useShallow((s) => {
    const p = selectActiveParams(s);
    return { sound_vol: p.sound_vol, p_env_attack: p.p_env_attack, p_env_sustain: p.p_env_sustain, p_env_decay: p.p_env_decay, p_env_punch: p.p_env_punch };
  }));
  const { activeSlot, morphAmount, buffer, sampleRate, bitDepth, isPlaying, setActiveSlot, setMorphAmount, swapSlots, copyToOther, generate, setParams, setIsPlaying, setExportSettings, mutateParams, exportParamsJSON, importParamsJSON, encodeShareLink, loadPreset: storeLoadPreset } = useSynthStore(useShallow((s) => ({
    activeSlot: s.activeSlot,
    morphAmount: s.morphAmount,
    buffer: s.buffer,
    sampleRate: s.sampleRate,
    bitDepth: s.bitDepth,
    isPlaying: s.isPlaying,
    setActiveSlot: s.setActiveSlot,
    setMorphAmount: s.setMorphAmount,
    swapSlots: s.swapSlots,
    copyToOther: s.copyToOther,
    generate: s.generate,
    setParams: s.setParams,
    setIsPlaying: s.setIsPlaying,
    setExportSettings: s.setExportSettings,
    mutateParams: s.mutateParams,
    exportParamsJSON: s.exportParamsJSON,
    importParamsJSON: s.importParamsJSON,
    encodeShareLink: s.encodeShareLink,
    loadPreset: s.loadPreset,
  })));

  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Undo / Redo
  const handleUndo = useCallback(() => useSynthStore.temporal.getState().undo(), []);
  const handleRedo = useCallback(() => useSynthStore.temporal.getState().redo(), []);

  const { audioCtxRef, isLooping, handlePlay, handleStop, toggleLoop } = useSfxPlayback(buffer, sampleRate, isPlaying, setIsPlaying);

  const handleRandomise = useCallback(() => {
    const fn = sfxPresets['random' as keyof typeof sfxPresets] as (() => SynthParams) | undefined;
    if (fn) setParams(fn());
    generate();
    haptic('medium');
  }, [setParams, generate]);

  const handleMutate = useCallback(() => {
    mutateParams();
    generate();
    haptic('light');
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
    // Not an <a download>: iOS ignores it. This goes through the native save
    // dialog / share sheet like the audio exports.
    downloadWavFile(blob, `crispaudio_sfx_preset_${Date.now()}.json`);
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
      haptic('selection');
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
  }, [buffer, sampleRate, audioCtxRef]);

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
                aria-label={t('sfx.masterVolume')}
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
                aria-label={t('sfx.morph')}
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
            <SfxWaveform buffer={buffer} isPlaying={isPlaying && activeSlot === 'A'} title={t('sfx.waveformA')} duration={buffer ? buffer.length / sampleRate : 0} noSignalText={t('sfx.noSignal')} />
          </div>
          <div className="card relative group">
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <ParamInfoButton paramKey="waveform" />
            </div>
            <SfxWaveform buffer={buffer} isPlaying={isPlaying && activeSlot === 'B'} title={t('sfx.waveformB')} duration={buffer ? buffer.length / sampleRate : 0} noSignalText={t('sfx.noSignal')} />
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

        <SfxParameters />

      </div>
    </div>
  );
}
