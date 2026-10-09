import {KeepSpeechEditor} from './KeepSpeechEditor';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { Mic, Trash2, Play } from 'lucide-react';
import { useProjectStore } from '../../stores/projectStore';
import { linkedRenderDocument } from '../../lib/projectFile';
import { mediaJob } from '../../lib/mediaJob';
import { parseTranscript } from '../../lib/transcript';
import { deleteSpokenWord, spokenCutRange, speechLayout } from '../../lib/spokenEdits';
import { ToolButton } from '../common/ToolButton';
import { isIOSApp } from '../../lib/native';

interface Settings {executable:string;model:string;aligner:string;language:string}
const defaults:Settings={executable:'',model:'',aligner:'auto',language:'de'};
export function SpokenEditor(){
  const {t}=useTranslation(),project=useProjectStore(s=>s.project);
  const [settings,setSettings]=useState<Settings>(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem('crispaudio-asr')??'{}')};}catch{return defaults;}});
  const [track,setTrack]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState('');
  const abort=useRef<AbortController|null>(null);
  useEffect(()=>()=>abort.current?.abort(),[]);
  const native='__TAURI_INTERNALS__' in window&&!isIOSApp();
  useEffect(()=>{let active=true;if(native&&!localStorage.getItem('crispaudio-asr'))void import('@tauri-apps/api/core').then(({invoke})=>invoke<Settings>('crispasr_defaults')).then(found=>{if(active&&!localStorage.getItem('crispaudio-asr'))setSettings(found);}).catch(()=>{});return()=>{active=false;};},[native]);
  const configure=(key:keyof Settings,value:string)=>{const next={...settings,[key]:value};setSettings(next);localStorage.setItem('crispaudio-asr',JSON.stringify(next));};
  const words=project.transcript?.flatMap(c=>c.words??[])??[];
  const current=words.find(w=>w.id===selected);
  const remove=()=>{try{const next=deleteSpokenWord(project,selected);useProjectStore.setState({project:next,isPlaying:false,selection:null,playheadPosition:Math.min(current?.start??0,next.duration)});setSelected('');setError('');}catch(e){setError(t(e instanceof Error?e.message:String(e)));}};
  const transcribe=async()=>{
    const state=useProjectStore.getState(),snapshot=state.project,controller=new AbortController();abort.current?.abort();abort.current=controller;setBusy(true);setError('');
    try{
      const chosen=track?{...snapshot,tracks:snapshot.tracks.filter(t=>t.id===track).map(t=>({...t,muted:false,solo:false}))}:snapshot;
      if(!chosen.tracks.length)throw new Error('spoken.noTrack');
      const doc=linkedRenderDocument(chosen,state.sources);if(!doc)throw new Error('workspace.linkedOnly');
      const result=await mediaJob<{crispaudioOffset:number}>('transcribe_project',{document:doc,options:settings},controller.signal);
      controller.signal.throwIfAborted();if(useProjectStore.getState().project!==snapshot)throw new Error('sync.changed');
      const cues=parseTranscript(JSON.stringify(result));
      if(!cues.every(c=>c.words?.length))throw new Error('spoken.untimed');
      useProjectStore.setState({project:{...snapshot,transcript:cues,transcriptLayout:speechLayout(snapshot)},isPlaying:false});setSelected('');
    }catch(e){if(!controller.signal.aborted)setError(t(e instanceof Error?e.message:String(e)));}
    finally{if(abort.current===controller){abort.current=null;setBusy(false);}}
  };
  return <section className="space-y-2" aria-label={t('spoken.title')}>
    <p className="text-xs text-gray-400">{t('spoken.help')}</p>
    <details><summary className="cursor-pointer py-2">{t('spoken.settings')}</summary>
      {(['executable','model','aligner'] as const).map(key=><label className="block space-y-1" key={key}>{t(`spoken.${key}`)}<div className="flex gap-1"><input className="min-w-0 w-full bg-gray-800 rounded p-2" aria-label={t(`spoken.${key}`)} value={settings[key]} onChange={e=>configure(key,e.target.value)}/><button className="timeline-tool" disabled={!native||busy} onClick={()=>void open({multiple:false}).then(path=>{if(typeof path==='string')configure(key,path);})}>…</button></div></label>)}
      <label className="block">{t('spoken.language')}<input className="bg-gray-800 rounded p-2 w-20 mx-2" value={settings.language} onChange={e=>configure('language',e.target.value)}/></label>
      <p className="text-xs text-gray-400">{t('spoken.setupHelp')}</p>
    </details>
    <select className="w-full bg-gray-800 rounded p-2" aria-label={t('spoken.input')} value={track} onChange={e=>setTrack(e.target.value)}><option value="">{t('spoken.mix')}</option>{project.tracks.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
    <div className="flex flex-wrap gap-1"><ToolButton icon={Mic} disabled={!native||busy||!project.tracks.length} label={t('spoken.transcribe')} onClick={()=>void transcribe()}/>{busy&&<button className="timeline-tool" onClick={()=>abort.current?.abort()}>{t('common.cancel')}</button>}<ToolButton icon={Play} label={t('spoken.seek')} disabled={!current} onClick={()=>{if(current){useProjectStore.getState().setIsPlaying(false);useProjectStore.getState().setPlayheadPosition(current.start);}}}/><ToolButton icon={Trash2} disabled={!current||busy} label={t('spoken.delete')} onClick={remove}/></div>
    {current&&<div className="space-y-1 text-xs">
      <p>{t('spoken.cut')}: {spokenCutRange(project,current).start.toFixed(3)}–{spokenCutRange(project,current).end.toFixed(3)} s</p>
      {(['start','end'] as const).map(key=><label key={key} className="flex justify-between items-center">{t(`spoken.${key}`)}<input className="bg-gray-800 rounded p-2 w-28" type="number" step={.01} min={0} aria-label={t(`spoken.${key}`)} value={current[key]} onChange={e=>{const value=Number(e.target.value);if(!Number.isFinite(value)||value<0||(key==='start'?value>=current.end:value<=current.start))return;useProjectStore.setState({project:{...project,transcript:project.transcript?.map(c=>{if(!c.words?.some(w=>w.id===selected))return c;const words=c.words.map(w=>w.id===selected?{...w,[key]:value}:w);return {...c,words,start:Math.min(...words.map(w=>w.start)),end:Math.max(...words.map(w=>w.end))};})}});}}/></label>)}
    </div>}
    {busy&&<p role="status">{t('spoken.working')}</p>}{!native&&<p className="text-xs">{t('spoken.desktop')}</p>}{error&&<p role="alert" className="text-amber-300 break-words">{error}</p>}
    <KeepSpeechEditor disabled={busy}/>
    {!!words.length&&<div tabIndex={0} role="group" aria-label={t('spoken.editor')} className="rounded bg-gray-950 p-2 leading-loose" onKeyDown={e=>{if((e.key==='Delete'||e.key==='Backspace')&&current){e.preventDefault();e.stopPropagation();remove();}}}>
      {words.map(w=><button key={w.id} className={`rounded px-1 min-h-11 ${selected===w.id?'bg-purple-600':'hover:bg-gray-700'}`} aria-pressed={selected===w.id} title={`${w.start.toFixed(3)}–${w.end.toFixed(3)} s`} onClick={()=>setSelected(w.id)}>{w.text.trim()}</button>)}
    </div>}
  </section>;
}
