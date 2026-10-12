import type {TimelineProject,CompRegion,AudioSource,AudioSegment} from '../types/audio';
import {timelineDuration} from './timelineView';
/** Preserved takes are immutable source references; comp edits replace only the mix. */
export function chooseTake(project:TimelineProject,trackId:string,takeId:string,start:number,end:number,crossfade:number,sources:Map<string,AudioSource>,replaceRegionId?:string):TimelineProject{
 const track=project.tracks.find(t=>t.id===trackId),take=track?.takes?.find(t=>t.id===takeId);
 if(!track||!take||track.kind==='bus'||track.locked||take.inactive)throw new Error('recording.locked');
 const source=sources.get(take.sourceId);if(!source)throw new Error('recording.missingSource');
 if(![start,end,crossfade].every(Number.isFinite)||start<take.startTime||end>take.startTime+take.duration+1e-6||end<=start||crossfade<0||crossfade>1)throw new Error('recording.invalidComp');
 const offset=take.sourceOffset+start-take.startTime;
 if(offset<0||offset+end-start>source.duration+1e-6)throw new Error('recording.invalidComp');
 const base=track.compBaseSegments??track.segments;
 const ordered=[...base].sort((a,b)=>a.startTime-b.startTime);if(ordered.some((c,i)=>i>0&&ordered[i-1].startTime+ordered[i-1].duration>c.startTime+1e-6))throw new Error('recording.overlap');
 if(base.some(c=>c.linkGroup&&c.startTime<end&&c.startTime+c.duration>start))throw new Error('recording.unlink');
 const retained=(track.compRegions??[]).filter(r=>r.id!==replaceRegionId);
 const regions:CompRegion[]=retained.flatMap(r=>r.end<=start||r.start>=end?[r]:[{...r,end:Math.min(r.end,start)},{...r,id:crypto.randomUUID(),start:Math.max(r.start,end)}].filter(p=>p.end>p.start));
 regions.push({id:replaceRegionId??crypto.randomUUID(),takeId,start,end,crossfade});regions.sort((a,b)=>a.start-b.start);
 // Rebuild nominal intervals from the preserved pre-comp arrangement. Applying
 // a new choice cannot retain an old crossfade tail underneath the new choice.
 let segments=base.map(c=>({...c}));
 const regionFor=new Map<string,CompRegion>();
 for(const region of regions){
  const chosen=track.takes!.find(t=>t.id===region.takeId)!;
  const kept=segments.flatMap(c=>{const a=c.startTime,b=a+c.duration;if(b<=region.start||a>=region.end)return [c];const parts:AudioSegment[]=[];if(a<region.start)parts.push({...c,id:crypto.randomUUID(),duration:region.start-a,fadeOutDuration:0});if(b>region.end)parts.push({...c,id:crypto.randomUUID(),startTime:region.end,sourceOffset:c.sourceOffset+region.end-a,duration:b-region.end,fadeInDuration:0});return parts;});
  const clip:AudioSegment={id:crypto.randomUUID(),name:chosen.name,trackId,sourceId:chosen.sourceId,startTime:region.start,sourceOffset:chosen.sourceOffset+region.start-chosen.startTime,duration:region.end-region.start,fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear',gain:1,effects:[],color:'#fb7185'};
  regionFor.set(clip.id,region);segments=[...kept,clip];
 }
 segments.sort((a,b)=>a.startTime-b.startTime);
 for(let i=1;i<segments.length;i++){
  const left=segments[i-1],right=segments[i],boundary=right.startTime;
  if(Math.abs(left.startTime+left.duration-boundary)>1e-7)continue;
  const before=regionFor.get(left.id),after=regionFor.get(right.id);if(!before&&!after)continue;
  const width=(after?.crossfade??before!.crossfade)/2;
  if(after){const fade=Math.min(width,right.sourceOffset,right.duration/4,left.duration/4);if(fade>0){right.startTime-=fade;right.sourceOffset-=fade;right.duration+=fade;right.fadeInDuration=fade;left.fadeOutDuration=fade;}}
  else {const bound=sources.get(left.sourceId)?.duration??0,fade=Math.min(width,bound-left.sourceOffset-left.duration,left.duration/4,right.duration/4);if(fade>0){left.duration+=fade;left.fadeOutDuration=fade;right.fadeInDuration=fade;}}
 }
 const next={...project,tracks:project.tracks.map(t=>t.id===trackId?{...t,segments,compBaseSegments:base,compRegions:regions}:t)};
 return {...next,duration:timelineDuration(next)};
}
export function validRecording(project:TimelineProject,sourceIds?:Set<string>):boolean{
 return project.tracks.every(track=>{
  const input=track.recordingInput;
  if(track.recordArmed!==undefined&&typeof track.recordArmed!=='boolean')return false;
  if(input&&(typeof input.deviceId!=='string'||!['mono','right','stereo'].includes(input.channel)||typeof input.monitor!=='boolean'||!Number.isFinite(input.countIn)||input.countIn<0||input.countIn>10||!Number.isFinite(input.latencyMs)||input.latencyMs< -500||input.latencyMs>2000))return false;
  const takes=track.takes??[],ids=new Set(takes.map(t=>t.id));
  if(takes.length>10000||ids.size!==takes.length||takes.some(t=>!t.id||typeof t.name!=='string'||typeof t.sourceId!=='string'||(sourceIds&&!sourceIds.has(t.sourceId))||![t.startTime,t.sourceOffset,t.duration,t.pass,t.droppedFrames,t.latencyMs].every(Number.isFinite)||t.startTime<0||t.sourceOffset<0||t.duration<=0||t.pass<1||!Number.isInteger(t.pass)||t.droppedFrames<0||!Number.isInteger(t.droppedFrames)||typeof t.capturedAt!=='string'||!Array.isArray(t.notes)||t.notes.some(n=>typeof n!=='string')||(t.inactive!==undefined&&typeof t.inactive!=='boolean')||(t.originalPlacement!==undefined&&(![t.originalPlacement.startTime,t.originalPlacement.sourceOffset,t.originalPlacement.duration].every(Number.isFinite)||t.originalPlacement.startTime<0||t.originalPlacement.sourceOffset<0||t.originalPlacement.duration<=0))))return false;
  if(track.compBaseSegments?.some(c=>!c||typeof c.sourceId!=='string'||(sourceIds&&!sourceIds.has(c.sourceId))||![c.startTime,c.sourceOffset,c.duration].every(Number.isFinite)||c.startTime<0||c.sourceOffset<0||c.duration<=0))return false;
  return new Set((track.compRegions??[]).map(r=>r.id)).size===(track.compRegions??[]).length&&(track.compRegions??[]).every(r=>r.id&&ids.has(r.takeId)&&[r.start,r.end,r.crossfade].every(Number.isFinite)&&r.start>=0&&r.end>r.start&&r.crossfade>=0&&r.crossfade<=1);
 });
}
