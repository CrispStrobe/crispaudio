import type {NativeEffect} from '../../src/types/audio';
import {invoke} from '@tauri-apps/api/core';
import {RecordingMonitor,recordingCue} from '../../src/audio/engine/RecordingMonitor';
import {observeNativePluginBridge,type NativePluginDiagnostic} from '../../src/audio/plugins/NativePluginNode';
import captureUrl from './renderedCapture.ts?worker&url';
/** Actual Tauri IPC, actual AU DSP, generated input, silent hardware sink. */
export async function nativeCueProbe(plugin:string,count=1,format:'AU'|'VST3'='AU',seconds=2,pulse=false){
 await invoke('native_validation_window',{hidden:false});
 const ctx=new AudioContext({sampleRate:48000});await ctx.resume();await ctx.audioWorklet.addModule(captureUrl);
 const source=ctx.createBufferSource(),buffer=ctx.createBuffer(2,(seconds+1)*48000,48000);for(let ch=0;ch<2;ch++)for(let i=0;i<buffer.length;i++)buffer.getChannelData(ch)[i]=.2*Math.sin(2*Math.PI*1000*i/48000)+.2*Math.sin(2*Math.PI*6000*i/48000);if(pulse){for(let ch=0;ch<2;ch++){buffer.getChannelData(ch).fill(0);buffer.getChannelData(ch)[24000]=1;}}source.buffer=buffer;
 const capture=new AudioWorkletNode(ctx,'crispaudio-rendered-capture',{numberOfInputs:1,outputChannelCount:[2],processorOptions:{frames:seconds*48000}}),silent=ctx.createGain();silent.gain.value=0;capture.connect(silent);silent.connect(ctx.destination);
 const faults:string[]=[],trace:NativePluginDiagnostic[]=[],unobserve=observeNativePluginBridge(ctx,event=>{trace.push(event);if(trace.length>256)trace.shift();}),monitor=new RecordingMonitor(ctx,source,capture,reason=>faults.push(reason));
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  await monitor.enable(recordingCue({deviceId:'',channel:'stereo',monitor:true,monitorFx:true,monitorLevelDb:-6,countIn:0,latencyMs:0},Array.from({length:count},(_,index):NativeEffect=>({instanceId:`cue-au-${index}`,pluginId:plugin,name:format==='AU'?'AUBandpass':'ADelay',format,enabled:true,bypass:pulse,state:'',parameters:format==='AU'?{'0':1000,'1':600}:{'100':.002,'101':0}}))));
  const latency=monitor.latencyFrames,frame=Math.ceil((ctx.currentTime+.05)*ctx.sampleRate);capture.port.postMessage(frame);source.start(frame/ctx.sampleRate);
  const pcm=await new Promise<Float32Array[]>((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Native cue capture timed out')),10000);capture.port.onmessage=event=>{clearTimeout(timer);resolve(event.data);};});
  const amplitude=(hz:number)=>{let re=0,im=0;for(let i=(seconds-1)*48000;i<seconds*48000;i++){re+=pcm[0][i]*Math.cos(2*Math.PI*hz*i/48000);im+=pcm[0][i]*Math.sin(2*Math.PI*hz*i/48000);}return 2*Math.hypot(re,im)/48000;};
  const pass=amplitude(1000),reject=amplitude(6000);let peak=0,peakIndex=-1;for(let i=0;i<pcm[0].length;i++)if(Math.abs(pcm[0][i])>peak){peak=Math.abs(pcm[0][i]);peakIndex=i;}const pulseMatches=peakIndex===24000+latency&&Math.abs(peak-10**(-6/20))<1e-6;await monitor.disable();
  const registry=await invoke<{active:number;opening:number}>('native_validation_status');
  return {kind:'native-cue',count,blockFrames:1024,format,seconds,pulse,peak,peakIndex,measuredPulseDelayFrames:pulse?peakIndex-24000:undefined,success:!faults.length&&(pulse?pulseMatches:format==='AU'?pass>(count===1?.12:.15)&&pass<(count===1?.14:.17)&&reject<.005:Math.abs(pass-.2*10**(-6/20))<.002&&Math.abs(reject-.2*10**(-6/20))<.002)&&latency===4096&&!registry.active&&!registry.opening,latencyFrames:latency,pass1000:pass,reject6000:reject,faults,trace,registry,muted:true,input:'generated AudioBufferSource; no microphone',transport:'actual Tauri IPC and bundled AU helper'};
 }finally{clearTimeout(timer);unobserve();await monitor.disable();try{source.stop();}catch{/* Ended. */}source.disconnect();capture.disconnect();silent.disconnect();await ctx.close();}
}
