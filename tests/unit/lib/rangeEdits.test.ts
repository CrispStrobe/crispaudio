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
