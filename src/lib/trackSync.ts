import type { AudioSource, TimelineTrack } from '../types/audio';
/** Low-pass box averages at 1 kHz, pre-gain/effects. Include project positions. */
export function analysisTrack(track: TimelineTrack, sources: Map<string,AudioSource>): Float32Array {
  const end=Math.max(0,...track.segments.map(c=>c.startTime+c.duration));
  if(end>3600*2)throw new Error('Synchronization is limited to two hours per track');
  const result=new Float32Array(Math.ceil(end*1000));
  for(const clip of track.segments){
    const source=sources.get(clip.sourceId);if(!source)throw new Error('Missing track audio');
    const data=source.buffer.getChannelData(0), rate=source.sampleRate;
    for(let i=Math.max(0,Math.ceil(clip.startTime*1000));i<Math.min(result.length,Math.ceil((clip.startTime+clip.duration)*1000));i++){
      const a=Math.max(0,Math.floor((clip.sourceOffset+i/1000-clip.startTime)*rate));
      const b=Math.min(data.length,Math.ceil((clip.sourceOffset+(i+1)/1000-clip.startTime)*rate));
      let sum=0;for(let n=a;n<b;n++)sum+=data[n];
      if(b>a)result[i]+=sum/(b-a);
    }
  }
  return result;
}
export function shiftedTrack(track: TimelineTrack, offset: number): TimelineTrack {
  return {...track,segments:track.segments.flatMap(clip=>{
    const start=clip.startTime-offset,trim=Math.max(0,-start),duration=clip.duration-trim;
    return duration>0?[{...clip,startTime:Math.max(0,start),sourceOffset:clip.sourceOffset+trim,duration,fadeInDuration:Math.min(clip.fadeInDuration,duration),fadeOutDuration:Math.min(clip.fadeOutDuration,duration)}]:[];
  })};
}
export function syncPayload(reference: Float32Array,target: Float32Array): Uint8Array {
  const bytes=new Uint8Array(4+(reference.length+target.length)*4),view=new DataView(bytes.buffer);
  view.setUint32(0,reference.length,true);
  let i=4;for(const samples of [reference,target])for(const value of samples){view.setFloat32(i,value,true);i+=4;}
  return bytes;
}
