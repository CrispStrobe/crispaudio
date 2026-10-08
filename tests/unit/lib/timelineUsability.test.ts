import { describe,expect,it,vi } from 'vitest';
import { parseTimelineTime,formatTimelineTime } from '../../../src/lib/timelineTime';
import { automaticVideoBlends,moveClips,blendAudioOverlaps } from '../../../src/lib/projectEdits';
import { timelineDuration } from '../../../src/lib/timelineView';
import { useProjectStore } from '../../../src/stores/projectStore';
import { prepareAudioImport } from '../../../src/lib/audioImport';
import type { TimelineProject,VideoClip,AudioSegment } from '../../../src/types/audio';
const video=(id:string,startTime:number):VideoClip=>({id,startTime,duration:4,sourceOffset:0,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0});
const audio=(id:string,startTime:number):AudioSegment=>({id,startTime,duration:4,trackId:'t',sourceId:'s',sourceOffset:0,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear',color:'blue',name:id});
const project=():TimelineProject=>({id:'p',name:'p',sampleRate:48000,duration:8,tracks:[{id:'t',name:'t',volume:1,pan:0,solo:false,muted:false,segments:[audio('a',0),audio('b',3)]}],masterEffects:[],video:{path:'/v.mp4',duration:8,session:{} as never,clips:[video('v',0),video('w',4)]}});
describe('editable time and canvas',()=>{
 it.each([['01:02.345',62.345],['1:02:03,5',3723.5],['2.5',2.5]])('parses %s',(input,result)=>expect(parseTimelineTime(input)).toBe(result));
 it.each(['-1','1:99','', '1e309','00::2'])('rejects %s',input=>expect(parseTimelineTime(input)).toBeNull());
 it('formats without rolling 59.9999 seconds into a malformed timestamp',()=>expect(formatTimelineTime(59.9999)).toBe('01:00.000'));
 it('retains an explicitly extended canvas through edits and reload',()=>{const p={...project(),minimumDuration:20,duration:20};const moved=moveClips(p,['a'],1);expect(timelineDuration(moved)).toBe(20);useProjectStore.getState().loadProjectState(moved,new Map());useProjectStore.getState().removeTrack('t');expect(useProjectStore.getState().project.duration).toBe(20);});
});
describe('reviewable overlap blending',()=>{
 it('creates and updates a dissolve when picture enters a partial overlap',()=>{const p=moveClips(project(),['w'],-1,true);expect(p.video?.clips?.[1]).toMatchObject({startTime:3,transition:'fade',transitionDuration:1});expect(p.video?.clips?.[0].duration).toBe(4);expect(project().video?.clips?.[1].startTime).toBe(4);});
 it('clears a transition when clips separate again',()=>{const p=moveClips(project(),['w'],-1,true),next=moveClips(p,['w'],2,true);expect(next.video?.clips?.[1]).toMatchObject({transition:'cut',transitionDuration:0});});
 it('still rejects complete containment or a triple picture overlap',()=>{expect(()=>moveClips(project(),['w'],-4,true)).toThrow();const p=project();p.video!.clips![1].startTime=2.5;p.video!.clips!.push(video('third',8));expect(()=>moveClips(p,['third'],-5,true)).toThrow();});
 it('retains the chosen wipe while matching its duration to overlap',()=>{const c={...video('w',3),transition:'wipeleft' as const};expect(automaticVideoBlends([video('v',0),c])[1]).toMatchObject({transition:'wipeleft',transitionDuration:1});});
 it('adds complementary S-curve clip fades without moving source timing',()=>{const p=project(),next=blendAudioOverlaps(p,['a','b']);expect(next.tracks[0].segments[0]).toMatchObject({startTime:0,sourceOffset:0,fadeOutDuration:1,fadeOutCurve:'scurve'});expect(next.tracks[0].segments[1]).toMatchObject({startTime:3,fadeInDuration:1,fadeInCurve:'scurve'});});
});
describe('audio import preparation',()=>{
 const buffer={duration:.4,sampleRate:10,numberOfChannels:1,getChannelData:()=>new Float32Array([-.5,.2,1,-1])} as AudioBuffer;
 it('reads/decode once, retains file links, and reports phases',async()=>{const read=vi.fn().mockResolvedValue(new ArrayBuffer(8)),decode=vi.fn().mockResolvedValue(buffer),phases:string[]=[];const source=await prepareAudioImport({decodeAudioData:decode} as unknown as BaseAudioContext,{name:'mic.wav',filePath:'/mic.wav',read},new AbortController().signal,phase=>phases.push(phase));expect(read).toHaveBeenCalledOnce();expect(decode).toHaveBeenCalledOnce();expect(source.filePath).toBe('/mic.wav');expect(source.peaks.min[0]).toBe(-.5);expect(source.peaks.max.at(-1)).toBe(-1);expect(Math.max(...source.peaks.max)).toBe(1);expect(phases).toEqual(['reading','decoding','waveform']);});
 it('discards a decode completed after cancellation',async()=>{const abort=new AbortController(),decode=vi.fn().mockImplementation(async()=>{abort.abort();return buffer;});await expect(prepareAudioImport({decodeAudioData:decode} as unknown as BaseAudioContext,{name:'mic.wav',read:async()=>new ArrayBuffer(8)},abort.signal,()=>{})).rejects.toThrow();});
});
