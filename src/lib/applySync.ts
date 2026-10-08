import type { TimelineProject, AudioSource } from '../types/audio';
import type { Alignment } from './media';
import { computeWaveformPeaks } from '../audio/utils/audioBufferUtils';
import { videoClips, validateVideoClips } from './videoEditing';
import { timelineDuration } from './timelineView';
import { linkedIds, projectClips } from './projectEdits';
/** Prepare sources and one new project. Cancellation never partially applies an edit. */
export async function applySync(project:TimelineProject,sources:Map<string,AudioSource>,reference:string,results:{id:string;alignment:Alignment}[],correctDrift:boolean,signal?:AbortSignal){
  const nextSources=new Map(sources),retimed=new Map<string,{startTime:number;sourceOffset:number;duration:number}>();
  const claimed=new Set<string>();
  for(const {id,alignment:a} of results){
    if(!a.reliable&&!a.manual)throw new Error('Uncertain synchronization requires review');
    if(!Number.isFinite(a.offset)||!Number.isFinite(a.rate)||a.rate<.99||a.rate>1.01)throw new Error('Invalid synchronization clock');
    const track=project.tracks.find(t=>t.id===id);if(!track)throw new Error('Missing sync track');
    const ids=linkedIds(project,track.segments.map(c=>c.id));
    if(ids.some(id=>claimed.has(id)))throw new Error('Two sync results affect the same linked clip');
    if(project.tracks.find(t=>t.id===reference)?.segments.some(c=>ids.includes(c.id)))throw new Error('Cannot shift a linked reference track');
    ids.forEach(id=>claimed.add(id));
    const rate=correctDrift?a.rate:1;
    if(correctDrift&&Math.abs(rate-1)>1e-8&&videoClips(project.video).some(c=>ids.includes(c.id)))throw new Error('Unlink picture before audio drift correction');
    for(const c of projectClips(project).filter(c=>ids.includes(c.id))){
      const start=(c.startTime-a.offset)/rate,trim=Math.max(0,-start),duration=c.duration/rate-trim;
      retimed.set(c.id,{startTime:Math.max(0,start),sourceOffset:c.sourceOffset/rate+trim,duration:Math.max(0,duration)});
    }
    if(correctDrift&&rate!==1){
      const affected=project.tracks.flatMap(t=>t.segments).filter(c=>ids.includes(c.id));
      const sourceIds=[...new Set(affected.map(c=>c.sourceId))];
      for(const sourceId of sourceIds){
        const source=sources.get(sourceId);if(!source)throw new Error('Missing sync audio');
        const length=Math.floor(source.buffer.length/rate);
        if(length*source.channels>128_000_000)throw new Error('Drift correction exceeds memory budget; use CLI align');
        const buffer=new AudioBuffer({length,numberOfChannels:source.channels,sampleRate:source.sampleRate});let slice=performance.now();
        for(let ch=0;ch<source.channels;ch++){
          const input=source.buffer.getChannelData(ch),output=buffer.getChannelData(ch);
          for(let i=0;i<length;i++){const pos=i*rate,index=Math.floor(pos),fraction=pos-index;output[i]=input[index]*(1-fraction)+(input[Math.min(index+1,input.length-1)])*fraction;
            if(i%16384===0&&performance.now()-slice>8){signal?.throwIfAborted();await new Promise<void>(resolve=>setTimeout(resolve,0));slice=performance.now();}}
        }
        const replacement={...source,id:crypto.randomUUID(),buffer,duration:buffer.duration,filePath:undefined,peaks:computeWaveformPeaks(buffer.getChannelData(0),Math.min(8000,Math.ceil(buffer.duration*200)))};
        nextSources.set(replacement.id,replacement);
        // Track-scoped source mapping: other tracks retain original buffers.
        for(const c of affected.filter(c=>c.sourceId===sourceId))Object.assign(retimed.get(c.id)!,{sourceId:replacement.id});
      }
    }
  }
  signal?.throwIfAborted();
  const tracks=project.tracks.map(t=>({...t,segments:t.segments.flatMap(c=>{
    const patch=retimed.get(c.id);if(!patch)return [c];return patch.duration>.00001?[{...c,...patch,fadeInDuration:Math.min(c.fadeInDuration,patch.duration),fadeOutDuration:Math.min(c.fadeOutDuration,patch.duration)}]:[];
  })}));
  const video=project.video&&videoClips(project.video).some(c=>retimed.has(c.id))?{...project.video,clips:videoClips(project.video).flatMap(c=>{const patch=retimed.get(c.id);return patch?patch.duration>.00001?[{...c,...patch,fadeIn:Math.min(c.fadeIn,patch.duration/2),fadeOut:Math.min(c.fadeOut,patch.duration/2)}]:[]:[c];}),inPoint:undefined,outPoint:undefined}:project.video;
  if(video){const invalid=validateVideoClips(videoClips(video),video.duration,video.sources);if(invalid)throw new Error('Synchronization would overlap picture clips. Unlink picture or choose camera cuts first.');}
  const next={...project,tracks,video,syncHistory:[...(project.syncHistory??[]),{at:new Date().toISOString(),reference,tracks:results}].slice(-50)};
  return {project:{...next,duration:timelineDuration(next)},sources:nextSources};
}
