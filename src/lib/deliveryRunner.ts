import {invoke} from '@tauri-apps/api/core';
import {writeFile,remove} from '@tauri-apps/plugin-fs';
import type {TimelineEngine} from '../audio/engine/TimelineEngine';
import type {DeliveryJob} from './delivery';
import {linkedRenderDocument} from './projectFile';
import {mediaJob} from './mediaJob';
import {encodeAudioBufferWav} from './wavExport';
import {exportVideoProject} from './videoProjectExport';
import {isIOSApp,isTauri} from './native';
export function deliveryFile(directory:string,name:string,extension:string){const safe=[...name].map(c=>c.charCodeAt(0)<32?'_':c).join('').replace(/[<>:"/\\|?*]/g,'_').replace(/[. ]+$/g,'').slice(0,80)||'mix';return `${directory.replace(/[/\\]$/,'')}/${safe}-${crypto.randomUUID().slice(0,8)}.${extension}`;}
export async function publishDelivery(output:string,bytes:Uint8Array,signal:AbortSignal){const staged=`${output}.${crypto.randomUUID()}.partial`;try{signal.throwIfAborted();await writeFile(staged,bytes);signal.throwIfAborted();await invoke('publish_delivery_stage',{staged,output});}finally{await remove(staged).catch(()=>{});}}
export async function runDelivery(job:DeliveryJob,engine:TimelineEngine|null,signal:AbortSignal,phase:(value:string)=>void){
 if(!isTauri()||isIOSApp())throw new Error('delivery.desktop');
 const {project,sources,settings:s,range,sidecar}=job.plan,video=s.format==='mp4'||s.format==='mov',nativeMac=navigator.userAgent.includes('Mac'),document=s.layout==='stereo'&&nativeMac?linkedRenderDocument(project,sources):null;
 const tagged=s.format==='wav'&&Object.values(s.metadata??{}).some(Boolean),mediaOutput=tagged?`${job.output}.${crypto.randomUUID()}.metadata.partial.wav`:job.output;
 try{
 signal.throwIfAborted();phase('rendering');
 if(video){if(!nativeMac)throw new Error('delivery.appleVideo');await exportVideoProject({project,sources,engine,output:mediaOutput,backend:'apple',format:s.format,nativeMac,quality:s.quality},signal);}
 else if(document){await mediaJob(`export_linked_project_${s.format}`,{document:{...document,renderRange:range},output:mediaOutput,...(s.format==='wav'?{bitDepth:s.bitDepth}:s.format==='aac'?{bitrateKbps:s.bitrateKbps}:{})},signal);}
 else{
  if(s.format!=='wav')throw new Error('delivery.linkedRequired');if(!engine)throw new Error('Audio engine is unavailable');let buffer=await engine.renderMixRange(project,range.start,range.end,signal,sources);
  if(s.layout==='mono'){const mono=new AudioBuffer({length:buffer.length,sampleRate:buffer.sampleRate,numberOfChannels:1}),out=mono.getChannelData(0);for(let ch=0;ch<buffer.numberOfChannels;ch++){const input=buffer.getChannelData(ch);for(let i=0;i<input.length;i++){out[i]+=input[i]/buffer.numberOfChannels;if(i%1048576===0){signal.throwIfAborted();await new Promise(resolve=>setTimeout(resolve,0));}}}buffer=mono;}
  signal.throwIfAborted();phase('encoding');const wav=await encodeAudioBufferWav(buffer,s.bitDepth,signal);await publishDelivery(mediaOutput,new Uint8Array(await wav.arrayBuffer()),signal);
 }
 if(tagged){signal.throwIfAborted();await invoke('annotate_delivery_wav',{staged:mediaOutput,metadata:s.metadata});signal.throwIfAborted();await invoke('publish_delivery_stage',{staged:mediaOutput,output:job.output});}
 }finally{if(tagged)await remove(mediaOutput).catch(()=>{});}
 // Ancillary files have independent no-clobber publication; failure shows the
 // output path and a retry chooses a fresh basename, preserving completed media.
 phase('sidecars');if(sidecar)await publishDelivery(job.output.replace(/\.[^.]+$/,`.${sidecar.extension}`),new TextEncoder().encode(sidecar.text),signal);
 phase('manifest');await publishDelivery(`${job.output}.delivery.json`,new TextEncoder().encode(JSON.stringify({format:'crispaudio-delivery',version:1,projectId:project.id,projectName:project.name,settings:s,range,output:job.output,stemMode:s.stemMode??'solo',metadata:s.metadata??{},stemSoloTrackIds:project.tracks.filter(t=>t.solo).map(t=>t.id),createdAt:new Date().toISOString()},null,2)),signal);
}
