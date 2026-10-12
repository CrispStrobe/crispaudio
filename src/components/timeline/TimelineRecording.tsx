import {Circle} from 'lucide-react';
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
import {chooseTake} from '../../lib/recordingTakes';
import {Modal} from '../common/Modal';
import {NumberField} from './NumberField';
import type {RecordingInput,TimelineProject,AudioSource} from '../../types/audio';
const defaultInput:RecordingInput={deviceId:'',channel:'mono',monitor:false,countIn:3,latencyMs:0};
interface Session {snapshot:TimelineProject;trackId:string;input:RecordingInput;passes:CapturePass[];window?:{start:number;end:number};loop:boolean;controller:AbortController;stopping:boolean;frame:number}
export function TimelineRecording({engine,audio,launcher=true}:{launcher?:boolean;engine:RefObject<TimelineEngine|null>;audio:AudioEngineHandle}){
 const {t}=useTranslation(),project=useProjectStore(s=>s.project),recording=useUIStore(s=>s.timelineRecording),[open,setOpen]=useState(false),[trackId,setTrackId]=useState(''),[devices,setDevices]=useState<MediaDeviceInfo[]>([]),[connected,setConnected]=useState(false),[monitoring,setMonitoring]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[peak,setPeak]=useState(0),[channels,setChannels]=useState(0),[remaining,setRemaining]=useState(0),[punch,setPunch]=useState(false),[loop,setLoop]=useState(false),[crossfade,setCrossfade]=useState(.04),[calibration,setCalibration]=useState<{milliseconds:number;confidence:number}>();
 const capture=useRef<TimelineCapture|null>(null),session=useRef<Session|null>(null),mounted=useRef(true),finish=useRef<()=>Promise<void>>(async()=>{}),calibrationController=useRef<AbortController|null>(null);
 const track=project.tracks.find(t=>t.id===trackId)??project.tracks.find(t=>t.kind!=='bus'&&t.recordArmed)??project.tracks.find(t=>t.kind!=='bus'),input=track?.recordingInput??defaultInput;
 const refresh=async()=>{const devices=await navigator.mediaDevices.enumerateDevices();if(mounted.current)setDevices(devices.filter(d=>d.kind==='audioinput'));};
 const disconnect=()=>{calibrationController.current?.abort();capture.current?.disconnect();capture.current=null;setConnected(false);setMonitoring(false);setPeak(0);};
 const configure=(patch:Partial<RecordingInput>)=>{if(!track||recording)return;disconnect();useProjectStore.getState().updateTrack(track.id,{recordingInput:{...input,...patch}});};
 const connect=async()=>{if(!track||track.locked||track.kind==='bus')throw new Error('recording.locked');capture.current?.disconnect();const recorder=new TimelineCapture(audio.getContext(),audio.masterGain,(peak,channels)=>{if(mounted.current){setPeak(peak);setChannels(channels);}},reason=>{if(mounted.current)setError(t(reason));void finish.current();});capture.current=recorder;await recorder.connect(input.deviceId,input.channel);if(capture.current!==recorder)return;recorder.monitoring(input.monitor);if(mounted.current){setConnected(true);setMonitoring(input.monitor);await refresh();}};
 const stopRecording=useCallback(async()=>{
  const active=session.current;if(!active||active.stopping)return;active.stopping=true;active.controller.abort();cancelAnimationFrame(active.frame);if(!active.passes.length){capture.current?.disconnect();if(mounted.current){setConnected(false);setMonitoring(false);}}useProjectStore.getState().setIsPlaying(false);engine.current?.stop();
  try{
   const captured=await capture.current?.stop();if(!captured)return;
   const raw=captured.buffer,sourceId=crypto.randomUUID();let buffer=raw;
   if(raw.sampleRate!==active.snapshot.sampleRate){const offline=new OfflineAudioContext(raw.numberOfChannels,Math.round(raw.duration*active.snapshot.sampleRate),active.snapshot.sampleRate),node=offline.createBufferSource();node.buffer=raw;node.connect(offline.destination);node.start();buffer=await offline.startRendering();}
   let filePath:string|undefined,originalPath:string|undefined;
   if('__TAURI_INTERNALS__' in window){const wav=await encodeAudioBufferWav(raw,32);originalPath=await invoke<string>('persist_recording',new Uint8Array(await wav.arrayBuffer()));filePath=originalPath;if(buffer!==raw){const derived=await encodeAudioBufferWav(buffer,32);filePath=await invoke<string>('persist_recording',new Uint8Array(await derived.arrayBuffer()));}window.dispatchEvent(new CustomEvent('crispaudio-recording-original',{detail:{path:originalPath}}));}
   const state=useProjectStore.getState();if(state.project!==active.snapshot){if(mounted.current)setError(`${t('recording.projectChanged')}${filePath?' '+filePath:''}`);return;}
   const takes=capturedTakes({firstFrame:captured.firstFrame,frames:raw.length,sampleRate:raw.sampleRate,passes:active.passes,sourceId,name:t('recording.take'),latencyMs:active.input.latencyMs,window:active.window,notes:captured.notes,droppedFrames:captured.droppedFrames}).map(take=>({...take,duration:Math.min(take.duration,buffer.duration-take.sourceOffset)})).filter(take=>take.duration>=.01);if(!takes.length)throw new Error('recording.empty');
   const source:AudioSource={id:sourceId,name:t('recording.captured'),buffer,duration:buffer.duration,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,filePath,...(originalPath&&buffer!==raw?{provenance:{path:originalPath,offset:0,rate:1}}:{}),peaks:computeWaveformPeaks(buffer.getChannelData(0),Math.min(8000,Math.ceil(buffer.duration*200)))};
   const sources=new Map(state.sources);sources.set(sourceId,source);
   let next={...state.project,tracks:state.project.tracks.map(t=>t.id===active.trackId?{...t,takes:[...(t.takes??[]),...takes]}:t)};
   const chosen=active.window?[...takes].reverse().find(t=>t.duration>=active.window!.end-active.window!.start-.05)??takes.at(-1)!:takes.at(-1)!;
   next=chooseTake(next,active.trackId,chosen.id,chosen.startTime,chosen.startTime+chosen.duration,crossfade,sources);useProjectStore.setState({project:next,sources,isPlaying:false});
   if(captured.droppedFrames||captured.notes.length){if(mounted.current)setError(`${t('recording.captureNotes')}: ${captured.droppedFrames} · ${captured.notes.map(n=>t(n)).join(', ')}`);}
  }catch(e){if(mounted.current)setError(t(e instanceof Error?e.message:String(e)));}
  finally{session.current=null;useUIStore.setState({timelineRecording:false});if(mounted.current){setBusy(false);setRemaining(0);}capture.current?.monitoring(false);if(mounted.current)setMonitoring(false);}
 },[engine,crossfade,t]);
 useEffect(()=>{finish.current=stopRecording;},[stopRecording]);
 const calibrate=async()=>{
  if(recording||!track)return;setBusy(true);setError('');setCalibration(undefined);const controller=new AbortController();calibrationController.current=controller;let tone:AudioBufferSourceNode|undefined;const snapshot=project;
  try{
   await audio.resume();if(!capture.current?.connected())await connect();controller.signal.throwIfAborted();capture.current!.monitoring(false);setMonitoring(false);
   const ctx=audio.getContext(),reference=calibrationSignal(ctx.sampleRate),buffer=ctx.createBuffer(1,reference.length,ctx.sampleRate);buffer.copyToChannel(reference,0);const when=ctx.currentTime+.2;
   capture.current!.start();tone=ctx.createBufferSource();tone.buffer=buffer;tone.connect(audio.masterGain);tone.start(when);
   await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(resolve,1300);controller.signal.addEventListener('abort',()=>{clearTimeout(timeout);reject(new DOMException('Calibration cancelled','AbortError'));},{once:true});});controller.signal.throwIfAborted();const captured=await capture.current!.stop();if(!captured||captured.droppedFrames||captured.notes.length)throw new Error('recording.calibrationMissing');
   const result=await measuredLatency(captured.buffer.getChannelData(0),reference,Math.round(when*ctx.sampleRate)-captured.firstFrame,ctx.sampleRate,controller.signal);controller.signal.throwIfAborted();if(useProjectStore.getState().project!==snapshot)throw new Error('recording.projectChanged');if(mounted.current)setCalibration(result);
  }catch(e){if(!controller.signal.aborted&&mounted.current)setError(t(e instanceof Error?e.message:String(e)));}
  finally{try{tone?.stop();}catch{/* Tone may have ended. */}tone?.disconnect();if(calibrationController.current===controller)calibrationController.current=null;if(mounted.current)setBusy(false);}
 };
 const record=async()=>{
  if(recording){await finish.current();return;}if(!track||!track.recordArmed||track.locked||!engine.current)return;
  setError('');setBusy(true);useProjectStore.getState().setIsPlaying(false);useUIStore.setState({timelineRecording:true});
  const controller=new AbortController();const active:Session={snapshot:project,trackId:track.id,input:{...input},passes:[],window:(punch||loop)?project.editRange:undefined,loop,controller,stopping:false,frame:0};session.current=active;
  try{
   if((punch||loop)&&!active.window)throw new Error('recording.rangeRequired');
   await audio.resume();if(!capture.current?.connected())await connect();controller.signal.throwIfAborted();
   active.snapshot=useProjectStore.getState().project;await engine.current.prepare(active.snapshot);await waitForPreviewFrame(controller.signal);
   const ctx=audio.getContext(),deadline=ctx.currentTime+input.countIn;
   while(ctx.currentTime<deadline){controller.signal.throwIfAborted();if(mounted.current)setRemaining(Math.ceil(deadline-ctx.currentTime));await new Promise(resolve=>setTimeout(resolve,50));}
   controller.signal.throwIfAborted();if(mounted.current){setRemaining(0);setBusy(false);}const start=loop?active.window!.start:useProjectStore.getState().playheadPosition;
   capture.current!.monitoring(input.monitor);if(mounted.current)setMonitoring(input.monitor);capture.current!.start();engine.current.setSources(useProjectStore.getState().sources);engine.current.play(active.snapshot,start);active.passes.push(engine.current.playbackAnchor()!);useProjectStore.getState().setIsPlaying(true);
   const tick=()=>{
    if(session.current!==active||active.stopping)return;const state=useProjectStore.getState(),pass=active.passes.at(-1)!,position=pass.timeline+(ctx.currentTime*ctx.sampleRate-pass.frame)/ctx.sampleRate;
    if(!state.isPlaying||state.project!==active.snapshot||ctx.state!=='running'){void finish.current();return;}
    if(active.window&&position>=active.window.end){if(active.loop&&active.passes.length<500){engine.current!.play(active.snapshot,active.window.start);active.passes.push(engine.current!.playbackAnchor()!);state.setPlayheadPosition(active.window.start);}else{void finish.current();return;}}
    else state.setPlayheadPosition(Math.max(0,position));active.frame=requestAnimationFrame(tick);
   };active.frame=requestAnimationFrame(tick);
  }catch(e){if(!controller.signal.aborted)setError(t(e instanceof Error?e.message:String(e)));await finish.current();}
 };
 useEffect(()=>{const show=()=>setOpen(true);const key=(e:KeyboardEvent)=>{if(!isNativeMac()&&(e.ctrlKey||e.metaKey)&&e.shiftKey&&e.code==='KeyR'&&!textEditing()&&!menuBlocked()){e.preventDefault();show();}};window.addEventListener('crispaudio-recording',show);document.addEventListener('keydown',key);return()=>{window.removeEventListener('crispaudio-recording',show);document.removeEventListener('keydown',key);};},[]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;calibrationController.current?.abort();void finish.current().finally(()=>capture.current?.disconnect());};},[]);
 useEffect(()=>{const interrupted=()=>{if(calibrationController.current){calibrationController.current.abort();capture.current?.disconnect();setConnected(false);setMonitoring(false);setError(t('recording.deviceChanged'));}if(session.current){setError(t('recording.deviceChanged'));void finish.current();}else void refresh().catch(()=>{});};navigator.mediaDevices?.addEventListener('devicechange',interrupted);return()=>navigator.mediaDevices?.removeEventListener('devicechange',interrupted);},[t]);
 return <>{!launcher && <ToolButton icon={Circle} label={t('recording.title')} className={recording?'!text-red-400 animate-pulse':'!text-red-400'} aria-pressed={recording} onClick={()=>setOpen(true)}/>} {launcher && <button className={`timeline-tool ${recording?'text-red-400':''}`} onClick={()=>setOpen(true)}>{t('recording.title')}{recording?' ●':''}</button>}<Modal isOpen={open} onClose={()=>{setOpen(false);if(calibrationController.current)disconnect();}} title={t('recording.title')}>
  <div className="space-y-3 text-sm"><label className="block">{t('recording.track')}<select className="bg-gray-800 min-h-11 w-full" disabled={recording||busy} value={track?.id??''} onChange={e=>{disconnect();setTrackId(e.target.value);}}>{project.tracks.filter(t=>t.kind!=='bus').map(t=><option key={t.id} value={t.id} disabled={t.locked}>{t.name}</option>)}</select></label>
   <button className="timeline-tool" disabled={recording||busy} onClick={()=>{useProjectStore.getState().addTrack(t('recording.newTrack'));setTrackId(useProjectStore.getState().project.tracks.at(-1)!.id);disconnect();}}>{t('recording.newTrack')}</button>
   {track&&<><label className="flex gap-2 min-h-11 items-center"><input type="checkbox" disabled={recording||busy||track.locked} checked={track.recordArmed??false} onChange={e=>useProjectStore.getState().updateTrack(track.id,{recordArmed:e.target.checked})}/>{t('recording.arm')}</label>
    <label className="block">{t('recording.device')}<select className="bg-gray-800 w-full min-h-11" disabled={recording||busy} value={input.deviceId} onChange={e=>configure({deviceId:e.target.value})}><option value="">{t('recording.defaultInput')}</option>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||t('recording.unnamedDevice')}</option>)}</select></label>
    <label className="block">{t('recording.channel')}<select className="bg-gray-800 w-full min-h-11" disabled={recording||busy} value={input.channel} onChange={e=>configure({channel:e.target.value as InputMode})}>{(['mono','right','stereo'] as const).map(channel=><option key={channel} value={channel}>{t(`recording.${channel}`)}</option>)}</select></label>
    <div className="flex gap-2"><button className="timeline-tool" disabled={recording||busy} onClick={()=>void (async()=>{setError('');setBusy(true);try{if(connected)disconnect();else{await audio.resume();await connect();}}catch(e){setError(t(e instanceof Error?e.message:String(e)));}finally{setBusy(false);}})()}>{t(connected?'recording.disconnect':'recording.connect')}</button><span className="content-center text-xs">{peak?`${(20*Math.log10(peak)).toFixed(1)} dBFS`:'−∞'} · {channels} ch</span></div>
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" disabled={!connected||recording||busy} checked={connected&&monitoring} onChange={e=>{useProjectStore.getState().updateTrack(track.id,{recordingInput:{...input,monitor:e.target.checked}});capture.current?.monitoring(e.target.checked);setMonitoring(e.target.checked);}}/>{t('recording.monitor')}</label>
    {(['countIn','latencyMs'] as const).map(key=><label key={key} className="flex items-center justify-between gap-2">{t(`recording.${key}`)}<NumberField disabled={recording||busy} label={t(`recording.${key}`)} min={key==='latencyMs'?-500:0} value={input[key]} step={key==='latencyMs'?1:1} onCommit={v=>{if(v>(key==='latencyMs'?2000:10))return false;configure({[key]:v});return true;}}/></label>)}
    <button className="timeline-tool" disabled={recording||busy} onClick={()=>void calibrate()}>{t('recording.calibrate')}</button>{calibration&&<div className="space-y-2 text-xs"><p>{calibration.milliseconds.toFixed(2)} ms · {Math.round(calibration.confidence*100)}%</p><button className="timeline-tool" onClick={()=>{configure({latencyMs:calibration.milliseconds});setCalibration(undefined);}}>{t('recording.applyCalibration')}</button></div>}<HelpDetails><p className="text-xs text-gray-400">{t('recording.calibrationHelp')}</p></HelpDetails>
    <div className="flex flex-wrap gap-3">{([['punch',punch,setPunch],['loop',loop,setLoop]] as const).map(([key,value,set])=><label key={key} className="flex gap-2 min-h-11 items-center"><input type="checkbox" disabled={recording||busy} checked={value} onChange={e=>set(e.target.checked)}/>{t(`recording.${key}`)}</label>)}</div>
    <button className="timeline-tool w-full text-red-400" disabled={!recording&&(!track.recordArmed||track.locked||busy)} onClick={()=>void record()}>{remaining?`${t('recording.countdown')} ${remaining}`:t(recording?'recording.stop':'recording.start')}</button>
    <label className="flex items-center justify-between gap-2">{t('recording.crossfade')}<NumberField disabled={recording||busy} value={crossfade} label={t('recording.crossfade')} min={0} step={.005} onCommit={v=>{if(v>1)return false;setCrossfade(v);return true;}}/></label>
    <TakeLanes trackId={track.id} crossfade={crossfade} disabled={recording||busy} onError={setError}/>
   </>}{error&&<p role="alert" className="text-amber-300 break-words">{error}</p>}<HelpDetails><p>{t('recording.help')}</p></HelpDetails>
  </div>
 </Modal></>;
}
