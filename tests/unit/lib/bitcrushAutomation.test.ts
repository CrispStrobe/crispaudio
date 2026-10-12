import {expect,it} from 'vitest';
import {validEffectAutomation,effectParameterDefault} from '../../../src/lib/effectAutomation';
import {automationValue,applyAutomationPass} from '../../../src/lib/automationRecording';
import {copyEffectEnvelope,pasteEffectEnvelope} from '../../../src/lib/effectEnvelope';
import {shapeAutomationSegment} from '../../../src/lib/automationShape';
import {editTimeRange} from '../../../src/lib/rangeEdits';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {TimelineProject} from '../../../src/types/audio';
const fixture=():TimelineProject=>({...useProjectStore.getInitialState().project,sampleRate:48000,minimumDuration:8,duration:8,tracks:[{id:'t',name:'Bitcrusher',volume:1,pan:0,muted:false,solo:false,segments:[],effects:[{type:'delay',enabled:true,params:{mix:.3}},{type:'bitcrush',enabled:true,params:{bits:4,mix:.7},automation:{mix:[{time:0,value:.2,curve:'step'},{time:2,value:.8},{time:6,value:.1}]}}]}]});
const target={trackId:'t',parameter:'mix' as const,effectIndex:1};
it('validates bitcrush mix alone, rejects unknown curves/caps and uses correct empty/static default',()=>{
 const p=fixture(),e=p.tracks[0].effects![1];expect(validEffectAutomation(e)).toBe(true);expect(validEffectAutomation({...e,automation:{feedback:[]}})).toBe(false);expect(validEffectAutomation({...e,automation:{mix:[{time:0,value:1.01}]}})).toBe(false);expect(validEffectAutomation({...e,type:'compressor',automation:{}})).toBe(false);expect(()=>automationValue(p,{...target,parameter:'time'},0)).toThrow('invalidEnvelope');
 e.automation={};expect(automationValue(p,target,0)).toBe(.7);delete e.params.mix;expect(automationValue(p,target,0)).toBe(.5);expect(effectParameterDefault('delay','mix')).toBe(.3);
});
it('copies tagged partial and empty envelopes, preserves guards/curves and rejects cross-effect paste',()=>{
 const p=fixture(),copy=copyEffectEnvelope(p,'t',1,'mix',1,4);expect(copy.effectType).toBe('bitcrush');expect(copy.points[0]).toEqual({time:0,value:.2,curve:'step'});const out=pasteEffectEnvelope(p,'t',1,'mix',copy,4,2);for(const t of [0,1,3,7])expect(automationValue(out,target,t)).toBeCloseTo(automationValue(p,target,t),12);expect(out.tracks[0].effects![0]).toBe(p.tracks[0].effects![0]);expect(()=>pasteEffectEnvelope(p,'t',0,'mix',copy,4,2)).toThrow('parameterMismatch');expect(()=>copyEffectEnvelope(p,'t',1,'feedback')).toThrow('invalidEnvelope');
 p.tracks[0].effects![1].automation={};const empty=copyEffectEnvelope(p,'t',1,'mix',0,2);expect(empty.points.map(p=>p.value)).toEqual([.7,.7]);
});
it('retimes bitcrush mix, shapes curves and applies protected recording intervals with one-sample guards',()=>{
 const p=fixture(),shaped=shapeAutomationSegment(p,target,2,'custom',{x1:.2,y1:.9,x2:.7,y2:.2});expect(shaped.tracks[0].effects![1].automation!.mix).toHaveLength(18);const pass=applyAutomationPass(shaped,target,[{points:[{time:3,value:0},{time:4,value:1}]}]);for(const t of [1,2.5,5,7])expect(automationValue(pass,target,t)).toBeCloseTo(automationValue(shaped,target,t),12);const extracted=editTimeRange(p,2,3,'extract');expect(automationValue(extracted,target,2)).toBeCloseTo(automationValue(p,target,3),12);p.tracks[0].locked=true;expect(()=>applyAutomationPass(p,target,[{points:[{time:1,value:0},{time:2,value:1}]}])).toThrow('locked');
});
it('keeps bitcrush and delay clipboards independent and retains identity/redo',()=>{
 const p=fixture();useProjectStore.getState().loadProjectState(p,new Map());useProjectStore.temporal.getState().clear();expect(useProjectStore.getState().copyEffectAutomation('t',1,'mix')).toBe(true);const bitcrush=useProjectStore.getState().effectClipboards.bitcrushMix;expect(useProjectStore.getState().copyEffectAutomation('t',0,'mix')).toBe(true);expect(useProjectStore.getState().effectClipboards.bitcrushMix).toBe(bitcrush);expect(useProjectStore.getState().effectClipboards.mix!.effectType).toBe('delay');useProjectStore.getState().updateTrack('t',{name:'Temporary'});useProjectStore.temporal.getState().undo();expect(useProjectStore.getState().pasteEffectAutomation('t',1,'mix',0,8)).toBe(true);expect(useProjectStore.temporal.getState().futureStates).toHaveLength(1);
});

it('keeps ring, bit-crusher and delay clipboards distinct and rejects cross-kind envelopes',()=>{
 const p=fixture();p.tracks[0].effects!.push({type:'ringmod',enabled:true,params:{mix:.4}});useProjectStore.getState().loadProjectState(p,new Map());
 useProjectStore.getState().copyEffectAutomation('t',1,'mix');const bit=useProjectStore.getState().effectClipboards.bitcrushMix;
 useProjectStore.getState().copyEffectAutomation('t',2,'mix');expect(useProjectStore.getState().effectClipboards.bitcrushMix).toBe(bit);
 expect(useProjectStore.getState().effectClipboards.ringmodMix!.effectType).toBe('ringmod');expect(()=>pasteEffectEnvelope(p,'t',2,'mix',bit!,0,8)).toThrow('parameterMismatch');
});
