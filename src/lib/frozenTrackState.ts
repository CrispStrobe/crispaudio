import type {TimelineProject,TimelineTrack} from '../types/audio';

export function thawTrack(track:TimelineTrack):TimelineTrack {
 if(!track.freeze)throw new Error('freeze.changed');
 return {...track,...structuredClone(track.freeze.original),freeze:undefined,locked:false};
}
export function retainedFreezeProject(project:TimelineProject):TimelineProject {return {...project,tracks:project.tracks.map(t=>t.freeze?thawTrack(t):t)};}
/** Frozen content is immutable; only these monitor/mix-independent fields remain live. */
export function frozenTrackChangeAllowed(before:TimelineTrack,after:TimelineTrack|undefined):boolean {
 if(!after)return false;
 if(!after.freeze)return JSON.stringify(after)===JSON.stringify(thawTrack(before));
 const live=['name','muted','solo','volume','pan','waveformMode'] as const;
 const expected={...before};for(const key of live)Object.assign(expected,{[key]:after[key]});
 return JSON.stringify(expected)===JSON.stringify(after);
}
