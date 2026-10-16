import {OverflowMenu} from '../common/OverflowMenu';
import {copyCurveRange,pasteCurveRange} from '../../lib/curveRange';
import {effectClipboardKey} from '../../lib/effectEnvelope';
import {useCurveClipboardStore,nativeCurveKey,type CurveDomain} from '../../stores/curveClipboardStore';
import {useProjectStore} from '../../stores/projectStore';
import {useCallback,useEffect,useRef,useState,type PointerEvent} from 'react';
import {useTranslation} from 'react-i18next';
import {Plus,Trash2} from 'lucide-react';
import type {GainPoint} from '../../types/audio';
import {editGainPoint,gainAt} from '../../lib/mixAutomation';
import {NumberField} from './NumberField';
import {ToolButton} from '../common/ToolButton';

/** Points retain their saved units; storageMax defaults to normalized native values. */
interface Props {points:GainPoint[];fallback:number;min:number;max:number;unit:string;storageMax?:number;domain:CurveDomain;duration:number;rate:number;clip?:{start:number;end:number};disabled:boolean;onChange:(points:GainPoint[])=>void;onBusy:(busy:boolean)=>void;onValidity:(valid:boolean)=>void;playhead:()=>number}
interface Drag {id:number;before:GainPoint[];base:GainPoint[];point:GainPoint;selected:number|null;end:number}
/** Dense captures use a bounded overview; every stored point remains addressable by index. */
function overview(points:GainPoint[]){
 if(points.length<=2048)return points;
 const result:GainPoint[]=[],stride=Math.ceil(points.length/512);
 for(let i=0;i<points.length;i+=stride){const chunk=points.slice(i,i+stride);let low=chunk[0],high=chunk[0];for(const point of chunk){if(point.value<low.value)low=point;if(point.value>high.value)high=point;}result.push(...[...new Set([chunk[0],low,high,chunk.at(-1)!])].sort((a,b)=>a.time-b.time));}
 return result;
}
export function ParameterCurveEditor({points,fallback,min,max,unit,storageMax=1,domain,duration,rate,clip,disabled,onChange,onBusy,onValidity,playhead}:Props){
 const {t}=useTranslation(),[selected,setSelected]=useState<number|null>(null),[numericPreview,setNumericPreview]=useState<GainPoint|null>(null),[revision,setRevision]=useState(0),drag=useRef<Drag|null>(null);
 const [rangeOpen,setRangeOpen]=useState(false),[range,setRange]=useState(()=>clip??{start:0,end:Math.max(1,duration,points.at(-1)?.time??0)}),[rangeError,setRangeError]=useState(''),[rangeNotice,setRangeNotice]=useState('');
 const rangeDrag=useRef<{id:number;before:{start:number;end:number};anchor:number;extent:number}|null>(null);
 const effectEnvelope=useProjectStore(state=>domain.kind==='builtin'?state.effectClipboards[effectClipboardKey(domain.effectType,domain.parameter)]:null);
 const nativeEnvelope=useCurveClipboardStore(state=>domain.kind==='native'&&state.key===nativeCurveKey(domain)?state.envelope:null),envelope=domain.kind==='builtin'?(effectEnvelope?.effectType===domain.effectType&&effectEnvelope.parameter===domain.parameter?effectEnvelope:null):nativeEnvelope;
 const [activeGesture,setActiveGesture]=useState(false),[validFields,setValidFields]=useState(true);
 const reportBusy=useCallback((value:boolean)=>{setActiveGesture(value);onBusy(value);},[onBusy]);
 const invalid=useRef(new Set<string>());
 const validate=(field:string,raw:string,accept:(value:number)=>boolean)=>{const value=raw.trim()?Number(raw):NaN;if(Number.isFinite(value)&&accept(value))invalid.current.delete(field);else invalid.current.add(field);setValidFields(!invalid.current.size);onValidity(!invalid.current.size);};
 const end=Math.max(1,duration,clip?.end??0,points.at(-1)?.time??0),index=points.findIndex(p=>p.time===selected),point=points[index];
 const digits=Math.max(2,Math.min(10,4-Math.floor(Math.log10(max-min))));
 const actual=(value:number)=>min+(max-min)*value/storageMax,normalized=(value:number)=>(value-min)/(max-min)*storageMax;
 const x=(time:number,extent=end)=>12+time/extent*576,y=(value:number)=>148-value/storageMax*136;
 const visual=numericPreview&&point?editGainPoint(points,point.time,numericPreview):points;
 const displayed=overview(visual.length?visual:[{time:0,value:fallback}]);
 let path=`M${x(displayed[0].time)},${y(displayed[0].value)}`;
 if(displayed[0].time>0)path=`M12,${y(displayed[0].value)} L${x(displayed[0].time)},${y(displayed[0].value)}`;
 displayed.forEach((p,i)=>{if(i)path+=displayed[i-1].curve==='step'?` H${x(p.time)} V${y(p.value)}`:` L${x(p.time)},${y(p.value)}`;});path+=' H588';
 const resetFields=()=>{invalid.current.clear();setValidFields(true);onValidity(true);setRevision(value=>value+1);};
 const publish=(next:GainPoint[],selection:number|null)=>{resetFields();onChange(next);setSelected(selection);};
 const edit=(patch:Partial<GainPoint>)=>{
  setNumericPreview(null);if(disabled||!point)return false;const next={...point,...patch};delete next.shapeReview;
  if(!Number.isFinite(next.time)||next.time<0||!Number.isFinite(next.value)||next.value<0||next.value>storageMax)return false;
  publish(editGainPoint(points,point.time,next),next.time);return true;
 };
 const cancel=()=>{setNumericPreview(null);if(rangeDrag.current){setRange(rangeDrag.current.before);rangeDrag.current=null;reportBusy(false);}const active=drag.current;if(!active)return;drag.current=null;publish(active.before,active.selected);reportBusy(false);};
 useEffect(()=>{
  const interrupted=()=>{if(rangeDrag.current){setRange(rangeDrag.current.before);rangeDrag.current=null;reportBusy(false);}const active=drag.current;if(!active)return;drag.current=null;onChange(active.before);setSelected(active.selected);reportBusy(false);};
  const hidden=()=>{if(document.hidden)interrupted();};
  window.addEventListener('blur',interrupted);document.addEventListener('visibilitychange',hidden);
  return()=>{window.removeEventListener('blur',interrupted);document.removeEventListener('visibilitychange',hidden);if(drag.current||rangeDrag.current){drag.current=null;rangeDrag.current=null;reportBusy(false);}};
 },[onChange,reportBusy]);
 const location=(e:PointerEvent<SVGSVGElement>,extent=end)=>{
  const rect=e.currentTarget.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return;
  return {time:Math.max(0,Math.min(extent,((e.clientX-rect.left)/rect.width*600-12)/576*extent)),value:Math.max(0,Math.min(storageMax,(148-(e.clientY-rect.top)/rect.height*160)/136*storageMax)),rect};
 };
 const validRange=Number.isFinite(range.start)&&Number.isFinite(range.end)&&range.start>=0&&range.end<=end&&range.end-range.start>=1/rate;
 const unavailable=disabled||activeGesture||!validFields;
 const copy=()=>{try{const start=rangeOpen?range.start:clip?.start??0,finish=rangeOpen?range.end:clip?.end??end;
  const copied=copyCurveRange(points,fallback,start,finish,storageMax);
  if(domain.kind==='builtin'){const state=useProjectStore.getState();useProjectStore.setState({effectClipboards:{...state.effectClipboards,[effectClipboardKey(domain.effectType,domain.parameter)]:{...copied,effectType:domain.effectType,parameter:domain.parameter,sourceStart:start}}});}
  else useCurveClipboardStore.setState({key:nativeCurveKey(domain),envelope:copied});
  setRangeError('');setRangeNotice(t('curveRange.copied'));
 }catch(e){setRangeError(t(e instanceof Error?e.message:String(e)));}};
 const paste=(fit:boolean)=>{if(!envelope)return;try{const start=fit?range.start:Math.round(Math.max(0,playhead())*rate)/rate,length=fit?range.end-range.start:envelope.duration;
  publish(pasteCurveRange(points,fallback,envelope,start,length,rate,storageMax,end),null);setRangeError('');setRangeNotice(t('curveRange.pasted'));
 }catch(e){setRangeError(t(e instanceof Error?e.message:String(e)));}};
 return <div className="space-y-2" data-parameter-curve-editor>
  <svg viewBox="0 0 600 160" role="img" aria-label={t('fxInspector.curve')} aria-disabled={disabled} tabIndex={0} className="w-full rounded bg-gray-950 border border-gray-700 touch-none select-none"
   onKeyDown={e=>{if(e.key!=='Tab'&&e.key!=='Escape')e.stopPropagation();if(!disabled&&!rangeOpen&&!drag.current&&!rangeDrag.current&&point&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft'||e.key==='ArrowRight')edit({time:Math.max(0,point.time+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?.01:1/rate))});else edit({value:Math.max(0,Math.min(storageMax,point.value+(e.key==='ArrowDown'?-1:1)*(e.shiftKey?.01:.001)*storageMax))});return;}if(e.key==='Escape'&&(drag.current||rangeDrag.current)){e.preventDefault();e.stopPropagation();cancel();}else if((e.key==='Delete'||e.key==='Backspace')&&!disabled&&!rangeOpen&&point){e.preventDefault();publish(points.filter(p=>p.time!==selected),null);}}}
   onPointerDown={e=>{
    if(disabled||e.button>0||drag.current||rangeDrag.current)return;const at=location(e);if(!at)return;e.preventDefault();e.currentTarget.focus();resetFields();
    if(rangeOpen){rangeDrag.current={id:e.pointerId,before:range,anchor:Math.round(at.time*rate)/rate,extent:end};e.currentTarget.setPointerCapture(e.pointerId);reportBusy(true);return;}
    let nearest:GainPoint|undefined,distance=e.pointerType==='touch'||e.pointerType==='pen'?24:12;
    for(const p of points){const d=Math.hypot((x(p.time)-12-at.time/end*576)*at.rect.width/600,(y(p.value)-y(at.value))*at.rect.height/160);if(d<=distance){distance=d;nearest=p;}}
    const next=nearest??{time:Math.round(at.time*rate)/rate,value:at.value},base=nearest?points:editGainPoint(points,null,next);
    drag.current={id:e.pointerId,before:points,base,point:next,selected,end};e.currentTarget.setPointerCapture(e.pointerId);reportBusy(true);if(!nearest)onChange(base);setSelected(next.time);
   }}
   onPointerMove={e=>{const selection=rangeDrag.current;if(selection?.id===e.pointerId){if(disabled){cancel();return;}const at=location(e,selection.extent);if(at){const time=Math.round(at.time*rate)/rate;setRange({start:Math.min(time,selection.anchor),end:Math.max(time,selection.anchor)});}return;}const active=drag.current;if(!active||active.id!==e.pointerId)return;if(disabled){cancel();return;}const at=location(e,active.end);if(!at)return;const next={...active.point,time:Math.round(at.time*rate)/rate,value:at.value};delete next.shapeReview;publish(editGainPoint(active.base,active.point.time,next),next.time);}}
   onPointerUp={e=>{if(rangeDrag.current?.id===e.pointerId){if(disabled){cancel();return;}if(range.end-range.start<1/rate)setRange(rangeDrag.current.before);rangeDrag.current=null;reportBusy(false);resetFields();return;}if(drag.current?.id!==e.pointerId)return;if(disabled){cancel();return;}drag.current=null;reportBusy(false);}}
   onPointerCancel={cancel} onLostPointerCapture={cancel}>
   {clip&&<rect x={x(clip.start)} y="12" width={Math.max(0,x(clip.end)-x(clip.start))} height="136" fill="#312e81" opacity=".35"/>}
   {rangeOpen&&<rect data-curve-range x={x(range.start)} y="12" width={Math.max(0,x(range.end)-x(range.start))} height="136" fill="#fbbf24" opacity=".18" stroke="#fbbf24"/>}
   <path d={path} fill="none" stroke="#818cf8" strokeWidth="2"/>
   {displayed.map(p=><circle key={p.time} cx={x(p.time)} cy={y(p.value)} r={4} fill="#a5b4fc"/>)}
   {point&&!rangeOpen&&<circle cx={x(numericPreview?.time??point.time)} cy={y(numericPreview?.value??point.value)} r={7} fill="#fbbf24"/>}
  </svg>
  <div className="flex justify-between text-xs text-gray-400"><span>0 s</span><span>{end.toFixed(3)} s</span></div>
  <div className="flex items-center gap-2"><NumberField key={`index:${revision}`} label={t('fxInspector.point')} value={index<0?0:index+1} min={0} max={points.length} step={1} disabled={disabled||rangeOpen||!points.length} width="w-20 min-h-11" onDraftChange={raw=>validate('point',raw,value=>Number.isInteger(value)&&value>=0&&value<=points.length)} onCommit={position=>{if(!Number.isInteger(position)||position<0||position>points.length)return false;setNumericPreview(null);resetFields();setSelected(position?points[position-1].time:null);return true;}}/><span className="flex-1 text-xs text-gray-400">/ {points.length}</span>
   <ToolButton icon={Plus} label={t('fxInspector.add')} disabled={disabled||rangeOpen} onClick={()=>{const time=Math.round(Math.max(0,playhead())*rate)/rate;publish(editGainPoint(points,null,{time,value:points.length?gainAt(points,time):fallback}),time);}}/>
   <ToolButton icon={Trash2} label={t('fxInspector.remove')} disabled={disabled||rangeOpen||!point} onClick={()=>publish(points.filter(p=>p.time!==selected),null)}/>
   <OverflowMenu label={t('curveRange.actions')}>
    <button role="menuitem" className="w-full min-h-11 text-left px-3 py-2 rounded hover:bg-gray-700 focus:bg-gray-700 disabled:opacity-30" disabled={unavailable} onClick={()=>{setRangeOpen(!rangeOpen);setRangeError('');}}>{t(rangeOpen?'curveRange.close':'curveRange.select')}</button>
    <button role="menuitem" className="w-full min-h-11 text-left px-3 py-2 rounded hover:bg-gray-700 focus:bg-gray-700 disabled:opacity-30" disabled={unavailable||rangeOpen&&!validRange} onClick={copy}>{t('curveRange.copy')}</button>
    <button role="menuitem" className="w-full min-h-11 text-left px-3 py-2 rounded hover:bg-gray-700 focus:bg-gray-700 disabled:opacity-30" disabled={unavailable||!envelope} onClick={()=>paste(false)}>{t('curveRange.paste')}</button>
    <button role="menuitem" className="w-full min-h-11 text-left px-3 py-2 rounded hover:bg-gray-700 focus:bg-gray-700 disabled:opacity-30" disabled={unavailable||!envelope||!rangeOpen||!validRange} onClick={()=>paste(true)}>{t('curveRange.fit')}</button>
   </OverflowMenu>
  </div>
  {rangeOpen&&<div className="grid grid-cols-2 gap-2" data-curve-range-fields>
   <label className="text-xs text-gray-400">{t('curveRange.start')}<NumberField key={`range-start:${revision}`} label={t('curveRange.start')} value={range.start} min={0} max={range.end-1/rate} step={1/rate} scrubStep={.01} width="w-full min-h-11" disabled={disabled} onDraftChange={raw=>validate('rangeStart',raw,value=>value>=0&&value<=range.end-1/rate)} onCommit={start=>{if(start<0||start>range.end-1/rate)return false;setRange({...range,start});resetFields();return true;}}/></label>
   <label className="text-xs text-gray-400">{t('curveRange.end')}<NumberField key={`range-end:${revision}`} label={t('curveRange.end')} value={range.end} min={range.start+1/rate} max={end} step={1/rate} scrubStep={.01} width="w-full min-h-11" disabled={disabled} onDraftChange={raw=>validate('rangeEnd',raw,value=>value>=range.start+1/rate&&value<=end)} onCommit={finish=>{if(finish<range.start+1/rate||finish>end)return false;setRange({...range,end:finish});resetFields();return true;}}/></label>
  </div>}
  {rangeError&&<p role="alert" className="text-xs text-amber-300">{rangeError}</p>}
  {rangeNotice&&<p role="status" className="text-xs text-gray-400">{rangeNotice}</p>}
  {point&&!rangeOpen&&<div className="grid grid-cols-2 gap-2">
   <label className="text-xs text-gray-400">{t('fxInspector.time')}<NumberField key={`time:${revision}:${point.time}`} label={t('fxInspector.time')} value={Number(point.time.toFixed(Math.min(9,Math.ceil(Math.log10(rate))+1)))} min={0} step={1/rate} scrubStep={.01} width="w-full min-h-11" disabled={disabled} onDraftChange={raw=>validate('time',raw,value=>value>=0)} onPreview={time=>setNumericPreview({...point,time})} onCancel={()=>setNumericPreview(null)} onEnd={()=>setNumericPreview(null)} onCommit={time=>edit({time})}/></label>
   <label className="text-xs text-gray-400">{t('fxInspector.value')} {unit}<NumberField key={`value:${revision}:${point.time}`} label={`${t('fxInspector.value')}${unit?` (${unit})`:''}`} value={Number(actual(point.value).toFixed(digits))} min={min} max={max} step={(max-min)/1000} width="w-full min-h-11" disabled={disabled} onDraftChange={raw=>validate('value',raw,value=>value>=min&&value<=max)} onPreview={value=>setNumericPreview({...point,value:normalized(value)})} onCancel={()=>setNumericPreview(null)} onEnd={()=>setNumericPreview(null)} onCommit={value=>edit({value:normalized(value)})}/></label>
   <select aria-label={t('fxInspector.segment')} value={point.curve??'linear'} disabled={disabled} className="min-h-11 bg-gray-800 rounded px-2" onChange={e=>edit({curve:e.target.value as 'linear'|'step'})}><option value="linear">{t('automation.linear')}</option><option value="step">{t('automation.step')}</option></select>
  </div>}
 </div>;
}
