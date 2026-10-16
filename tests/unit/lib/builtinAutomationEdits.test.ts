import {beforeEach,it,expect} from 'vitest';
import type {AudioSegment,AudioSource,EffectConfig,TimelineProject} from '../../../src/types/audio';
import {affineEffectAutomation,retainedClipAutomation} from '../../../src/lib/nativeAutomationEdits';
import {effectParameterAt,validEffectAutomation,type DelayParameter} from '../../../src/lib/effectAutomation';
import {moveClips,splitClips,trimClips,slipClips} from '../../../src/lib/projectEdits';
import {slideClips} from '../../../src/lib/trimEdits';
import {applyRetime,planRetime} from '../../../src/lib/clipRetime';
import {useProjectStore} from '../../../src/stores/projectStore';
const rack=():EffectConfig[]=>[{type:'delay',enabled:true,params:{mix:.3,time:.2,feedback:.2},automation:{mix:[{time:0,value:.1},{time:4,value:.5},{time:8,value:.9}],feedback:[{time:0,value:.2,curve:'step'},{time:4,value:.8},{time:8,value:.4}],time:[{time:0,value:.01},{time:8,value:1.8}]}},{type:'chorus',enabled:true,params:{},automation:{depth:[{time:0,value:.2},{time:8,value:.8}],rate:[{time:0,value:1},{time:8,value:8}]}},{type:'ringmod',enabled:true,params:{},automation:{freq:[{time:0,value:100},{time:8,value:1700}]}}];
const clip=(id='c',startTime=2,duration=6):AudioSegment=>({id,trackId:'t',sourceId:'s',name:id,color:'#fff',startTime,duration,sourceOffset:2,gain:1,effects:rack(),fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'});
const project=():TimelineProject=>({...useProjectStore.getInitialState().project,id:'builtin-edit',duration:10,minimumDuration:10,masterEffects:rack(),tracks:[{id:'t',name:'Track',volume:1,pan:0,muted:false,solo:false,effects:rack(),segments:[clip()]},{id:'u',name:'Other',volume:1,pan:0,muted:false,solo:false,segments:[]}]});
const values=(effects:EffectConfig[],time:number)=>effects.map(effect=>Object.fromEntries(Object.entries(effect.automation??{}).map(([key,points])=>[key,effectParameterAt(points,time,0,key as DelayParameter)])));
// Boundary interpolation changes the arithmetic order; compare evaluated DSP values to 12 decimals.
const closeValues=(actual:ReturnType<typeof values>,expected:ReturnType<typeof values>)=>{expect(actual).toHaveLength(expected.length);actual.forEach((effect,i)=>{expect(Object.keys(effect)).toEqual(Object.keys(expected[i]));for(const key of Object.keys(effect))expect(effect[key]).toBeCloseTo(expected[i][key],12);});};
const sources=new Map([['s',{duration:30} as AudioSource]]);
beforeEach(()=>{for(const t of useProjectStore.getState().project.tracks)if(t.locked)useProjectStore.getState().updateTrack(t.id,{locked:false});useProjectStore.getState().loadProjectState(project(),new Map());useProjectStore.temporal.getState().clear();});
it('moves every built-in lane with clip content without changing master/track curves or static parameters',()=>{
 const p=project(),before=structuredClone(p),next=moveClips(p,['c'],3),moved=next.tracks[0].segments[0];for(const t of [0,2,3.5,7.9])expect(values(moved.effects,t+3)).toEqual(values(p.tracks[0].segments[0].effects,t));expect(next.masterEffects).toBe(p.masterEffects);expect(next.tracks[0].effects).toBe(p.tracks[0].effects);expect(moved.effects[0].params).toBe(p.tracks[0].segments[0].effects[0].params);expect(p).toEqual(before);
});
it('cross-track drags and paste each publish one undo with curves at the actual clamped placement',()=>{
 const state=useProjectStore.getState(),original=state.project;state.moveSegment('c',5,'u');expect(values(useProjectStore.getState().project.tracks[1].segments[0].effects,7)).toEqual(values(rack(),4));expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);useProjectStore.temporal.getState().undo();expect(useProjectStore.getState().project).toBe(original);state.selectSegment('c');state.copy();useProjectStore.temporal.getState().clear();state.paste(-10);const pasted=useProjectStore.getState().project.tracks[0].segments.find(c=>c.id!=='c')!;expect(pasted.startTime).toBe(0);expect(values(pasted.effects,1)).toEqual(values(rack(),3));expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);useProjectStore.temporal.getState().undo();expect(useProjectStore.getState().project).toBe(original);
});
it('samples the zero boundary for Linear and Step rather than flattening shifted points',()=>{
 const before=rack(),next=affineEffectAutomation(before,0,1,-2);for(const t of [0,.5,1.999,2,5])closeValues(values(next,t),values(before,t+2));expect(next[0].automation!.mix![0]).toEqual({time:0,value:effectParameterAt(before[0].automation!.mix,2,0,'mix')});expect(next[0].automation!.feedback![0]).toEqual({time:0,value:.2,curve:'step'});expect(next.every(validEffectAutomation)).toBe(true);
});
it('uses a common shift for linked clips when movement is clamped to zero',()=>{
 const p=project();p.tracks[0].segments[0].linkGroup='g';p.tracks[1].segments=[{...clip('linked',1,3),trackId:'u',linkGroup:'g'}];const next=moveClips(p,['c'],-10);expect(next.tracks.map(t=>t.segments[0].startTime)).toEqual([1,0]);for(let i=0;i<2;i++)expect(values(next.tracks[i].segments[0].effects,3)).toEqual(values(p.tracks[i].segments[0].effects,4));
});
it('keeps split/trim/slip clocks, while moving a split translates its curves',()=>{
 const p=project(),split=splitClips(p,['c'],4),right=split.tracks[0].segments[1];expect(values(right.effects,5)).toEqual(values(rack(),5));expect(values(moveClips(split,[right.id],2).tracks[0].segments[1].effects,7)).toEqual(values(rack(),5));for(const next of [trimClips(p,['c'],'left',1,sources),slipClips(p,['c'],1,sources)])expect(next.tracks[0].segments[0].effects).toBe(p.tracks[0].segments[0].effects);
});
it('slides only the middle envelope, retaining neighbour trim clocks',()=>{
 const p=project();p.tracks[0].segments=[clip('left',0,2),clip('middle',2,2),clip('right',4,2)];const next=slideClips(p,['middle'],.5,sources),[left,middle,right]=next.tracks[0].segments;expect(values(middle.effects,3.5)).toEqual(values(rack(),3));expect(left.effects).toBe(p.tracks[0].segments[0].effects);expect(right.effects).toBe(p.tracks[0].segments[2].effects);
});
it('keeps expanded speed envelopes valid at zero and samples the original clock',()=>{
 const p=project(),settings={rate:.5,reverse:false,preservePitch:true,semitones:0};const next=applyRetime(p,planRetime(p,['c'],settings,sources),new Map([['c',{id:'derived',duration:12}]])),effects=next.tracks[0].segments[0].effects;expect(effects.every(validEffectAutomation)).toBe(true);for(const t of [0,2,4,9])closeValues(values(effects,t),values(rack(),2+(t-2)/2));
});
it('preserves no-automation references and rejects invalid transformations atomically',()=>{
 const plain={...clip(),effects:[{type:'delay' as const,enabled:true,params:{time:.3}}]},next={...plain,startTime:3};expect(retainedClipAutomation(plain,next)).toBe(next);expect(next).not.toHaveProperty('nativeEffects');const before=rack(),snapshot=structuredClone(before);expect(()=>affineEffectAutomation(before,0,NaN)).toThrow('invalid');expect(()=>affineEffectAutomation(before,0,0)).toThrow('invalid');expect(before).toEqual(snapshot);
});
