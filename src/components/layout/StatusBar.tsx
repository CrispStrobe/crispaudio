// ---------------------------------------------------------------------------
// CrispAudio — StatusBar
// Bottom bar: mode name | playback time | sample-rate / bit-depth
// ---------------------------------------------------------------------------

import { useUIStore } from '../../stores/uiStore';
import { useSynthStore } from '../../stores/synthStore';

const PANEL_LABELS: Record<string, string> = {
  sfx: 'SFX Synthesizer',
  voice: 'Voice Processor',
  timeline: 'Timeline Editor',
};

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
  const { activePanel } = useUIStore();
  const { buffer, sampleRate, bitDepth, isPlaying } = useSynthStore();

  const modeLabel = PANEL_LABELS[activePanel] ?? activePanel;
  const totalDuration = bufferDuration(buffer, sampleRate);

  return (
    <footer
      className="flex items-center px-4 gap-4 select-none shrink-0"
      style={{
        height: 28,
        background: '#070d18',
        borderTop: '1px solid #1e2d40',
        fontSize: 11,
        color: '#64748b',
      }}
    >
      {/* Left: mode */}
      <span
        className="font-medium tracking-wide uppercase"
        style={{ color: '#475569', letterSpacing: '0.06em', fontSize: 10 }}
      >
        {modeLabel}
      </span>

      {/* Divider */}
      <div style={{ width: 1, height: 12, background: '#1e293b' }} />

      {/* Center: playback time */}
      <div className="flex-1 flex items-center justify-center gap-3">
        <span
          className="font-mono"
          style={{ color: isPlaying ? '#60a5fa' : '#475569', fontSize: 11 }}
        >
          {formatTime(0)}
        </span>
        <span style={{ color: '#1e293b' }}>/</span>
        <span className="font-mono" style={{ fontSize: 11 }}>
          {formatTime(totalDuration)}
        </span>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 12, background: '#1e293b' }} />

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
          color: '#334155',
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span className="font-mono" style={{ color: '#64748b', fontSize: 11 }}>
        {value}
      </span>
    </span>
  );
}
