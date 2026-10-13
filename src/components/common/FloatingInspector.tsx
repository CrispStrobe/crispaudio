import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {GripHorizontal,ChevronDown,ChevronUp,X} from 'lucide-react';
import {useTranslation} from 'react-i18next';

/** Modeless, movable controls keep the arrangement visible and interactive. */
export function FloatingInspector({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 const {t}=useTranslation(),id=useId(),panel=useRef<HTMLDivElement>(null),[collapsed,setCollapsed]=useState(false),[position,setPosition]=useState<{x:number;y:number}|null>(null),drag=useRef<{x:number;y:number;left:number;top:number}|null>(null);
 const closeRef=useRef(onClose);
 useEffect(()=>{closeRef.current=onClose;},[onClose]);
 const clamp=(x:number,y:number)=>({x:Math.max(8,Math.min(innerWidth-(panel.current?.offsetWidth??360)-8,x)),y:Math.max(8,Math.min(innerHeight-260,y))});
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  panel.current?.querySelector<HTMLButtonElement>('button[data-inspector-close]')?.focus({preventScroll:true});
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&Array.from(document.querySelectorAll('[role=dialog]')).at(-1)===panel.current){e.preventDefault();closeRef.current();}};
  const stopDrag=()=>{drag.current=null;};
  const resize=()=>setPosition(p=>p?{x:Math.max(8,Math.min(innerWidth-(panel.current?.offsetWidth??360)-8,p.x)),y:Math.max(8,Math.min(innerHeight-260,p.y))}:null);
  document.addEventListener('keydown',key);window.addEventListener('resize',resize);window.addEventListener('blur',stopDrag);window.dispatchEvent(new Event('crispaudio-menu-state'));
  return()=>{document.removeEventListener('keydown',key);window.removeEventListener('resize',resize);window.removeEventListener('blur',stopDrag);window.dispatchEvent(new Event('crispaudio-menu-state'));if(previous?.isConnected)previous.focus({preventScroll:true});};
 },[]);
 return createPortal(<div ref={panel} role="dialog" aria-modal="false" aria-labelledby={id} data-floating-inspector className="floating-inspector fixed z-40 rounded-xl border border-indigo-400 bg-gray-900 shadow-2xl text-gray-200" style={position?{left:position.x,top:position.y,right:'auto',bottom:'auto'}:undefined}>
  <header className="flex items-center gap-1 px-2 border-b border-gray-700 min-h-11">
   <button type="button" aria-label={t('workspace.movePanel')} className="shrink-0 min-w-11 min-h-11 grid place-items-center cursor-move touch-none" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);const r=panel.current!.getBoundingClientRect();drag.current={x:e.clientX,y:e.clientY,left:r.left,top:r.top};}} onPointerMove={e=>{const d=drag.current;if(d)setPosition(clamp(d.left+e.clientX-d.x,d.top+e.clientY-d.y));}} onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const r=panel.current!.getBoundingClientRect();setPosition(clamp(r.left+(e.key==='ArrowLeft'?-20:e.key==='ArrowRight'?20:0),r.top+(e.key==='ArrowUp'?-20:e.key==='ArrowDown'?20:0)));}}}><GripHorizontal size={16}/></button>
   <h2 id={id} className="flex-1 text-sm font-semibold truncate">{title}</h2>
   <button type="button" className="min-w-11 min-h-11 grid place-items-center" aria-label={t(collapsed?'workspace.expandPanel':'workspace.collapsePanel')} aria-expanded={!collapsed} onClick={()=>setCollapsed(v=>!v)}>{collapsed?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>
   <button type="button" data-inspector-close className="min-w-11 min-h-11 grid place-items-center" aria-label={t('timeline.closePanel')} onClick={onClose}><X size={16}/></button>
  </header>
  <div hidden={collapsed} data-floating-inspector-body className="overflow-y-auto p-3" style={{maxHeight:position?`min(var(--inspector-body-height, 65dvh), ${Math.max(80,innerHeight-position.y-64)}px)` :undefined}}>{children}</div>
 </div>,document.body);
}
