import {TrackSettingsInspector} from './TrackSettingsInspector';
import {selectionTrackIds,selectTimelineTrack} from '../../lib/trackSelection';
import {FloatingInspector} from '../common/FloatingInspector';
import {InspectorTransport} from './InspectorTransport';
import {useTimelineTool} from '../../hooks/useTimelineTool';
import {NumberField} from './NumberField';
import { ClipFadeTools } from './ClipFadeTools';
import {EditGroups} from './EditGroups';
import {TrimEditDialog} from './TrimEditDialog';
import { splitClips, projectClips, blendAudioOverlaps } from '../../lib/projectEdits';
import { ToolButton } from '../common/ToolButton';
import { Hand, Scissors, Settings2, Trash2 } from 'lucide-react';
import { VideoClipSettings } from './VideoClipSettings';
import { videoClips } from '../../lib/videoEditing';
import { deleteSelection, nudgeSelection } from '../../lib/timelineEditing';
import { useEffect,useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { Modal } from '../common/Modal';
import { SegmentEffectsPanel } from './SegmentEffectsPanel';

/** Actions are visible and keyboard/touch accessible; no right-click required. */
export function TimelineActions({ touchArrange, onTouchArrange }: { touchArrange: boolean; onTouchArrange: () => void }) {
  const { t } = useTranslation();
  const [fades, setFades] = useState(false);
  const [trim,setTrim]=useState(false);
  useEffect(()=>{const open=()=>setTrim(true);window.addEventListener('crispaudio-trim-tools',open);return()=>window.removeEventListener('crispaudio-trim-tools',open);},[]);
  const [inspector, setInspector] = useState(false),[inspectPicture,setInspectPicture]=useState(false);
  const [mixer,setMixer] = useState(false),[trackSettingsId,setTrackSettingsId]=useState('');
  useEffect(()=>{const show=(event:Event)=>{const id=(event as CustomEvent<string>).detail;setInspector(false);setFades(false);setTrackSettingsId(id);selectTimelineTrack(id);setMixer(true);};window.addEventListener('crispaudio-track-settings',show);return()=>window.removeEventListener('crispaudio-track-settings',show);},[]);
  useEffect(()=>{if(!mixer)return;return useProjectStore.subscribe((next,previous)=>{if(next.selection===previous.selection)return;const ids=selectionTrackIds(next.project,next.selection).filter(id=>next.project.tracks.some(track=>track.id===id));if(ids.length===1)setTrackSettingsId(ids[0]);});},[mixer]);
  const video = useProjectStore(s=>s.project.video);
  const [nudge,setNudge]=useState(.001);
  const tracks = useProjectStore((s) => s.project.tracks);
  const selection = useProjectStore((s) => s.selection);
  const position = useProjectStore((s) => s.playheadPosition);
  const selected = tracks.flatMap((track) => track.segments).filter((clip) => selection?.segmentIds.includes(clip.id));
  const selectedVideo=videoClips(video).filter(clip=>selection?.segmentIds.includes(clip.id));
  const allSelected=[...selected,...selectedVideo];
  const splittable = allSelected.filter((clip) => position > clip.startTime && position < clip.startTime + clip.duration);
  const [nudgeOpen,setNudgeOpen]=useState(false);
  useTimelineTool('clip-settings',()=>{setMixer(false);setFades(false);setInspector(true);},!!allSelected.length);
  useTimelineTool('track-settings',()=>{setInspector(false);setFades(false);const s=useProjectStore.getState();setTrackSettingsId(selectionTrackIds(s.project,s.selection).find(id=>s.project.tracks.some(t=>t.id===id))??s.project.tracks[0]?.id??'');setMixer(true);},!!tracks.length);
  useTimelineTool('fades',()=>{setMixer(false);setInspector(false);setFades(true);},!!allSelected.length);
  useTimelineTool('split-all',()=>{const state=useProjectStore.getState();useProjectStore.setState({project:splitClips(state.project,projectClips(state.project).map(c=>c.id),state.playheadPosition),selection:null});},!!tracks.length||!!video);
  useTimelineTool('blend',()=>{const state=useProjectStore.getState();useProjectStore.setState({project:blendAudioOverlaps(state.project,state.selection?.segmentIds??[])});},selected.length>=2);
  useTimelineTool('nudge-left',()=>nudgeSelection(-nudge),!!allSelected.length);
  useTimelineTool('nudge-right',()=>nudgeSelection(nudge),!!allSelected.length);
  useTimelineTool('nudge-settings',()=>setNudgeOpen(true));
  if (!tracks.length&&!video) return null;
  return <>
    <div className="timeline-clip-actions flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-800 shrink-0" aria-label={t('timeline.clipActions')}>
      <ToolButton data-help="move" icon={Hand} label={t(touchArrange?'timeline.touchArrangeOn':'timeline.touchArrangeOff')} className="touch-arrange-toggle" aria-pressed={touchArrange} onClick={onTouchArrange}/>

      <EditGroups launcher={false}/>
      <ToolButton data-help="split" icon={Scissors} label={t('timeline.splitAtPlayhead')} className="clip-split-selected" disabled={!splittable.length} onClick={()=>{
        const state=useProjectStore.getState();useProjectStore.setState({project:splitClips(state.project,selection?.segmentIds??[],position),selection:null});
      }}/>

      <ToolButton data-help="inspector" icon={Settings2} label={t('timeline.clipSettings')} disabled={!allSelected.length} onClick={()=>setInspector(true)}/>



      <ToolButton data-help="remove" icon={Trash2} label={t('timeline.delete')} disabled={!allSelected.length} onClick={deleteSelection}/>
    </div>
    <Modal isOpen={nudgeOpen} onClose={()=>setNudgeOpen(false)} title={t('editing.nudgeStep')}><NumberField label={t('editing.nudgeStep')} value={nudge} min={1/useProjectStore.getState().project.sampleRate} step={.001} onCommit={value=>{if(value<=0)return false;setNudge(value);return true;}}/></Modal>
    {trim&&<TrimEditDialog onClose={()=>setTrim(false)}/>}
    {fades && allSelected.length > 0&&<FloatingInspector onClose={() => setFades(false)} title={t('fades.title')}><InspectorTransport/>
      <ClipFadeTools/>
    </FloatingInspector>}
    {inspector && allSelected.length > 0&&<FloatingInspector onClose={() => setInspector(false)} title={t('timeline.clipSettings')}><InspectorTransport/>
      {!!selected.length&&!!selectedVideo.length&&<div className="flex gap-2 mb-3" role="tablist" aria-label={t('timeline.clipSettings')}><button className="timeline-tool" role="tab" aria-selected={!inspectPicture} onClick={()=>setInspectPicture(false)}>{t('interview.audio')}</button><button className="timeline-tool" role="tab" aria-selected={inspectPicture} onClick={()=>setInspectPicture(true)}>{t('interview.video')}</button></div>}
      {selectedVideo.length&&(!selected.length||inspectPicture)?<VideoClipSettings id={selectedVideo[0].id}/>:<SegmentEffectsPanel onClose={()=>setInspector(false)}/>}
    </FloatingInspector>}
    {mixer&&<TrackSettingsInspector trackId={trackSettingsId} onTrackChange={id=>{setTrackSettingsId(id);selectTimelineTrack(id);}} onClose={()=>setMixer(false)}/>}
  </>;
}
