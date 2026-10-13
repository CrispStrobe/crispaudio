import type {TimelineProject,TimelineTrack,TrackFolder} from '../types/audio';
import {projectSelection} from './projectEdits';
import {linkedIds} from './projectEdits';
const rows=new WeakMap<TimelineProject,TimelineTrack[]>();
/** View-only folder rows share canvas/header/hit-test geometry; no routing nodes. */
export function visibleTrackRows(project:TimelineProject):TimelineTrack[]{
 const cached=rows.get(project);if(cached)return cached;
 const result:TimelineTrack[]=[],seen=new Set<string>();
 for(const track of project.tracks){
  const folder=project.trackFolders?.find(f=>f.trackIds.includes(track.id));
  if(!folder){result.push(track);continue;}if(seen.has(folder.id))continue;seen.add(folder.id);
  result.push({id:folder.id,name:folder.name,segments:[],kind:'bus',muted:false,solo:false,volume:1,pan:0});
  if(!folder.collapsed)result.push(...project.tracks.filter(t=>folder.trackIds.includes(t.id)));
 }
 rows.set(project,result);return result;
}
export function validTrackFolders(project:TimelineProject){
 if(project.trackFolders===undefined)return true;
 const folders=project.trackFolders,tracks=new Set(project.tracks.map(t=>t.id)),ids=new Set<string>(),members=new Set<string>();
 return Array.isArray(folders)&&folders.length<=128&&folders.every(f=>{
  if(!f||typeof f.id!=='string'||!f.id||tracks.has(f.id)||ids.has(f.id)||typeof f.name!=='string'||!f.name.trim()||f.name.length>80||typeof f.collapsed!=='boolean'||!Array.isArray(f.trackIds)||f.trackIds.length===0)return false;
  ids.add(f.id);return f.trackIds.every(id=>{if(!tracks.has(id)||members.has(id))return false;members.add(id);return true;});
 });
}
export function saveTrackFolder(project:TimelineProject,name:string,trackIds:string[],id:string=crypto.randomUUID()){
 name=name.trim();if(!name||name.length>80||!trackIds.length||new Set(trackIds).size!==trackIds.length||trackIds.some(id=>!project.tracks.some(t=>t.id===id)))throw new Error('folders.invalid');
 const existing=project.trackFolders?.find(f=>f.id===id),folder:TrackFolder={id,name,trackIds:[...trackIds],collapsed:existing?.collapsed??false};
 const folders=(project.trackFolders??[]).filter(f=>f.id!==id).map(f=>({...f,trackIds:f.trackIds.filter(id=>!trackIds.includes(id))})).filter(f=>f.trackIds.length);
 const next={...project,trackFolders:[...folders,folder]};if(!validTrackFolders(next))throw new Error('folders.invalid');return next;
}
export function folderControl(project:TimelineProject,id:string,key:'muted'|'solo'){
 const folder=project.trackFolders?.find(f=>f.id===id);if(!folder)return project;
 const members=project.tracks.filter(t=>folder.trackIds.includes(t.id));if(members.some(t=>t.locked))throw new Error('recording.locked');
 const value=!members.every(t=>t[key]);return {...project,tracks:project.tracks.map(t=>folder.trackIds.includes(t.id)?{...t,[key]:value}:t)};
}
export function folderSelection(project:TimelineProject,id:string){
 const ids=project.tracks.filter(t=>project.trackFolders?.find(f=>f.id===id)?.trackIds.includes(t.id)).flatMap(t=>t.segments.map(c=>c.id));
 return projectSelection(project,linkedIds(project,ids));
}
