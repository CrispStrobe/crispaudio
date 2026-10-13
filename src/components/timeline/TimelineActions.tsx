import {FloatingInspector} from '../common/FloatingInspector';
import {InspectorTransport} from './InspectorTransport';
import {HelpDetails} from '../common/HelpDetails';
import {useTimelineTool} from '../../hooks/useTimelineTool';
import {NumberField} from './NumberField';
import { ClipFadeTools } from './ClipFadeTools';
import {EditGroups} from './EditGroups';
import {TrimEditDialog} from './TrimEditDialog';
import { EffectChainEditor } from './EffectChainEditor';
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
  const [mixer,setMixer] = useState(false);
  const [inspector, setInspector] = useState(false),[inspectPicture,setInspectPicture]=useState(false);
  const video = useProjectStore(s=>s.project.video);
  const masterEffects = useProjectStore(s=>s.project.masterEffects);
  const [nudge,setNudge]=useState(.001);
  const tracks = useProjectStore((s) => s.project.tracks);
  const selection = useProjectStore((s) => s.selection);
  const position = useProjectStore((s) => s.playheadPosition);
  const selected = tracks.flatMap((track) => track.segments).filter((clip) => selection?.segmentIds.includes(clip.id));
  const selectedVideo=videoClips(video).filter(clip=>selection?.segmentIds.includes(clip.id));
  const allSelected=[...selected,...selectedVideo];
  const splittable = allSelected.filter((clip) => position > clip.startTime && position < clip.startTime + clip.duration);
  const [nudgeOpen,setNudgeOpen]=useState(false);
  useTimelineTool('clip-settings',()=>{setFades(false);setInspector(true);},!!allSelected.length);
  useTimelineTool('track-settings',()=>setMixer(true),!!tracks.length);
  useTimelineTool('fades',()=>{setInspector(false);setFades(true);},!!allSelected.length);
  useTimelineTool('split-all',()=>{const state=useProjectStore.getState();useProjectStore.setState({project:splitClips(state.project,projectClips(state.project).map(c=>c.id),state.playheadPosition),selection:null});},!!tracks.length||!!video);
  useTimelineTool('blend',()=>{const state=useProjectStore.getState();useProjectStore.setState({project:blendAudioOverlaps(state.project,state.selection?.segmentIds??[])});},selected.length>=2);
  useTimelineTool('nudge-left',()=>nudgeSelection(-nudge),!!allSelected.length);
  useTimelineTool('nudge-right',()=>nudgeSelection(nudge),!!allSelected.length);
  useTimelineTool('nudge-settings',()=>setNudgeOpen(true));
  if (!tracks.length&&!video) return null;
  const button = 'min-h-11 px-3 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-40';
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
    <Modal isOpen={mixer} onClose={() => setMixer(false)} title={t('nativeMenu.Track Settings…')} widthClass="max-w-2xl">
      <button className="timeline-tool mb-3" onClick={()=>{const state=useProjectStore.getState();tracks.forEach(track=>state.updateTrack(track.id,{solo:false}));}}>{t('editor.clearSolos')}</button>
      <HelpDetails><p>{t('timeline.mixerHelp')}</p></HelpDetails>
      <div className="space-y-4">
        {mixer && tracks.map((track, i) => <section key={track.id} className="p-3 rounded-xl bg-gray-950 border border-gray-700 space-y-2">
          <input className="w-full min-h-11 bg-gray-900 rounded px-3 text-gray-100" aria-label={`${t('timeline.trackName')} ${i + 1}`} value={track.name}
            onChange={(e) => useProjectStore.getState().updateTrack(track.id, { name: e.target.value })} />
          <div className="flex flex-wrap gap-2">
            <button className={button} aria-pressed={track.muted} onClick={() => useProjectStore.getState().updateTrack(track.id, { muted: !track.muted })}>{t('timeline.mute')}</button>
            <button className={button} aria-pressed={track.solo} onClick={() => useProjectStore.getState().updateTrack(track.id, { solo: !track.solo })}>{t('timeline.solo')}</button>
            <button className={button} onClick={() => {
              const state = useProjectStore.getState();
              tracks.forEach((other) => state.updateTrack(other.id, { muted: other.id !== track.id, solo: false }));
            }}>{t('timeline.listenOnly')}</button>
            <button className={button} disabled={i === 0} aria-label={`${t('timeline.moveTrackUp')} ${track.name}`} onClick={() => useProjectStore.getState().reorderTrack(track.id, i - 1)}>↑</button>
            <button className={button} disabled={i === tracks.length - 1} aria-label={`${t('timeline.moveTrackDown')} ${track.name}`} onClick={() => useProjectStore.getState().reorderTrack(track.id, i + 1)}>↓</button>
          </div>
          <div className="flex flex-wrap gap-3">
            {(['in','out'] as const).map(side=><label key={side} className="text-xs text-gray-300">{t(side==='in'?'timeline.fadeIn':'timeline.fadeOut')} (s)
              <input type="number" min={0} step={.001} value={(side==='in'?track.fadeInDuration:track.fadeOutDuration)??0} aria-label={`${track.name} ${t(side==='in'?'timeline.fadeIn':'timeline.fadeOut')}`} className="bg-gray-800 rounded p-2 w-24 mx-2" onChange={e=>{const duration=Number(e.target.value);if(Number.isFinite(duration)&&duration>=0)useProjectStore.getState().updateTrack(track.id,side==='in'?{fadeInDuration:duration}:{fadeOutDuration:duration});}}/>
              <select aria-label={`${track.name} ${t('editing.fadeCurve')} ${side}`} className="bg-gray-800 rounded p-2" value={(side==='in'?track.fadeInCurve:track.fadeOutCurve)??'linear'} onChange={e=>useProjectStore.getState().updateTrack(track.id,side==='in'?{fadeInCurve:e.target.value as 'linear'|'exponential'|'scurve'}:{fadeOutCurve:e.target.value as 'linear'|'exponential'|'scurve'})}>
                {(['linear','exponential','scurve'] as const).map(curve=><option key={curve} value={curve}>{t(curve==='linear'?'timeline.curveLinear':curve==='exponential'?'timeline.curveExponential':'timeline.curveScurve')}</option>)}
              </select>
            </label>)}
          </div>
          <details>
            <summary className="text-sm text-gray-300 cursor-pointer py-2">{t('rack.trackEffects')}</summary>
            <EffectChainEditor scope={`track:${track.id}`} effects={track.effects ?? []} label={`${track.name} ${t('rack.trackEffects')}`} onChange={effects => {
              const state = useProjectStore.getState(); state.setIsPlaying(false); state.updateTrack(track.id, {effects});
            }}/>
          </details>
          <label className="flex items-center gap-3 text-sm text-gray-300">{t('timeline.trackVolume')}
            <input type="range" min={-60} max={40} step={0.5} className="slider-styled min-w-0 flex-1" value={track.volume > 0 ? Math.max(-60, 20 * Math.log10(track.volume)) : -60}
              onChange={(e) => useProjectStore.getState().updateTrack(track.id, { volume: +e.target.value <= -60 ? 0 : 10 ** (+e.target.value / 20) })} />
            <span className="w-16 text-right tabular-nums">{track.volume > 0 ? `${(20 * Math.log10(track.volume)).toFixed(1)} dB` : '−∞'}</span>
          </label>
        </section>)}
      </div>
      <section className="mt-4 p-3 rounded-xl bg-gray-950 border border-indigo-800">
        <h3 className="font-semibold text-sm mb-2">{t('rack.masterEffects')}</h3>
        {mixer && <EffectChainEditor scope="master" effects={masterEffects} label={t('rack.masterEffects')} onChange={effects => {
          const state = useProjectStore.getState();
          useProjectStore.setState({project: {...state.project, masterEffects: effects}, isPlaying: false});
        }}/>}
      </section>
    </Modal>
  </>;
}
