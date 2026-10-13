import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useTimelineTool} from '../../hooks/useTimelineTool';
import {useProjectStore} from '../../stores/projectStore';
import {useUIStore} from '../../stores/uiStore';
import {placeClips} from '../../lib/clipNavigation';
import {projectClips,linkedIds,projectSelection} from '../../lib/projectEdits';
import {Modal} from '../common/Modal';
import type {TimelineProject} from '../../types/audio';
export function ClipPlacement(){
 const {t}=useTranslation(),recording=useUIStore(s=>s.timelineRecording),selection=useProjectStore(s=>s.selection),project=useProjectStore(s=>s.project),[open,setOpen]=useState(false),[snapshot,setSnapshot]=useState<TimelineProject>(),[ids,setIds]=useState<string[]>([]),[time,setTime]=useState('0'),[error,setError]=useState('');
 useTimelineTool('place-clips',()=>{const s=useProjectStore.getState(),ids=linkedIds(s.project,s.selection?.segmentIds??[]),clips=projectClips(s.project).filter(c=>ids.includes(c.id));if(!clips.length)return;setSnapshot(s.project);setIds(ids);setTime(String(Math.min(...clips.map(c=>c.startTime))));setError('');setOpen(true);},!recording&&!!selection?.segmentIds.length);
 const apply=()=>{try{if(recording||project!==snapshot)throw new Error('samples.changed');const next=placeClips(project,ids,time.trim()?Number(time):NaN);if(next!==project)useProjectStore.setState({project:next,selection:projectSelection(next,ids),isPlaying:false});setOpen(false);}catch(e){setError(t(e instanceof Error?e.message:String(e)));}};
 return <Modal isOpen={open} onClose={()=>setOpen(false)} title={t('placement.title')}><div className="space-y-3 text-sm"><label className="block">{t('placement.time')}<input type="number" min={0} step={1/project.sampleRate} className="bg-gray-800 rounded min-h-11 w-full px-2" value={time} onChange={e=>setTime(e.target.value)}/></label><p className="text-xs text-gray-400">{t('placement.offsets')}</p>{error&&<p role="alert" className="text-amber-300">{error}</p>}<div className="flex justify-end gap-2"><button className="timeline-tool" onClick={()=>setOpen(false)}>{t('common.cancel')}</button><button className="timeline-tool" disabled={recording} onClick={apply}>{t('folders.apply')}</button></div></div></Modal>;
}
