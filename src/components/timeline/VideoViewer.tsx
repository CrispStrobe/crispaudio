import { createPortal } from 'react-dom';
import { syncVideoElement } from '../../lib/videoTransport';
import { ToolButton } from '../common/ToolButton';
import { SkipBack, SkipForward, EyeOff, Eye, Maximize, Minimize, Play, Pause } from 'lucide-react';
import { drawVideoTransition } from '../../lib/videoCanvasPreview';
import { activeVideoClips, clipSource } from '../../lib/videoEditing';
import { timelineDuration } from '../../lib/timelineView';
import { clipOpacity, transitionStyle } from '../../lib/videoPreview';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { previewUrl } from '../../lib/previewCache';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { VideoControls } from './VideoControls';
export function VideoViewer({children}: {children?:ReactNode}) {
  const {t}=useTranslation();
  const playing=useProjectStore(s=>s.isPlaying);
  const hasVideo=useProjectStore(s=>!!s.project.video);
  const enteredDocument=useRef(false);
  const wantsExpanded=useRef(false);
  const viewerRef=useRef<HTMLDivElement>(null);
  const focusViewerButton=useCallback(()=>{
    const button=viewerRef.current?.querySelector<HTMLButtonElement>('[data-video-expand]');
    button?.focus();return !!button;
  },[]);
  const stepFrame=(direction:number)=>{const state=useProjectStore.getState();state.setIsPlaying(false);state.setPlayheadPosition(Math.max(0,Math.min(timelineDuration(state.project),state.playheadPosition+direction/(state.project.frameRate??25))));};
  const [fullscreenError,setFullscreenError]=useState('');
  const path=useProjectStore(s=>{const clip=activeVideoClips(s.project.video,s.playheadPosition).at(-1);return clip?clipSource(s.project.video,clip)?.path:undefined;});
  const previousPath=useProjectStore(s=>{const clips=activeVideoClips(s.project.video,s.playheadPosition);return clips.length>1?clipSource(s.project.video,clips.at(-2))?.path:undefined;});
  const [visible,setVisible]=useState(true), [expanded,setExpanded]=useState(false);
  const [resolved,setResolved]=useState<{path:string;url:string}|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  // Keep the last decoder hidden in a picture gap, without loading an unrelated
  // default source or blocking audio while intentional black is on screen.
  const url=resolved && (!path||resolved.path===path)?resolved.url:'';
  const [previousResolved,setPreviousResolved]=useState<{path:string;url:string}|null>(null);
  const previousUrl=previousResolved?.path===previousPath?previousResolved?.url:'';
  const ref=useRef<HTMLVideoElement>(null),previousRef=useRef<HTMLVideoElement>(null),frameRef=useRef<HTMLDivElement>(null),noticeRef=useRef<HTMLSpanElement>(null),effectRef=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    let active=true;
    if(path) previewUrl(path,attempt>0).then(value=>{if(active){setResolved({path,url:value});setError('');}}).catch(err=>{if(active)setError(String(err));});
    return ()=>{active=false;};
  },[path,attempt]);
  useEffect(()=>{let active=true;if(previousPath)void previewUrl(previousPath,attempt>0).then(url=>{if(active)setPreviousResolved({path:previousPath,url});}).catch(err=>{if(active)setError(String(err));});return()=>{active=false;};},[previousPath,attempt]);
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
        syncVideoElement(element,target,state.isPlaying,setError);
      }
    };
    const elements=[ref.current,previousRef.current];for(const element of elements){element?.addEventListener('loadedmetadata',sync);element?.addEventListener('canplay',sync);element?.addEventListener('seeked',sync);}
    const unsubscribe=useProjectStore.subscribe(sync);sync();
    return ()=>{unsubscribe();for(const element of elements){element?.pause();element?.removeEventListener('loadedmetadata',sync);element?.removeEventListener('canplay',sync);element?.removeEventListener('seeked',sync);}};
  },[url,previousUrl,visible,attempt,expanded]);
  useEffect(()=>{
    if(!expanded || !hasVideo || !('__TAURI_INTERNALS__' in window))return;
    let active=true,entered=false;
    let restore:(()=>Promise<void>)|undefined;
    void import('@tauri-apps/api/window').then(async({getCurrentWindow})=>{
      const win=getCurrentWindow();restore=()=>win.setFullscreen(false);
      const wasFullscreen=await win.isFullscreen();if(!active || wasFullscreen)return;
      await win.setFullscreen(true);entered=true;if(!active)await restore();
    }).catch(error=>setFullscreenError(String(error)));
    return()=>{active=false;if(entered)void restore?.().catch(()=>{});};
  },[expanded,hasVideo]);
  useEffect(()=>{
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){wantsExpanded.current=false;setExpanded(false);}};
    document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);
  },[]);
  useEffect(()=>{const refresh=()=>setAttempt(n=>n+1);window.addEventListener('crispaudio-preview-change',refresh);return()=>window.removeEventListener('crispaudio-preview-change',refresh);},[]);
  // A transient first-load failure gets one fresh media element. Persistent
  // missing-file/codec errors remain visible and can be retried explicitly.
  useEffect(()=>{
    if(!error || attempt!==0)return;
    const timer=setTimeout(()=>setAttempt(1),500);return()=>clearTimeout(timer);
  },[error,attempt]);
  useEffect(()=>{
    const changed=()=>{if(enteredDocument.current&&!document.fullscreenElement){enteredDocument.current=false;wantsExpanded.current=false;setExpanded(false);}};
    document.addEventListener('fullscreenchange',changed);
    if(!expanded&&enteredDocument.current&&document.fullscreenElement){enteredDocument.current=false;void document.exitFullscreen();}
    return()=>document.removeEventListener('fullscreenchange',changed);
  },[expanded]);
  useEffect(()=>()=>{wantsExpanded.current=false;if(enteredDocument.current&&document.fullscreenElement){enteredDocument.current=false;void document.exitFullscreen().catch(()=>{});}},[]);
  useEffect(()=>{
    if(!expanded)return;
    const previousFocus=document.activeElement as HTMLElement|null;
    focusViewerButton();
    return()=>{
      if(!focusViewerButton()&&previousFocus?.isConnected)previousFocus.focus();
    };
  },[expanded,focusViewerButton]);
  if(!hasVideo)return null;
  const content = <div ref={viewerRef} role={expanded?'dialog':undefined} aria-modal={expanded?true:undefined} aria-label={expanded?t('interview.preview'):undefined}
    onKeyDown={e=>{
      if(!expanded)return;
      // Viewer keys must never reach timeline clip-editing shortcuts.
      e.stopPropagation();
      if(e.key==='Escape'){e.preventDefault();wantsExpanded.current=false;setExpanded(false);}
      else if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();stepFrame(e.key==='ArrowLeft'?-1:1);}
      else if(e.code==='Space'){e.preventDefault();const state=useProjectStore.getState();state.setIsPlaying(!state.isPlaying);}
      else if(e.key==='Tab'){
        const buttons=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    }} className={expanded?'fixed inset-0 z-[70] bg-black p-4 flex flex-col gap-3':'video-viewer-compact flex flex-wrap gap-3 items-start'}>
      <div ref={frameRef} data-video-frame className={expanded?'relative bg-black w-full flex-1 min-h-0 overflow-hidden':'relative bg-black rounded-xl w-[140px] sm:w-[360px] max-w-full max-h-[18dvh] aspect-video overflow-hidden'}>
        {url&&<>
        <video key={`${previousPath}-${previousUrl}-${attempt}-previous`} ref={previousRef} src={previousUrl || undefined} muted playsInline preload="metadata" aria-hidden="true" className="absolute inset-0 w-full h-full object-contain" onError={()=>setError(t('interview.previewFailed'))}/>
        <video key={`${resolved?.path}-${url}-${attempt}`} ref={ref} data-timeline-preview src={url} muted playsInline preload="auto" aria-label={t('interview.preview')} className="absolute inset-0 w-full h-full object-contain" onCanPlay={()=>setError('')} onError={()=>setError(t('interview.previewFailed'))}/>
        </>}
        <canvas ref={effectRef} width={320} height={180} className="absolute inset-0 w-full h-full object-contain pointer-events-none" style={{display:'none'}}/>
        <span ref={noticeRef} className="absolute bottom-0 left-0 text-[10px] text-white bg-black/80" style={{display:'none'}}>{t('editing.approximatePreview')}</span>
        {!path&&<span className="absolute bottom-1 left-1 text-[10px] text-gray-300 bg-black/70 pointer-events-none">{t('video.noPicture')}</span>}
      </div>
      <div className={expanded?'video-viewer-tools shrink-0 min-w-0':'video-viewer-tools flex-1 min-w-0'}>
        {!expanded && <div className="mb-2">{children}</div>}
        <div className="flex flex-wrap gap-2">
          {expanded && <ToolButton icon={playing?Pause:Play} label={t(playing?'timeline.pause':'timeline.play')} onClick={()=>useProjectStore.getState().setIsPlaying(!playing)}/>}
          {expanded && [-1,1].map(direction=><ToolButton key={direction} icon={direction<0?SkipBack:SkipForward} label={t(direction<0?'video.stepBack':'video.stepForward')} onClick={()=>stepFrame(direction)}/>)}
          {!expanded && <VideoControls/>}
          {!expanded && <ToolButton icon={EyeOff} label={t('interview.hidePreview')} onClick={()=>setVisible(false)}/>}
          <ToolButton data-video-expand icon={expanded?Minimize:Maximize} label={t(expanded?'editor.closeViewer':'video.fullscreen')} aria-pressed={expanded} onClick={()=>{if(expanded){wantsExpanded.current=false;setExpanded(false);}else{wantsExpanded.current=true;setExpanded(true);setFullscreenError('');if(!('__TAURI_INTERNALS__' in window)&&!document.fullscreenElement&&document.documentElement.requestFullscreen){void document.documentElement.requestFullscreen().then(()=>{if(wantsExpanded.current)enteredDocument.current=true;else if(document.fullscreenElement)void document.exitFullscreen();}).catch(error=>{if(wantsExpanded.current)setFullscreenError(String(error));});}}}}/>
        </div>
      </div>
      {path&&error&&<p role="alert" className="text-sm text-amber-300 shrink-0">{error} <button className="timeline-tool" onClick={()=>setAttempt(n=>n+1)}>{t('editor.retryPreview')}</button></p>}
      {fullscreenError&&<p role="alert" className="text-xs text-amber-300 shrink-0">{t('usability.fullscreenFallback')}</p>}
    </div>;
  return <div data-preview-loading={visible&&path&&!url?'true':undefined}>
    {!visible && <div className="flex flex-wrap gap-2">{children}<ToolButton icon={Eye} label={t('interview.showPreview')} onClick={()=>setVisible(true)}/></div>}
    {visible&&(expanded?createPortal(content,document.body):content)}
  </div>;
}
