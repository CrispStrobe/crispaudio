import { beforeEach, expect, it } from 'vitest';
import { applyScopedAutomation, scopedEffect } from '../../../src/lib/scopedEffectAutomation';
import { useProjectStore } from '../../../src/stores/projectStore';
import type { EffectConfig, TimelineProject } from '../../../src/types/audio';
const delay:EffectConfig={type:'delay',enabled:true,params:{mix:.3,time:.4,feedback:.2},automation:{feedback:[{time:0,value:.2}],time:[{time:25,value:.5}]}};
const project=():TimelineProject=>({...useProjectStore.getInitialState().project,id:'scope',duration:20,minimumDuration:20,masterEffects:[structuredClone(delay)],tracks:[{id:'t',name:'Voice',muted:false,solo:false,volume:1,pan:0,segments:[{id:'c',trackId:'t',sourceId:'s',name:'Clip',color:'#fff',startTime:5,duration:4,sourceOffset:10,gain:1,effects:[structuredClone(delay)],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'}]}]});
beforeEach(()=>{useProjectStore.getState().loadProjectState(project(),new Map());useProjectStore.temporal.getState().clear();});
it('publishes clip automation on the project clock and retains other envelopes and geometry',()=>{
 const p=project(),e=scopedEffect(p,'clip:c',0).effect;
 const next=applyScopedAutomation(p,p,'clip:c',0,e,{...e.automation,mix:[{time:5,value:.2},{time:9,value:.8,curve:'step'}]});
 expect(next.tracks[0].segments[0].effects[0].automation).toEqual({...e.automation,mix:[{time:5,value:.2,curve:undefined},{time:9,value:.8,curve:'step'}]});
 expect(next.tracks[0].segments[0].sourceOffset).toBe(10);expect(next.tracks[0].segments[0].startTime).toBe(5);expect(next.masterEffects).toBe(p.masterEffects);expect(next.tracks[0].segments[0].effects[0].automation!.feedback).toBe(e.automation!.feedback);expect(e.automation!.mix).toBeUndefined();
});
it('master edits leave all clip and track data intact and clear just the selected parameter',()=>{
 const p=project(),e=p.masterEffects[0];const next=applyScopedAutomation(p,p,'master',0,e,{...e.automation,feedback:[]});expect(next.tracks).toBe(p.tracks);expect(next.masterEffects[0].automation!.time).toEqual(e.automation!.time);expect(next.masterEffects[0].automation!.feedback).toBeUndefined();expect(next.masterEffects[0].params).toBe(e.params);
});
it('rejects stale projects, reordered effects, missing clips, unsupported scopes and locked or recording edits',()=>{
 const p=project(),e=p.masterEffects[0];expect(()=>applyScopedAutomation(p,{...p},'master',0,e,e.automation)).toThrow('stale');expect(()=>applyScopedAutomation(p,p,'master',0,{...e},e.automation)).toThrow('stale');expect(()=>scopedEffect(p,'clip:removed',0)).toThrow('missing');expect(()=>scopedEffect(p,'track:t',0)).toThrow('missing');expect(()=>scopedEffect(p,'master',.5)).toThrow('missing');expect(()=>applyScopedAutomation(p,p,'master',0,e,e.automation,true)).toThrow('protected');p.tracks[0].locked=true;const c=p.tracks[0].segments[0].effects[0];expect(()=>applyScopedAutomation(p,p,'clip:c',0,c,c.automation)).toThrow('protected');
});
it('validates the complete draft atomically including unsupported parameters and malformed curves',()=>{
 const p=project(),e=p.masterEffects[0];for(const automation of [{mix:[{time:-1,value:.5}]},{feedback:[{time:0,value:1}]},{time:[{time:0,value:2.1}]},{depth:[{time:0,value:.5}]},{mix:[{time:0,value:NaN}]},{mix:[{time:0,value:.5,curve:'bogus'}]}])expect(()=>applyScopedAutomation(p,p,'master',0,e,automation as EffectConfig['automation'])).toThrow('invalid');expect(p.masterEffects[0]).toBe(e);
});
it('normalizes duplicate clocks and preserves nested shape metadata independently',()=>{
 const p=project(),e=p.masterEffects[0],automation={mix:[{time:4,value:.1},{time:0,value:.2,shapeReview:{shape:'custom' as const,intervals:2,controls:{x1:.1,y1:.2,x2:.8,y2:.9}}},{time:4,value:.6}]};const next=applyScopedAutomation(p,p,'master',0,e,automation);expect(next.masterEffects[0].automation!.mix!.map(p=>[p.time,p.value])).toEqual([[0,.2],[4,.6]]);next.masterEffects[0].automation!.mix![0].shapeReview!.controls!.y1=.3;expect(automation.mix[1].shapeReview!.controls.y1).toBe(.2);
});
it('commits one undo and preserves redo for equivalent or empty drafts',()=>{
 const state=useProjectStore.getState(),p=state.project,e=p.masterEffects[0];const next=applyScopedAutomation(p,p,'master',0,e,{...e.automation,mix:[{time:2,value:.7}]});useProjectStore.setState({project:next});expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);useProjectStore.temporal.getState().undo();const current=useProjectStore.getState().project;const unchanged=applyScopedAutomation(current,current,'master',0,current.masterEffects[0],{...current.masterEffects[0].automation,mix:[]});expect(unchanged).toBe(current);expect(applyScopedAutomation(current,current,'master',0,current.masterEffects[0],{...current.masterEffects[0].automation,feedback:[{value:.2,time:0,curve:'linear'}]})).toBe(current);expect(useProjectStore.temporal.getState().futureStates).toHaveLength(1);useProjectStore.temporal.getState().redo();expect(useProjectStore.getState().project).toBe(next);
});
it('supports all three chorus parameters without disturbing the other lanes',()=>{
 const p=project();p.masterEffects=[{type:'chorus',enabled:true,params:{mix:.3,rate:1.5,depth:.5}}];const e=p.masterEffects[0];const next=applyScopedAutomation(p,p,'master',0,e,{mix:[{time:0,value:.3}],rate:[{time:0,value:8}],depth:[{time:0,value:1}]});expect(next.masterEffects[0].automation!.rate![0].value).toBe(8);
});
