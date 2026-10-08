import { useState, useRef } from 'react';
import { formatTimelineTime, parseTimelineTime } from '../../lib/timelineTime';
export function TimeField({value,label,onCommit}: {value:number;label:string;onCommit:(seconds:number)=>void}) {
  const cancelled=useRef(false);
  const [draft,setDraft]=useState(''),[editing,setEditing]=useState(false),[invalid,setInvalid]=useState(false);
  const commit=()=>{if(cancelled.current){cancelled.current=false;return;}const value=parseTimelineTime(draft);if(value===null){setInvalid(true);return;}setInvalid(false);setEditing(false);onCommit(value);};
  return <input aria-label={label} aria-invalid={invalid} title={label} inputMode="decimal" className="font-mono text-sm text-white bg-gray-800 border border-gray-700 rounded px-2 py-1 w-28 text-center tabular-nums"
    value={editing?draft:formatTimelineTime(value)} onFocus={()=>{setDraft(formatTimelineTime(value));setEditing(true);}} onChange={e=>{setDraft(e.target.value);setInvalid(false);}}
    onBlur={commit} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}if(e.key==='Escape'){cancelled.current=true;setEditing(false);setInvalid(false);e.currentTarget.blur();}}}/>;
}
