// ---------------------------------------------------------------------------
// CrispAudio — VoiceEffectsModal
// Apply voice processing effects to a timeline segment.
// ---------------------------------------------------------------------------

import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Square } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useUIStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import type { VoiceSettings, VoicePresetName } from '../../types/voicelab';
import { VoiceEngine } from '../../audio/engine/VoiceEngine';
import * as voicePresets from '../../audio/presets/voicePresets';
import { computeWaveformPeaks } from '../../audio/utils/audioBufferUtils';

const voiceEngine = new VoiceEngine();

const PRESET_NAMES: VoicePresetName[] = [
  'original', 'classicRobot', 'deepRobot', 'alien', 'cyborg',
  'radio', 'metallic', 'demon', 'chipmunk',
];

interface ParamDef {
  key: keyof VoiceSettings;
  label: string;
  min: number;
  max: number;
  step: number;
}

const PARAMS: ParamDef[] = [
  { key: 'pitchShift', label: 'Pitch Shift', min: -24, max: 24, step: 1 },
  { key: 'formantShift', label: 'Formant Shift', min: -1, max: 1, step: 0.05 },
  { key: 'speedChange', label: 'Speed', min: 0.5, max: 2, step: 0.05 },
  { key: 'vocoderMix', label: 'Vocoder Mix', min: 0, max: 1, step: 0.01 },
  { key: 'ringModMix', label: 'Ring Mod Mix', min: 0, max: 1, step: 0.01 },
  { key: 'ringModFreq', label: 'Ring Mod Freq', min: 1, max: 500, step: 1 },
  { key: 'reverbMix', label: 'Reverb Mix', min: 0, max: 1, step: 0.01 },
  { key: 'reverbSize', label: 'Reverb Size', min: 0, max: 1, step: 0.01 },
  { key: 'delayMix', label: 'Delay Mix', min: 0, max: 1, step: 0.01 },
  { key: 'delayTime', label: 'Delay Time', min: 0, max: 1, step: 0.01 },
  { key: 'chorusMix', label: 'Chorus Mix', min: 0, max: 1, step: 0.01 },
  { key: 'distortionMix', label: 'Distortion Mix', min: 0, max: 1, step: 0.01 },
  { key: 'distortionDrive', label: 'Distortion Drive', min: 0, max: 1, step: 0.01 },
  { key: 'bitCrushMix', label: 'Bit Crush Mix', min: 0, max: 1, step: 0.01 },
  { key: 'bitCrushBits', label: 'Bit Crush Bits', min: 1, max: 16, step: 1 },
  { key: 'lowpassFreq', label: 'Lowpass Freq', min: 200, max: 22000, step: 100 },
  { key: 'highpassFreq', label: 'Highpass Freq', min: 0, max: 5000, step: 50 },
  { key: 'masterGain', label: 'Master Gain', min: 0, max: 2, step: 0.01 },
];

