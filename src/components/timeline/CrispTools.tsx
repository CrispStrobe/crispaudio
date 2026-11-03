import {useContext,useEffect,useRef,useState} from 'react';
import {FolderOpen,X,Wand2,Layers,AudioWaveform,Scissors,Play} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import {useSettingsStore,type CrispasrPaths} from '../../stores/settingsStore';
import {useProjectStore} from '../../stores/projectStore';
import {useUIStore} from '../../stores/uiStore';
import {ToolButton} from '../common/ToolButton';
import {InfoButton} from '../common/InfoButton';
import {NumberField} from './NumberField';
import {TimelineEngineContext} from './timelineEngineContext';
import {commitStemTracks} from '../../audio/plugins/StemTracksCommit';
import {analysisPcm,beatMarkers,blendSelection,crispBeats,crispDesktop,crispProcess,crispRegions,crispStatus,musicFromBeats,downbeatMeter,pauseCuts,planPauses,processingWindow,tightenPauses,type BeatGrid,type CrispStatus,type CrispStem} from '../../lib/crispasr';
import type {SampleRange} from '../../lib/sourceEditing';
import type {TimelineProject} from '../../types/audio';

const fileName=(path:string)=>path.split(/[\\/]/).pop()||path;
const message=(t:(key:string)=>string,error:unknown)=>t(error instanceof Error?error.message:String(error));
const aborted=(error:unknown)=>error instanceof DOMException&&error.name==='AbortError'||(error instanceof Error&&error.message==='Operation cancelled');

/** Library and model files, chosen explicitly; nothing is bundled or downloaded. */
export function CrispFiles({kinds}:{kinds:(keyof CrispasrPaths)[]}){
 const {t}=useTranslation(),paths=useSettingsStore(s=>s.crispasr),setPath=useSettingsStore(s=>s.setCrispasrPath),[status,setStatus]=useState<CrispStatus|null>(null),desktop=crispDesktop();
 useEffect(()=>{if(!desktop)return;let live=true;void crispStatus(paths.library).then(s=>{if(live)setStatus(s);}).catch(e=>{if(live)setStatus({available:false,error:e instanceof Error?e.message:String(e)});});return()=>{live=false;};},[paths.library,desktop]);
 if(!desktop)return <p className="text-xs text-gray-400">{t('crisp.desktopOnly')}</p>;
 const choose=async(key:keyof CrispasrPaths)=>{const {open}=await import('../../lib/nativeDialog');const picked=await open({multiple:false,title:t(`crisp.file.${key}`),filters:[{name:t(`crisp.file.${key}`),extensions:key==='library'?['dylib','so','dll']:['gguf','bin']}]});if(typeof picked==='string')setPath(key,picked);};
 return <details className="text-xs" open={!status?.available||kinds.some(k=>!paths[k])}><summary className="min-h-11 content-center cursor-pointer">{t('crisp.files')}</summary><div className="space-y-1">
  {(['library',...kinds] as (keyof CrispasrPaths)[]).map(key=><div key={key} className="flex items-center gap-1 min-w-0"><span className="flex-1 min-w-0 truncate" title={paths[key]||undefined}>{t(`crisp.file.${key}`)}: {paths[key]?fileName(paths[key]):key==='library'?t('crisp.libraryAuto'):t('crisp.none')}</span><ToolButton icon={FolderOpen} label={t('crisp.choose')} onClick={()=>void choose(key)}/>{paths[key]&&<ToolButton icon={X} label={t('crisp.clear')} onClick={()=>setPath(key,'')}/>}</div>)}
  {status&&<p role="status" className={status.available?'text-gray-400 break-all':'text-amber-300 break-words'}>{status.available?t('crisp.libraryLoaded',{path:status.path??''}):t(status.error??'crisp.libraryMissing')}</p>}
 </div></details>;
}

type SourceTool='separate'|'speech';
/** Source-editor preview: the result becomes the editor's ordinary draft, so
 * A/B audition, Apply ownership, retained originals and Undo stay unchanged. */
