import type { GainPoint, TimelineTrack, AudioSource } from '../types/audio';
export function gainAt(points:GainPoint[]|undefined,time:number):number {
  const sorted=[...(points??[])].filter(p=>Number.isFinite(p.time)&&Number.isFinite(p.value)&&p.time>=0&&p.value>=0).sort((a,b)=>a.time-b.time);
  if(!sorted.length)return 1;
  if(time<=sorted[0].time)return sorted[0].value;
  for(let i=1;i<sorted.length;i++)if(time<sorted[i].time){const a=sorted[i-1],b=sorted[i];return a.value+(b.value-a.value)*(time-a.time)/(b.time-a.time);}
  return sorted.at(-1)!.value;
}
export function scheduleGain(param:AudioParam,points:GainPoint[]|undefined,contextStart:number,timelineStart:number){
  param.setValueAtTime(gainAt(points,timelineStart),contextStart);
  for(const point of [...(points??[])].sort((a,b)=>a.time-b.time))if(point.time>timelineStart)param.linearRampToValueAtTime(point.value,contextStart+point.time-timelineStart);
}
export interface MicSection { start:number; end:number; trackId:string; confidence:number }
/** Measured suggestions, not speaker recognition. Normalize each mic's active level first. */
export async function suggestMicSections(tracks:TimelineTrack[],sources:Map<string,AudioSource>,signal?:AbortSignal):Promise<MicSection[]>{
  const duration=Math.max(0,...tracks.flatMap(t=>t.segments).map(c=>c.startTime+c.duration));
  if(duration>7200)throw new Error('Microphone comparison is limited to two hours');
  const levels:number[][]=[];
  for(const track of tracks){
    const bins=new Array(Math.ceil(duration)).fill(0);
    for(const clip of track.segments){
      const source=sources.get(clip.sourceId);if(!source)throw new Error('Missing microphone audio');
      const data=source.buffer.getChannelData(0),rate=source.sampleRate;
      for(let second=Math.floor(clip.startTime);second<Math.min(bins.length,clip.startTime+clip.duration);second++){
        signal?.throwIfAborted();
        const a=Math.max(0,Math.ceil((clip.sourceOffset+Math.max(second,clip.startTime)-clip.startTime)*rate));
        const b=Math.min(data.length,Math.floor((clip.sourceOffset+Math.min(second+1,clip.startTime+clip.duration)-clip.startTime)*rate));
        let sum=0,count=0;for(let i=a;i<b;i+=Math.max(1,Math.floor(rate/8000))){sum+=data[i]*data[i];count++;}
        bins[second]+=count?Math.sqrt(sum/count):0;
        if(second%60===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
      }
    }
    const active=[...bins].filter(v=>v>1e-5).sort((a,b)=>b-a);
    const reference=active[Math.floor(active.length*.3)]||1;
    levels.push(bins.map(v=>v/reference));
  }
  const sections:MicSection[]=[];let chosen=0,pending=-1,held=0;
  for(let second=0;second<Math.ceil(duration);second++){
    const values=levels.map((bins,i)=>({i,v:bins[second]||0})).sort((a,b)=>b.v-a.v),best=values[0];
    const ratio=best.v/Math.max(.001,values[1]?.v??.001);
    if(best.v>.05&&ratio>1.4&&best.i!==chosen){if(pending===best.i)held++;else{pending=best.i;held=1;}if(held>=2){chosen=best.i;held=0;}}
    else{pending=-1;held=0;}
    const last=sections.at(-1),end=Math.min(duration,second+1),confidence=Math.min(1,Math.max(0,(ratio-1)/2));
    if(last?.trackId===tracks[chosen].id){last.end=end;last.confidence=Math.min(last.confidence,confidence);}else sections.push({start:second,end,trackId:tracks[chosen].id,confidence});
  }
  return sections;
}
export function micAutomation(trackId:string,sections:MicSection[],crossfade=.08):GainPoint[]{
  const points:GainPoint[]=[];
  sections.forEach((section,i)=>{
    const value=section.trackId===trackId?1:0;
    if(!i)points.push({time:0,value});
    else{const prior=sections[i-1].trackId===trackId?1:0;const half=Math.min(crossfade/2,(section.end-section.start)/2,(sections[i-1].end-sections[i-1].start)/2);points.push({time:section.start-half,value:prior},{time:section.start+half,value});}
  });
  return points;
}
