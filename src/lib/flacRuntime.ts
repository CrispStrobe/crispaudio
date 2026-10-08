import createFlac from './flac/flac.mjs';
import wasmUrl from './flac/flac.wasm?url';
let runtime:Promise<ReturnType<typeof createFlac>>|undefined;
async function load(){
  if(!runtime)runtime=new Promise<ReturnType<typeof createFlac>>((resolve,reject)=>{
    const module=createFlac(wasmUrl);
    if(module.isReady())return resolve(module);
    const timeout=setTimeout(()=>{runtime=undefined;reject(new Error('FLAC initialization timed out'));},30000);
    module.onready=()=>{clearTimeout(timeout);resolve(module);};
  }).catch(error=>{runtime=undefined;throw error;});
  return runtime;
}
/** Lossless relative to signed 24-bit PCM quantization; no resampling. */
export async function encodeFlac(pcm:Float32Array,channels:number,sampleRate:number):Promise<ArrayBuffer>{
  if(!Number.isInteger(channels)||channels<1||channels>8||!Number.isInteger(sampleRate)||sampleRate<1||sampleRate>655350||pcm.length%channels!==0||pcm.length===0)throw new Error('Invalid FLAC audio layout');
  const flac=await load(),frames=pcm.length/channels;
  const encoder=flac.create_libflac_encoder(sampleRate,channels,24,5,frames,true);
  if(!encoder)throw new Error('FLAC encoder creation failed');
  const chunks:Uint8Array[]=[];
  let metadata:{min_framesize:number;max_framesize:number;total_samples:number;md5sum:string}|undefined;
  try{
    if(flac.init_encoder_stream(encoder,(data,bytes)=>{chunks.push(data.slice(0,bytes));},value=>{metadata=value;})!==0)throw new Error('FLAC encoder initialization failed');
    const blockFrames=4096,block=new Int32Array(blockFrames*channels);
    for(let frame=0;frame<frames;frame+=blockFrames){
      const count=Math.min(blockFrames,frames-frame);
      for(let i=0;i<count*channels;i++){
        const value=pcm[frame*channels+i];
        if(!Number.isFinite(value))throw new Error('Non-finite FLAC audio sample');
        block[i]=Math.max(-8388608,Math.min(8388607,Math.round(value*8388608)));
      }
      if(!flac.FLAC__stream_encoder_process_interleaved(encoder,block,count))throw new Error('FLAC encoding failed');
    }
    if(!flac.FLAC__stream_encoder_finish(encoder))throw new Error('FLAC finalization failed');
    const result=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let offset=0;
    for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}
    // Streaming writes cannot seek back; publish the final STREAMINFO checksum.
    if(!metadata||result.length<42||!/^[0-9a-f]{32}$/i.test(metadata.md5sum))throw new Error('Missing FLAC stream metadata');
    const view=new DataView(result.buffer);
    for(const [offset,value] of [[12,metadata.min_framesize],[15,metadata.max_framesize]]){view.setUint8(offset,value>>>16);view.setUint8(offset+1,value>>>8);view.setUint8(offset+2,value);}
    view.setBigUint64(18,(view.getBigUint64(18)&~((1n<<36n)-1n))|BigInt(metadata.total_samples));
    for(let i=0;i<16;i++)result[26+i]=parseInt(metadata.md5sum.slice(i*2,i*2+2),16);
    return result.buffer;
  }finally{flac.FLAC__stream_encoder_delete(encoder);}
}
