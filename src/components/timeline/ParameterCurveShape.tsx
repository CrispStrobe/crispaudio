import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import type {GainPoint} from '../../types/audio';
import {shapeEnvelopeSegment} from '../../lib/shapeEnvelope';
import {automationShapes,defaultShapeControls,reviewedShapeForPoint,type AutomationShape,type AutomationShapeControls} from '../../lib/automationShapeMetadata';
import {AutomationShapeChart} from './AutomationShapeChart';
import {NumberField} from './NumberField';
import {InfoButton} from '../common/InfoButton';
/** Shared visual review; the caller publishes to its draft or project. */
export function ParameterCurveShape({points,time,rate,minimum=0,maximum,endTime,disabled,applyLabel,help,onUse,onCancel}:{points:GainPoint[];time:number;rate:number;minimum?:number;maximum:number;endTime:number;disabled:boolean;applyLabel?:string;help?:ReactNode;onUse:(points:GainPoint[],time:number,settings:{shape:AutomationShape;controls:AutomationShapeControls})=>void;onCancel:()=>void}){
 const {t}=useTranslation(),index=points.findIndex(p=>p.time===time),saved=reviewedShapeForPoint(points,index),a=saved?.a??points[index],b=saved?.b??points[index+1];
 const [shape,setShape]=useState<AutomationShape>(saved?.review.shape??'s-curve'),[controls,setControls]=useState<AutomationShapeControls>(saved?.review.controls??defaultShapeControls),[busy,setBusy]=useState(false),[valid,setValid]=useState(true);
 const invalid=useRef(new Set<string>()),numberBefore=useRef(controls),select=useRef<HTMLSelectElement>(null);
 useEffect(()=>{select.current?.focus();},[]);
 let preview:GainPoint[]|undefined,error='';
 try{preview=shapeEnvelopeSegment(points,a?.time,shape,{rate,minimum,maximum,endTime},controls);}catch(e){error=t(e instanceof Error?e.message:String(e));}
 const range=Math.abs((b?.value??0)-(a?.value??0))||1,min=Math.min(a?.value??0,b?.value??0),plotted=(preview??[]).filter(p=>p.time>=a?.time&&p.time<=b?.time).map(p=>({x:(p.time-a.time)/(b.time-a.time),y:(p.value-min)/range}));
 const change=(key:keyof AutomationShapeControls,value:number)=>{if(!Number.isFinite(value)||value<0||value>1||key==='x1'&&value>controls.x2||key==='x2'&&value<controls.x1)return false;setControls(old=>({...old,[key]:value}));return true;};
 const beginNumber=()=>{numberBefore.current={...controls};},cancelNumber=()=>setControls(numberBefore.current);
 const validate=(key:keyof AutomationShapeControls,raw:string)=>{const value=raw.trim()?Number(raw)/100:NaN;if(Number.isFinite(value)&&value>=0&&value<=1&&(key!=='x1'||value<=controls.x2)&&(key!=='x2'||value>=controls.x1))invalid.current.delete(key);else invalid.current.add(key);setValid(!invalid.current.size);};
 return <section data-parameter-shape className="space-y-2" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onCancel();}}}>
  <div className="flex items-center gap-2"><select ref={select} aria-label={t('automation.shape')} disabled={disabled||busy} className="min-h-11 flex-1 min-w-0 bg-gray-800 rounded px-2" value={shape} onChange={e=>{setShape(e.target.value as AutomationShape);invalid.current.clear();setValid(true);}}>{automationShapes.map(value=><option key={value} value={value}>{t(`automation.shape_${value}`)}</option>)}</select><InfoButton label={t('curveShape.info')}>{help??<p>{t('curveShape.help')}</p>}{a?.value===b?.value&&<p>{t('automation.flatShapeHelp')}</p>}</InfoButton></div>
  <div className="text-xs text-gray-400">{a?.time.toFixed(3)}–{b?.time.toFixed(3)} s</div>
  <AutomationShapeChart points={plotted} flat={a?.value===b?.value} descending={(b?.value??0)<(a?.value??0)} controls={shape==='custom'?controls:undefined} disabled={disabled} onBusy={setBusy} onChange={setControls}/>
  {shape==='custom'&&<fieldset disabled={disabled||busy} className="grid grid-cols-2 gap-2">{([1,2] as const).flatMap(index=>(['x','y'] as const).map(axis=>{const key=`${axis}${index}` as keyof AutomationShapeControls,label=t(axis==='x'?'automation.handleTimeLabel':'automation.handleValueLabel',{index});return <label key={key} className="text-xs text-gray-400">{label}<NumberField key={key} label={label} value={Number((controls[key]*100).toFixed(3))} min={0} max={100} step={1} width="w-full min-h-11" onDraftChange={raw=>validate(key,raw)} onBegin={beginNumber} onPreview={value=>change(key,value/100)} onCancel={cancelNumber} onCommit={value=>change(key,value/100)}/></label>;}))}</fieldset>}
  {error&&<p role="alert" className="text-xs text-amber-300">{error}</p>}
  <div className="flex justify-end gap-2"><button type="button" className="timeline-tool" onClick={onCancel}>{t('common.cancel')}</button><button type="button" className="timeline-tool" disabled={disabled||busy||!valid||!preview} onClick={()=>{if(preview)onUse(preview,a.time,{shape,controls});}}>{applyLabel??t('curveShape.use')}</button></div>
 </section>;
}
