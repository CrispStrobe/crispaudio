import { TimeField } from './TimeField';
import { timelineDuration } from '../../lib/timelineView';
// ---------------------------------------------------------------------------
// CrispAudio — TransportControls
// Play / Pause / Stop / Loop / Skip + time display
// ---------------------------------------------------------------------------

import React, { useCallback } from 'react';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Repeat,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Component ─────────────────────────────────────────────────────────────────

function seekTimeline(time:number,width?:number,stop=false) {
  const state=useProjectStore.getState(),duration=timelineDuration(state.project);
  time=Math.max(0,Math.min(duration,time));
  if(stop)state.setIsPlaying(false);
  state.setPlayheadPosition(time);
  if(width&&(time<state.scrollOffset||time>=state.scrollOffset+width/state.zoomLevel)){
    state.setScrollOffset(Math.max(0,Math.min(duration-width/state.zoomLevel,time-width/state.zoomLevel/2)));
  }
}
const PositionDisplay = React.memo(function PositionDisplay({width}: {width?:number}) {
  const position = useProjectStore((s) => s.playheadPosition);
  const {t}=useTranslation();
  return <TimeField label={t('timeline.positionShort')} value={position} onCommit={time=>seekTimeline(time,width,true)}/>;
});

function TimelineScrubber({width}: {width?: number}) {
  const { t } = useTranslation();
  const position = useProjectStore((s) => s.playheadPosition);
  const duration = useProjectStore((s) => timelineDuration(s.project));
  return <input type="range" min={0} max={Math.max(duration, 0.01)} step={0.01}
    value={Math.min(position, duration)} disabled={duration <= 0}
    aria-label={t('timeline.seek')} className="slider-styled w-full min-w-20"
    onChange={e=>seekTimeline(+e.target.value,width)} />;
}

export const TransportControls = React.memo(function TransportControls({viewportWidth}: {viewportWidth?:number}) {
  const { t } = useTranslation();
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const loopEnabled = useProjectStore((s) => s.loopEnabled);
  const duration = useProjectStore((s) => timelineDuration(s.project));
  const setIsPlaying = useProjectStore((s) => s.setIsPlaying);
  const setLoopEnabled = useProjectStore((s) => s.setLoopEnabled);
  const setPlayheadPosition = useProjectStore((s) => s.setPlayheadPosition);

  const handlePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying, setIsPlaying]);

  const handleStop = useCallback(() => {
    setIsPlaying(false);
    setPlayheadPosition(0);
  }, [setIsPlaying, setPlayheadPosition]);

  const handleSkipStart = useCallback(() => {
    setPlayheadPosition(0);
  }, [setPlayheadPosition]);

  const handleSkipEnd = useCallback(() => {
    setPlayheadPosition(duration);
  }, [setPlayheadPosition, duration]);

  const handleLoopToggle = useCallback(() => {
    setLoopEnabled(!loopEnabled);
  }, [loopEnabled, setLoopEnabled]);

  return (
    <div className="timeline-transport flex flex-wrap items-center gap-2 px-3 py-1 bg-gray-900 border-b border-gray-700 select-none shrink-0">
      {/* Skip to start */}
      <button
        type="button"
        onClick={handleSkipStart}
        className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
        title={t('timeline.skipToStart')}
        aria-label={t('timeline.skipToStart')}
      >
        <SkipBack className="w-4 h-4" />
      </button>

      {/* Play / Pause */}
      <button
        type="button"
        onClick={handlePlayPause}
        className="flex items-center justify-center w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow"
        title={isPlaying ? t('timeline.pauseTooltip') : t('timeline.playTooltip')}
        aria-label={isPlaying ? t('timeline.pause') : t('timeline.play')}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" />
        )}
      </button>

      {/* Stop */}
      <button
        type="button"
        onClick={handleStop}
        className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
        title={t('timeline.stop')}
        aria-label={t('timeline.stop')}
      >
        <Square className="w-4 h-4" />
      </button>

      {/* Skip to end */}
      <button
        type="button"
        onClick={handleSkipEnd}
        className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
        title={t('timeline.skipToEnd')}
        aria-label={t('timeline.skipToEnd')}
      >
        <SkipForward className="w-4 h-4" />
      </button>

      {/* Loop */}
      <button
        type="button"
        onClick={handleLoopToggle}
        className={`p-1.5 rounded transition-colors ${
          loopEnabled
            ? 'text-indigo-400 bg-indigo-900/40 hover:bg-indigo-900/60'
            : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700'
        }`}
        title={t('timeline.loop')}
        aria-label={loopEnabled ? t('timeline.disableLoop') : t('timeline.enableLoop')}
        aria-pressed={loopEnabled}
      >
        <Repeat className="w-4 h-4" />
      </button>

      {/* Divider */}
      <div className="transport-divider w-px h-6 bg-gray-700 mx-1" />

      {/* Current time */}
      <div className="flex items-center gap-2">
        <span className="position-label text-xs text-gray-500 uppercase tracking-wide">
          {t('timeline.positionShort')}
        </span>
        <PositionDisplay width={viewportWidth} />
      </div>

      <div className="timeline-scrubber flex-1 min-w-24"><TimelineScrubber width={viewportWidth} /></div>

      {/* Duration */}
      <div className="flex items-center gap-2">
        <span className="position-label text-xs text-gray-500 uppercase tracking-wide">
          {t('timeline.durationShort')}
        </span>
        <TimeField label={t('timeline.durationShort')} value={duration} onCommit={seconds=>{
          const state=useProjectStore.getState();
          const content=timelineDuration({...state.project,minimumDuration:0});
          const minimumDuration=Math.max(content,seconds);
          useProjectStore.setState({project:{...state.project,minimumDuration,duration:minimumDuration}});
        }}/>
      </div>
    </div>
  );
});

export default TransportControls;
