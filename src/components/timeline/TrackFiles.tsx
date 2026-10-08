import { ToolButton } from '../common/ToolButton';
import { FolderInput, Archive } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { serializeProject, deserializeProject } from '../../lib/projectFile';
import { openProjectFile, saveProjectFile } from '../../lib/projectIO';
import { timelineDuration } from '../../lib/timelineView';
import { Modal } from '../common/Modal';
export function TrackFiles({ context, onError }: { context: () => BaseAudioContext; onError: (error: string) => void }) {
  const { t } = useTranslation();
  const tracks = useProjectStore(s => s.project.tracks);
  const [show, setShow] = useState(false), [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const load = async () => {
    setBusy(true); onError('');
    try {
      const json = await openProjectFile(); if (!json) return;
      const incoming = await deserializeProject(json, context());
      const remap = new Map([...incoming.sources.keys()].map(id => [id, crypto.randomUUID()]));
      const sources = new Map([...incoming.sources].map(([id, source]) => [remap.get(id)!, {...source, id:remap.get(id)!}]));
      const groups=new Map<string,string>();
      const remapGroup=(group?:string)=>{if(!group)return undefined;if(!groups.has(group))groups.set(group,crypto.randomUUID());return groups.get(group);};
      const tracks = incoming.project.tracks.map(track => { const id=crypto.randomUUID(); return {...track,id,segments:track.segments.map(clip => ({...clip,id:crypto.randomUUID(),linkGroup:remapGroup(clip.linkGroup),trackId:id,sourceId:remap.get(clip.sourceId) ?? (()=>{throw new Error('Missing audio in saved track');})()}))}; });
      useProjectStore.setState(state => { const project={...state.project,tracks:[...state.project.tracks,...tracks]}; return {project:{...project,duration:timelineDuration(project)},sources:new Map([...state.sources,...sources]),isPlaying:false,selection:null}; });
    } catch (err) {onError(String(err));} finally {setBusy(false);}
  };
  const save = async () => {
    setBusy(true); onError('');
    try {
      const state=useProjectStore.getState();
      const project={...state.project,id:crypto.randomUUID(),name:`${state.project.name} tracks`,tracks:tracks.filter(track=>selected.includes(track.id)),video:undefined,masterEffects:[]};
      project.duration=timelineDuration(project);
      const used=new Set(project.tracks.flatMap(track=>track.segments.map(clip=>clip.sourceId)));
      if (await saveProjectFile(serializeProject(project,new Map([...state.sources].filter(([id])=>used.has(id))),'portable'),project.name)) setShow(false);
    } catch(err) {onError(String(err));} finally {setBusy(false);}
  };
  return <>
    <ToolButton icon={FolderInput} label={t('editor.loadTracks')} disabled={busy} onClick={()=>void load()}/>
    <ToolButton icon={Archive} label={t('editor.saveTracks')} disabled={busy || !tracks.length} onClick={()=>{setSelected(tracks.map(track=>track.id));setShow(true);}}/>
    <Modal isOpen={show} onClose={()=>setShow(false)} title={t('editor.saveTracks')}>
      <p className="text-sm text-gray-300 mb-3">{t('editor.trackFilesHelp')}</p>
      {tracks.map(track=><label key={track.id} className="flex items-center gap-3 min-h-11 text-gray-200"><input type="checkbox" checked={selected.includes(track.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,track.id]:old.filter(id=>id!==track.id))}/>{track.name}</label>)}
      <button className="timeline-tool mt-3" disabled={busy || !selected.length} onClick={()=>void save()}>{t('editor.saveTracks')}</button>
    </Modal>
  </>;
}
