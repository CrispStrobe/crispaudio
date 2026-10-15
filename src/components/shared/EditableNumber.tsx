import {NumberField} from '../timeline/NumberField';
/** A slider readout that also accepts an exact value, in the displayed unit. */
export function EditableNumber({value,label,min,max,step,unit,onChange,onBegin,onEnd,onPreview,onCancel,live=false,disabled=false}:{value:number;label:string;min:number;max:number;step:number;unit?:string;onChange:(value:number)=>void;disabled?:boolean;live?:boolean;onCancel?:()=>void;onBegin?:()=>void;onEnd?:()=>void;onPreview?:(value:number)=>void}){
 return <span className="editable-number inline-flex shrink-0 items-center gap-1 text-xs tabular-nums"><NumberField value={Number(value.toFixed(8))} label={label} min={min} max={max} step={step} disabled={disabled} onCancel={onCancel} onBegin={onBegin} onEnd={onEnd} onPreview={onPreview??(live?onChange:undefined)} width="w-[4.5rem] min-w-0 text-right font-mono text-xs" onCommit={next=>{onChange(next);return true;}}/>{unit&&<span className="text-gray-400">{unit}</span>}</span>;
}
