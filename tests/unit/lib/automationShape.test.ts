import {expect,it} from 'vitest';
import {shapeAutomationSegment,type AutomationShape} from '../../../src/lib/automationShape';
import {automationValue,targetPoints,applyAutomationPass,type AutomationTarget} from '../../../src/lib/automationRecording';
import {copyEffectEnvelope,pasteEffectEnvelope} from '../../../src/lib/effectEnvelope';
import {copyGainEnvelope,pasteGainEnvelope,copyPanEnvelope,pastePanEnvelope} from '../../../src/lib/gainEnvelope';
import {editTimeRange} from '../../../src/lib/rangeEdits';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {TimelineProject} from '../../../src/types/audio';
const fixture=():TimelineProject=>{const points=()=>[{time:0,value:.3,curve:'step' as const},{time:1,value:.2,curve:'step' as const},{time:3,value:.8,curve:'step' as const},{time:6,value:.1}];return {...useProjectStore.getInitialState().project,duration:8,minimumDuration:8,sampleRate:48000,tracks:[{id:'t',name:'Shape',pan:0,volume:1,muted:false,solo:false,segments:[],automation:points(),panAutomation:points(),effects:[{type:'delay',enabled:true,params:{time:.3,mix:.3,feedback:.4},automation:{mix:points(),feedback:points(),time:points()}}]}]};};
const targets:AutomationTarget[]=['gain','pan','mix','feedback','time'].map(parameter=>({trackId:'t',parameter:parameter as AutomationTarget['parameter'],...(['mix','feedback','time'].includes(parameter)?{effectIndex:0}:{})}));
it('shapes every target in parameter units, keeps endpoint metadata and outside values',()=>{
 for(const target of targets)for(const shape of ['ease-in','ease-out','s-curve'] as AutomationShape[]){const p=fixture(),out=shapeAutomationSegment(p,target,1,shape),before=targetPoints(p,target)!,after=targetPoints(out,target)!;
  expect(after).toHaveLength(19);expect(after[0]).toBe(before[0]);expect(after[17]).toBe(before[2]);expect(after[18]).toBe(before[3]);expect(after[1].curve).toBeUndefined();
  expect(automationValue(out,target,2)).toBeCloseTo(shape==='ease-in'?.35:shape==='ease-out'?.65:.5,14);
  expect(automationValue(out,target,1.5)).toBeCloseTo(.2+.6*(shape==='ease-in'?.0625:shape==='ease-out'?.4375:.15625),14);
  for(const t of [0,.5,1,3,4,6,7])expect(automationValue(out,target,t)).toBe(automationValue(p,target,t));
  expect(out.tracks[0].segments).toBe(p.tracks[0].segments);expect(out.duration).toBe(p.duration);expect(out.tracks[0].effects![0].params).toBe(p.tracks[0].effects![0].params);
 }
});
it('copies partial shapes exactly through retime, preserves recorded outside points and retimes range boundaries',()=>{
 for(const target of targets)for(const shape of ['s-curve','custom'] as AutomationShape[]){const p=shapeAutomationSegment(fixture(),target,1,shape,{x1:.2,y1:.9,x2:.7,y2:.2}),fx=target.effectIndex!==undefined;
  const copy=fx?copyEffectEnvelope(p,'t',0,target.parameter as 'mix',1.3,2.7):target.parameter==='pan'?copyPanEnvelope(p,'t',1.3,2.7):copyGainEnvelope(p,'t',1.3,2.7);
  const out=fx?pasteEffectEnvelope(p,'t',0,target.parameter as 'mix',copy as ReturnType<typeof copyEffectEnvelope>,4,2):target.parameter==='pan'?pastePanEnvelope(p,'t',copy,4,2):pasteGainEnvelope(p,'t',copy,4,2);
  for(const phase of [0,.13,.25,.5,.7,.99,1])expect(automationValue(out,target,4+phase*2)).toBeCloseTo(automationValue(p,target,1.3+phase*1.4),12);
  const pass=applyAutomationPass(p,target,[{points:[{time:1.5,value:.1},{time:2,value:.1}]}]);for(const t of [1.2,2.3,4])expect(automationValue(pass,target,t)).toBeCloseTo(automationValue(p,target,t),12);
  const range=editTimeRange(p,1.5,2,'extract');expect(automationValue(range,target,1.5)).toBeCloseTo(automationValue(p,target,2),12);expect(automationValue(range,target,2)).toBeCloseTo(automationValue(p,target,2.5),12);
 }
});
it('rejects unsupported shapes, last/missing points, short intervals, over-cap effects and locks',()=>{
 const p=fixture(),target=targets[0];expect(()=>shapeAutomationSegment(p,target,6,'ease-in')).toThrow('shapeBounds');expect(()=>shapeAutomationSegment(p,target,.7,'ease-in')).toThrow('shapeBounds');expect(()=>shapeAutomationSegment(p,target,1,'bezier' as AutomationShape)).toThrow('invalidShape');
 p.tracks[0].locked=true;expect(()=>shapeAutomationSegment(p,target,1,'ease-in')).toThrow('locked');p.tracks[0].locked=false;
 p.tracks[0].automation=[{time:0,value:0},{time:1/48000,value:1}];expect(()=>shapeAutomationSegment(p,target,0,'ease-in')).toThrow('shapeBounds');
 p.tracks[0].effects![0].automation!.feedback![1].value=1;expect(()=>shapeAutomationSegment(p,targets[3],1,'ease-in')).toThrow('invalidEnvelope');
});
it('uses fewer intervals on short spans and preserves identity/redo for flat and Linear segments',()=>{
 const p=fixture(),target=targets[0];p.tracks[0].automation=[{time:0,value:0},{time:3/48000,value:1,curve:'step'}];const out=shapeAutomationSegment(p,target,0,'ease-in');expect(out.tracks[0].automation).toHaveLength(4);expect(out.tracks[0].automation![1].time).toBe(1/48000);
 expect(shapeAutomationSegment(p,target,0,'linear')).toBe(p);p.tracks[0].automation=[{time:0,value:.5,curve:'step'},{time:4,value:.5}];expect(shapeAutomationSegment(p,target,0,'s-curve')).toBe(p);
 useProjectStore.getState().loadProjectState(p,new Map());useProjectStore.temporal.getState().clear();useProjectStore.getState().updateTrack('t',{name:'Temporary'});useProjectStore.temporal.getState().undo();expect(shapeAutomationSegment(useProjectStore.getState().project,target,0,'s-curve')).toBe(useProjectStore.getState().project);expect(useProjectStore.temporal.getState().futureStates).toHaveLength(1);
});
it('maps custom time handles to bounded values across every lane, descending values and vertical end handles',()=>{
 for(const target of targets){const p=fixture();for(const controls of [{x1:0,y1:1,x2:0,y2:0},{x1:1,y1:0,x2:1,y2:1},{x1:.2,y1:.7,x2:.8,y2:.3}]){
  const out=shapeAutomationSegment(p,target,1,'custom',controls),points=targetPoints(out,target)!;expect(points).toHaveLength(19);
  expect(points[0]).toBe(targetPoints(p,target)![0]);expect(points[17]).toBe(targetPoints(p,target)![2]);
  for(let i=1;i<17;i++){expect(points[i].value).toBeGreaterThanOrEqual(.2);expect(points[i].value).toBeLessThanOrEqual(.8);if(i>1)expect(points[i].time-points[i-1].time).toBeGreaterThanOrEqual(1/p.sampleRate);}
 }
 }
 const p=fixture();p.tracks[0].automation=[{time:0,value:1.5},{time:2,value:.2,curve:'step'}];const out=shapeAutomationSegment(p,targets[0],0,'custom',{x1:1/3,y1:0,x2:2/3,y2:0});expect(automationValue(out,targets[0],1)).toBeCloseTo(1.3375,12);expect(out.tracks[0].automation!.at(-1)!.curve).toBe('step');
});
it('requires finite bounded monotone time controls and preserves custom linear identity/redo',()=>{
 const p=fixture();for(const c of [undefined,{x1:.9,y1:0,x2:.2,y2:1},{x1:0,y1:NaN,x2:1,y2:1},{x1:0,y1:-.1,x2:1,y2:1}])expect(()=>shapeAutomationSegment(p,targets[0],1,'custom',c)).toThrow('invalidShapeControls');
 p.tracks[0].automation=[{time:0,value:0},{time:4,value:1}];expect(shapeAutomationSegment(p,targets[0],0,'custom',{x1:.2,y1:.2,x2:.8,y2:.8})).toBe(p);
 p.tracks[0].automation=[{time:0,value:0},{time:3/p.sampleRate,value:1}];expect(shapeAutomationSegment(p,targets[0],0,'custom',{x1:0,y1:0,x2:0,y2:1}).tracks[0].automation).toHaveLength(4);
});
