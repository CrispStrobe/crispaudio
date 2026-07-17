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

function formatTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const mins = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  const ms = Math.floor((total % 1) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const TransportControls: React.FC = () => {
  const { t } = useTranslation();
  const {
    isPlaying,
    loopEnabled,
    playheadPosition,
    project,
    setIsPlaying,
    setLoopEnabled,
    setPlayheadPosition,
  } = useProjectStore();

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
    setPlayheadPosition(project.duration);
  }, [setPlayheadPosition, project.duration]);

  const handleLoopToggle = useCallback(() => {
    setLoopEnabled(!loopEnabled);
  }, [loopEnabled, setLoopEnabled]);

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-700 select-none overflow-x-auto [&>*]:shrink-0">
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
        className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow"
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
      <div className="w-px h-6 bg-gray-700 mx-1" />

      {/* Current time */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 uppercase tracking-wide">
          {t('timeline.positionShort')}
        </span>
        <span className="font-mono text-sm text-white bg-gray-800 border border-gray-700 px-2 py-0.5 rounded min-w-[6rem] text-center tabular-nums">
          {formatTime(playheadPosition)}
        </span>
      </div>

      {/* Duration */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 uppercase tracking-wide">
          {t('timeline.durationShort')}
        </span>
        <span className="font-mono text-sm text-gray-400 bg-gray-800/50 border border-gray-700/50 px-2 py-0.5 rounded min-w-[6rem] text-center tabular-nums">
          {formatTime(project.duration)}
        </span>
      </div>
    </div>
  );
};

export default TransportControls;
