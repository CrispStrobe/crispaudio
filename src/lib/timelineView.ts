import { videoTimelineDuration } from './videoEditing';
import type { TimelineProject, TimelineTrack } from '../types/audio';
export function timelineDuration(project: TimelineProject): number {
  return Math.max(project.minimumDuration ?? 0, videoTimelineDuration(project.video), ...project.tracks.flatMap(t => t.segments.map(c => c.startTime + c.duration)), 0);
}
/** Solo is a temporary audition override. Stored mute buttons are preserved. */
export function audibleTracks(tracks: TimelineTrack[]): TimelineTrack[] {
  const solo=tracks.filter(t=>t.solo),selected=new Set(solo.map(t=>t.id));
  if(!solo.length)return tracks.filter(t=>!t.muted);
  // Bus solo includes all source ancestors, without admitting siblings of a solo source.
  const ancestors=new Set(solo.filter(t=>t.kind==='bus').map(t=>t.id));
  let changed=true;while(changed){changed=false;for(const track of tracks){
    const destinations=[track.output??'master',...(track.sends??[]).map(s=>s.target)];
    if(destinations.some(id=>ancestors.has(id))&&!selected.has(track.id)){selected.add(track.id);if(track.kind==='bus')ancestors.add(track.id);changed=true;}
  }}
  changed=true;while(changed){changed=false;for(const track of tracks)if(selected.has(track.id)){
    for(const id of [track.output??'master',...(track.sends??[]).map(s=>s.target)])if(id!=='master'&&!selected.has(id)){selected.add(id);changed=true;}
  }}
  return tracks.filter(t=>selected.has(t.id)&&(t.kind!=='bus'||!t.muted||t.solo));
}
