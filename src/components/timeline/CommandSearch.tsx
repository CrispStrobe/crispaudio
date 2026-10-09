import {useEffect,useState,useRef} from 'react';
import {flushSync} from 'react-dom';
import {Search} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import {Modal} from '../common/Modal';
import {ToolButton} from '../common/ToolButton';
import {dispatchNativeMenu,isNativeMac,menuBlocked,nativeMenuContext,textEditing} from '../../lib/nativeMenu';
import {useProjectStore} from '../../stores/projectStore';
const commands=[['new','New Project…','⌘/Ctrl N'],['open','Open Project…','⌘/Ctrl O'],['save','Save Project…','⌘/Ctrl S'],['import','Import Audio…','⌘/Ctrl I'],['export','Export Audio Mix…','⌘/Ctrl Shift E'],['export-range','Export Selected Audio Range…',''],['undo','Undo','⌘/Ctrl Z'],['redo','Redo','⌘/Ctrl Shift Z'],['copy','Copy','⌘/Ctrl C'],['cut','Cut','⌘/Ctrl X'],['paste','Paste at Playhead','⌘/Ctrl V'],['delete','Delete Selected Clips','Backspace'],['split','Split Selected at Playhead','⌘/Ctrl B'],['trim-tools','Trim Tools…',''],['edit-groups','Named Edit Groups…',''],['previous-edit','Previous Edit Point','⌘/Ctrl Alt ←'],['next-edit','Next Edit Point','⌘/Ctrl Alt →'],['add-track','Add Audio Track','⌘/Ctrl Shift N'],['fit','Fit All Tracks','⌘/Ctrl 0'],['zoom-in','Zoom In Timeline','⌘/Ctrl +'],['zoom-out','Zoom Out Timeline','⌘/Ctrl −'],['play-range','Play Selected Range','⌘/Ctrl Shift Space'],['clear-range','Clear Time Range',''],['shortcuts','Keyboard Shortcuts','?']] as const;
export function CommandSearch(){
 const {t}=useTranslation(),[open,setOpen]=useState(false),[query,setQuery]=useState(''),input=useRef<HTMLInputElement>(null);
 useProjectStore(s=>s.project);useProjectStore(s=>s.selection);useProjectStore(s=>s.clipboard);
 useEffect(()=>{const show=()=>{setQuery('');setOpen(true);};const key=(e:KeyboardEvent)=>{if(!isNativeMac()&&(e.ctrlKey||e.metaKey)&&e.code==='KeyK'&&!textEditing()&&!menuBlocked()){e.preventDefault();show();}};window.addEventListener('crispaudio-commands',show);document.addEventListener('keydown',key);return()=>{window.removeEventListener('crispaudio-commands',show);document.removeEventListener('keydown',key);};},[]);
 useEffect(()=>{if(open){const id=setTimeout(()=>input.current?.focus(),80);return()=>clearTimeout(id);}},[open]);
 const context=nativeMenuContext();
 const enabled=(action:string)=>!(['copy','cut','delete','split','trim-tools'].includes(action)&&!context.selection)&&!(['play-range','clear-range','export-range'].includes(action)&&!context.editRange)&&!(action==='edit-groups'&&!context.content)&&!(action==='paste'&&!context.clipboard)&&!(action==='undo'&&!context.canUndo)&&!(action==='redo'&&!context.canRedo);
 const results=commands.filter(([,label])=>t(`nativeMenu.${label}`).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const run=(action:string)=>{flushSync(()=>setOpen(false));dispatchNativeMenu(action);};
 return <><ToolButton icon={Search} label={t('commandSearch.title')} onClick={()=>{setQuery('');setOpen(true);}}/><Modal isOpen={open} onClose={()=>setOpen(false)} title={t('commandSearch.title')} widthClass="max-w-xl"><div className="space-y-2">
 <input ref={input} className="w-full bg-gray-800 text-gray-100 rounded p-3" aria-label={t('commandSearch.search')} placeholder={t('commandSearch.search')} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){const first=results.find(([action])=>enabled(action));if(first){e.preventDefault();run(first[0]);}}}}/>
 <div className="max-h-[50dvh] overflow-y-auto space-y-1">{results.map(([action,label,key])=><button key={action} disabled={!enabled(action)} className="timeline-tool w-full flex justify-between gap-2 text-left disabled:opacity-30" onClick={()=>run(action)}><span>{t(`nativeMenu.${label}`)}</span><kbd className="text-xs text-gray-400">{key}</kbd></button>)}{!results.length&&<p>{t('commandSearch.empty')}</p>}</div>
 </div></Modal></>;
}
