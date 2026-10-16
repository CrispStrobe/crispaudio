import {useTranslation} from 'react-i18next';
import type {GainPoint} from '../../types/audio';
import {curveOverview} from '../../lib/curveOverview';
import {curveFields,normalizeGainPoints,normalizePanPoints} from '../../lib/mixAutomation';
/** Bounded visual comparison on the project clock; never changes or auditions audio. */
export function CurvePastePreview({before,after,fallback,minimum,maximum,start,length,canvas}:{before:GainPoint[];after?:GainPoint[];fallback:number;minimum:number;maximum:number;start:number;length:number;canvas:number}){
 const {t}=useTranslation(),valid=Number.isFinite(start)&&Number.isFinite(length)&&start>=0&&length>0&&start+length<=canvas;
 const left=valid?Math.max(0,start-length*.15):0,right=valid?Math.min(canvas,start+length*1.15):Math.max(1,canvas),extent=Math.max(Number.EPSILON,right-left);
 const x=(time:number)=>12+(time-left)/extent*576,y=(value:number)=>100-Math.max(0,Math.min(1,(value-minimum)/(maximum-minimum)))*88;
 const path=(input:GainPoint[])=>{
  const points=(minimum<0?normalizePanPoints:normalizeGainPoints)(input);
  const at=(time:number)=>{
   if(!points.length)return fallback;if(time<=points[0].time)return points[0].value;if(time>=points.at(-1)!.time)return points.at(-1)!.value;
   let low=0,high=points.length-1;while(low+1<high){const mid=(low+high)>>1;if(points[mid].time<=time)low=mid;else high=mid;}const a=points[low],b=points[high];return a.curve==='step'?a.value:a.value+(b.value-a.value)*(time-a.time)/(b.time-a.time);
  };
  const visible=curveOverview([{time:left,value:at(left),...curveFields(points,left)},...points.filter(p=>p.time>left&&p.time<right),{time:right,value:at(right)}]);
  return visible.map((p,i)=>i?(visible[i-1].curve==='step'?`H${x(p.time)} V${y(p.value)}`:`L${x(p.time)},${y(p.value)}`):`M${x(p.time)},${y(p.value)}`).join(' ');
 };
 return <figure className="space-y-1" data-paste-preview>
  <svg role="img" aria-label={t('automation.pastePreview')} viewBox="0 0 600 112" className="w-full rounded border border-gray-700 bg-gray-950">
   {valid&&<rect x={x(start)} y="12" width={Math.max(0,x(start+length)-x(start))} height="88" fill="#312e81" opacity=".45"/>}
   <path data-paste-before d={path(before)} stroke="#94a3b8" fill="none" strokeWidth="2" strokeDasharray="5 4"/>
   {after&&<path data-paste-after d={path(after)} stroke="#a5b4fc" fill="none" strokeWidth="2"/>}
  </svg>
  <figcaption className="flex justify-between gap-2 text-xs text-gray-400"><span>{left.toFixed(3)} s</span><span><span className="text-slate-400">┄ {t('automation.pasteBefore')}</span> · <span className="text-indigo-300">━ {t('automation.pasteAfter')}</span></span><span>{right.toFixed(3)} s</span></figcaption>
 </figure>;
}
