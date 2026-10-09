// ---------------------------------------------------------------------------
// CrispAudio — TimelineRuler
// Time ruler drawn on a canvas. Scrolls in sync with TimelineCanvas.
// ---------------------------------------------------------------------------

import React, { useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimelineCanvasInvalidation } from './useTimelineCanvasInvalidation';
import { PlayheadHandle } from './PlayheadHandle';
import { projectHistoryGesture, useProjectStore } from '../../stores/projectStore';
import { timelineDuration } from '../../lib/timelineView';
import { RULER_HEIGHT } from '../../hooks/useTimeline';

interface TimelineRulerProps {
  width: number; // canvas CSS + buffer width
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Return a "nice" tick interval (seconds) given the pixels-per-second zoom.
 * We target roughly 80–120 px between major ticks.
 */
function chooseMajorInterval(zoomLevel: number): number {
  const targetPx = 100;
  const secondsPerTarget = targetPx / zoomLevel;
  // Round to a nice value
  const nice = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300];
  for (const n of nice) {
    if (n >= secondsPerTarget) return n;
  }
  return 300;
}

function formatRulerTime(seconds: number, interval: number): string {
  if (interval < 1) {
    return seconds.toFixed(interval < 0.1 ? 2 : 1);
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const TimelineRuler: React.FC<TimelineRulerProps> = ({ width }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { t } = useTranslation();
  const range = useProjectStore(s=>s.project.editRange);
  const mode = useProjectStore(s=>s.selectionMode);
  const rangeDrag = useRef<{kind:'new'|'start'|'end';anchor:number;original:typeof range}|null>(null);
  useEffect(()=>()=>{if(rangeDrag.current)projectHistoryGesture.end();},[]);
  const rangeTime = (clientX:number, element:HTMLElement) => {
    const state=useProjectStore.getState();
    return Math.max(0,Math.min(timelineDuration(state.project),state.scrollOffset+(clientX-element.getBoundingClientRect().left)/state.zoomLevel));
  };
  const beginRange = (e:React.PointerEvent<HTMLElement>,kind:'new'|'start'|'end') => {
    e.preventDefault();e.stopPropagation();
    const element=e.currentTarget instanceof HTMLCanvasElement?e.currentTarget:e.currentTarget.parentElement!;
    rangeDrag.current={kind,anchor:rangeTime(e.clientX,element),original:useProjectStore.getState().project.editRange};
    e.currentTarget.setPointerCapture(e.pointerId);projectHistoryGesture.begin();
  };
  const moveRange = (e:React.PointerEvent<HTMLElement>) => {
    const drag=rangeDrag.current;if(!drag)return;
    const state=useProjectStore.getState();
    const element=e.currentTarget instanceof HTMLCanvasElement?e.currentTarget:e.currentTarget.parentElement!;
    const time=rangeTime(e.clientX,element),epsilon=1/state.project.sampleRate;
    if(drag.kind==='new')state.setEditRange(Math.min(drag.anchor,time),Math.max(drag.anchor,time));
    else if(drag.original){
      if(drag.kind==='start')state.setEditRange(Math.min(time,drag.original.end-epsilon),drag.original.end);
      else state.setEditRange(drag.original.start,Math.max(time,drag.original.start+epsilon));
    }
  };
  const endRange = useCallback((cancel=false) => {
    if(!rangeDrag.current)return;
    if(cancel){const original=rangeDrag.current.original;const state=useProjectStore.getState();useProjectStore.setState({project:{...state.project,editRange:original}});}
    rangeDrag.current=null;projectHistoryGesture.end();
  }, []);
  const markers=useProjectStore(s=>s.project.markers);
  const zoomLevel = useProjectStore((s) => s.zoomLevel);
  const scrollOffset = useProjectStore((s) => s.scrollOffset);
  const setPlayheadPosition = useProjectStore((s) => s.setPlayheadPosition);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cssWidth = width;
    const cssHeight = RULER_HEIGHT;

    // Resize if needed
    if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const isLight = document.documentElement.classList.contains('light');

    // Background
    ctx.fillStyle = isLight ? '#e2e8f0' : '#1e293b';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    if(range){
      ctx.fillStyle='rgba(99,102,241,0.28)';
      ctx.fillRect((range.start-scrollOffset)*zoomLevel,0,(range.end-range.start)*zoomLevel,cssHeight);
    }
    // Bottom border
    ctx.strokeStyle = isLight ? '#94a3b8' : '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cssHeight - 0.5);
    ctx.lineTo(cssWidth, cssHeight - 0.5);
    ctx.stroke();

    const majorInterval = chooseMajorInterval(zoomLevel);
    const minorInterval = majorInterval / 5;

    // Time range visible
    const timeStart = scrollOffset;
    const timeEnd = scrollOffset + cssWidth / zoomLevel;

    // First tick aligned to interval
    const firstMajor = Math.floor(timeStart / majorInterval) * majorInterval;
    const firstMinor = Math.floor(timeStart / minorInterval) * minorInterval;

    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = isLight ? '#475569' : '#94a3b8';

    // Minor ticks
    ctx.strokeStyle = isLight ? '#94a3b8' : '#334155';
    ctx.lineWidth = 1;
    for (let t = firstMinor; t <= timeEnd + minorInterval; t += minorInterval) {
      const x = (t - scrollOffset) * zoomLevel;
      if (x < 0 || x > cssWidth) continue;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, cssHeight - 6);
      ctx.lineTo(x + 0.5, cssHeight - 1);
      ctx.stroke();
    }

    // Major ticks + labels
    ctx.strokeStyle = isLight ? '#64748b' : '#475569';
    ctx.lineWidth = 1;
    for (let t = firstMajor; t <= timeEnd + majorInterval; t += majorInterval) {
      const x = (t - scrollOffset) * zoomLevel;
      if (x < -20 || x > cssWidth + 20) continue;

      // Tick line
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 4);
      ctx.lineTo(x + 0.5, cssHeight - 1);
      ctx.stroke();

      // Label
      if (x >= 0) {
        const label = formatRulerTime(t, majorInterval);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(label, x + 3, 14);
      }
    }

  }, [zoomLevel, scrollOffset, width, range]);

  useTimelineCanvasInvalidation(draw);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if(mode==='range')return;
      const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = scrollOffset + x / zoomLevel;
      setPlayheadPosition(Math.max(0, time));
    },
    [scrollOffset, zoomLevel, setPlayheadPosition, mode],
  );

  return (
    <div className="relative overflow-hidden" style={{ width, height: RULER_HEIGHT }}>
    <canvas
      ref={canvasRef}
      className="block cursor-pointer"
      onClick={handleClick}
      style={{ width, height: RULER_HEIGHT, touchAction:mode==='range'?'none':undefined }}
      data-help={mode==='range'?'range':'play'}
      tabIndex={0}
      onPointerDown={e=>{if(mode==='range')beginRange(e,'new');}}
      onPointerMove={moveRange}
      onPointerUp={()=>endRange()}
      onPointerCancel={()=>endRange(true)}
      onLostPointerCapture={()=>endRange(true)}
      onKeyDown={e=>{if(e.key==='Escape'&&rangeDrag.current){e.preventDefault();e.stopPropagation();endRange(true);}}}
      aria-label={t('timeline.ruler')}
    />
    {markers?.map(marker=><button key={marker.id} title={marker.name} aria-label={marker.name} className="absolute top-0 w-6 h-5 text-amber-300 bg-amber-950/70 rounded touch-none" style={{left:(marker.time-scrollOffset)*zoomLevel-12}} onClick={()=>setPlayheadPosition(marker.time)} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);projectHistoryGesture.begin();}} onPointerMove={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId))return;const rect=e.currentTarget.parentElement!.getBoundingClientRect();const time=Math.max(0,scrollOffset+(e.clientX-rect.left)/zoomLevel);const state=useProjectStore.getState();useProjectStore.setState({project:{...state.project,markers:state.project.markers?.map(m=>m.id===marker.id?{...m,time}:m)}});}} onPointerUp={e=>{e.currentTarget.releasePointerCapture(e.pointerId);projectHistoryGesture.end();}} onPointerCancel={()=>projectHistoryGesture.end()}>◆</button>)}
    {range && (['start','end'] as const).map(side=><RangeEdge key={side} side={side} range={range}
      zoomLevel={zoomLevel} scrollOffset={scrollOffset} onBegin={beginRange} onMove={moveRange} onEnd={endRange}/>)}
    <PlayheadHandle width={width}/>
    </div>
  );
};

