import type {AutomationTarget} from '../../lib/automationRecording';
import {scheduleMix,scheduleFeedback,scheduleDelayTime,effectParameterDefault,supportsEffectParameter} from '../../lib/effectAutomation';
import {prepareOutputLimiter,createOutputLimiter} from '../effects/OutputLimiter';
import {limiterParameters} from '../dsp/samplePeakLimiter';
import {eqParameters,isEQ} from '../../lib/equalizer';
import { scheduleGain, schedulePan } from '../../lib/mixAutomation';
import { scheduleEnvelope } from '../../lib/audioEnvelope';
import { audibleTracks } from '../../lib/timelineView';
// ---------------------------------------------------------------------------
// CrispAudio — TimelineEngine
// Real-time playback and offline rendering for timeline projects.
// ---------------------------------------------------------------------------

import type {
  TimelineProject, TimelineTrack,
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
import { createEQ } from '../effects/Filter';

// ── TimelineEngine ────────────────────────────────────────────────────────────

export class TimelineEngine {
  private ctx: AudioContext;
  private sources: Map<string, AudioSource>;
  private activeSources: AudioBufferSourceNode[] = [];
  private masterGain: GainNode;
  private limiterNode?: AudioWorkletNode;
  private limiterReduction=0;
  private compressorNodes = new Map<string,DynamicsCompressorNode>();
  async prepare(project:TimelineProject):Promise<void> {if(project.outputLimiter?.enabled)await prepareOutputLimiter(this.ctx);}
  getReduction(scope:string,index?:number):number {
    if(scope==='limiter')return this.limiterReduction;
    if(index!==undefined)return Math.max(0,-(this.compressorNodes.get(`${scope}:${index}`)?.reduction??0));
    return Math.max(0,...[...this.compressorNodes].filter(([key])=>key.startsWith(`${scope}:`)).map(([,node])=>-node.reduction));
  }
  private eqNodes = new Map<string, BiquadFilterNode>();
  private mixerNodes = new Map<string, {gain: GainNode; pan: StereoPannerNode; meter: AnalyserNode[]; points:TimelineTrack['panAutomation']; staticPan:number}>();
  private automationNodes = new Map<string, {node:GainNode; points:TimelineTrack['automation']}>();
  private mixNodes=new Map<string,{wet:AudioParam;dry:AudioParam;feedback?:AudioParam;time?:AudioParam;points:EffectConfig['automation'];mix:number;staticFeedback:number;staticTime:number}>();
  private playbackGeneration=0;
  private playbackEnd=0;
  private playbackClock=0;
  private playbackStart=0;
  private outputGain?: GainNode;
  private outputMeter?: AnalyserNode[];

  getMeter(id: string): AnalyserNode[] | undefined { return id === 'master' ? this.outputMeter : this.mixerNodes.get(id)?.meter; }

  private meterTap(ctx: AudioContext, input: AudioNode): AnalyserNode[] {
    const splitter = ctx.createChannelSplitter(2);
    input.connect(splitter);
    return [0, 1].map(channel => {
      const analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
      splitter.connect(analyser, channel); return analyser;
    });
  }

  /** Faders and audition switches update the running graph without rescheduling clips. */
  updateMix(project: TimelineProject): void {
    const audible = new Set(audibleTracks(project.tracks).map(track => track.id));
    const now = this.ctx.currentTime;
    for (const track of project.tracks) {
      const nodes = this.mixerNodes.get(track.id);
      if (!nodes) continue;
      nodes.gain.gain.setTargetAtTime(audible.has(track.id) ? track.volume : 0, now, .005);
      const automation=this.automationNodes.get(track.id);
      if(automation&&automation.points!==track.automation){
        automation.node.gain.cancelScheduledValues(now);
        scheduleGain(automation.node.gain,track.automation,now,this.playbackStart+now-this.playbackClock);
        automation.points=track.automation;
      }
      if(nodes.points!==track.panAutomation || (!track.panAutomation?.length && nodes.staticPan!==track.pan)){
        nodes.pan.pan.cancelScheduledValues(now);
        if(track.panAutomation?.length || nodes.points?.length)schedulePan(nodes.pan.pan,track.panAutomation,now,this.playbackStart+now-this.playbackClock,track.pan);
        else nodes.pan.pan.setTargetAtTime(Math.max(-1,Math.min(1,track.pan)),now,.005);
        nodes.points=track.panAutomation;nodes.staticPan=track.pan;
      }
    }
    this.outputGain?.gain.setTargetAtTime(project.masterVolume ?? 1, now, .005);
    if(this.limiterNode){const p=limiterParameters(project.outputLimiter);this.limiterNode.parameters.get('ceiling')!.setValueAtTime(p.ceiling,now);this.limiterNode.parameters.get('release')!.setValueAtTime(p.release,now);}
    const racks: [string, EffectConfig[]][] = [['master',project.masterEffects]];
    for (const track of project.tracks) {
      racks.push([`track:${track.id}`,track.effects??[]]);
      for (const clip of track.segments) racks.push([`clip:${clip.id}`,clip.effects]);
    }
    for (const [scope,effects] of racks) effects.forEach((effect,index)=>{
      const node=this.eqNodes.get(`${scope}:${index}`);
      const mix=this.mixNodes.get(`${scope}:${index}`);
      if(mix&&(mix.points!==effect.automation||(!effect.automation?.mix?.length&&mix.mix!==(effect.params.mix??effectParameterDefault(effect.type,'mix')))||(mix.feedback&&!effect.automation?.feedback?.length&&mix.staticFeedback!==(effect.params.feedback??.4))||(mix.time&&!effect.automation?.time?.length&&mix.staticTime!==(effect.params.time??.3)))){
        mix.wet.cancelScheduledValues(now);mix.dry.cancelScheduledValues(now);
        scheduleMix(mix.wet,mix.dry,effect.automation?.mix,now,this.playbackStart+now-this.playbackClock,effect.params.mix??effectParameterDefault(effect.type,'mix'));
        if(mix.feedback){mix.feedback.cancelScheduledValues(now);scheduleFeedback(mix.feedback,effect.automation?.feedback,now,this.playbackStart+now-this.playbackClock,effect.params.feedback??.4);}
        if(mix.time){mix.time.cancelScheduledValues(now);scheduleDelayTime(mix.time,effect.automation?.time,now,this.playbackStart+now-this.playbackClock,effect.params.time??.3);}
        mix.staticTime=effect.params.time??.3;mix.points=effect.automation;mix.mix=effect.params.mix??effectParameterDefault(effect.type,'mix');mix.staticFeedback=effect.params.feedback??.4;
      }
      if(!node||!isEQ(effect.type))return;
      const p=eqParameters(effect.type,effect.params,this.ctx.sampleRate);
      node.frequency.setTargetAtTime(p.freq,now,.01);node.Q.setTargetAtTime(p.q,now,.01);node.gain.setTargetAtTime(p.gain,now,.01);
    });
  }

  /** Audio-clock position and generation let a local pass reject seeks/loops/restarts. */
  automationClock():{time:number;start:number;generation:number}|undefined {
    if(!this.outputGain)return;
    return {time:Math.min(this.playbackEnd,this.playbackStart+this.ctx.currentTime-this.playbackClock),start:this.playbackStart,generation:this.playbackGeneration};
  }
  /** Audition one lane without changing the project or rebuilding DSP. Undefined restores Read. */
  previewAutomation(project:TimelineProject,target:AutomationTarget,value?:number):boolean {
    const track=project.tracks.find(t=>t.id===target.trackId);if(!track)return false;
    const now=this.ctx.currentTime,time=this.playbackStart+now-this.playbackClock;
    if(target.parameter==='gain'){
      const param=this.automationNodes.get(track.id)?.node.gain;if(!param)return false;
      param.cancelScheduledValues(now);if(value===undefined)scheduleGain(param,track.automation,now,time);else param.setValueAtTime(value,now);return true;
    }
    if(target.parameter==='pan'){
      const param=this.mixerNodes.get(track.id)?.pan.pan;if(!param)return false;
      param.cancelScheduledValues(now);if(value===undefined)schedulePan(param,track.panAutomation,now,time,track.pan);else param.setValueAtTime(value,now);return true;
    }
    const nodes=this.mixNodes.get(`track:${track.id}:${target.effectIndex}`),effect=track.effects?.[target.effectIndex??-1];if(!nodes||!effect||!supportsEffectParameter(effect.type,target.parameter))return false;
    if(target.parameter==='mix'){
      nodes.wet.cancelScheduledValues(now);nodes.dry.cancelScheduledValues(now);
      scheduleMix(nodes.wet,nodes.dry,value===undefined?effect.automation?.mix:[],now,time,value??effect.params.mix??effectParameterDefault(effect.type,'mix'));
    }else if(target.parameter==='time'&&nodes.time){
      nodes.time.cancelScheduledValues(now);scheduleDelayTime(nodes.time,value===undefined?effect.automation?.time:[],now,time,value??effect.params.time??.3);
    }else if(nodes.feedback){
      nodes.feedback.cancelScheduledValues(now);scheduleFeedback(nodes.feedback,value===undefined?effect.automation?.feedback:[],now,time,value??effect.params.feedback??.4);
    }
    return true;
  }

  private playbackNodes = new Set<AudioNode>();

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
  play(project: TimelineProject, startTime: number, endTime = project.duration): void {
    this.stop();

    // Capture all nodes created by this graph, including effect oscillators and
    // feedback loops, so repeated play/stop cannot leave a live processing graph.
    const nodes = this.playbackNodes;
    const ctx = new Proxy(this.ctx, {
      get(target, key) {
        const value = Reflect.get(target, key, target);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          const result = value.apply(target, args);
          if (String(key).startsWith('create') && result && typeof result.disconnect === 'function') nodes.add(result);
          return result;
        };
      },
    });
    const masterInput = ctx.createGain();
    const now = ctx.currentTime;
    this.playbackClock=now;this.playbackStart=startTime;this.playbackEnd=endTime;
    const rangeGate = ctx.createGain();
    const outputGain = ctx.createGain();
    outputGain.gain.value = project.masterVolume ?? 1;
    this.outputGain = outputGain;
    let output:AudioNode=outputGain;
    if(project.outputLimiter?.enabled){
      const limiter=createOutputLimiter(this.ctx,project.outputLimiter);this.playbackNodes.add(limiter);this.limiterNode=limiter;
      limiter.port.onmessage=e=>{this.limiterReduction=Number(e.data.reduction)||0;};
      outputGain.connect(limiter);output=limiter;
    }
    this.outputMeter = this.meterTap(ctx, output);
    rangeGate.connect(outputGain);
    output.connect(this.masterGain);
    rangeGate.gain.setValueAtTime(1, now);
    rangeGate.gain.setValueAtTime(0, now + Math.max(0, endTime - startTime));
    this.applyEffects(ctx, masterInput, project.masterEffects, 'master').connect(rangeGate);
    const audible = new Set(audibleTracks(project.tracks).map(track => track.id));
    const tracksToPlay = project.tracks;

    for (const track of tracksToPlay) {
      if (!track.segments.length) continue;
      const trackGain = ctx.createGain();
      const trackStart=Math.min(...track.segments.map(clip=>clip.startTime));
      const trackEnd=Math.max(0,...track.segments.map(clip=>clip.startTime+clip.duration));
      const trackFade=ctx.createGain();
      scheduleEnvelope(trackFade.gain,now+Math.max(0,trackStart-startTime),Math.max(0,startTime-trackStart),trackEnd-trackStart,track.fadeInDuration??0,track.fadeOutDuration??0,track.fadeInCurve??'linear',track.fadeOutCurve??'linear');
      const automated=ctx.createGain();scheduleGain(automated.gain,track.automation,now,startTime);
      this.playbackClock=now;this.playbackStart=startTime;this.playbackEnd=endTime;
      this.automationNodes.set(track.id,{node:automated,points:track.automation});
      trackFade.connect(automated);this.applyEffects(ctx,automated,track.effects??[],`track:${track.id}`).connect(trackGain);
      trackGain.gain.value = audible.has(track.id) ? track.volume : 0;

      const panner = ctx.createStereoPanner();
      schedulePan(panner.pan,track.panAutomation,now,startTime,track.pan);
      const meter = this.meterTap(ctx, panner);
      trackGain.connect(panner);
      panner.connect(masterInput);
      this.mixerNodes.set(track.id, {gain: trackGain, pan: panner, meter,points:track.panAutomation,staticPan:track.pan});

      for (const segment of track.segments) {
        const segEnd = segment.startTime + segment.duration;
        if (segEnd <= startTime) continue; // already past

        const source = this.sources.get(segment.sourceId);
        if (!source) continue;

        // How far into the segment do we start?
        const segPlayStart = Math.max(0, startTime - segment.startTime);
        const bufferOffset = segment.sourceOffset + segPlayStart;
        const playDuration = Math.min(segment.duration - segPlayStart, endTime - Math.max(startTime, segment.startTime));

        if (playDuration <= 0) continue;

        // When (in AudioContext time) should this segment start?
        const contextStartTime = now + Math.max(0, segment.startTime - startTime);

        const bufSrc = ctx.createBufferSource();
        bufSrc.buffer = source.buffer;

        const segGain = ctx.createGain();
        segGain.gain.value = segment.gain;

        bufSrc.connect(segGain);

        // Apply effects chain
        let currentNode: AudioNode = segGain;
        currentNode = this.applyEffects(ctx, currentNode, segment.effects, `clip:${segment.id}`);

        // Apply fades via gain automation
        const fadeGain = ctx.createGain();
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
    this.playbackGeneration++;
    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Already stopped
      }
    }
    const stopped = new Set<AudioNode>(this.activeSources);
    this.activeSources = [];
    for (const node of this.playbackNodes) {
      if (!stopped.has(node) && 'stop' in node && typeof node.stop === 'function') {
        try { node.stop(); } catch { /* source may already have ended */ }
      }
      try { node.disconnect(); } catch { /* already disconnected */ }
    }
    this.playbackNodes.clear();
    this.mixerNodes.clear();this.automationNodes.clear();this.mixNodes.clear();
    this.eqNodes.clear();this.compressorNodes.clear();
    if(this.limiterNode){this.limiterNode.port.postMessage({type:'dispose'});this.limiterNode.port.close();}
    this.limiterNode=undefined;this.limiterReduction=0;
    this.outputGain = undefined;
    this.outputMeter = undefined;
  }

  // ── Offline render ─────────────────────────────────────────────────────────

  /** Preserve DSP history at range start, then crop at exact sample boundaries. */
  async renderMixRange(project:TimelineProject,start:number,end:number,signal?:AbortSignal):Promise<AudioBuffer>{
    signal?.throwIfAborted();
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>project.duration)throw new Error('Invalid audio export range');
    const first=Math.round(start*project.sampleRate),last=Math.round(end*project.sampleRate);
    if(last<=first)throw new Error('Empty audio export range');
    const full=await this.renderToBuffer(project,0,last/project.sampleRate,signal);
    signal?.throwIfAborted();
    const result=this.ctx.createBuffer(full.numberOfChannels,last-first,project.sampleRate);
    for(let ch=0;ch<full.numberOfChannels;ch++)result.copyToChannel(full.getChannelData(ch).subarray(first,last),ch);
    return result;
  }

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
    masterGain.gain.value = project.masterVolume ?? 1;
    if(project.outputLimiter?.enabled){
      await prepareOutputLimiter(offCtx);signal?.throwIfAborted();
      masterGain.connect(createOutputLimiter(offCtx,project.outputLimiter)).connect(offCtx.destination);
    }else masterGain.connect(offCtx.destination);

    // Same track → master-rack → output routing as realtime playback.
    const masterOut = offCtx.createGain();
    this.applyEffects(offCtx, masterOut, project.masterEffects,undefined,startTime).connect(masterGain);

    const tracksToRender = audibleTracks(project.tracks);

    for (const track of tracksToRender) {
      if (!track.segments.length) continue;
      const trackGain = offCtx.createGain();
      const trackStart=Math.min(...track.segments.map(clip=>clip.startTime));
      const trackEnd=Math.max(0,...track.segments.map(clip=>clip.startTime+clip.duration));
      const trackFade=offCtx.createGain();
      scheduleEnvelope(trackFade.gain,Math.max(0,trackStart-startTime),Math.max(0,startTime-trackStart),trackEnd-trackStart,track.fadeInDuration??0,track.fadeOutDuration??0,track.fadeInCurve??'linear',track.fadeOutCurve??'linear');
      const automated=offCtx.createGain();scheduleGain(automated.gain,track.automation,0,startTime);
      trackFade.connect(automated);this.applyEffects(offCtx,automated,track.effects??[],undefined,startTime).connect(trackGain);
      trackGain.gain.value = track.volume;

      const panner = offCtx.createStereoPanner();
      schedulePan(panner.pan,track.panAutomation,0,startTime,track.pan);
      trackGain.connect(panner);
      panner.connect(masterOut);

      for (const segment of track.segments) {
        signal?.throwIfAborted();
        const segEnd = segment.startTime + segment.duration;
        if (segEnd <= startTime || segment.startTime >= renderEnd) continue;

        const source = sources.get(segment.sourceId);
        if (!source) continue;

        const segPlayStart = Math.max(0, startTime - segment.startTime);
        const bufferOffset = segment.sourceOffset + segPlayStart;
        // The offline context crops at renderEnd. An artificial source stop at
        // that boundary changes oversampling in the final processing block.
        const playDuration = segment.duration - segPlayStart;

        if (playDuration <= 0) continue;

        const scheduleAt = Math.max(0, segment.startTime - startTime);

        const bufSrc = offCtx.createBufferSource();
        bufSrc.buffer = source.buffer;

        const segGain = offCtx.createGain();
        segGain.gain.value = segment.gain;

        bufSrc.connect(segGain);

        let currentNode: AudioNode = segGain;
        currentNode = this.applyEffects(offCtx, currentNode, segment.effects,undefined,startTime);

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
    scope?: string,
    timelineStart=0,
  ): AudioNode {
    let node: AudioNode = input;

    for (const [index,fx] of effects.entries()) {
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
            (wet,dry,feedback,time)=>{
              scheduleMix(wet,dry,fx.automation?.mix,scope!==undefined?this.playbackClock:0,scope!==undefined?this.playbackStart:timelineStart,p.mix??.3);
              scheduleFeedback(feedback,fx.automation?.feedback,scope!==undefined?this.playbackClock:0,scope!==undefined?this.playbackStart:timelineStart,p.feedback??.4);
              scheduleDelayTime(time,fx.automation?.time,scope!==undefined?this.playbackClock:0,scope!==undefined?this.playbackStart:timelineStart,p.time??.3);
              if(scope)this.mixNodes.set(`${scope}:${index}`,{wet,dry,feedback,time,points:fx.automation,mix:p.mix??.3,staticFeedback:p.feedback??.4,staticTime:p.time??.3});
            },
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
            (wet,dry)=>{scheduleMix(wet,dry,fx.automation?.mix,scope!==undefined?this.playbackClock:0,scope!==undefined?this.playbackStart:timelineStart,p.mix??.5);if(scope)this.mixNodes.set(`${scope}:${index}`,{wet,dry,points:fx.automation,mix:p.mix??.5,staticFeedback:0,staticTime:0});},
          );
          break;
        case 'distortion':
          node = applyDistortion(
            ctx, node,
            p.drive ?? 0.5,
            p.mix ?? 0.5,
            'tanh',
            (wet,dry)=>{scheduleMix(wet,dry,fx.automation?.mix,scope!==undefined?this.playbackClock:0,scope!==undefined?this.playbackStart:timelineStart,p.mix??.5);if(scope)this.mixNodes.set(`${scope}:${index}`,{wet,dry,points:fx.automation,mix:p.mix??.5,staticFeedback:0,staticTime:0});},
          );
          break;
        case 'bitcrush':
          node = createBitCrush(
            ctx, node,
            p.bits ?? 8,
            p.mix ?? 0.5,
            (wet,dry)=>{scheduleMix(wet,dry,fx.automation?.mix,scope!==undefined?this.playbackClock:0,scope!==undefined?this.playbackStart:timelineStart,p.mix??.5);if(scope)this.mixNodes.set(`${scope}:${index}`,{wet,dry,points:fx.automation,mix:p.mix??.5,staticFeedback:0,staticTime:0});},
          );
          break;
        case 'lowpass':
        case 'highpass':
        case 'peaking':
        case 'lowshelf':
        case 'highshelf': {
          const filter=createEQ(ctx,node,fx.type,p);
          if(scope)this.eqNodes.set(`${scope}:${index}`,filter);
          node=filter;break;
        }
        case 'compressor': {
          const comp = ctx.createDynamicsCompressor();
          if(scope)this.compressorNodes.set(`${scope}:${index}`,comp);
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
