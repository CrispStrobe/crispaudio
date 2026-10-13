import {invoke} from '@tauri-apps/api/core';
import {readFile,stat} from '@tauri-apps/plugin-fs';
import {prepareAudioImport} from './audioImport';
import {mediaJob} from './mediaJob';
import {measureMix,type MixMeasurement} from './mixComparison';
import type {MediaInfo} from './media';
export interface ExportReviewResult {path:string;buffer:AudioBuffer;measurement:MixMeasurement;bytes:number;bitDepth?:number;hasVideo:boolean;fileRate:number;fileChannels:number}
export async function reviewExport(path:string,signal:AbortSignal):Promise<ExportReviewResult>{
 const [info,file]=await Promise.all([invoke<MediaInfo>('probe_media',{path}),stat(path)]);signal.throwIfAborted();
 if(info.duration*Math.max(1,info.channels)*Math.max(1,info.sample_rate)*4>256*1024*1024)throw new Error('exportReview.large');
 const audioPath=info.has_video?await mediaJob<string>('prepare_media_asset',{path,proxy:false},signal):path;signal.throwIfAborted();
 const bytes=await readFile(audioPath);signal.throwIfAborted();let bitDepth:number|undefined;
 if(bytes.length>=44&&String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WAVE'){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let pos=12;pos+8<=bytes.length;){const size=view.getUint32(pos+4,true);if(String.fromCharCode(...bytes.subarray(pos,pos+4))==='fmt '&&size>=16&&pos+24<=bytes.length){bitDepth=view.getUint16(pos+22,true);break;}if(size>bytes.length-pos-8)break;pos+=8+size+(size%2);}}
 const ctx=new OfflineAudioContext(2,1,info.sample_rate||48000),source=await prepareAudioImport(ctx,{name:path.split(/[\\/]/).pop()??path,read:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer},signal,()=>{}),measurement=await measureMix(source.buffer,signal);return {path,buffer:source.buffer,measurement,bytes:file.size,bitDepth:info.has_video?undefined:bitDepth,hasVideo:info.has_video,fileRate:info.sample_rate||source.sampleRate,fileChannels:info.channels||source.channels};
}
