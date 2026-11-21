import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Bug,ClipboardCopy,Save} from 'lucide-react';
import {diagnosticsReport,feedbackUrl,type ReportContext} from '../../lib/diagnostics';
import {decodedPcmBytes} from '../../lib/sessionMemory';
import {openExternal} from '../../lib/openExternal';
import {saveText} from '../../lib/transcript';
import {useProjectStore} from '../../stores/projectStore';
import {InfoButton} from './InfoButton';

function context():ReportContext{
  const {project,sources}=useProjectStore.getState();
  return {tracks:project.tracks.length,clips:project.tracks.reduce((n,track)=>n+track.segments.length,0),decodedMiB:Math.round(decodedPcmBytes(sources.values())/1048576)};
}

/** User-initiated feedback: nothing leaves the device unless the user sends it. */
export function FeedbackActions(){
  const {t}=useTranslation(),[status,setStatus]=useState('');
  const copy=async()=>{try{await navigator.clipboard.writeText(diagnosticsReport(context()));setStatus(t('feedback.copied'));}catch{setStatus(t('feedback.copyFailed'));}};
  const link='flex items-center gap-1 text-xs hover:underline min-h-11';
  return <div className="mt-3">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={link} style={{color:'var(--accent)'}} onClick={()=>openExternal(feedbackUrl(diagnosticsReport(context())))}><Bug size={12}/> {t('feedback.send')}</button>
      <button type="button" className={link} style={{color:'var(--accent)'}} onClick={()=>void copy()}><ClipboardCopy size={12}/> {t('feedback.copy')}</button>
      <button type="button" className={link} style={{color:'var(--accent)'}} onClick={()=>void saveText(diagnosticsReport(context()),'crispaudio-diagnostics','txt').catch(e=>setStatus(String(e)))}><Save size={12}/> {t('feedback.save')}</button>
      <InfoButton label={t('feedback.send')}><p>{t('feedback.help')}</p></InfoButton>
    </div>
    {status&&<p role="status" className="text-xs mt-1" style={{color:'var(--text-muted)'}}>{status}</p>}
  </div>;
}
