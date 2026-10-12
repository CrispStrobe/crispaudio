import type {AudioSource,TimelineProject} from '../types/audio';
import {videoClips} from './videoEditing';
import {pictureTracks} from './pictureComposition';
/** OTIO's legacy Clip.1 schema is deliberately used for a cut-only exchange. */
export function cutInterchange(project:TimelineProject,sources:Map<string,AudioSource>){
 const rate=project.frameRate??25;if(!Number.isFinite(rate)||rate<1||rate>120)throw new Error('Invalid interchange frame rate');
 const warnings=new Set<string>(['FX, gain/pan, automation, routing, fades, transitions, composition, titles, captions, take comps, markers and source transcripts are not exchanged. Derived retimed media is referenced as an ordinary clip.']);
 const time=(seconds:number)=>({'OTIO_SCHEMA':'RationalTime.1',rate,value:seconds*rate});
 const range=(offset:number,duration:number)=>({'OTIO_SCHEMA':'TimeRange.1',start_time:time(offset),duration:time(duration)});
 const common={metadata:{},effects:[],markers:[],enabled:true};
 const tracks:unknown[]=[];
 type Cut={id:string;name?:string;startTime:number;duration:number;sourceOffset:number;path?:string;};
 const url=(path:string)=>{const normalized=path.replace(/\\/g,'/');if(!normalized.startsWith('/')&&!/^[A-Za-z]:\//.test(normalized))return normalized.split('/').map(encodeURIComponent).join('/');const u=new URL('file:///');u.pathname=normalized.startsWith('/')?normalized:`/${normalized}`;return u.href;};
 const lane=(name:string,kind:'Audio'|'Video',cuts:Cut[],enabled:boolean)=>{
  // Split overlapping intervals into extra tracks, rather than shifting timing.
  const lanes:Cut[][]=[];
  for(const clip of [...cuts].sort((a,b)=>a.startTime-b.startTime)){
   if(![clip.startTime,clip.duration,clip.sourceOffset].every(Number.isFinite)||clip.startTime<0||clip.duration<=0||clip.sourceOffset<0)throw new Error('Invalid interchange cut');
   let lane=lanes.find(items=>{const end=items.at(-1)!;return end.startTime+end.duration<=clip.startTime+1e-9;});if(!lane){lane=[];lanes.push(lane);}lane.push(clip);
  }
  if(lanes.length>1)warnings.add(`${name}: overlapping clips are placed on separate exchange tracks; compositing/crossfades are omitted.`);
  for(const [index,cuts] of lanes.entries()){
   let cursor=0;const children:unknown[]=[];
   for(const clip of cuts){if(clip.startTime>cursor+1e-9)children.push({...common,'OTIO_SCHEMA':'Gap.1',name:'Gap',source_range:range(0,clip.startTime-cursor)});
    if(!clip.path)warnings.add(`${clip.name??clip.id}: no linked file; exported as a missing media reference.`);
    children.push({...common,'OTIO_SCHEMA':'Clip.1',name:clip.name??clip.id,source_range:range(clip.sourceOffset,clip.duration),media_reference:clip.path?{'OTIO_SCHEMA':'ExternalReference.1',metadata:{},name:'',available_range:null,target_url:url(clip.path)}:{'OTIO_SCHEMA':'MissingReference.1',metadata:{},name:'',available_range:null}});cursor=clip.startTime+clip.duration;
   }
   tracks.push({...common,enabled,'OTIO_SCHEMA':'Track.1',kind,name:lanes.length>1?`${name} ${index+1}`:name,source_range:null,children});
  }
 };
 for(const track of project.tracks)if(track.kind!=='bus')lane(track.name,'Audio',track.segments.map(c=>({...c,path:sources.get(c.sourceId)?.filePath})),!track.muted);
 if(project.tracks.some(t=>t.solo))warnings.add('Solo audition state is omitted; stored mute/visibility is retained.');
 if(project.video){const video=project.video;for(const track of pictureTracks(video))lane(track.name,'Video',videoClips(video).filter(c=>(c.videoTrackId??pictureTracks(video)[0]?.id)===track.id).map(c=>({...c,path:video.sources?.find(s=>s.id===c.sourceId)?.path??video.path})),track.visible);}
 const notices=[...warnings];return {document:{'OTIO_SCHEMA':'Timeline.1',name:project.name,metadata:{crispaudio:{cut_only:true,warnings:notices}},global_start_time:time(0),tracks:{...common,'OTIO_SCHEMA':'Stack.1',name:'Tracks',source_range:null,children:tracks}},warnings:notices};
}
