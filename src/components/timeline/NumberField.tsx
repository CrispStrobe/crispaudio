import { useRef, useState } from 'react';

/** Commit deliberate edits; focus/blur and Escape must not change media timing. */
export function NumberField({value,label,step,min=0,disabled=false,onCommit,onCancel}: {
  value:number; label:string; step:number; min?:number; disabled?:boolean;
  onCommit:(value:number)=>boolean;
  onCancel?:()=>void;
}) {
  const cancelled=useRef(false);
  const [draft,setDraft]=useState(''),[editing,setEditing]=useState(false),[invalid,setInvalid]=useState(false);
  const commit=()=>{
    if(cancelled.current){cancelled.current=false;return;}
    if(draft===String(value)){setEditing(false);setInvalid(false);return;}
    const number=draft.trim()?Number(draft):NaN;
    if(!Number.isFinite(number)||number<min||!onCommit(number)){setInvalid(true);return;}
    setEditing(false);setInvalid(false);
  };
  return <input type="number" min={min} step={step} disabled={disabled} aria-label={label} aria-invalid={invalid}
    className={`bg-gray-800 rounded p-2 w-32 border ${invalid?'border-red-400':'border-transparent'}`}
    value={editing?draft:value} onFocus={()=>{if(!invalid)setDraft(String(value));setEditing(true);}}
    onChange={event=>{setDraft(event.target.value);setInvalid(false);}} onBlur={commit}
    onKeyDown={event=>{
      event.stopPropagation();
      if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}
      if(event.key==='Escape'){event.preventDefault();cancelled.current=true;setEditing(false);setInvalid(false);event.currentTarget.blur();onCancel?.();}
    }}/>;
}
