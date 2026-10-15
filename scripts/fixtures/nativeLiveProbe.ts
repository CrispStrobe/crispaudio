import {nativeLiveDelivery} from './nativeLiveDelivery';
import {nativeLiveUI} from './nativeLiveUI';
import {nativeLiveQualification} from './nativeLiveQualification';
import {invoke} from '@tauri-apps/api/core';
import {NativeTimelineSnapshot} from '../../src/audio/plugins/NativeTimelineSnapshot';
import type {NativeTimelinePlayback,NativePlaybackStatus} from '../../src/audio/plugins/NativeTimelinePlayback';
import type {TimelineProject,AudioSource} from '../../src/types/audio';
const assert=(value:unknown,message:string)=>{if(!value)throw new Error(message);};
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(playback:NativeTimelinePlayback,phase:NativePlaybackStatus['phase']){
 const end=performance.now()+15000;
 while(performance.now()<end){const status=await playback.status();if(status.phase==='fault')throw new Error(JSON.stringify(status));if(status.phase===phase)return status;await wait(10);}
 throw new Error(`Native playback did not reach ${phase}`);
}
export async function nativeLiveProbe(plugin:string,au:string){
 await invoke('native_validation_window',{hidden:false});const ctx=new AudioContext({sampleRate:48000});
 const buffer=ctx.createBuffer(2,192000,48000);
 for(const[frame,left,right]of[[23950,1,-.8],[60000,1.5,-1.25],[71950,.8,-.6]]){buffer.getChannelData(0)[frame]=left;buffer.getChannelData(1)[frame]=right;}
 const project:TimelineProject={id:'live',name:'Native live',duration:4,sampleRate:48000,masterVolume:.5,masterEffects:[],music:{tempo:90,numerator:7,denominator:8,origin:3,ruler:'seconds',grid:'off',metronome:false,clickLevel:.5},nativeEffects:[{instanceId:'fx',pluginId:plugin,name:'ADelay',format:'VST3',enabled:true,bypass:false,parameters:{'100':.002,'101':0},state:''}],tracks:[{id:'track',name:'Track',volume:1,pan:0,muted:false,solo:false,segments:[{id:'clip',trackId:'track',sourceId:'source',name:'Clip',color:'#4488cc',startTime:0,sourceOffset:0,duration:4,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'}]}]};
 const snapshot=await NativeTimelineSnapshot.create(project,new Map([['source',{id:'source',buffer}as AudioSource]]));
 let playback:NativeTimelinePlayback|undefined;
 try{
  playback=await snapshot.startPlayback({startFrame:24000,endFrame:72000,cycle:true,muted:true});
  await until(playback,'playing');await wait(200);await playback.pause();await until(playback,'paused');await wait(100);
  const paused=await playback.status();await wait(250);const held=await playback.status();
  assert(held.phase==='paused'&&held.frame===paused.frame&&held.callbacks===paused.callbacks&&held.renderedFrames===paused.renderedFrames,'Paused native clock/DSP advanced');
  await playback.volume(.4);await playback.pause(false);await until(playback,'playing');await wait(500);
  const before=await playback.status(),end=performance.now()+500;while(performance.now()<end){Math.sqrt(performance.now());}
  const after=await playback.status();assert(after.fault===0&&after.callbacks-before.callbacks>30&&after.renderedFrames-before.renderedFrames>30*512,'Continuous native processing waited for UI');
  await wait(1100);const loop=await playback.close()as {samples:{frame:number;left:number;right:number}[];helpersClosed:boolean;status:NativePlaybackStatus};playback=undefined;
  assert(loop.helpersClosed&&loop.status.fault===0,'Loop helper or callback failed');
  const expected=[46,36096,48046,84096,96046];assert(JSON.stringify(loop.samples.slice(0,5).map(s=>s.frame))===JSON.stringify(expected),`Loop tails moved: ${JSON.stringify(loop.samples)}`);
  for(const sample of loop.samples){const offset=sample.frame%48000;const left=sample.frame===46?.5:offset===36096?.75:.4;assert(Math.abs(sample.left-left)<2e-6,'Loop wet level changed');}
  playback=await snapshot.startPlayback({startFrame:24000,endFrame:72000,cycle:true,muted:true});await until(playback,'playing');await wait(200);
  const changed={...project,masterVolume:.25,tracks:project.tracks.map(track=>({...track,volume:.5})),nativeEffects:project.nativeEffects!.map(effect=>({...effect,parameters:{...effect.parameters,'100':.004}}))};
  const revision=await playback.update(changed);await wait(1900);const applied=await playback.status();assert(applied.appliedRevision===revision,'Live control revision was not applied');
  await playback.update({...changed,nativeEffects:changed.nativeEffects!.map(effect=>({...effect,bypass:true}))});await wait(900);
  const controls=await playback.close()as typeof loop;playback=undefined;
  assert(controls.helpersClosed&&controls.status.fault===0,'Live control session failed');
  assert(controls.samples[1]?.frame===36192&&Math.abs(controls.samples[1].left-.1875)<2e-6,'Live delay/fader controls did not reach native DSP');
  assert(controls.samples.some(sample=>sample.frame===132000&&Math.abs(sample.left-.1875)<2e-6),'Live bypass did not use dry audio at the same project position');
  playback=await snapshot.startPlayback({startFrame:60000,endFrame:62048,muted:true});const ended=await until(playback,'ended');
  const seek=await playback.close()as typeof loop;playback=undefined;
  assert(ended.frame===62048&&seek.helpersClosed&&seek.status.fault===0,'Seek/end clock failed');
  assert(seek.samples.length===1&&seek.samples[0].frame===96&&Math.abs(seek.samples[0].left-.75)<2e-6,'Seek history or range gating failed');
  await snapshot.close();const registry=await invoke<{entries:number;bytes:number}>('native_snapshot_status');assert(registry.entries===0&&registry.bytes===0,'Native live source lease leaked');
  const qualification=await nativeLiveQualification(project,au);
  const delivery=await nativeLiveDelivery(project);
  const gui=await nativeLiveUI(project,new Map([['source',{id:'source',buffer}as AudioSource]]));
  return {qualification,delivery,gui,kind:'native-live',pause:'held',loopSamples:loop.samples,seekSamples:seek.samples,callbacksDuringStall:after.callbacks-before.callbacks,renderedDuringStall:after.renderedFrames-before.renderedFrames,helpersClosed:true,registry:'empty',muted:true,liveControls:'passed'};
 }finally{await playback?.close();await snapshot.close();await ctx.close();}
}