export function SourceCrispTools({clipId,channels,ranges,rate,channel,disabled,onPrepare,onPreview}:{clipId:string;channels:Float32Array[];ranges:SampleRange[];rate:number;channel:number;disabled:boolean;onPrepare:()=>()=>boolean;onPreview:(pcm:Float32Array[],kind:SourceTool,params:Record<string,number>)=>void}){
 const {t}=useTranslation(),paths=useSettingsStore(s=>s.crispasr),[tool,setTool]=useState<SourceTool>('separate'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[open,setOpen]=useState(false);
 const [stored,setResult]=useState<{stems:CrispStem[];offset:number;tool:SourceTool;inputs:unknown[]}|null>(null),[stem,setStem]=useState(0),job=useRef<AbortController|null>(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;job.current?.abort();};},[]);
 useEffect(()=>{job.current?.abort();},[channels,ranges,rate,channel,disabled]);
 // A result belongs to the exact inputs it was prepared from.
 const inputs=[channels,ranges,rate,channel],result=stored&&!disabled&&stored.inputs.every((v,i)=>v===inputs[i])?stored:null;
 const fade=Math.max(1,Math.round(rate*.005)),context=Math.round(rate*2);
 const preview=(next:{stems:CrispStem[];offset:number;tool:SourceTool;inputs:unknown[]},index:number)=>{try{onPreview(blendSelection(channels,next.stems[index].channels,next.offset,ranges,channel,fade),next.tool,{stem:index,contextSeconds:2,fadeMs:5});setError('');}catch(e){setError(message(t,e));}};
 const run=async(whole:boolean)=>{
  job.current?.abort();const controller=new AbortController();job.current=controller;
  if(disabled||useUIStore.getState().timelineRecording)return null;
  const snapshot=useProjectStore.getState().project,valid=whole?()=>true:onPrepare();
  const unsubscribe=useUIStore.subscribe(s=>{if(s.timelineRecording)controller.abort();});
  setBusy(true);setError('');setStatus('');
  try{
   const window=whole?{start:0,end:channels[0].length}:processingWindow(ranges,channels[0].length,context);
   const kind=whole?'separate':tool;
   const stems=await crispProcess(kind,paths.library,kind==='separate'?paths.separation:paths.speech,channels.map(c=>c.slice(window.start,window.end)),rate,controller.signal);
   if(!alive.current||!valid()||controller.signal.aborted||useProjectStore.getState().project!==snapshot)return null;
   return {stems,offset:window.start,tool:kind,inputs};
  }catch(e){if(alive.current&&!controller.signal.aborted&&!aborted(e))setError(message(t,e));return null;}
  finally{unsubscribe();if(alive.current&&job.current===controller)setBusy(false);}
 };
 const prepare=async()=>{const next=await run(false);if(!next)return;const vocals=Math.max(0,next.stems.findIndex(s=>/vocal|speech/i.test(s.name)));setResult(next);setStem(vocals);preview(next,vocals);};
 const addTracks=async()=>{
  const next=result?.tool==='separate'&&result.offset===0&&result.stems[0].channels[0].length===channels[0].length?result:await run(true);
  if(!next||!alive.current)return;
  const controller=new AbortController();job.current=controller;setBusy(true);
  try{
   const state=useProjectStore.getState(),track=state.project.tracks.find(tr=>tr.segments.some(c=>c.id===clipId));
   const {mutedOriginal}=await commitStemTracks({snapshot:{project:state.project,sources:state.sources,isPlaying:state.isPlaying},clipId,stems:next.stems,trackName:name=>t('crisp.trackName',{track:track?.name??'',stem:name}),sourceName:name=>t('crisp.sourceName',{stem:name})},()=>{if(useUIStore.getState().timelineRecording)controller.abort();const s=useProjectStore.getState();return {project:s.project,sources:s.sources,isPlaying:s.isPlaying};},s=>useProjectStore.setState(s),controller.signal);
   if(alive.current)setStatus(t(mutedOriginal?'crisp.tracksAddedMuted':'crisp.tracksAdded',{count:next.stems.length}));
  }catch(e){if(alive.current&&!aborted(e))setError(message(t,e));}
  finally{if(alive.current&&job.current===controller)setBusy(false);}
 };
 return <details data-source-crisp onToggle={e=>setOpen(e.currentTarget.open)}><summary className="min-h-11 content-center cursor-pointer">{t('crisp.title')}</summary>{open&&<div className="space-y-2">
  <CrispFiles kinds={[tool==='separate'?'separation':'speech']}/>
  <fieldset disabled={disabled} className="space-y-2"><div className="flex items-center gap-1">
   <select aria-label={t('crisp.tool')} value={tool} className="min-h-11 min-w-0 flex-1 rounded bg-gray-800 px-2" onChange={e=>{job.current?.abort();setTool(e.target.value as SourceTool);setResult(null);setError('');}}>{(['separate','speech'] as const).map(kind=><option key={kind} value={kind}>{t(`crisp.${kind}`)}</option>)}</select>
   <ToolButton icon={Wand2} label={t('crisp.prepare')} disabled={busy} onClick={()=>void prepare()}/>
   {tool==='separate'&&<ToolButton icon={Layers} label={t('crisp.addTracks')} disabled={busy} onClick={()=>void addTracks()}/>}
   <InfoButton label={t('crisp.helpLabel',{tool:t('crisp.title')})}>{t(`crisp.${tool}Help`)} {t('crisp.limits')}</InfoButton>
  </div>
  {result&&result.tool==='separate'&&result.stems.length>1&&<label className="flex items-center justify-between gap-2 text-xs">{t('crisp.stem')}<select aria-label={t('crisp.stem')} value={stem} className="min-h-11 rounded bg-gray-800 px-2" onChange={e=>{const index=Number(e.target.value);setStem(index);preview(result,index);}}>{result.stems.map((s,i)=><option key={s.name} value={i}>{s.name}</option>)}</select></label>}
  {tool==='speech'&&<p className="text-xs text-amber-300">{t('crisp.generative')}</p>}
  </fieldset>
  {busy&&<div className="flex items-center gap-2"><span className="text-xs" role="status">{t('crisp.processing')}</span><button className="timeline-tool" onClick={()=>job.current?.abort()}>{t('common.cancel')}</button></div>}
  {status&&<p className="text-xs" role="status">{status}</p>}
  {error&&<p role="alert" className="text-amber-300 text-xs break-words">{error}</p>}
 </div>}</details>;
}

