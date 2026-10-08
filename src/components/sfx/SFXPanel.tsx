import { CollapsibleSection } from '../shared/CollapsibleSection';
import { SpectrumDisplay } from '../shared/SpectrumDisplay';
import { ToolButton } from '../common/ToolButton';
import { Coins, Crosshair, Flame, TrendingUp, HeartCrack, ArrowUp, Wind, MousePointer2, Waves, Radio, MousePointerClick, ScanLine, Orbit, TriangleAlert } from 'lucide-react';
import { isNativeMac } from '../../lib/nativeMenuPlatform';
// ---------------------------------------------------------------------------
// CrispAudio — SFXPanel
// SFX synthesizer panel matching CrispFXR-web layout:
// Header → Master/A-B → Play/Export → Visualizations → Envelope →
// Presets → Audio Quality → Tabbed Parameters
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SfxParameters } from './SfxParameters';
import { useSfxPlayback } from '../../hooks/useSfxPlayback';
import { exportWav, downloadWavFile } from '../../lib/wavExport';
import { useAudioExport } from '../../hooks/useAudioExport';
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
import { SpectrogramDisplay } from '../shared/SpectrogramDisplay';
import { AmplitudeDisplay } from '../shared/AmplitudeDisplay';
import { EnvelopeDisplay, ADSRDisplay } from '../shared/EnvelopeDisplay';
import { haptic } from '../../lib/native';

// ---------------------------------------------------------------------------
// Preset visual config
// ---------------------------------------------------------------------------

