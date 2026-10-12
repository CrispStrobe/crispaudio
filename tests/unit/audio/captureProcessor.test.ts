import {it,expect,vi} from 'vitest';
it('captures selected input frames exactly, flushes the last block and monitors independently',async()=>{
 let Processor: {new():{port:{onmessage:(event:{data:unknown})=>void};process:(inputs:Float32Array[][],outputs:Float32Array[][])=>boolean}}|undefined;
 const messages:Record<string,unknown>[]=[];
 vi.stubGlobal('AudioWorkletProcessor',class{port={onmessage:()=>{},postMessage:(m:Record<string,unknown>)=>messages.push(m),close:()=>{}};});
 vi.stubGlobal('registerProcessor',(_name:string,p:typeof Processor)=>{Processor=p;});vi.stubGlobal('currentFrame',0);
 try{await import('../../../src/audio/worklets/captureProcessor');const node=new Processor!();node.port.onmessage({data:{type:'start',id:7,frame:32,mode:'right'}});
 const left=Float32Array.from({length:128},(_,i)=>i/128),right=Float32Array.from({length:128},(_,i)=>-i/128),output=[new Float32Array(128),new Float32Array(128)];node.process([[left,right]],[output]);expect(output[0]).toEqual(right);
 vi.stubGlobal('currentFrame',128);node.port.onmessage({data:{type:'stop',frame:160}});node.process([[left,right]],[output]);const pcm=messages.find(m=>m.type==='pcm')!;expect(pcm.id).toBe(7);expect(pcm.firstFrame).toBe(32);expect(pcm.left).toEqual(Float32Array.from([...right.slice(32),...right.slice(0,32)]));expect(messages.find(m=>m.type==='stopped')?.frame).toBe(160);
 }finally{vi.unstubAllGlobals();}
});
