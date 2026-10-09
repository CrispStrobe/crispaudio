import { MousePointer2, ScanLine, Play, X, Scissors } from 'lucide-react';
import { useState } from 'react';
import { RangeEditDialog } from './RangeEditDialog';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { ToolButton } from '../common/ToolButton';
import { TimeField } from './TimeField';

/** Range selection is independent of clip selection and the picture export interval. */
export function RangeControls() {
  const [tools,setTools]=useState(false);
  const { t } = useTranslation();
  const mode = useProjectStore(s=>s.selectionMode);
  const range = useProjectStore(s=>s.project.editRange);
  const setMode = useProjectStore(s=>s.setSelectionMode);
  const setRange = useProjectStore(s=>s.setEditRange);
  const playRange = useProjectStore(s=>s.playEditRange);
  const clear = useProjectStore(s=>s.clearEditRange);
  return <div className="flex items-center gap-1 min-w-0" title={t('ranges.rangeHelp')}>
    <ToolButton data-help="range" icon={mode==='range'?ScanLine:MousePointer2} label={t(mode==='range'?'ranges.clips':'ranges.mode')}
      aria-pressed={mode==='range'} onClick={()=>setMode(mode==='range'?'clips':'range')}/>
    {range && <>
      <TimeField label={t('ranges.start')} value={range.start} onCommit={start=>setRange(start,range.end)}/>
      <TimeField label={t('ranges.end')} value={range.end} onCommit={end=>setRange(range.start,end)}/>
      <ToolButton data-help="range" icon={Play} label={t('ranges.play')} onClick={playRange}/>
      <ToolButton data-help="range" icon={Scissors} label={t('rangeEdits.title')} onClick={()=>setTools(true)}/>
      <ToolButton data-help="range" icon={X} label={t('ranges.clear')} onClick={clear}/>
    </>}
    {tools&&<RangeEditDialog onClose={()=>setTools(false)}/>}
  </div>;
}
