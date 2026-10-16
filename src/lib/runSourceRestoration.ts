import {validateRestoration,type RestorationSettings,type RestorationResult} from './sourceRestoration';
import type {SampleRange} from './sourceEditing';
export function runSourceRestoration(channels:Float32Array[],ranges:SampleRange[],rate:number,channel:number,settings:RestorationSettings,signal:AbortSignal):Promise<RestorationResult>{
 signal.throwIfAborted();validateRestoration(channels,ranges,rate,channel,settings);
 return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./sourceRestoration.worker.ts',import.meta.url),{type:'module'}),finish=()=>{signal.removeEventListener('abort',abort);worker.terminate();},abort=()=>{finish();reject(new DOMException('Cancelled','AbortError'));};
  signal.addEventListener('abort',abort,{once:true});worker.onmessage=event=>{finish();if(event.data.error)reject(new Error(event.data.error));else resolve(event.data as RestorationResult);};worker.onerror=()=>{finish();reject(new Error('restoration.failed'));};
  try{const copies=channels.map(c=>new Float32Array(c));worker.postMessage({channels:copies,ranges,rate,channel,settings},copies.map(c=>c.buffer));}catch(error){finish();reject(error);}
 });
}
