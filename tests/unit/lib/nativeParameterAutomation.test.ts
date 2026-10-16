import {it,expect} from 'vitest';
import {nativeParameterValues,validNativeParameterAutomation} from '../../../src/lib/nativeParameterCurves';
import {applyNativeParameterAutomation} from '../../../src/lib/nativeParameterAutomation';
import {useProjectStore} from '../../../src/stores/projectStore';
import {serializeProject,deserializeProject} from '../../../src/lib/projectFile';
const target={instanceId:'fx',address:'gain',min:-24,max:12};
const project=()=>({...useProjectStore.getInitialState().project,duration:4,nativeEffects:[{instanceId:'fx',pluginId:'au:test',name:'Gain',format:'AU' as const,enabled:true,bypass:false,state:'opaque-state',parameters:{gain:-6}}]});
it('validates bounded normalized curves and evaluates Linear, Step, held ends and rewinds in plugin units',()=>{
 const lanes={gain:{min:-24,max:12,points:[{time:1,value:0,curve:'step' as const},{time:2,value:.5},{time:3,value:1}]}};
 expect(validNativeParameterAutomation(lanes)).toBe(true);
 for(const [time,value] of [[0,-24],[1.5,-24],[2,-6],[2.5,3],[9,12],[1,-24]])expect(nativeParameterValues(lanes,time)).toEqual({gain:value});
 for(const bad of [{...lanes.gain,min:12},{...lanes.gain,max:Infinity},{...lanes.gain,points:[{time:-1,value:0}]},{...lanes.gain,points:[{time:0,value:1.1}]},{...lanes.gain,points:[{time:0,value:0,curve:'bogus'}]}])expect(validNativeParameterAutomation({gain:bad})).toBe(false);
});
it('publishes only the addressed lane, preserves state and static values, roundtrips and rejects stale/locked edits',async()=>{
 const original=project(),points=[{time:0,value:.5},{time:2,value:1}],next=applyNativeParameterAutomation(original,original,'master',target,points);
 expect(next.nativeEffects![0]).toMatchObject({state:'opaque-state',parameters:{gain:-6},parameterAutomation:{gain:{min:-24,max:12,points}}});expect(original.nativeEffects[0]).not.toHaveProperty('parameterAutomation');
 const restored=await deserializeProject(serializeProject(next,new Map()),{} as BaseAudioContext);expect(restored.project.nativeEffects).toEqual(next.nativeEffects);
 expect(applyNativeParameterAutomation(next,next,'master',target,points)).toBe(next);
 expect(()=>applyNativeParameterAutomation(original,next,'master',target,points)).toThrow('stale');expect(()=>applyNativeParameterAutomation(original,original,'master',target,points,true)).toThrow('protected');
 expect(applyNativeParameterAutomation(next,next,'master',target,[]).nativeEffects![0].parameterAutomation).toBeUndefined();
});
it('stores the queried static default for a new lane and rejects curves lacking a Read value',()=>{
 const p=project(),target={instanceId:'fx',address:'frequency',min:20,max:20000,defaultValue:440},points=[{time:0,value:.5},{time:1,value:.8}];
 expect(applyNativeParameterAutomation(p,p,'master',target,points).nativeEffects![0].parameters).toEqual({gain:-6,frequency:440});
 expect(()=>applyNativeParameterAutomation(p,p,'master',{...target,defaultValue:undefined},points)).toThrow('invalid');
});
