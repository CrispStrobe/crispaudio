import { useRef, useState, type Ref } from 'react';

/** Tap to type; touch/pen vertical drags preview a value and commit once on release. */
export function NumberField({value,label,step,min=0,max=Infinity,disabled=false,onCommit,onCancel,onBegin,onEnd,onPreview,onDraftChange,inputRef,onEnter,width='w-32'}: {
  value:number; label:string; step:number; min?:number; max?:number; disabled?:boolean;
  onCommit:(value:number)=>boolean;
  onDraftChange?:(value:string)=>void; inputRef?:Ref<HTMLInputElement>; onEnter?:(value:number)=>void; onCancel?:()=>void; onBegin?:()=>void; onEnd?:()=>void; onPreview?:(value:number)=>void; width?:string;
}) {
  const initial=useRef(value),cancelled=useRef(false),drag=useRef<{id:number;y:number;value:number;next:number;moved:boolean}|null>(null);
  const [draft,setDraft]=useState(''),[editing,setEditing]=useState(false),[invalid,setInvalid]=useState(false);
  const commit=()=>{
    if(cancelled.current){cancelled.current=false;return;}
    if(draft===String(value)){setEditing(false);setInvalid(false);return;}
    const number=draft.trim()?Number(draft):NaN;
    if(!Number.isFinite(number)||number<min||number>max||!onCommit(number)){setInvalid(true);return;}
    setEditing(false);setInvalid(false);
  };
  return <input ref={inputRef} type="number" min={Number.isFinite(min)?min:undefined} max={Number.isFinite(max)?max:undefined} step={step} disabled={disabled} aria-label={label} aria-invalid={invalid}
    className={`number-field bg-gray-800 rounded p-2 ${width} border ${invalid?'border-red-400':'border-transparent'}`}
    style={{touchAction:editing?'auto':'none'}}
    value={editing?draft:value} onFocus={()=>{initial.current=value;if(!invalid)setDraft(String(value));setEditing(true);onBegin?.();}}
    onChange={event=>{setDraft(event.target.value);setInvalid(false);onDraftChange?.(event.target.value);const next=event.target.valueAsNumber;if(Number.isFinite(next)&&next>=min&&next<=max)onPreview?.(next);}} onBlur={()=>{commit();onEnd?.();}}
    onPointerDown={event=>{
      if(disabled||editing||!['touch','pen'].includes(event.pointerType))return;
      initial.current=value;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
      drag.current={id:event.pointerId,y:event.clientY,value,next:value,moved:false};
    }}
    onPointerMove={event=>{
      const active=drag.current;if(!active||active.id!==event.pointerId)return;
      const distance=active.y-event.clientY;if(!active.moved&&Math.abs(distance)<8)return;
      if(!active.moved)onBegin?.();
      active.moved=true;active.next=Math.min(max,Math.max(min,Number((active.value+Math.trunc(distance/8)*step).toFixed(12))));
      setDraft(String(active.next));onDraftChange?.(String(active.next));setEditing(true);setInvalid(false);onPreview?.(active.next);
    }}
    onPointerUp={event=>{
      const active=drag.current;if(!active||active.id!==event.pointerId)return;drag.current=null;
      if(!active.moved){event.currentTarget.focus();return;}
      if(active.next!==value&&!onCommit(active.next)){setInvalid(true);onEnd?.();return;}
      setEditing(false);setInvalid(false);onEnd?.();
    }}
    onPointerCancel={()=>{if(drag.current){drag.current=null;setEditing(false);setInvalid(false);onDraftChange?.(String(initial.current));onPreview?.(initial.current);onEnd?.();onCancel?.();}}}
    onLostPointerCapture={()=>{if(drag.current){drag.current=null;setEditing(false);setInvalid(false);onDraftChange?.(String(initial.current));onPreview?.(initial.current);onEnd?.();onCancel?.();}}}
    onKeyDown={event=>{
      event.stopPropagation();
      if(event.key==='Enter'){event.preventDefault();const next=event.currentTarget.value.trim()?Number(event.currentTarget.value):NaN;event.currentTarget.blur();if(Number.isFinite(next)&&next>=min&&next<=max)onEnter?.(next);}
      if(event.key==='Escape'){event.preventDefault();cancelled.current=true;drag.current=null;setEditing(false);setInvalid(false);onDraftChange?.(String(initial.current));onPreview?.(initial.current);event.currentTarget.blur();onCancel?.();}
    }}/>;
}
