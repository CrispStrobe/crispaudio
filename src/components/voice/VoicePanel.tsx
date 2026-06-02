// ---------------------------------------------------------------------------
// CrispAudio — VoicePanel
// Voice processor panel: file drop → presets → A/B → tabs → visualisations.
// ---------------------------------------------------------------------------

import { useCallback, useRef, useState, useEffect } from 'react';
import {
  Upload,
  Play,
  Square,
  Download,
  ArrowLeftRight,
} from 'lucide-react';
import { useVoiceStore } from '../../stores/voiceStore';
import type { VoiceSettings, VoicePresetName } from '../../types/voicelab';

// ---------------------------------------------------------------------------
// Preset labels
// ---------------------------------------------------------------------------

const PRESET_NAMES: VoicePresetName[] = [
  'original',
  'classicRobot',
  'deepRobot',
  'alien',
  'cyborg',
  'radio',
  'metallic',
  'demon',
  'chipmunk',
];

const PRESET_LABELS: Record<VoicePresetName, string> = {
  original: 'Original',
  classicRobot: 'Robot',
  deepRobot: 'Deep Robot',
  alien: 'Alien',
  cyborg: 'Cyborg',
  radio: 'Radio',
  metallic: 'Metallic',
  demon: 'Demon',
  chipmunk: 'Chipmunk',
};

// ---------------------------------------------------------------------------
// Parameter tab definitions
// ---------------------------------------------------------------------------

type TabId = 'pitch' | 'modulation' | 'effects' | 'dynamics';

interface ParamDef {
  key: keyof VoiceSettings;
  label: string;
  min: number;
  max: number;
  step?: number;
  formatValue?: (v: number) => string;
}