function useAnalysisJob(){
 const job=useRef<AbortController|null>(null),alive=useRef(true),[busy,setBusy]=useState(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;job.current?.abort();};},[]);
 const start=()=>{job.current?.abort();const controller=new AbortController();job.current=controller;setBusy(true);const unsubscribe=useUIStore.subscribe(s=>{if(s.timelineRecording)controller.abort();});return {controller,done:()=>{unsubscribe();if(alive.current&&job.current===controller)setBusy(false);}};};
 return {busy,alive,start,cancel:()=>job.current?.abort()};
}
/** Render the arrangement's mix (or edit range) and downmix/resample for analysis. */
async function mixForAnalysis(engine:import('../../audio/engine/TimelineEngine').TimelineEngine|null|undefined,project:TimelineProject,onlyRange:boolean,rate:number,signal:AbortSignal){
 if(!engine)throw new Error('crisp.noEngine');
 const range=onlyRange&&project.editRange?project.editRange:{start:0,end:project.duration};
 const buffer=await engine.renderMixRange(project,range.start,range.end,signal);signal.throwIfAborted();
 return {range,mono:await analysisPcm(buffer,rate)};
}

/** Find interior pauses with voice activity detection and shorten them across
 * every lane in one reviewed, undoable range edit. */
export function PauseTightening(){
 const {t}=useTranslation(),engine=useContext(TimelineEngineContext),project=useProjectStore(s=>s.project),paths=useSettingsStore(s=>s.crispasr),recording=useUIStore(s=>s.timelineRecording),{busy,alive,start,cancel}=useAnalysisJob();
 const [minPause,setMinPause]=useState(.8),[keep,setKeep]=useState(.3),[onlyRange,setOnlyRange]=useState(false),[error,setError]=useState(''),[open,setOpen]=useState(false);
 const [review,setReview]=useState<{project:TimelineProject;pauses:{start:number;end:number}[]}|null>(null);
 const analyze=async()=>{const {controller,done}=start();const snapshot=useProjectStore.getState().project;setError('');setReview(null);
  try{const {range,mono}=await mixForAnalysis(engine?.current,snapshot,onlyRange,16000,controller.signal);
   const regions=(await crispRegions(paths.library,paths.vad,mono,16000,{},controller.signal)).map(([a,b])=>[a+range.start,b+range.start] as [number,number]);
   if(alive.current&&!controller.signal.aborted)setReview({project:snapshot,pauses:planPauses(regions,minPause)});
  }catch(e){if(alive.current&&!controller.signal.aborted&&!aborted(e))setError(message(t,e));}finally{done();}};
 let cuts:{start:number;end:number}[]=[],cutError='';
 if(review)try{cuts=pauseCuts(review.pauses,keep,review.project.video?review.project.frameRate??25:undefined);}catch(e){cutError=message(t,e);}
 const stale=!!review&&review.project!==project,removed=cuts.reduce((n,c)=>n+c.end-c.start,0);
 const apply=()=>{try{if(!review||useProjectStore.getState().project!==review.project)throw new Error('crisp.changed');const next=tightenPauses(review.project,review.pauses,keep);useProjectStore.setState({project:next,isPlaying:false,selection:null,playheadPosition:0});setReview(null);setError('');}catch(e){setError(message(t,e));}};
 return <details className="border-t border-gray-700 pt-2" data-pause-tightening onToggle={e=>setOpen(e.currentTarget.open)}><summary className="cursor-pointer py-2">{t('crisp.pauses.title')}</summary>{open&&<div className="space-y-2">
  <div className="flex items-center gap-1"><p className="flex-1 text-xs text-gray-400">{t('crisp.pauses.help')}</p><InfoButton label={t('crisp.helpLabel',{tool:t('crisp.pauses.title')})}>{t('crisp.pauses.info')}</InfoButton></div>
  <CrispFiles kinds={['vad']}/>
  <fieldset disabled={recording||busy} className="space-y-1">
   <label className="flex items-center justify-between gap-2 text-xs">{t('crisp.pauses.minPause')}<NumberField label={t('crisp.pauses.minPause')} value={minPause} min={.1} max={10} step={.05} width="w-24" onCommit={v=>{setMinPause(v);setReview(null);return true;}}/></label>
   <label className="flex items-center justify-between gap-2 text-xs">{t('crisp.pauses.keep')}<NumberField label={t('crisp.pauses.keep')} value={keep} min={0} max={5} step={.05} width="w-24" onCommit={v=>{setKeep(v);return true;}}/></label>
   {project.editRange&&<label className="flex items-center gap-2 text-xs min-h-11"><input type="checkbox" checked={onlyRange} onChange={e=>{setOnlyRange(e.target.checked);setReview(null);}}/>{t('crisp.pauses.onlyRange')}</label>}
   <div className="flex flex-wrap gap-1"><button className="timeline-tool" onClick={()=>void analyze()}>{t('crisp.pauses.analyze')}</button>{review&&!stale&&cuts.length>0&&<ToolButton icon={Scissors} label={t('crisp.pauses.apply')} onClick={apply}/>}</div>
  </fieldset>
  {busy&&<div className="flex items-center gap-2"><span className="text-xs" role="status">{t('crisp.analyzing')}</span><button className="timeline-tool" onClick={cancel}>{t('common.cancel')}</button></div>}
  {review&&<p role="status" className="text-xs">{cuts.length?t('crisp.pauses.summary',{count:cuts.length,removed:removed.toFixed(2)}):t('crisp.pauses.none')}</p>}
  {stale&&<p role="alert" className="text-amber-300 text-xs">{t('crisp.changed')}</p>}
  {review&&cuts.length>0&&<ul className="max-h-40 overflow-auto text-xs space-y-0.5">{cuts.slice(0,200).map(c=><li key={c.start} className="flex items-center gap-1"><ToolButton icon={Play} label={t('crisp.pauses.seek',{time:c.start.toFixed(2)})} onClick={()=>{const s=useProjectStore.getState();s.setIsPlaying(false);s.setPlayheadPosition(Math.max(0,c.start-1));}}/>{c.start.toFixed(2)}–{c.end.toFixed(2)} s</li>)}</ul>}
  {(error||cutError)&&<p role="alert" className="text-amber-300 text-xs break-words">{error||cutError}</p>}
 </div>}</details>;
}

