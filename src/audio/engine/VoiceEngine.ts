import type { VoiceSettings } from '../../types/voicelab';
import { granularPitchShift } from '../dsp/PitchShifter';
import { timeStretch } from '../dsp/TimeStretcher';
import { formantShift } from '../dsp/FormantShifter';
import { createReverb } from '../effects/Reverb';
import { createDelay } from '../effects/Delay';
import { createChorus } from '../effects/Chorus';
import { createRingModulator } from '../effects/RingModulator';
import { applyDistortion } from '../effects/Distortion';
import { createBitCrush } from '../effects/BitCrush';
import { createLowpass, createHighpass } from '../effects/Filter';

/**
 * VoiceEngine — stateless voice processing pipeline.
 *
 * All heavy DSP (pitch, formant, time-stretch) runs as pre-processing steps
 * on the raw AudioBuffer before the Web Audio effect chain is applied inside
 * an OfflineAudioContext.
 */
export class VoiceEngine {
  /**
   * Process an AudioBuffer through the full voice effect chain described by
   * `settings` and return a new processed AudioBuffer.
   *
   * The pipeline runs entirely offline (no real-time audio context required).
   */
  async processAudio(source: AudioBuffer, settings: VoiceSettings): Promise<AudioBuffer> {
    // ── Phase 1: Time-domain DSP (operates on raw AudioBuffer) ──────────────
    let workingBuffer = source;

    if (settings.pitchShift !== 0) {
      workingBuffer = granularPitchShift(workingBuffer, settings.pitchShift);
    }

    if (settings.formantShift !== 0) {
      workingBuffer = formantShift(workingBuffer, settings.formantShift);
    }

    if (settings.speedChange !== 1.0) {
      // timeStretch changes duration to match requested speed (inverse of factor)
      workingBuffer = timeStretch(workingBuffer, 1 / settings.speedChange);
    }

    // ── Phase 2: Web Audio effect chain in OfflineAudioContext ───────────────
    const offCtx = new OfflineAudioContext(
      workingBuffer.numberOfChannels,
      workingBuffer.length,
      workingBuffer.sampleRate,
    );

    const bufferSource = offCtx.createBufferSource();
    bufferSource.buffer = workingBuffer;

    let currentNode: AudioNode = bufferSource;

    currentNode = this.buildChain(offCtx, currentNode, settings);

    // Master gain
    const masterGain = offCtx.createGain();
    masterGain.gain.value = Math.max(0, Math.min(2, settings.masterGain));
    currentNode.connect(masterGain);
    masterGain.connect(offCtx.destination);

    bufferSource.start();
    return offCtx.startRendering();
  }

  // ── Private: Effect chain builder ─────────────────────────────────────────

  private buildChain(
    ctx: OfflineAudioContext,
    input: AudioNode,
    s: VoiceSettings,
  ): AudioNode {
    let node: AudioNode = input;

    // Vocoder (carrier + envelope follower approximation via oscillator mix)
    if (s.vocoderMix > 0) {
      node = this.buildVocoder(ctx, node, s);
    }

    // Ring modulator
    if (s.ringModMix > 0) {
      node = createRingModulator(ctx, node, s.ringModFreq, s.ringModMix);
    }

    // Tremolo
    if (s.tremoloRate > 0 && s.tremoloDepth > 0) {
      node = this.buildTremolo(ctx, node, s.tremoloRate, s.tremoloDepth);
    }

    // Delay
    if (s.delayMix > 0) {
      node = createDelay(ctx, node, s.delayTime, s.delayFeedback, s.delayMix);
    }

    // Chorus
    if (s.chorusMix > 0) {
      node = createChorus(ctx, node, s.chorusRate, s.chorusDepth, s.chorusMix);
    }

    // Compressor
    if (s.compThreshold < -1) {
      node = this.buildCompressor(ctx, node, s.compThreshold, s.compRatio);
    }

    // Filters — lowpass
    if (s.lowpassFreq < 22000) {
      node = createLowpass(ctx, node, s.lowpassFreq);
    }

    // Filters — highpass
    if (s.highpassFreq > 0) {
      node = createHighpass(ctx, node, s.highpassFreq);
    }

    // Reverb
    if (s.reverbMix > 0) {
      node = createReverb(ctx, node, s.reverbSize, s.reverbDecay, s.reverbMix);
    }

    // Bit-crush
    if (s.bitCrushBits < 16 && s.bitCrushMix > 0) {
      node = createBitCrush(ctx, node, s.bitCrushBits, s.bitCrushMix);
    }

    // Distortion
    if (s.distortionDrive > 0 && s.distortionMix > 0) {
      node = applyDistortion(ctx, node, s.distortionDrive, s.distortionMix, 'tanh');
    }

    // Noise gate (simple threshold gate implemented inline)
    if (s.noiseGateThreshold > -80) {
      node = this.buildNoiseGate(ctx, node, s.noiseGateThreshold);
    }

    return node;
  }

