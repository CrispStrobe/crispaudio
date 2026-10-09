import { expect, it } from 'vitest';
import { editTimeRange } from '../../../src/lib/rangeEdits';
import { gainAt } from '../../../src/lib/mixAutomation';
import type { TimelineProject } from '../../../src/types/audio';
const project=():TimelineProject=>({id:'p',name:'interview',sampleRate:48000,duration:10,masterEffects:[],markers:[{id:'m',time:8,name:'end'}],transcript:[{id:'cue',start:7,end:9,text:'answer'}],tracks:[
 {id:'mic',name:'Mic',volume:1,pan:0,muted:false,solo:false,automation:[{time:0,value:0},{time:10,value:1}],segments:[{id:'a',trackId:'mic',sourceId:'s',linkGroup:'av',startTime:0,duration:10,sourceOffset:0,gain:1,name:'sound',color:'#fff',effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'}]},
 {id:'music',name:'Music',rippleEnabled:false,volume:1,pan:0,muted:false,solo:false,segments:[]}],video:{path:'video.mp4',duration:10,session:{} as never,clips:[{id:'v',linkGroup:'av',startTime:0,duration:10,sourceOffset:0,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0}]}});
it('extracts linked picture and sound, preserves excluded music and retimes global metadata',()=>{
 const p=project(),out=editTimeRange(p,3,5,'extract');
 expect(out.tracks[1]).toBe(p.tracks[1]);expect(out.duration).toBe(8);
 expect(out.tracks[0].segments.map(c=>[c.startTime,c.duration,c.sourceOffset])).toEqual([[0,3,0],[3,5,5]]);
 expect(out.video?.clips?.[1].linkGroup).toBe(out.tracks[0].segments[1].linkGroup);
 expect(out.markers?.[0].time).toBe(6);expect(out.transcript?.[0]).toMatchObject({start:5,end:7});
 expect(gainAt(out.tracks[0].automation,2)).toBeCloseTo(.2,4);
 expect(gainAt(out.tracks[0].automation,3)).toBeCloseTo(.5,6);
 expect(gainAt(out.tracks[0].automation,5)).toBeCloseTo(.7,6);
 expect(p.duration).toBe(10);
});
it('lift leaves a gap; inserting moves the right parts without touching original media',()=>{
 const p=project(),lift=editTimeRange(p,3,5,'lift'),insert=editTimeRange(p,3,5,'insert');
 expect(lift.tracks[0].segments[1]).toMatchObject({startTime:5,sourceOffset:5,duration:5});
 expect(insert.tracks[0].segments[1]).toMatchObject({startTime:5,sourceOffset:3,duration:7});
 expect(insert.markers?.[0].time).toBe(10);expect(insert.duration).toBe(12);
});
it('keeps excluded audio in place and lets it determine the canvas end',()=>{
 const p=project();p.tracks[1].segments=[{...p.tracks[0].segments[0],id:'music-clip',trackId:'music',linkGroup:undefined}];
 const out=editTimeRange(p,3,5,'extract');
 expect(out.tracks[1]).toBe(p.tracks[1]);expect(out.tracks[1].segments[0]).toMatchObject({startTime:0,duration:10,sourceOffset:0});
 expect(out.duration).toBe(10);expect(out.video?.clips?.at(-1)).toMatchObject({startTime:3,duration:5});
});
it('retimes an explicit canvas floor only when global retiming is requested',()=>{
 const p=project();p.minimumDuration=15;
 expect(editTimeRange(p,3,5,'extract').minimumDuration).toBe(13);
 expect(editTimeRange(p,3,5,'extract').duration).toBe(13);
 expect(editTimeRange(p,3,5,'insert').duration).toBe(17);
 expect(editTimeRange(p,3,5,'lift').duration).toBe(15);
 expect(editTimeRange(p,3,5,'extract',{retimeGlobal:false}).duration).toBe(15);
});
it('rejects a partial linked scope, locked lanes and crossed transcript cues',()=>{
 const p=project();expect(()=>editTimeRange(p,3,5,'extract',{includeVideo:false})).toThrow('linkedScope');
 p.tracks[0].locked=true;expect(()=>editTimeRange(p,3,5,'extract')).toThrow('locked');
 p.tracks[0].locked=false;expect(()=>editTimeRange(p,8,9,'extract')).toThrow('cueBoundary');
 expect(()=>editTimeRange(p,3,5,'extract',{includeVideo:true,trackIds:[]})).toThrow('linkedScope');
});
it('permits untouched video transitions, rejects a boundary inside a blend',()=>{
 const p=project();p.tracks[0].segments[0].linkGroup=undefined;
 p.video!.clips=[{id:'v',startTime:0,duration:5,sourceOffset:0,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0},{id:'b',startTime:4,duration:6,sourceOffset:4,fadeIn:0,fadeOut:0,transition:'fade',transitionDuration:1}];
 const out=editTimeRange(p,1,2,'extract');expect(out.video?.clips?.at(-1)).toMatchObject({startTime:3,transition:'fade',transitionDuration:1});
 expect(()=>editTimeRange(p,4.5,6,'extract')).toThrow('transitionBoundary');
});

it('retimes nested words and retains a stale arrangement guard',()=>{
 const p=project();p.transcript![0].words=[{id:'w',start:7,end:9,text:'answer'}];
 const layout=p.tracks.flatMap(t=>t.segments.map(c=>[t.id,c.id,c.sourceId,c.startTime,c.sourceOffset,c.duration]));p.transcriptLayout=layout;
 const out=editTimeRange(p,3,5,'extract');expect(out.transcript![0].words![0]).toMatchObject({start:5,end:7});expect(out.transcriptLayout).not.toEqual(layout);
 p.transcriptLayout=[['stale']];expect(editTimeRange(p,3,5,'extract').transcriptLayout).toEqual([['stale']]);
});

function blendedProject():TimelineProject {
 const p=project();p.frameRate=25;p.transcript=[];p.markers=[];
 const a=p.tracks[0].segments[0];
 p.tracks[0].segments=[{...a,duration:5,linkGroup:'left'},{...a,id:'b-audio',startTime:5,sourceOffset:5,duration:5,linkGroup:'right'}];
 p.video!.clips=[{id:'v',linkGroup:'left',startTime:0,duration:5,sourceOffset:0,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0},{id:'b',linkGroup:'right',startTime:4,duration:6,sourceOffset:4,fadeIn:0,fadeOut:0,transition:'fade',transitionDuration:1}];
 return p;
}
it.each(['lift','extract','insert'] as const)('explicit %s policy replaces only crossed blends and preserves the linked source clock',operation=>{
 const p=blendedProject(),original=structuredClone(p),out=editTimeRange(p,4.4,4.6,operation,{transitionPolicy:'cut'});
 const picture=out.video!.clips!.find(c=>c.id==='b')!,sound=out.tracks[0].segments.find(c=>c.id==='b-audio')!;
 expect(p).toEqual(original);expect(picture).toMatchObject({sourceOffset:5,duration:5,linkGroup:'right',transition:'cut',transitionDuration:0});
 expect(picture.startTime).toBeCloseTo(operation==='lift'?5:operation==='extract'?4.8:5.2);
 expect(picture.startTime).toBeCloseTo(sound.startTime);expect(picture.sourceOffset).toBe(sound.sourceOffset);
 expect(out.duration).toBeCloseTo(operation==='lift'?10:operation==='extract'?9.8:10.2);
});
it('preserves uncrossed blends even with the explicit hard-cut policy',()=>{
 const p=blendedProject(),out=editTimeRange(p,1,2,'extract',{transitionPolicy:'cut'});
 expect(out.video!.clips!.at(-1)).toMatchObject({sourceOffset:4,startTime:3,duration:6,transition:'fade',transitionDuration:1});
});
it('requires complete original scope and unlocked tracks before converting blends',()=>{
 const p=blendedProject();
 expect(()=>editTimeRange(p,4.4,4.6,'lift',{transitionPolicy:'cut',trackIds:[]})).toThrow('linkedScope');
 p.video!.locked=true;expect(()=>editTimeRange(p,4.4,4.6,'lift',{transitionPolicy:'cut'})).toThrow('locked');
});
it('blocks malformed overlap and off-frame blend edges instead of repairing them',()=>{
 const p=blendedProject();p.video!.clips![1].transitionDuration=.5;
 expect(()=>editTimeRange(p,4.4,4.6,'extract',{transitionPolicy:'cut'})).toThrow('pictureTopology');
 p.video!.clips![1].transitionDuration=.99;p.video!.clips![1].startTime=4.01;p.video!.clips![1].sourceOffset=4.01;p.video!.clips![1].duration=5.99;
 expect(()=>editTimeRange(p,4.4,4.6,'extract',{transitionPolicy:'cut'})).toThrow('pictureTopology');
});
it('lifting the tail or whole arrangement keeps the original canvas without a preexisting floor',()=>{
 const p=project();p.transcript=[];
 for(const start of [8,0]){const out=editTimeRange(p,start,10,'lift',{retimeGlobal:false});expect(out.duration).toBe(10);expect(out.minimumDuration).toBe(10);}
});
it('reviews the resulting cut position and normalizes range boundaries to frames',async()=>{
 const {planRangeTransitionCuts}=await import('../../../src/lib/rangeEdits');
 const review=planRangeTransitionCuts(blendedProject(),4.401,4.599,'extract');
 expect(review).toHaveLength(1);expect(review[0]).toMatchObject({clipId:'b',transition:'fade',start:4,end:5,cutTime:5});expect(review[0].resultingCutTime).toBeCloseTo(4.8);
});

it('reviews a surviving incoming clip at its trimmed start and reports a removed clip honestly',async()=>{
 const {planRangeTransitionCuts}=await import('../../../src/lib/rangeEdits');
 const p=blendedProject();
 expect(planRangeTransitionCuts(p,4.4,6,'lift')[0].resultingCutTime).toBe(6);
 const lift=editTimeRange(p,4.4,6,'lift',{transitionPolicy:'cut'});expect(lift.video!.clips!.at(-1)).toMatchObject({startTime:6,sourceOffset:6,transition:'cut'});
 expect(planRangeTransitionCuts(p,4.4,6,'extract')[0].resultingCutTime).toBe(4.4);
 expect(planRangeTransitionCuts(p,4.4,10,'extract')[0].resultingCutTime).toBeNull();
 const extract=editTimeRange(p,4.4,10,'extract',{transitionPolicy:'cut'});expect(extract.video!.clips).toHaveLength(1);expect(extract.duration).toBeCloseTo(4.4);
});
