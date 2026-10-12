import {useStore} from 'zustand';
import {timelineCommands,commandEnabled} from '../../lib/timelineCommands';
import {useTimelineToolAvailability} from '../../hooks/useTimelineTool';
import {useEffect,useState,useRef} from 'react';
import {flushSync} from 'react-dom';
import {Search} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import {Modal} from '../common/Modal';
import {ToolButton} from '../common/ToolButton';
import {dispatchNativeMenu,isNativeMac,menuBlocked,nativeMenuContext,textEditing} from '../../lib/nativeMenu';
import {useProjectStore} from '../../stores/projectStore';
const commands=Object.values(timelineCommands).flat();
export function CommandSearch(){
 const {t}=useTranslation(),[open,setOpen]=useState(false),[query,setQuery]=useState(''),input=useRef<HTMLInputElement>(null);
 useProjectStore(s=>s.project);useProjectStore(s=>s.selection);useProjectStore(s=>s.clipboard);
 useEffect(()=>{const show=()=>{setQuery('');setOpen(true);};const key=(e:KeyboardEvent)=>{if(!isNativeMac()&&(e.ctrlKey||e.metaKey)&&e.code==='KeyK'&&!textEditing()&&!menuBlocked()){e.preventDefault();show();}};window.addEventListener('crispaudio-commands',show);document.addEventListener('keydown',key);return()=>{window.removeEventListener('crispaudio-commands',show);document.removeEventListener('keydown',key);};},[]);
 useEffect(()=>{if(open){const id=setTimeout(()=>input.current?.focus(),80);return()=>clearTimeout(id);}},[open]);
 useTimelineToolAvailability();
 useStore(useProjectStore.temporal,s=>s.pastStates);useStore(useProjectStore.temporal,s=>s.futureStates);
 const context=nativeMenuContext();
 const results=commands.filter(command=>t(`nativeMenu.${command.label}`,command.label).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const run=(action:string)=>{flushSync(()=>setOpen(false));dispatchNativeMenu(action);};
 return <><ToolButton icon={Search} label={t('commandSearch.title')} onClick={()=>{setQuery('');setOpen(true);}}/><Modal isOpen={open} onClose={()=>setOpen(false)} title={t('commandSearch.title')} widthClass="max-w-xl"><div className="space-y-2">
 <input ref={input} className="w-full bg-gray-800 text-gray-100 rounded p-3" aria-label={t('commandSearch.search')} placeholder={t('commandSearch.search')} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){const first=results.find(command=>commandEnabled(command,context));if(first){e.preventDefault();run(first.id);}}}}/>
 <div className="max-h-[50dvh] overflow-y-auto space-y-1">{results.map(command=><button key={command.id} aria-label={t(`nativeMenu.${command.label}`,command.label)} disabled={!commandEnabled(command,context)} className="timeline-tool w-full flex justify-between gap-2 text-left disabled:opacity-30" onClick={()=>run(command.id)}><span>{t(`nativeMenu.${command.label}`,command.label)}</span><kbd className="text-xs text-gray-400">{command.key}</kbd></button>)}{!results.length&&<p>{t('commandSearch.empty')}</p>}</div>
 </div></Modal></>;
}