  // ── Vocoder ────────────────────────────────────────────────────────────────

  /**
   * Simplified vocoder: mix the input signal with a sawtooth oscillator
   * carrier at `vocoderFreq`, weighted by `vocoderMix`.
   * This captures the fundamental robotic character without requiring a full
   * filterbank implementation.
   */
  private buildVocoder(
    ctx: BaseAudioContext,
    input: AudioNode,
    s: VoiceSettings,
  ): AudioNode {
    const carrier = ctx.createOscillator();
    const carrierGain = ctx.createGain();
    const vocoderGain = ctx.createGain();
    const dryGain = ctx.createGain();
    const output = ctx.createGain();

    carrier.type = 'sawtooth';
    carrier.frequency.value = Math.max(20, s.vocoderFreq);

    const mix = Math.max(0, Math.min(1, s.vocoderMix));
    carrierGain.gain.value = mix * 0.3;
    vocoderGain.gain.value = mix;
    dryGain.gain.value = 1 - mix;

    carrier.connect(carrierGain);
    input.connect(vocoderGain);
    input.connect(dryGain);

    carrierGain.connect(output);
    vocoderGain.connect(output);
    dryGain.connect(output);

    carrier.start();
    return output;
  }

  // ── Tremolo ────────────────────────────────────────────────────────────────

  private buildTremolo(
    ctx: BaseAudioContext,
    input: AudioNode,
    rate: number,
    depth: number,
  ): AudioNode {
    const gainNode = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();

    lfo.type = 'sine';
    lfo.frequency.value = Math.max(0.01, rate);

    const depthClamped = Math.max(0, Math.min(1, depth));
    lfoGain.gain.value = depthClamped * 0.5;
    gainNode.gain.value = 1 - depthClamped * 0.5;

    lfo.connect(lfoGain);
    lfoGain.connect(gainNode.gain);
    input.connect(gainNode);

    lfo.start();
    return gainNode;
  }

  // ── Compressor ────────────────────────────────────────────────────────────

  private buildCompressor(
    ctx: BaseAudioContext,
    input: AudioNode,
    threshold: number,
    ratio: number,
  ): AudioNode {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = Math.max(-100, Math.min(0, threshold));
    comp.ratio.value = Math.max(1, Math.min(20, ratio));
    comp.attack.value = 0.01;   // 10 ms
    comp.release.value = 0.1;   // 100 ms
    comp.knee.value = 2;
    input.connect(comp);
    return comp;
  }

  // ── Noise gate ─────────────────────────────────────────────────────────────

  /**
   * Simple hard noise gate using a WaveShaperNode.
   * Signals below `thresholdDb` are attenuated towards silence.
   */
  private buildNoiseGate(
    ctx: BaseAudioContext,
    input: AudioNode,
    thresholdDb: number,
  ): AudioNode {
    // Use a WaveShaperNode as a static hard gate approximation.
    // For a real gate, a ScriptProcessorNode / AudioWorklet would be needed;
    // this provides a reasonable offline substitute.
    const shaper = ctx.createWaveShaper();
    const threshold = Math.pow(10, thresholdDb / 20); // dB → linear
    const samples = 4096;
    const curve = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / (samples - 1) - 1;
      const abs = Math.abs(x);
      if (abs < threshold) {
        // Soft fade below threshold
        curve[i] = x * (abs / threshold);
      } else {
        curve[i] = x;
      }
    }

    shaper.curve = curve;
    input.connect(shaper);
    return shaper;
  }
}
