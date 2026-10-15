import {hasNativeEffects} from '../lib/nativeEffects';
import {isNativeMac} from '../lib/nativeMenuPlatform';
import {RenderedPreviewCache,renderedPreviewKey,renderedSourcesMatch} from '../audio/plugins/RenderedPreviewCache';
import i18n from '../i18n';
import {useUIStore} from '../stores/uiStore';
import {playbackGraphKey} from '../lib/playbackGraphKey';
import { waitForPreviewFrame } from '../lib/videoTransport';
import { useEffect, useMemo } from 'react';
import type { RefObject } from 'react';
import type { TimelineEngine } from '../audio/engine/TimelineEngine';
import type { AudioEngineHandle } from './useAudioEngine';
import { useProjectStore } from '../stores/projectStore';

/** Anchor the playhead to the audio clock. Explicit seeks reschedule audio;
 * animation frames only display that clock, including after a hidden tab. */
export function useTimelineTransport(engineRef: RefObject<TimelineEngine | null>, audio: AudioEngineHandle) {
  const recording=useUIStore(s=>s.timelineRecording);
  const playing = useProjectStore((s) => s.isPlaying);
  const project = useProjectStore((s) => s.project);
  const native=hasNativeEffects(project);
  const playbackKey = useMemo(() => native?renderedPreviewKey(project):playbackGraphKey(project), [project,native]);
  const cache=useMemo(()=>new RenderedPreviewCache(),[]);
  useEffect(()=>()=>{cache.invalidate();useUIStore.setState({nativePreviewStatus:'idle'});},[cache]);
  useEffect(() => useProjectStore.subscribe((next, previous) => {
    const involved=hasNativeEffects(next.project)||hasNativeEffects(previous.project);
    const changed=involved&&(next.project!==previous.project&&renderedPreviewKey(next.project)!==renderedPreviewKey(previous.project)||next.sources!==previous.sources&&!renderedSourcesMatch(next.sources,previous.sources));
    if(changed){
      cache.invalidate();
      if(hasNativeEffects(next.project)||hasNativeEffects(previous.project)){
        engineRef.current?.stop();useUIStore.setState({nativePreviewStatus:'idle'});
        if(next.isPlaying)next.setIsPlaying(false);
      }
    }
    if(next.project!==previous.project&&next.isPlaying&&!hasNativeEffects(next.project))engineRef.current?.updateMix(next.project);
  }), [engineRef,cache]);
  const rangePlayback = useProjectStore(s=>s.rangePlayback);
  const rangeKey=useProjectStore(s=>s.rangePlayback?JSON.stringify(s.project.editRange):'');
  const sources = useProjectStore((s) => s.sources);
  useEffect(() => {
    const project = useProjectStore.getState().project;
    const engine = engineRef.current;
    if (!engine || !playing||recording) return;
    let cancelled = false;
    const previewAbort=new AbortController();
    let ready = false;
    let rendered:AudioBuffer|undefined;
    if(native)useUIStore.setState({nativePreviewStatus:'rendering'});
    let internalPosition = false;
    let frame = 0;
    let clockStart = 0;
    let timelineStart = 0;
    const ctx = audio.getContext();
    const selected = rangePlayback ? project.editRange : undefined;
    const start = selected?.start ?? 0, end = Math.min(selected?.end ?? project.duration,project.duration);
    if(selected && end<=start){useProjectStore.getState().setIsPlaying(false);return;}
    const reschedule = (time: number) => {
      time = Math.max(start,Math.min(end,time));
      const state=useProjectStore.getState();
      if(native){
        if(cache.get(state.project,state.sources)!==rendered){state.setIsPlaying(false);return;}
        const last=Math.min(end,rendered!.duration);
        if(time>=last){if(state.loopEnabled)time=start;else{state.setIsPlaying(false);return;}}
        engine.playRenderedPreview(rendered!,time,last,state.loopEnabled?start:undefined);
        clockStart=engine.playbackAnchor()!.frame/ctx.sampleRate;timelineStart=time;return;
      }
      clockStart = ctx.currentTime;
      timelineStart = time;
      engine.setSources(sources);
      if(selected)engine.play(useProjectStore.getState().project, time, end);else engine.play(useProjectStore.getState().project,time);
    };
    const unsubscribe = useProjectStore.subscribe((next, previous) => {
      if (ready && next.isPlaying && useProjectStore.getState().isPlaying && !internalPosition && (next.playheadPosition !== previous.playheadPosition||native&&next.loopEnabled!==previous.loopEnabled)) {
        try{reschedule(native&&next.loopEnabled!==previous.loopEnabled?engine.automationClock()?.time??next.playheadPosition:next.playheadPosition);}catch(error){useProjectStore.getState().setIsPlaying(false);window.dispatchEvent(new CustomEvent('crispaudio-edit-error',{detail:String(error)}));}
      }
    });
    const tick = () => {
      if (cancelled || !ready || document.visibilityState === 'hidden') return;
      const state = useProjectStore.getState();
      let position = native?engine.automationClock()?.time??timelineStart+ctx.currentTime-clockStart:timelineStart + ctx.currentTime - clockStart;
      if (end > start && position >= end) {
        if (state.loopEnabled) {
          position = start + (position-start) % (end-start);
          reschedule(position);
        } else {
          internalPosition = true;
          state.setPlayheadPosition(end);
          internalPosition = false;
          state.setIsPlaying(false);
          return;
        }
      }
      internalPosition = true;
      state.setPlayheadPosition(position);
      internalPosition = false;
      frame = requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (document.visibilityState !== 'hidden' && ready) frame = requestAnimationFrame(tick);
    };
    document.addEventListener('visibilitychange', onVisibility);
    void (async()=>{
      await audio.resume();
      if(native){
        if(!isNativeMac())throw new Error(i18n.t('nativePreview.macOnly'));
        rendered=await cache.prepare(project,sources,previewAbort.signal,(p,s,signal)=>engine.renderMixRange(p,0,p.duration,signal,s));
      }
      if(cancelled)return;
      await engine.prepare(project);await waitForPreviewFrame(previewAbort.signal);
      if(cancelled)return;
      reschedule(useProjectStore.getState().playheadPosition);
      ready=true;
      if(native&&useProjectStore.getState().isPlaying)useUIStore.setState({nativePreviewStatus:'playing'});
      if(document.visibilityState!=='hidden')frame=requestAnimationFrame(tick);
    })().catch(error=>{
      if(!cancelled){if(!previewAbort.signal.aborted&&!(error instanceof DOMException&&error.name==='AbortError'))window.dispatchEvent(new CustomEvent('crispaudio-edit-error',{detail:String(error)}));useProjectStore.getState().setIsPlaying(false);}
    });
    return () => {
      cancelled = true;previewAbort.abort();
      cancelAnimationFrame(frame);
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
      engine.stop();
      if(native){const state=useProjectStore.getState();useUIStore.setState({nativePreviewStatus:cache.get(state.project,state.sources)?'ready':'idle'});}
    };
  }, [audio, engineRef, playing, playbackKey, sources, rangePlayback, rangeKey, recording, native, cache]);
}
