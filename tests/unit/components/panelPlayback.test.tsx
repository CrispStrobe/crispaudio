import { Profiler } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SFXPanel } from '../../../src/components/sfx/SFXPanel';
import { VoicePanel } from '../../../src/components/voice/VoicePanel';
import { useSynthStore } from '../../../src/stores/synthStore';
import { useVoiceStore } from '../../../src/stores/voiceStore';

const translate = vi.hoisted(() => vi.fn((key: string) => key));
vi.mock('react-i18next', async (importOriginal) => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: translate, i18n: { exists: () => false } }) }));
vi.mock('../../../src/lib/native', () => ({ haptic: vi.fn() }));

class FakeSource {
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class FakeContext {
  static instances: FakeContext[] = [];
  state = 'running';
  destination = {};
  sources: FakeSource[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  createBuffer = vi.fn((_channels: number, length: number, sampleRate: number) => ({
    sampleRate, length, duration: length / sampleRate,
    getChannelData: () => new Float32Array(length),
  }));
  createBufferSource = vi.fn(() => {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  });
  constructor() { FakeContext.instances.push(this); }
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  FakeContext.instances = [];
  useVoiceStore.setState({ isProcessing: false, sourceBuffer: null, processedBuffer: null, activeSlot: 'A' });
  useSynthStore.setState({ buffer: new Float32Array([0, 0.5, 0]), isPlaying: false, sampleRate: 44100, bitDepth: 16, activeSlot: 'A' });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const playSfx = () => fireEvent.click(screen.getByRole('button', { name: /sfx.play A/ }));
const stopSfx = () => fireEvent.click(screen.getByRole('button', { name: 'sfx.stop' }));

describe('store render isolation', () => {
  it('does not render SFX waveform interactions for export quality changes', () => {
    render(<SFXPanel />);
    translate.mockClear();
    act(() => useSynthStore.setState({ bitDepth: 24 }));
    expect(translate.mock.calls.filter(([key]) => key === 'sfx.zoomIn')).toHaveLength(0);
  });
  it('does not render Voice visualizations for processing changes', () => {
    useVoiceStore.setState({ isProcessing: false });
    render(<VoicePanel />);
    translate.mockClear();
    act(() => useVoiceStore.getState().setIsProcessing(true));
    expect(translate.mock.calls.filter(([key]) => key === 'voice.frequencySpectrum')).toHaveLength(0);
  });
  it('does not render SFX parameter controls for playback changes', () => {
    render(<SFXPanel />);
    translate.mockClear();
    act(() => useSynthStore.getState().setIsPlaying(true));
    expect(translate.mock.calls.filter(([key]) => key === 'sfx.baseFreq')).toHaveLength(0);
  });
  it('does not render voice parameter controls for processing changes', () => {
    render(<VoicePanel />);
    translate.mockClear();
    act(() => useVoiceStore.getState().setIsProcessing(true));
    expect(translate.mock.calls.filter(([key]) => key === 'voice.pitchShift')).toHaveLength(0);
  });
  it('SFXPanel ignores inactive slot edits', () => {
    const onRender = vi.fn();
    render(<Profiler id="sfx" onRender={onRender}><SFXPanel /></Profiler>);
    onRender.mockClear();
    act(() => useSynthStore.setState({ paramsB: { ...useSynthStore.getState().paramsB, p_base_freq: 0.72 } }));
    expect(onRender).not.toHaveBeenCalled();
  });
  it('VoicePanel ignores inactive slot edits', () => {
    const onRender = vi.fn();
    render(<Profiler id="voice" onRender={onRender}><VoicePanel /></Profiler>);
    onRender.mockClear();
    act(() => useVoiceStore.setState({ settingsB: { ...useVoiceStore.getState().settingsB, pitchShift: 7 } }));
    expect(onRender).not.toHaveBeenCalled();
  });
});

describe('Voice playback', () => {
  it('ignores replaced source callbacks and disconnects on unmount', () => {
    const buffer: AudioBuffer = {
      sampleRate: 44100, duration: 1, length: 3, numberOfChannels: 1,
      getChannelData: () => new Float32Array(3), copyFromChannel: vi.fn(), copyToChannel: vi.fn(),
    };
    useVoiceStore.setState({ sourceBuffer: buffer, processedBuffer: buffer });
    const { unmount } = render(<VoicePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Play source audio' }));
    const ctx = FakeContext.instances[0];
    const oldEnded = ctx.sources[0].onended;
    fireEvent.click(screen.getByRole('button', { name: 'Stop source playback' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play processed audio' }));
    act(() => oldEnded?.());
    expect(screen.getByRole('button', { name: 'Stop processed playback' })).not.toBeNull();
    unmount();
    expect(ctx.sources[1].disconnect).toHaveBeenCalledOnce();
    expect(ctx.close).toHaveBeenCalledOnce();
  });
});

describe('SFX waveform interaction', () => {
  it('preserves independent zoom, pointer pan, and reset across panel updates', () => {
    const { container } = render(<SFXPanel />);
    fireEvent.click(screen.getAllByRole('button', { name: 'sfx.zoomIn' })[0]);
    expect(screen.getAllByTitle('sfx.zoomReset')).toHaveLength(1);
    expect(screen.getByTitle('sfx.zoomReset').textContent).toBe('1.5x');
    const canvas = container.querySelector('canvas')!;
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100 });
    expect(canvas.className).toContain('cursor-grabbing');
    fireEvent.pointerCancel(canvas, { pointerId: 1 });
    expect(canvas.className).not.toContain('cursor-grabbing');
    act(() => useSynthStore.setState({ bitDepth: 24 }));
    expect(screen.getByTitle('sfx.zoomReset').textContent).toBe('1.5x');
    fireEvent.click(screen.getByTitle('sfx.zoomReset'));
    expect(screen.queryByTitle('sfx.zoomReset')).toBeNull();
    expect((screen.getAllByRole('button', { name: 'sfx.zoomOut' })[0] as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('SFX playback', () => {
  it('ignores a replaced source ending after replay has started', () => {
    render(<SFXPanel />);
    playSfx();
    const ctx = FakeContext.instances[0];
    const oldEnded = ctx.sources[0].onended;
    stopSfx();
    playSfx();
    act(() => oldEnded?.());
    expect(useSynthStore.getState().isPlaying).toBe(true);
    expect(ctx.sources[0].disconnect).toHaveBeenCalled();
  });
  it('loops continuously on the same source and disables looping in place', () => {
    render(<SFXPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'sfx.loop' }));
    const ctx = FakeContext.instances[0];
    expect(ctx.sources[0].loop).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'sfx.stopLoop' }));
    expect(ctx.sources[0].loop).toBe(false);
    expect(ctx.sources[0].stop).not.toHaveBeenCalled();
    expect(ctx.sources).toHaveLength(1);
  });
  it('suspends on stop and resumes the same AudioContext on replay', () => {
    render(<SFXPanel />);
    playSfx();
    stopSfx();
    const ctx = FakeContext.instances[0];
    ctx.state = 'suspended';
    playSfx();
    expect(ctx.resume).toHaveBeenCalled();
    expect(FakeContext.instances).toHaveLength(1);
  });

  it('clears pending replay timers and does not restart after unmount', () => {
    vi.useFakeTimers();
    render(<SFXPanel />);
    playSfx();
    const ctx = FakeContext.instances[0];
    cleanup();
    vi.advanceTimersByTime(100);
    expect(ctx.sources).toHaveLength(1);
    vi.useRealTimers();
  });

  it('reuses the converted buffer on replay with a fresh source', () => {
    render(<SFXPanel />);
    playSfx();
    stopSfx();
    playSfx();
    const ctx = FakeContext.instances[0];
    expect(ctx.sources).toHaveLength(2);
    expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
    expect(ctx.sources[1].buffer).toBe(ctx.sources[0].buffer);
  });
});


