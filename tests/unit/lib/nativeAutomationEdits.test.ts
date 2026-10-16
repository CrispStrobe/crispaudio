import {beforeEach,it,expect} from 'vitest';
import type {AudioSegment,NativeEffect,TimelineProject,AudioSource} from '../../../src/types/audio';
import {affineNativeAutomation} from '../../../src/lib/nativeAutomationEdits';
import {nativeParameterValues} from '../../../src/lib/nativeParameterCurves';
import {moveClips,splitClips,slipClips,trimClips} from '../../../src/lib/projectEdits';
import {slideClips} from '../../../src/lib/trimEdits';
import {editTimeRange} from '../../../src/lib/rangeEdits';
import {applyRetime,planRetime} from '../../../src/lib/clipRetime';
import {saveMixVersion,mixProject,validMixVersions} from '../../../src/lib/mixVersions';
import {useProjectStore} from '../../../src/stores/projectStore';
const fx=():NativeEffect[]=>[{instanceId:'fx',pluginId:'au:test',name:'Gain',format:'AU',enabled:true,bypass:false,state:'opaque',parameters:{gain:-6,step:0},parameterAutomation:{gain:{min:-24,max:12,points:[{time:0,value:0},{time:4,value:.5},{time:8,value:1}]},step:{min:0,max:1,points:[{time:0,value:.2,curve:'step'},{time:4,value:.8,curve:'step'},{time:8,value:.4}]}}}];
const clip=(id='c',startTime=2,duration=6):AudioSegment=>({id,trackId:'t',sourceId:'s',name:id,color:'#fff',startTime,duration,sourceOffset:2,gain:1,effects:[],nativeEffects:fx(),fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'});
const project=():TimelineProject=>({id:'native-edit',name:'Edit',sampleRate:48000,duration:10,minimumDuration:10,masterEffects:[],nativeEffects:fx(),tracks:[{id:'t',name:'Track',volume:1,pan:0,muted:false,solo:false,nativeEffects:fx(),segments:[clip()]},{id:'u',name:'Other',volume:1,pan:0,muted:false,solo:false,nativeEffects:fx(),segments:[]}]});
const at=(rack:NativeEffect[]|undefined,time:number)=>nativeParameterValues(rack?.[0].parameterAutomation,time);
const sources=new Map([['s',{duration:30} as AudioSource]]);
beforeEach(()=>{for(const t of useProjectStore.getState().project.tracks)if(t.locked)useProjectStore.getState().updateTrack(t.id,{locked:false});useProjectStore.getState().loadProjectState(project(),new Map());useProjectStore.temporal.getState().clear();});
it('moves grouped clips, nudges and cross-track store drags with their envelopes; preserves static Read/state',()=>{
 const p=project(),before=structuredClone(p),moved=moveClips(p,['c'],3),c=moved.tracks[0].segments[0];
 for(const t of [2,3.5,4,7.9])expect(at(c.nativeEffects,t+3)).toEqual(at(p.tracks[0].segments[0].nativeEffects,t));
 expect(moved.nativeEffects).toBe(p.nativeEffects);expect(moved.tracks[0].nativeEffects).toBe(p.tracks[0].nativeEffects);expect(c.nativeEffects![0]).toMatchObject({instanceId:'fx',parameters:{gain:-6,step:0},state:'opaque'});expect(p).toEqual(before);
 const state=useProjectStore.getState();state.moveSegment('c',5,'u');const dragged=useProjectStore.getState().project.tracks[1].segments[0];expect(at(dragged.nativeEffects,7)).toEqual(at(fx(),4));expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);useProjectStore.temporal.getState().undo();expect(useProjectStore.getState().project.tracks[0].segments[0].startTime).toBe(2);
});
it('samples the old curve at zero rather than clamping negative point clocks',()=>{
 const rack=fx(),shifted=affineNativeAutomation(rack,0,1,-2)!;
 for(const t of [0,.5,1.99,2,5])expect(at(shifted,t)).toEqual(at(rack,t+2));
 expect(shifted[0].parameterAutomation!.gain.points[0]).toEqual({time:0,value:.25});expect(shifted[0].parameterAutomation!.step.points[0]).toMatchObject({time:0,value:.2,curve:'step'});
});
it('pastes independent clip envelopes at the requested placement and supports one Undo/Redo',()=>{
 const state=useProjectStore.getState();state.selectSegment('c');state.copy();useProjectStore.temporal.getState().clear();const original=useProjectStore.getState().project;
 state.paste(6);const pasted=useProjectStore.getState().project.tracks[0].segments.find(c=>c.id!=='c')!;
 expect(at(pasted.nativeEffects,8)).toEqual(at(fx(),4));expect(pasted.nativeEffects).not.toBe(original.tracks[0].segments[0].nativeEffects);expect(original.tracks[0].segments[0].nativeEffects).toEqual(fx());expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
 useProjectStore.temporal.getState().undo();expect(useProjectStore.getState().project).toBe(original);useProjectStore.temporal.getState().redo();expect(useProjectStore.getState().project.tracks[0].segments).toHaveLength(2);
});
it('keeps split/trim/slip curves on their existing timeline clock; moving the right split then follows its content',()=>{
 const p=project(),split=splitClips(p,['c'],4),right=split.tracks[0].segments[1],moved=moveClips(split,[right.id],2);
 expect(at(right.nativeEffects,5)).toEqual(at(fx(),5));expect(at(moved.tracks[0].segments[1].nativeEffects,7)).toEqual(at(fx(),5));
 for(const next of [trimClips(p,['c'],'left',1,sources),slipClips(p,['c'],1,sources)])expect(next.tracks[0].segments[0].nativeEffects).toBe(p.tracks[0].segments[0].nativeEffects);
});
it.each(['extract','insert','lift'] as const)('%s follows selected clip/track scope, global policy and comp backup without touching excluded scopes',operation=>{
 const p=project();p.tracks[0].compBaseSegments=[clip('base')];const before=structuredClone(p),next=editTimeRange(p,4,6,operation,{trackIds:['t'],includeVideo:false,retimeGlobal:false});
 expect(next.tracks[1]).toBe(p.tracks[1]);expect(next.nativeEffects).toBe(p.nativeEffects);
 const time=operation==='extract'?5:operation==='insert'?9:7,old=7;
 for(const rack of [next.tracks[0].nativeEffects,next.tracks[0].segments.at(-1)!.nativeEffects,next.tracks[0].compBaseSegments!.at(-1)!.nativeEffects])expect(at(rack,time)).toEqual(at(fx(),old));
 expect(p).toEqual(before);
 if(operation!=='lift'){const all=editTimeRange(p,4,6,operation,{trackIds:['t'],includeVideo:false,retimeGlobal:true});expect(at(all.nativeEffects,time)).toEqual(at(fx(),old));}
});
it('preserves values around extract joins and inserted gaps, including Step segments',()=>{
 const p=project(),cut=editTimeRange(p,3,5,'extract'),insert=editTimeRange(p,3,5,'insert'),eps=1/p.sampleRate;
 for(const t of [0,1,2.5,3-eps])expect(at(cut.nativeEffects,t).gain).toBeCloseTo(at(p.nativeEffects,t).gain,3);
 for(const t of [3,3.5,4,7])expect(at(cut.nativeEffects,t)).toEqual(at(p.nativeEffects,t+2));
 expect(at(insert.nativeEffects,3)).toEqual(at(p.nativeEffects,3));expect(at(insert.nativeEffects,4)).toEqual(at(p.nativeEffects,3));expect(at(insert.nativeEffects,5)).toEqual(at(p.nativeEffects,3));
});
it('stretches native envelopes with speed changes and restores audible clocks without changing plugin state',()=>{
 const p=project(),settings={rate:2,reverse:false,preservePitch:true,semitones:0},plans=planRetime(p,['c'],settings,sources),next=applyRetime(p,plans,new Map([['c',{id:'derived',duration:3}]])),c=next.tracks[0].segments[0];
 for(const t of [2,3,4,7.9])expect(at(c.nativeEffects,2+(t-2)/2)).toEqual(at(fx(),t));
 const restored=applyRetime(next,planRetime(next,['c'],settings,sources),new Map(),true);for(const t of [2,4,7.9])expect(at(restored.tracks[0].segments[0].nativeEffects,t)).toEqual(at(fx(),t));expect(c.nativeEffects![0].state).toBe('opaque');
});
it('blocks locked automation-only tracks and saved comp racks during ripple edits atomically',()=>{
 const p=project();p.tracks[0].segments=[];p.tracks[0].locked=true;const before=structuredClone(p);expect(()=>editTimeRange(p,1,2,'extract',{trackIds:['t']})).toThrow('locked');expect(p).toEqual(before);
 p.tracks[0].nativeEffects=[];p.tracks[0].compBaseSegments=[clip('base',0,.5)];expect(()=>editTimeRange(p,1,2,'insert',{trackIds:['t']})).toThrow('locked');
});
it('mix comparisons retain native curves and reject stale geometry after edits',()=>{
 const p=saveMixVersion(project(),'A'),edited=structuredClone(p);edited.nativeEffects![0].parameterAutomation!.gain.points[0].value=.4;const restored=mixProject(edited,p.mixVersions!.A!);
 expect(restored.nativeEffects).toEqual(p.nativeEffects);expect(validMixVersions(restored)).toBe(true);expect(()=>mixProject(moveClips(p,['c'],1),p.mixVersions!.A!)).toThrow('changed');
});
it('slides the middle curve with content while neighbour trim curves retain timeline time',()=>{
 const p=project();p.tracks[0].segments=[clip('left',0,2),clip('middle',2,2),clip('right',4,2)];
 const next=slideClips(p,['middle'],.5,sources),[left,middle,right]=next.tracks[0].segments;
 expect(at(middle.nativeEffects,3.5)).toEqual(at(fx(),3));expect(left.nativeEffects).toBe(p.tracks[0].segments[0].nativeEffects);expect(right.nativeEffects).toBe(p.tracks[0].segments[2].nativeEffects);
});
it('uses the shared clamp for linked clip movements, including negative shifts to zero',()=>{
 const p=project();p.tracks[0].segments[0].linkGroup='g';p.tracks[1].segments=[{...clip('linked',1,3),trackId:'u',linkGroup:'g'}];
 const next=moveClips(p,['c'],-10);expect(next.tracks.map(t=>t.segments[0].startTime)).toEqual([1,0]);
 for(const [i,time] of [[0,3],[1,2]])expect(at(next.tracks[i].segments[0].nativeEffects,time-1)).toEqual(at(p.tracks[i].segments[0].nativeEffects,time));
});
it('refuses point-limit overflow atomically instead of producing an invalid saved rack',()=>{
 const p=project();p.tracks[0].nativeEffects![0].parameterAutomation={gain:{min:-24,max:12,points:Array.from({length:100000},(_,i)=>({time:i/10000,value:.5}))}};
 const before=JSON.stringify(p);expect(()=>editTimeRange(p,1.00001,2.00001,'insert')).toThrow('invalid');expect(JSON.stringify(p)).toBe(before);
});
