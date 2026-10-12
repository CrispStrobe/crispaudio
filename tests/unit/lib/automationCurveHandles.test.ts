import {expect,it} from 'vitest';
import {curveHandleSegment,reviewedShapeForPoint,shapeHandleControls,customShapeProgress,shapeProgress,type AutomationShape} from '../../../src/lib/automationShapeMetadata';
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

it('resolves every interior saved point to the original span without altering point selection',()=>{
 for(const shape of ['ease-in','ease-out','s-curve','custom'] as const){
  const target={trackId:'t',parameter:'gain' as const},project=shapeAutomationSegment(fixture(),target,1,shape,{x1:.2,y1:.3,x2:.7,y2:.8});
  const points=JSON.parse(JSON.stringify(project.tracks[0].automation!));
  for(let index=1;index<17;index++){
   const span=curveHandleSegment(points,index,48000,4)!;
   expect(span.a.time).toBe(1);expect(span.b.time).toBe(3);
   expect(reviewedShapeForPoint(points,index)?.endIndex).toBe(17);
   expect(shapeAutomationSegment(project,target,span.a.time,'custom',span.controls)).toBe(project);
  }
  // Right boundary is Step here and must not select its incoming shape.
  expect(reviewedShapeForPoint(points,17)).toBeUndefined();expect(curveHandleSegment(points,17,48000,4)).toBeUndefined();
 }
});
it('uses the outgoing shape at shared boundaries and retains adjacent editing after damage',()=>{
 const target={trackId:'t',parameter:'gain' as const},base=fixture();base.tracks[0].automation![2].curve=undefined;
 const p=shapeAutomationSegment(shapeAutomationSegment(base,target,1,'ease-in'),target,3,'ease-out'),points=p.tracks[0].automation!;
 expect(reviewedShapeForPoint(points,17)?.a.time).toBe(3);expect(curveHandleSegment(points,18,48000,4)?.b.time).toBe(4);
 points[5].value+=.01;
 expect(reviewedShapeForPoint(points,8)).toBeUndefined();expect(curveHandleSegment(points,8,48000,4)?.a).toBe(points[8]);expect(curveHandleSegment(points,8,48000,4)?.b).toBe(points[9]);
 expect(curveHandleSegment(points,1,48000,4)).toBeUndefined();
 expect(reviewedShapeForPoint(points,-1)).toBeUndefined();expect(reviewedShapeForPoint(points,points.length)).toBeUndefined();
});
it('never guesses parent shapes from unannotated or partially copied points',()=>{
 const target={trackId:'t',parameter:'gain' as const},p=shapeAutomationSegment(fixture(),target,1,'s-curve'),points=p.tracks[0].automation!;
 for(const fragment of [points.slice(2),points.slice(0,10),points.map(({time,value,curve})=>({time,value,curve}))]){
  expect(reviewedShapeForPoint(fragment,5)).toBeUndefined();
  expect(curveHandleSegment(fragment,5,48000,4)?.a).toBe(fragment[5]);expect(curveHandleSegment(fragment,5,48000,4)?.b).toBe(fragment[6]);
 }
});
