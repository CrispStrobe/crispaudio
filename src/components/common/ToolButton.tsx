import { useRef, useState, useEffect, type ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
/** Hover/focus labels and a non-activating long press on touch. */
export function ToolButton({label,icon:Icon,className='',onClick,...props}:Omit<ButtonHTMLAttributes<HTMLButtonElement>,'children'> & {label:string;icon:LucideIcon}) {
  const [tip,setTip]=useState(false), timer=useRef<ReturnType<typeof setTimeout>|null>(null),held=useRef(false),origin=useRef({x:0,y:0});
  const clear=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;};
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  return <button {...props} type="button" aria-label={label} title={label} className={`timeline-tool icon-tool ${className}`}
    onPointerDown={e=>{origin.current={x:e.clientX,y:e.clientY};held.current=false;if(e.pointerType==='touch'){clear();timer.current=setTimeout(()=>{held.current=true;setTip(true);},500);}}}
    onPointerMove={e=>{if(Math.hypot(e.clientX-origin.current.x,e.clientY-origin.current.y)>8){clear();setTip(false);}}}
    onPointerUp={clear} onPointerCancel={()=>{clear();setTip(false);}} onPointerLeave={()=>{clear();setTip(false);}} onBlur={()=>setTip(false)}
    onClick={e=>{if(held.current){e.preventDefault();held.current=false;return;}setTip(false);onClick?.(e);}}>
    <Icon size={18} aria-hidden="true"/><span role="tooltip" className={tip?'tool-label tool-label-touch':'tool-label'}>{label}</span>
  </button>;
}
