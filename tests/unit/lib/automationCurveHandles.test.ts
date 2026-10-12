import {expect,it} from 'vitest';
import {curveHandleSegment,shapeHandleControls,customShapeProgress,shapeProgress,type AutomationShape} from '../../../src/lib/automationShapeMetadata';
import {shapeAutomationSegment} from '../../../src/lib/automationShape';
import {targetPoints,type AutomationTarget} from '../../../src/lib/automationRecording';
import {useProjectStore} from '../../../src/stores/projectStore';
import type {TimelineProject} from '../../../src/types/audio';
const shapes:Exclude<AutomationShape,'custom'>[]=['linear','ease-in','ease-out','s-curve'];
const fixture=():TimelineProject=>{const points=()=>[{time:0,value:.1,curve:'step' as const},{time:1,value:.2},{time:3,value:.8,curve:'step' as const},{time:4,value:.1}];return {...useProjectStore.getInitialState().project,sampleRate:48000,duration:4,minimumDuration:4,tracks:[{id:'t',name:'Curve',volume:1,pan:0,muted:false,solo:false,segments:[],automation:points(),panAutomation:points(),effects:[{type:'delay',enabled:true,params:{mix:.3,time:.3,feedback:.4},automation:{mix:points(),time:points(),feedback:points()}}]}]};};
it('maps each polynomial preset to the same cubic value progress',()=>{
 for(const shape of shapes)for(let i=0;i<=100;i++)expect(customShapeProgress(i/100,shapeHandleControls(shape))).toBeCloseTo(shapeProgress(i/100,shape),13);
});
it('exposes whole preset spans and keeps project identity until a handle actually changes',()=>{
 for(const parameter of ['gain','pan','mix','feedback','time'] as const)for(const shape of shapes){
  const target:AutomationTarget={trackId:'t',parameter,...(parameter==='gain'||parameter==='pan'?{}:{effectIndex:0})},before=shapeAutomationSegment(fixture(),target,1,shape),points=targetPoints(before,target)!;
  const span=curveHandleSegment(points,1,48000,4)!;expect(span.b.time).toBe(3);
  expect(shapeAutomationSegment(before,target,1,'custom',span.controls)).toBe(before);
  const after=shapeAutomationSegment(before,target,1,'custom',{...span.controls,x1:span.controls.x1+.1});
  expect(targetPoints(after,target)).toHaveLength(19);expect(targetPoints(after,target)![0]).toBe(points[0]);expect(targetPoints(after,target)![17]).toBe(points.at(-2));expect(targetPoints(after,target)!.at(-1)).toBe(points.at(-1));expect(targetPoints(after,target)![1].shapeReview?.shape).toBe('custom');
 }
});
it('excludes damaged hints, Step, flat, missing endpoints and unshapeable clocks',()=>{
 const target={trackId:'t',parameter:'gain' as const},p=shapeAutomationSegment(fixture(),target,1,'ease-in'),points=p.tracks[0].automation!;
 points[5].value+=.01;expect(curveHandleSegment(points,1,48000)).toBeUndefined();
 for(const [a,b] of [[{time:1,value:0,curve:'step' as const},{time:3,value:1}],[{time:1,value:1},{time:3,value:1}],[{time:1,value:0},{time:1+1/48000,value:1}]])expect(curveHandleSegment([a,b],0,48000)).toBeUndefined();
 expect(curveHandleSegment([{time:1,value:0}],0,48000)).toBeUndefined();expect(curveHandleSegment([{time:1,value:0},{time:3,value:1}],0,0)).toBeUndefined();expect(curveHandleSegment([{time:1,value:0},{time:3,value:1}],0,48000,2)).toBeUndefined();
});
