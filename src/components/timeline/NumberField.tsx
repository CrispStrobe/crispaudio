import {useEffect,useRef,useState,type Ref} from 'react';
import {scrubNumber} from '../../lib/numberScrub';

/** Tap to type; touch/pen drags preview, then commit once on release. */
export function NumberField({value,label,step,scrubStep=step,min=0,max=Infinity,disabled=false,onCommit,onCancel,onBegin,onEnd,onPreview,onDraftChange,inputRef,onEnter,width='w-32'}:{
 value:number;label:string;step:number;scrubStep?:number;min?:number;max?:number;disabled?:boolean;
 onCommit:(value:number)=>boolean;onDraftChange?:(value:string)=>void;inputRef?:Ref<HTMLInputElement>;
 onEnter?:(value:number)=>void;onCancel?:()=>void;onBegin?:()=>void;onEnd?:()=>void;onPreview?:(value:number)=>void;width?:string;
}){
 const initial=useRef(value),cancelled=useRef(false),accepted=useRef(true),active=useRef(false);
 const drag=useRef<{id:number;y:number;value:number;next:number;moved:boolean}|null>(null);
 const latest=useRef({onEnd,onCancel,onPreview,onDraftChange});
 const [draft,setDraft]=useState(''),[editing,setEditing]=useState(false),[invalid,setInvalid]=useState(false);
 useEffect(()=>{latest.current={onEnd,onCancel,onPreview,onDraftChange};},[onEnd,onCancel,onPreview,onDraftChange]);
 useEffect(()=>()=>{if(active.current){active.current=false;latest.current.onEnd?.();}},[]);
 const begin=()=>{if(!active.current){active.current=true;onBegin?.();}};
 const end=()=>{if(active.current){active.current=false;onEnd?.();}};
 const commit=()=>{
  if(cancelled.current){cancelled.current=false;return false;}
  if(draft===String(value)){setEditing(false);setInvalid(false);return true;}
  const number=draft.trim()?Number(draft):NaN;
  if(!Number.isFinite(number)||number<min||number>max||!onCommit(number)){setInvalid(true);return false;}
  setEditing(false);setInvalid(false);return true;
 };
 const cancel=()=>{drag.current=null;setEditing(false);setInvalid(false);onDraftChange?.(String(initial.current));onPreview?.(initial.current);end();onCancel?.();};
 return <input ref={inputRef} type="number" min={Number.isFinite(min)?min:undefined} max={Number.isFinite(max)?max:undefined} step={step} disabled={disabled} aria-label={label} aria-invalid={invalid}
  className={`number-field bg-gray-800 rounded p-2 ${width} border ${invalid?'border-red-400':'border-transparent'}`}
  style={{touchAction:editing?'auto':'none'}} value={editing?draft:value}
  onFocus={()=>{initial.current=value;if(!invalid)setDraft(String(value));setEditing(true);begin();}}
  onChange={e=>{setDraft(e.target.value);setInvalid(false);onDraftChange?.(e.target.value);const next=e.target.valueAsNumber;if(Number.isFinite(next)&&next>=min&&next<=max)onPreview?.(next);}}
  onBlur={()=>{accepted.current=commit();end();}}
  onPointerDown={e=>{if(disabled||editing||!['touch','pen'].includes(e.pointerType))return;initial.current=value;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,y:e.clientY,value,next:value,moved:false};}}
  onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;const distance=d.y-e.clientY;if(!d.moved&&Math.abs(distance)<8)return;if(!d.moved)begin();d.moved=true;d.next=scrubNumber(d.value,distance,scrubStep,min,max);setDraft(String(d.next));onDraftChange?.(String(d.next));setEditing(true);setInvalid(false);onPreview?.(d.next);}}
  onPointerUp={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;drag.current=null;if(!d.moved){e.currentTarget.focus();return;}if(d.next!==value&&!onCommit(d.next)){setInvalid(true);end();return;}setEditing(false);setInvalid(false);end();}}
  onPointerCancel={()=>{if(drag.current)cancel();}} onLostPointerCapture={()=>{if(drag.current)cancel();}}
  onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();const next=e.currentTarget.value.trim()?Number(e.currentTarget.value):NaN;e.currentTarget.blur();if(accepted.current&&Number.isFinite(next)&&next>=min&&next<=max)onEnter?.(next);}if(e.key==='Escape'){e.preventDefault();cancelled.current=true;cancel();e.currentTarget.blur();}}}/>;
}
