import { ToolButton } from '../common/ToolButton';
import { SkipBack, SkipForward, EyeOff, Eye, Maximize, Minimize } from 'lucide-react';
import { drawVideoTransition } from '../../lib/videoCanvasPreview';
import { activeVideoClips, videoTimelineDuration } from '../../lib/videoEditing';
import { clipOpacity, transitionStyle } from '../../lib/videoPreview';
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
  const ref=useRef<HTMLVideoElement>(null),previousRef=useRef<HTMLVideoElement>(null),frameRef=useRef<HTMLDivElement>(null),noticeRef=useRef<HTMLSpanElement>(null),effectRef=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    let active=true;
    if(path) invoke<string>('prepare_video_preview',{path}).then(value=>{if(active){setResolved({path,url:convertFileSrc(value)});setError('');}}).catch(err=>{if(active)setError(String(err));});
    return ()=>{active=false;};
  },[path,attempt]);
  useEffect(()=>{
    const sync=()=>{
      const state=useProjectStore.getState(),clips=activeVideoClips(state.project.video,state.playheadPosition);
      const incoming=clips.at(-1),outgoing=clips.length>1?clips.at(-2):undefined;
      const transition=incoming&&outgoing?transitionStyle(incoming,state.playheadPosition):null;
      if(frameRef.current)frameRef.current.style.backgroundColor=transition?.background??'black';
      const custom=incoming&&outgoing&&['whip','glitch','pagepeel','pixelize'].includes(incoming.transition);
      if(effectRef.current){effectRef.current.style.display=custom?'':'none';if(custom&&ref.current&&previousRef.current)drawVideoTransition(effectRef.current,previousRef.current,ref.current,incoming,state.playheadPosition);}
      if(noticeRef.current)noticeRef.current.style.display=transition?.approximate?'':'none';
      for(const [element,clip,style] of [[previousRef.current,outgoing,transition?.outgoing],[ref.current,incoming,transition?.incoming]] as const){
        if(!element)continue;
        const opacity=clip?clipOpacity(clip,state.playheadPosition):0;
        element.style.opacity=String(opacity*Number(style?.opacity??1));element.style.transform=String(style?.transform??'none');element.style.clipPath=String(style?.clipPath??'none');element.style.filter=String(style?.filter??'none');
        if(!clip||element.readyState<1||element.error){element.pause();continue;}
        const target=Math.max(0,Math.min(element.duration||Infinity,clip.sourceOffset+state.playheadPosition-clip.startTime));
        if(Math.abs(element.currentTime-target)>.08)element.currentTime=target;
        if(state.isPlaying&&element.paused)void element.play().catch(err=>setError(String(err)));
        if(!state.isPlaying)element.pause();
      }
    };
    const elements=[ref.current,previousRef.current];for(const element of elements){element?.addEventListener('loadedmetadata',sync);element?.addEventListener('canplay',sync);element?.addEventListener('seeked',sync);}
    const unsubscribe=useProjectStore.subscribe(sync);sync();
    return ()=>{unsubscribe();for(const element of elements){element?.pause();element?.removeEventListener('loadedmetadata',sync);element?.removeEventListener('canplay',sync);element?.removeEventListener('seeked',sync);}};
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
    {!visible && <div className="flex flex-wrap gap-2">{children}<ToolButton icon={Eye} label={t('interview.showPreview')} onClick={()=>setVisible(true)}/></div>}
    {error && <p role="alert" className="text-sm text-amber-300 mt-2">{error} <button className="timeline-tool" onClick={()=>setAttempt(n=>n+1)}>{t('editor.retryPreview')}</button></p>}
    {visible && <div className={expanded?'fixed inset-0 z-50 bg-black p-4 flex flex-col gap-3':'video-viewer-compact flex flex-wrap gap-3 items-start'}>
      {url && <div ref={frameRef} className={expanded?'relative w-full flex-1 min-h-0 overflow-hidden':'relative bg-black rounded-xl w-[140px] sm:w-[360px] max-w-full max-h-[18dvh] aspect-video overflow-hidden'}>
        <video key={`${path}-${url}-${attempt}-previous`} ref={previousRef} src={url} muted playsInline preload="metadata" aria-hidden="true" className="absolute inset-0 w-full h-full object-contain" onError={()=>setError(t('interview.previewFailed'))}/>
        <video key={`${path}-${url}-${attempt}`} ref={ref} src={url} muted playsInline preload="auto" aria-label={t('interview.preview')} className="absolute inset-0 w-full h-full object-contain" onCanPlay={()=>setError('')} onError={()=>setError(t('interview.previewFailed'))}/>
        <canvas ref={effectRef} width={320} height={180} className="absolute inset-0 w-full h-full object-contain pointer-events-none" style={{display:'none'}}/>
        <span ref={noticeRef} className="absolute bottom-0 left-0 text-[10px] text-white bg-black/80" style={{display:'none'}}>{t('editing.approximatePreview')}</span>
      </div>}
      <div className="video-viewer-tools flex-1 min-w-0">
        {!expanded && <div className="mb-2">{children}</div>}
        <div className="flex flex-wrap gap-2">
          {expanded && [-1,1].map(direction=><ToolButton key={direction} icon={direction<0?SkipBack:SkipForward} label={t(direction<0?'video.stepBack':'video.stepForward')} onClick={()=>{const state=useProjectStore.getState();state.setIsPlaying(false);state.setPlayheadPosition(Math.max(0,Math.min(videoTimelineDuration(state.project.video),state.playheadPosition+direction/30)));}}/>)}
          {!expanded && <VideoControls/>}
          {!expanded && <ToolButton icon={EyeOff} label={t('interview.hidePreview')} onClick={()=>setVisible(false)}/>}
          <ToolButton icon={expanded?Minimize:Maximize} label={t(expanded?'editor.closeViewer':'video.fullscreen')} aria-pressed={expanded} onClick={()=>setExpanded(old=>!old)}/>
        </div>
      </div>
    </div>}
  </div>;
}
