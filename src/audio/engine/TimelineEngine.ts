import {projectPluginTransport} from '../plugins/PluginTransport';
import {prepareNativeTimelineGraph,type NativeTimelineGraph,type NativeTimelineRacks} from '../plugins/NativeTimelineGraph';
import {compensatedConnection,disposeCompensation} from '../plugins/GraphCompensation';
import {graphClock,outputRoute,sendRoute,type GraphLatency} from '../../lib/graphLatency';
import {prepareLoudness,createLoudness} from '../effects/Loudness';
import type {LoudnessReading} from '../dsp/loudness';
import {prepareDucking,createDucking} from '../effects/Ducking';
import {routingOrder} from '../../lib/audioRouting';
import type {AutomationTarget} from '../../lib/automationRecording';
import {scheduleMix,scheduleRingFrequency,type DelayParameter,scheduleChorusDepth,scheduleChorusRate,scheduleFeedback,scheduleDelayTime,effectParameterDefault,supportsEffectParameter} from '../../lib/effectAutomation';
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
  private loudnessReady=false;
  private loudnessNode?:AudioWorkletNode;
  private loudnessReading?:LoudnessReading;
  getLoudness(){return this.loudnessReading;}
  resetLoudness(){this.loudnessReading=undefined;this.loudnessNode?.port.postMessage({type:'reset'});}
  private compressorNodes = new Map<string,DynamicsCompressorNode>();
  async prepare(project:TimelineProject):Promise<void> {if(project.outputLimiter?.enabled)await prepareOutputLimiter(this.ctx);if(project.tracks.some(t=>t.ducking))await prepareDucking(this.ctx);if(this.ctx.audioWorklet){await prepareLoudness(this.ctx);this.loudnessReady=true;}}
  getReduction(scope:string,index?:number):number {
    if(scope==='limiter')return this.limiterReduction;
    if(index!==undefined)return Math.max(0,-(this.compressorNodes.get(`${scope}:${index}`)?.reduction??0));
    return Math.max(0,...[...this.compressorNodes].filter(([key])=>key.startsWith(`${scope}:`)).map(([,node])=>-node.reduction));
  }
  private eqNodes = new Map<string, BiquadFilterNode>();
  private mixerNodes = new Map<string, {gain: GainNode; pan: StereoPannerNode; meter: AnalyserNode[]; points:TimelineTrack['panAutomation']; staticPan:number}>();
  private automationNodes = new Map<string, {node:GainNode; points:TimelineTrack['automation']}>();
  private mixNodes=new Map<string,{wet:AudioParam;dry:AudioParam;dryScale?:number;feedback?:AudioParam;time?:AudioParam;depth?:[AudioParam,AudioParam];staticDepth?:number;rate?:[AudioParam,AudioParam];staticRate?:number;freq?:AudioParam;staticFreq?:number;points:EffectConfig['automation'];mix:number;staticFeedback:number;staticTime:number}>();
  private duckingNodes=new Map<string,AudioWorkletNode>();
  private routingGains=new Map<string,GainNode>();
  private clockListeners=new Set<()=>void>();
  onPlaybackClock(listener:()=>void):()=>void{this.clockListeners.add(listener);return()=>{this.clockListeners.delete(listener);};}
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
        scheduleGain(automation.node.gain,track.automation,now,this.playbackStart+now-this.scopeClock(`gain:${track.id}`));
        automation.points=track.automation;
      }
      if(nodes.points!==track.panAutomation || (!track.panAutomation?.length && nodes.staticPan!==track.pan)){
        nodes.pan.pan.cancelScheduledValues(now);
        if(track.panAutomation?.length || nodes.points?.length)schedulePan(nodes.pan.pan,track.panAutomation,now,this.playbackStart+now-this.scopeClock(`pan:${track.id}`),track.pan);
        else nodes.pan.pan.setTargetAtTime(Math.max(-1,Math.min(1,track.pan)),now,.005);
        nodes.points=track.panAutomation;nodes.staticPan=track.pan;
      }
    }
    for(const track of project.tracks){
      if(track.ducking)for(const [key,value] of Object.entries(track.ducking))if(key!=='source')this.duckingNodes.get(track.id)?.parameters.get(key)?.setValueAtTime(Number(value),now);
      this.routingGains.get(`pre:${track.id}`)?.gain.setTargetAtTime(audible.has(track.id)?1:0,now,.005);
      for(const send of track.sends??[])this.routingGains.get(`${track.id}:${send.id}`)?.gain.setTargetAtTime(send.gain,now,.005);
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
      if(mix&&(mix.points!==effect.automation||(!effect.automation?.mix?.length&&mix.mix!==(effect.params.mix??effectParameterDefault(effect.type,'mix')))||(mix.feedback&&!effect.automation?.feedback?.length&&mix.staticFeedback!==(effect.params.feedback??.4))||(mix.time&&!effect.automation?.time?.length&&mix.staticTime!==(effect.params.time??.3))||(mix.depth&&!effect.automation?.depth?.length&&mix.staticDepth!==(effect.params.depth??.5))||(mix.freq&&!effect.automation?.freq?.length&&mix.staticFreq!==(effect.params.freq??200))||(mix.rate&&!effect.automation?.rate?.length&&mix.staticRate!==(effect.params.rate??1.5)))){
        mix.wet.cancelScheduledValues(now);mix.dry.cancelScheduledValues(now);
        scheduleMix(mix.wet,mix.dry,effect.automation?.mix,now,this.playbackStart+now-this.scopeClock(scope),effect.params.mix??effectParameterDefault(effect.type,'mix'),mix.dryScale);
        if(mix.feedback){mix.feedback.cancelScheduledValues(now);scheduleFeedback(mix.feedback,effect.automation?.feedback,now,this.playbackStart+now-this.scopeClock(scope),effect.params.feedback??.4);}
        if(mix.time){mix.time.cancelScheduledValues(now);scheduleDelayTime(mix.time,effect.automation?.time,now,this.playbackStart+now-this.scopeClock(scope),effect.params.time??.3);}
        if(mix.depth){for(const param of mix.depth)param.cancelScheduledValues(now);scheduleChorusDepth(mix.depth,effect.automation?.depth,now,this.playbackStart+now-this.scopeClock(scope),effect.params.depth??.5);mix.staticDepth=effect.params.depth??.5;}
        if(mix.rate){for(const param of mix.rate)param.cancelScheduledValues(now);scheduleChorusRate(mix.rate,effect.automation?.rate,now,this.playbackStart+now-this.scopeClock(scope),effect.params.rate??1.5);mix.staticRate=effect.params.rate??1.5;}
        if(mix.freq){mix.freq.cancelScheduledValues(now);scheduleRingFrequency(mix.freq,effect.automation?.freq,now,this.playbackStart+now-this.scopeClock(scope),effect.params.freq??200);mix.staticFreq=effect.params.freq??200;}
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
    return {time:Math.max(this.playbackStart,Math.min(this.playbackEnd,this.playbackStart+this.ctx.currentTime-this.playbackClock)),start:this.playbackStart,generation:this.playbackGeneration};
  }
  /** Exact graph origin for capture placement; read after play(), not before graph creation. */
  playbackAnchor():{frame:number;timeline:number}|undefined {
    if(!this.outputGain)return;
    return {frame:Math.round(this.playbackClock*this.ctx.sampleRate),timeline:this.playbackStart};
  }
  /** Audition one lane without changing the project or rebuilding DSP. Undefined restores Read. */
  previewAutomation(project:TimelineProject,target:AutomationTarget,value?:number):boolean {
    const track=project.tracks.find(t=>t.id===target.trackId);if(!track)return false;
    const now=this.ctx.currentTime,time=this.playbackStart+now-this.scopeClock(`${target.parameter}:${track.id}`);
    if(target.parameter==='gain'){
      const param=this.automationNodes.get(track.id)?.node.gain;if(!param)return false;
      param.cancelScheduledValues(now);if(value===undefined)scheduleGain(param,track.automation,now,time);else param.setValueAtTime(value,now);return true;
    }
    if(target.parameter==='pan'){
      const param=this.mixerNodes.get(track.id)?.pan.pan;if(!param)return false;
      param.cancelScheduledValues(now);if(value===undefined)schedulePan(param,track.panAutomation,now,time,track.pan);else param.setValueAtTime(value,now);return true;
    }
    return this.previewEffectAutomation(project,`track:${track.id}`,target.effectIndex??-1,target.parameter,value);
  }
  /** Preview a real rack scope, retaining every DSP node and oscillator phase. */
  previewEffectAutomation(project:TimelineProject,scope:string,index:number,parameter:DelayParameter,value?:number):boolean{
    const effect=(scope==='master'?project.masterEffects:scope.startsWith('track:')?project.tracks.find(t=>t.id===scope.slice(6))?.effects:project.tracks.flatMap(t=>t.segments).find(c=>scope===`clip:${c.id}`)?.effects)?.[index];
    const nodes=this.mixNodes.get(`${scope}:${index}`);if(!nodes||!effect||!supportsEffectParameter(effect.type,parameter))return false;
    const now=this.ctx.currentTime,time=this.playbackStart+now-this.scopeClock(scope);
    if(parameter==='mix'){
      nodes.wet.cancelScheduledValues(now);nodes.dry.cancelScheduledValues(now);
      scheduleMix(nodes.wet,nodes.dry,value===undefined?effect.automation?.mix:[],now,time,value??effect.params.mix??effectParameterDefault(effect.type,'mix'),nodes.dryScale);
    }else if(parameter==='time'&&nodes.time){
      nodes.time.cancelScheduledValues(now);scheduleDelayTime(nodes.time,value===undefined?effect.automation?.time:[],now,time,value??effect.params.time??.3);
    }else if(parameter==='rate'&&nodes.rate){
      for(const param of nodes.rate)param.cancelScheduledValues(now);scheduleChorusRate(nodes.rate,value===undefined?effect.automation?.rate:[],now,time,value??effect.params.rate??1.5);
    }else if(parameter==='depth'&&nodes.depth){
      for(const param of nodes.depth)param.cancelScheduledValues(now);scheduleChorusDepth(nodes.depth,value===undefined?effect.automation?.depth:[],now,time,value??effect.params.depth??.5);
    }else if(parameter==='freq'&&nodes.freq){nodes.freq.cancelScheduledValues(now);if(value===undefined)scheduleRingFrequency(nodes.freq,effect.automation?.freq,now,time,effect.params.freq??200);else nodes.freq.setValueAtTime(value,now);
    }else if(nodes.feedback){
      nodes.feedback.cancelScheduledValues(now);scheduleFeedback(nodes.feedback,value===undefined?effect.automation?.feedback:[],now,time,value??effect.params.feedback??.4);
    }
    return true;
  }

  private playbackNodes = new Set<AudioNode>();
  private compensationNodes=new Set<AudioWorkletNode>();
  private nativeGraph?:NativeTimelineGraph;
  private nativeClosing:Promise<void>=Promise.resolve();
  private nativePreparation?:AbortController;
  private scopeClocks=new Map<string,number>();
  private scopeClock(scope:string){return this.scopeClocks.get(scope)??this.playbackClock;}

  /** Internal native playback entry point. Track UI/export activation remains separate. */
  async playNative(project:TimelineProject,startTime:number,endTime:number,racks:NativeTimelineRacks,onFault:(reason:string)=>void):Promise<void>{
    routingOrder(project.tracks);
    if(!Number.isFinite(startTime)||startTime<0||!Number.isFinite(endTime)||endTime<=startTime||endTime>project.duration)throw new Error('Invalid native playback range');
    project=structuredClone(project);const sources=new Map(this.sources),transport=projectPluginTransport(project,startTime,this.ctx.sampleRate);
    racks=new Map([...racks].map(([scope,entries])=>[scope,entries.map(entry=>({...entry,parameters:{...entry.parameters}}))]));
    this.stop();const generation=this.playbackGeneration,controller=new AbortController();this.nativePreparation=controller;
    let graph:NativeTimelineGraph|undefined;
    try{
      await this.nativeClosing;controller.signal.throwIfAborted();
      await this.prepare(project);controller.signal.throwIfAborted();
      graph=await prepareNativeTimelineGraph(this.ctx,project,racks,controller.signal,reason=>{if(this.playbackGeneration===generation){this.stop();onFault(reason);}},transport);
      controller.signal.throwIfAborted();
      this.nativeGraph=graph;
      this.buildPlayback(project,startTime,endTime,graph,sources);
    }catch(error){await graph?.close();if(this.playbackGeneration===generation)this.stop();throw error;}
  }


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
    routingOrder(project.tracks);
    this.stop();
    try{this.buildPlayback(project,startTime,endTime);}catch(error){this.stop();throw error;}
  }

  private buildPlayback(project:TimelineProject,startTime:number,endTime:number,native?:NativeTimelineGraph,sources=this.sources):void{
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
    const clock=native?graphClock(ctx.currentTime,ctx.sampleRate,native.plan.output,startTime,endTime,4096):undefined;
    const now=clock?clock.input/ctx.sampleRate:ctx.currentTime;
    const audibleTime=clock?clock.audible/ctx.sampleRate:now;
    const connect=(input:AudioNode,output:AudioNode,frames:number,port=0)=>compensatedConnection(this.ctx,input,output,frames,this.compensationNodes,port);
    const rack=(scope:string,input:AudioNode,effects:EffectConfig[],arrival:number)=>{
      this.scopeClocks.set(scope,now+arrival/ctx.sampleRate);
      const built=this.applyEffects(ctx,input,effects,scope);
      return native?native.connect(scope,built,clock!.input+arrival,this.playbackNodes):built;
    };
    this.playbackClock=audibleTime;this.playbackStart=startTime;this.playbackEnd=endTime;
    const rangeGate = ctx.createGain();
    const outputGain = ctx.createGain();
    outputGain.gain.value = project.masterVolume ?? 1;
    this.outputGain = outputGain;
    for(const listener of this.clockListeners)listener();
    let output:AudioNode=outputGain;
    if(project.outputLimiter?.enabled){
      const limiter=createOutputLimiter(this.ctx,project.outputLimiter);this.playbackNodes.add(limiter);this.limiterNode=limiter;
      limiter.port.onmessage=e=>{this.limiterReduction=Number(e.data.reduction)||0;};
      outputGain.connect(limiter);output=limiter;
    }
    if(this.loudnessReady){const meter=createLoudness(this.ctx);this.playbackNodes.add(meter);meter.port.onmessage=e=>{this.loudnessReading=e.data;};output.connect(meter);output=meter;this.loudnessNode=meter;this.loudnessReading=undefined;}
    this.outputMeter = this.meterTap(ctx, output);
    rangeGate.connect(outputGain);
    output.connect(this.masterGain);
    rangeGate.gain.setValueAtTime(clock?0:1,ctx.currentTime);
    rangeGate.gain.setValueAtTime(1,audibleTime);
    rangeGate.gain.setValueAtTime(0,audibleTime+Math.max(0,endTime-startTime));
    rack('master',masterInput,project.masterEffects,native?.plan.masterInput??0).connect(rangeGate);
    if(clock){const boundary=ctx.createBufferSource();boundary.buffer=ctx.createBuffer(1,1,ctx.sampleRate);boundary.connect(rangeGate);const generation=this.playbackGeneration;boundary.onended=()=>{if(this.playbackGeneration===generation)this.stop();};boundary.start(clock.endFrame/ctx.sampleRate);this.activeSources.push(boundary);}
    const audible = new Set(audibleTracks(project.tracks).map(track => track.id));
    const busInputs=new Map(project.tracks.filter(t=>t.kind==='bus').map(t=>[t.id,ctx.createGain()]));
    const posts=new Map(project.tracks.map(t=>[t.id,ctx.createGain()]));
    const ducks=this.buildDucking(this.ctx,project.tracks,posts,true,native?.plan);
    const tracksToPlay = project.tracks;

    for (const track of tracksToPlay) {
      if (!track.segments.length&&track.kind!=='bus'&&!native) continue;
      const latency=native?.plan.tracks.get(track.id);
      const inputTime=now+(latency?.input??0)/ctx.sampleRate;
      const postTime=now+(latency?.output??0)/ctx.sampleRate;
      this.scopeClocks.set(`gain:${track.id}`,inputTime);this.scopeClocks.set(`pan:${track.id}`,postTime);
      const trackGain = ctx.createGain();
      const trackStart=Math.min(...track.segments.map(clip=>clip.startTime));
      const trackEnd=Math.max(0,...track.segments.map(clip=>clip.startTime+clip.duration));
      const trackFade=ctx.createGain();
      if(track.kind!=='bus'&&track.segments.length)scheduleEnvelope(trackFade.gain,inputTime+Math.max(0,trackStart-startTime),Math.max(0,startTime-trackStart),trackEnd-trackStart,track.fadeInDuration??0,track.fadeOutDuration??0,track.fadeInCurve??'linear',track.fadeOutCurve??'linear');
      const automated=ctx.createGain();scheduleGain(automated.gain,track.automation,inputTime,startTime);
      this.automationNodes.set(track.id,{node:automated,points:track.automation});
      busInputs.get(track.id)?.connect(trackFade);
      trackFade.connect(automated);const inserted=rack(`track:${track.id}`,automated,track.effects??[],latency?.input??0);const duck=ducks.get(track.id);if(duck)connect(inserted,duck,latency?.ducking?.program??0);const processed=duck??inserted;processed.connect(trackGain);
      const pre=ctx.createGain();pre.gain.value=audible.has(track.id)?1:0;processed.connect(pre);this.routingGains.set(`pre:${track.id}`,pre);
      trackGain.gain.value = audible.has(track.id) ? track.volume : 0;

      const panner = ctx.createStereoPanner();
      schedulePan(panner.pan,track.panAutomation,postTime,startTime,track.pan);
      const meter = this.meterTap(ctx, panner);
      trackGain.connect(panner);
      panner.connect(posts.get(track.id)!);this.connectRouting(ctx,track,pre,posts.get(track.id)!,busInputs,masterInput,true,native?.plan);
      this.mixerNodes.set(track.id, {gain: trackGain, pan: panner, meter,points:track.panAutomation,staticPan:track.pan});

      for (const segment of track.segments) {
        const segEnd = segment.startTime + segment.duration;
        if (segEnd <= startTime) continue; // already past

        const source = sources.get(segment.sourceId);
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
        currentNode = rack(`clip:${segment.id}`,currentNode,segment.effects,0);

        // Apply fades via gain automation
        const fadeGain = ctx.createGain();
        currentNode.connect(fadeGain);
        this.applyFade(fadeGain, segment, contextStartTime+(native?.latencies.clips.get(segment.id)??0)/ctx.sampleRate, segPlayStart);

        connect(fadeGain,trackFade,latency?.clips.get(segment.id)??0);

        bufSrc.start(contextStartTime, bufferOffset, playDuration);
        this.activeSources.push(bufSrc);
      }
    }
  }

  /** Stop all active playback immediately. */
  stop(): void {
    this.playbackGeneration++;
    this.nativePreparation?.abort();this.nativePreparation=undefined;
    const native=this.nativeGraph;this.nativeGraph=undefined;if(native)this.nativeClosing=Promise.allSettled([this.nativeClosing,native.close()]).then(()=>{});
    disposeCompensation(this.compensationNodes);this.scopeClocks.clear();
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
    for(const node of this.duckingNodes.values()){node.port.postMessage({type:'dispose'});node.port.close();}this.duckingNodes.clear();
    this.routingGains.clear();this.mixerNodes.clear();this.automationNodes.clear();this.mixNodes.clear();
    this.eqNodes.clear();this.compressorNodes.clear();
    if(this.limiterNode){this.limiterNode.port.postMessage({type:'dispose'});this.limiterNode.port.close();}
    this.limiterNode=undefined;this.limiterReduction=0;
    if(this.loudnessNode){this.loudnessNode.port.postMessage({type:'dispose'});this.loudnessNode.port.close();this.loudnessNode=undefined;}
    this.outputGain = undefined;
    for(const listener of this.clockListeners)listener();
    this.outputMeter = undefined;
  }

  // ── Offline render ─────────────────────────────────────────────────────────

  /** Preserve DSP history at range start, then crop at exact sample boundaries. */
  async renderMixRange(project:TimelineProject,start:number,end:number,signal?:AbortSignal,sourceSnapshot?:Map<string,AudioSource>):Promise<AudioBuffer>{
    signal?.throwIfAborted();
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>project.duration)throw new Error('Invalid audio export range');
    const first=Math.round(start*project.sampleRate),last=Math.round(end*project.sampleRate);
    if(last<=first)throw new Error('Empty audio export range');
    const full=await this.renderToBuffer(project,0,last/project.sampleRate,signal,sourceSnapshot);
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
    sourceSnapshot?: Map<string,AudioSource>,
  ): Promise<AudioBuffer> {
    signal?.throwIfAborted();
    routingOrder(project.tracks);
    // Keep the source registry stable while graph construction yields to the UI.
    const sources = new Map(sourceSnapshot??this.sources);
    let sliceStarted = performance.now();
    const renderEnd = endTime ?? project.duration;
    const renderDuration = Math.max(0.01, renderEnd - startTime);
    const sampleRate = project.sampleRate;
    const frames = Math.ceil(renderDuration * sampleRate);

    const offCtx = new OfflineAudioContext(2, frames, sampleRate);
    if(project.tracks.some(t=>t.ducking)){await prepareDucking(offCtx);signal?.throwIfAborted();}

    const masterGain = offCtx.createGain();
    masterGain.gain.value = project.masterVolume ?? 1;
    if(project.outputLimiter?.enabled){
      await prepareOutputLimiter(offCtx);signal?.throwIfAborted();
      masterGain.connect(createOutputLimiter(offCtx,project.outputLimiter)).connect(offCtx.destination);
    }else masterGain.connect(offCtx.destination);

    // Same track → master-rack → output routing as realtime playback.
    const masterOut = offCtx.createGain();
    this.applyEffects(offCtx, masterOut, project.masterEffects,undefined,startTime).connect(masterGain);

    const busInputs=new Map(project.tracks.filter(t=>t.kind==='bus').map(t=>[t.id,offCtx.createGain()]));
    const posts=new Map(project.tracks.map(t=>[t.id,offCtx.createGain()]));
    const ducks=this.buildDucking(offCtx,project.tracks,posts,false);
    const audible=new Set(audibleTracks(project.tracks).map(t=>t.id));
    const tracksToRender = project.tracks.filter(t=>audible.has(t.id)||t.kind==='bus');

    for (const track of tracksToRender) {
      if (!track.segments.length&&track.kind!=='bus') continue;
      const trackGain = offCtx.createGain();
      const trackStart=Math.min(...track.segments.map(clip=>clip.startTime));
      const trackEnd=Math.max(0,...track.segments.map(clip=>clip.startTime+clip.duration));
      const trackFade=offCtx.createGain();
      if(track.kind!=='bus')scheduleEnvelope(trackFade.gain,Math.max(0,trackStart-startTime),Math.max(0,startTime-trackStart),trackEnd-trackStart,track.fadeInDuration??0,track.fadeOutDuration??0,track.fadeInCurve??'linear',track.fadeOutCurve??'linear');
      const automated=offCtx.createGain();scheduleGain(automated.gain,track.automation,0,startTime);
      busInputs.get(track.id)?.connect(trackFade);
      trackFade.connect(automated);const inserted=this.applyEffects(offCtx,automated,track.effects??[],undefined,startTime);const duck=ducks.get(track.id);if(duck)inserted.connect(duck);const processed=duck??inserted;processed.connect(trackGain);
      const pre=offCtx.createGain();pre.gain.value=audible.has(track.id)?1:0;processed.connect(pre);
      trackGain.gain.value = audible.has(track.id)?track.volume:0;

      const panner = offCtx.createStereoPanner();
      schedulePan(panner.pan,track.panAutomation,0,startTime,track.pan);
      trackGain.connect(panner);
      panner.connect(posts.get(track.id)!);this.connectRouting(offCtx,track,pre,posts.get(track.id)!,busInputs,masterOut,false);

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

  private buildDucking(ctx:BaseAudioContext,tracks:TimelineTrack[],posts:Map<string,GainNode>,live:boolean,plan?:GraphLatency){
    const nodes=new Map<string,AudioWorkletNode>();
    for(const track of tracks)if(track.ducking){const node=createDucking(ctx,track.ducking);if(plan)compensatedConnection(ctx,posts.get(track.ducking.source)!,node,plan.tracks.get(track.id)!.ducking!.detector,this.compensationNodes,1);else posts.get(track.ducking.source)!.connect(node,0,1);nodes.set(track.id,node);if(live){this.duckingNodes.set(track.id,node);this.playbackNodes.add(node);}}
    return nodes;
  }

  private connectRouting(ctx:BaseAudioContext,track:TimelineTrack,pre:AudioNode,post:AudioNode,inputs:Map<string,GainNode>,master:AudioNode,live:boolean,plan?:GraphLatency){
    const destination=(id:string)=>id==='master'?master:inputs.get(id)!;
    const connect=(input:AudioNode,output:AudioNode,frames:number)=>compensatedConnection(live?this.ctx:ctx,input,output,frames,this.compensationNodes);
    connect(post,destination(track.output??'master'),plan?.routes.get(outputRoute(track.id))??0);
    for(const send of track.sends??[]){const gain=ctx.createGain();gain.gain.value=send.gain;(send.preFader?pre:post).connect(gain);connect(gain,destination(send.target),plan?.routes.get(sendRoute(track.id,send.id))??0);if(live)this.routingGains.set(`${track.id}:${send.id}`,gain);}
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
            (wet,dry)=>{scheduleMix(wet,dry,fx.automation?.mix,scope!==undefined?this.scopeClock(scope):0,scope!==undefined?this.playbackStart:timelineStart,p.mix??.3,.7);if(scope)this.mixNodes.set(`${scope}:${index}`,{wet,dry,dryScale:.7,points:fx.automation,mix:p.mix??.3,staticFeedback:0,staticTime:0});},
          );
          break;
        case 'delay':
          node = createDelay(
            ctx, node,
            p.time ?? 0.3,
            p.feedback ?? 0.4,
            p.mix ?? 0.3,
            (wet,dry,feedback,time)=>{
              scheduleMix(wet,dry,fx.automation?.mix,scope!==undefined?this.scopeClock(scope):0,scope!==undefined?this.playbackStart:timelineStart,p.mix??.3);
              scheduleFeedback(feedback,fx.automation?.feedback,scope!==undefined?this.scopeClock(scope):0,scope!==undefined?this.playbackStart:timelineStart,p.feedback??.4);
              scheduleDelayTime(time,fx.automation?.time,scope!==undefined?this.scopeClock(scope):0,scope!==undefined?this.playbackStart:timelineStart,p.time??.3);
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
            (wet,dry)=>{scheduleMix(wet,dry,fx.automation?.mix,scope!==undefined?this.scopeClock(scope):0,scope!==undefined?this.playbackStart:timelineStart,p.mix??.3);if(scope)this.mixNodes.set(`${scope}:${index}`,{wet,dry,points:fx.automation,mix:p.mix??.3,staticFeedback:0,staticTime:0});},
            (first,second)=>{scheduleChorusDepth([first,second],fx.automation?.depth,scope!==undefined?this.scopeClock(scope):0,scope!==undefined?this.playbackStart:timelineStart,p.depth??.5);if(scope){const nodes=this.mixNodes.get(`${scope}:${index}`)!;nodes.depth=[first,second];nodes.staticDepth=p.depth??.5;}},
            (first,second)=>{scheduleChorusRate([first,second],fx.automation?.rate,scope!==undefined?this.scopeClock(scope):0,scope!==undefined?this.playbackStart:timelineStart,p.rate??1.5);if(scope){const nodes=this.mixNodes.get(`${scope}:${index}`)!;nodes.rate=[first,second];nodes.staticRate=p.rate??1.5;}},
          );
          break;
        case 'ringmod':
          node = createRingModulator(
            ctx, node,
            p.freq ?? 200,
            p.mix ?? 0.5,
            (wet,dry)=>{scheduleMix(wet,dry,fx.automation?.mix,scope!==undefined?this.scopeClock(scope):0,scope!==undefined?this.playbackStart:timelineStart,p.mix??.5);if(scope)this.mixNodes.set(`${scope}:${index}`,{wet,dry,points:fx.automation,mix:p.mix??.5,staticFeedback:0,staticTime:0});},
            frequency=>{scheduleRingFrequency(frequency,fx.automation?.freq,scope!==undefined?this.scopeClock(scope):0,scope!==undefined?this.playbackStart:timelineStart,p.freq??200);if(scope){const nodes=this.mixNodes.get(`${scope}:${index}`)!;nodes.freq=frequency;nodes.staticFreq=p.freq??200;}},
          );
          break;
        case 'distortion':
          node = applyDistortion(
            ctx, node,
            p.drive ?? 0.5,
            p.mix ?? 0.5,
            'tanh',
            (wet,dry)=>{scheduleMix(wet,dry,fx.automation?.mix,scope!==undefined?this.scopeClock(scope):0,scope!==undefined?this.playbackStart:timelineStart,p.mix??.5);if(scope)this.mixNodes.set(`${scope}:${index}`,{wet,dry,points:fx.automation,mix:p.mix??.5,staticFeedback:0,staticTime:0});},
          );
          break;
        case 'bitcrush':
          node = createBitCrush(
            ctx, node,
            p.bits ?? 8,
            p.mix ?? 0.5,
            (wet,dry)=>{scheduleMix(wet,dry,fx.automation?.mix,scope!==undefined?this.scopeClock(scope):0,scope!==undefined?this.playbackStart:timelineStart,p.mix??.5);if(scope)this.mixNodes.set(`${scope}:${index}`,{wet,dry,points:fx.automation,mix:p.mix??.5,staticFeedback:0,staticTime:0});},
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
