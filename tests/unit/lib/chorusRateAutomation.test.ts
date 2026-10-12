import {expect,it,vi} from 'vitest';
import {validEffectAutomation,effectParameterDefault,scheduleChorusRate} from '../../../src/lib/effectAutomation';
import {automationValue,applyAutomationPass} from '../../../src/lib/automationRecording';
import {copyEffectEnvelope,pasteEffectEnvelope} from '../../../src/lib/effectEnvelope';
import {shapeAutomationSegment} from '../../../src/lib/automationShape';
import {editTimeRange} from '../../../src/lib/rangeEdits';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {TimelineProject} from '../../../src/types/audio';
const fixture=():TimelineProject=>({...useProjectStore.getInitialState().project,sampleRate:48000,duration:8,minimumDuration:8,tracks:[{id:'t',name:'Chorus',volume:1,pan:0,muted:false,solo:false,segments:[],effects:[{type:'chorus',enabled:true,params:{rate:.7,depth:.7,mix:.3},automation:{rate:[{time:0,value:.2,curve:'step'},{time:2,value:.8},{time:6,value:.1}],mix:[{time:0,value:.3}]}},{type:'delay',enabled:true,params:{mix:.3}}]}]});
const target={trackId:'t',parameter:'rate' as const,effectIndex:0};
it('validates chorus rate, correct static/default fallback and rejects cross-effect rate',()=>{
 const p=fixture(),e=p.tracks[0].effects![0];expect(validEffectAutomation(e)).toBe(true);expect(validEffectAutomation({...e,type:'delay'})).toBe(false);expect(validEffectAutomation({...e,automation:{rate:[{time:0,value:8.01}]}})).toBe(false);expect(validEffectAutomation({...e,automation:{rate:[{time:0,value:-.1}]}})).toBe(false);e.automation={};expect(automationValue(p,target,0)).toBe(.7);delete e.params.rate;expect(automationValue(p,target,0)).toBe(1.5);expect(effectParameterDefault('chorus','mix')).toBe(.3);
});
it('copies/stretches only rate, retains guards and independent clipboards, including empty static capture',()=>{
 const p=fixture(),copy=copyEffectEnvelope(p,'t',0,'rate',1,4),out=pasteEffectEnvelope(p,'t',0,'rate',copy,4,2);expect(copy.effectType).toBe('chorus');expect(copy.parameter).toBe('rate');for(const time of [0,1,3,7])expect(automationValue(out,target,time)).toBeCloseTo(automationValue(p,target,time),12);expect(out.tracks[0].effects![0].automation!.mix).toBe(p.tracks[0].effects![0].automation!.mix);expect(()=>pasteEffectEnvelope(p,'t',0,'mix',copy,4,2)).toThrow('parameterMismatch');expect(()=>pasteEffectEnvelope(p,'t',1,'rate',copy,4,2)).toThrow('invalidEnvelope');
 useProjectStore.getState().loadProjectState(p,new Map());useProjectStore.getState().copyEffectAutomation('t',0,'rate');const rate=useProjectStore.getState().effectClipboards.chorusRate;useProjectStore.getState().copyEffectAutomation('t',0,'mix');useProjectStore.getState().copyEffectAutomation('t',1,'mix');expect(useProjectStore.getState().effectClipboards.chorusRate).toBe(rate);expect(useProjectStore.getState().effectClipboards.chorusMix?.parameter).toBe('mix');
 p.tracks[0].effects![0].automation={};expect(copyEffectEnvelope(p,'t',0,'rate',0,2).points.map(p=>p.value)).toEqual([.7,.7]);
});
it('retimes rate in all scopes, protects locks and uses whole shaped spans with protected pass guards',()=>{
 const p=fixture(),shaped=shapeAutomationSegment(p,target,2,'custom',{x1:.2,y1:.9,x2:.7,y2:.2}),pass=applyAutomationPass(shaped,target,[{points:[{time:3,value:0},{time:4,value:1}]}]);for(const time of [1,2.5,5,7])expect(automationValue(pass,target,time)).toBeCloseTo(automationValue(shaped,target,time),12);const out=editTimeRange(p,2,3,'extract');expect(automationValue(out,target,2)).toBeCloseTo(automationValue(p,target,3),12);expect(editTimeRange(p,2,3,'lift').tracks[0].effects![0].automation).toEqual(p.tracks[0].effects![0].automation);
 p.tracks[0].locked=true;expect(()=>pasteEffectEnvelope(p,'t',0,'rate',copyEffectEnvelope(p,'t',0,'rate'),0,8)).toThrow('locked');expect(()=>editTimeRange(p,1,2,'extract')).toThrow();
});

it('schedules both LFO frequencies with detuning, seek, Step and legacy empty rates',()=>{
 const a={setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()},b={setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()};
 const points=[{time:0,value:2,curve:'step' as const},{time:2,value:8},{time:4,value:0}];scheduleChorusRate([a,b] as unknown as AudioParam[],points,10,1,1.5);
 expect(a.setValueAtTime).toHaveBeenCalledWith(2,10);expect(b.setValueAtTime).toHaveBeenCalledWith(2.4,10);expect(a.setValueAtTime).toHaveBeenCalledWith(8,11);expect(b.setValueAtTime).toHaveBeenCalledWith(9.6,11);for(const param of [a,b])expect(param.linearRampToValueAtTime).toHaveBeenCalledWith(0,13);
 scheduleChorusRate([a,b] as unknown as AudioParam[],[],10,1,12);expect(a.setValueAtTime).toHaveBeenLastCalledWith(12,10);expect(b.setValueAtTime).toHaveBeenLastCalledWith(14.399999999999999,10);
});
