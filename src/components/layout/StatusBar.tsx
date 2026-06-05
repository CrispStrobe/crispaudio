// ---------------------------------------------------------------------------
// CrispAudio — StatusBar
// Bottom bar: mode name | playback time | sample-rate / bit-depth
// ---------------------------------------------------------------------------

import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../stores/uiStore';
import { useSynthStore } from '../../stores/synthStore';
import { useProjectStore } from '../../stores/projectStore';

/** Format seconds as mm:ss.xx */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** Estimate duration from a Float32Array buffer and sample rate. */
function bufferDuration(buf: Float32Array | null, sr: number): number {
  if (!buf || sr === 0) return 0;
  return buf.length / sr;
}

export function StatusBar() {
  const { t } = useTranslation();
  const activePanel = useUIStore((s) => s.activePanel);

  const buffer = useSynthStore((s) => s.buffer);
  const sampleRate = useSynthStore((s) => s.sampleRate);
  const bitDepth = useSynthStore((s) => s.bitDepth);
  const synthPlaying = useSynthStore((s) => s.isPlaying);

  const playhead = useProjectStore((s) => s.playheadPosition);
  const projectDuration = useProjectStore((s) => s.project.duration);
  const timelinePlaying = useProjectStore((s) => s.isPlaying);

  const modeLabel = t(`panels.${activePanel}`);

  // The timeline has a continuously moving playhead; the SFX/Voice panels play
  // one-shot buffers, so only their total duration is meaningful.
  const isTimeline = activePanel === 'timeline';
  const currentTime = isTimeline ? playhead : 0;
  const totalDuration = isTimeline
    ? projectDuration
    : bufferDuration(buffer, sampleRate);
  const isPlaying = isTimeline ? timelinePlaying : synthPlaying;

  return (
    <footer
      className="flex items-center px-4 gap-4 select-none shrink-0"
      style={{
        height: 28,
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-subtle)',
        fontSize: 11,
        color: '#64748b',
      }}
    >
      {/* Left: mode */}
      <span
        className="font-medium tracking-wide uppercase"
        style={{ color: 'var(--text-muted)', letterSpacing: '0.06em', fontSize: 10 }}
      >
        {modeLabel}
      </span>

      {/* Divider */}
      <div style={{ width: 1, height: 12, background: 'var(--bg-tertiary)' }} />

      {/* Center: playback time */}
      <div className="flex-1 flex items-center justify-center gap-3">
        <span
          className="font-mono"
          style={{ color: isPlaying ? 'var(--accent)' : 'var(--text-muted)', fontSize: 11 }}
        >
          {formatTime(currentTime)}
        </span>
        <span style={{ color: 'var(--border-subtle)' }}>/</span>
        <span className="font-mono" style={{ fontSize: 11 }}>
          {formatTime(totalDuration)}
        </span>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 12, background: 'var(--bg-tertiary)' }} />

      {/* Right: sample rate + bit depth */}
      <div className="flex items-center gap-3">
        <StatusChip label="SR" value={`${(sampleRate / 1000).toFixed(1)} kHz`} />
        <StatusChip label="BD" value={`${bitDepth}-bit`} />
      </div>
    </footer>
  );
}

function StatusChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        style={{
          color: 'var(--text-muted)',
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          opacity: 0.7,
        }}
      >
        {label}
      </span>
      <span className="font-mono" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
        {value}
      </span>
    </span>
  );
}
