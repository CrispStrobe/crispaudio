import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { timelineDuration } from '../../lib/timelineView';
import { useTimelineCanvasPlayhead } from './useTimelineCanvasPlayhead';
/** A broad transparent hit target keeps the thin red line draggable on touch. */
export function PlayheadHandle({width,overviewDuration}: {width:number;overviewDuration?:number}) {
  const {t}=useTranslation();
  const ref=useTimelineCanvasPlayhead(width,overviewDuration);
  const seek=(element:HTMLElement,x:number)=>{
    const rect=element.parentElement!.getBoundingClientRect(),state=useProjectStore.getState();
    const scale=overviewDuration?width/overviewDuration:state.zoomLevel,offset=overviewDuration?0:state.scrollOffset;
    state.setIsPlaying(false);state.setPlayheadPosition(Math.max(0,Math.min(timelineDuration(state.project),offset+(x-rect.left)/scale)));
  };
  return <div ref={ref} data-timeline-playhead className="absolute inset-y-0 z-20 pointer-events-auto" style={{width:24,marginLeft:-12,touchAction:'none',cursor:'ew-resize'}}
    role="slider" tabIndex={0} aria-label={t('editing.dragPlayhead')} aria-valuemin={0} aria-valuenow={0}
    onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.stopPropagation();e.preventDefault();const state=useProjectStore.getState();state.setPlayheadPosition(Math.max(0,Math.min(timelineDuration(state.project),state.playheadPosition+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?.1:.001))));}}}
    onPointerDown={e=>{e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);seek(e.currentTarget,e.clientX);}}
    onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId)){e.stopPropagation();seek(e.currentTarget,e.clientX);}}}
    onPointerUp={e=>{e.stopPropagation();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}>
    <div className="absolute inset-y-0 left-1/2 w-[1.5px] bg-red-500"><div className="absolute top-0 -left-1 w-2 h-2 rounded-full bg-red-500"/></div>
  </div>;
}
