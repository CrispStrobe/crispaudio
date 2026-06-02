// ---------------------------------------------------------------------------
// CrispAudio — TimelineEngine
// Real-time playback and offline rendering for timeline projects.
// ---------------------------------------------------------------------------

import type {
  TimelineProject,
  TimelineTrack,
  AudioSegment,
  AudioSource,
  EffectConfig,
  FadeCurve,
} from '../../types/audio';
import { createReverb } from '../effects/Reverb';
import { createDelay } from '../effects/Delay';
import { createChorus } from '../effects/Chorus';
import { createRingModulator } from '../effects/RingModulator';
import { applyDistortion } from '../effects/Distortion';
import { createBitCrush } from '../effects/BitCrush';
import { createLowpass, createHighpass } from '../effects/Filter';

// ── TimelineEngine ────────────────────────────────────────────────────────────

export class TimelineEngine {
  private ctx: AudioContext;
  private sources: Map<string, AudioSource>;
  private activeSources: AudioBufferSourceNode[] = [];
  private masterGain: GainNode;

  constructor(ctx: AudioContext, masterGain?: GainNode) {
    this.ctx = ctx;
    this.sources = new Map();
    this.masterGain = masterGain ?? ctx.destination as unknown as GainNode;
  }

  /** Update the source registry (call when sources are added/removed). */
  setSources(sources: Map<string, AudioSource>): void {
    this.sources = sources;
  }

  // ── Playback ───────────────────────────────────────────────────────────────

  /**
   * Start real-time playback from `startTime` (seconds in the project timeline).
   * Schedules all segments that overlap [startTime, project.duration].
   */
  play(project: TimelineProject, startTime: number): void {
    this.stop();

    const now = this.ctx.currentTime;
    const activeTracks = project.tracks.filter((t) => !t.muted);
    const hasSolo = activeTracks.some((t) => t.solo);
    const tracksToPlay = hasSolo
      ? activeTracks.filter((t) => t.solo)
      : activeTracks;

    for (const track of tracksToPlay) {
      const trackGain = this.ctx.createGain();
      trackGain.gain.value = track.volume;

      // Pan
      if (track.pan !== 0) {
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, track.pan));
        trackGain.connect(panner);
        panner.connect(this.masterGain);
      } else {
        trackGain.connect(this.masterGain);
      }

