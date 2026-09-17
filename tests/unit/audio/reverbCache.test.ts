import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeContext(sampleRate = 8000) {
  const context = {
    sampleRate,
    createBuffer: vi.fn((numberOfChannels: number, length: number, rate: number) => {
      const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
      return {
        numberOfChannels, length, sampleRate: rate, duration: length / rate,
        getChannelData: (channel: number) => channels[channel],
      } as AudioBuffer;
    }),
    createConvolver: vi.fn(() => ({ buffer: null as AudioBuffer | null, connect: vi.fn() })),
    createGain: vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn() })),
  };
  return { context, ctx: context as unknown as BaseAudioContext };
}

const source = () => ({ connect: vi.fn() }) as unknown as AudioNode;

describe('reverb impulse caching', () => {
  beforeEach(() => vi.resetModules());

  it('generates deterministic stereo diffusion without consuming global randomness', async () => {
    const { generateImpulseResponse } = await import('../../../src/audio/effects/Reverb');
    const { ctx } = makeContext();
    const random = vi.spyOn(Math, 'random');
    try {
      const first = generateImpulseResponse(ctx, 0.01, 0.2);
      vi.resetModules();
      const freshModule = await import('../../../src/audio/effects/Reverb');
      const second = freshModule.generateImpulseResponse(ctx, 0.01, 0.2);
      expect(second.getChannelData(0)).toEqual(first.getChannelData(0));
      expect(second.getChannelData(1)).toEqual(first.getChannelData(1));
      expect(first.getChannelData(0)).not.toEqual(first.getChannelData(1));
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });

  it('evicts the least recently used impulse after eight entries', async () => {
    const { createReverb } = await import('../../../src/audio/effects/Reverb');
    const { ctx, context } = makeContext();
    const render = (decay: number) => {
      createReverb(ctx, source(), 0, decay, 0.5);
      return context.createConvolver.mock.results.at(-1)!.value.buffer!;
    };
    const oldest = render(1);
    const evicted = render(2);
    for (let decay = 3; decay <= 8; decay++) render(decay);
    expect(render(1)).toBe(oldest); // Refresh recency, not just insertion order.
    render(9);
    expect(render(1)).toBe(oldest);
    const regenerated = render(2);
    expect(regenerated).not.toBe(evicted);
    expect(context.createBuffer).toHaveBeenCalledTimes(10);
    expect(regenerated.getChannelData(0)).toEqual(evicted.getChannelData(0));
    expect(regenerated.getChannelData(1)).toEqual(evicted.getChannelData(1));
  });

  it('also evicts large impulses to keep retained sample data within 16 MiB', async () => {
    const { createReverb } = await import('../../../src/audio/effects/Reverb');
    const { ctx, context } = makeContext(192000);
    const render = (decay: number) => {
      createReverb(ctx, source(), 1, decay, 0.5);
      return context.createConvolver.mock.results.at(-1)!.value.buffer!;
    };
    // Each stereo five-second response consumes 7,680,000 bytes; only two fit.
    const first = render(1);
    const second = render(2);
    render(3);
    expect(render(2)).toBe(second);
    expect(render(1)).not.toBe(first);
    expect(context.createBuffer).toHaveBeenCalledTimes(4);
  });

  it('does not retain an impulse larger than the byte budget', async () => {
    const { createReverb } = await import('../../../src/audio/effects/Reverb');
    // Stress allocation beyond normal device rates without changing production limits.
    const { ctx, context } = makeContext(480000);
    createReverb(ctx, source(), 1, 1, 0.5);
    createReverb(ctx, source(), 1, 1, 0.5);
    expect(context.createBuffer).toHaveBeenCalledTimes(2);
  });

  it('invalidates on sample rate, sample-rounded duration, or decay changes', async () => {
    const { createReverb } = await import('../../../src/audio/effects/Reverb');
    const first = makeContext();
    const otherRate = makeContext(16000);
    createReverb(first.ctx, source(), 0, 1, 0.5);
    createReverb(first.ctx, source(), 0.1, 1, 0.5);
    createReverb(first.ctx, source(), 0, 2, 0.5);
    createReverb(otherRate.ctx, source(), 0, 1, 0.5);
    expect(first.context.createBuffer).toHaveBeenCalledTimes(3);
    expect(otherRate.context.createBuffer).toHaveBeenCalledExactlyOnceWith(2, 1600, 16000);
    const buffers = first.context.createConvolver.mock.results.map(({ value }) => value.buffer!);
    expect(buffers[0].length).toBe(800);
    expect(buffers[1].length).toBe(4720);
    expect(buffers[2].getChannelData(0)).not.toEqual(buffers[0].getChannelData(0));
  });

  it('shares durations that normalize to the same sample length', async () => {
    const { createReverb } = await import('../../../src/audio/effects/Reverb');
    const { ctx, context } = makeContext();
    createReverb(ctx, source(), 0, 1, 0.5);
    createReverb(ctx, source(), 0.000001, 1, 0.5);
    expect(context.createBuffer).toHaveBeenCalledOnce();
  });

  it('keeps public mutable responses separate from cached responses in either call order', async () => {
    const { createReverb, generateImpulseResponse } = await import('../../../src/audio/effects/Reverb');
    const { ctx, context } = makeContext();
    const publicFirst = generateImpulseResponse(ctx, 0.1, 1);
    const expected = publicFirst.getChannelData(0).slice();
    publicFirst.getChannelData(0).fill(42);
    createReverb(ctx, source(), 0, 1, 0.5);
    const cached = context.createConvolver.mock.results[0].value.buffer!;
    expect(cached.getChannelData(0)).toEqual(expected);
    const publicSecond = generateImpulseResponse(ctx, 0.1, 1);
    expect(publicSecond).not.toBe(cached);
    expect(publicSecond).not.toBe(publicFirst);
    publicSecond.getChannelData(0).fill(-42);
    createReverb(ctx, source(), 0, 1, 0.5);
    expect(context.createConvolver.mock.results[1].value.buffer).toBe(cached);
    expect(cached.getChannelData(0)).toEqual(expected);
    expect(context.createBuffer).toHaveBeenCalledTimes(3);
  });

  it.each([-1, 0, 0.5, 1, 2])('preserves node wiring and wet/dry gains for mix %s', async (mix) => {
    const { createReverb } = await import('../../../src/audio/effects/Reverb');
    const { ctx, context } = makeContext();
    const input = source();
    const output = createReverb(ctx, input, 0, 1, mix);
    const [wet, dry, mixed] = context.createGain.mock.results.map(({ value }) => value);
    const convolver = context.createConvolver.mock.results[0].value;
    const clamped = Math.max(0, Math.min(1, mix));
    expect(wet.gain.value).toBe(clamped);
    expect(dry.gain.value).toBe(1 - clamped * 0.7);
    expect(output).toBe(mixed);
    expect(input.connect).toHaveBeenCalledWith(dry);
    expect(input.connect).toHaveBeenCalledWith(convolver);
    expect(convolver.connect).toHaveBeenCalledWith(wet);
    expect(wet.connect).toHaveBeenCalledWith(mixed);
    expect(dry.connect).toHaveBeenCalledWith(mixed);
  });

  it('preserves the reflection/tail envelopes with diffusion limited to ten percent', async () => {
    const { generateImpulseResponse } = await import('../../../src/audio/effects/Reverb');
    const { ctx } = makeContext();
    for (const decay of [-1, 0.001, 0.2, 1]) {
      const impulse = generateImpulseResponse(ctx, -1, decay);
      expect(impulse.length).toBe(80);
      expect(impulse.sampleRate).toBe(8000);
      expect(impulse.numberOfChannels).toBe(2);
      for (let ch = 0; ch < 2; ch++) {
        const samples = impulse.getChannelData(ch);
        for (let i = 0; i < samples.length; i++) {
          const t = i / 8000;
          const envelope = Math.exp(-3 * t / Math.max(0.001, decay));
          const base = Math.exp(-t / 0.1) * 0.3
            + Math.exp(-t / Math.max(0.001, decay * 0.5)) * 0.7;
          expect(samples[i]).toBeGreaterThanOrEqual((base - 0.1) * envelope - 1e-7);
          expect(samples[i]).toBeLessThanOrEqual((base + 0.1) * envelope + 1e-7);
        }
      }
    }
  });

  it('reuses an impulse across contexts with the same normalized parameters', async () => {
    const { createReverb } = await import('../../../src/audio/effects/Reverb');
    const first = makeContext();
    const second = makeContext();
    createReverb(first.ctx, source(), -1, -1, 0.2);
    createReverb(second.ctx, source(), 0, 0.01, 0.8);
    expect(first.context.createBuffer).toHaveBeenCalledOnce();
    expect(second.context.createBuffer).not.toHaveBeenCalled();
    expect(second.context.createConvolver.mock.results[0].value.buffer)
      .toBe(first.context.createConvolver.mock.results[0].value.buffer);
  });
});
