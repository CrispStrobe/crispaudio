export interface PluginBlock {offset:number;samples:Float32Array[]}
export interface PluginBlockResult extends PluginBlock {recycle:Float32Array[]}
/** Fixed sample-clock delay. Missed deadlines stop processing; late audio is never shifted. */
export class PluginBlockBuffer {
 readonly blockFrames:number;readonly delayFrames:number;private channels:number;private origin:number;private cursor=0;private fill=0;private input:Float32Array[];private pool:Float32Array[][]=[];private output=new Map<number,Float32Array[]>();private pending=new Set<number>();private nextReply=0;private failed=false;private disposed=false;
 private send:(block:PluginBlock)=>void;private fail:(reason:string,offset?:number)=>void;
 constructor(channels:number,blockFrames:number,delayBlocks:number,origin:number,send:(block:PluginBlock)=>void,fail:(reason:string,offset?:number)=>void){
  if(![1,2].includes(channels)||!Number.isInteger(blockFrames)||blockFrames<128||blockFrames>4096||!Number.isInteger(delayBlocks)||delayBlocks<2||delayBlocks>4||!Number.isSafeInteger(origin)||origin<0)throw new Error('Invalid plugin buffer configuration');
  this.channels=channels;this.blockFrames=blockFrames;this.delayFrames=delayBlocks*blockFrames;this.origin=origin;this.send=send;this.fail=fail;
  for(let i=0;i<delayBlocks+2;i++)this.pool.push(Array.from({length:channels},()=>new Float32Array(blockFrames)));this.input=this.pool.pop()!;
 }
 get active(){return !this.failed&&!this.disposed;}
 dispose(){this.disposed=true;this.output.clear();this.pending.clear();this.pool=[];}
 private fault(reason:string,offset?:number){if(!this.active)return;this.failed=true;this.output.clear();this.pending.clear();this.fail(reason,offset);}
 accept(block:PluginBlockResult){if(!this.active)return;const valid=(samples:Float32Array[])=>samples.length===this.channels&&samples.every(s=>s instanceof Float32Array&&s.length===this.blockFrames);
  if(block.offset!==this.nextReply||!this.pending.has(block.offset)||!valid(block.samples)||!valid(block.recycle)||block.samples.some(s=>s.some(v=>!Number.isFinite(v)))){this.fault('invalid-reply');return;}
  if(this.cursor>block.offset+this.delayFrames){this.fault('late-reply',block.offset);return;}this.pending.delete(block.offset);this.nextReply+=this.blockFrames;this.output.set(block.offset,block.samples);this.pool.push(block.recycle);
 }
 process(input:Float32Array[],output:Float32Array[],frame:number){for(const ch of output)ch.fill(0);if(!this.active)return false;const count=output[0]?.length??0;
  for(let i=0;i<count;i++){
   const absolute=frame+i;if(absolute<this.origin)continue;if(absolute-this.origin!==this.cursor){this.fault('clock-discontinuity');break;}
   const position=this.cursor-this.delayFrames;
   if(position>=0){const start=Math.floor(position/this.blockFrames)*this.blockFrames,pcm=this.output.get(start);if(!pcm){this.fault('underrun',start);break;}for(let ch=0;ch<output.length;ch++)output[ch][i]=pcm[Math.min(ch,this.channels-1)][position-start];if(position-start===this.blockFrames-1)this.output.delete(start);}
   for(let ch=0;ch<this.channels;ch++){const value=input[ch]?.[i]??input[0]?.[i]??0;if(!Number.isFinite(value)){this.fault('invalid-input');break;}this.input[ch][this.fill]=value;}if(!this.active)break;
   this.fill++;this.cursor++;if(this.fill===this.blockFrames){const samples=this.input,next=this.pool.pop();if(!next){this.fault('backpressure');break;}this.input=next;this.fill=0;const offset=this.cursor-this.blockFrames;this.pending.add(offset);this.send({offset,samples});}
  }
  if(!this.active)for(const ch of output)ch.fill(0);return this.active;
 }
}
