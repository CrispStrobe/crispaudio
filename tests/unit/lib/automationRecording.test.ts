import {expect,it} from 'vitest';
import {applyAutomationPass,automationValue,type AutomationTarget} from '../../../src/lib/automationRecording';
import {useProjectStore} from '../../../src/stores/projectStore';
const project={...useProjectStore.getInitialState().project,minimumDuration:10,duration:10,tracks:[{id:'t',name:'Voice',volume:1,pan:.3,muted:false,solo:false,segments:[],automation:[{time:0,value:.5},{time:10,value:1}],effects:[{type:'delay' as const,enabled:true,params:{mix:.3,feedback:.4},automation:{feedback:[{time:0,value:.4}]}}]}]};
const spans=[{points:[{time:2,value:0},{time:3,value:1}]},{points:[{time:5,value:1},{time:6,value:0}]}];
it('changes only written intervals, retains linear outside curves and all other metadata',()=>{
 for(const parameter of ['gain','pan','mix','feedback'] as const){
  const target:AutomationTarget={trackId:'t',parameter,...(['mix','feedback'].includes(parameter)?{effectIndex:0}:{})};
  const input=parameter==='feedback'?spans.map(s=>({points:s.points.map(p=>({...p,value:p.value*.95}))})):spans;
  const out=applyAutomationPass(project,target,input);
  for(const time of [0,1,1.999,3.001,4,4.999,6.001,8,10])expect(automationValue(out,target,time)).toBeCloseTo(automationValue(project,target,time),12);
  expect(automationValue(out,target,2)).toBe(0);expect(out.duration).toBe(project.duration);expect(out.tracks[0].segments).toBe(project.tracks[0].segments);
  if(parameter==='mix')expect(out.tracks[0].effects?.[0].automation?.feedback).toEqual(project.tracks[0].effects[0].automation.feedback);
 }
});
it('rejects locks, overlapping clocks, invalid bounds and keeps equivalent passes as identity',()=>{
 const target={trackId:'t',parameter:'pan' as const};
 expect(applyAutomationPass(project,target,[{points:[{time:1,value:.3},{time:2,value:.3}]}])).toBe(project);
 expect(applyAutomationPass(project,target,[])).toBe(project);
 expect(()=>applyAutomationPass({...project,tracks:[{...project.tracks[0],locked:true}]},target,spans)).toThrow('lockedEnvelope');
 expect(()=>applyAutomationPass(project,target,[...spans,spans[0]])).toThrow('bounds');
 expect(()=>applyAutomationPass(project,{trackId:'t',parameter:'feedback',effectIndex:0},spans)).toThrow('invalidEnvelope');
 expect(()=>applyAutomationPass(project,target,[{points:[{time:1,value:0},{time:1,value:1}]}])).toThrow('invalidEnvelope');
});
