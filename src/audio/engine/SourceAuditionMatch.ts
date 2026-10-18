import {LoudnessMeter} from '../dsp/loudness';
import {sampleRanges,type SampleRange} from '../../lib/sourceEditing';

export type SourceAuditionMatch={original:number;preview:number};
/** Monitor-only attenuation. Never boost a quiet version or write matched PCM. */
export async function matchSourceAudition(original:Float32Array[],preview:Float32Array[],ranges:SampleRange[],rate:number,signal:AbortSignal):Promise<SourceAuditionMatch|null>{
 signal.throwIfAborted();
 if(!original.length||original.length>2||preview.length!==original.length||!Number.isFinite(rate)||rate<8000||rate>192000) return null;
 const length=original[0].length;
 if([...original,...preview].some(c=>c.length!==length))throw new Error('sourceEditor.invalidPcm');
 const selected=sampleRanges(ranges,length),samples=selected.reduce((n,r)=>n+r.end-r.start,0);
 if(samples<rate*.4||samples>rate*120)return null;
 const versions=[original,preview],meters=[new LoudnessMeter(rate),new LoudnessMeter(rate)],peaks=[0,0];let count=0;
 for(const range of selected)for(let i=range.start;i<range.end;i++){
  for(let version=0;version<2;version++){
   const channels=versions[version];
   const left=channels[0][i],right=channels[Math.min(1,channels.length-1)][i];
   meters[version].frame(left,right);peaks[version]=Math.max(peaks[version],Math.abs(left),Math.abs(right));
  }
  if(++count%16384===0){await new Promise<void>(resolve=>setTimeout(resolve,0));signal.throwIfAborted();}
 }
 signal.throwIfAborted();
 const readings=meters.map(m=>m.finish().integrated);
 if(readings.some(v=>v===null||!Number.isFinite(v)))return null;
 const target=Math.min(...readings as number[]),levels=readings.map(v=>target-v!);
 // A shared reduction preserves the match when either version has large peaks.
 const peak=Math.max(...peaks.map((p,i)=>p*10**(levels[i]/20))),headroom=peak>0?Math.min(0,-1-20*Math.log10(peak)):0;
 return {original:10**((levels[0]+headroom)/20),preview:10**((levels[1]+headroom)/20)};
}
