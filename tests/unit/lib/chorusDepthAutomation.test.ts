import {expect,it,vi} from 'vitest';
import {validEffectAutomation,effectParameterDefault,scheduleChorusDepth} from '../../../src/lib/effectAutomation';
import {automationValue,applyAutomationPass} from '../../../src/lib/automationRecording';
import {copyEffectEnvelope,pasteEffectEnvelope} from '../../../src/lib/effectEnvelope';
import {shapeAutomationSegment} from '../../../src/lib/automationShape';
import {editTimeRange} from '../../../src/lib/rangeEdits';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {TimelineProject} from '../../../src/types/audio';
const fixture=():TimelineProject=>({...useProjectStore.getInitialState().project,sampleRate:48000,duration:8,minimumDuration:8,tracks:[{id:'t',name:'Chorus',volume:1,pan:0,muted:false,solo:false,segments:[],effects:[{type:'chorus',enabled:true,params:{rate:1.5,depth:.7,mix:.3},automation:{depth:[{time:0,value:.2,curve:'step'},{time:2,value:.8},{time:6,value:.1}],mix:[{time:0,value:.3}]}},{type:'delay',enabled:true,params:{mix:.3}}]}]});
const target={trackId:'t',parameter:'depth' as const,effectIndex:0};
it('validates chorus depth, correct static/default fallback and rejects cross-effect depth',()=>{
 const p=fixture(),e=p.tracks[0].effects![0];expect(validEffectAutomation(e)).toBe(true);expect(validEffectAutomation({...e,type:'delay'})).toBe(false);expect(validEffectAutomation({...e,automation:{depth:[{time:0,value:1.01}]}})).toBe(false);expect(validEffectAutomation({...e,automation:{depth:[{time:0,value:-.1}]}})).toBe(false);e.automation={};expect(automationValue(p,target,0)).toBe(.7);delete e.params.depth;expect(automationValue(p,target,0)).toBe(.5);expect(effectParameterDefault('chorus','mix')).toBe(.3);
});
it('copies/stretches only depth, retains guards and independent clipboards, including empty static capture',()=>{
 const p=fixture(),copy=copyEffectEnvelope(p,'t',0,'depth',1,4),out=pasteEffectEnvelope(p,'t',0,'depth',copy,4,2);expect(copy.effectType).toBe('chorus');expect(copy.parameter).toBe('depth');for(const time of [0,1,3,7])expect(automationValue(out,target,time)).toBeCloseTo(automationValue(p,target,time),12);expect(out.tracks[0].effects![0].automation!.mix).toBe(p.tracks[0].effects![0].automation!.mix);expect(()=>pasteEffectEnvelope(p,'t',0,'mix',copy,4,2)).toThrow('parameterMismatch');expect(()=>pasteEffectEnvelope(p,'t',1,'depth',copy,4,2)).toThrow('invalidEnvelope');
 useProjectStore.getState().loadProjectState(p,new Map());useProjectStore.getState().copyEffectAutomation('t',0,'depth');const depth=useProjectStore.getState().effectClipboards.chorusDepth;useProjectStore.getState().copyEffectAutomation('t',0,'mix');useProjectStore.getState().copyEffectAutomation('t',1,'mix');expect(useProjectStore.getState().effectClipboards.chorusDepth).toBe(depth);expect(useProjectStore.getState().effectClipboards.chorusMix?.parameter).toBe('mix');
 p.tracks[0].effects![0].automation={};expect(copyEffectEnvelope(p,'t',0,'depth',0,2).points.map(p=>p.value)).toEqual([.7,.7]);
});
it('retimes depth in all scopes, protects locks and uses whole shaped spans with protected pass guards',()=>{
 const p=fixture(),shaped=shapeAutomationSegment(p,target,2,'custom',{x1:.2,y1:.9,x2:.7,y2:.2}),pass=applyAutomationPass(shaped,target,[{points:[{time:3,value:0},{time:4,value:1}]}]);for(const time of [1,2.5,5,7])expect(automationValue(pass,target,time)).toBeCloseTo(automationValue(shaped,target,time),12);const out=editTimeRange(p,2,3,'extract');expect(automationValue(out,target,2)).toBeCloseTo(automationValue(p,target,3),12);expect(editTimeRange(p,2,3,'lift').tracks[0].effects![0].automation).toEqual(p.tracks[0].effects![0].automation);
 p.tracks[0].locked=true;expect(()=>pasteEffectEnvelope(p,'t',0,'depth',copyEffectEnvelope(p,'t',0,'depth'),0,8)).toThrow('locked');expect(()=>editTimeRange(p,1,2,'extract')).toThrow();
});
it('schedules both LFO gains in seconds, including seek, Step and Read restoration',()=>{
 const a={setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()},b={setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()};const points=[{time:0,value:.2,curve:'step' as const},{time:2,value:.8},{time:4,value:0}];scheduleChorusDepth([a,b] as unknown as AudioParam[],points,10,1,.5);
 for(const param of [a,b]){expect(param.setValueAtTime).toHaveBeenCalledWith(.002,10);expect(param.setValueAtTime).toHaveBeenCalledWith(.008,11);expect(param.linearRampToValueAtTime).toHaveBeenCalledWith(0,13);}
 scheduleChorusDepth([a,b] as unknown as AudioParam[],[],10,1,.7);for(const param of [a,b])expect(param.setValueAtTime).toHaveBeenLastCalledWith(.006999999999999999,10);
});
