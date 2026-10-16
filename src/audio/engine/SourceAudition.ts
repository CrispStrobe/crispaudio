import {auditionSamples,type SampleRange} from '../../lib/sourceEditing';

type Voice={source:AudioBufferSourceNode;gain:GainNode;at:number;from:number;to:number;end:number};

/** Source-only audition. Replacements retain the concatenated selection clock. */
export class SourceAudition {
 private voice?:Voice;
 private retired=new Set<Voice>();
 private origin=0;
 private duration=0;
 private looping=false;
 private buffer?:AudioBuffer;
 private ctx:BaseAudioContext;
 private output:AudioNode;
 private ended:()=>void;
 constructor(ctx:BaseAudioContext,output:AudioNode,ended:()=>void=()=>{}){this.ctx=ctx;this.output=output;this.ended=ended;}
 get playing(){return !!this.voice;}
 position(at=this.ctx.currentTime){const elapsed=Math.max(0,at-this.origin);return this.looping&&this.duration?elapsed%this.duration:Math.min(this.duration,elapsed);}
 start(buffer:AudioBuffer,loop=false,scheduledAt?:number){this.stop();const at=scheduledAt??this.ctx.currentTime;if(!buffer.length||!Number.isFinite(at)||at<0)throw new Error('Invalid source audition');this.origin=Math.max(at,this.ctx.currentTime);this.duration=buffer.duration;this.looping=loop;this.buffer=buffer;this.voice=this.create(buffer,at,0,1);}
 setLoop(loop:boolean){if(this.looping===loop)return;const at=this.ctx.currentTime,offset=this.position(at);this.origin=at-offset;this.looping=loop;if(this.voice)this.voice.source.loop=loop;}
 replace(buffer:AudioBuffer){
  if(buffer===this.buffer)return;
  if(!this.voice){return;}
  if(buffer.length!==this.buffer?.length||buffer.sampleRate!==this.buffer.sampleRate||buffer.numberOfChannels!==this.buffer.numberOfChannels)throw new Error('Mismatched source audition');
  const at=this.ctx.currentTime,offset=this.position(at);
  if(!this.looping&&offset>=this.duration){this.stop();this.ended();return;}
  const old=this.voice,next=this.create(buffer,at,offset,0),fade=.01;
  next.gain.gain.linearRampToValueAtTime(1,at+fade);next.to=1;next.end=at+fade;
  this.retired.add(old);
  // Anchor every still-fading voice, so rapid switches retain unity total gain.
  for(const voice of this.retired){
   const fraction=voice.end>voice.at?Math.min(1,Math.max(0,(at-voice.at)/(voice.end-voice.at))):1;
   const held=voice.from+(voice.to-voice.from)*fraction;
   voice.gain.gain.cancelScheduledValues(at);voice.gain.gain.setValueAtTime(held,at);voice.gain.gain.linearRampToValueAtTime(0,at+fade);
   voice.at=at;voice.from=held;voice.to=0;voice.end=at+fade;voice.source.stop(at+fade);
  }
  this.voice=next;this.buffer=buffer;
  // Bound retained graph nodes even if a hidden window delays onended delivery.
  if(this.retired.size>8)this.dispose(this.retired.values().next().value!);
 }
 private create(buffer:AudioBuffer,at:number,offset:number,level:number){
  const source=this.ctx.createBufferSource(),gain=this.ctx.createGain(),voice:Voice={source,gain,at,from:level,to:level,end:at};source.buffer=buffer;source.loop=this.looping;gain.gain.setValueAtTime(level,at);source.connect(gain);gain.connect(this.output);
  source.onended=()=>{const active=this.voice===voice;this.dispose(voice);if(active){this.voice=undefined;this.ended();}};source.start(at,offset);return voice;
 }
 private dispose(voice:Voice){voice.source.onended=null;try{voice.source.stop();}catch{/* Already ended. */}voice.source.disconnect();voice.gain.disconnect();this.retired.delete(voice);}
 stop(){if(this.voice)this.dispose(this.voice);this.voice=undefined;for(const voice of this.retired)this.dispose(voice);this.buffer=undefined;}
}

/** Allocated on Play/replacement, never just for opening or redrawing the editor. */
export function makeSourceAuditionBuffer(ctx:BaseAudioContext,channels:Float32Array[],ranges:SampleRange[],rate:number):AudioBuffer|null{
 const pcm=auditionSamples(channels,ranges);if(!pcm[0]?.length)return null;
 const buffer=ctx.createBuffer(pcm.length,pcm[0].length,rate);pcm.forEach((c,i)=>buffer.copyToChannel(c as Float32Array<ArrayBuffer>,i));return buffer;
}
