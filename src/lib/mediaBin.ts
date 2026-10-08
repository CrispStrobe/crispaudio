import { invoke } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';
import type { MediaInfo, SyncSession } from './media';
import { useProjectStore } from '../stores/projectStore';
import { computeWaveformPeaks } from '../audio/utils/audioBufferUtils';
import { videoClips } from './videoEditing';
import { timelineDuration } from './timelineView';
/** Prepare all data first; a failed import leaves the arrangement untouched. */
export async function importVideo(path:string,withAudio:boolean,signal?:AbortSignal){
  const info=await invoke<MediaInfo>('probe_media',{path});
  if(!info.has_video)throw new Error('No video stream');
  let audio: {path:string;buffer:AudioBuffer}|undefined;
  if(withAudio&&info.channels>0){
    if(info.duration*48000*2*4>512*1024*1024)throw new Error('Camera audio exceeds the 512 MiB decoding budget. Import picture without camera audio, or prepare shorter audio sections with the CLI.');
    const extracted=await invoke<string>('prepare_media_asset',{path,proxy:false});signal?.throwIfAborted();
    const bytes=await readFile(extracted),ctx=new OfflineAudioContext(2,1,48000);
    audio={path:extracted,buffer:await ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer)};
  }
  signal?.throwIfAborted();
  const state=useProjectStore.getState(),id=crypto.randomUUID(),group=audio?crypto.randomUUID():undefined,name=path.split(/[\\/]/).pop()||'Video';
  const start=state.project.video?timelineDuration(state.project):(state.project.tracks.some(t=>t.segments.length)?Math.max(0,state.playheadPosition):0);
  const clip={id:crypto.randomUUID(),startTime:start,duration:info.duration,sourceOffset:0,fadeIn:0,fadeOut:0,transition:'cut' as const,transitionDuration:0,linkGroup:group,...(state.project.video?{sourceId:id}:{})};
  const video=state.project.video?{...state.project.video,sources:[...(state.project.video.sources??[]),{id,path,name,duration:info.duration}],clips:[...videoClips(state.project.video),clip],inPoint:undefined,outPoint:undefined}:{path,duration:info.duration,clips:[clip],session:{format:'crispaudio-sync',version:1,video:info,tracks:[]} as SyncSession};
  const sources=new Map(state.sources),tracks=[...state.project.tracks];
  if(audio){const sourceId=crypto.randomUUID(),trackId=crypto.randomUUID(),buffer=audio.buffer;
    sources.set(sourceId,{id:sourceId,name,buffer,duration:buffer.duration,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,filePath:audio.path,peaks:computeWaveformPeaks(buffer.getChannelData(0),Math.min(8000,Math.ceil(buffer.duration*200)))});
    tracks.push({id:trackId,name,muted:tracks.some(t=>t.segments.length),solo:false,pan:0,volume:1,segments:[{id:crypto.randomUUID(),trackId,sourceId,startTime:start,duration:Math.min(info.duration,buffer.duration),sourceOffset:0,linkGroup:group,fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear',effects:[],gain:1,color:'#a78bfa',name}]});
  }
  const project={...state.project,video,tracks};useProjectStore.setState({project:{...project,duration:timelineDuration(project)},sources,isPlaying:false});
}
