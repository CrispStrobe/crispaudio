// Validation-only, single producer/consumer rings. Publication uses atomic counters.
export const BLOCK=4096,CHANNELS=2,SLOTS=4,TRACE_SLOTS=128;
const HEADER=16,PCM=SLOTS*CHANNELS*BLOCK;
export const SHARED_BYTES=(HEADER+TRACE_SLOTS+PCM*2)*4;
export class NativeSharedRings {
 readonly control:Int32Array;readonly accepted:Int32Array;
 readonly input:Float32Array[][];readonly output:Float32Array[][];
 constructor(buffer:SharedArrayBuffer){
  if(buffer.byteLength!==SHARED_BYTES)throw new Error('Invalid shared ring size');
  this.control=new Int32Array(buffer,0,HEADER);this.accepted=new Int32Array(buffer,HEADER*4,TRACE_SLOTS);
  const views=(base:number)=>Array.from({length:SLOTS},(_,slot)=>Array.from({length:CHANNELS},(_,channel)=>new Float32Array(buffer,(base+(slot*CHANNELS+channel)*BLOCK)*4,BLOCK)));
  this.input=views(HEADER+TRACE_SLOTS);this.output=views(HEADER+TRACE_SLOTS+PCM);
 }
 fail(code:number,frame:number,offset:number){if(Atomics.load(this.control,0))return;Atomics.store(this.control,6,frame);Atomics.store(this.control,7,offset);Atomics.compareExchange(this.control,0,0,code);}
}
