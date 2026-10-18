import {auditionSamples,sampleRanges,type SampleRange} from '../../lib/sourceEditing';

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

/** Same static graph as audition; join selections once, then scatter into a retained-source copy. */
export async function renderSourceFilter(channels:Float32Array[],ranges:SampleRange[],channel:number,rate:number,settings:SourceFilterSettings,signal:AbortSignal):Promise<Float32Array[]>{
 signal.throwIfAborted();sourceFilterSettings(settings,rate);
 const length=channels[0]?.length??0,selected=sampleRanges(ranges,length),frames=selected.reduce((n,r)=>n+r.end-r.start,0),indices=channels.map((_,i)=>i).filter(i=>channel<0||channel===i);
 if(!length||channels.some(c=>c.length!==length)||!Number.isInteger(channel)||channel< -1||channel>=channels.length||!frames)throw new Error('sourceEditor.select');
 // Include the retained-source copy and both joined input/output allocations before allocating PCM.
 if(frames>rate*120||(length*channels.length+frames*indices.length*4)*4>256*1024*1024||indices.length>2)throw new Error('sourceFilter.limit');
 const pcm=auditionSamples(indices.map(i=>channels[i]),selected);
 if(pcm.some(c=>c.some(v=>!Number.isFinite(v))))throw new Error('sourceEditor.invalidPcm');
 const ctx=new OfflineAudioContext(pcm.length,frames,rate),buffer=ctx.createBuffer(pcm.length,frames,rate),source=ctx.createBufferSource(),graph=createSourceFilter(ctx,ctx.destination,settings);
 pcm.forEach((c,i)=>buffer.copyToChannel(c as Float32Array<ArrayBuffer>,i));source.buffer=buffer;source.connect(graph.input);source.start();
 try{const output=await ctx.startRendering();signal.throwIfAborted();const result=channels.map(c=>new Float32Array(c));indices.forEach((ch,index)=>{const rendered=output.getChannelData(index);if(rendered.some(v=>!Number.isFinite(v)))throw new Error('sourceEditor.invalidPcm');let offset=0;for(const r of selected){result[ch].set(rendered.subarray(offset,offset+r.end-r.start),r.start);offset+=r.end-r.start;}});return result;}finally{source.disconnect();graph.close();}
}