export function VoiceEffectsModal() {
  const { t } = useTranslation();
  const segmentId = useUIStore((s) => s.voiceEffectsTargetSegmentId);
  const closeModal = useUIStore((s) => s.closeModal);

  const [settings, setSettings] = useState<VoiceSettings>(voicePresets.original());
  const [selectedPreset, setSelectedPreset] = useState<VoicePresetName>('original');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const previewBufferRef = useRef<AudioBuffer | null>(null);

  const getSegmentBuffer = useCallback((): AudioBuffer | null => {
    if (!segmentId) return null;
    const store = useProjectStore.getState();
    const segment = store.project.tracks
      .flatMap((t) => t.segments)
      .find((s) => s.id === segmentId);
    if (!segment) return null;
    const source = store.sources.get(segment.sourceId);
    if (!source) return null;

    // Extract the segment's portion of the source buffer
    const sr = source.buffer.sampleRate;
    const startSample = Math.floor(segment.sourceOffset * sr);
    const numSamples = Math.floor(segment.duration * sr);
    const channels = source.buffer.numberOfChannels;

    const ctx = audioCtxRef.current ?? new AudioContext();
    if (!audioCtxRef.current) audioCtxRef.current = ctx;

    const extracted = ctx.createBuffer(channels, numSamples, sr);
    for (let ch = 0; ch < channels; ch++) {
      const src = source.buffer.getChannelData(ch);
      const dst = extracted.getChannelData(ch);
      const end = Math.min(startSample + numSamples, src.length);
      for (let i = startSample; i < end; i++) {
        dst[i - startSample] = src[i];
      }
    }
    return extracted;
  }, [segmentId]);

  const handlePresetChange = useCallback((name: VoicePresetName) => {
    setSelectedPreset(name);
    setSettings(voicePresets.getPreset(name));
  }, []);

  const handleParamChange = useCallback((key: keyof VoiceSettings, value: number) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSelectedPreset('original'); // mark as custom
  }, []);

  const stopPreview = useCallback(() => {
    sourceNodeRef.current?.stop();
    sourceNodeRef.current = null;
    setIsPreviewing(false);
  }, []);

  const handlePreview = useCallback(async () => {
    if (isPreviewing) { stopPreview(); return; }

    const buf = getSegmentBuffer();
    if (!buf) return;

    setIsProcessing(true);
    setError(null);
    try {
      const processed = await voiceEngine.processAudio(buf, settings);
      previewBufferRef.current = processed;

      const ctx = audioCtxRef.current ?? new AudioContext();
      if (!audioCtxRef.current) audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume();

      const src = ctx.createBufferSource();
      src.buffer = processed;
      src.connect(ctx.destination);
      src.onended = () => setIsPreviewing(false);
      src.start();
      sourceNodeRef.current = src;
      setIsPreviewing(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProcessing(false);
    }
  }, [isPreviewing, stopPreview, getSegmentBuffer, settings]);

  const handleApply = useCallback(async () => {
    if (!segmentId) return;

    setIsProcessing(true);
    setError(null);
    try {
      // Use already-processed preview buffer if available and settings haven't changed
      let processed = previewBufferRef.current;
      if (!processed) {
        const buf = getSegmentBuffer();
        if (!buf) return;
        processed = await voiceEngine.processAudio(buf, settings);
      }

      const data = processed.getChannelData(0);
      const peaks = computeWaveformPeaks(data, 256);

      const newSource = {
        id: crypto.randomUUID(),
        name: `Voice FX - ${new Date().toLocaleTimeString()}`,
        buffer: processed,
        peaks,
        duration: processed.duration,
        sampleRate: processed.sampleRate,
        channels: processed.numberOfChannels,
      };

      useProjectStore.getState().replaceSegmentSource(segmentId, newSource);
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProcessing(false);
    }
  }, [segmentId, getSegmentBuffer, settings, closeModal]);

  // Clear preview buffer when settings change
  const handleSettingsChange = useCallback((key: keyof VoiceSettings, value: number) => {
    previewBufferRef.current = null;
    handleParamChange(key, value);
  }, [handleParamChange]);

  return (
    <Modal
      isOpen={true}
      onClose={() => { stopPreview(); closeModal(); }}
      title={t('timeline.voiceEffectsTitle')}
      widthClass="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Preset selector */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">{t('voice.presets')}</label>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_NAMES.map((name) => (
              <button
                key={name}
                onClick={() => handlePresetChange(name)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                  selectedPreset === name
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {t(`voice.preset_${name}`, name)}
              </button>
            ))}
          </div>
        </div>

        {/* Parameters */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {PARAMS.map(({ key, label, min, max, step }) => (
            <div key={key} className="flex items-center gap-2">
              <label className="text-xs text-gray-400 w-28 shrink-0 truncate" title={label}>
                {label}
              </label>
              <input
                type="range"
                aria-label={label}
                min={min}
                max={max}
                step={step}
                value={settings[key]}
                onChange={(e) => handleSettingsChange(key, parseFloat(e.target.value))}
                className="flex-1 slider-styled"
              />
              <span className="text-xs text-white bg-gray-800 px-1.5 py-0.5 rounded w-14 text-center font-mono">
                {typeof settings[key] === 'number'
                  ? (settings[key] as number) % 1 === 0
                    ? settings[key]
                    : (settings[key] as number).toFixed(2)
                  : settings[key]}
              </span>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="text-red-400 text-xs bg-red-900/30 rounded px-3 py-2">{error}</div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-700">
          <button
            onClick={handlePreview}
            disabled={isProcessing && !isPreviewing}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors ${
              isPreviewing
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-gray-600 hover:bg-gray-500 text-white disabled:bg-gray-700 disabled:text-gray-500'
            }`}
          >
            {isPreviewing ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isPreviewing ? t('voice.stop') : t('timeline.preview')}
          </button>
          <button
            onClick={handleApply}
            disabled={isProcessing}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-semibold text-white flex items-center gap-2 transition-colors"
          >
            {isProcessing && !isPreviewing && (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {isProcessing && !isPreviewing ? t('voice.processing') : t('timeline.apply')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
