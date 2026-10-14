import type {AudioSegment,AudioSource,TimelineProject,TimelineTrack} from '../types/audio';
import type {SyncSession} from './media';
import {computeWaveformPeaks} from '../audio/utils/audioBufferUtils';
import {TITLE_PRESETS,titlePose} from './graphics';
import {chooseTake} from './recordingTakes';
export type SampleSession='mix'|'picture'|'takes'|'native';
export const sampleVideoUrl=new URL('../assets/samples/picture.mp4',import.meta.url).href;
/** Original deterministic synthesis: no external recordings, models or rights needed. */
export function sampleAudio(ctx:Pick<BaseAudioContext,'createBuffer'>,kind:'rhythm'|'keys'|'pad'|'alternate'){
 const buffer=ctx.createBuffer(1,12*48000,48000),data=buffer.getChannelData(0);let seed=31;
 for(let i=0;i<data.length;i++){
  const t=i/48000,beat=t%.5,quarter=t%.25;
  if(kind==='rhythm'){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;data[i]=.16*Math.sin(2*Math.PI*(55*beat+2*(1-Math.exp(-beat*30))))*Math.exp(-beat*20)+noise*(.012*Math.exp(-quarter*70)+(Math.floor(t*2)%2?.035*Math.exp(-beat*25):0));}
  else if(kind==='pad'){const phase=t%6,notes=t<6?[48,55,60]:[45,52,57],fade=Math.min(1,phase/.3,(6-phase)/.3);data[i]=fade*notes.reduce((sum,n)=>sum+.025*Math.sin(2*Math.PI*440*2**((n-69)/12)*t),0);}
  else {const n=[60,64,67,72,67,64,62,67][Math.floor(t*2)%8]+(kind==='alternate'?4:0),f=440*2**((n-69)/12);data[i]=.15*(1-Math.exp(-beat*100))*Math.exp(-beat*5)*(.75*Math.sin(2*Math.PI*f*beat)+.2*Math.sin(4*Math.PI*f*beat));}
  data[i]*=Math.min(1,t/.02,(12-t)/.1);
 }
 return buffer;
}
export function buildSampleSession(kind:SampleSession,ctx:Pick<BaseAudioContext,'createBuffer'>,t:(key:string)=>string,videoPath=sampleVideoUrl){
 const sources=new Map<string,AudioSource>(),tracks:TimelineTrack[]=[];
 for(const [i,key] of (['rhythm','keys','pad'] as const).entries()){
  const id=crypto.randomUUID(),trackId=crypto.randomUUID(),buffer=sampleAudio(ctx,key),name=t(`samples.${key}`);
  sources.set(id,{id,name,buffer,duration:12,sampleRate:48000,channels:1,peaks:computeWaveformPeaks(buffer.getChannelData(0),1200)});
  const clip:AudioSegment={id:crypto.randomUUID(),trackId,sourceId:id,name,startTime:0,sourceOffset:0,duration:12,gain:1,color:['#f59e0b','#818cf8','#2dd4bf'][i],fadeInDuration:.02,fadeOutDuration:.25,fadeInCurve:'linear',fadeOutCurve:'linear',effects:[]};
  tracks.push({id:trackId,name,volume:[.8,.85,.65][i],pan:[0,-.12,.12][i],muted:false,solo:false,segments:[clip],...(key==='keys'?{effects:[{type:'delay' as const,enabled:true,params:{time:.25,feedback:.2,mix:.2},automation:{mix:[{time:0,value:.12},{time:6,value:.3},{time:11,value:.15}]}}]}:key==='pad'?{effects:[{type:'reverb' as const,enabled:true,params:{size:.4,decay:1.3,mix:.18}}],automation:[{time:0,value:.6},{time:4,value:1},{time:10,value:.7},{time:12,value:0}]}:{})});
 }
 let project:TimelineProject={id:crypto.randomUUID(),name:t(`samples.${kind}`),sampleRate:48000,duration:14,minimumDuration:14,tracks,masterEffects:[{type:'compressor',enabled:true,params:{threshold:-16,ratio:1.5,attack:.01,release:.15,knee:6}}],markers:[{id:crypto.randomUUID(),name:t('samples.variation'),time:6}],editRange:{start:4,end:8}};
 if(kind==='native')project.nativeEffects=[{instanceId:crypto.randomUUID(),pluginId:'1635083896:1651532147:1634758764',name:'AUBandpass',format:'AU',enabled:false,bypass:false,parameters:{'0':440},state:''}];
 if(kind==='takes'){
  const track=tracks[1],sourceId=crypto.randomUUID(),buffer=sampleAudio(ctx,'alternate');sources.set(sourceId,{id:sourceId,name:t('samples.alternate'),buffer,duration:12,sampleRate:48000,channels:1,peaks:computeWaveformPeaks(buffer.getChannelData(0),1200)});
  track.takes=[track.segments[0].sourceId,sourceId].map((id,i)=>({id:crypto.randomUUID(),name:t(i?'samples.takeB':'samples.takeA'),sourceId:id,startTime:0,sourceOffset:0,duration:12,pass:i+1,droppedFrames:0,notes:[],latencyMs:0,capturedAt:'2026-10-13T00:00:00.000Z'}));
  project=chooseTake(project,track.id,track.takes[1].id,4,6,.06,sources);project={...project,tracks:[project.tracks.find(t=>t.id===track.id)!,...project.tracks.filter(t=>t.id!==track.id)]};
 }
 if(kind==='picture'){
  project.frameRate=25;
  project.video={path:videoPath,duration:12,width:640,height:360,session:{format:'crispaudio-sync',version:1,video:{path:videoPath,duration:12,has_video:true,channels:0,sample_rate:0},tracks:[]} as SyncSession,
   clips:[{id:crypto.randomUUID(),startTime:0,sourceOffset:0,duration:6,fadeIn:.4,fadeOut:0,transition:'cut',transitionDuration:0},{id:crypto.randomUUID(),startTime:6,sourceOffset:6,duration:6,fadeIn:0,fadeOut:.6,transition:'cut',transitionDuration:0}],
   graphics:[{id:crypto.randomUUID(),name:t('samples.titles'),visible:true,locked:false,rippleEnabled:true,clips:[{id:crypto.randomUUID(),type:'title',name:t('samples.picture'),text:'CrispAudio',startTime:.4,duration:3,style:{...TITLE_PRESETS.title},composition:titlePose('title')}]}]};
 }
 return {project,sources};
}
