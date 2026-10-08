import { mediaJob } from '../../lib/mediaJob';
import { computeWaveformPeaks } from '../../audio/utils/audioBufferUtils';
import { hasRecoverableAutosave, restoreAutosaveAudio } from '../../hooks/useAutosave';
import { setPreviewProxy } from '../../lib/previewCache';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { Library, Settings2, Captions, SlidersHorizontal, X, Film, Link2, Unlink, BookmarkPlus, Trash2, Scissors, Upload, Download } from 'lucide-react';
import { ToolButton } from '../common/ToolButton';
import { SegmentEffectsPanel } from './SegmentEffectsPanel';
import { VideoClipSettings } from './VideoClipSettings';
import { useProjectStore } from '../../stores/projectStore';
import { videoSources, videoClips, frameTime } from '../../lib/videoEditing';
import { linkClips, slipClips, trimClips, rippleRange, projectClips } from '../../lib/projectEdits';
import { importVideo } from '../../lib/mediaBin';
import { parseTranscript, transcriptSrt, saveText } from '../../lib/transcript';
import { suggestMicSections, micAutomation, type MicSection } from '../../lib/mixAutomation';
import { isIOSApp } from '../../lib/native';
export type WorkspaceTab='media'|'edit'|'mix'|'text';
export function TimelineWorkspace({tab,onTab,onClose}:{tab:WorkspaceTab;onTab:(tab:WorkspaceTab)=>void;onClose:()=>void}){
  const {t}=useTranslation(),project=useProjectStore(s=>s.project),sources=useProjectStore(s=>s.sources),selection=useProjectStore(s=>s.selection);
  const [width,setWidth]=useState(()=>Number(localStorage.getItem('crispaudio-inspector-width'))||300),[error,setError]=useState(''),[busy,setBusy]=useState(false),[withAudio,setWithAudio]=useState(true),[filter,setFilter]=useState(''),[offset,setOffset]=useState(0);
  const [range,setRange]=useState({start:0,end:1}),[micIds,setMicIds]=useState<string[]>([]),[sections,setSections]=useState<MicSection[]>([]),[crossfade,setCrossfade]=useState(.08);
  const [pointDb,setPointDb]=useState(0),[inspectAudio,setInspectAudio]=useState(false);
  const [syncSnapshot,setSyncSnapshot]=useState(project),[trackId,setTrackId]=useState('');
  const abort=useRef<AbortController|null>(null),fileRef=useRef<HTMLInputElement>(null),resize=useRef<{x:number;width:number}|null>(null);
  useEffect(()=>()=>abort.current?.abort(),[]);
  useEffect(()=>{localStorage.setItem('crispaudio-inspector-width',String(width));},[width]);
  const ids=selection?.segmentIds??[],audio=project.tracks.flatMap(t=>t.segments).find(c=>ids.includes(c.id)),video=videoClips(project.video).find(c=>ids.includes(c.id));
  const native='__TAURI_INTERNALS__' in window&&!isIOSApp();
  const run=async(task:()=>Promise<void>|void)=>{setError('');try{await task();}catch(err){setError(String(err));}};
  const perform=async(task:(signal:AbortSignal)=>Promise<void>)=>{if(busy)return;setBusy(true);const controller=new AbortController();abort.current=controller;await run(()=>task(controller.signal));if(abort.current===controller){abort.current=null;setBusy(false);}};
  const commit=(next:typeof project)=>useProjectStore.setState({project:next,isPlaying:false});
  const step=1/(project.frameRate??25),chosenTrack=project.tracks.find(t=>t.id===trackId)??project.tracks[0];
  const addPoint=()=>{if(!chosenTrack||!Number.isFinite(pointDb)||pointDb< -60||pointDb>12)return;const time=useProjectStore.getState().playheadPosition;useProjectStore.getState().updateTrack(chosenTrack.id,{automation:[...(chosenTrack.automation??[]).filter(p=>Math.abs(p.time-time)>.000001),{time,value:10**(pointDb/20)}].sort((a,b)=>a.time-b.time)});};
  return <aside className="timeline-workspace bg-gray-900 border-l border-gray-700 flex flex-col shrink-0 min-h-0 relative" style={{width}} aria-label={t('workspace.title')}>
    <div role="separator" aria-label={t('workspace.resize')} aria-orientation="vertical" aria-valuenow={width} tabIndex={0} className="workspace-resizer absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize touch-none z-10" onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setWidth(w=>Math.max(240,Math.min(520,w+(e.key==='ArrowLeft'?20:-20))));}}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);resize.current={x:e.clientX,width};}} onPointerMove={e=>{if(resize.current)setWidth(Math.max(240,Math.min(520,resize.current.width+resize.current.x-e.clientX)));}} onPointerUp={()=>{resize.current=null;}} onPointerCancel={()=>{resize.current=null;}}/>
    <div className="flex flex-wrap gap-1 border-b border-gray-700 p-2 shrink-0" role="tablist" aria-label={t('workspace.title')}>
      {([['media',Library],['edit',Settings2],['mix',SlidersHorizontal],['text',Captions]] as const).map(([key,icon])=><ToolButton key={key} role="tab" aria-selected={tab===key} icon={icon} label={t(`workspace.${key}`)} onClick={()=>onTab(key)}/>)}
      <ToolButton icon={X} label={t('common.close')} onClick={onClose}/>
    </div>
    <div className="p-3 overflow-y-auto min-h-0 space-y-3 text-sm text-gray-200" role="tabpanel" aria-label={t(`workspace.${tab}`)}>
      {error&&<p role="alert" className="text-amber-300 break-words">{error}</p>}
      {busy&&<div role="status">{t('workspace.working')} <button className="timeline-tool" onClick={()=>abort.current?.abort()}>{t('common.cancel')}</button></div>}
      {tab==='media'&&<>
        <p className="text-gray-400">{t('workspace.mediaHelp')}</p>
        {hasRecoverableAutosave()&&<button className="timeline-tool" disabled={busy} onClick={()=>void perform(()=>restoreAutosaveAudio(new OfflineAudioContext(2,1,48000)))}>{t('workspace.restore')}</button>}
        <ToolButton icon={Film} disabled={!native||busy} label={t('workspace.addVideo')} onClick={()=>void perform(async signal=>{const files=await open({multiple:true,filters:[{name:'Video',extensions:['mp4','mov','mkv','m4v','webm','avi','ogv','mpeg','mpg']}]});for(const path of (Array.isArray(files)?files:files?[files]:[])){signal.throwIfAborted();await importVideo(path,withAudio,signal);}})}/>
        {!native&&<p>{t('sync.desktop')}</p>}
        <label className="flex gap-2 items-center min-h-11"><input type="checkbox" checked={withAudio} onChange={e=>setWithAudio(e.target.checked)}/>{t('workspace.cameraAudio')}</label>
        {videoSources(project.video).map(source=><div className="rounded bg-gray-950 p-2 space-y-2" key={source.id}><p className="break-all">{source.name}</p><p className="text-xs text-gray-400">{source.duration.toFixed(2)} s</p><button className="timeline-tool" onClick={()=>void run(()=>{
          if(!project.video)return;const start=useProjectStore.getState().playheadPosition;
          const clips=[...videoClips(project.video),{id:crypto.randomUUID(),...(source.id==='legacy-video'?{}:{sourceId:source.id}),startTime:start,sourceOffset:0,duration:source.duration,fadeIn:0,fadeOut:0,transition:'cut' as const,transitionDuration:0}];
          const sorted=[...clips].sort((a,b)=>a.startTime-b.startTime);if(sorted.some((c,i)=>i&&sorted[i-1].startTime+sorted[i-1].duration>c.startTime+1e-6))throw new Error(t('workspace.overlap'));
          const next={...project,video:{...project.video,clips,inPoint:undefined,outPoint:undefined}};commit({...next,duration:Math.max(project.duration,start+source.duration)});
        })}>{t('workspace.insert')}</button>
        <button disabled={!native||busy} className="timeline-tool" onClick={()=>void perform(async signal=>{const proxy=await mediaJob<string>('prepare_media_asset',{path:source.path,proxy:true},signal);signal.throwIfAborted();setPreviewProxy(source.path,proxy);})}>{t('workspace.proxy')}</button></div>)}
        {[...sources.values()].map(source=><div key={source.id} className="rounded bg-gray-950 p-2 space-y-2"><p>{source.name}</p><p className="text-xs text-gray-400">{source.duration.toFixed(2)} s · {source.channels} ch · {source.sampleRate} Hz</p><button className="timeline-tool" onClick={()=>{const state=useProjectStore.getState();state.addTrack(source.name);state.importAudioSource(source,state.playheadPosition,useProjectStore.getState().project.tracks.at(-1)!.id);}}>{t('workspace.insertTrack')}</button></div>)}
      </>}
      {tab==='edit'&&<>
        <div className="flex flex-wrap gap-2"><ToolButton icon={Link2} label={t('workspace.link')} disabled={ids.length<2} onClick={()=>void run(()=>commit(linkClips(project,ids)))}/><ToolButton icon={Unlink} label={t('workspace.unlink')} disabled={!ids.length} onClick={()=>void run(()=>commit(linkClips(project,ids,true)))}/></div>
        <p className="text-gray-400">{t('workspace.linkHelp')}</p>
        {ids.length>0&&<div className="flex flex-wrap gap-2">{[-1,1].map(direction=><button key={direction} className="timeline-tool" onClick={()=>void run(()=>commit(slipClips(project,ids,direction*step,sources)))}>{t('workspace.slip')} {direction<0?'−':'+'}1 {t('workspace.frame')}</button>)}</div>}
        {video&&audio&&<div className="flex gap-2"><button className="timeline-tool" aria-pressed={!inspectAudio} onClick={()=>setInspectAudio(false)}>{t('interview.video')}</button><button className="timeline-tool" aria-pressed={inspectAudio} onClick={()=>setInspectAudio(true)}>{t('interview.audio')}</button></div>}
        {video&&(!audio||!inspectAudio)?<VideoClipSettings id={video.id}/>:audio?<SegmentEffectsPanel onClose={onClose}/>:<p>{t('workspace.selectClip')}</p>}
        {!!ids.length&&<div className="flex flex-wrap gap-2">{(['left','right'] as const).map(side=>[-1,1].map(direction=><button key={`${side}${direction}`} className="timeline-tool" onClick={()=>void run(()=>commit(trimClips(project,ids,side,direction*step,sources)))}>{t(`workspace.trim_${side}`)} {direction<0?'−':'+'}1 {t('workspace.frame')}</button>))}</div>}
        <label className="block">{t('workspace.fps')}<select className="bg-gray-800 rounded p-2 mx-2" value={project.frameRate??25} onChange={e=>commit({...project,frameRate:Number(e.target.value)})}>{[23.976,24,25,29.97,30,50,59.94,60].map(fps=><option key={fps} value={fps}>{fps}</option>)}</select></label>
        <label className="block">{t('workspace.grid')}<select className="bg-gray-800 rounded p-2 mx-2" value={project.snapGrid??.1} onChange={e=>commit({...project,snapGrid:Number(e.target.value)})}><option value={0}>{t('workspace.off')}</option><option value={step}>{t('workspace.frame')}</option><option value={.01}>10 ms</option><option value={.1}>100 ms</option><option value={1}>1 s</option></select></label>
        <div className="border-t border-gray-700 pt-3 space-y-2"><p>{t('workspace.ripple')}</p><p className="text-xs text-gray-400">{t('workspace.rippleHelp')}</p>
          {(['start','end'] as const).map(key=><label key={key} className="flex justify-between items-center">{t(`workspace.${key}`)}<input type="number" min={0} step={step} className="bg-gray-800 rounded p-2 w-28" value={range[key]} onChange={e=>setRange(r=>({...r,[key]:Number(e.target.value)}))}/></label>)}
          <button className="timeline-tool" onClick={()=>{if(selection)setRange({start:selection.startTime,end:selection.endTime});}} disabled={!selection}>{t('workspace.useSelection')}</button>
          <ToolButton icon={Scissors} label={t('workspace.ripple')} onClick={()=>void run(()=>{const next=rippleRange(project,range.start,range.end);useProjectStore.setState({project:next,isPlaying:false,selection:null,playheadPosition:Math.min(range.start,next.duration)});})}/>
        </div>
        <ToolButton icon={BookmarkPlus} label={t('workspace.addMarker')} onClick={()=>commit({...project,markers:[...(project.markers??[]),{id:crypto.randomUUID(),time:frameTime(useProjectStore.getState().playheadPosition,project.frameRate??25),name:t('workspace.marker')}].sort((a,b)=>a.time-b.time)})}/>
        {project.markers?.map(marker=><div className="flex gap-1" key={marker.id}><button className="timeline-tool" onClick={()=>useProjectStore.getState().setPlayheadPosition(marker.time)}>{marker.time.toFixed(2)}</button><input className="min-w-0 bg-gray-800 rounded px-2 w-full" aria-label={t('workspace.marker')} value={marker.name} onChange={e=>commit({...project,markers:project.markers?.map(m=>m.id===marker.id?{...m,name:e.target.value}:m)})}/><ToolButton icon={Trash2} label={t('timeline.delete')} onClick={()=>commit({...project,markers:project.markers?.filter(m=>m.id!==marker.id)})}/></div>)}
      </>}
      {tab==='mix'&&<>
        <p className="text-gray-400">{t('workspace.micHelp')}</p>
        {project.tracks.map(track=><label key={track.id} className="flex gap-2 items-center min-h-11"><input type="checkbox" checked={micIds.includes(track.id)} onChange={e=>{setMicIds(ids=>e.target.checked?[...ids,track.id]:ids.filter(id=>id!==track.id));setSections([]);}}/>{track.name}</label>)}
        <button className="timeline-tool" disabled={micIds.length!==2||busy} onClick={()=>void perform(async signal=>{const state=useProjectStore.getState();setSyncSnapshot(state.project);setSections(await suggestMicSections(state.project.tracks.filter(t=>micIds.includes(t.id)),state.sources,signal));})}>{t('workspace.compareMics')}</button>
        {sections.map((section,i)=><div key={i} className="rounded bg-gray-950 p-2"><button onClick={()=>useProjectStore.getState().setPlayheadPosition(section.start)}>{section.start.toFixed(1)}–{section.end.toFixed(1)} s</button><select className="w-full bg-gray-800 rounded p-2" aria-label={t('workspace.microphone')} value={section.trackId} onChange={e=>setSections(old=>old.map((s,n)=>n===i?{...s,trackId:e.target.value}:s))}>{project.tracks.filter(t=>micIds.includes(t.id)).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><p className="text-xs text-gray-400">{t('workspace.confidence')}: {(section.confidence*100).toFixed(0)}%</p></div>)}
        {!!sections.length&&<><label>{t('workspace.crossfade')}<input className="bg-gray-800 rounded p-2 w-24 mx-2" type="number" min={0} max={2} step={.01} value={crossfade} onChange={e=>setCrossfade(Math.max(0,Math.min(2,Number(e.target.value))))}/></label><button className="timeline-tool" onClick={()=>void run(()=>{if(project!==syncSnapshot)throw new Error(t('sync.changed'));commit({...project,tracks:project.tracks.map(track=>micIds.includes(track.id)?{...track,muted:false,solo:false,automation:micAutomation(track.id,sections,crossfade)}:{...track,muted:true,solo:false})});setSections([]);})}>{t('workspace.applyMics')}</button></>}
        <select className="w-full bg-gray-800 rounded p-2" value={chosenTrack?.id??''} aria-label={t('workspace.microphone')} onChange={e=>setTrackId(e.target.value)}>{project.tracks.map(track=><option key={track.id} value={track.id}>{track.name}</option>)}</select>
        {chosenTrack&&<><button className="timeline-tool" disabled={!native||busy} onClick={()=>void perform(async signal=>{
          const used=[...new Set(chosenTrack.segments.map(c=>c.sourceId))];if(used.length!==1)throw new Error(t('workspace.oneSource'));
          const source=sources.get(used[0]);if(!source?.filePath)throw new Error(t('workspace.linkedOnly'));
          const snapshot=project,path=await mediaJob<string>('prepare_media_asset',{path:source.filePath,proxy:false,denoise:true},signal),{readFile}=await import('@tauri-apps/plugin-fs');const bytes=await readFile(path);signal.throwIfAborted();
          const ctx=new OfflineAudioContext(2,1,48000),buffer=await ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer);signal.throwIfAborted();if(useProjectStore.getState().project!==snapshot)throw new Error(t('sync.changed'));
          if(Math.abs(buffer.duration-source.duration)>1/100)throw new Error(t('workspace.durationChanged'));
          const id=crypto.randomUUID(),replacement={...source,id,buffer,filePath:path,duration:buffer.duration,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,peaks:computeWaveformPeaks(buffer.getChannelData(0),Math.min(8000,Math.ceil(buffer.duration*200)))};
          useProjectStore.setState({sources:new Map([...useProjectStore.getState().sources,[id,replacement]]),project:{...project,tracks:project.tracks.map(track=>track.id===chosenTrack.id?{...track,segments:track.segments.map(c=>({...c,sourceId:id}))}:track)},isPlaying:false});
        })}>{t('workspace.denoise')}</button><p className="text-xs text-gray-400">{t('workspace.denoiseHelp')}</p><p className="text-xs text-gray-400">{t('workspace.loudnessHelp')}</p><button disabled={!native||busy} className="timeline-tool" onClick={()=>void perform(async signal=>{
          const used=[...new Set(chosenTrack.segments.map(c=>c.sourceId))];if(used.length!==1)throw new Error(t('workspace.oneSource'));
          const source=sources.get(used[0]);if(!source?.filePath)throw new Error(t('workspace.linkedOnly'));
          const snapshot=project,measurement=await mediaJob<{gain_db:number}>('measure_loudness',{path:source.filePath},signal);signal.throwIfAborted();if(useProjectStore.getState().project!==snapshot)throw new Error(t('sync.changed'));
          useProjectStore.getState().updateTrack(chosenTrack.id,{volume:10**(measurement.gain_db/20)});
        })}>{t('workspace.normalize')}</button><button className="timeline-tool" onClick={()=>useProjectStore.getState().updateTrack(chosenTrack.id,{automation:undefined})}>{t('workspace.clearAutomation')}</button>
          <button className="timeline-tool" onClick={()=>useProjectStore.getState().updateTrack(chosenTrack.id,{effects:[{type:'highpass',enabled:true,params:{freq:80,q:.7}},{type:'lowpass',enabled:true,params:{freq:12000,q:.7}},{type:'compressor',enabled:true,params:{threshold:-24,ratio:3,attack:.005,release:.2,knee:6}}]})}>{t('workspace.speechChain')}</button>
          <button className="timeline-tool" onClick={()=>useProjectStore.getState().updateTrack(chosenTrack.id,{effects:[]})}>{t('workspace.clearChain')}</button>
          <label className="block">{t('workspace.gainPoint')}<input aria-label={t('workspace.gainPoint')} className="bg-gray-800 rounded p-2 w-24 mx-2" type="number" min={-60} max={12} step={1} value={pointDb} onChange={e=>setPointDb(Number(e.target.value))} onKeyDown={e=>{if(e.key==='Enter'){addPoint();e.currentTarget.blur();}}}/></label>
          <button className="timeline-tool" onClick={addPoint}>{t('workspace.addPoint')}</button>
          <p className="text-xs text-gray-400">{t('workspace.pointHelp')}</p>
          {chosenTrack.automation?.map((point,i)=><div className="flex justify-between items-center" key={i}><button onClick={()=>useProjectStore.getState().setPlayheadPosition(point.time)}>{point.time.toFixed(3)} s · {point.value? (20*Math.log10(point.value)).toFixed(1):'−∞'} dB</button><ToolButton icon={Trash2} label={t('timeline.delete')} onClick={()=>useProjectStore.getState().updateTrack(chosenTrack.id,{automation:chosenTrack.automation?.filter((_,n)=>n!==i)})}/></div>)}
        </>}
      </>}
      {tab==='text'&&<>
        <p className="text-gray-400">{t('workspace.textHelp')}</p>
        <label>{t('workspace.offset')}<input className="bg-gray-800 rounded p-2 w-24 mx-2" type="number" step={.001} value={offset} onChange={e=>setOffset(Number(e.target.value))}/></label>
        <input ref={fileRef} type="file" accept=".srt,.vtt,.json" className="hidden" onChange={e=>{const file=e.target.files?.[0];if(file)void run(async()=>{const cues=parseTranscript(await file.text(),offset);commit({...useProjectStore.getState().project,transcript:cues});});e.target.value='';}}/>
        <div className="flex gap-2"><ToolButton icon={Upload} label={t('workspace.importText')} onClick={()=>void run(async()=>{if(native){const path=await open({multiple:false,filters:[{name:'Transcript',extensions:['srt','vtt','json']}]});if(typeof path==='string')commit({...project,transcript:parseTranscript(await readTextFile(path),offset)});}else fileRef.current?.click();})}/><ToolButton icon={Download} label={t('workspace.exportText')} disabled={!project.transcript?.length} onClick={()=>void run(()=>saveText(transcriptSrt(project.transcript??[]),project.name,'srt'))}/></div>
        <input className="w-full bg-gray-800 rounded p-2" placeholder={t('workspace.search')} aria-label={t('workspace.search')} value={filter} onChange={e=>setFilter(e.target.value)}/>
        {project.transcript?.filter(c=>c.text.toLowerCase().includes(filter.toLowerCase())).map(cue=><section className="bg-gray-950 rounded p-2 space-y-2" key={cue.id}><button className="timeline-tool" onClick={()=>{const state=useProjectStore.getState();state.setIsPlaying(false);state.setPlayheadPosition(cue.start);state.setSelection({startTime:cue.start,endTime:cue.end,segmentIds:projectClips(project).filter(c=>c.startTime<cue.end&&c.startTime+c.duration>cue.start).map(c=>c.id)});}}>{cue.start.toFixed(2)}–{cue.end.toFixed(2)} s</button><textarea className="w-full bg-gray-800 rounded p-2" aria-label={t('workspace.cue')} value={cue.text} onChange={e=>commit({...project,transcript:project.transcript?.map(c=>c.id===cue.id?{...c,text:e.target.value}:c)})}/><button className="timeline-tool" onClick={()=>void run(()=>{commit(rippleRange(project,cue.start,cue.end));useProjectStore.getState().setSelection(null);})}>{t('workspace.removePassage')}</button></section>)}
      </>}
    </div>
  </aside>;
}
