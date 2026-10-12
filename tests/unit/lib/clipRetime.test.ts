import {it,expect} from 'vitest';
import {planRetime,applyRetime,originalWindow,validRetime} from '../../../src/lib/clipRetime';
import type {TimelineProject,AudioSource} from '../../../src/types/audio';
const settings={rate:2,reverse:false,preservePitch:true,semitones:0};
const sources=new Map([['sound',{id:'sound',duration:10} as AudioSource]]);
const fixture=()=>({id:'p',name:'p',duration:4,sampleRate:48000,frameRate:25,masterEffects:[],tracks:[{id:'t',name:'t',volume:1,pan:0,muted:false,solo:false,segments:[{id:'a',trackId:'t',sourceId:'sound',sourceOffset:2,startTime:0,duration:4,linkGroup:'av',name:'s',gain:1,effects:[],fadeInDuration:.2,fadeOutDuration:.4,fadeInCurve:'linear',fadeOutCurve:'linear',color:'#fff'}]}],video:{path:'original.mp4',duration:10,session:{},clips:[{id:'v',startTime:0,duration:4,sourceOffset:2,linkGroup:'av',fadeIn:.2,fadeOut:.4,transition:'cut',transitionDuration:0,composition:{x:0,y:0,scale:1,rotation:0,opacity:1,crop:{left:0,right:0,top:0,bottom:0},keyframeOffset:1,keyframes:[{time:2,x:1,y:0,scale:1,rotation:0,opacity:1}]}}]}} as TimelineProject);
it('retimes linked AV atomically and scales fades/keyframe clocks while retaining originals',()=>{
 const p=fixture(),before=JSON.stringify(p),plans=planRetime(p,['v'],settings,sources);expect(plans).toHaveLength(2);
 const next=applyRetime(p,plans,new Map([['a',{id:'derived-a',duration:2}],['v',{id:'derived-v',path:'derived.mp4',duration:2}]]));
 expect(next.duration).toBe(2);expect(next.tracks[0].segments[0].fadeOutDuration).toBe(.2);expect(next.video!.clips![0].composition!.keyframeOffset).toBe(.5);expect(next.video!.clips![0].composition!.keyframes![0].time).toBe(1);expect(next.video!.path).toBe('original.mp4');expect(JSON.stringify(p)).toBe(before);
 expect(validRetime(next,new Set(['sound','derived-a']))).toBe(true);
 const restored=applyRetime(next,planRetime(next,['a'],settings,sources),new Map(),true);expect(restored.duration).toBe(4);expect(restored.tracks[0].segments[0].sourceId).toBe('sound');expect(restored.video!.clips![0].sourceId).toBeUndefined();expect(restored.video!.clips![0].sourceOffset).toBe(2);
});
it('reapplying settings after reverse trim maps the retained original interval',()=>{
 const p=fixture(),plans=planRetime(p,['a'],{...settings,reverse:true},sources),next=applyRetime(p,plans,new Map([['a',{id:'da',duration:2}],['v',{id:'dv',path:'d.mp4',duration:2}]]));
 const clip={...next.tracks[0].segments[0],sourceOffset:.25,duration:1};expect(originalWindow(clip)).toEqual({sourceId:'sound',offset:3.5,duration:2});
});
it('rejects locks, missing originals, invalid rates and picture overlaps without mutation',()=>{
 const p=fixture();p.tracks[0].locked=true;expect(()=>planRetime(p,['v'],settings,sources)).toThrow(/locked/);p.tracks[0].locked=false;expect(()=>planRetime(p,['v'],{...settings,rate:0},sources)).toThrow(/invalid/);
 expect(()=>planRetime(p,['a'],settings,new Map())).toThrow(/bounds/);
});
it('cache sample rounding stays within source bounds and restores the exact original interval',()=>{
 const p=fixture(),plans=planRetime(p,['a'],settings,sources),rounded=2-1/48000,next=applyRetime(p,plans,new Map([['a',{id:'da',duration:rounded}],['v',{id:'dv',path:'d.mp4',duration:2}]]));expect(next.tracks[0].segments[0].duration).toBe(rounded);expect(originalWindow(next.tracks[0].segments[0]).duration).toBeCloseTo(4,12);const restored=applyRetime(next,planRetime(next,['a'],settings,sources),new Map(),true);expect(restored.tracks[0].segments[0].duration).toBeCloseTo(4,12);
});
