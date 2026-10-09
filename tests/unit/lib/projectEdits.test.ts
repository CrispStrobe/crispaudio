import { describe,it,expect } from 'vitest';
import { moveClips,trimClips,slipClips,splitClips,rippleRange,linkClips } from '../../../src/lib/projectEdits';
import { videoClips,validateVideoClips,clipSource } from '../../../src/lib/videoEditing';
import { parseTranscript,transcriptSrt } from '../../../src/lib/transcript';
import { gainAt,micAutomation,scheduleGain } from '../../../src/lib/mixAutomation';
import type { TimelineProject } from '../../../src/types/audio';
function project():TimelineProject{return {id:'p',name:'p',sampleRate:48000,duration:10,masterEffects:[],tracks:[{id:'t',name:'t',muted:false,solo:false,pan:0,volume:1,segments:[{id:'a',linkGroup:'g',trackId:'t',sourceId:'s',startTime:1,sourceOffset:2,duration:5,gain:1,color:'blue',name:'audio',effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'}]}],video:{path:'/a.mp4',duration:10,session:{} as never,sources:[{id:'b',path:'/b.mp4',duration:20,name:'b'}],clips:[{id:'v',linkGroup:'g',startTime:1,sourceOffset:2,duration:5,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0}]}};}
const sources=new Map([['s',{duration:10}]]);
describe('linked editing',()=>{
 it('moves linked clips together with a shared lower bound',()=>{const p=moveClips(project(),['a'],-10);expect(p.tracks[0].segments[0].startTime).toBe(0);expect(videoClips(p.video)[0].startTime).toBe(0);});
 it('preserves originals and source offsets while moving',()=>{const original=project(),p=moveClips(original,['v'],2);expect(original.tracks[0].segments[0].startTime).toBe(1);expect(p.tracks[0].segments[0].sourceOffset).toBe(2);expect(p.tracks[0].segments[0].startTime).toBe(3);});
 it('slips linked sources with a shared source boundary',()=>{const p=slipClips(project(),['v'],20,sources);expect(p.tracks[0].segments[0].sourceOffset).toBe(5);expect(videoClips(p.video)[0].sourceOffset).toBe(5);expect(p.tracks[0].segments[0].startTime).toBe(1);});
 it('trims linked starts and clamps to timeline zero',()=>{const p=trimClips(project(),['a'],'left',-5,sources);expect(p.tracks[0].segments[0].startTime).toBe(0);expect(videoClips(p.video)[0].sourceOffset).toBe(1);expect(videoClips(p.video)[0].duration).toBe(6);});
 it('does not extend a trim beyond source duration',()=>{const p=trimClips(project(),['v'],'right',30,sources);expect(videoClips(p.video)[0].duration).toBe(8);expect(p.tracks[0].segments[0].duration).toBe(8);});
 it('splits both media and gives each half a separate link group',()=>{const p=splitClips(project(),['v'],3),audio=p.tracks[0].segments,picture=videoClips(p.video);expect(audio.map(c=>c.duration)).toEqual([2,3]);expect(picture.map(c=>c.sourceOffset)).toEqual([2,4]);expect(audio[1].linkGroup).toBe(picture[1].linkGroup);expect(audio[0].linkGroup).not.toBe(audio[1].linkGroup);});
 it('unlinks the complete group',()=>{const p=linkClips(project(),['a'],true);expect(videoClips(p.video)[0].linkGroup).toBeUndefined();expect(p.tracks[0].segments[0].linkGroup).toBeUndefined();});
 it('ripple removes source time and shifts markers and captions',()=>{const p={...project(),markers:[{id:'m',time:5,name:'marker'}],transcript:[{id:'c',start:5,end:6,text:'later'}]};const next=rippleRange(p,2,4);expect(next.tracks[0].segments.map(c=>[c.startTime,c.sourceOffset,c.duration])).toEqual([[1,2,1],[2,5,2]]);expect(next.markers?.[0].time).toBe(3);expect(next.transcript?.[0].start).toBe(3);expect(videoClips(next.video).map(c=>c.duration)).toEqual([1,2]);});
 it('rejects a ripple boundary inside a real picture blend',()=>{const p=project();p.video!.clips=[{id:'x',startTime:0,duration:5,sourceOffset:0,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0},{id:'y',startTime:4,duration:6,sourceOffset:4,fadeIn:0,fadeOut:0,transition:'fade',transitionDuration:1}];expect(()=>rippleRange(p,4.5,6)).toThrow(/transitionBoundary/);});
 it('validates bounds against each selected video source',()=>{const p=project(),clip={...videoClips(p.video)[0],sourceId:'b',sourceOffset:15};expect(validateVideoClips([clip],10,p.video?.sources)).toBeNull();expect(clipSource(p.video,clip)?.path).toBe('/b.mp4');expect(validateVideoClips([{...clip,sourceId:'missing'}],10,p.video?.sources)).toBeTruthy();});
 it('keeps legacy picture implicit for an audio-only edit',()=>{const p=project();p.video!.clips=undefined;p.tracks[0].segments[0].linkGroup=undefined;const next=moveClips(p,['a'],1);expect(next.video).toBe(p.video);expect(next.video?.clips).toBeUndefined();});
});
describe('timed transcript exchange',()=>{
 it('round-trips SRT millisecond timestamps and multiline text',()=>{const cues=parseTranscript('1\n00:01:02,345 --> 00:01:03,456\nHallo\nWelt\n');expect(cues[0]).toMatchObject({start:62.345,end:63.456,text:'Hallo\nWelt'});expect(parseTranscript(transcriptSrt(cues))[0]).toMatchObject({start:62.345,end:63.456,text:'Hallo\nWelt'});});
 it('supports VTT settings, BOM and offset',()=>{const cues=parseTranscript('\uFEFFWEBVTT\n\n00:01.000 --> 00:02.500 align:start\nGuten Tag',3);expect(cues[0]).toMatchObject({start:4,end:5.5});});
 it('supports JSON segments',()=>{expect(parseTranscript('{"segments":[{"start":1,"end":2,"text":"Deutsch"}]}')[0].text).toBe('Deutsch');});
 it.each(['no timestamps','1\n00:00:02 --> 00:00:01\nx','[{"start":0,"end":2}]'])('rejects invalid transcript %s',text=>expect(()=>parseTranscript(text)).toThrow());
 it('rejects offsets producing negative cue times',()=>expect(()=>parseTranscript('[{"start":0,"end":1,"text":"x"}]',-1)).toThrow());
});
describe('microphone automation',()=>{
 it('interpolates the exact resume gain',()=>{expect(gainAt([{time:0,value:0},{time:2,value:1}],1)).toBe(.5);expect(gainAt(undefined,4)).toBe(1);});
 it('creates complementary crossfades without a gain bump',()=>{const sections=[{start:0,end:2,trackId:'a',confidence:.8},{start:2,end:4,trackId:'b',confidence:.8}],a=micAutomation('a',sections,.2),b=micAutomation('b',sections,.2);for(const time of [0,1.9,2,2.1,3])expect(gainAt(a,time)+gainAt(b,time)).toBeCloseTo(1);});
 it('schedules from the correct timeline clock for a trimmed export',()=>{const calls:number[][]=[],param={setValueAtTime:(...v:number[])=>calls.push(v),linearRampToValueAtTime:(...v:number[])=>calls.push(v)};scheduleGain(param as never,[{time:0,value:0},{time:4,value:1}],10,2);expect(calls).toEqual([[.5,10],[1,12]]);});
});
