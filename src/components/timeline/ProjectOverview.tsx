import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { videoClips } from '../../lib/videoEditing';
import { timelineDuration } from '../../lib/timelineView';
import { PlayheadHandle } from './PlayheadHandle';

/** Whole-project navigation has its own explicit scale, outside the editing rows. */
export function ProjectOverview({ viewportWidth }: { viewportWidth: number }) {
  const { t } = useTranslation();
  const project = useProjectStore(s => s.project);
  const zoom = useProjectStore(s => s.zoomLevel);
  const scroll = useProjectStore(s => s.scrollOffset);
  const duration = timelineDuration(project);
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const drag = useRef<{ x: number; scroll: number } | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const visible = Math.min(duration, viewportWidth / zoom);
  const move = (time: number) => useProjectStore.getState().setScrollOffset(Math.max(0, Math.min(duration - visible, time)));
  const rows = [videoClips(project.video).map(clip => ({ ...clip, color: '#8b5cf6' })), ...project.tracks.map(track => track.segments)].filter(row => row.length);
  return <div className="flex flex-1 min-w-0 items-center gap-3" data-project-overview>
    <span className="hidden md:block text-xs text-gray-400 shrink-0">{t('editing.projectOverview')}</span>
    <div ref={ref} className="relative h-9 min-w-0 flex-1 rounded bg-gray-950 overflow-hidden border border-gray-700" style={{ touchAction: 'none' }}
      role="slider" tabIndex={0} aria-label={t('editing.visibleTimelineRange')} aria-valuemin={0} aria-valuemax={Math.max(0,duration-visible)} aria-valuenow={scroll} title={t('editing.overviewHelp')}
      onKeyDown={e => { if(e.key==='ArrowLeft'||e.key==='ArrowRight'){ e.preventDefault();move(scroll+(e.key==='ArrowLeft'?-1:1)*visible*(e.shiftKey?1:.1)); } else if(e.key==='Home'||e.key==='End'){ e.preventDefault();move(e.key==='Home'?0:duration); } }}
      onPointerDown={e => {
        if(!duration||!width)return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const time=(e.clientX-e.currentTarget.getBoundingClientRect().left)/width*duration;
        const next=time>=scroll&&time<=scroll+visible?scroll:Math.max(0,Math.min(duration-visible,time-visible/2));
        move(next);drag.current={x:e.clientX,scroll:next};
      }}
      onPointerMove={e => { if(drag.current&&width)move(drag.current.scroll+(e.clientX-drag.current.x)/width*duration); }}
      onPointerUp={e => { drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId); }}
      onPointerCancel={() => { drag.current=null; }}>
      {duration>0&&rows.map((row,index)=>row.map(clip=><span key={`${index}:${clip.id}`} className="absolute pointer-events-none opacity-60" style={{left:`${clip.startTime/duration*100}%`,width:`${clip.duration/duration*100}%`,top:`${index/rows.length*100}%`,height:`${100/rows.length}%`,backgroundColor:clip.color}}/>))}
      {duration>0&&<div className="absolute inset-y-0 border border-sky-300 bg-sky-400/15 pointer-events-none" data-overview-window style={{left:`${scroll/duration*100}%`,width:`${visible/duration*100}%`}}/>}
      {duration>0&&width>0&&<PlayheadHandle width={width} overviewDuration={duration}/>}
    </div>
    <span className="hidden lg:block text-xs text-gray-500 shrink-0 tabular-nums">{duration.toFixed(1)} s</span>
  </div>;
}
