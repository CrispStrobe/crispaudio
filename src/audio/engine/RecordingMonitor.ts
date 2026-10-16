import {openNativeCueRack} from '../plugins/NativeCueRack';
import {prepareNativePluginNode} from '../plugins/NativePluginNode';
import {validNativeEffects} from '../../lib/nativeEffects';
import type {NativeEffect,RecordingInput} from '../../types/audio';
export const INPUT_FX_BLOCK=1024;
export interface RecordingCueSettings {levelDb:number;pan:number;mono:boolean;effects:NativeEffect[]}
export function recordingCue(input:RecordingInput,effects:NativeEffect[]=[]):RecordingCueSettings{
 const settings={levelDb:input.monitorLevelDb??-12,pan:input.monitorPan??0,mono:input.monitorMono??false,effects:input.monitorFx&&input.monitor?effects.filter(e=>e.enabled):[]};
 if(!Number.isFinite(settings.levelDb)||settings.levelDb< -60||settings.levelDb>0||!Number.isFinite(settings.pan)||Math.abs(settings.pan)>1||typeof settings.mono!=='boolean'||!validNativeEffects(settings.effects)||settings.effects.length>2)throw new Error('recording.cueInvalid');
 return structuredClone(settings);
}
/** Separate, monitor-only path. Never changes the capture worklet or its PCM clock. */
export class RecordingMonitor {
 private generation=0;private controller?:AbortController;private entry?:AudioNode;
 private bridges:Awaited<ReturnType<typeof prepareNativePluginNode>>[]=[];
 private nodes:AudioNode[]=[];private gain?:GainNode;private pan?:StereoPannerNode;private mono?:GainNode;
 private latency=0;private closing:Promise<void>=Promise.resolve();
 private ctx:AudioContext;private input:AudioNode;private output:AudioNode;private fault:(reason:string)=>void;
 constructor(ctx:AudioContext,input:AudioNode,output:AudioNode,fault:(reason:string)=>void){this.ctx=ctx;this.input=input;this.output=output;this.fault=fault;}
 get latencyFrames(){return this.latency;}
 update(settings:RecordingCueSettings){
  this.gain?.gain.setTargetAtTime(10**(settings.levelDb/20),this.ctx.currentTime,.005);
  this.pan?.pan.setTargetAtTime(settings.pan,this.ctx.currentTime,.005);
  if(this.mono)this.mono.channelCount=settings.mono?1:2;
 }
 async enable(settings:RecordingCueSettings){
  const teardown=this.disable(),generation=this.generation,controller=new AbortController();this.controller=controller;
  const bridges:Awaited<ReturnType<typeof prepareNativePluginNode>>[]=[];
  const current=()=>generation===this.generation&&!controller.signal.aborted;
  const fail=(reason:string)=>{if(!current())return;this.disable();this.fault(reason);};
  try{
   await teardown;controller.signal.throwIfAborted();
   if(settings.effects.length){
    const bridge=await prepareNativePluginNode(this.ctx,{id:'input-cue-rack',sampleRate:this.ctx.sampleRate,channels:2,processMode:'realtime'},{blockFrames:INPUT_FX_BLOCK,signal:controller.signal,onFault:()=>fail('recording.cueFault'),openStream:()=>openNativeCueRack(this.ctx.sampleRate,settings.effects,controller.signal)});
    bridges.push(bridge);
   }
   controller.signal.throwIfAborted();if(!current())throw new DOMException('Monitoring cancelled','AbortError');
   this.bridges=bridges;const mono=this.ctx.createGain(),pan=this.ctx.createStereoPanner(),gain=this.ctx.createGain();this.nodes=[mono,pan,gain];this.mono=mono;this.pan=pan;this.gain=gain;
   mono.channelCountMode='explicit';mono.channelCount=settings.mono?1:2;mono.channelInterpretation='speakers';gain.gain.value=10**(settings.levelDb/20);pan.pan.value=settings.pan;
   let frame=Math.ceil((this.ctx.currentTime+.05)*this.ctx.sampleRate),previous:AudioNode|undefined;
   for(const bridge of bridges){const node=bridge.attach(frame);this.nodes.push(node);if(previous)previous.connect(node);else this.entry=node;previous=node;frame+=bridge.delayFrames;}
   if(previous)previous.connect(mono);else this.entry=mono;
   mono.connect(pan);pan.connect(gain);gain.connect(this.output);this.input.connect(this.entry!);
   this.latency=bridges.reduce((sum,bridge)=>sum+bridge.delayFrames,0);
  }catch(error){
   if(current())this.disable();await Promise.allSettled(bridges.map(bridge=>bridge.close()));throw error;
  }
 }
 disable(){
  this.generation++;this.controller?.abort();this.controller=undefined;
  if(this.gain)this.gain.gain.value=0;
  if(this.entry)try{this.input.disconnect(this.entry);}catch{/* Already disconnected during input shutdown. */}
  this.nodes.forEach(node=>node.disconnect());const closing=Promise.allSettled([this.closing,...this.bridges.map(bridge=>bridge.close())]).then(()=>{});this.closing=closing;
  this.bridges=[];this.nodes=[];this.entry=undefined;this.gain=undefined;this.pan=undefined;this.mono=undefined;this.latency=0;return closing;
 }
}
