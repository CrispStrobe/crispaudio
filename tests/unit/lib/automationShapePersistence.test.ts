import {expect,it} from 'vitest';
import {shapeAutomationSegment,reviewedShapeSegment} from '../../../src/lib/automationShape';
import {validAutomationCurve} from '../../../src/lib/mixAutomation';
import {copyGainEnvelope,pasteGainEnvelope} from '../../../src/lib/gainEnvelope';
import {editTimeRange} from '../../../src/lib/rangeEdits';
import type {TimelineProject} from '../../../src/types/audio';
import {useProjectStore} from '../../../src/stores/projectStore';
const target={trackId:'t',parameter:'gain' as const},controls={x1:.2,y1:.9,x2:.7,y2:.2};
const fixture=():TimelineProject=>({...useProjectStore.getInitialState().project,sampleRate:48000,duration:8,minimumDuration:8,tracks:[{id:'t',name:'Shape',volume:1,pan:0,muted:false,solo:false,segments:[],automation:[{time:0,value:.2},{time:2,value:.8},{time:8,value:.1}]}]});
it('round-trips custom handles and reshapes the entire original span without accumulating points',()=>{
 const a=shapeAutomationSegment(fixture(),target,0,'custom',controls),saved=JSON.parse(JSON.stringify(a));
 expect(reviewedShapeSegment(saved.tracks[0].automation,0)?.review.controls).toEqual(controls);
 expect(shapeAutomationSegment(saved,target,0,'custom',controls)).toBe(saved);
 const b=shapeAutomationSegment(saved,target,0,'custom',{...controls,y1:.3});expect(b.tracks[0].automation).toHaveLength(18);expect(b.tracks[0].automation![16]).toEqual({time:2,value:.8});
 const linear=shapeAutomationSegment(b,target,0,'linear');expect(linear.tracks[0].automation).toEqual(fixture().tracks[0].automation);
});
it('invalidates reopening after interior edits and reshapes only the adjacent segment',()=>{
 const a=shapeAutomationSegment(fixture(),target,0,'custom',controls);a.tracks[0].automation![5].value+=.01;
 expect(reviewedShapeSegment(a.tracks[0].automation!,0)).toBeUndefined();const b=shapeAutomationSegment(a,target,0,'ease-in');expect(b.tracks[0].automation).toHaveLength(33);expect(b.tracks[0].automation![20]).toEqual(a.tracks[0].automation![5]);
});
it('retains complete shape handles through copy/stretch and whole-span range shifts',()=>{
 const a=shapeAutomationSegment(fixture(),target,0,'custom',controls),copy=copyGainEnvelope(a,'t',0,2),b=pasteGainEnvelope(a,'t',copy,3,4);
 const points=b.tracks[0].automation!,index=points.findIndex(p=>p.time===3);expect(reviewedShapeSegment(points,index)?.b.time).toBe(7);expect(reviewedShapeSegment(points,index)?.review.controls).toEqual(controls);
 const shifted=editTimeRange(a,0,1,'insert');const shiftedPoints=shifted.tracks[0].automation!;expect(reviewedShapeSegment(shiftedPoints,shiftedPoints.findIndex(p=>p.time===1))?.b.time).toBe(3);
});
it('rejects malformed metadata and safely ignores mismatched but valid hints',()=>{
 for(const shapeReview of [null,{shape:'custom',intervals:17,controls},{shape:'custom',intervals:16,controls:{...controls,x1:.9,x2:.1}},{shape:'s-curve',intervals:2,controls}])expect(validAutomationCurve({time:0,value:1,shapeReview} as never)).toBe(false);
 const a=fixture();a.tracks[0].automation![0]={...a.tracks[0].automation![0],shapeReview:{shape:'s-curve',intervals:16}};expect(reviewedShapeSegment(a.tracks[0].automation!,0)).toBeUndefined();
});
