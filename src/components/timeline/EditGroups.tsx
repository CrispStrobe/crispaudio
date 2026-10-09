import {useEffect,useState} from 'react';
import {Group} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import {Modal} from '../common/Modal';
import {ToolButton} from '../common/ToolButton';
import {useProjectStore} from '../../stores/projectStore';
import {nameEditGroup,projectClips,projectSelection} from '../../lib/projectEdits';
export function EditGroups(){
 const {t}=useTranslation(),project=useProjectStore(s=>s.project),selection=useProjectStore(s=>s.selection);
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[error,setError]=useState('');
 useEffect(()=>{const show=()=>setOpen(true);window.addEventListener('crispaudio-edit-groups',show);return()=>window.removeEventListener('crispaudio-edit-groups',show);},[]);
 const groups=[...new Map(projectClips(project).filter(c=>c.editGroup).map(c=>[c.editGroup!.id,c.editGroup!])).values()];
 const apply=(remove=false)=>{try{const state=useProjectStore.getState(),next=nameEditGroup(state.project,state.selection?.segmentIds??[],name,remove);useProjectStore.setState({project:next,isPlaying:false});setError(useProjectStore.getState().project===next?'':t('editGroups.locked'));}catch(e){setError(t(String(e).includes('editGroups.invalid')?'editGroups.invalid':'editGroups.failed'));}};
 return <><ToolButton icon={Group} data-help="groups" label={t('editGroups.title')} onClick={()=>setOpen(true)}/><Modal isOpen={open} onClose={()=>setOpen(false)} title={t('editGroups.title')} widthClass="max-w-lg"><div className="space-y-3 text-sm text-gray-200">
  <p className="text-gray-400">{t('editGroups.help')}</p>
  <label className="flex gap-2 items-center"><input type="checkbox" checked={project.groupEditingEnabled!==false} onChange={e=>{const state=useProjectStore.getState();useProjectStore.setState({project:{...state.project,groupEditingEnabled:e.target.checked},selection:null});}}/>{t('editGroups.enabled')}</label>
  <label className="block">{t('editGroups.name')}<input className="bg-gray-800 rounded p-2 block w-full" maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
  <div className="flex flex-wrap gap-2"><button className="timeline-tool max-w-full whitespace-normal" disabled={!selection?.segmentIds.length||!name.trim()} onClick={()=>apply()}>{t('editGroups.create')}</button><button className="timeline-tool max-w-full whitespace-normal" disabled={!selection?.segmentIds.length} onClick={()=>apply(true)}>{t('editGroups.remove')}</button></div>
  {error&&<p role="alert" className="text-amber-300">{error}</p>}
  {groups.map(group=><button key={group.id} className="timeline-tool block w-full text-left whitespace-normal break-all" onClick={()=>{const ids=projectClips(project).filter(c=>c.editGroup?.id===group.id).map(c=>c.id);useProjectStore.getState().setSelection(projectSelection(project,ids));setName(group.name);}}>{group.name} · {projectClips(project).filter(c=>c.editGroup?.id===group.id).length}</button>)}
 </div></Modal></>;
}
