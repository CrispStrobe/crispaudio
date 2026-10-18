import {sampleRanges,type SampleRange} from '../../lib/sourceEditing';

export interface SourceFilterSettings {highpass:number;lowpass:number;gainDb:number}
export const DEFAULT_SOURCE_FILTER:SourceFilterSettings={highpass:80,lowpass:16000,gainDb:0};
export function sourceFilterSettings(settings:SourceFilterSettings,rate:number):SourceFilterSettings {
 if(!Number.isFinite(rate)||rate<8000||rate>192000||!Number.isFinite(settings.highpass)||!Number.isFinite(settings.lowpass)||!Number.isFinite(settings.gainDb)||settings.highpass<20||settings.highpass>2000||settings.lowpass<200||settings.lowpass>20000||settings.gainDb< -24||settings.gainDb>0)throw new Error('sourceEditor.invalidPcm');
 return {...settings,highpass:Math.min(settings.highpass,rate*.49),lowpass:Math.min(settings.lowpass,rate*.49)};
}

/** One persistent, zero-lookahead graph. Bypass keeps both filter histories running. */
export function createSourceFilter(ctx:BaseAudioContext,output:AudioNode,settings:SourceFilterSettings,bypass=false){
 const values=sourceFilterSettings(settings,ctx.sampleRate),input=ctx.createGain(),high=ctx.createBiquadFilter(),low=ctx.createBiquadFilter(),level=ctx.createGain(),wet=ctx.createGain(),dry=ctx.createGain();
 high.type='highpass';low.type='lowpass';// Web Audio pass-filter Q is expressed in dB.
 high.Q.value=low.Q.value=20*Math.log10(Math.SQRT1_2);
 high.frequency.value=values.highpass;low.frequency.value=values.lowpass;level.gain.value=10**(values.gainDb/20);wet.gain.value=bypass?0:1;dry.gain.value=bypass?1:0;
 input.connect(high);high.connect(low);low.connect(level);level.connect(wet);wet.connect(output);input.connect(dry);dry.connect(output);
 let closed=false;
 return {input,update:(next:SourceFilterSettings,original=false)=>{if(closed)return;const v=sourceFilterSettings(next,ctx.sampleRate),at=ctx.currentTime;high.frequency.setTargetAtTime(v.highpass,at,.01);low.frequency.setTargetAtTime(v.lowpass,at,.01);level.gain.setTargetAtTime(10**(v.gainDb/20),at,.005);wet.gain.setTargetAtTime(original?0:1,at,.005);dry.gain.setTargetAtTime(original?1:0,at,.005);},close:()=>{if(closed)return;closed=true;for(const node of [input,high,low,level,wet,dry])node.disconnect();}};
}

/** Validate before allocation; budgets include the full retained-source copy and render scratch. */
export function sourceFilterRenderPlan(channels:Float32Array[],ranges:SampleRange[],channel:number,rate:number,settings:SourceFilterSettings,budgetBytes=256*1024*1024){
 sourceFilterSettings(settings,rate);
 const length=channels[0]?.length??0,selected=sampleRanges(ranges,length),frames=selected.reduce((n,r)=>n+r.end-r.start,0),indices=channels.map((_,i)=>i).filter(i=>channel<0||channel===i);
 if(!length||channels.some(c=>c.length!==length)||!Number.isInteger(channel)||channel< -1||channel>=channels.length||!frames)throw new Error('sourceEditor.select');
 const allocationBytes=(length*channels.length+frames*indices.length*4)*4;
 if(frames>rate*120||allocationBytes>budgetBytes||indices.length>2)throw new Error('sourceFilter.limit');
 return {selected,frames,indices,allocationBytes};
}

/** Same static graph as audition; join selections once, then scatter into a retained-source copy. */
export async function renderSourceFilter(channels:Float32Array[],ranges:SampleRange[],channel:number,rate:number,settings:SourceFilterSettings,signal:AbortSignal,budgetBytes=256*1024*1024):Promise<Float32Array[]>{
 signal.throwIfAborted();const {selected,frames,indices}=sourceFilterRenderPlan(channels,ranges,channel,rate,settings,budgetBytes);
 // Validation/copy loops yield between bounded chunks so waveform work cannot monopolize the UI.
 const chunk=65536;
 let deadline=performance.now()+8;
 const checkpoint=async()=>{
  signal.throwIfAborted();
  if(performance.now()>=deadline){await new Promise<void>(resolve=>setTimeout(resolve,0));deadline=performance.now()+8;}
  signal.throwIfAborted();
 };
 const pcm=indices.map(()=>new Float32Array(frames));
 for(let index=0;index<indices.length;index++){
  const input=channels[indices[index]];let offset=0;
  for(const range of selected)for(let from=range.start;from<range.end;from+=chunk){
   const end=Math.min(range.end,from+chunk);
   for(let i=from;i<end;i++)if(!Number.isFinite(input[i]))throw new Error('sourceEditor.invalidPcm');
   pcm[index].set(input.subarray(from,end),offset);offset+=end-from;await checkpoint();
  }
 }
 signal.throwIfAborted();
 const ctx=new OfflineAudioContext(pcm.length,frames,rate),buffer=ctx.createBuffer(pcm.length,frames,rate),source=ctx.createBufferSource(),graph=createSourceFilter(ctx,ctx.destination,settings);
 pcm.forEach((c,i)=>buffer.copyToChannel(c as Float32Array<ArrayBuffer>,i));source.buffer=buffer;source.connect(graph.input);source.start();
 try{
  const output=await ctx.startRendering();signal.throwIfAborted();
  const result=channels.map(c=>new Float32Array(c.length));
  for(let ch=0;ch<channels.length;ch++)for(let from=0;from<channels[ch].length;from+=chunk){
   result[ch].set(channels[ch].subarray(from,Math.min(channels[ch].length,from+chunk)),from);await checkpoint();
  }
  for(let index=0;index<indices.length;index++){
   const rendered=output.getChannelData(index);let offset=0;
   for(const range of selected)for(let from=range.start;from<range.end;from+=chunk){
    const end=Math.min(range.end,from+chunk),count=end-from;
    for(let i=offset;i<offset+count;i++)if(!Number.isFinite(rendered[i]))throw new Error('sourceEditor.invalidPcm');
    result[indices[index]].set(rendered.subarray(offset,offset+count),from);offset+=count;await checkpoint();
   }
  }
  signal.throwIfAborted();return result;
 }finally{source.disconnect();graph.close();}
}
