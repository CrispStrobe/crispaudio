// ---------------------------------------------------------------------------
// CrispAudio — TTSModal
// Text-to-speech dialog: enter text, pick voice/backend, generate audio,
// preview, and send to the timeline.
// ---------------------------------------------------------------------------

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Square, Plus } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useProjectStore } from '../../stores/projectStore';
import { synthesizeSpeech, fetchVoices, type TTSVoice } from '../../services/ttsService';
import { computeWaveformPeaks } from '../../audio/utils/audioBufferUtils';

export function TTSModal() {
  const { t } = useTranslation();
  const closeModal = useUIStore((s) => s.closeModal);
  const {
    ttsServerUrl,
    ttsDefaultVoice,
    ttsDefaultBackend,
  } = useSettingsStore();

  const [text, setText] = useState('');
  const [voice, setVoice] = useState(ttsDefaultVoice);
  const [backend, setBackend] = useState(ttsDefaultBackend);
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedBuffer, setGeneratedBuffer] = useState<AudioBuffer | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  // Fetch available voices on mount
  useEffect(() => {
    fetchVoices(ttsServerUrl).then(setVoices);
  }, [ttsServerUrl]);

  const getOrCreateCtx = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }, []);

  const stopPreview = useCallback(() => {
    sourceNodeRef.current?.stop();
    sourceNodeRef.current = null;
    setIsPreviewing(false);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!text.trim()) return;
    setIsGenerating(true);
    setError(null);
    setGeneratedBuffer(null);
    stopPreview();

    try {
      const wavBytes = await synthesizeSpeech(
        ttsServerUrl,
        text.trim(),
        voice || undefined,
        backend || undefined,
      );

      const ctx = getOrCreateCtx();
      const audioBuffer = await ctx.decodeAudioData(wavBytes);
      setGeneratedBuffer(audioBuffer);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  }, [text, voice, backend, ttsServerUrl, stopPreview, getOrCreateCtx]);

  const handlePreview = useCallback(async () => {
    if (isPreviewing) { stopPreview(); return; }
    if (!generatedBuffer) return;

    const ctx = getOrCreateCtx();
    if (ctx.state === 'suspended') await ctx.resume();

    const src = ctx.createBufferSource();
    src.buffer = generatedBuffer;
    src.connect(ctx.destination);
    src.onended = () => setIsPreviewing(false);
    src.start();
    sourceNodeRef.current = src;
    setIsPreviewing(true);
  }, [isPreviewing, stopPreview, generatedBuffer, getOrCreateCtx]);

  const handleAddToTimeline = useCallback(() => {
    if (!generatedBuffer) return;

    const data = generatedBuffer.getChannelData(0);
    const peaks = computeWaveformPeaks(data, 256);
    const label = text.trim().length > 30 ? text.trim().slice(0, 30) + '…' : text.trim();

    useProjectStore.getState().importAudioSource({
      id: crypto.randomUUID(),
      name: `TTS - ${label}`,
      buffer: generatedBuffer,
      peaks,
      duration: generatedBuffer.duration,
      sampleRate: generatedBuffer.sampleRate,
      channels: generatedBuffer.numberOfChannels,
    });

    stopPreview();
    closeModal();
  }, [generatedBuffer, text, stopPreview, closeModal]);

  return (
    <Modal
      isOpen={true}
      onClose={() => { stopPreview(); closeModal(); }}
      title={t('tts.title')}
      widthClass="max-w-xl"
    >
      <div className="space-y-4">
        {/* Text input */}
        <div>
          <label className="block text-xs text-gray-400 mb-1" htmlFor="tts-text">
            {t('tts.text')}
          </label>
          <textarea
            id="tts-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('tts.textPlaceholder')}
            rows={4}
            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y"
          />
        </div>

        {/* Voice & Backend selectors */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1" htmlFor="tts-voice">
              {t('tts.voice')}
            </label>
            <input
              id="tts-voice"
              type="text"
              list="tts-voice-list"
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              placeholder={t('tts.voicePlaceholder')}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {voices.length > 0 && (
              <datalist id="tts-voice-list">
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </datalist>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1" htmlFor="tts-backend">
              {t('tts.backend')}
            </label>
            <input
              id="tts-backend"
              type="text"
              value={backend}
              onChange={(e) => setBackend(e.target.value)}
              placeholder="kokoro"
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        </div>

        {/* Server URL info */}
        <p className="text-xs text-gray-500">
          {t('tts.serverInfo', { url: ttsServerUrl })}
        </p>

        {/* Error */}
        {error && (
          <div className="text-red-400 text-xs bg-red-900/30 rounded px-3 py-2">{error}</div>
        )}

        {/* Generated audio info */}
        {generatedBuffer && (
          <div className="text-xs text-emerald-400 bg-emerald-900/20 rounded px-3 py-2">
            {t('tts.generated', {
              duration: generatedBuffer.duration.toFixed(1),
              sampleRate: generatedBuffer.sampleRate,
            })}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-700">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !text.trim()}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-semibold text-white flex items-center gap-2 transition-colors"
          >
            {isGenerating && (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {isGenerating ? t('tts.generating') : t('tts.generate')}
          </button>

          {generatedBuffer && (
            <>
              <button
                onClick={handlePreview}
                className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors ${
                  isPreviewing
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-gray-600 hover:bg-gray-500 text-white'
                }`}
              >
                {isPreviewing ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isPreviewing ? t('voice.stop') : t('timeline.preview')}
              </button>

              <button
                onClick={handleAddToTimeline}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-semibold text-white flex items-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('tts.addToTimeline')}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
