/** Source-editor ranges use half-open sample boundaries, independently of timeline selection. */
export interface SampleRange {start:number;end:number}
export function sampleRanges(ranges:SampleRange[],length:number):SampleRange[]{
 const sorted=ranges.map(r=>({start:Math.max(0,Math.min(length,Math.round(r.start))),end:Math.max(0,Math.min(length,Math.round(r.end)))})).filter(r=>Number.isFinite(r.start)&&Number.isFinite(r.end)&&r.end>r.start).sort((a,b)=>a.start-b.start);
 const result:SampleRange[]=[];for(const r of sorted){const last=result.at(-1);if(last&&r.start<=last.end)last.end=Math.max(last.end,r.end);else result.push({...r});}return result;
}
export function zeroCrossing(channels:Float32Array[],sample:number,radius:number):number{
 const length=channels[0]?.length??0,target=Math.max(0,Math.min(length,Math.round(sample)));if(!length||target===0||target===length)return target;
 let chosen=target,best=Infinity;
 for(let i=Math.max(1,target-radius);i<=Math.min(length-1,target+radius);i++){
  if(!channels.some(c=>(c[i-1]<=0&&c[i]>=0)||(c[i-1]>=0&&c[i]<=0)))continue;
  const score=channels.reduce((n,c)=>n+Math.abs(c[i]),0)+Math.abs(i-target)/(radius+1)*.001;
  if(score<best){best=score;chosen=i;}
 }return chosen;
}
export function sourceStatistics(channels:Float32Array[],ranges:SampleRange[]){
 const selected=sampleRanges(ranges,channels[0]?.length??0);let peak=0,sum=0,count=0,clipped=0,dc=0;const clipping:number[]=[];
 for(const r of selected)for(let i=r.start;i<r.end;i++)for(const c of channels){const v=c[i];if(!Number.isFinite(v))throw new Error('sourceEditor.invalidPcm');peak=Math.max(peak,Math.abs(v));sum+=v*v;dc+=v;count++;if(Math.abs(v)>=1){clipped++;if(clipping.length<32&&!clipping.includes(i))clipping.push(i);}}
 return {peak,rms:count?Math.sqrt(sum/count):0,dc:count?dc/count:0,clipped,clipping,samples:selected.reduce((n,r)=>n+r.end-r.start,0)};
}
export function activeSourceRange(channels:Float32Array[],thresholdDb:number,padding:number):SampleRange|undefined{
 const length=channels[0]?.length??0,threshold=10**(thresholdDb/20);let start=length,end=0;
 for(let i=0;i<length;i++)if(channels.some(c=>Math.abs(c[i])>threshold)){start=Math.min(start,i);end=i+1;}
 return end?{start:Math.max(0,start-padding),end:Math.min(length,end+padding)}:undefined;
}
export type SourceOperation='normalize'|'silence'|'dc'|'fade';
/** Return new PCM only; originals, excluded ranges and unselected channels remain intact. */
export function processSource(channels:Float32Array[],ranges:SampleRange[],operation:SourceOperation,selectedChannel=-1,targetDb=-1,fadeSamples=240):Float32Array[]{
 const length=channels[0]?.length??0;if(!length||channels.some(c=>c.length!==length)||!Number.isFinite(targetDb)||targetDb>0||targetDb< -60)throw new Error('sourceEditor.invalidPcm');
 const selected=sampleRanges(ranges,length);if(!selected.length||selectedChannel< -1||selectedChannel>=channels.length)throw new Error('sourceEditor.select');
 const indices=channels.map((_,i)=>i).filter(i=>selectedChannel<0||selectedChannel===i),stats=sourceStatistics(indices.map(i=>channels[i]),selected),gain=stats.peak?10**(targetDb/20)/stats.peak:1;
 return channels.map((c,index)=>{
  const result=new Float32Array(c);if(!indices.includes(index))return result;
  for(const r of selected){let mean=0;if(operation==='dc'){for(let i=r.start;i<r.end;i++)mean+=c[i];mean/=(r.end-r.start);}const fade=Math.min(Math.max(1,Math.round(fadeSamples)),Math.floor((r.end-r.start)/2));
   for(let i=r.start;i<r.end;i++)result[i]=operation==='normalize'?c[i]*gain:operation==='silence'?0:operation==='dc'?c[i]-mean:c[i]*Math.min(1,(i-r.start)/Math.max(1,fade),(r.end-1-i)/Math.max(1,fade));
  }return result;
 });
}
/** Concatenated audition only: the arrangement and source clocks do not change. */
export function auditionSamples(channels:Float32Array[],ranges:SampleRange[]):Float32Array[]{
 const selected=sampleRanges(ranges,channels[0]?.length??0),length=selected.reduce((n,r)=>n+r.end-r.start,0);
 return channels.map(c=>{const output=new Float32Array(length);let offset=0;for(const r of selected){output.set(c.subarray(r.start,r.end),offset);offset+=r.end-r.start;}return output;});
}

/** Translate the concatenated audition clock back into the original selection. */
export function auditionSourceSample(ranges:SampleRange[],sample:number):number|undefined{
 if(!ranges.length||!Number.isFinite(sample))return undefined;
 let remaining=Math.max(0,Math.floor(sample));
 for(const range of ranges){const length=range.end-range.start;if(remaining<length)return range.start+remaining;remaining-=length;}
 return ranges.at(-1)!.end;
}