const PRESET_ICONS = {
  pickupCoin:Coins,laserShoot:Crosshair,explosion:Flame,powerUp:TrendingUp,
  hitHurt:HeartCrack,jump:ArrowUp,ambient:Wind,random:Shuffle,blipSelect:MousePointer2,
  zapElectric:Zap,wooshWind:Waves,droneBuzz:Radio,clickUI:MousePointerClick,
  glitchDigital:ScanLine,portalWarp:Orbit,warningAlarm:TriangleAlert,
} satisfies Record<PresetName,typeof Zap>;

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
  const { stage: exportStage, error: exportError, start: startExport, cancel: cancelExport } = useAudioExport();
  const { t } = useTranslation();
  const params = useSynthStore(useShallow((s) => {
    const p = selectActiveParams(s);
    return { sound_vol: p.sound_vol, p_env_attack: p.p_env_attack, p_env_sustain: p.p_env_sustain, p_env_decay: p.p_env_decay, p_env_punch: p.p_env_punch };
  }));
  const { activeSlot, morphAmount, buffer, bufferA, bufferB, sampleRate, bitDepth, isPlaying, setActiveSlot, setMorphAmount, swapSlots, copyToOther, generate, setParams, setIsPlaying, setExportSettings, mutateParams, exportParamsJSON, importParamsJSON, encodeShareLink, loadPreset: storeLoadPreset } = useSynthStore(useShallow((s) => ({
    activeSlot: s.activeSlot,
    morphAmount: s.morphAmount,
    buffer: s.buffer,
    bufferA: s.bufferA,
    bufferB: s.bufferB,
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

  const slotParams = useSynthStore(useShallow(s => [s.paramsA, s.paramsB] as const));
  // Also refresh after undo, morphing and sample-rate changes.
  useEffect(() => { generate(); }, [generate, slotParams, activeSlot, morphAmount, sampleRate]);

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
      if(isNativeMac()&&e.metaKey&&e.key.toLowerCase()==='z')return;
      const key = e.key.toLowerCase();

      // Ctrl+Z / Ctrl+Shift+Z for undo/redo
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) { handleRedo(); } else { handleUndo(); }
        generate();
        return;
      }

      if(e.ctrlKey||e.metaKey||e.altKey)return;
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
    await startExport({
      key: [buffer, sampleRate, bitDepth, fmt, kbps],
      stage: 'encoding',
      produce: async signal => {
        if (fmt === 'wav') return exportWav(buffer, sampleRate, bitDepth, signal);
        const { encodeMono } = await import('../../lib/codecs');
        signal.throwIfAborted();
        return encodeMono(buffer, sampleRate, fmt, kbps, signal);
      },
      save: blob => downloadWavFile(blob, `crispaudio_sfx_${Date.now()}.${fmt}`),
    });
  }, [buffer, sampleRate, bitDepth, startExport]);

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

  const outputStats=useMemo(()=>{
    if(!buffer?.length)return {peak:0,rms:0,duration:0};
    let peak=0,sum=0;for(const sample of buffer){peak=Math.max(peak,Math.abs(sample));sum+=sample*sample;}
    return {peak,rms:Math.sqrt(sum/buffer.length),duration:buffer.length/sampleRate};
  },[buffer,sampleRate]);
  const isClipping=outputStats.peak>.95;

  return (
    <div className="sfx-editor h-full overflow-y-auto panel-enter" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-7xl mx-auto p-3 sm:p-6">

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="sfx-header mb-4">
          <h1 className="text-xl font-semibold text-gray-100 mb-1">
            {t('panels.sfx')}
          </h1>
          <p className="text-gray-400 text-sm">{t('sfx.subtitle')}</p>
          {/* Master Controls — stack vertically on phones, row on larger */}
          <div className="sfx-master flex flex-wrap items-center gap-3 mt-3 mb-3">
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
                aria-pressed={activeSlot==='A'} onClick={() => { setActiveSlot('A'); generate(); }}
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
                aria-pressed={activeSlot==='B'} onClick={() => { setActiveSlot('B'); generate(); }}
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

          <div className="sfx-actions flex flex-wrap items-center gap-2">
            <ToolButton icon={isPlaying?Square:Play} label={isPlaying?t('sfx.stop'):`${t('sfx.play')} ${activeSlot}`} disabled={!buffer} onClick={isPlaying?handleStop:handlePlay} className="!bg-indigo-600 !border-indigo-500 !text-white"/>
            <ToolButton icon={Repeat} label={t(isLooping?'sfx.stopLoop':'sfx.loop')} aria-pressed={isLooping} onClick={toggleLoop}/>
            <ToolButton icon={RefreshCw} label={t('sfx.randomise')} onClick={handleRandomise}/>
            <ToolButton icon={Shuffle} label={t('sfx.mutate')} onClick={handleMutate}/>
            <ToolButton icon={Undo2} label={t('timeline.undo')} onClick={handleUndo}/>
            <ToolButton icon={Redo2} label={t('timeline.redo')} onClick={handleRedo}/>
            <span className="w-px h-6 bg-gray-700 mx-1"/>
            <ToolButton icon={Download} label={t('sfx.exportSlot',{slot:activeSlot})} onClick={downloadWav} disabled={!buffer||exportStage!==null}/>
            <ToolButton icon={SendHorizontal} label={t('sfx.sendToTimeline')} onClick={sendToTimeline} disabled={!buffer}/>
            {exportStage&&<><span role="status" className="text-sm text-gray-300">{t(`audioExport.${exportStage}`)}</span><button className="timeline-tool" onClick={cancelExport}>{t('audioExport.cancel')}</button></>}
            {exportError!=null&&<span role="alert" className="text-sm text-red-400">{t('audioExport.failed')}</span>}
          </div>
        </div>

        <CollapsibleSection title={t('sfx.soundPresets')} defaultOpen className="sfx-presets">
          <div className="sfx-preset-grid">
            {ALL_PRESET_NAMES.map(name=>{
              const Icon=PRESET_ICONS[name];
              return <button key={name} type="button" onClick={()=>handlePreset(name)} className="sfx-preset" title={t(PRESET_LABEL_KEYS[name])}>
                <Icon size={22} aria-hidden="true"/>
                <span>{t(PRESET_LABEL_KEYS[name])}</span>
                {PRESET_SHORTCUTS[name]&&<kbd aria-hidden="true">{PRESET_SHORTCUTS[name]}</kbd>}
              </button>;
            })}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title={t('analysis.waveforms')} defaultOpen>
        <div className="sfx-output grid grid-cols-2 gap-3 mb-4">
          {(['A', 'B'] as const).map(slot => {
            const samples = slot === 'A' ? bufferA : bufferB;
            return <section className="card min-w-0" key={slot}>
              <SfxWaveform buffer={samples} isPlaying={isPlaying && buffer === samples}
                title={t(slot === 'A' ? 'sfx.waveformA' : 'sfx.waveformB')}
                duration={(samples?.length ?? 0) / sampleRate} noSignalText={t('sfx.noSignal')}/>
            </section>;
          })}
        </div>
        </CollapsibleSection>
        <CollapsibleSection title={t('sfx.frequencySpectrum')}>
          <SpectrumDisplay buffer={buffer} sampleRate={sampleRate}/>
          <p className="text-xs text-gray-400 mt-2">{t('analysis.spectrumHelp')}</p>
        </CollapsibleSection>
        <CollapsibleSection title={t('analysis.outputSpectrogram')}>
          <SpectrogramDisplay buffer={buffer} sampleRate={sampleRate} title={t('analysis.outputSpectrogram')}/>
            <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400 mt-3 tabular-nums">
              <div><dt className="inline">{t('sfx.outputDuration')} </dt><dd className="inline text-gray-200">{outputStats.duration.toFixed(2)} s</dd></div>
              <div><dt className="inline">{t('sfx.outputPeak')} </dt><dd className={`inline ${isClipping?'text-amber-300':'text-gray-200'}`}>{outputStats.peak>0?(20*Math.log10(outputStats.peak)).toFixed(1):'−∞'} dBFS</dd></div>
              <div><dt className="inline">RMS </dt><dd className="inline text-gray-200">{outputStats.rms>0?(20*Math.log10(outputStats.rms)).toFixed(1):'−∞'} dBFS</dd></div>
            </dl>
        </CollapsibleSection>
        <details className="sfx-analysis mb-4">
          <summary className="text-sm text-gray-300 cursor-pointer py-2">{t('sfx.analysisDetails')}</summary>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-2">
            <section className="card"><AmplitudeDisplay buffer={buffer} title={t('sfx.signalLevel')}/></section>
            <section className="card"><EnvelopeDisplay buffer={buffer} sampleRate={sampleRate} title={t('sfx.volumeEnvelope')}/></section>
            <section className="card"><ADSRDisplay attack={params.p_env_attack} sustain={params.p_env_sustain} decay={params.p_env_decay} punch={params.p_env_punch} title={t('sfx.adsrShape')}/></section>
          </div>
        </details>

        {/* Secondary file/quality tools stay available without crowding playback. */}
        <details className="card mb-4">
          <summary className="text-sm text-gray-300 cursor-pointer mb-2">{t('sfx.qualityDetails')}</summary>
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
                  aria-label={t('sfx.downloadWav')}
                  disabled={!buffer || exportStage !== null}
                  className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition-colors flex items-center gap-2 font-semibold text-sm text-white"
                >
                  <Download className="w-4 h-4" />
                  {t('sfx.downloadWav')}
                </button>
              </div>
            </div>
          </div>
        </details>

        <SfxParameters />

      </div>
    </div>
  );
}