      for (const segment of track.segments) {
        const segEnd = segment.startTime + segment.duration;
        if (segEnd <= startTime) continue; // already past

        const source = this.sources.get(segment.sourceId);
        if (!source) continue;

        // How far into the segment do we start?
        const segPlayStart = Math.max(0, startTime - segment.startTime);
        const bufferOffset = segment.sourceOffset + segPlayStart;
        const playDuration = segment.duration - segPlayStart;

        if (playDuration <= 0) continue;

        // When (in AudioContext time) should this segment start?
        const contextStartTime = now + Math.max(0, segment.startTime - startTime);

        const bufSrc = this.ctx.createBufferSource();
        bufSrc.buffer = source.buffer;

        const segGain = this.ctx.createGain();
        segGain.gain.value = segment.gain;

        bufSrc.connect(segGain);

        // Apply effects chain
        let currentNode: AudioNode = segGain;
        currentNode = this.applyEffects(this.ctx, currentNode, segment.effects);

        // Apply fades via gain automation
        const fadeGain = this.ctx.createGain();
        currentNode.connect(fadeGain);
        this.applyFade(fadeGain, segment, contextStartTime, segPlayStart);

        fadeGain.connect(trackGain);

        bufSrc.start(contextStartTime, bufferOffset, playDuration);
        this.activeSources.push(bufSrc);
      }
    }
  }

  /** Stop all active playback immediately. */
  stop(): void {
    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Already stopped
      }
    }
    this.activeSources = [];
  }

  // ── Offline render ─────────────────────────────────────────────────────────

  /**
   * Render the project (or a time range) to an AudioBuffer offline.
   * Useful for export and preview generation.
   */
  async renderToBuffer(
    project: TimelineProject,
    startTime = 0,
    endTime?: number,
  ): Promise<AudioBuffer> {
    const renderEnd = endTime ?? project.duration;
    const renderDuration = Math.max(0.01, renderEnd - startTime);
    const sampleRate = project.sampleRate;
    const frames = Math.ceil(renderDuration * sampleRate);

    const offCtx = new OfflineAudioContext(2, frames, sampleRate);

    const masterGain = offCtx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(offCtx.destination);

    // Apply master effects
    let masterOut: AudioNode = masterGain;
    if (project.masterEffects.length) {
      // We need a passthrough node to apply master effects onto
      // Create a channel merger as a "bus" collector
      const busMerger = offCtx.createGain();
      busMerger.gain.value = 1;
      masterOut = this.applyEffects(offCtx, busMerger, project.masterEffects);
      masterOut.connect(offCtx.destination);
      masterOut = busMerger;
    }

    const activeTracks = project.tracks.filter((t) => !t.muted);
    const hasSolo = activeTracks.some((t) => t.solo);
    const tracksToRender = hasSolo
      ? activeTracks.filter((t) => t.solo)
      : activeTracks;

    for (const track of tracksToRender) {
      const trackGain = offCtx.createGain();
      trackGain.gain.value = track.volume;

      if (track.pan !== 0) {
        const panner = offCtx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, track.pan));
        trackGain.connect(panner);
        panner.connect(masterOut);
      } else {
        trackGain.connect(masterOut);
      }

      for (const segment of track.segments) {
        const segEnd = segment.startTime + segment.duration;
        if (segEnd <= startTime || segment.startTime >= renderEnd) continue;

        const source = this.sources.get(segment.sourceId);
        if (!source) continue;

        const segPlayStart = Math.max(0, startTime - segment.startTime);
        const bufferOffset = segment.sourceOffset + segPlayStart;
        const playDuration = Math.min(
          segment.duration - segPlayStart,
          renderEnd - Math.max(startTime, segment.startTime),
        );

        if (playDuration <= 0) continue;

        const scheduleAt = Math.max(0, segment.startTime - startTime);

        const bufSrc = offCtx.createBufferSource();
        bufSrc.buffer = source.buffer;

        const segGain = offCtx.createGain();
        segGain.gain.value = segment.gain;

        bufSrc.connect(segGain);

        let currentNode: AudioNode = segGain;
        currentNode = this.applyEffects(offCtx, currentNode, segment.effects);

        const fadeGain = offCtx.createGain();
        currentNode.connect(fadeGain);
        this.applyFade(fadeGain, segment, scheduleAt, segPlayStart);

        fadeGain.connect(trackGain);

        bufSrc.start(scheduleAt, bufferOffset, playDuration);
      }
    }

    return offCtx.startRendering();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private applyEffects(
    ctx: BaseAudioContext,
    input: AudioNode,
    effects: EffectConfig[],
  ): AudioNode {
    let node: AudioNode = input;

    for (const fx of effects) {
      if (!fx.enabled) continue;
      const p = fx.params;

      switch (fx.type) {
        case 'reverb':
          node = createReverb(
            ctx, node,
            p.size ?? 0.5,
            p.decay ?? 1.5,
            p.mix ?? 0.3,
          );
          break;
        case 'delay':
          node = createDelay(
            ctx, node,
            p.time ?? 0.3,
            p.feedback ?? 0.4,
            p.mix ?? 0.3,
          );
          break;
        case 'chorus':
          node = createChorus(
            ctx, node,
            p.rate ?? 1.5,
            p.depth ?? 0.5,
            p.mix ?? 0.3,
          );
          break;
        case 'ringmod':
          node = createRingModulator(
            ctx, node,
            p.freq ?? 200,
            p.mix ?? 0.5,
          );
          break;
        case 'distortion':
          node = applyDistortion(
            ctx, node,
            p.drive ?? 0.5,
            p.mix ?? 0.5,
          );
          break;
        case 'bitcrush':
          node = createBitCrush(
            ctx, node,
            p.bits ?? 8,
            p.mix ?? 0.5,
          );
          break;
        case 'lowpass':
          node = createLowpass(ctx, node, p.freq ?? 8000, p.q ?? 1);
          break;
        case 'highpass':
          node = createHighpass(ctx, node, p.freq ?? 200, p.q ?? 1);
          break;
        case 'compressor': {
          const comp = ctx.createDynamicsCompressor();
          comp.threshold.value = p.threshold ?? -24;
          comp.ratio.value = p.ratio ?? 4;
          comp.attack.value = p.attack ?? 0.003;
          comp.release.value = p.release ?? 0.25;
          comp.knee.value = p.knee ?? 5;
          node.connect(comp);
          node = comp;
          break;
        }
      }
    }

    return node;
  }

  /**
   * Schedule gain automation on `gainNode` to implement segment fades.
   *
   * @param gainNode       The GainNode to automate
   * @param segment        The segment providing fade durations and curves
   * @param scheduleAt     When (in context time) the segment playback begins
   * @param segPlayStart   How far into the segment we started (for resume mid-fade)
   */
  private applyFade(
    gainNode: GainNode,
    segment: AudioSegment,
    scheduleAt: number,
    segPlayStart: number,
  ): void {
    const { fadeInDuration, fadeOutDuration, fadeInCurve, fadeOutCurve, duration } = segment;
    const g = gainNode.gain;

    g.setValueAtTime(1, 0);

    // ── Fade in ────────────────────────────────────────────────────────────
    if (fadeInDuration > 0 && segPlayStart < fadeInDuration) {
      const fadeInEnd = scheduleAt + Math.max(0, fadeInDuration - segPlayStart);
      const startGain = segPlayStart > 0
        ? Math.min(1, segPlayStart / fadeInDuration)
        : 0;

      g.setValueAtTime(startGain, scheduleAt);
      applyFadeCurve(g, fadeInCurve, scheduleAt, fadeInEnd, startGain, 1);
    } else {
      g.setValueAtTime(1, scheduleAt);
    }

    // ── Fade out ───────────────────────────────────────────────────────────
    if (fadeOutDuration > 0) {
      const playEnd = scheduleAt + (duration - segPlayStart);
      const fadeOutStart = playEnd - fadeOutDuration;

      if (fadeOutStart > scheduleAt) {
        g.setValueAtTime(1, fadeOutStart);
        applyFadeCurve(g, fadeOutCurve, fadeOutStart, playEnd, 1, 0.0001);
      }
    }
  }
}

// ── Fade curve helpers ────────────────────────────────────────────────────────

function applyFadeCurve(
  param: AudioParam,
  curve: FadeCurve,
  startTime: number,
  endTime: number,
  startVal: number,
  endVal: number,
): void {
  const duration = endTime - startTime;
  if (duration <= 0) return;

  switch (curve) {
    case 'linear':
      param.linearRampToValueAtTime(endVal, endTime);
      break;

    case 'exponential':
      // exponentialRampToValueAtTime requires non-zero values
      param.exponentialRampToValueAtTime(
        Math.max(0.0001, endVal),
        endTime,
      );
      break;

    case 'scurve': {
      // Approximate S-curve via a custom curve array
      const steps = Math.max(2, Math.round(duration * 100));
      const values = new Float32Array(steps);
      const times = new Float32Array(steps);
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        // Smooth step (3t² - 2t³)
        const s = t * t * (3 - 2 * t);
        values[i] = startVal + (endVal - startVal) * s;
        times[i] = startTime + t * duration;
      }
      for (let i = 0; i < steps; i++) {
        param.setValueAtTime(values[i], times[i]);
      }
      break;
    }
  }
}
