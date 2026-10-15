import {beforeEach,it,expect,vi} from 'vitest';
import {NativeSharedRings,SHARED_BYTES,BLOCK,SLOTS} from '../../../scripts/fixtures/nativeSharedRings';
interface Processor {process(inputs:Float32Array[][],outputs:Float32Array[][]):boolean}
let Processor: new(options:{processorOptions:{shared:SharedArrayBuffer;startFrame:number}})=>Processor;
beforeEach(async()=>{
 vi.resetModules();vi.stubGlobal('AudioWorkletProcessor',class {port={postMessage:vi.fn()};});
 vi.stubGlobal('registerProcessor',(_name:string,constructor:typeof Processor)=>{Processor=constructor;});
 vi.stubGlobal('currentFrame',0);await import('../../../scripts/fixtures/nativeSharedProcessor');
});
it('preserves exact sample positions and stereo PCM through multiple shared-slot wraps',()=>{
 const shared=new SharedArrayBuffer(SHARED_BYTES),ring=new NativeSharedRings(shared),processor=new Processor({processorOptions:{shared,startFrame:0}});
 for(let frame=0;frame<BLOCK*12;frame+=128){
  vi.stubGlobal('currentFrame',frame);
  const input=Array.from({length:2},(_,channel)=>Float32Array.from({length:128},(_,i)=>(channel?-1:1)*(frame+i)/1024)),output=[new Float32Array(128),new Float32Array(128)];
  expect(processor.process([input],[output])).toBe(true);
  for(let channel=0;channel<2;channel++)for(let i=0;i<128;i++)expect(output[channel][i]).toBe(frame+i<BLOCK*4?0:(channel?-1:1)*(frame+i-BLOCK*4)/1024);
  const index=Atomics.load(ring.control,2);
  if(index<Atomics.load(ring.control,1)){
   expect(index-Atomics.load(ring.control,4)).toBeLessThan(SLOTS);
   for(let channel=0;channel<2;channel++)ring.output[index%SLOTS][channel].set(ring.input[index%SLOTS][channel]);
   Atomics.store(ring.control,2,index+1);Atomics.store(ring.control,3,index+1);
  }
 }
 expect(Atomics.load(ring.control,0)).toBe(0);
});
it('publishes an underrun and mutes the whole output quantum at the unchanged sample deadline',()=>{
 const shared=new SharedArrayBuffer(SHARED_BYTES),ring=new NativeSharedRings(shared),processor=new Processor({processorOptions:{shared,startFrame:0}});
 for(let frame=0;frame<=BLOCK*4;frame+=128){
  vi.stubGlobal('currentFrame',frame);const output=[new Float32Array(128).fill(9),new Float32Array(128).fill(9)];
  expect(processor.process([[new Float32Array(128).fill(1),new Float32Array(128).fill(-1)]],[output])).toBe(frame<BLOCK*4);
  expect(output.every(channel=>channel.every(value=>value===0))).toBe(true);
 }
 expect(Atomics.load(ring.control,0)).toBe(2);expect(Atomics.load(ring.control,6)).toBe(BLOCK*4);expect(Atomics.load(ring.control,7)).toBe(0);
});
