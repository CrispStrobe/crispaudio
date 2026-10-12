import {expect,it,vi} from 'vitest';
import {validEffectAutomation,effectParameterDefault,scheduleMix} from '../../../src/lib/effectAutomation';
import {automationValue,applyAutomationPass} from '../../../src/lib/automationRecording';
import {copyEffectEnvelope,pasteEffectEnvelope} from '../../../src/lib/effectEnvelope';
import {shapeAutomationSegment} from '../../../src/lib/automationShape';
import {editTimeRange} from '../../../src/lib/rangeEdits';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {TimelineProject} from '../../../src/types/audio';
const fixture=():TimelineProject=>({...useProjectStore.getInitialState().project,sampleRate:48000,minimumDuration:8,duration:8,tracks:[{id:'t',name:'Reverb',volume:1,pan:0,muted:false,solo:false,segments:[],effects:[{type:'delay',enabled:true,params:{mix:.3}},{type:'reverb',enabled:true,params:{size:.5,decay:1.5,mix:.7},automation:{mix:[{time:0,value:.2,curve:'step'},{time:2,value:.8},{time:6,value:.1}]}}]}]});
const target={trackId:'t',parameter:'mix' as const,effectIndex:1};
it('validates reverb mix alone, rejects unknown curves/caps and uses correct empty/static default',()=>{
 const p=fixture(),e=p.tracks[0].effects![1];expect(validEffectAutomation(e)).toBe(true);expect(validEffectAutomation({...e,automation:{feedback:[]}})).toBe(false);expect(validEffectAutomation({...e,automation:{mix:[{time:0,value:1.01}]}})).toBe(false);expect(validEffectAutomation({...e,type:'compressor',automation:{}})).toBe(false);expect(()=>automationValue(p,{...target,parameter:'time'},0)).toThrow('invalidEnvelope');
 e.automation={};expect(automationValue(p,target,0)).toBe(.7);delete e.params.mix;expect(automationValue(p,target,0)).toBe(.3);expect(effectParameterDefault('delay','mix')).toBe(.3);
});
it('copies tagged partial and empty envelopes, preserves guards/curves and rejects cross-effect paste',()=>{
 const p=fixture(),copy=copyEffectEnvelope(p,'t',1,'mix',1,4);expect(copy.effectType).toBe('reverb');expect(copy.points[0]).toEqual({time:0,value:.2,curve:'step'});const out=pasteEffectEnvelope(p,'t',1,'mix',copy,4,2);for(const t of [0,1,3,7])expect(automationValue(out,target,t)).toBeCloseTo(automationValue(p,target,t),12);expect(out.tracks[0].effects![0]).toBe(p.tracks[0].effects![0]);expect(()=>pasteEffectEnvelope(p,'t',0,'mix',copy,4,2)).toThrow('parameterMismatch');expect(()=>copyEffectEnvelope(p,'t',1,'feedback')).toThrow('invalidEnvelope');
 p.tracks[0].effects![1].automation={};const empty=copyEffectEnvelope(p,'t',1,'mix',0,2);expect(empty.points.map(p=>p.value)).toEqual([.7,.7]);
});
it('retimes reverb mix, shapes curves and applies protected recording intervals with one-sample guards',()=>{
 const p=fixture(),shaped=shapeAutomationSegment(p,target,2,'custom',{x1:.2,y1:.9,x2:.7,y2:.2});expect(shaped.tracks[0].effects![1].automation!.mix).toHaveLength(18);const pass=applyAutomationPass(shaped,target,[{points:[{time:3,value:0},{time:4,value:1}]}]);for(const t of [1,2.5,5,7])expect(automationValue(pass,target,t)).toBeCloseTo(automationValue(shaped,target,t),12);const extracted=editTimeRange(p,2,3,'extract');expect(automationValue(extracted,target,2)).toBeCloseTo(automationValue(p,target,3),12);p.tracks[0].locked=true;expect(()=>applyAutomationPass(p,target,[{points:[{time:1,value:0},{time:2,value:1}]}])).toThrow('locked');
});
it('keeps reverb and delay clipboards independent and retains identity/redo',()=>{
 const p=fixture();useProjectStore.getState().loadProjectState(p,new Map());useProjectStore.temporal.getState().clear();expect(useProjectStore.getState().copyEffectAutomation('t',1,'mix')).toBe(true);const reverb=useProjectStore.getState().effectClipboards.reverbMix;expect(useProjectStore.getState().copyEffectAutomation('t',0,'mix')).toBe(true);expect(useProjectStore.getState().effectClipboards.reverbMix).toBe(reverb);expect(useProjectStore.getState().effectClipboards.mix!.effectType).toBe('delay');useProjectStore.getState().updateTrack('t',{name:'Temporary'});useProjectStore.temporal.getState().undo();expect(useProjectStore.getState().pasteEffectAutomation('t',1,'mix',0,8)).toBe(true);expect(useProjectStore.temporal.getState().futureStates).toHaveLength(1);
});

it('keeps bit-crusher, reverb and delay clipboards distinct and rejects cross-kind envelopes',()=>{
 const p=fixture();p.tracks[0].effects!.push({type:'bitcrush',enabled:true,params:{mix:.4}});useProjectStore.getState().loadProjectState(p,new Map());
 useProjectStore.getState().copyEffectAutomation('t',1,'mix');const reverb=useProjectStore.getState().effectClipboards.reverbMix;
 useProjectStore.getState().copyEffectAutomation('t',2,'mix');expect(useProjectStore.getState().effectClipboards.reverbMix).toBe(reverb);
 expect(useProjectStore.getState().effectClipboards.bitcrushMix!.effectType).toBe('bitcrush');expect(()=>pasteEffectEnvelope(p,'t',2,'mix',reverb!,0,8)).toThrow('parameterMismatch');
});

it('retains the reverb dry contribution at ramps, held steps, seeks and static fallback',()=>{
 const wet={setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()},dry={setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()};
 const points=[{time:0,value:0},{time:2,value:1,curve:'step' as const},{time:3,value:.5}];
 scheduleMix(wet as unknown as AudioParam,dry as unknown as AudioParam,points,10,1,.3,.7);
 expect(wet.setValueAtTime).toHaveBeenCalledWith(.5,10);expect(dry.setValueAtTime).toHaveBeenCalledWith(.65,10);
 expect(dry.linearRampToValueAtTime).toHaveBeenCalledWith(1-.7,11);expect(dry.setValueAtTime).toHaveBeenCalledWith(.65,12);
 scheduleMix(wet as unknown as AudioParam,dry as unknown as AudioParam,[],10,0,.3,.7);
 expect(dry.setValueAtTime).toHaveBeenLastCalledWith(1-.3*.7,10);
});
