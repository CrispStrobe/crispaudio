import {useEffect,useRef} from 'react';
import {useTranslation} from 'react-i18next';
import type {AutomationShapeControls} from '../../lib/automationShape';

/** Handle edits only change review state; cancellation restores the drag draft. */
export function AutomationShapeChart({points,descending,flat=false,controls,onChange,disabled=false,onBusy}:{points:{x:number;y:number}[];descending:boolean;flat?:boolean;controls?:AutomationShapeControls;onChange:(c:AutomationShapeControls)=>void;disabled?:boolean;onBusy?:(busy:boolean)=>void}) {
 const {t}=useTranslation(),svg=useRef<SVGSVGElement>(null),drag=useRef<{id:number;index:1|2;before:AutomationShapeControls}|null>(null);
 const latest=useRef({onChange,onBusy});
 useEffect(()=>{latest.current={onChange,onBusy};},[onChange,onBusy]);
 useEffect(()=>{
  const cancel=()=>{const active=drag.current;if(!active)return;drag.current=null;latest.current.onChange(active.before);latest.current.onBusy?.(false);};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&drag.current){e.preventDefault();e.stopImmediatePropagation();cancel();}},hidden=()=>{if(document.hidden)cancel();};
  window.addEventListener('blur',cancel);window.addEventListener('keydown',key,true);document.addEventListener('visibilitychange',hidden);
  return()=>{window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key,true);document.removeEventListener('visibilitychange',hidden);if(drag.current){drag.current=null;latest.current.onBusy?.(false);}};
 },[]);
 const cancel=()=>{const active=drag.current;if(!active)return;drag.current=null;onChange(active.before);onBusy?.(false);};
 const x=(p:number)=>12+p*296,y=(p:number)=>128-p*112;
 const progressY=(p:number)=>y(flat?0:descending?1-p:p);
 const update=(index:1|2,px:number,py:number)=>{
  if(!controls||disabled)return;
  const value={...controls,[`x${index}`]:Math.max(index===1?0:controls.x1,Math.min(index===1?controls.x2:1,px)),[`y${index}`]:Math.max(0,Math.min(1,py))};onChange(value);
 };
 const move=(e:React.PointerEvent<SVGSVGElement>)=>{
  if(disabled){cancel();return;}if(!drag.current||e.pointerId!==drag.current.id)return;
  const matrix=svg.current?.getScreenCTM();if(!matrix)return;
  const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse()),py=(128-p.y)/112;
  update(drag.current.index,(p.x-12)/296,descending?1-py:py);
 };
 return <svg ref={svg} role={controls?'group':'img'} aria-label={t('automation.shapePreview')} aria-disabled={disabled} viewBox="0 0 320 144" className="w-full h-36 overflow-visible bg-gray-950 rounded" style={{touchAction:controls?'none':undefined}}
  onPointerMove={move} onPointerUp={e=>{if(drag.current?.id===e.pointerId){if(disabled){cancel();return;}drag.current=null;onBusy?.(false);e.currentTarget.releasePointerCapture(e.pointerId);}}}
  onPointerCancel={cancel} onLostPointerCapture={cancel}
  onKeyDown={e=>{if(e.key!=='Tab'&&e.key!=='Escape')e.stopPropagation();}}>
  <path d={points.map((p,i)=>`${i?'L':'M'}${x(p.x)},${y(p.y)}`).join(' ')} stroke="#fbbf24" strokeWidth={2} fill="none"/>
  {points.map(p=><circle data-shape-point key={p.x} cx={x(p.x)} cy={y(p.y)} r={3} fill="#fbbf24"/>)}
  {controls&&<>
   <path d={`M12,${progressY(0)} L${x(controls.x1)},${progressY(controls.y1)} M308,${progressY(1)} L${x(controls.x2)},${progressY(controls.y2)}`} stroke="#818cf8" fill="none"/>
   {([1,2] as const).map(index=><g key={index} role="button" tabIndex={disabled?-1:0} aria-disabled={disabled} aria-label={t('automation.shapeHandle',{index})} transform={`translate(${x(controls[`x${index}`])},${progressY(controls[`y${index}`])})`} className="cursor-move focus:outline-none focus-visible:stroke-white"
    onPointerDown={e=>{if(disabled||e.button!==0||drag.current)return;e.preventDefault();e.stopPropagation();drag.current={id:e.pointerId,index,before:{...controls}};svg.current?.setPointerCapture(e.pointerId);onBusy?.(true);e.currentTarget.focus();}}
    onKeyDown={e=>{if(disabled)return;const step=e.shiftKey?.1:.01,px=controls[`x${index}`],py=controls[`y${index}`];if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();update(index,px+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),py+(e.key==='ArrowUp'?(descending?-step:step):e.key==='ArrowDown'?(descending?step:-step):0));}}}>
    <circle r={26} fill="transparent"/><circle r={6} fill="#818cf8" stroke="white" strokeWidth={1}/>
   </g>)}
  </>}
 </svg>;
}