export default TimelineRuler;

function RangeEdge({side,range,zoomLevel,scrollOffset,onBegin,onMove,onEnd}:{
  side:'start'|'end';range:{start:number;end:number};zoomLevel:number;scrollOffset:number;
  onBegin:(event:React.PointerEvent<HTMLElement>,kind:'start'|'end')=>void;
  onMove:(event:React.PointerEvent<HTMLElement>)=>void;onEnd:(cancel?:boolean)=>void;
}) {
  const {t}=useTranslation();
  return <button type="button" role="slider"
      data-help="range" aria-label={t(side==='start'?'ranges.start':'ranges.end')} aria-valuemin={0} aria-valuemax={timelineDuration(useProjectStore.getState().project)} aria-valuenow={range[side]}
      className="absolute bottom-0 h-3 w-5 bg-indigo-500/80 rounded touch-none cursor-ew-resize z-10"
      style={{left:(range[side]-scrollOffset)*zoomLevel-10}}
      onPointerDown={e=>onBegin(e,side)} onPointerMove={onMove} onPointerUp={()=>onEnd()}
      onPointerCancel={()=>onEnd(true)} onLostPointerCapture={()=>onEnd(true)}
      onKeyDown={e=>{
        e.stopPropagation();if(e.key==='Escape'){onEnd(true);return;}
        if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;e.preventDefault();
        const state=useProjectStore.getState(),amount=(e.shiftKey ? .1 : .001)*(e.key==='ArrowLeft'?-1:1),epsilon=1/state.project.sampleRate;
        if(side==='start')state.setEditRange(Math.max(0,Math.min(range.end-epsilon,range.start+amount)),range.end);
        else state.setEditRange(range.start,Math.min(timelineDuration(state.project),Math.max(range.start+epsilon,range.end+amount)));
      }}/>;
}
