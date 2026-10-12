import {validDucking} from '../audio/dsp/ducking';
import type {TimelineTrack} from '../types/audio';

/** Source-first order. Reject missing buses, duplicates and all feedback paths. */
export function routingOrder(tracks: TimelineTrack[]): TimelineTrack[] {
  const byId=new Map(tracks.map(t=>[t.id,t]));
  if(byId.size!==tracks.length||byId.has('master'))throw new Error('routing.invalid');
  const edges=new Map<string,string[]>();
  for(const track of tracks){
    if(track.kind==='bus'&&track.segments.length)throw new Error('routing.busClips');
    const targets=[track.output??'master',...(track.sends??[]).map(s=>s.target)];
    const ids=new Set<string>();
    for(const send of track.sends??[]){
      if(!send.id||ids.has(send.id)||!Number.isFinite(send.gain)||send.gain<0||send.gain>4||typeof send.preFader!=='boolean')throw new Error('routing.invalid');
      ids.add(send.id);
    }
    for(const target of targets)if(target!=='master'&&byId.get(target)?.kind!=='bus')throw new Error('routing.missing');
    edges.set(track.id,targets.filter(t=>t!=='master'));
  }
  for(const track of tracks)if(track.ducking){
    if(!validDucking(track.ducking)||!byId.has(track.ducking.source))throw new Error('routing.invalid');
    edges.get(track.ducking.source)!.push(track.id);
  }
  const result:TimelineTrack[]=[],visiting=new Set<string>(),done=new Set<string>();
  const visit=(id:string)=>{
    if(visiting.has(id))throw new Error('routing.cycle');
    if(done.has(id))return;
    visiting.add(id);for(const target of edges.get(id)??[])visit(target);
    visiting.delete(id);done.add(id);result.push(byId.get(id)!);
  };
  // Reverse both traversals to preserve existing track summation order.
  for(const track of [...tracks].reverse())visit(track.id);
  return result.reverse();
}

export function removeRoutingTrack(tracks:TimelineTrack[],id:string):TimelineTrack[]{
  return tracks.filter(t=>t.id!==id).map(t=>({...t,output:t.output===id?'master':t.output,sends:t.sends?.filter(s=>s.target!==id),ducking:t.ducking?.source===id?undefined:t.ducking}));
}
