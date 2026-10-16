import type {RecordingInput,TimelineProject,NativeEffect} from '../types/audio';
import {defaultRecordingInput} from './recordingGroup';
export interface RecordingPreviewOwner {projectId:string;trackId:string;deviceId:string;channel:RecordingInput['channel'];fx:NativeEffect[]|undefined;monitorFx:boolean}
export function previewOwner(project:TimelineProject,trackId:string,input:RecordingInput):RecordingPreviewOwner{return {projectId:project.id,trackId,deviceId:input.deviceId,channel:input.channel,monitorFx:input.monitorFx??false,fx:input.monitorFx?project.tracks.find(t=>t.id===trackId)?.nativeEffects:undefined};}
export function previewMatches(owner:RecordingPreviewOwner|null,project:TimelineProject,preferred:string){
 const track=project.tracks.find(t=>t.id===preferred)??project.tracks.find(t=>t.kind!=='bus'&&t.recordArmed)??project.tracks.find(t=>t.kind!=='bus'),input=track?.recordingInput??defaultRecordingInput;
 return !!owner&&owner.projectId===project.id&&owner.trackId===track?.id&&!track?.locked&&track?.kind!=='bus'&&owner.deviceId===input.deviceId&&owner.channel===input.channel&&owner.monitorFx===(input.monitorFx??false)&&(!input.monitorFx||owner.fx===track?.nativeEffects);
}
