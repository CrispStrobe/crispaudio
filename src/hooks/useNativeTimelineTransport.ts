import i18n from '../i18n';
import {useEffect,type RefObject} from 'react';
import type {TimelineEngine} from '../audio/engine/TimelineEngine';
import {nativeLiveStructureKey} from '../audio/plugins/NativePlaybackController';
import {renderedSourcesMatch} from '../audio/plugins/RenderedPreviewCache';
import {useProjectStore} from '../stores/projectStore';
import {useUIStore} from '../stores/uiStore';

/** UI observes the hardware clock; native workers own all audio deadlines. */
export function useNativeTimelineTransport(engineRef:RefObject<TimelineEngine|null>,enabled:boolean){
 useEffect(()=>{
  const engine=engineRef.current;if(!enabled||!engine)return;
  let disposed=false,internal=false,request=0,polling=false;
  const position=(time:number)=>{internal=true;useProjectStore.getState().setPlayheadPosition(time);internal=false;};
  const fail=(error:unknown)=>{
   if(disposed||error instanceof DOMException&&error.name==='AbortError')return;
   ++request;void engine.closeNativeOwned();useUIStore.setState({nativePreviewStatus:'idle'});
   useProjectStore.getState().setIsPlaying(false);
   window.dispatchEvent(new CustomEvent('crispaudio-edit-error',{detail:String(error)}));
  };
  const start=()=>{
   const state=useProjectStore.getState(),token=++request;
   if(!state.isPlaying||useUIStore.getState().timelineRecording)return;
   const range=state.rangePlayback?state.project.editRange:undefined;
   const first=range?.start??0,last=Math.min(range?.end??state.project.duration,state.project.duration);
   let time=Math.max(first,Math.min(last,state.playheadPosition));if(time>=last)time=first;
   if(first>=last){state.setIsPlaying(false);return;}
   if(state.loopEnabled&&Math.round((last-first)*48000)<2048){fail(new Error(i18n.t('nativePreview.shortLoop')));return;}
   useUIStore.setState({nativePreviewStatus:'rendering'});
   void engine.playNativeOwned(state.project,state.sources,time,first,last,state.loopEnabled,fail).then(()=>{
    if(disposed||token!==request)return;
    engine.updateMix(useProjectStore.getState().project);
   }).catch(error=>{if(token===request)fail(error);});
  };
  const unsubscribe=useProjectStore.subscribe((next,previous)=>{
   if(disposed||internal)return;
   const structural=next.project!==previous.project&&nativeLiveStructureKey(next.project)!==nativeLiveStructureKey(previous.project)
    ||next.sources!==previous.sources&&!renderedSourcesMatch(next.sources,previous.sources)
    ||next.rangePlayback&&JSON.stringify(next.project.editRange)!==JSON.stringify(previous.project.editRange)||next.rangePlayback!==previous.rangePlayback||next.loopEnabled!==previous.loopEnabled;
   const seek=next.playheadPosition!==previous.playheadPosition;
   if(next.isPlaying&&(structural||seek||!previous.isPlaying)){start();return;}
   if(!next.isPlaying&&previous.isPlaying){
    const token=++request;
    void engine.pauseNativeOwned().then(()=>{if(token!==request||disposed)return;const time=engine.getNativeStatus()?.frame;if(time!==undefined)position(time/48000);useUIStore.setState({nativePreviewStatus:engine.getNativeStatus()?'ready':'idle'});}).catch(error=>{if(token===request)fail(error);});
   }else if(!next.isPlaying&&(structural||seek)){++request;void engine.closeNativeOwned();useUIStore.setState({nativePreviewStatus:'idle'});}
   else if(next.project!==previous.project)engine.updateMix(next.project);
  });
  const recording=useUIStore.subscribe((next,previous)=>{if(next.timelineRecording&&!previous.timelineRecording){++request;void engine.closeNativeOwned();}});
  const device=()=>{if(useProjectStore.getState().isPlaying)start();else{++request;void engine.closeNativeOwned();}};
  const stop=()=>{++request;useProjectStore.getState().setIsPlaying(false);void engine.closeNativeOwned();useUIStore.setState({nativePreviewStatus:'idle'});};
  window.addEventListener('crispaudio-transport-stop',stop);
  window.addEventListener('crispaudio-output-changed',device);
  const timer=window.setInterval(()=>{
   if(polling||disposed)return;polling=true;
   void engine.pollNativeOwned().then(()=>{
    if(disposed)return;const status=engine.getNativeStatus();if(!status)return;
    const state=useProjectStore.getState();
    if(status.phase==='playing'&&state.isPlaying){useUIStore.setState({nativePreviewStatus:'playing'});position(engine.getNativePosition()??status.frame/48000);}
    if(status.phase==='ended'&&state.isPlaying){position(status.frame/48000);state.setIsPlaying(false);}
   }).catch(fail).finally(()=>{polling=false;});
  },40);
  if(useProjectStore.getState().isPlaying)start();
  return ()=>{disposed=true;++request;unsubscribe();recording();clearInterval(timer);window.removeEventListener('crispaudio-output-changed',device);window.removeEventListener('crispaudio-transport-stop',stop);void engine.closeNativeOwned();useUIStore.setState({nativePreviewStatus:'idle'});};
 },[enabled,engineRef]);
}
