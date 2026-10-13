import type {TimelineProject,TimelineSelection} from '../types/audio';
import {visibleTrackRows} from './trackFolders';
import {linkedIds,projectSelection,projectClips,moveClips} from './projectEdits';
import {pictureLocked} from './pictureComposition';
import {frameTime} from './videoEditing';
/** Keyboard focus traverses visible audio clips; hidden folder contents stay hidden. */
export function navigateClip(project:TimelineProject,selection:TimelineSelection|null,time:number,direction:-1|1,vertical=false){
 const tracks=visibleTrackRows(project).filter(t=>project.tracks.includes(t)),clips=tracks.flatMap(t=>[...t.segments].sort((a,b)=>a.startTime-b.startTime)),anchor=clips.find(c=>selection?.segmentIds.includes(c.id));
 let chosen;
 if(vertical){const index=anchor?tracks.findIndex(t=>t.id===anchor.trackId):direction>0?-1:tracks.length;for(let i=index+direction;i>=0&&i<tracks.length;i+=direction){const clock=anchor?.startTime??time;chosen=[...tracks[i].segments].sort((a,b)=>Math.min(Math.abs(a.startTime-clock),Math.abs(a.startTime+a.duration-clock))-Math.min(Math.abs(b.startTime-clock),Math.abs(b.startTime+b.duration-clock)))[0];if(chosen)break;}}
 else {const ordered=[...clips].sort((a,b)=>a.startTime-b.startTime||tracks.findIndex(t=>t.id===a.trackId)-tracks.findIndex(t=>t.id===b.trackId));const index=anchor?ordered.findIndex(c=>c.id===anchor.id):-1;chosen=anchor?ordered[index+direction]:direction>0?ordered.find(c=>c.startTime>=time):ordered.filter(c=>c.startTime<=time).at(-1);}
 return chosen?{selection:projectSelection(project,linkedIds(project,[chosen.id])),time:chosen.startTime}:undefined;
}
/** Place the earliest selected/linked clip exactly; all relative offsets survive. */
export function placeClips(project:TimelineProject,ids:string[],time:number){
 const selected=new Set(linkedIds(project,ids)),clips=projectClips(project).filter(c=>selected.has(c.id));
 if(!clips.length||!Number.isFinite(time)||time<0)throw new Error('placement.invalid');
 if(project.tracks.some(t=>t.locked&&t.segments.some(c=>selected.has(c.id)))||clips.some(c=>!('trackId' in c)&&pictureLocked(project.video,c)))throw new Error('trimEdits.locked');
 if(clips.some(c=>!('trackId' in c)))time=frameTime(time,project.frameRate??25);
 const delta=time-Math.min(...clips.map(c=>c.startTime));if(Math.abs(delta)<1e-12)return project;
 return moveClips(project,[...selected],delta,true);
}
