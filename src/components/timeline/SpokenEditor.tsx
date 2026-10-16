import {NumberField} from './NumberField';
import {KeepSpeechEditor} from './KeepSpeechEditor';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, Play } from 'lucide-react';
import { useProjectStore } from '../../stores/projectStore';
import { deleteSpokenWord, spokenCutRange } from '../../lib/spokenEdits';
import {InfoButton} from '../common/InfoButton';
import { ToolButton } from '../common/ToolButton';

export function SpokenEditor(){
  const {t}=useTranslation(),project=useProjectStore(s=>s.project);
  const [error,setError]=useState(''),[selected,setSelected]=useState('');
  const words=project.transcript?.flatMap(c=>c.words??[])??[];
  const current=words.find(w=>w.id===selected);
  const remove=()=>{try{const next=deleteSpokenWord(project,selected);useProjectStore.setState({project:next,isPlaying:false,selection:null,playheadPosition:Math.min(current?.start??0,next.duration)});setSelected('');setError('');}catch(e){setError(t(e instanceof Error?e.message:String(e)));}};
  return <section className="space-y-2" aria-label={t('spoken.title')}>
    <div className="flex items-center justify-between"><strong>{t('spoken.title')}</strong><InfoButton label={t('spoken.title')}><p>{t('spoken.help')}</p></InfoButton></div>
    <div className="flex flex-wrap gap-1"><ToolButton icon={Play} label={t('spoken.seek')} disabled={!current} onClick={()=>{if(current){useProjectStore.getState().setIsPlaying(false);useProjectStore.getState().setPlayheadPosition(current.start);}}}/><ToolButton icon={Trash2} disabled={!current} label={t('spoken.delete')} onClick={remove}/></div>
    {current&&<div className="space-y-1 text-xs">
      <p>{t('spoken.cut')}: {spokenCutRange(project,current).start.toFixed(3)}–{spokenCutRange(project,current).end.toFixed(3)} s</p>
      {(['start','end'] as const).map(key=><label key={key} className="flex justify-between items-center">{t(`spoken.${key}`)}<NumberField width="w-28" step={.01} min={0} label={t(`spoken.${key}`)} value={current[key]} onCommit={value=>{if(key==='start'?value>=current.end:value<=current.start)return false;useProjectStore.setState({project:{...project,transcript:project.transcript?.map(c=>{if(!c.words?.some(w=>w.id===selected))return c;const words=c.words.map(w=>w.id===selected?{...w,[key]:value}:w);return {...c,words,start:Math.min(...words.map(w=>w.start)),end:Math.max(...words.map(w=>w.end))};})}});return true;}}/></label>)}
    </div>}
    {error&&<p role="alert" className="text-amber-300 break-words">{error}</p>}
    <KeepSpeechEditor/>
    {!!words.length&&<div tabIndex={0} role="group" aria-label={t('spoken.editor')} className="rounded bg-gray-950 p-2 leading-loose" onKeyDown={e=>{if((e.key==='Delete'||e.key==='Backspace')&&current){e.preventDefault();e.stopPropagation();remove();}}}>
      {words.map(w=><button key={w.id} className={`rounded px-1 min-h-11 ${selected===w.id?'bg-purple-600':'hover:bg-gray-700'}`} aria-pressed={selected===w.id} title={`${w.start.toFixed(3)}–${w.end.toFixed(3)} s`} onClick={()=>setSelected(w.id)}>{w.text.trim()}</button>)}
    </div>}
  </section>;
}