/** Beat This! analysis of the mix: set tempo/meter/bar origin and/or add bar markers. */
export function BeatDetection(){
 const {t}=useTranslation(),engine=useContext(TimelineEngineContext),project=useProjectStore(s=>s.project),paths=useSettingsStore(s=>s.crispasr),recording=useUIStore(s=>s.timelineRecording),{busy,alive,start,cancel}=useAnalysisJob();
 const [onlyRange,setOnlyRange]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[open,setOpen]=useState(false),[review,setReview]=useState<{project:TimelineProject;grid:BeatGrid;offset:number}|null>(null);
 const analyze=async()=>{const {controller,done}=start();const snapshot=useProjectStore.getState().project;setError('');setStatus('');setReview(null);
  try{const {range,mono}=await mixForAnalysis(engine?.current,snapshot,onlyRange,22050,controller.signal);const grid=await crispBeats(paths.library,paths.beats,mono,22050,controller.signal);if(alive.current&&!controller.signal.aborted)setReview({project:snapshot,grid,offset:range.start});}
  catch(e){if(alive.current&&!controller.signal.aborted&&!aborted(e))setError(message(t,e));}finally{done();}};
 const stale=!!review&&review.project!==project,music=review?musicFromBeats({...review.grid,beats:review.grid.beats.map(b=>({...b,time:b.time+review.offset}))},review.project.music):undefined;
 const commit=(change:(p:TimelineProject)=>TimelineProject,done:string)=>{try{const current=useProjectStore.getState().project;if(!review||current!==review.project)throw new Error('crisp.changed');const next=change(current);useProjectStore.setState({project:next});setReview({...review,project:next});setStatus(done);setError('');}catch(e){setError(message(t,e));}};
 const meter=review?downbeatMeter(review.grid):undefined,bars=meter?review!.grid.beats.filter(b=>b.downbeat).length:0;
 return <details className="border-t border-gray-700 pt-2" data-beat-detection onToggle={e=>setOpen(e.currentTarget.open)}><summary className="cursor-pointer py-2">{t('crisp.beats.title')}</summary>{open&&<div className="space-y-2">
  <div className="flex items-center gap-1"><p className="flex-1 text-xs text-gray-400">{t('crisp.beats.help')}</p><InfoButton label={t('crisp.helpLabel',{tool:t('crisp.beats.title')})}>{t('crisp.beats.info')}</InfoButton></div>
  <CrispFiles kinds={['beats']}/>
  <fieldset disabled={recording||busy} className="space-y-1">
   {project.editRange&&<label className="flex items-center gap-2 text-xs min-h-11"><input type="checkbox" checked={onlyRange} onChange={e=>{setOnlyRange(e.target.checked);setReview(null);}}/>{t('crisp.pauses.onlyRange')}</label>}
   <div className="flex flex-wrap gap-1"><ToolButton icon={AudioWaveform} label={t('crisp.beats.analyze')} onClick={()=>void analyze()}/>
    {review&&!stale&&music&&<button className="timeline-tool" onClick={()=>commit(p=>({...p,music}),t('crisp.beats.tempoApplied'))}>{t('crisp.beats.applyTempo')}</button>}
    {review&&!stale&&bars>0&&<button className="timeline-tool" onClick={()=>commit(p=>({...p,markers:[...(p.markers??[]),...beatMarkers(review.grid,review.offset,true,bar=>t('crisp.beats.bar',{bar}))]}),t('crisp.beats.markersAdded',{count:bars}))}>{t('crisp.beats.addMarkers')}</button>}
   </div>
  </fieldset>
  {busy&&<div className="flex items-center gap-2"><span className="text-xs" role="status">{t('crisp.analyzing')}</span><button className="timeline-tool" onClick={cancel}>{t('common.cancel')}</button></div>}
  {review&&<p role="status" className="text-xs">{!music?t('crisp.beats.noTempo'):meter?t('crisp.beats.summary',{tempo:music.tempo.toFixed(2),meter:music.numerator,beats:review.grid.beats.length,bars}):t('crisp.beats.tempoOnly',{tempo:music.tempo.toFixed(2),beats:review.grid.beats.length})}</p>}
  {stale&&<p role="alert" className="text-amber-300 text-xs">{t('crisp.changed')}</p>}
  {status&&<p role="status" className="text-xs">{status}</p>}
  {error&&<p role="alert" className="text-amber-300 text-xs break-words">{error}</p>}
 </div>}</details>;
}
