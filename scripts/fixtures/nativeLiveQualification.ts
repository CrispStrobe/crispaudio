import {invoke} from '@tauri-apps/api/core';
import {NativeTimelineSnapshot} from '../../src/audio/plugins/NativeTimelineSnapshot';
import type {NativeTimelinePlayback} from '../../src/audio/plugins/NativeTimelinePlayback';
import type {TimelineProject,AudioSource,NativeEffect} from '../../src/types/audio';
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(ok:unknown,message:string)=>{if(!ok)throw new Error(message);};
async function ready(playback:NativeTimelinePlayback){for(let i=0;i<1000;i++){const status=await playback.status();if(status.phase==='playing')return status;if(status.phase==='fault')throw new Error(JSON.stringify(status));await wait(10);}throw new Error('Qualification start timed out');}
export async function nativeLiveQualification(base:TimelineProject,au:string){
 const buffer=new AudioBuffer({numberOfChannels:2,length:176400,sampleRate:44100});
 for(let i=0;i<buffer.length;i++){buffer.getChannelData(0)[i]=.08*Math.sin(2*Math.PI*440*i/44100);buffer.getChannelData(1)[i]=.06*Math.sin(2*Math.PI*660*i/44100);}
 const vst=(id:string):NativeEffect=>({...base.nativeEffects![0],instanceId:id});
 const apple=(id:string):NativeEffect=>({instanceId:id,pluginId:au,format:'AU',name:'Bandpass',enabled:true,bypass:true,parameters:{},state:''});
 const original=base.tracks[0],project:TimelineProject={...base,sampleRate:44100,nativeEffects:[vst('master-v'),apple('master-a')],tracks:[{...original,id:'one',output:'bus',sends:[{id:'send',target:'return',gain:.3,preFader:false}],nativeEffects:[vst('one-v')],segments:[{...original.segments[0],id:'c1',trackId:'one',nativeEffects:[apple('clip-a')]}]},{...original,id:'two',pan:.4,volume:.6,nativeEffects:[apple('two-a')],segments:[{...original.segments[0],id:'c2',trackId:'two'}]},{...original,id:'bus',kind:'bus',segments:[],nativeEffects:[vst('bus-v')]},{...original,id:'return',kind:'bus',segments:[],nativeEffects:[vst('return-v'),apple('return-a')]}]};
 const sources=new Map([['source',{id:'source',buffer}as AudioSource]]),snapshot=await NativeTimelineSnapshot.create(project,sources);let playback:NativeTimelinePlayback|undefined;
 try{
  playback=await snapshot.startPlayback({startFrame:24000,endFrame:168000,loopStartFrame:12000,cycle:true,muted:true});await ready(playback);
  const began=performance.now();let last=await playback.status();
  while(performance.now()-began<60000){
   await wait(250);const busy=performance.now()+25;while(performance.now()<busy)Math.sqrt(performance.now());
   last=await playback.status();assert(last.phase==='playing'&&last.fault===0,`Loaded playback failed: ${JSON.stringify(last)}`);
   if(performance.now()-began>30000&&document.visibilityState!=='hidden')await invoke('native_validation_window',{hidden:true});
  }
  assert(last.callbacks>5000&&last.renderedFrames>48000*58,'Long playback failed to advance');
  assert((last.meters?.one.peak??0)>.01&&(last.meters?.bus.rms??0)>.001&&last.loudness?.integrated!==null,'Native track/loudness meters absent');
  await playback.close();playback=undefined;
  await invoke('native_validation_window',{hidden:false});
  for(const kind of ['helper','underrun']){
   playback=await snapshot.startPlayback({startFrame:0,endFrame:168000,cycle:true,muted:true});await ready(playback);await invoke('native_playback_validation_fault',{kind});
   let fault=await playback.status();for(let i=0;i<500&&fault.phase!=='fault';i++){await wait(10);fault=await playback.status();}
   assert(fault.phase==='fault',`${kind} fault was hidden`);await playback.close().catch(()=>{});playback=undefined;
  }
  playback=await snapshot.startPlayback({startFrame:0,endFrame:168000,muted:true});await ready(playback);await playback.close();playback=undefined;
  return {sourceRate:44100,processingRate:48000,instances:8,durationSeconds:60,background:'passed',callbacks:last.callbacks,maxProcessMs:last.maxProcessMs,trackMeters:'passed',faults:['helper','underrun'],recovery:'passed',muted:true};
 }finally{await playback?.close().catch(()=>{});await snapshot.close();}
}
