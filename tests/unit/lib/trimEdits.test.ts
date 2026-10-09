import {expect,it} from 'vitest';
import {rollCut,rippleTrim,trimToPlayhead,adjacentEdit} from '../../../src/lib/trimEdits';
import type {TimelineProject} from '../../../src/types/audio';
const sources=new Map([['s',{duration:20}]]);
function fixture():TimelineProject{
 const clip={id:'a',trackId:'mic',sourceId:'s',linkGroup:'left',startTime:0,sourceOffset:2,duration:5,gain:1,name:'a',color:'#fff',effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear' as const,fadeOutCurve:'linear' as const};
 const video={id:'v',linkGroup:'left',startTime:0,sourceOffset:2,duration:5,fadeIn:0,fadeOut:0,transition:'cut' as const,transitionDuration:0};
 return {id:'p',name:'p',sampleRate:48000,duration:10,masterEffects:[],tracks:[{id:'mic',name:'Mic',muted:false,solo:false,pan:0,volume:1,segments:[clip,{...clip,id:'b',linkGroup:'right',startTime:5,sourceOffset:7}]}],video:{path:'v.mp4',duration:20,session:{} as never,clips:[video,{...video,id:'w',linkGroup:'right',startTime:5,sourceOffset:7}]}};
}
it('rolls linked cuts while preserving total length and outer endpoints',()=>{
 const p=fixture(),out=rollCut(p,['a'],.2,sources);
 expect(out.duration).toBe(10);expect(out.tracks[0].segments.map(c=>[c.startTime,c.duration,c.sourceOffset])).toEqual([[0,5.2,2],[5.2,4.8,7.2]]);
 expect(out.video?.clips?.map(c=>[c.startTime,c.duration,c.sourceOffset])).toEqual([[0,5.2,2],[5.2,4.8,7.2]]);expect(p.tracks[0].segments[0].duration).toBe(5);
});
it('rejects source limits, ambiguous neighbours and locked linked lanes',()=>{
 const p=fixture();expect(()=>rollCut(p,['a'],-8,sources)).toThrow('handles');
 p.tracks[0].locked=true;expect(()=>rollCut(p,['v'],.2,sources)).toThrow('locked');p.tracks[0].locked=false;
 p.tracks[0].segments.push({...p.tracks[0].segments[1],id:'duplicate',linkGroup:undefined});expect(()=>rollCut(p,['a'],.2,sources)).toThrow('adjacent');
});
it('requires the complete right link group and a cut rather than a blend',()=>{
 const p=fixture();p.tracks.push({...p.tracks[0],id:'other',segments:[{...p.tracks[0].segments[1],id:'other-b',trackId:'other'}]});expect(()=>rollCut(p,['a'],.2,sources)).toThrow('linkedCut');
});
it('trims to playhead without moving later clips; ripple trims retime later lanes',()=>{
 const p=fixture();expect(trimToPlayhead(p,['a'],'right',4,sources).tracks[0].segments[1].startTime).toBe(5);
 const shorter=rippleTrim(p,['a'],'right',-1,sources);expect(shorter.duration).toBe(9);expect(shorter.tracks[0].segments.map(c=>[c.startTime,c.duration,c.sourceOffset])).toEqual([[0,4,2],[4,5,7]]);
 const longer=rippleTrim(p,['a'],'right',1,sources);expect(longer.duration).toBe(11);expect(longer.video?.clips?.map(c=>[c.startTime,c.duration,c.sourceOffset])).toEqual([[0,6,2],[6,5,7]]);
});
it('ripple left trim moves the remaining source to the original start',()=>{
 const out=rippleTrim(fixture(),['a'],'left',1,sources);expect(out.duration).toBe(9);expect(out.tracks[0].segments[0]).toMatchObject({startTime:0,sourceOffset:3,duration:4});
 const extended=rippleTrim(fixture(),['a'],'left',-1,sources);expect(extended.tracks[0].segments[0]).toMatchObject({startTime:0,sourceOffset:1,duration:6});expect(extended.tracks[0].segments[1].startTime).toBe(6);
});
it('navigates distinct edit boundaries, including gaps and outer canvas',()=>{
 const p=fixture();expect(adjacentEdit(p,4,1)).toBe(5);expect(adjacentEdit(p,5,1)).toBe(10);expect(adjacentEdit(p,5,-1)).toBe(0);expect(adjacentEdit(p,0,-1)).toBe(0);
});
it('keeps a long right clip endpoint stable under rolling frame nudges',()=>{
 const p=fixture();p.video=undefined;p.tracks[0].segments[0].linkGroup=undefined;p.tracks[0].segments[1].linkGroup=undefined;
 p.tracks[0].segments[0].duration=45;p.tracks[0].segments[1].startTime=45;p.tracks[0].segments[1].duration=208.72;p.duration=253.72;
 const before=p.tracks[0].segments[1].startTime+p.tracks[0].segments[1].duration;
 const out=rollCut(p,['a'],.08,new Map([['s',{duration:400}]]));expect(out.duration).toBeCloseTo(before,12);expect(Math.round(out.duration*48000)).toBe(Math.round(p.duration*48000));
});
