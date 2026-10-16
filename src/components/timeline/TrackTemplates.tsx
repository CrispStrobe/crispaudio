import {useEffect,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {selectionTrackIds} from '../../lib/trackSelection';
import {useTimelineTool} from '../../hooks/useTimelineTool';
import {useProjectStore} from '../../stores/projectStore';
import {useUIStore} from '../../stores/uiStore';
import {useTrackTemplateStore} from '../../stores/trackTemplateStore';
import {builtInTrackTemplates,captureTrackTemplate,insertTrackTemplate} from '../../lib/trackTemplates';
import {Modal} from '../common/Modal';
import {HelpDetails} from '../common/HelpDetails';

export function TrackTemplates(){
 const {t}=useTranslation(),project=useProjectStore(s=>s.project),recording=useUIStore(s=>s.timelineRecording),library=useTrackTemplateStore();
 const [open,setOpen]=useState(false),[choice,setChoice]=useState('builtin:voice'),[source,setSource]=useState(''),[name,setName]=useState(''),[error,setError]=useState(''),[projectId,setProjectId]=useState('');
 const show=(trackId?:string)=>{if(useUIStore.getState().timelineRecording)return;const state=useProjectStore.getState(),selected=trackId?[trackId]:selectionTrackIds(state.project,state.selection),track=state.project.tracks.find(track=>track.kind!=='bus'&&selected.includes(track.id))??state.project.tracks.find(track=>track.kind!=='bus');setSource(track?.id??'');setName(track?.name??'');setProjectId(state.project.id);setError('');setOpen(true);};
 useTimelineTool('track-templates',()=>show(),!recording);
 useEffect(()=>{const handler=(event:Event)=>show((event as CustomEvent<string>).detail);window.addEventListener('crispaudio-track-templates',handler);return()=>window.removeEventListener('crispaudio-track-templates',handler);},[]);
 const templates=[...builtInTrackTemplates.map(template=>({...template,id:`builtin:${template.id}`,name:t(`templates.${template.id}`)})),...library.templates],selected=templates.find(template=>template.id===choice),changed=project.id!==projectId;
 const attempt=(action:()=>void)=>{try{if(useUIStore.getState().timelineRecording||useProjectStore.getState().project.id!==projectId)throw new Error('samples.changed');action();setError('');}catch(error){setError(t(error instanceof Error?error.message:String(error)));}};
 return <Modal isOpen={open} onClose={()=>setOpen(false)} title={t('templates.title')}><div className="space-y-3 text-sm" data-track-templates><fieldset disabled={recording||changed} className="space-y-3">
 <div className="flex items-center gap-1"><select className="min-h-11 min-w-0 flex-1 bg-gray-800 rounded px-2" aria-label={t('templates.template')} value={choice} onChange={e=>setChoice(e.target.value)}>{templates.map(template=><option key={template.id} value={template.id}>{template.name}</option>)}</select><HelpDetails><p>{t('templates.help')}</p></HelpDetails></div>
 <div className="flex justify-end gap-2">{selected&&!choice.startsWith('builtin:')&&<button className="timeline-tool" onClick={()=>attempt(()=>{library.remove(choice);setChoice('builtin:voice');})}>{t('templates.delete')}</button>}<button className="timeline-tool" disabled={!selected} onClick={()=>attempt(()=>{if(selected){insertTrackTemplate(selected);setOpen(false);}})}>{t('templates.add')}</button></div>
 <details><summary className="min-h-11 content-center cursor-pointer border-t border-gray-800">{t('templates.saveTitle')}</summary><div className="space-y-2"><select aria-label={t('recording.track')} className="min-h-11 w-full bg-gray-800 rounded px-2" value={source} onChange={e=>{setSource(e.target.value);setName(project.tracks.find(track=>track.id===e.target.value)?.name??'');}}>{project.tracks.filter(track=>track.kind!=='bus').map(track=><option key={track.id} value={track.id}>{track.name}</option>)}</select><input className="min-h-11 w-full bg-gray-800 rounded px-2" maxLength={80} aria-label={t('templates.name')} value={name} onChange={e=>setName(e.target.value)}/><button className="timeline-tool" disabled={!name.trim()||!project.tracks.some(track=>track.id===source&&track.kind!=='bus')} onClick={()=>attempt(()=>{const track=useProjectStore.getState().project.tracks.find(track=>track.id===source&&track.kind!=='bus');if(!track)throw new Error('samples.changed');const template=captureTrackTemplate(track,name);library.save(template);setChoice(template.id);})}>{t('common.save')}</button></div></details>
 </fieldset>{(error||changed)&&<p role="alert" className="text-amber-300">{error||t('samples.changed')}</p>}</div></Modal>;
}
