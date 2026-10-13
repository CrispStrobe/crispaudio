import type {TimelineTrack,RecordingTake} from '../types/audio';
/** Arrangement placements follow range edits; every pass retains its original capture extent. */
export function recordingRange(track:TimelineTrack,start:number,end:number,operation:'lift'|'extract'|'insert'):Pick<TimelineTrack,'takes'|'compRegions'|'compVersions'|'compBaseSegments'>{
 const length=end-start;
 const pieces=(a:number,b:number)=>{
  if(b<=start)return [{start:a,end:b,offset:0}];
  if(operation==='insert'&&a>=start)return [{start:a+length,end:b+length,offset:0}];
  if(operation!=='insert'&&a>=end)return [{start:operation==='extract'?a-length:a,end:operation==='extract'?b-length:b,offset:0}];
  const result:{start:number;end:number;offset:number}[]=[];if(a<start)result.push({start:a,end:start,offset:0});const cut=operation==='insert'?start:end;if(operation==='insert'||b>end)result.push({start:operation==='extract'?start:end,end:(operation==='extract'?b-length:b+(operation==='insert'?length:0)),offset:cut-a});return result;
 };
 const placements=new Map<string,RecordingTake[]>();
 const takes=track.takes?.flatMap(t=>{if(t.inactive){placements.set(t.id,[t]);return [t];}const originalPlacement=t.originalPlacement??{startTime:t.startTime,sourceOffset:t.sourceOffset,duration:t.duration};const parts=pieces(t.startTime,t.startTime+t.duration).filter(p=>p.end>p.start).map((p,i)=>({...t,id:i?crypto.randomUUID():t.id,startTime:p.start,sourceOffset:t.sourceOffset+p.offset,duration:p.end-p.start,originalPlacement}));if(!parts.length)parts.push({...t,inactive:true,originalPlacement});if(parts.length===1&&parts[0].startTime===t.startTime&&parts[0].sourceOffset===t.sourceOffset&&parts[0].duration===t.duration&&parts[0].inactive===t.inactive){placements.set(t.id,[t]);return [t];}placements.set(t.id,parts);return parts;});
 const mapRegions=(regions:NonNullable<TimelineTrack['compRegions']>)=>regions.flatMap(r=>pieces(r.start,r.end).flatMap((p,i)=>{const take=placements.get(r.takeId)?.find(t=>!t.inactive&&t.startTime<=p.start+1e-6&&t.startTime+t.duration>=p.end-1e-6);return take?[{...r,id:i?crypto.randomUUID():r.id,takeId:take.id,start:p.start,end:p.end}]:[];}));
 const compRegions=track.compRegions&&mapRegions(track.compRegions);
 const compVersions=track.compVersions?.map(v=>({...v,regions:mapRegions(v.regions)}));
 const compBaseSegments=track.compBaseSegments?.flatMap(c=>pieces(c.startTime,c.startTime+c.duration).map((p,i)=>({...c,id:i?crypto.randomUUID():c.id,startTime:p.start,duration:p.end-p.start,sourceOffset:c.sourceOffset+p.offset,fadeInDuration:Math.min(c.fadeInDuration,p.end-p.start),fadeOutDuration:Math.min(c.fadeOutDuration,p.end-p.start)})));
 return {takes,compRegions,compVersions,compBaseSegments};
}
