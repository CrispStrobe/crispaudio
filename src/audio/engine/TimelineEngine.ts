import { scheduleGain } from '../../lib/mixAutomation';
import { scheduleEnvelope } from '../../lib/audioEnvelope';
import { audibleTracks } from '../../lib/timelineView';
// ---------------------------------------------------------------------------
// CrispAudio — TimelineEngine
// Real-time playback and offline rendering for timeline projects.
// ---------------------------------------------------------------------------

import type {
  TimelineProject,
  AudioSegment,
  AudioSource,
  EffectConfig,
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
    if (masterGain) {
      this.masterGain = masterGain;
    } else {
      const fallbackGain = ctx.createGain();
      fallbackGain.connect(ctx.destination);
      this.masterGain = fallbackGain;
    }
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
    const tracksToPlay = audibleTracks(project.tracks);

    for (const track of tracksToPlay) {
      if (!track.segments.length) continue;
      const trackGain = this.ctx.createGain();
      const trackStart=Math.min(...track.segments.map(clip=>clip.startTime));
      const trackEnd=Math.max(0,...track.segments.map(clip=>clip.startTime+clip.duration));
      const trackFade=this.ctx.createGain();
      scheduleEnvelope(trackFade.gain,now+Math.max(0,trackStart-startTime),Math.max(0,startTime-trackStart),trackEnd-trackStart,track.fadeInDuration??0,track.fadeOutDuration??0,track.fadeInCurve??'linear',track.fadeOutCurve??'linear');
      const automated=this.ctx.createGain();scheduleGain(automated.gain,track.automation,now,startTime);
      trackFade.connect(automated);this.applyEffects(this.ctx,automated,track.effects??[]).connect(trackGain);
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

        fadeGain.connect(trackFade);

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
    signal?: AbortSignal,
  ): Promise<AudioBuffer> {
    signal?.throwIfAborted();
    // Keep the source registry stable while graph construction yields to the UI.
    const sources = new Map(this.sources);
    let sliceStarted = performance.now();
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

    const tracksToRender = audibleTracks(project.tracks);

    for (const track of tracksToRender) {
      if (!track.segments.length) continue;
      const trackGain = offCtx.createGain();
      const trackStart=Math.min(...track.segments.map(clip=>clip.startTime));
      const trackEnd=Math.max(0,...track.segments.map(clip=>clip.startTime+clip.duration));
      const trackFade=offCtx.createGain();
      scheduleEnvelope(trackFade.gain,Math.max(0,trackStart-startTime),Math.max(0,startTime-trackStart),trackEnd-trackStart,track.fadeInDuration??0,track.fadeOutDuration??0,track.fadeInCurve??'linear',track.fadeOutCurve??'linear');
      const automated=offCtx.createGain();scheduleGain(automated.gain,track.automation,0,startTime);
      trackFade.connect(automated);this.applyEffects(offCtx,automated,track.effects??[]).connect(trackGain);
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
        signal?.throwIfAborted();
        const segEnd = segment.startTime + segment.duration;
        if (segEnd <= startTime || segment.startTime >= renderEnd) continue;

        const source = sources.get(segment.sourceId);
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

        fadeGain.connect(trackFade);

        bufSrc.start(scheduleAt, bufferOffset, playDuration);

        // Offline rendering has not started: wall-clock yields cannot shift audio.
        // Bound multi-segment setup tasks without delaying inexpensive graphs.
        if (performance.now() - sliceStarted >= 8) {
          signal?.throwIfAborted();
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          signal?.throwIfAborted();
          sliceStarted = performance.now();
        }
      }
    }

    signal?.throwIfAborted();
    // OfflineAudioContext cannot reliably stop native DSP once started. Abort
    // releases the caller promptly and discards the result, not the CPU work.
    if (!signal) return offCtx.startRendering();
    return new Promise<AudioBuffer>((resolve, reject) => {
      const onAbort = () => {
        signal.removeEventListener('abort', onAbort);
        reject(signal.reason);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        offCtx.startRendering().then(buffer => {
          signal.removeEventListener('abort', onAbort);
          if (signal.aborted) reject(signal.reason);
          else resolve(buffer);
        }, error => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        });
      } catch (error) {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    });
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
    scheduleEnvelope(gainNode.gain,scheduleAt,segPlayStart,segment.duration,segment.fadeInDuration,segment.fadeOutDuration,segment.fadeInCurve,segment.fadeOutCurve);
  }
}
