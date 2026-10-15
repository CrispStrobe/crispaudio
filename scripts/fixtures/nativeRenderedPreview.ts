import {invoke} from '@tauri-apps/api/core';
import {TimelineEngine} from '../../src/audio/engine/TimelineEngine';
import {NativePluginStream} from '../../src/audio/plugins/NativePluginStream';
import {RenderedPreviewCache} from '../../src/audio/plugins/RenderedPreviewCache';
import type {TimelineProject,AudioSource} from '../../src/types/audio';
import captureUrl from './renderedCapture.ts?worker&url';
export async function nativeRenderedPreview(plugin:string){
 const ctx=new AudioContext({sampleRate:48000});await ctx.resume();await ctx.audioWorklet.addModule(captureUrl);
 const sink=ctx.createGain(),engine=new TimelineEngine(ctx,sink),frames=192000,impulse=60000,buffer=ctx.createBuffer(2,frames,48000);buffer.getChannelData(0)[impulse]=1.5;buffer.getChannelData(1)[impulse]=-1.25;
 const project:TimelineProject={id:'rendered-preview',name:'Rendered',duration:4,sampleRate:48000,masterVolume:.5,masterEffects:[],nativeEffects:[{instanceId:'vst',pluginId:plugin,name:'ADelay',format:'VST3',enabled:true,bypass:false,parameters:{'100':.002,'101':0},state:''}],tracks:[{id:'track',name:'Track',muted:false,solo:false,volume:1,pan:0,segments:[{id:'clip',name:'Clip',color:'#4488cc',trackId:'track',sourceId:'source',startTime:0,sourceOffset:0,duration:4,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'}]}]};
 const sources=new Map([['source',{id:'source',buffer} as AudioSource]]),cache=new RenderedPreviewCache((p,s,signal)=>engine.renderMixRange(p,0,p.duration,signal,s));
 let renders=0;const original=NativePluginStream.prototype.process;NativePluginStream.prototype.process=function(...args){renders++;return original.apply(this,args);};
 const assert=(ok:unknown,message:string)=>{if(!ok)throw new Error(message);};
 try{
  const baked=await cache.prepare(project,sources,new AbortController().signal);await engine.prepare(project);const renderCalls=renders;
  const status=await invoke<{active:number;opening:number}>('native_validation_status');assert(status.active===0&&status.opening===0,'Preview retained native helpers');
  const capture=async(start:number,end:number,frames:number,loopStart?:number,stall=false)=>{
   const node=new AudioWorkletNode(ctx,'crispaudio-rendered-capture',{numberOfInputs:1,outputChannelCount:[2],processorOptions:{frames}}),silent=ctx.createGain();silent.gain.value=0;sink.connect(node);node.connect(silent);silent.connect(ctx.destination);
   let timeout:ReturnType<typeof setTimeout>|undefined;
   const done=new Promise<Float32Array[]>((resolve,reject)=>{timeout=setTimeout(()=>reject(new Error('Rendered capture timeout')),10000);node.port.onmessage=event=>resolve(event.data);});void done.catch(()=>{});
   try{
    engine.playRenderedPreview(baked,start,end,loopStart);node.port.postMessage(engine.playbackAnchor()!.frame);
    if(stall){await new Promise(resolve=>setTimeout(resolve,1000));const until=performance.now()+500;while(performance.now()<until){Math.sqrt(performance.now());}}
    const pcm=await done,indices:number[]=[];for(let i=0;i<pcm[0].length;i++)if(Math.abs(pcm[0][i])>1e-6)indices.push(i);
    assert(indices.every(i=>Math.abs(pcm[0][i]-.75)<2e-6&&Math.abs(pcm[1][i]+.625)<2e-6),'Preview reapplied master gain or changed PCM');return indices;
   }finally{clearTimeout(timeout);engine.stop();sink.disconnect(node);node.disconnect();silent.disconnect();node.port.close();}
  };
  const full=await capture(0,4,192000,undefined,true);assert(JSON.stringify(full)==='[60096]','Stalled rendered playback shifted impulse');
  const cached=await cache.prepare(project,sources,new AbortController().signal);assert(cached===baked,'Preview did not reuse buffer');
  const seek=await capture(.5,2,72000);assert(JSON.stringify(seek)==='[36096]','Rendered seek shifted impulse');
  const loop=await capture(1,1.5,72000,1,true);assert(JSON.stringify(loop)==='[12096,36096,60096]','Rendered loop lost samples during stall');
  assert(renders===renderCalls,'Rendered playback called native DSP');return {kind:'rendered-preview',full,seek,loop,renderCalls,playbackNativeCalls:renders-renderCalls,closedNativeSessions:true};
 }finally{NativePluginStream.prototype.process=original;cache.invalidate();engine.stop();await ctx.close();}
}