const TABS: { id: TabId; label: string; params: ParamDef[] }[] = [
  {
    id: 'pitch',
    label: 'Pitch',
    params: [
      { key: 'pitchShift', label: 'Pitch Shift', min: -24, max: 24, step: 0.5, formatValue: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} st` },
      { key: 'formantShift', label: 'Formant Shift', min: -1, max: 1, step: 0.01 },
      { key: 'speedChange', label: 'Speed', min: 0.5, max: 2, step: 0.01, formatValue: (v) => `${v.toFixed(2)}x` },
      { key: 'vocoderFreq', label: 'Vocoder Freq', min: 50, max: 2000, step: 1, formatValue: (v) => `${Math.round(v)} Hz` },
      { key: 'vocoderMix', label: 'Vocoder Mix', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    id: 'modulation',
    label: 'Modulation',
    params: [
      { key: 'ringModFreq', label: 'Ring Mod Freq', min: 1, max: 500, step: 1, formatValue: (v) => `${Math.round(v)} Hz` },
      { key: 'ringModMix', label: 'Ring Mod Mix', min: 0, max: 1, step: 0.01 },
      { key: 'tremoloRate', label: 'Tremolo Rate', min: 0, max: 20, step: 0.1, formatValue: (v) => `${v.toFixed(1)} Hz` },
      { key: 'tremoloDepth', label: 'Tremolo Depth', min: 0, max: 1, step: 0.01 },
      { key: 'chorusRate', label: 'Chorus Rate', min: 0.1, max: 10, step: 0.1, formatValue: (v) => `${v.toFixed(1)} Hz` },
      { key: 'chorusDepth', label: 'Chorus Depth', min: 0, max: 1, step: 0.01 },
      { key: 'chorusMix', label: 'Chorus Mix', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    id: 'effects',
    label: 'Effects',
    params: [
      { key: 'delayTime', label: 'Delay Time', min: 0, max: 1, step: 0.01, formatValue: (v) => `${(v * 1000).toFixed(0)} ms` },
      { key: 'delayFeedback', label: 'Delay Feedback', min: 0, max: 0.99, step: 0.01 },
      { key: 'delayMix', label: 'Delay Mix', min: 0, max: 1, step: 0.01 },
      { key: 'reverbSize', label: 'Reverb Size', min: 0, max: 1, step: 0.01 },
      { key: 'reverbDecay', label: 'Reverb Decay', min: 0.1, max: 10, step: 0.1, formatValue: (v) => `${v.toFixed(1)}s` },
      { key: 'reverbMix', label: 'Reverb Mix', min: 0, max: 1, step: 0.01 },
      { key: 'lowpassFreq', label: 'Low Pass', min: 200, max: 22000, step: 10, formatValue: (v) => `${Math.round(v)} Hz` },
      { key: 'highpassFreq', label: 'High Pass', min: 0, max: 8000, step: 10, formatValue: (v) => `${Math.round(v)} Hz` },
    ],
  },
  {
    id: 'dynamics',
    label: 'Dynamics',
    params: [
      { key: 'compThreshold', label: 'Comp Threshold', min: -60, max: 0, step: 0.5, formatValue: (v) => `${v.toFixed(1)} dB` },
      { key: 'compRatio', label: 'Comp Ratio', min: 1, max: 20, step: 0.5, formatValue: (v) => `${v.toFixed(1)}:1` },
      { key: 'distortionDrive', label: 'Distortion Drive', min: 0, max: 1, step: 0.01 },
      { key: 'distortionMix', label: 'Distortion Mix', min: 0, max: 1, step: 0.01 },
      { key: 'bitCrushBits', label: 'Bit Crush Bits', min: 1, max: 16, step: 1, formatValue: (v) => `${Math.round(v)}-bit` },
      { key: 'bitCrushMix', label: 'Bit Crush Mix', min: 0, max: 1, step: 0.01 },
      { key: 'noiseGateThreshold', label: 'Noise Gate', min: -96, max: 0, step: 1, formatValue: (v) => `${v.toFixed(0)} dB` },
      { key: 'masterGain', label: 'Master Gain', min: 0, max: 2, step: 0.01, formatValue: (v) => `${v.toFixed(2)}x` },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers / shared sub-components
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1" style={{ marginBottom: 8 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#22c55e',
          }}
        >
          {title}
        </span>
        <div style={{ flex: 1, height: 1, background: '#1e2d40' }} />
      </div>
      {children}
    </div>
  );
}

function SliderRow({
  def,
  value,
  onChange,
}: {
  def: ParamDef;
  value: number;
  onChange: (key: keyof VoiceSettings, v: number) => void;
}) {
  const display = def.formatValue ? def.formatValue(value) : value.toFixed(3);
  return (
    <div className="flex items-center gap-2" style={{ height: 22 }}>
      <span
        style={{
          width: 110,
          fontSize: 10,
          color: '#64748b',
          flexShrink: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {def.label}
      </span>
      <input
        type="range"
        min={def.min}
        max={def.max}
        step={def.step ?? 0.001}
        value={value}
        onChange={(e) => onChange(def.key, parseFloat(e.target.value))}
        style={{ flex: 1, height: 4, accentColor: '#22c55e', cursor: 'pointer' }}
      />
      <span
        className="font-mono"
        style={{ width: 54, fontSize: 10, color: '#475569', textAlign: 'right', flexShrink: 0 }}
      >
        {display}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Waveform canvas
// ---------------------------------------------------------------------------

function WaveformCanvas({
  buffer,
  width = 200,
  height = 56,
  color = '#22c55e',
  label,
}: {
  buffer: AudioBuffer | null;
  width?: number;
  height?: number;
  color?: string;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0a1120';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#1e2d40';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    if (!buffer) return;
    const data = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / width));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x < width; x++) {
      const s = data[Math.min(x * step, data.length - 1)];
      const y = ((1 - s) / 2) * height;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [buffer, width, height, color]);

  return (
    <div>
      {label && (
        <div style={{ fontSize: 9, color: '#334155', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ display: 'block', width: '100%', height, borderRadius: 4 }}
      />
    </div>
  );
}

function SpectrumCanvas({
  buffer,
  width = 200,
  height = 56,
}: {
  buffer: AudioBuffer | null;
  width?: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0a1120';
    ctx.fillRect(0, 0, width, height);

    if (!buffer) return;
    const data = buffer.getChannelData(0);
    const numBars = 32;
    const chunkSize = Math.floor(data.length / numBars);
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, '#166534');
    gradient.addColorStop(0.6, '#22c55e');
    gradient.addColorStop(1, '#86efac');
    const barW = Math.floor(width / numBars) - 1;
    for (let i = 0; i < numBars; i++) {
      let sum = 0;
      for (let j = 0; j < chunkSize; j++) {
        const s = data[i * chunkSize + j] ?? 0;
        sum += s * s;
      }
      const rms = Math.sqrt(sum / chunkSize);
      const barH = Math.min(height, rms * height * 4);
      ctx.fillStyle = gradient;
      ctx.fillRect(i * (barW + 1), height - barH, barW, barH);
    }
  }, [buffer, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: 'block', width: '100%', height, borderRadius: 4 }}
    />
  );
}

// ---------------------------------------------------------------------------
// A/B controls
// ---------------------------------------------------------------------------

function ABControls() {
  const { activeSlot, morphAmount, setActiveSlot, setMorphAmount, swapSlots } =
    useVoiceStore();

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded"
      style={{ background: '#0d1929', border: '1px solid #1e2d40' }}
    >
      {(['A', 'B'] as const).map((slot) => (
        <button
          key={slot}
          onClick={() => setActiveSlot(slot)}
          className="font-mono font-bold rounded"
          style={{
            width: 28,
            height: 24,
            fontSize: 12,
            background: activeSlot === slot ? '#166534' : '#1e293b',
            color: activeSlot === slot ? '#86efac' : '#475569',
            border: `1px solid ${activeSlot === slot ? '#22c55e' : '#334155'}`,
            cursor: 'pointer',
          }}
        >
          {slot}
        </button>
      ))}
      <span style={{ fontSize: 10, color: '#475569' }}>Morph</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={morphAmount}
        onChange={(e) => setMorphAmount(parseFloat(e.target.value))}
        style={{ width: 80, height: 4, accentColor: '#8b5cf6' }}
      />
      <span className="font-mono" style={{ fontSize: 10, color: '#475569', width: 30 }}>
        {Math.round(morphAmount * 100)}%
      </span>
      <button
        onClick={swapSlots}
        title="Swap A ↔ B"
        className="flex items-center justify-center rounded"
        style={{
          width: 28,
          height: 24,
          background: '#1e293b',
          border: '1px solid #334155',
          color: '#64748b',
          cursor: 'pointer',
        }}
      >
        <ArrowLeftRight size={12} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// File drop zone
// ---------------------------------------------------------------------------

function FileDropZone({ onFile }: { onFile: (buf: AudioBuffer) => void }) {
  const [dragging, setDragging] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function loadFile(file: File) {
    try {
      const arrayBuf = await file.arrayBuffer();
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      onFile(decoded);
      setFilename(file.name);
      await ctx.close();
    } catch {
      // silently ignore decode errors in the UI
    }
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) loadFile(file);
      }}
      onClick={() => inputRef.current?.click()}
      className="flex flex-col items-center justify-center rounded-lg cursor-pointer transition-all"
      style={{
        height: 72,
        border: `2px dashed ${dragging ? '#22c55e' : '#1e2d40'}`,
        background: dragging ? '#0d2318' : '#0a1120',
        color: dragging ? '#86efac' : '#475569',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) loadFile(file);
        }}
      />
      <Upload size={20} style={{ marginBottom: 4, opacity: 0.7 }} />
      <span style={{ fontSize: 11 }}>
        {filename ?? 'Drop audio file or click to browse'}
      </span>
      {filename && (
        <span style={{ fontSize: 9, color: '#22c55e', marginTop: 2 }}>{filename}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function VoicePanel() {
  const store = useVoiceStore();
  const {
    settingsA,
    settingsB,
    activeSlot,
    sourceBuffer,
    processedBuffer,
    isProcessing,
    selectedPreset,
    setSourceBuffer,
    setSettings,
    loadPreset,
    setIsProcessing,
    setProcessedBuffer,
  } = store;

  const settings = activeSlot === 'A' ? settingsA : settingsB;
  const [activeTab, setActiveTab] = useState<TabId>('pitch');
  const [isPlaying, setIsPlaying] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const handlePlay = useCallback(
    (buf: AudioBuffer | null) => {
      if (!buf) return;
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext({ sampleRate: buf.sampleRate });
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      sourceRef.current?.stop();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start();
      src.onended = () => setIsPlaying(false);
      sourceRef.current = src;
      setIsPlaying(true);
    },
    [],
  );

  const handleStop = useCallback(() => {
    sourceRef.current?.stop();
    setIsPlaying(false);
  }, []);

  // Stub process — in a real build this would call VoiceEngine
  const handleProcess = useCallback(() => {
    if (!sourceBuffer) return;
    setIsProcessing(true);
    // Placeholder: pass-through with a short delay to simulate processing
    setTimeout(() => {
      setProcessedBuffer(sourceBuffer);
      setIsProcessing(false);
    }, 400);
  }, [sourceBuffer, setIsProcessing, setProcessedBuffer]);

  function downloadProcessed() {
    if (!processedBuffer) return;
    const sr = processedBuffer.sampleRate;
    const numSamples = processedBuffer.length;
    const data = processedBuffer.getChannelData(0);
    const wavBuf = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(wavBuf);
    const enc = (off: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };
    enc(0, 'RIFF'); view.setUint32(4, 36 + numSamples * 2, true);
    enc(8, 'WAVE'); enc(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, sr, true);
    view.setUint32(28, sr * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); enc(36, 'data');
    view.setUint32(40, numSamples * 2, true);
    let off = 44;
    for (let i = 0; i < numSamples; i++) {
      view.setInt16(off, Math.round(Math.max(-1, Math.min(1, data[i])) * 32767), true);
      off += 2;
    }
    const blob = new Blob([wavBuf], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `crispaudio_voice_${Date.now()}.wav`;
    a.click(); URL.revokeObjectURL(url);
  }

  const currentTab = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="flex flex-col h-full" style={{ background: '#0f172a', overflow: 'hidden' }}>
      {/* ── Toolbar ───────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 py-2 shrink-0"
        style={{ borderBottom: '1px solid #1e2d40', background: '#0a1120' }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#22c55e',
          }}
        >
          Voice Processor
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={isPlaying ? handleStop : () => handlePlay(processedBuffer ?? sourceBuffer)}
          disabled={!sourceBuffer && !processedBuffer}
          className="flex items-center gap-1.5 px-3 py-1 rounded font-medium"
          style={{
            background: isPlaying ? '#7f1d1d' : (sourceBuffer || processedBuffer ? '#14532d' : '#1e293b'),
            color: isPlaying ? '#fca5a5' : (sourceBuffer || processedBuffer ? '#86efac' : '#334155'),
            border: `1px solid ${isPlaying ? '#dc2626' : (sourceBuffer || processedBuffer ? '#22c55e' : '#334155')}`,
            fontSize: 11,
            cursor: (sourceBuffer || processedBuffer) ? 'pointer' : 'not-allowed',
          }}
        >
          {isPlaying ? <Square size={12} /> : <Play size={12} />}
          {isPlaying ? 'Stop' : 'Play'}
        </button>
        <button
          onClick={handleProcess}
          disabled={!sourceBuffer || isProcessing}
          className="flex items-center gap-1.5 px-3 py-1 rounded font-medium"
          style={{
            background: sourceBuffer && !isProcessing ? '#1d4ed8' : '#1e293b',
            color: sourceBuffer && !isProcessing ? '#bfdbfe' : '#334155',
            border: `1px solid ${sourceBuffer && !isProcessing ? '#3b82f6' : '#334155'}`,
            fontSize: 11,
            cursor: sourceBuffer && !isProcessing ? 'pointer' : 'not-allowed',
          }}
        >
          {isProcessing ? 'Processing…' : 'Process'}
        </button>
        <button
          onClick={downloadProcessed}
          disabled={!processedBuffer}
          className="flex items-center gap-1.5 px-3 py-1 rounded font-medium"
          style={{
            background: processedBuffer ? '#166534' : '#1e293b',
            color: processedBuffer ? '#86efac' : '#334155',
            border: `1px solid ${processedBuffer ? '#22c55e' : '#334155'}`,
            fontSize: 11,
            cursor: processedBuffer ? 'pointer' : 'not-allowed',
          }}
        >
          <Download size={12} />
          Export
        </button>
      </div>

      {/* ── Drop zone ─────────────────────────────────────────────── */}
      <div className="px-4 py-2 shrink-0" style={{ borderBottom: '1px solid #1e2d40' }}>
        <FileDropZone onFile={setSourceBuffer} />
      </div>

      {/* ── Preset bar ────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1 px-4 py-2 shrink-0 flex-wrap"
        style={{ borderBottom: '1px solid #1e2d40', background: '#0d1929' }}
      >
        {PRESET_NAMES.map((name) => (
          <button
            key={name}
            onClick={() => loadPreset(name)}
            className="rounded transition-all"
            style={{
              padding: '2px 8px',
              fontSize: 10,
              fontWeight: 500,
              background: selectedPreset === name ? '#166534' : '#1e293b',
              color: selectedPreset === name ? '#86efac' : '#64748b',
              border: `1px solid ${selectedPreset === name ? '#22c55e' : '#334155'}`,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              if (selectedPreset !== name) {
                (e.currentTarget as HTMLButtonElement).style.background = '#166534';
                (e.currentTarget as HTMLButtonElement).style.color = '#86efac';
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#22c55e';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedPreset !== name) {
                (e.currentTarget as HTMLButtonElement).style.background = '#1e293b';
                (e.currentTarget as HTMLButtonElement).style.color = '#64748b';
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#334155';
              }
            }}
          >
            {PRESET_LABELS[name]}
          </button>
        ))}
      </div>

      {/* ── A/B row ───────────────────────────────────────────────── */}
      <div className="px-4 py-2 shrink-0" style={{ borderBottom: '1px solid #1e2d40' }}>
        <ABControls />
      </div>

      {/* ── 2-column body ─────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Left: tabbed parameter area */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Tab strip */}
          <div
            className="flex items-center gap-1 px-4 shrink-0"
            style={{ background: '#0a1120', borderBottom: '1px solid #1e2d40', paddingTop: 6, paddingBottom: 0 }}
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="transition-all"
                style={{
                  padding: '4px 14px',
                  fontSize: 11,
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  background: 'transparent',
                  color: activeTab === tab.id ? '#22c55e' : '#475569',
                  border: 'none',
                  borderBottom: `2px solid ${activeTab === tab.id ? '#22c55e' : 'transparent'}`,
                  cursor: 'pointer',
                  marginBottom: -1,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Parameter sliders */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <Section title={currentTab.label}>
              {currentTab.params.map((def) => (
                <SliderRow
                  key={def.key}
                  def={def}
                  value={settings[def.key] as number}
                  onChange={(key, v) => setSettings({ [key]: v })}
                />
              ))}
            </Section>
          </div>
        </div>

        {/* Right: visualisations */}
        <div
          className="flex flex-col gap-3 px-3 py-3"
          style={{ width: 220, borderLeft: '1px solid #1e2d40', flexShrink: 0 }}
        >
          <Section title="Source">
            <WaveformCanvas
              buffer={sourceBuffer}
              width={196}
              height={52}
              color="#64748b"
            />
          </Section>
          <Section title="Processed">
            <WaveformCanvas
              buffer={processedBuffer}
              width={196}
              height={52}
              color="#22c55e"
            />
          </Section>
          <Section title="Spectrum">
            <SpectrumCanvas buffer={processedBuffer ?? sourceBuffer} width={196} height={52} />
          </Section>
        </div>
      </div>
    </div>
  );
}
