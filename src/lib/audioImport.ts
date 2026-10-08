import type { AudioSource } from '../types/audio';
export interface AudioImportInput { name:string; filePath?:string; read:()=>Promise<ArrayBuffer> }
export type ImportPhase='reading'|'decoding'|'waveform';
/** Decode once without retaining a second full encoded-file copy. */
export async function prepareAudioImport(ctx:BaseAudioContext,input:AudioImportInput,signal:AbortSignal,progress:(phase:ImportPhase)=>void):Promise<AudioSource>{
  progress('reading');let bytes=await input.read();signal.throwIfAborted();
  progress('decoding');let buffer:AudioBuffer;
  try{buffer=await ctx.decodeAudioData(bytes);}catch{
    signal.throwIfAborted();bytes=await input.read();
    const {decodeCompressedToBuffer}=await import('./codecs');buffer=await decodeCompressedToBuffer(ctx as AudioContext,new Uint8Array(bytes));
  }
  signal.throwIfAborted();progress('waveform');
  const samples=buffer.getChannelData(0),bins=Math.max(1,Math.min(8000,Math.ceil(buffer.duration*200))),min=new Float32Array(bins),max=new Float32Array(bins),size=samples.length/bins;
  let last=performance.now();
  for(let bin=0;bin<bins;bin++){
    let lo=Infinity,hi=-Infinity;const end=Math.min(samples.length,Math.ceil((bin+1)*size));
    for(let i=Math.floor(bin*size);i<end;i++){const value=samples[i];if(value<lo)lo=value;if(value>hi)hi=value;}
    min[bin]=lo===Infinity?0:lo;max[bin]=hi===-Infinity?0:hi;
    if(performance.now()-last>8){await new Promise(resolve=>setTimeout(resolve,0));signal.throwIfAborted();last=performance.now();}
  }
  return {id:crypto.randomUUID(),name:input.name,filePath:input.filePath,buffer,peaks:{min,max},duration:buffer.duration,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels};
}
