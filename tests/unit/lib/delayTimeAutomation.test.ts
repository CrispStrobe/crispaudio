import {expect,it,vi} from 'vitest';
import {scheduleDelayTime,validEffectAutomation,hasEffectAutomation} from '../../../src/lib/effectAutomation';
import {copyEffectEnvelope,pasteEffectEnvelope} from '../../../src/lib/effectEnvelope';
import {applyAutomationPass,automationValue} from '../../../src/lib/automationRecording';
import {editTimeRange} from '../../../src/lib/rangeEdits';
import {useProjectStore} from '../../../src/stores/projectStore';
import {serializeProject,deserializeProject} from '../../../src/lib/projectFile';
import type {TimelineProject} from '../../../src/types/audio';
const fixture=():TimelineProject=>({...useProjectStore.getInitialState().project,sampleRate:48000,duration:8,minimumDuration:8,tracks:[{id:'t',name:'Echo',pan:0,volume:1,muted:false,solo:false,segments:[],effects:[{type:'delay',enabled:true,params:{time:1.5,mix:.5,feedback:.4},automation:{time:[{time:0,value:1.2,curve:'step'},{time:2,value:2},{time:6,value:0}],mix:[{time:0,value:.5}],feedback:[{time:0,value:.4}]}}]}]});
const target={trackId:'t',parameter:'time' as const,effectIndex:0};
it('schedules seconds, Step holds and Linear seeks; caps static values at two seconds',()=>{
 const p=fixture(),param={setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()};
 scheduleDelayTime(param as unknown as AudioParam,p.tracks[0].effects![0].automation!.time,10,1,.3);
 expect(param.setValueAtTime.mock.calls).toEqual([[1.2,10],[2,11]]);expect(param.linearRampToValueAtTime).toHaveBeenCalledWith(0,15);
 scheduleDelayTime(param as unknown as AudioParam,[],10,1,9);expect(param.setValueAtTime).toHaveBeenLastCalledWith(2,10);
 expect(automationValue(p,target,4)).toBe(1);expect(hasEffectAutomation({...p.tracks[0].effects![0],automation:{time:[{time:0,value:2}]}})).toBe(true);
 expect(validEffectAutomation(p.tracks[0].effects![0])).toBe(true);expect(validEffectAutomation({...p.tracks[0].effects![0],automation:{time:[{time:0,value:2.001}]}})).toBe(false);
});
it('copies and stretches time independently, captures empty static seconds and preserves original outside curves',()=>{
 const p=fixture(),copy=copyEffectEnvelope(p,'t',0,'time',1,5),out=pasteEffectEnvelope(p,'t',0,'time',copy,4,2);
 expect(copy.points[0]).toEqual({time:0,value:1.2,curve:'step'});expect(copy.points.at(-1)!.value).toBe(.5);
 expect(automationValue(out,target,4.4)).toBe(1.2);expect(automationValue(out,target,4.5)).toBe(2);
 for(const t of [0,3,4-1/48000,6+1/48000,7])expect(automationValue(out,target,t)).toBeCloseTo(automationValue(p,target,t),12);
 expect(out.tracks[0].effects![0].automation!.mix).toBe(p.tracks[0].effects![0].automation!.mix);expect(out.tracks[0].effects![0].params).toBe(p.tracks[0].effects![0].params);
 p.tracks[0].effects![0].automation!.time=[];expect(copyEffectEnvelope(p,'t',0,'time',1,3).points).toEqual([{time:0,value:1.5},{time:2,value:1.5}]);
 expect(()=>pasteEffectEnvelope(p,'t',0,'mix',copy,0)).toThrow('parameterMismatch');
});
it('guards recorded time passes, rejects over-cap passes and protects time-only locked tracks during range edits',()=>{
 const p=fixture(),out=applyAutomationPass(p,target,[{points:[{time:.5,value:1.8},{time:1,value:1.9}]}]);
 expect(automationValue(out,target,1.5)).toBe(1.2);expect(automationValue(out,target,.75)).toBeCloseTo(1.85);
 expect(()=>applyAutomationPass(p,target,[{points:[{time:.5,value:2.01},{time:1,value:1}]}])).toThrow('invalidEnvelope');
 const extracted=editTimeRange(p,1,2,'extract');expect(automationValue(extracted,target,1)).toBe(2);expect(editTimeRange(p,1,2,'lift').tracks[0].effects).toEqual(p.tracks[0].effects);
 const locked=fixture();locked.tracks[0].locked=true;locked.tracks[0].effects![0].automation={time:[{time:0,value:1.5}]};expect(()=>editTimeRange(locked,1,2,'extract')).toThrow('locked');
});
it('keeps the independent session clipboard across loads and round trips optional time metadata',async()=>{
 const p=fixture();useProjectStore.getState().loadProjectState(p,new Map());useProjectStore.temporal.getState().clear();expect(useProjectStore.getState().copyEffectAutomation('t',0,'time')).toBe(true);const copy=useProjectStore.getState().effectClipboards.time;
 expect(useProjectStore.getState().pasteEffectAutomation('t',0,'time',0,8)).toBe(true);expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
 useProjectStore.getState().loadProjectState({...p,id:'next'},new Map());expect(useProjectStore.getState().effectClipboards.time).toBe(copy);
 const opened=await deserializeProject(serializeProject(p,new Map()),{} as BaseAudioContext);expect(opened.project).toEqual(p);
 const invalid=fixture();invalid.tracks[0].effects![0].automation!.time![0].value=2.001;await expect(deserializeProject(serializeProject(invalid,new Map()),{} as BaseAudioContext)).rejects.toThrow('Invalid effect automation');
});
