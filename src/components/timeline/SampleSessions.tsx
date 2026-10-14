import {InfoButton} from '../common/InfoButton';
import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {invoke} from '@tauri-apps/api/core';
import {buildSampleSession,sampleVideoUrl,type SampleSession} from '../../lib/sampleSessions';
import {useTimelineTool} from '../../hooks/useTimelineTool';
import {useProjectStore} from '../../stores/projectStore';
import {useUIStore} from '../../stores/uiStore';
import {isTauri,isIOSApp} from '../../lib/native';
import {encodeAudioBufferWav} from '../../lib/wavExport';
import {Modal} from '../common/Modal';
export function SampleSessions(){
 const nativeSupported=isTauri()&&!isIOSApp()&&navigator.userAgent.includes('Mac');
 const {t}=useTranslation(),[open,setOpen]=useState(false),[kind,setKind]=useState<SampleSession>('mix'),[busy,setBusy]=useState(false),[error,setError]=useState(''),recording=useUIStore(s=>s.timelineRecording),controller=useRef<AbortController|null>(null),mounted=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
 useTimelineTool('samples',()=>{setError('');setOpen(true);},!recording);
 useEffect(()=>{const request=(e:Event)=>{const kind=(e as CustomEvent<SampleSession>).detail;if(!useUIStore.getState().timelineRecording&&(['mix','picture','takes'].includes(kind)||nativeSupported&&kind==='native')){setKind(kind);setError('');setOpen(true);}};window.addEventListener('crispaudio-sample-request',request);return()=>window.removeEventListener('crispaudio-sample-request',request);},[nativeSupported]);
 const close=()=>{controller.current?.abort();setOpen(false);};
 const load=async()=>{
  if(busy||recording)return;const active=new AbortController();controller.current=active;const snapshot=useProjectStore.getState().project;useProjectStore.getState().setIsPlaying(false);setBusy(true);setError('');
  try{
   const built=buildSampleSession(kind,new OfflineAudioContext(2,1,48000),t);
   let videoBytes:Uint8Array|undefined;if(built.project.video){const response=await fetch(sampleVideoUrl,{signal:active.signal});if(!response.ok)throw new Error('samples.failed');videoBytes=new Uint8Array(await response.arrayBuffer());if(videoBytes.byteLength<32)throw new Error('samples.failed');}
   if(isTauri()){
    for(const source of built.sources.values()){active.signal.throwIfAborted();const wav=await encodeAudioBufferWav(source.buffer,32);source.filePath=await invoke<string>('persist_recording',new Uint8Array(await wav.arrayBuffer()));}
    if(built.project.video){const {appDataDir,join}=await import('@tauri-apps/api/path');const {writeFile}=await import('@tauri-apps/plugin-fs');const path=await join(await appDataDir(),`sample-${crypto.randomUUID()}.mp4`);await writeFile(path,videoBytes!);built.project.video.path=path;built.project.video.session.video.path=path;}
   }
   active.signal.throwIfAborted();const state=useProjectStore.getState();if(state.project!==snapshot||useUIStore.getState().timelineRecording)throw new Error('samples.changed');
   state.loadProjectState(built.project,new Map([...state.sources,...built.sources]));state.setScrollOffset(0);setOpen(false);window.dispatchEvent(new CustomEvent('crispaudio-sample-loaded',{detail:{kind,projectId:built.project.id}}));
  }catch(e){if(!active.signal.aborted&&mounted.current)setError(t(e instanceof Error?e.message:String(e)));}
  finally{if(controller.current===active){controller.current=null;if(mounted.current)setBusy(false);}}
 };
 return <Modal isOpen={open} onClose={close} title={t('samples.title')}><div className="space-y-3 text-sm">
  <select className="w-full min-h-11 bg-gray-800 rounded p-2" aria-label={t('samples.session')} value={kind} disabled={busy} onChange={e=>setKind(e.target.value as SampleSession)}>{(['mix','picture','takes',...(nativeSupported?['native']:[])] as SampleSession[]).map(key=><option key={key} value={key}>{t(`samples.${key}`)}</option>)}</select>
  <InfoButton label={t('samples.session')}><p>{t(`samples.${kind}Info`)}</p><p>{t('samples.undo')}</p></InfoButton>
  {error&&<p role="alert" className="text-red-300 break-words">{error}</p>}{busy&&<p role="status">{t('samples.loading')}</p>}
  <div className="flex justify-end gap-2"><button className="timeline-tool" onClick={close}>{t('common.cancel')}</button><button className="timeline-tool" disabled={busy||recording} onClick={()=>void load()}>{t('samples.open')}</button></div>
 </div></Modal>;
}
