import {isTauri,isIOSApp} from './native';
export interface PlaybackDevice {id:string;label:string;isDefault:boolean}
export interface PlaybackOutputs {mode:'mac-system'|'browser'|'system';devices:PlaybackDevice[];selectedId:string}
type RoutedContext=AudioContext & {setSinkId?:(id:string)=>Promise<void>;sinkId?:string};
const contexts=new Set<RoutedContext>(),routes=new WeakMap<AudioContext,Promise<void>>();
let selectedId='',changing:Promise<void>|undefined;
const macOutput=()=>isTauri()&&!isIOSApp()&&/Mac/.test(navigator.userAgent);
export function createPlaybackContext(options?:AudioContextOptions):AudioContext {
 const ctx=new AudioContext(options) as RoutedContext;contexts.add(ctx);
 ctx.addEventListener('statechange',()=>{if(ctx.state==='closed')contexts.delete(ctx);});
 // Contexts opened during a device change join the committed selection.
 const route=(changing??Promise.resolve()).catch(()=>{}).then(async()=>{if(ctx.state!=='closed'&&ctx.setSinkId&&selectedId)await ctx.setSinkId(selectedId);});
 routes.set(ctx,route);void route.catch(()=>{});return ctx;
}
export async function resumePlaybackContext(ctx:AudioContext):Promise<void> {
 if(ctx.state==='closed')throw new Error('audioOutput.closed');
 // Call resume synchronously in the gesture, before waiting for device routing.
 await Promise.all([ctx.state!=='running'?ctx.resume():Promise.resolve(),routes.get(ctx)]);
 if(ctx.state!=='running')throw new Error('audioOutput.notRunning');
}
export async function playbackOutputs():Promise<PlaybackOutputs> {
 if(macOutput()){
  const {invoke}=await import('@tauri-apps/api/core');const devices=await invoke<PlaybackDevice[]>('list_audio_outputs');
  return {mode:'mac-system',devices,selectedId:devices.find(d=>d.isDefault)?.id??''};
 }
 if(typeof AudioContext==='undefined'||!('setSinkId' in AudioContext.prototype))return {mode:'system',devices:[],selectedId:''};
 const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audiooutput').map((d,i)=>({id:d.deviceId,label:d.label||`Audio output ${i+1}`,isDefault:d.deviceId==='default'}));
 return {mode:'browser',devices:[{id:'',label:'',isDefault:true},...devices.filter(d=>d.id&&d.id!=='default')],selectedId};
}
export async function selectPlaybackOutput(id:string):Promise<void> {
 if(macOutput()){const {invoke}=await import('@tauri-apps/api/core');await invoke('select_audio_output',{id});window.dispatchEvent(new Event('crispaudio-output-changed'));return;}
 if(changing)throw new Error('audioOutput.busy');
 const before=selectedId;
 const apply=async()=>{
  const live=[...contexts].filter(ctx=>ctx.state!=='closed');
  if(!('setSinkId' in AudioContext.prototype))throw new Error('audioOutput.unsupported');
  const results=await Promise.allSettled(live.map(ctx=>ctx.setSinkId!(id)));
  if(results.some(r=>r.status==='rejected')){
   const rollback=await Promise.allSettled(live.map(ctx=>ctx.setSinkId!(before)));
   const error=results.find(r=>r.status==='rejected') as PromiseRejectedResult;
   if(rollback.some(r=>r.status==='rejected'))throw new Error('audioOutput.rollbackFailed');
   throw error.reason;
  }
  selectedId=id;
 };
 changing=apply();try{await changing;}finally{changing=undefined;}
}
/** Use the browser's output-only chooser; never request microphone access. */
export async function requestPlaybackOutput():Promise<void> {
 const media=navigator.mediaDevices as MediaDevices & {selectAudioOutput?:()=>Promise<MediaDeviceInfo>};
 if(!media?.selectAudioOutput)throw new Error('audioOutput.permissionHelp');
 const device=await media.selectAudioOutput();await selectPlaybackOutput(device.deviceId);
}
export function canRequestPlaybackOutput(){return !macOutput()&&!!(navigator.mediaDevices as MediaDevices & {selectAudioOutput?:unknown})?.selectAudioOutput;}
export async function testPlaybackOutput(ctx:AudioContext,input:GainNode,analyser:AnalyserNode){
 await resumePlaybackContext(ctx);
 const source=ctx.createOscillator(),gain=ctx.createGain(),start=ctx.currentTime;
 source.frequency.value=440;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.12,start+.02);gain.gain.setValueAtTime(.12,start+.6);gain.gain.linearRampToValueAtTime(0,start+.7);
 source.connect(gain);gain.connect(input);source.start(start);source.stop(start+.72);
 try{
  await new Promise(resolve=>setTimeout(resolve,250));const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);
  const peak=Math.max(...samples.map(Math.abs)),rms=Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length),advanced=ctx.currentTime-start;
  if(ctx.state!=='running'||advanced<.05||rms<.0001)throw new Error('audioOutput.noSignal');
  await new Promise(resolve=>setTimeout(resolve,500));return {peak,rms,sampleRate:ctx.sampleRate,state:ctx.state,advanced};
 }finally{try{source.stop();}catch{/* Already ended. */}source.disconnect();gain.disconnect();}
}
