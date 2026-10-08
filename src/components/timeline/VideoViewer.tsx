import { useEffect, useRef, useState, type ReactNode } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { VideoControls } from './VideoControls';
export function VideoViewer({children}: {children?:ReactNode}) {
  const {t}=useTranslation();
  const path=useProjectStore(s=>s.project.video?.path);
  const [visible,setVisible]=useState(true), [expanded,setExpanded]=useState(false);
  const [resolved,setResolved]=useState<{path:string;url:string}|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const url=resolved && resolved.path===path?resolved.url:'';
  const ref=useRef<HTMLVideoElement>(null);
  useEffect(()=>{
    let active=true;
    if(path) invoke<string>('prepare_video_preview',{path}).then(value=>{if(active){setResolved({path,url:convertFileSrc(value)});setError('');}}).catch(err=>{if(active)setError(String(err));});
    return ()=>{active=false;};
  },[path,attempt]);
  useEffect(()=>{
    const sync=()=>{
      const element=ref.current,state=useProjectStore.getState();
      if(!element || element.readyState<1 || element.error)return;
      const target=Math.max(0,Math.min(element.duration || Infinity,state.playheadPosition));
      if(Math.abs(element.currentTime-target)>.08)element.currentTime=target;
      if(state.isPlaying && element.paused)void element.play().catch(err=>setError(String(err)));
      if(!state.isPlaying)element.pause();
    };
    const element=ref.current; element?.addEventListener('loadedmetadata',sync); element?.addEventListener('canplay',sync);
    const unsubscribe=useProjectStore.subscribe(sync);sync();
    return ()=>{unsubscribe();element?.pause();element?.removeEventListener('loadedmetadata',sync);element?.removeEventListener('canplay',sync);};
  },[url,visible,attempt]);
  useEffect(()=>{
    if(!expanded || !('__TAURI_INTERNALS__' in window))return;
    let active=true,entered=false;
    let restore:(()=>Promise<void>)|undefined;
    void import('@tauri-apps/api/window').then(async({getCurrentWindow})=>{
      const win=getCurrentWindow();restore=()=>win.setFullscreen(false);
      const wasFullscreen=await win.isFullscreen();if(!active || wasFullscreen)return;
      await win.setFullscreen(true);entered=true;if(!active)await restore();
    }).catch(()=>{}); // Expanded viewer remains usable when native fullscreen is unavailable.
    return()=>{active=false;if(entered)void restore?.().catch(()=>{});};
  },[expanded]);
  useEffect(()=>{
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false);};
    document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);
  },[]);
  // A transient first-load failure gets one fresh media element. Persistent
  // missing-file/codec errors remain visible and can be retried explicitly.
  useEffect(()=>{
    if(!error || attempt!==0)return;
    const timer=setTimeout(()=>setAttempt(1),500);return()=>clearTimeout(timer);
  },[error,attempt]);
  if(!path)return null;
  return <div>
    {!visible && <div className="flex flex-wrap gap-2">{children}<button className="timeline-tool" onClick={()=>setVisible(true)}>{t('interview.showPreview')}</button></div>}
    {error && <p role="alert" className="text-sm text-amber-300 mt-2">{error} <button className="timeline-tool" onClick={()=>setAttempt(n=>n+1)}>{t('editor.retryPreview')}</button></p>}
    {visible && <div className={expanded?'fixed inset-0 z-50 bg-black p-4 flex flex-col gap-3':'flex flex-wrap gap-3 items-start'}>
      {url && <video key={`${path}-${url}-${attempt}`} ref={ref} src={url} muted playsInline preload="auto" aria-label={t('interview.preview')}
        className={expanded?'w-full flex-1 min-h-0 object-contain':'bg-black rounded-xl w-full sm:w-[360px] max-w-full max-h-[18dvh] object-contain'}
        onCanPlay={()=>setError('')} onError={()=>setError(t('interview.previewFailed'))} />}
      <div className="flex-1 min-w-40">
        {!expanded && <div className="mb-2">{children}</div>}
        <div className="flex flex-wrap gap-2">
          {[-1,1].map(direction=><button key={direction} className="timeline-tool" aria-label={t(direction<0?'video.stepBack':'video.stepForward')} onClick={()=>{const state=useProjectStore.getState();state.setIsPlaying(false);state.setPlayheadPosition(Math.max(0,Math.min(state.project.video!.duration,state.playheadPosition+direction/30)));}}>{direction<0?'−':'+'} 33 ms</button>)}
          {!expanded && <button className="timeline-tool" onClick={()=>setVisible(false)}>{t('interview.hidePreview')}</button>}
          <button className="timeline-tool" aria-pressed={expanded} onClick={()=>setExpanded(old=>!old)}>{t(expanded?'editor.closeViewer':'video.fullscreen')}</button>
        </div>
        {!expanded && <VideoControls/>}
      </div>
    </div>}
  </div>;
}
