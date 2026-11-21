import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useProjectStore} from '../../stores/projectStore';
import {decodedPcmBytes,sessionMemoryBudget,stereoMinutes} from '../../lib/sessionMemory';
import {InfoButton} from '../common/InfoButton';

/** Non-blocking warning when the open session's decoded audio exceeds the device budget. */
export function SessionMemoryNotice(){
  const {t}=useTranslation();
  const bytes=useProjectStore(s=>decodedPcmBytes(s.sources.values()));
  const [dismissedAt,setDismissedAt]=useState(0);
  const budget=sessionMemoryBudget();
  // A dismissed warning returns only after the session grows by another quarter.
  if(bytes<=budget||bytes<=dismissedAt*1.25)return null;
  const gb=(bytes/1024**3).toFixed(1);
  return <div role="status" className="flex items-start gap-2 text-xs text-amber-200 px-3 py-2 bg-amber-950/40 border-b border-amber-900/60">
    <p className="flex-1">{t('sessionMemory.warning',{gb,minutes:Math.round(stereoMinutes(bytes))})}</p>
    <InfoButton label={t('sessionMemory.title')}><p>{t('sessionMemory.help',{budget:(budget/1024**3).toFixed(0)})}</p></InfoButton>
    <button className="timeline-tool min-h-11" onClick={()=>setDismissedAt(bytes)}>{t('sessionMemory.dismiss')}</button>
  </div>;
}
