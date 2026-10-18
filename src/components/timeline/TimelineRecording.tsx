import {nativeSourceOwner} from '../../audio/engine/NativeSourceOwner';
import {authorizeNativeRecording} from '../../audio/plugins/NativeRecordingPermission';
import {NativeRecordingRecovery} from './NativeRecordingRecovery';
import {NativeRecordingMix} from './NativeRecordingMix';
import {NativeRecordingSetup} from './NativeRecordingSetup';
import {NativeRecordingController,NativeRecordingFailure,nativeRecordingOptions} from '../../audio/plugins/NativeRecordingController';
import {NativeTimelineRecording,type NativeRecordingOptions,type NativeRecordingStatus} from '../../audio/plugins/NativeTimelineRecording';
import {playbackOutputs} from '../../lib/audioOutput';
import {useSettingsStore} from '../../stores/settingsStore';
import {useProjectGesture} from '../../hooks/useProjectGesture';
import {ParamSlider} from '../shared/ParamSlider';
import {recordingLeadIn} from '../../lib/recordingLeadIn';
import {InfoButton} from '../common/InfoButton';
import {TimelineMetronome} from '../../audio/engine/TimelineMetronome';
import {prepareRecordingBacking,playRecordingBacking,extendRecordingPasses,startRecordingMetronome} from '../../audio/engine/RecordingBacking';
import {hasNativeEffects} from '../../lib/nativeEffects';
import {selectionTrackIds} from '../../lib/trackSelection';
import {RecordingInputMeter} from './RecordingInputMeter';
import {useRecordingMeterStore} from '../../stores/recordingMeterStore';
import {previewOwner,previewMatches,type RecordingPreviewOwner} from '../../lib/recordingPreview';
import {Circle,Plus,Square,ChevronDown} from 'lucide-react';
import {ToolButton} from '../common/ToolButton';
import {HelpDetails} from '../common/HelpDetails';
import {TakeLanes} from './TakeLanes';
import {isNativeMac,menuBlocked,textEditing} from '../../lib/nativeMenu';
import {calibrationSignal,measuredLatency} from '../../lib/recordingLatency';
import {useEffect,useRef,useState,useCallback,type RefObject} from 'react';
import {useTranslation} from 'react-i18next';
import {invoke} from '@tauri-apps/api/core';
import type {TimelineEngine} from '../../audio/engine/TimelineEngine';
import {TimelineCapture,type InputMode} from '../../audio/engine/TimelineCapture';
import type {AudioEngineHandle} from '../../hooks/useAudioEngine';
import {useProjectStore} from '../../stores/projectStore';
import {useUIStore} from '../../stores/uiStore';
import {waitForPreviewFrame} from '../../lib/videoTransport';
import {encodeAudioBufferWav} from '../../lib/wavExport';
import {computeWaveformPeaks} from '../../audio/utils/audioBufferUtils';
import {capturedTakes,type CapturePass} from '../../lib/capturedTakes';
import {quickRecordingTrack,recordingTargets,publishRecordingGroup,defaultRecordingInput,type PreparedRecording} from '../../lib/recordingGroup';
import {FloatingInspector} from '../common/FloatingInspector';
import {NumberField} from './NumberField';
import type {RecordingInput,TimelineProject,AudioSource} from '../../types/audio';
const defaultInput=defaultRecordingInput;
interface Session {leadClick?:TimelineMetronome;recordStart?:number;recordFrame?:number;click?:TimelineMetronome;backing?:AudioBuffer;sources:Map<string,AudioSource>;snapshot:TimelineProject;targets:{trackId:string;input:RecordingInput;capture:TimelineCapture}[];passes:CapturePass[];window?:{start:number;end:number};loop:boolean;controller:AbortController;stopping:boolean;frame:number;retainPreview:boolean}
interface NativeSession {id:string;phase:NativeRecordingStatus['phase'];controller:NativeRecordingController;snapshot:TimelineProject;targets:{trackId:string;input:RecordingInput}[];selectedId:string;options?:NativeRecordingOptions;timer?:ReturnType<typeof setInterval>;polling:boolean;stopping?:Promise<void>;faults:Set<string>}
export function TimelineRecording({engine,audio}:{engine:RefObject<TimelineEngine|null>;audio:AudioEngineHandle}){
 const {t}=useTranslation(),project=useProjectStore(s=>s.project),recording=useUIStore(s=>s.timelineRecording),[open,setOpen]=useState(false),[takesOpen,setTakesOpen]=useState(false),[trackId,setTrackId]=useState(''),[devices,setDevices]=useState<MediaDeviceInfo[]>([]),[connected,setConnected]=useState(false),[monitoring,setMonitoring]=useState(false),[cueLatency,setCueLatency]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[peak,setPeak]=useState(0),[channels,setChannels]=useState(0),[remaining,setRemaining]=useState(0),[leadPhase,setLeadPhase]=useState<'delay'|'count'|'preRoll'>(),[preparingBacking,setPreparingBacking]=useState(false),[allArmed,setAllArmed]=useState(false),[punch,setPunch]=useState(false),[loop,setLoop]=useState(false),[crossfade,setCrossfade]=useState(.04),[calibration,setCalibration]=useState<{milliseconds:number;confidence:number}>();
 const [recovering,setRecovering]=useState(false);
 const nativeEnabled=useSettingsStore(s=>s.nativeRecording),nativeMode=nativeEnabled&&isNativeMac();
 const nativeSession=useRef<NativeSession|null>(null),[liveNativeSession,setLiveNativeSession]=useState<NativeSession|null>(null);
 const cueGesture=useProjectGesture();
 const owner=useRef<RecordingPreviewOwner|null>(null),preferred=useRef('');
 const capture=useRef<TimelineCapture|null>(null),session=useRef<Session|null>(null),mounted=useRef(true),finish=useRef<()=>Promise<void>>(async()=>{}),calibrationController=useRef<AbortController|null>(null);
 const track=project.tracks.find(t=>t.id===trackId)??project.tracks.find(t=>t.kind!=='bus'&&t.recordArmed)??project.tracks.find(t=>t.kind!=='bus'),input=track?.recordingInput??defaultInput;
 useEffect(()=>{preferred.current=trackId;},[trackId]);
 useEffect(()=>{let previous=useProjectStore.getState().project;return useProjectStore.subscribe(state=>{if(state.project===previous)return;previous=state.project;if(owner.current&&!session.current&&!previewMatches(owner.current,state.project,preferred.current)){useRecordingMeterStore.getState().clear(owner.current.trackId);capture.current?.disconnect();capture.current=null;owner.current=null;setConnected(false);setMonitoring(false);setPeak(0);setChannels(0);}else if(owner.current&&!session.current&&capture.current){const target=state.project.tracks.find(t=>t.id===owner.current!.trackId);if(target){const nextInput=target.recordingInput??defaultInput;capture.current.configureCue(nextInput,target.nativeEffects,reason=>{setMonitoring(false);setCueLatency(0);setError(t(reason));});if(!nextInput.monitor){void capture.current.monitoring(false);setMonitoring(false);setCueLatency(0);}}}});},[t]);
 const refresh=async()=>{const devices=await navigator.mediaDevices.enumerateDevices();if(mounted.current)setDevices(devices.filter(d=>d.kind==='audioinput'));};
 const disconnect=()=>{useRecordingMeterStore.getState().clear(owner.current?.trackId);calibrationController.current?.abort();capture.current?.disconnect();capture.current=null;owner.current=null;setConnected(false);setMonitoring(false);setPeak(0);setChannels(0);};
 const configure=(patch:Partial<RecordingInput>)=>{if(!track||recording)return;if('deviceId' in patch||'channel' in patch||'monitorFx' in patch||'native' in patch)disconnect();useProjectStore.getState().updateTrack(track.id,{recordingInput:{...input,...patch}});};
 const connect=async()=>{if(!track||track.locked||track.kind==='bus')throw new Error('recording.locked');capture.current?.disconnect();const recorder=new TimelineCapture(audio.getContext(),audio.masterGain,(peak,channels)=>{if(mounted.current){useRecordingMeterStore.getState().update(track.id,peak,channels);setPeak(peak);setChannels(channels);}},reason=>{if(mounted.current)setError(t(reason));void finish.current();});capture.current=recorder;owner.current=previewOwner(project,track.id,input);try{await nativeSourceOwner.stop();if(!mounted.current||capture.current!==recorder||useProjectStore.getState().project!==project){recorder.disconnect();return;}if(input.monitor&&input.monitorFx&&!isNativeMac())throw new Error('recording.cueMac');recorder.configureCue(input,track.nativeEffects,reason=>{if(mounted.current){setMonitoring(false);setCueLatency(0);setError(t(reason));}});await recorder.connect(input.deviceId,input.channel);}catch(error){recorder.disconnect();if(capture.current===recorder)disconnect();throw error;}if(capture.current!==recorder||!previewMatches(owner.current,useProjectStore.getState().project,trackId)){recorder.disconnect();return;}try{await recorder.monitoring(input.monitor);}catch(error){recorder.disconnect();if(capture.current===recorder)disconnect();throw error;}if(capture.current!==recorder||!previewMatches(owner.current,useProjectStore.getState().project,trackId)){recorder.disconnect();return;}if(mounted.current){setCueLatency(recorder.monitorLatency());setConnected(true);setMonitoring(input.monitor);await refresh();}};
 const stopRecording=useCallback(async()=>{
  const native=nativeSession.current;
  if(native){
   if(native.stopping){if(!mounted.current)void native.controller.stop(true);return native.stopping;}
   native.stopping=(async()=>{
    clearInterval(native.timer);useProjectStore.getState().setIsPlaying(false);if(mounted.current)setBusy(true);
    try{const cancel=!mounted.current||native.phase==='preparing'||native.phase==='lead';const result=await native.controller.stop(cancel);if(result.next&&mounted.current&&!cancel)useProjectStore.setState({...result.next,isPlaying:false});}
    catch(error){if(mounted.current)setError(t(error instanceof Error?error.message:String(error))+(error instanceof NativeRecordingFailure&&error.directory?' · '+error.directory:''));}
    finally{
     for(const target of native.targets)useRecordingMeterStore.getState().clear(target.trackId);
     if(nativeSession.current===native)nativeSession.current=null;useUIStore.setState({timelineRecording:false,nativePreviewStatus:'idle'});
     if(mounted.current){setLiveNativeSession(null);setBusy(false);setRemaining(0);setLeadPhase(undefined);setPeak(0);setChannels(0);setMonitoring(false);}
    }
   })();return native.stopping;
  }
  const active=session.current;if(!active||active.stopping)return;active.stopping=true;active.leadClick?.stop();active.leadClick=undefined;active.click?.stop();active.click=undefined;active.controller.abort();cancelAnimationFrame(active.frame);useProjectStore.getState().setIsPlaying(false);engine.current?.stop();
  const usable=active.recordFrame!==undefined&&audio.getContext().currentTime*audio.getContext().sampleRate>active.recordFrame+.01*audio.getContext().sampleRate;
  const savedPaths:string[]=[];
  try{
   if(active.backing&&active.loop&&active.window&&active.passes.length)extendRecordingPasses(active.passes,Math.ceil(audio.getContext().currentTime*audio.getContext().sampleRate),audio.getContext().sampleRate,active.window);
   if(!active.passes.length||!usable)return;
   const stopFrame=Math.ceil(audio.getContext().currentTime*audio.getContext().sampleRate);
   const captured=await Promise.all(active.targets.map(target=>target.capture.stop(stopFrame)));
   if(captured.some(value=>!value))throw new Error('recording.empty');
   const prepared:PreparedRecording[]=[];const notes:string[]=[];
   for(let i=0;i<active.targets.length;i++){
    const target=active.targets[i],value=captured[i]!,raw=value.buffer,sourceId=crypto.randomUUID();let buffer=raw;
    if(raw.sampleRate!==active.snapshot.sampleRate){const offline=new OfflineAudioContext(raw.numberOfChannels,Math.round(raw.duration*active.snapshot.sampleRate),active.snapshot.sampleRate),node=offline.createBufferSource();node.buffer=raw;node.connect(offline.destination);node.start();buffer=await offline.startRendering();}
    let filePath:string|undefined,originalPath:string|undefined;
    if('__TAURI_INTERNALS__' in window){const wav=await encodeAudioBufferWav(raw,32);originalPath=await invoke<string>('persist_recording',new Uint8Array(await wav.arrayBuffer()));savedPaths.push(originalPath);filePath=originalPath;if(buffer!==raw){const derived=await encodeAudioBufferWav(buffer,32);filePath=await invoke<string>('persist_recording',new Uint8Array(await derived.arrayBuffer()));}window.dispatchEvent(new CustomEvent('crispaudio-recording-original',{detail:{path:originalPath,trackId:target.trackId}}));}
    const takes=capturedTakes({firstFrame:value.firstFrame,frames:raw.length,sampleRate:raw.sampleRate,passes:active.passes,sourceId,name:t('recording.take'),latencyMs:target.input.latencyMs,recordStart:active.recordStart,window:active.window,notes:value.notes,droppedFrames:value.droppedFrames}).map(take=>({...take,duration:Math.min(take.duration,buffer.duration-take.sourceOffset)})).filter(take=>take.duration>=.01);
    const source:AudioSource={id:sourceId,name:t('recording.captured'),buffer,duration:buffer.duration,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,filePath,...(originalPath&&buffer!==raw?{provenance:{path:originalPath,offset:0,rate:1}}:{}),peaks:computeWaveformPeaks(buffer.getChannelData(0),Math.min(8000,Math.ceil(buffer.duration*200)))};
    prepared.push({trackId:target.trackId,source,takes});if(value.droppedFrames||value.notes.length)notes.push(`${active.snapshot.tracks.find(t=>t.id===target.trackId)?.name}: ${value.droppedFrames} · ${value.notes.map(n=>t(n)).join(', ')}`);
   }
   const state=useProjectStore.getState(),next=publishRecordingGroup(active.snapshot,state.project,state.sources,prepared,crossfade,active.window);useProjectStore.setState({...next,isPlaying:false});
   if(notes.length&&mounted.current)setError(`${t('recording.captureNotes')}: ${notes.join('; ')}`);
  }catch(e){if(mounted.current)setError(t(e instanceof Error?e.message:String(e))+(savedPaths.length?' '+savedPaths.join(' · '):''));}
  finally{
   await Promise.all(active.targets.map(target=>target.capture.monitoring(false)));
   for(const target of active.targets){if(target.capture!==capture.current||!usable||!mounted.current||!active.retainPreview){target.capture.disconnect();useRecordingMeterStore.getState().clear(target.trackId);}}
   if(!usable||!active.retainPreview){capture.current=null;owner.current=null;if(mounted.current){setConnected(false);setPeak(0);setChannels(0);}}
   session.current=null;if(owner.current&&!previewMatches(owner.current,useProjectStore.getState().project,preferred.current)){capture.current?.disconnect();capture.current=null;owner.current=null;if(mounted.current){setConnected(false);setChannels(0);setPeak(0);}}useUIStore.setState({timelineRecording:false});if(mounted.current){setBusy(false);setPreparingBacking(false);setRemaining(0);setLeadPhase(undefined);setMonitoring(false);useUIStore.setState({nativePreviewStatus:'idle'});}
  }
 },[engine,audio,crossfade,t]);
 useEffect(()=>{finish.current=stopRecording;},[stopRecording]);
 useEffect(()=>{const stop=()=>{if(nativeSession.current)void finish.current();};window.addEventListener('crispaudio-transport-stop',stop);return()=>window.removeEventListener('crispaudio-transport-stop',stop);},[]);
 const calibrate=async()=>{
  if(recording||!track)return;setBusy(true);setError('');setCalibration(undefined);const controller=new AbortController();calibrationController.current=controller;let tone:AudioBufferSourceNode|undefined;const snapshot=project;
  try{
   await nativeSourceOwner.stop();controller.signal.throwIfAborted();
   await audio.resume();if(!capture.current?.connected())await connect();controller.signal.throwIfAborted();await capture.current!.monitoring(false);setMonitoring(false);
   const ctx=audio.getContext(),reference=calibrationSignal(ctx.sampleRate),buffer=ctx.createBuffer(1,reference.length,ctx.sampleRate);buffer.copyToChannel(reference,0);const when=ctx.currentTime+.2;
   capture.current!.start();tone=ctx.createBufferSource();tone.buffer=buffer;tone.connect(audio.masterGain);tone.start(when);
   await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(resolve,1300);controller.signal.addEventListener('abort',()=>{clearTimeout(timeout);reject(new DOMException('Calibration cancelled','AbortError'));},{once:true});});controller.signal.throwIfAborted();const captured=await capture.current!.stop();if(!captured||captured.droppedFrames||captured.notes.length)throw new Error('recording.calibrationMissing');
   const result=await measuredLatency(captured.buffer.getChannelData(0),reference,Math.round(when*ctx.sampleRate)-captured.firstFrame,ctx.sampleRate,controller.signal);controller.signal.throwIfAborted();if(useProjectStore.getState().project!==snapshot)throw new Error('recording.projectChanged');if(mounted.current)setCalibration(result);
  }catch(e){if(!controller.signal.aborted&&mounted.current)setError(t(e instanceof Error?e.message:String(e)));}
  finally{try{tone?.stop();}catch{/* Tone may have ended. */}tone?.disconnect();if(calibrationController.current===controller)calibrationController.current=null;if(mounted.current)setBusy(false);}
 };
 const record=async()=>{
  if(session.current||nativeSession.current||recording){await finish.current();return;}if(busy||recovering||!engine.current)return;
  if(hasNativeEffects(useProjectStore.getState().project)&&!isNativeMac()){setError(t('nativePreview.macOnly'));setOpen(true);return;}
  let snapshot=useProjectStore.getState().project,selectedId:string,targets:ReturnType<typeof recordingTargets>;
  try{const state=useProjectStore.getState();let chosen=quickRecordingTrack(snapshot,preferred.current,selectionTrackIds(snapshot,state.selection).find(id=>snapshot.tracks.some(t=>t.id===id&&t.kind!=='bus')));if(!chosen){state.addTrack(t('recording.newTrack'));chosen=useProjectStore.getState().project.tracks.at(-1)!;}selectedId=chosen.id;if(!chosen.recordArmed)useProjectStore.getState().updateTrack(selectedId,{recordArmed:true});snapshot=useProjectStore.getState().project;preferred.current=selectedId;setTrackId(selectedId);targets=recordingTargets(snapshot,selectedId,allArmed);}catch(e){setError(t(e instanceof Error?e.message:String(e)));return;}
  setError('');setBusy(true);useProjectStore.getState().setIsPlaying(false);useUIStore.setState({timelineRecording:true});
  if(nativeMode){
   disconnect();engine.current.stop();
   const window=(punch||loop)?snapshot.editRange:undefined;
   const spec={project:snapshot,sources:useProjectStore.getState().sources,targets,cursor:useProjectStore.getState().playheadPosition,window,loop,crossfade,output:useSettingsStore.getState().nativeRecordingOutput,current:()=>useProjectStore.getState(),context:audio.getContext(),takeName:t('recording.take'),sourceName:t('recording.captured')};
   const controller=new NativeRecordingController(spec);
   const active:NativeSession={id:crypto.randomUUID(),phase:'preparing',controller,snapshot,targets,selectedId,polling:false,faults:new Set()};nativeSession.current=active;setLiveNativeSession(active);
   try{
    if((punch||loop)&&!window)throw new Error('recording.rangeRequired');
    await nativeSourceOwner.stop();
    if(nativeSession.current!==active||active.stopping)return;
    await engine.current.closeNativeOwned();
    if(nativeSession.current!==active||active.stopping)return;
    const [inventory,outputs]=await Promise.all([NativeTimelineRecording.inputs(),playbackOutputs()]);
    if(nativeSession.current!==active||active.stopping)return;
    const authorized=await authorizeNativeRecording(inventory,()=>nativeSession.current===active&&!active.stopping&&useProjectStore.getState().project===snapshot);
    if(nativeSession.current!==active||active.stopping)return;
    const options=nativeRecordingOptions(spec,authorized,outputs.devices);active.options=options;
    await controller.start(options);
    if(nativeSession.current!==active||active.stopping)return;
    useProjectStore.getState().setIsPlaying(true);
    const tick=async()=>{
     if(nativeSession.current!==active||active.stopping||active.polling)return;
     if(useProjectStore.getState().project!==snapshot||!useProjectStore.getState().isPlaying){void finish.current();return;}
     active.polling=true;
     try{
      const status=await controller.status();if(nativeSession.current!==active||active.stopping)return;active.phase=status.phase;
      for(const input of status.inputs??[]){useRecordingMeterStore.getState().update(input.trackId,Math.max(...input.peaks),input.channels);if(input.trackId===selectedId&&mounted.current){setPeak(Math.max(...input.peaks));setChannels(input.channels);}if(input.cueFault&&!active.faults.has(input.trackId)){active.faults.add(input.trackId);if(mounted.current)setError(t('recording.nativeCueFault'));}}
      if(Number.isFinite(status.frame))useProjectStore.getState().setPlayheadPosition(status.frame!/48000);
      if(mounted.current){setBusy(status.phase==='preparing'||status.phase==='lead');setMonitoring(status.phase==='recording'&&targets.some(target=>target.input.monitor));
       const elapsed=status.elapsedFrames??0,until=options.leadFrames+options.recordStartFrame-options.projectStartFrame;
       setRemaining(status.phase==='lead'?Math.max(0,Math.ceil((until-elapsed)/48000)):0);setLeadPhase(elapsed<options.leadFrames?(elapsed<options.leadFrames-options.countInFrames?'delay':'count'):'preRoll');
      }
      if(status.phase==='complete'||status.phase==='fault')void finish.current();
     }catch(error){if(!active.stopping){if(mounted.current)setError(t(error instanceof Error?error.message:String(error)));void finish.current();}}
     finally{active.polling=false;}
    };
    active.timer=setInterval(()=>void tick(),80);void tick();
   }catch(error){if(mounted.current&&!(error instanceof DOMException&&error.name==='AbortError'))setError(t(error instanceof Error?error.message:String(error)));await finish.current();}
   return;
  }
  const controller=new AbortController();const active:Session={snapshot,sources:new Map(useProjectStore.getState().sources),targets:targets.map(target=>({...target,capture:target.trackId===selectedId&&previewMatches(owner.current,snapshot,selectedId)&&capture.current?.connected()?capture.current:new TimelineCapture(audio.getContext(),audio.masterGain,(peak,channels)=>{if(mounted.current){useRecordingMeterStore.getState().update(target.trackId,peak,channels);if(target.trackId===selectedId){setPeak(peak);setChannels(channels);}}},reason=>{if(mounted.current)setError(t(reason));void finish.current();})})),passes:[],window:(punch||loop)?snapshot.editRange:undefined,loop,controller,stopping:false,frame:0,retainPreview:!!capture.current?.connected()&&previewMatches(owner.current,snapshot,selectedId)};session.current=active;
  try{
   if((punch||loop)&&!active.window)throw new Error('recording.rangeRequired');
   const lead=recordingLeadIn(active.snapshot,active.targets.map(target=>target.input),useProjectStore.getState().playheadPosition,active.window,active.loop);active.recordStart=lead.takeStart;
   await nativeSourceOwner.stop();controller.signal.throwIfAborted();
   await audio.resume();
   await Promise.all(active.targets.map(target=>target.capture.monitoring(false)));controller.signal.throwIfAborted();
   if(hasNativeEffects(active.snapshot)){if(mounted.current)setPreparingBacking(true);active.backing=await prepareRecordingBacking(engine.current,audio.getContext(),active.snapshot,active.sources,controller.signal);if(mounted.current)setPreparingBacking(false);}
   controller.signal.throwIfAborted();
   if(capture.current&&!active.targets.some(target=>target.capture===capture.current))disconnect();
   for(const target of active.targets){controller.signal.throwIfAborted();if(target.input.monitor&&target.input.monitorFx&&!isNativeMac())throw new Error('recording.cueMac');target.capture.configureCue(target.input,active.snapshot.tracks.find(t=>t.id===target.trackId)?.nativeEffects,reason=>{if(mounted.current){if(target.trackId===selectedId){setMonitoring(false);setCueLatency(0);}setError(t(reason));}});if(!target.capture.connected())await target.capture.connect(target.input.deviceId,target.input.channel);target.capture.budget(240*1024*1024/active.targets.length);if(target.trackId===selectedId){capture.current=target.capture;owner.current=previewOwner(active.snapshot,target.trackId,target.input);if(mounted.current)setConnected(true);}}
   controller.signal.throwIfAborted();if(useProjectStore.getState().project!==active.snapshot)throw new Error('recording.projectChanged');await engine.current.prepare(active.snapshot);await waitForPreviewFrame(controller.signal);
   const ctx=audio.getContext(),start=lead.playbackStart;
   for(const target of active.targets){await target.capture.monitoring(target.input.monitor);controller.signal.throwIfAborted();}
   if(mounted.current)setCueLatency(active.targets.find(target=>target.trackId===selectedId)?.capture.monitorLatency()??0);
   if(mounted.current)setMonitoring(active.targets.some(target=>target.trackId===selectedId&&target.input.monitor));
   const frame=Math.ceil(ctx.currentTime*ctx.sampleRate);for(const target of active.targets)target.capture.start(frame);
   await Promise.all(active.targets.map(target=>target.capture.waitForFrames(controller.signal)));controller.signal.throwIfAborted();
   const scheduledAt=lead.delay||lead.countSeconds||lead.preRollSeconds?Math.ceil((ctx.currentTime+.25+lead.delay+lead.countSeconds)*ctx.sampleRate)/ctx.sampleRate:undefined;
   engine.current.setSources(active.sources);
   if(active.backing){active.passes.push(playRecordingBacking(engine.current,ctx,active.backing,start,active.loop?active.window:undefined,scheduledAt));useUIStore.setState({nativePreviewStatus:'playing'});}
   else{engine.current.play(active.snapshot,start,active.snapshot.duration,scheduledAt);active.passes.push(engine.current.playbackAnchor()!);}
   const anchor=active.passes[0];active.recordFrame=anchor.frame+Math.round((lead.recordStart-start)*ctx.sampleRate);
   const countFrame=anchor.frame-Math.round(lead.countSeconds*ctx.sampleRate);
   if(lead.countSeconds>0){active.leadClick=new TimelineMetronome(ctx,audio.masterGain,lead.music,{frame:countFrame,timeline:start-lead.countSeconds},start);active.leadClick.start(lead.delay+lead.countSeconds+.5);}
   active.click=startRecordingMetronome(ctx,audio.masterGain,active.snapshot,anchor,active.window,active.loop&&!!active.backing);
   useProjectStore.getState().setIsPlaying(true);
   const tick=()=>{
    if(session.current!==active||active.stopping)return;const state=useProjectStore.getState(),pass=active.passes.at(-1)!,position=pass.timeline+(ctx.currentTime*ctx.sampleRate-pass.frame)/ctx.sampleRate;
    if(!state.isPlaying||state.project!==active.snapshot||ctx.state!=='running'){void finish.current();return;}
    const nowFrame=ctx.currentTime*ctx.sampleRate;
    if(nowFrame>=anchor.frame){active.leadClick?.stop();active.leadClick=undefined;}
    if(nowFrame<active.recordFrame!){if(mounted.current){setRemaining(Math.ceil((active.recordFrame!-nowFrame)/ctx.sampleRate));setLeadPhase(nowFrame<anchor.frame?(nowFrame<countFrame?'delay':'count'):'preRoll');}}
    else if(mounted.current){setRemaining(0);setLeadPhase(undefined);setBusy(false);}
    if(nowFrame<anchor.frame){active.frame=requestAnimationFrame(tick);return;}
    if(active.window&&position>=active.window.end){if(active.loop&&active.backing){const limit=extendRecordingPasses(active.passes,Math.ceil(ctx.currentTime*ctx.sampleRate),ctx.sampleRate,active.window);if(limit){void finish.current();return;}const last=active.passes.at(-1)!;state.setPlayheadPosition(last.timeline+(ctx.currentTime*ctx.sampleRate-last.frame)/ctx.sampleRate);}else if(active.loop&&active.passes.length<500){engine.current!.play(active.snapshot,active.window.start);active.passes.push(engine.current!.playbackAnchor()!);active.click?.stop();active.click=startRecordingMetronome(ctx,audio.masterGain,active.snapshot,active.passes.at(-1)!,active.window);state.setPlayheadPosition(active.window.start);}else{void finish.current();return;}}
    else state.setPlayheadPosition(Math.max(0,position));active.frame=requestAnimationFrame(tick);
   };active.frame=requestAnimationFrame(tick);
  }catch(e){if(!controller.signal.aborted)setError(t(e instanceof Error?e.message:String(e)));await finish.current();}
 };
 useEffect(()=>{const show=(event?:Event)=>{const id=event instanceof CustomEvent&&typeof event.detail==='string'?event.detail:undefined;if(id&&!useUIStore.getState().timelineRecording){if(id!==preferred.current){capture.current?.disconnect();useRecordingMeterStore.getState().clear(owner.current?.trackId);capture.current=null;owner.current=null;setConnected(false);setMonitoring(false);setPeak(0);setChannels(0);}preferred.current=id;setTrackId(id);}setOpen(true);};const key=(e:KeyboardEvent)=>{if(!isNativeMac()&&(e.ctrlKey||e.metaKey)&&e.shiftKey&&e.code==='KeyR'&&!textEditing()&&!menuBlocked()){e.preventDefault();show();}};window.addEventListener('crispaudio-recording',show);document.addEventListener('keydown',key);return()=>{window.removeEventListener('crispaudio-recording',show);document.removeEventListener('keydown',key);};},[]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;calibrationController.current?.abort();void finish.current().finally(()=>{capture.current?.disconnect();useRecordingMeterStore.getState().clear();});};},[]);
 useEffect(()=>{const interrupted=()=>{if(calibrationController.current){calibrationController.current.abort();capture.current?.disconnect();setConnected(false);setMonitoring(false);setError(t('recording.deviceChanged'));}if(session.current||nativeSession.current){setError(t('recording.deviceChanged'));void finish.current();}else {disconnect();void refresh().catch(()=>{});}};navigator.mediaDevices?.addEventListener('devicechange',interrupted);return()=>navigator.mediaDevices?.removeEventListener('devicechange',interrupted);},[t]);
 return <><div data-recording-controls className="flex items-center gap-1 shrink-0"><div className="recording-actions"><ToolButton data-help="record" icon={recording?Square:Circle} label={t(recording?'recording.stop':hasNativeEffects(project)&&!isNativeMac()?'nativePreview.macOnly':'recording.start')} className={`recording-start${recording?' animate-pulse':''}`} aria-pressed={recording} disabled={!recording&&(busy||recovering||hasNativeEffects(project)&&!isNativeMac())} onClick={()=>void record()}/><ToolButton data-help-command="recording" icon={ChevronDown} label={t('recording.settings')} className="recording-settings" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setOpen(true);void refresh().catch(()=>{});}}/></div><RecordingInputMeter/>{(remaining>0||busy)&&<output role="status" data-recording-phase={leadPhase} className="text-xs text-red-300 tabular-nums">{remaining?t(`recording.lead_${leadPhase??'delay'}`,{seconds:remaining}):t(preparingBacking?'recording.preparingBacking':'recording.preparing')}</output>}{error&&!open&&<p role="alert" className="max-w-40 truncate text-xs text-amber-300" title={error}>{error}</p>}</div>{open&&<FloatingInspector onClose={()=>{setOpen(false);setTakesOpen(false);if(calibrationController.current)disconnect();}} title={t('recording.title')}>
  <div className="space-y-3 text-sm">
   <label className="block">{t('recording.track')}<div className="flex gap-2"><select className="bg-gray-800 min-h-11 min-w-0 flex-1 rounded px-2" disabled={recording||busy} aria-label={t('recording.track')} value={track?.id??''} onChange={e=>{disconnect();setTakesOpen(false);setTrackId(e.target.value);}}>{project.tracks.filter(t=>t.kind!=='bus').map(t=><option key={t.id} value={t.id} disabled={t.locked}>{t.name}</option>)}</select><ToolButton icon={Plus} label={t('recording.newTrack')} disabled={recording||busy} onClick={()=>{useProjectStore.getState().addTrack(t('recording.newTrack'));setTrackId(useProjectStore.getState().project.tracks.at(-1)!.id);disconnect();}}/></div></label>
   {isNativeMac()&&<NativeRecordingRecovery context={audio.getContext} disabled={recording||busy} crossfade={crossfade} onBusy={setRecovering}/>}
   {track&&<>
    <div className="flex gap-3 items-center"><label className="flex gap-2 min-h-11 items-center flex-1"><input type="checkbox" disabled={recording||busy||track.locked} checked={track.recordArmed??false} onChange={e=>useProjectStore.getState().updateTrack(track.id,{recordArmed:e.target.checked})}/>{t('recording.arm')}</label><output aria-label={t('recording.inputLevel')} className="text-xs tabular-nums text-gray-400">{peak?`${(20*Math.log10(peak)).toFixed(1)} dBFS`:'−∞'} · {channels} ch</output></div>
    <div className="h-1.5 rounded bg-gray-800 overflow-hidden" aria-hidden="true"><div className={peak>.98?'h-full bg-red-400':'h-full bg-emerald-400'} style={{width:`${Math.max(0,Math.min(100,(20*Math.log10(Math.max(peak,1e-6))+60)/60*100))}%`}}/></div>
    {(allArmed||punch||loop||monitoring)&&<div className="flex flex-wrap gap-2 text-xs text-amber-300">{allArmed&&<span>{t('recording.multiShort',{count:project.tracks.filter(t=>t.kind!=='bus'&&t.recordArmed).length})}</span>}{punch&&<span>{t('recording.punchShort')}</span>}{loop&&<span>{t('recording.loopShort')}</span>}{monitoring&&<span>{t('recording.monitorShort')}</span>}</div>}
    {liveNativeSession&&<NativeRecordingMix key={liveNativeSession.id} controller={liveNativeSession.controller} targets={liveNativeSession.targets.map(target=>({...target,name:liveNativeSession.snapshot.tracks.find(track=>track.id===target.trackId)?.name??target.trackId}))} selectedId={liveNativeSession.selectedId} disabled={!!liveNativeSession.stopping||liveNativeSession.phase==='preparing'} onError={message=>{if(mounted.current&&nativeSession.current===liveNativeSession&&!liveNativeSession.stopping)setError(message);}}/>}
    <details data-recording-section="input"><summary className="min-h-11 content-center cursor-pointer border-t border-gray-800">{t('recording.inputSetup')}</summary><div className="space-y-3 pt-2">
    {isNativeMac()&&<NativeRecordingSetup input={input} disabled={recording||busy} onChange={configure} onError={setError} onEngineChange={disconnect}/>}
    {!nativeMode&&<>
    <label className="block">{t('recording.device')}<select className="bg-gray-800 w-full min-h-11" disabled={recording||busy} value={input.deviceId} onChange={e=>configure({deviceId:e.target.value})}><option value="">{t('recording.defaultInput')}</option>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||t('recording.unnamedDevice')}</option>)}</select></label>
    <label className="block">{t('recording.channel')}<select className="bg-gray-800 w-full min-h-11" disabled={recording||busy} value={input.channel} onChange={e=>configure({channel:e.target.value as InputMode})}>{(['mono','right','stereo'] as const).map(channel=><option key={channel} value={channel}>{t(`recording.${channel}`)}</option>)}</select></label>
    <div className="flex gap-2"><button className="timeline-tool" disabled={recording||busy} onClick={()=>void (async()=>{setError('');setBusy(true);try{if(connected)disconnect();else{await audio.resume();await connect();}}catch(e){setError(t(e instanceof Error?e.message:String(e)));}finally{setBusy(false);}})()}>{t(connected?'recording.disconnect':'recording.connect')}</button></div>
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" disabled={!connected||recording||busy} checked={connected&&monitoring} onChange={e=>{const enabled=e.target.checked;void (async()=>{setBusy(true);try{if(enabled&&input.monitorFx&&!isNativeMac())throw new Error('recording.cueMac');useProjectStore.getState().updateTrack(track.id,{recordingInput:{...input,monitor:enabled}});const recorder=capture.current;await recorder?.monitoring(enabled);if(!recorder||capture.current!==recorder||!previewMatches(owner.current,useProjectStore.getState().project,trackId))return;setMonitoring(enabled);setCueLatency(recorder.monitorLatency());}catch(reason){setMonitoring(false);setError(t(reason instanceof Error?reason.message:String(reason)));}finally{setBusy(false);}})();}}/>{t('recording.monitor')}</label>
    </>}
    {!liveNativeSession&&<details data-recording-section="cue"><summary className="min-h-11 content-center cursor-pointer">{t('recording.cue')}</summary><div className="space-y-2">
    <div className="flex justify-end"><InfoButton label={t('recording.cue')}><p>{t('recording.cueHelp')}</p></InfoButton></div>
    <fieldset disabled={recording||busy} className="space-y-2">
    <ParamSlider label={t('recording.cueLevel')} min={-60} max={0} step={.1} value={input.monitorLevelDb??-12} unit="dB" liveNumber onInteractionStart={cueGesture.begin} onInteractionEnd={cueGesture.end} onChange={monitorLevelDb=>configure({monitorLevelDb})}/>
    <ParamSlider label={t('recording.cuePan')} min={-1} max={1} step={.01} value={input.monitorPan??0} liveNumber onInteractionStart={cueGesture.begin} onInteractionEnd={cueGesture.end} onChange={monitorPan=>configure({monitorPan})}/>
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={input.monitorMono??false} onChange={e=>configure({monitorMono:e.target.checked})}/>{t('recording.cueMono')}</label>
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" disabled={!input.monitorFx&&!track.nativeEffects?.some(effect=>effect.enabled)} checked={input.monitorFx??false} onChange={e=>configure({monitorFx:e.target.checked})}/>{t('recording.cueFx')}</label>
    </fieldset>{connected&&monitoring&&<output className="text-xs text-gray-400" data-cue-latency>{t('recording.cueLatency',{milliseconds:cueLatency.toFixed(1)})}</output>}
    </div></details>}
    {!nativeMode&&<>
    <details data-recording-section="timing"><summary className="min-h-11 content-center cursor-pointer">{t('recording.timing')}</summary>
    {(['latencyMs'] as const).map(key=><label key={key} className="flex items-center justify-between gap-2">{t(`recording.${key}`)}<NumberField disabled={recording||busy} label={t(`recording.${key}`)} min={key==='latencyMs'?-500:0} value={input[key]} step={key==='latencyMs'?1:1} onCommit={v=>{if(v>(key==='latencyMs'?2000:10))return false;configure({[key]:v});return true;}}/></label>)}
    <button className="timeline-tool" disabled={recording||busy} onClick={()=>void calibrate()}>{t('recording.calibrate')}</button>{calibration&&<div className="space-y-2 text-xs"><p>{calibration.milliseconds.toFixed(2)} ms · {Math.round(calibration.confidence*100)}%</p><button className="timeline-tool" onClick={()=>{configure({latencyMs:calibration.milliseconds});setCalibration(undefined);}}>{t('recording.applyCalibration')}</button></div>}<HelpDetails><p className="text-xs text-gray-400">{t('recording.calibrationHelp')}</p></HelpDetails></details>
    </>}
    </div></details>
    <details data-recording-section="options"><summary className="min-h-11 content-center cursor-pointer border-t border-gray-800">{t('recording.options')}</summary><div className="space-y-3 pt-2">
     <div className="flex justify-end"><InfoButton label={t('recording.leadHelpTitle')}><p>{t('recording.leadHelp')}</p></InfoButton></div>
     {(['countInBars','preRollBars'] as const).map(key=><label key={key} className="flex items-center justify-between gap-2">{t(`recording.${key}`)}<select className="min-h-11 rounded bg-gray-800 px-2" aria-label={t(`recording.${key}`)} disabled={recording||busy} value={input[key]??0} onChange={e=>configure({[key]:Number(e.target.value)})}>{[0,1,2,3,4].map(bars=><option key={bars} value={bars}>{bars?t('recording.bars',{count:bars}):t('recording.off')}</option>)}</select></label>)}
     <label className="flex items-center justify-between gap-2">{t('recording.countIn')}<NumberField disabled={recording||busy} label={t('recording.countIn')} min={0} value={input.countIn} step={1} onCommit={v=>{if(v>10)return false;configure({countIn:v});return true;}}/></label>
    <div className="flex flex-wrap gap-3">{([['punch',punch,setPunch],['loop',loop,setLoop]] as const).map(([key,value,set])=><label key={key} className="flex gap-2 min-h-11 items-center"><input type="checkbox" disabled={recording||busy} checked={value} onChange={e=>set(e.target.checked)}/>{t(`recording.${key}`)}</label>)}</div>
    <label className="flex gap-2 min-h-11 items-center"><input type="checkbox" disabled={recording||busy} checked={allArmed} onChange={e=>setAllArmed(e.target.checked)}/>{t('recording.allArmed',{count:project.tracks.filter(t=>t.kind!=='bus'&&t.recordArmed).length})}</label>
    </div></details>
    {!!track.takes?.length&&<details data-recording-section="takes" onToggle={e=>setTakesOpen(e.currentTarget.open)}><summary className="min-h-11 content-center cursor-pointer border-t border-gray-800">{t('recording.takesComp')}</summary>{takesOpen&&<div className="space-y-3 pt-2">
    <label className="flex items-center justify-between gap-2">{t('recording.crossfade')}<NumberField disabled={recording||busy} value={crossfade} label={t('recording.crossfade')} min={0} step={.005} onCommit={v=>{if(v>1)return false;setCrossfade(v);return true;}}/></label>
    <TakeLanes key={track.id} trackId={track.id} crossfade={crossfade} disabled={recording||busy} onError={setError}/>
    </div>}</details>}
   </>}{error&&<p role="alert" className="text-amber-300 break-words">{error}</p>}<HelpDetails><p>{t('recording.help')}</p>{hasNativeEffects(project)&&<p>{t('recording.nativeHelp')}</p>}<p>{t('recording.groupHelp')}</p></HelpDetails>
  </div>
 </FloatingInspector>}</>;
}
