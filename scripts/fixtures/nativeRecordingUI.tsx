import {createRoot} from 'react-dom/client';
import {invoke} from '@tauri-apps/api/core';
import {NativeRenderedHarness} from './nativeRenderedHarness';
import {renderedHarness} from './nativeRenderedState';
import {useProjectStore} from '../../src/stores/projectStore';
import {useUIStore} from '../../src/stores/uiStore';
import {useSettingsStore} from '../../src/stores/settingsStore';
import {useRecordingMeterStore} from '../../src/stores/recordingMeterStore';
import {NativePluginStream} from '../../src/audio/plugins/NativePluginStream';
import i18n from '../../src/i18n';
import type {AudioSource} from '../../src/types/audio';
const assert=(value:unknown,message:string)=>{if(!value)throw new Error(message);};
async function until(check:()=>boolean,label:string){const deadline=performance.now()+15000;while(!check()){if(performance.now()>deadline)throw new Error(`Native recording timed out: ${label}`);await new Promise(resolve=>setTimeout(resolve,20));}}
export async function nativeRecordingUI(plugin:string,au?:string){
 let auVerified=false;
 if(au){const stream=await NativePluginStream.open({id:au,sampleRate:48000,channels:1,processMode:'offline'});try{const impulse=new Float32Array(512);impulse[0]=.5;const reply=await stream.process([impulse]);assert(reply.samples[0].every(Number.isFinite)&&reply.samples[0].some(value=>Math.abs(value)>1e-8),'Bundled AU helper produced no valid signal');auVerified=true;}finally{await stream.close();}}
 await invoke('native_validation_window',{hidden:false});await i18n.changeLanguage('de');useSettingsStore.getState().setNativePlaybackMode('live');
 const media=navigator.mediaDevices,originalInput=media.getUserMedia.bind(media),originalDevices=media.enumerateDevices.bind(media),inputs:{ctx:AudioContext;osc:OscillatorNode;stream:MediaStream}[]=[],paths:string[]=[],errors:string[]=[];
 const initial=useProjectStore.getInitialState().project,buffer=new AudioBuffer({numberOfChannels:2,length:96000,sampleRate:48000});buffer.getChannelData(0)[24000]=.75;buffer.getChannelData(1)[24000]=-.5;
 useProjectStore.setState({project:{...initial,id:'native-recording',duration:2,minimumDuration:2,sampleRate:48000,masterVolume:.5,nativeEffects:[{instanceId:'fx',name:'ADelay',pluginId:plugin,format:'VST3',enabled:true,bypass:false,parameters:{'100':.002,'101':0},state:''}],tracks:[{id:'backing',name:'Backing',volume:1,pan:0,muted:false,solo:false,segments:[{id:'clip',name:'Clip',color:'#4488cc',trackId:'backing',sourceId:'s',startTime:0,sourceOffset:0,duration:2,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'}]},{id:'mic',name:'Microphone',volume:1,pan:0,muted:false,solo:false,recordArmed:true,segments:[]}]},sources:new Map([['s',{id:'s',name:'Backing',buffer} as AudioSource]]),isPlaying:false,playheadPosition:0,rangePlayback:false,loopEnabled:false});
 useProjectStore.temporal.getState().clear();
 let wet:AudioBuffer|undefined,wetReady=false,renders=0,wetPlayback=false;
 Object.defineProperty(media,'enumerateDevices',{configurable:true,value:async()=>[]});
 Object.defineProperty(media,'getUserMedia',{configurable:true,value:async()=>{assert(wetReady,'Input opened before native accompaniment finished');const ctx=new AudioContext({sampleRate:48000}),osc=ctx.createOscillator(),gain=ctx.createGain(),output=ctx.createMediaStreamDestination();osc.frequency.value=317;gain.gain.value=.2;osc.connect(gain);gain.connect(output);osc.start();await ctx.resume();inputs.push({ctx,osc,stream:output.stream});return output.stream;}});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),originalProcess=NativePluginStream.prototype.process;
 NativePluginStream.prototype.process=function(...args){renders++;return originalProcess.apply(this,args);};
 const failed=(event:Event)=>errors.push(String((event as CustomEvent).detail));window.addEventListener('crispaudio-edit-error',failed);
 const saved=(event:Event)=>paths.push((event as CustomEvent<{path:string}>).detail.path);window.addEventListener('crispaudio-recording-original',saved);
 const click=(key:string)=>{const button=[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.getAttribute('aria-label')===i18n.t(key));assert(button&&!button.disabled,`Recording control unavailable: ${key}`);button!.click();};
 try{
  root.render(<NativeRenderedHarness/>);await until(()=>!!renderedHarness.engine&&!!host.querySelector('[data-recording-controls]'),'mount');
  const engine=renderedHarness.engine!,render=engine.renderMixRange.bind(engine),play=engine.playRenderedPreview.bind(engine);
  engine.renderMixRange=async(...args)=>{wet=await render(...args);wetReady=true;return wet;};engine.playRenderedPreview=(buffer,...args)=>{wetPlayback=buffer===wet;play(buffer,...args);};
  click('recording.start');await until(()=>useProjectStore.getState().isPlaying&&Object.values(useRecordingMeterStore.getState().levels).some(level=>level.peak>.1),'record');
  assert(wetPlayback,'Recording substituted a dry accompaniment');assert(wet&&Math.abs(wet.getChannelData(0)[24096]-.375)<2e-6,'Native accompaniment delay/master gain incorrect');
  const afterPrepare=renders;await new Promise(resolve=>setTimeout(resolve,650));assert(renders===afterPrepare,'Native DSP continued on input deadlines');
  click('recording.stop');await until(()=>!useUIStore.getState().timelineRecording&&useProjectStore.getState().project.tracks[1].takes?.length===1,'stop');
  const state=useProjectStore.getState(),take=state.project.tracks[1].takes![0],source=state.sources.get(take.sourceId)!;let energy=0;for(const value of source.buffer.getChannelData(0))energy+=value*value;
  assert(take.startTime===0&&take.duration>.3,'Recorded take lost its shared-clock placement');assert(Math.abs(take.sourceOffset*source.buffer.sampleRate-Math.round(take.sourceOffset*source.buffer.sampleRate))<1e-6,'Input pre-roll was not sample aligned');assert(Math.sqrt(energy/source.buffer.length)>.1,'Dry input missing');assert(source.filePath&&paths.includes(source.filePath),'Original recording not persisted');assert(inputs[0].stream.getAudioTracks().every(track=>track.readyState==='ended'),'Input stayed open');assert(useProjectStore.temporal.getState().pastStates.length===1,'Recording created multiple Undo entries');
  useProjectStore.setState({project:{...state.project,editRange:{start:.25,end:.5}},playheadPosition:.25});
  click('recording.settings');await until(()=>!!document.querySelector('[data-recording-section="options"]'),'settings');const options=document.querySelector<HTMLDetailsElement>('[data-recording-section="options"]')!;options.open=true;const label=[...options.querySelectorAll('label')].find(label=>label.textContent===i18n.t('recording.loop'));assert(label,'Loop recording option missing');label!.querySelector<HTMLInputElement>('input')!.click();document.querySelector<HTMLButtonElement>('[data-floating-inspector] [data-inspector-close]')!.click();
  wetReady=false;click('recording.start');await until(()=>useProjectStore.getState().isPlaying,'loop start');await new Promise(resolve=>setTimeout(resolve,350));const stall=performance.now()+650;while(performance.now()<stall){Math.sqrt(performance.now());}click('recording.stop');await until(()=>!useUIStore.getState().timelineRecording,'loop stop');
  const loopTakes=useProjectStore.getState().project.tracks[1].takes!.slice(1);assert(loopTakes.length>=3&&loopTakes.every(take=>take.startTime===.25&&take.duration<=.25+1/48000),'Stalled UI lost loop takes');
  let release!:(buffer:AudioBuffer)=>void;engine.renderMixRange=()=>new Promise(resolve=>{release=resolve;});const opened=inputs.length,beforeTakes=useProjectStore.getState().project.tracks[1].takes!.length;
  click('recording.start');await until(()=>!!release,'preparation');click('recording.stop');release(wet!);await until(()=>!useUIStore.getState().timelineRecording,'cancel');await new Promise(resolve=>setTimeout(resolve,100));assert(inputs.length===opened&&useProjectStore.getState().project.tracks[1].takes!.length===beforeTakes,'Cancelled preparation opened input or published a take');
  assert(!errors.length,errors.join('; '));return {kind:'native-recording',auHelper:auVerified,helpersReleased:(await invoke<{active:number;opening:number}>('native_validation_status')).active===0,wetImpulseFrame:24096,wetPeak:.375,dryInput:'generated 317 Hz',takeStart:take.startTime,sourceOffsetFrames:Math.round(take.sourceOffset*source.buffer.sampleRate),oneUndo:true,loopTakes:loopTakes.length,uiStallMs:650,cancelBeforeInput:true,recordingClock:'shared Web Audio frame clock',liveNativeInput:false,muted:true};
 }finally{
  root.unmount();host.remove();Object.defineProperty(media,'getUserMedia',{configurable:true,writable:true,value:originalInput});Object.defineProperty(media,'enumerateDevices',{configurable:true,writable:true,value:originalDevices});NativePluginStream.prototype.process=originalProcess;window.removeEventListener('crispaudio-edit-error',failed);window.removeEventListener('crispaudio-recording-original',saved);for(const input of inputs){input.osc.stop();input.stream.getTracks().forEach(track=>track.stop());await input.ctx.close();}if(paths.length)await invoke('native_validation_recordings_remove',{paths});
 }
}
