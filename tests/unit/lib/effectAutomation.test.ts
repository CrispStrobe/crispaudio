import {expect,it,vi} from 'vitest';
import {scheduleMix,scheduleFeedback,validEffectAutomation} from '../../../src/lib/effectAutomation';
import {editTimeRange} from '../../../src/lib/rangeEdits';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {EffectConfig} from '../../../src/types/audio';
const effect:EffectConfig={type:'delay',enabled:true,params:{mix:.3},automation:{mix:[{time:0,value:0},{time:4,value:1}]}};
it('schedules complementary linear ramps at a seek, holds endpoints and defaults to static mix',()=>{
 const wet={setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()},dry={setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()};
 scheduleMix(wet as unknown as AudioParam,dry as unknown as AudioParam,effect.automation!.mix,10,1,.3);
 expect(wet.setValueAtTime).toHaveBeenCalledWith(.25,10);expect(dry.setValueAtTime).toHaveBeenCalledWith(.75,10);
 expect(wet.linearRampToValueAtTime).toHaveBeenCalledWith(1,13);expect(dry.linearRampToValueAtTime).toHaveBeenCalledWith(0,13);
 scheduleMix(wet as unknown as AudioParam,dry as unknown as AudioParam,[],10,1,.3);expect(wet.setValueAtTime).toHaveBeenLastCalledWith(.3,10);
 expect(validEffectAutomation(effect)).toBe(true);expect(validEffectAutomation({...effect,type:'reverb'})).toBe(false);expect(validEffectAutomation({...effect,automation:{mix:[{time:0,value:2}]}})).toBe(false);
});
it('retimes insert envelopes, preserves lift and blocks locked automation-only tracks',()=>{
 const p={...useProjectStore.getInitialState().project,minimumDuration:10,tracks:[{id:'t',name:'Delay',pan:0,volume:1,muted:false,solo:false,segments:[],effects:[effect]}]};
 const out=editTimeRange(p,1,2,'extract');expect(out.tracks[0].effects?.[0].automation?.mix).toContainEqual({time:1,value:.5});
 expect(editTimeRange(p,1,2,'lift').tracks[0].effects?.[0].automation).toEqual(effect.automation);
 const clip={id:'c',trackId:'t',sourceId:'s',name:'Late clip',startTime:5,sourceOffset:0,duration:1,gain:1,effects:[effect],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear' as const,fadeOutCurve:'linear' as const};
 const racks={...p,masterEffects:[effect],tracks:[{...p.tracks[0],segments:[clip]},{...p.tracks[0],id:'excluded'}]};
 const global=editTimeRange(racks,1,2,'extract');
 expect(global.masterEffects[0].automation).toEqual(global.tracks[0].effects?.[0].automation);
 expect(global.tracks[0].segments[0].effects[0].automation).toEqual(global.masterEffects[0].automation);
 const scoped=editTimeRange(racks,1,2,'extract',{trackIds:['t'],includeVideo:false});
 expect(scoped.masterEffects).toEqual(racks.masterEffects);expect(scoped.tracks[1]).toBe(racks.tracks[1]);

 expect(()=>editTimeRange({...p,tracks:[{...p.tracks[0],locked:true}]},1,2,'extract')).toThrow('locked');
 useProjectStore.getState().loadProjectState({...p,tracks:[{...p.tracks[0],locked:true}]},new Map());const before=useProjectStore.getState().project;
 useProjectStore.getState().updateTrack('t',{effects:[]});expect(useProjectStore.getState().project).toBe(before);
});

it('keeps mix and feedback independent, caps feedback and protects feedback-only locks',()=>{
 const a={...effect,automation:{mix:effect.automation!.mix,feedback:[{time:0,value:0},{time:4,value:.95}]}};
 const param={setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()};
 scheduleFeedback(param as unknown as AudioParam,a.automation.feedback,10,2,.4);
 expect(param.setValueAtTime).toHaveBeenCalledWith(.475,10);expect(param.linearRampToValueAtTime).toHaveBeenCalledWith(.95,12);
 scheduleFeedback(param as unknown as AudioParam,[],10,2,2);expect(param.setValueAtTime).toHaveBeenLastCalledWith(.95,10);
 expect(validEffectAutomation(a)).toBe(true);expect(validEffectAutomation({...a,automation:{feedback:[{time:0,value:.96}]}})).toBe(false);
 const p={...useProjectStore.getInitialState().project,minimumDuration:10,masterEffects:[a],tracks:[{id:'t',name:'Delay',pan:0,volume:1,muted:false,solo:false,segments:[],effects:[a]}]};
 const out=editTimeRange(p,1,2,'extract');expect(out.tracks[0].effects?.[0].automation?.mix).toContainEqual({time:1,value:.5});expect(out.masterEffects[0].automation?.feedback).toContainEqual({time:1,value:.475});
 const locked={...p,tracks:[{...p.tracks[0],locked:true,effects:[{...a,automation:{feedback:a.automation.feedback}}]}]};
 expect(()=>editTimeRange(locked,1,2,'extract')).toThrow('locked');useProjectStore.getState().loadProjectState(locked,new Map());const before=useProjectStore.getState().project;useProjectStore.getState().updateTrack('t',{effects:[]});expect(useProjectStore.getState().project).toBe(before);
});
