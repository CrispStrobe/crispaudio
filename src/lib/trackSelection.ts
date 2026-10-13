import type {TimelineProject,TimelineSelection} from '../types/audio';
import {visibleTrackRows} from './trackFolders';
import {pictureTracks,pictureTrackId} from './pictureComposition';
import {videoClips} from './videoEditing';
import {useProjectStore} from '../stores/projectStore';
import {linkedIds,projectSelection} from './projectEdits';
/** Header Shift-click selects a contiguous range; plain click replaces it. */
export function selectTimelineTrack(trackId:string,extend=false){
 const state=useProjectStore.getState(),tracks=visibleTrackRows(state.project).filter(row=>state.project.tracks.some(t=>t.id===row.id)),index=tracks.findIndex(t=>t.id===trackId);
 if(index<0)return;
 const previous=state.selection,anchor=extend?(previous?.trackAnchorId??tracks.find(t=>t.segments.some(c=>previous?.segmentIds.includes(c.id)))?.id??trackId):trackId;
 const anchorIndex=tracks.findIndex(t=>t.id===anchor);
 const selected=extend&&anchorIndex>=0?tracks.slice(Math.min(index,anchorIndex),Math.max(index,anchorIndex)+1):[tracks[index]];
 const ids=linkedIds(state.project,selected.flatMap(t=>t.segments.map(c=>c.id)));
 state.setSelection({...projectSelection(state.project,ids)??{startTime:0,endTime:0,segmentIds:[]},trackIds:selected.map(t=>t.id),trackAnchorId:anchorIndex>=0?anchor:trackId});
}

export function selectPictureTimelineTrack(trackId:string,extend=false){
 const state=useProjectStore.getState(),tracks=pictureTracks(state.project.video),index=tracks.findIndex(t=>t.id===trackId);
 if(index<0)return;
 const previous=state.selection,clips=videoClips(state.project.video);
 const anchor=extend?(previous?.trackAnchorId??tracks.find(t=>clips.some(c=>pictureTrackId(c)===t.id&&previous?.segmentIds.includes(c.id)))?.id??trackId):trackId,anchorIndex=tracks.findIndex(t=>t.id===anchor);
 const selected=extend&&anchorIndex>=0?tracks.slice(Math.min(index,anchorIndex),Math.max(index,anchorIndex)+1):[tracks[index]],trackIds=selected.map(t=>t.id);
 const ids=linkedIds(state.project,videoClips(state.project.video).filter(c=>trackIds.includes(pictureTrackId(c))).map(c=>c.id));
 state.setSelection({...projectSelection(state.project,ids)??{startTime:0,endTime:0,segmentIds:[]},trackIds,trackAnchorId:anchorIndex>=0?anchor:trackId});
}

/** Includes explicit empty-track selection and tracks of linked selected clips. */
export function selectionTrackIds(project:TimelineProject,selection:TimelineSelection|null):string[]{
 if(!selection)return [];
 const ids=new Set(selection.trackIds??[]),selected=new Set(selection.segmentIds),pictures=pictureTracks(project.video),clips=videoClips(project.video);
 for(const track of project.tracks)if(track.segments.some(c=>selected.has(c.id)))ids.add(track.id);
 for(const track of pictures)if(clips.some(c=>pictureTrackId(c)===track.id&&selected.has(c.id)))ids.add(track.id);
 const available=new Set([...project.tracks,...pictures].map(t=>t.id));
 return [...ids].filter(id=>available.has(id));
}
