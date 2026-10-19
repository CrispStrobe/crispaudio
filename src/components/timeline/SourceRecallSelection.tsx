import {useTranslation} from 'react-i18next';
import {Plus,Trash2} from 'lucide-react';
import type {SourcePluginRecallPlan,SourcePluginRecallSelection} from '../../lib/sourcePluginRecall';
import {sourcePluginRecallSelection} from '../../lib/sourcePluginRecall';
import {NumberField} from './NumberField';
import {InfoButton} from '../common/InfoButton';
import {ToolButton} from '../common/ToolButton';

/** Exact full-source sample coordinates, including ranges outside a trimmed clip. */
export function SourceRecallSelection({plan,value,disabled,onChange,onDraft}:{plan:SourcePluginRecallPlan;value:SourcePluginRecallSelection;disabled:boolean;onChange:(value:SourcePluginRecallSelection)=>void;onDraft:()=>void}){
 const {t}=useTranslation();
 const commit=(next:SourcePluginRecallSelection)=>{try{onChange(sourcePluginRecallSelection(plan,next));return true;}catch{return false;}};
 const same=(ranges:SourcePluginRecallSelection['ranges'])=>JSON.stringify(value.ranges)===JSON.stringify(ranges);
 const preset=same(sourcePluginRecallSelection(plan,plan.operation).ranges)?'saved':same([plan.visible])?'clip':same([{start:0,end:plan.frames}])?'all':'custom';
 let cursor=0,gap:{start:number;end:number}|undefined;
 for(const range of [...value.ranges,{start:plan.frames,end:plan.frames}]){if(range.start-cursor>=3){gap={start:cursor,end:range.start};break;}cursor=range.end;}
 const added=gap?{start:gap.start+Math.max(1,Math.floor((gap.end-gap.start)/4)),end:gap.end-Math.max(1,Math.floor((gap.end-gap.start)/4))}:undefined;
 return <details><summary className="min-h-11 content-center cursor-pointer">{t('sourceRecall.selection')}</summary><fieldset disabled={disabled} className="space-y-2">
  <div className="flex flex-wrap gap-2 items-center"><select className="timeline-tool min-w-0 max-w-full" aria-label={t('sourceEditor.channel')} value={value.channel} onChange={e=>commit({...value,channel:Number(e.target.value)})}><option value={-1}>{t('sourceEditor.allChannels')}</option>{plan.input.channels.map((_,ch)=><option key={ch} value={ch}>{t('sourceEditor.channelNumber',{number:ch+1})}</option>)}</select>
   <select className="timeline-tool min-w-0 max-w-full" aria-label={t('sourceRecall.ranges')} value={preset} onChange={e=>commit({...value,ranges:e.target.value==='saved'?plan.operation.ranges:e.target.value==='clip'?[plan.visible]:[{start:0,end:plan.frames}]})}><option value="saved">{t('sourceRecall.saved')}</option><option value="clip">{t('sourceRecall.clip')}</option><option value="all">{t('sourceRecall.full')}</option><option value="custom" disabled>{t('sourceRecall.custom')}</option></select>
   <InfoButton label={t('sourceRecall.selection')}>{t('sourceRecall.selectionHelp')}</InfoButton>
  </div>
  {value.ranges.map((range,index)=><div key={index} className="flex flex-wrap gap-2 items-center" role="group" aria-label={t('sourceRecall.rangeNumber',{number:index+1})}>
   <NumberField value={range.start} label={t('sourceRecall.start',{number:index+1})} min={0} max={range.end-1} step={1} width="w-28" onDraftChange={onDraft} onCommit={start=>commit({...value,ranges:value.ranges.map((r,i)=>i===index?{...r,start}:r)})}/>
   <NumberField value={range.end} label={t('sourceRecall.end',{number:index+1})} min={range.start+1} max={plan.frames} step={1} width="w-28" onDraftChange={onDraft} onCommit={end=>commit({...value,ranges:value.ranges.map((r,i)=>i===index?{...r,end}:r)})}/>
   <ToolButton icon={Trash2} label={t('sourceRecall.remove',{number:index+1})} disabled={value.ranges.length===1} onClick={()=>commit({...value,ranges:value.ranges.filter((_,i)=>i!==index)})}/>
  </div>)}
  <ToolButton icon={Plus} label={t('sourceRecall.add')} disabled={value.ranges.length>=64||!added} onClick={()=>{if(added)commit({...value,ranges:[...value.ranges,added]});}}/>
 </fieldset></details>;
}
