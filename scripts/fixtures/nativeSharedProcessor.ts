import {PluginBlockBuffer} from '../../src/audio/plugins/PluginBlockBuffer';
import {NativeSharedRings,BLOCK,SLOTS,TRACE_SLOTS} from './nativeSharedRings';
declare const currentFrame:number;
declare function registerProcessor(name:string,processor:typeof AudioWorkletProcessor):void;
declare class AudioWorkletProcessor {port:MessagePort;constructor(options?:unknown);}
class SharedProcessor extends AudioWorkletProcessor {
 private rings:NativeSharedRings;private buffer:PluginBlockBuffer;private next=0;private held:(Float32Array[]|undefined)[]=Array(SLOTS);private origin:number;
 constructor(options:{processorOptions:{shared:SharedArrayBuffer;startFrame:number}}){
  super();const p=options.processorOptions;this.origin=p.startFrame;this.rings=new NativeSharedRings(p.shared);
  this.buffer=new PluginBlockBuffer(2,BLOCK,4,p.startFrame,block=>{
   const index=block.offset/BLOCK,c=this.rings.control;
   if(index!==Atomics.load(c,1)||index-Atomics.load(c,2)>=SLOTS){this.rings.fail(3,currentFrame,block.offset);return;}
   this.held[index%SLOTS]=block.samples;
   for(let channel=0;channel<2;channel++)this.rings.input[index%SLOTS][channel].set(block.samples[channel]);
   Atomics.store(c,1,index+1);
  },(_reason,offset)=>this.rings.fail(2,currentFrame,offset??-1));
 }
 process(inputs:Float32Array[][],outputs:Float32Array[][]){
  const c=this.rings.control;Atomics.store(c,5,currentFrame);
  if(Atomics.load(c,0)){for(const channel of outputs[0]??[])channel.fill(0);this.buffer.dispose();return false;}
  const written=Atomics.load(c,3);
  while(this.next<written){
   const index=this.next++,recycle=this.held[index%SLOTS];
   if(!recycle){this.rings.fail(3,currentFrame,index*BLOCK);break;}
   this.buffer.accept({offset:index*BLOCK,samples:this.rings.output[index%SLOTS],recycle});this.held[index%SLOTS]=undefined;
   if(!this.buffer.active)break;
   Atomics.store(this.rings.accepted,index%TRACE_SLOTS,currentFrame);
  }
  const active=this.buffer.process(inputs[0]??[],outputs[0]??[],currentFrame);
  if(Atomics.load(c,0)){for(const channel of outputs[0]??[])channel.fill(0);this.buffer.dispose();return false;}
  if(active)Atomics.store(c,4,Math.floor(Math.max(0,currentFrame+128-this.origin-BLOCK*4)/BLOCK));
  Atomics.store(c,5,currentFrame+128);return active;
 }
}
registerProcessor('crispaudio-native-validation-shared',SharedProcessor);
