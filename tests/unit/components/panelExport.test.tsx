import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SFXPanel } from '../../../src/components/sfx/SFXPanel';
import { VoicePanel } from '../../../src/components/voice/VoicePanel';
import { TimelinePanel } from '../../../src/components/timeline/TimelinePanel';
import { useSynthStore } from '../../../src/stores/synthStore';
import { useVoiceStore } from '../../../src/stores/voiceStore';
import { useProjectStore } from '../../../src/stores/projectStore';
import { useSettingsStore } from '../../../src/stores/settingsStore';

const mocks = vi.hoisted(() => ({ wav: vi.fn(), stereoWav: vi.fn(), mono: vi.fn(), stereo: vi.fn(), save: vi.fn(), render: vi.fn(), engine: { getContext: () => ({}), resume: vi.fn() } }));
vi.mock('react-i18next', async importOriginal => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../src/lib/wavExport', () => ({ exportWav: mocks.wav, encodeAudioBufferWav: mocks.stereoWav, downloadWavFile: mocks.save }));
vi.mock('../../../src/lib/codecs', () => ({ encodeMono: mocks.mono, encodeAudioBuffer: mocks.stereo }));
vi.mock('../../../src/lib/native', () => ({ haptic: vi.fn() }));
vi.mock('../../../src/hooks/useAudioEngine', () => ({ useAudioEngine: () => mocks.engine }));
vi.mock('../../../src/audio/engine/TimelineEngine', () => ({ TimelineEngine: class { setSources() {} stop() {} renderToBuffer = mocks.render; } }));
vi.mock('../../../src/components/sfx/SfxParameters', () => ({ SfxParameters: () => null, ParamInfoButton: () => null }));
vi.mock('../../../src/components/sfx/SfxWaveform', () => ({ SfxWaveform: () => null }));
vi.mock('../../../src/components/shared/SpectrumDisplay', () => ({ SpectrumDisplay: () => null }));
vi.mock('../../../src/components/shared/AmplitudeDisplay', () => ({ AmplitudeDisplay: () => null }));
vi.mock('../../../src/components/shared/EnvelopeDisplay', () => ({ EnvelopeDisplay: () => null, ADSRDisplay: () => null }));
vi.mock('../../../src/components/voice/VoiceParameters', () => ({ VoiceParameters: () => null }));
vi.mock('../../../src/components/voice/VoiceVisualizations', () => ({ VoiceWaveform: () => null, VoiceSpectrum: () => null, VoiceLevels: () => null }));
vi.mock('../../../src/components/timeline/TimelineCanvas', () => ({ TimelineCanvas: () => null }));
vi.mock('../../../src/components/timeline/TimelineRuler', () => ({ TimelineRuler: () => null }));
vi.mock('../../../src/components/timeline/TransportControls', () => ({ TransportControls: () => null }));
vi.mock('../../../src/components/timeline/SegmentEffectsPanel', () => ({ SegmentEffectsPanel: () => null }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
const data = new Float32Array([0, 0.5, 0]);
const buffer = { sampleRate: 44100, numberOfChannels: 1, length: 3, duration: 3 / 44100, getChannelData: () => data, copyFromChannel: vi.fn(), copyToChannel: vi.fn() } as AudioBuffer;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  useSynthStore.setState({ buffer: data, isPlaying: false, sampleRate: 44100, bitDepth: 16 });
  useVoiceStore.setState({ sourceBuffer: buffer, processedBuffer: buffer, isProcessing: false });
  useProjectStore.setState(s => ({ project: { ...s.project, duration: 1, tracks: [] }, isPlaying: false }));
  useSettingsStore.setState({ defaultExportFormat: 'wav', defaultBitrateKbps: 128, defaultBitDepth: 16 });
  mocks.render.mockResolvedValue(buffer);
  mocks.save.mockResolvedValue(true);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const panels = [
  { name: 'SFX', Panel: SFXPanel, button: 'sfx.downloadWav', encode: mocks.wav },
  { name: 'Voice', Panel: VoicePanel, button: 'voice.export', encode: mocks.wav },
  { name: 'Timeline', Panel: TimelinePanel, button: 'timeline.export', encode: mocks.stereoWav },
];

it('shows rendering with its CPU limitation and aborts before encoding', async () => {
  const pending = deferred<AudioBuffer>();
  mocks.render.mockReturnValueOnce(pending.promise);
  render(<TimelinePanel />);
  fireEvent.click(screen.getByRole('button', { name: 'timeline.export' }));
  expect(screen.getByRole('status')).toHaveTextContent('audioExport.rendering');
  expect(screen.getByText('audioExport.renderCancelNote')).toBeInTheDocument();
  const signal = mocks.render.mock.calls[0][3] as AbortSignal;
  fireEvent.click(screen.getByRole('button', { name: 'audioExport.cancel' }));
  expect(signal.aborted).toBe(true);
  await act(async () => { pending.resolve(buffer); });
  expect(mocks.stereoWav).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});

it('has both English and German export status strings', async () => {
  const en = (await import('../../../src/i18n/locales/en/translation.json')).default;
  const de = (await import('../../../src/i18n/locales/de/translation.json')).default;
  for (const locale of [en, de]) {
    expect(locale).toHaveProperty('audioExport.rendering');
    expect(locale).toHaveProperty('audioExport.encoding');
    expect(locale).toHaveProperty('audioExport.cancel');
    expect(locale).toHaveProperty('audioExport.failed');
    expect(locale).toHaveProperty('audioExport.renderCancelNote');
  }
});

describe.each(panels)('$name export', ({ Panel, button, encode, name }) => {
  it('reuses the last successful encoding and invalidates format, bitrate, and source identity', async () => {
    const blob = new Blob(['ok']);
    encode.mockResolvedValue(blob);
    mocks.mono.mockResolvedValue(blob);
    mocks.stereo.mockResolvedValue(blob);
    const compressed = name === 'Timeline' ? mocks.stereo : mocks.mono;
    render(<Panel />);
    const run = async (saves: number) => {
      fireEvent.click(screen.getByRole('button', { name: button }));
      await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(saves));
    };
    await run(1);
    await run(2);
    expect(encode).toHaveBeenCalledTimes(1);
    if (name === 'Timeline') expect(mocks.render).toHaveBeenCalledTimes(1);
    act(() => useSettingsStore.setState({ defaultExportFormat: 'mp3' }));
    await run(3);
    expect(compressed).toHaveBeenCalledTimes(1);
    expect(compressed.mock.calls[0].at(-1)).toBeInstanceOf(AbortSignal);
    act(() => useSettingsStore.setState({ defaultBitrateKbps: 192 }));
    await run(4);
    expect(compressed).toHaveBeenCalledTimes(2);
    act(() => {
      if (name === 'SFX') useSynthStore.setState({ buffer: new Float32Array(data) });
      else if (name === 'Voice') useVoiceStore.setState({ processedBuffer: { ...buffer } });
      else useProjectStore.setState(s => ({ sources: new Map(s.sources) }));
    });
    await run(5);
    expect(compressed).toHaveBeenCalledTimes(3);
  });

  it('aborts pending encoding when the panel unmounts', async () => {
    const pending = deferred<Blob>();
    encode.mockReturnValueOnce(pending.promise);
    const { unmount } = render(<Panel />);
    fireEvent.click(screen.getByRole('button', { name: button }));
    await waitFor(() => expect(encode).toHaveBeenCalledTimes(1));
    const signal = encode.mock.calls[0].at(-1) as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(new Blob()); });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('shows encoding, cancels without saving, and restarts despite late completion', async () => {
    const first = deferred<Blob>();
    const next = deferred<Blob>();
    encode.mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise);
    render(<Panel />);
    fireEvent.click(screen.getByRole('button', { name: button }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('audioExport.encoding'));
    expect(encode).toHaveBeenCalledTimes(1);
    const signal = encode.mock.calls[0].at(-1) as AbortSignal;
    fireEvent.click(screen.getByRole('button', { name: 'audioExport.cancel' }));
    expect(signal.aborted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: button }));
    await waitFor(() => expect(encode).toHaveBeenCalledTimes(2));
    await act(async () => { first.resolve(new Blob(['old'])); });
    expect(screen.getByRole('status')).toHaveTextContent('audioExport.encoding');
    expect(mocks.save).not.toHaveBeenCalled();
    const blob = new Blob(['new']);
    await act(async () => { next.resolve(blob); });
    expect(mocks.save).toHaveBeenCalledWith(blob, expect.any(String));
    expect(screen.queryByRole('button', { name: 'audioExport.cancel' })).toBeNull();
  });
});
