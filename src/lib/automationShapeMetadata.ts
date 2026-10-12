import type {GainPoint} from '../types/audio';
export type AutomationShape='linear'|'ease-in'|'ease-out'|'s-curve'|'custom';
export const automationShapes:AutomationShape[]=['linear','ease-in','ease-out','s-curve','custom'];
export interface AutomationShapeControls {x1:number;y1:number;x2:number;y2:number}
export const defaultShapeControls:AutomationShapeControls={x1:.25,y1:0,x2:.75,y2:1};
export function validShapeControls(c:AutomationShapeControls|undefined):c is AutomationShapeControls {
 return !!c&&['x1','y1','x2','y2'].every(key=>Number.isFinite(c[key as keyof AutomationShapeControls])&&c[key as keyof AutomationShapeControls]>=0&&c[key as keyof AutomationShapeControls]<=1)&&c.x1<=c.x2;
}
const cubic=(p:number,a:number,b:number)=>3*(1-p)*(1-p)*p*a+3*(1-p)*p*p*b+p*p*p;
/** Invert the monotone time axis, then evaluate value progress. Fixed bisection
 * keeps GUI/native generation deterministic, including vertical end handles. */
export function customShapeProgress(x:number,c:AutomationShapeControls):number {
 if(x===0||x===1)return x;
 let lo=0,hi=1;
 for(let i=0;i<48;i++){const mid=(lo+hi)/2;if(cubic(mid,c.x1,c.x2)<x)lo=mid;else hi=mid;}
 return cubic((lo+hi)/2,c.y1,c.y2);
}
export function shapeProgress(p:number,shape:AutomationShape):number {
 return shape==='ease-in'?p*p:shape==='ease-out'?p*(2-p):shape==='s-curve'?p*p*(3-2*p):p;
}

/** Metadata is advisory: reopen only while every baked point still matches it. */
export function validShapeReview(point:GainPoint):boolean {
 const m=point.shapeReview;
 return m===undefined||!!m&&typeof m==='object'&&!Array.isArray(m)&&['ease-in','ease-out','s-curve','custom'].includes(m.shape)&&Number.isInteger(m.intervals)&&m.intervals>=2&&m.intervals<=16&&(m.shape==='custom'?validShapeControls(m.controls):m.controls===undefined);
}
export function reviewedShapeSegment(points:GainPoint[],index:number) {
 const a=points[index],m=a?.shapeReview;
 if(!a||!m||!validShapeReview(a))return undefined;
 const endIndex=index+m.intervals,b=points[endIndex];if(!b||b.time<=a.time)return undefined;
 for(let j=0;j<m.intervals;j++){
  const p=points[index+j],phase=j/m.intervals;
  if(!p||p.curve==='step'||j>0&&p.shapeReview!==undefined)return undefined;
  const value=a.value+(b.value-a.value)*(m.shape==='custom'?customShapeProgress(phase,m.controls!):shapeProgress(phase,m.shape));
  if(Math.abs(p.time-(a.time+(b.time-a.time)*phase))>1e-9*Math.max(1,b.time-a.time)||Math.abs(p.value-value)>1e-12*Math.max(1,Math.abs(p.value),Math.abs(value)))return undefined;
 }
 return {a,b,endIndex,review:m};
}

/** An intact shape owns its start and interior points, never its right endpoint.
 * Shared endpoints belong to the outgoing span. Never infer an older curve or
 * extend a damaged hint; saved shapes have at most sixteen intervals. */
export function reviewedShapeForPoint(points:GainPoint[],index:number) {
 if(!points[index])return undefined;
 const own=reviewedShapeSegment(points,index);
 if(own||points[index].shapeReview!==undefined)return own;
 for(let start=index-1;start>=Math.max(0,index-16);start--){
  if(!points[start].shapeReview)continue;
  const saved=reviewedShapeSegment(points,start);
  if(saved&&index<saved.endIndex)return saved;
 }
 return undefined;
}

/** Polynomial presets have exact cubic equivalents with a linear time axis.
 * Merely exposing handles never rewrites the saved points or their metadata. */
export function shapeHandleControls(shape:Exclude<AutomationShape,'custom'>):AutomationShapeControls {
 return {x1:1/3,x2:2/3,y1:shape==='ease-out'?2/3:shape==='linear'?1/3:0,y2:shape==='ease-in'?1/3:shape==='linear'?2/3:1};
}
/** Intact saved spans use their original endpoint; ordinary Linear uses its next
 * point. A damaged hint must never silently become a different direct span. */
export function curveHandleSegment(points:GainPoint[],index:number,sampleRate:number,endTime=Infinity) {
 const selected=points[index];if(!selected||selected.curve==='step')return undefined;
 const saved=reviewedShapeForPoint(points,index),a=saved?.a??selected;
 if(a.shapeReview!==undefined&&!saved)return undefined;
 const b=saved?.b??points[index+1];
 if(!b||!Number.isFinite(sampleRate)||sampleRate<=0||b.time>endTime||b.time-a.time<2/sampleRate-1e-12||a.value===b.value)return undefined;
 return {a,b,controls:saved?.review.shape==='custom'?{...saved.review.controls!}:shapeHandleControls(saved?.review.shape??'linear')};
}
