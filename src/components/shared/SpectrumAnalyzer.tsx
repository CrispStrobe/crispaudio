import React, { useEffect, useRef } from 'react';

interface SpectrumAnalyzerProps {
  analyserNode: AnalyserNode | null;
  numBands?: number;
  color?: string;
  height?: number;
  className?: string;
}

// Map a 0..1 band index to a display color via hue rotation (blue → cyan → green)
function bandColor(t: number, baseColor: string): string {
  // If a custom single color is provided, just vary lightness
  if (baseColor !== '#6366f1') {
    return baseColor;
  }
  // Default: blue→cyan gradient
  const hue = 230 - t * 60; // 230 (blue) → 170 (cyan-green)
  const lightness = 45 + t * 20;
  return `hsl(${hue}, 75%, ${lightness}%)`;
}

export const SpectrumAnalyzer: React.FC<SpectrumAnalyzerProps> = ({
  analyserNode,
  numBands = 32,
  color = '#6366f1',
  height = 80,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const peakHoldRef = useRef<Float32Array>(new Float32Array(numBands));
  const peakDecayRef = useRef<Float32Array>(new Float32Array(numBands));
  const smoothBandsRef = useRef<Float32Array>(new Float32Array(numBands));

  // Stop any running animation loop
  const stopLoop = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  useEffect(() => {
    peakHoldRef.current = new Float32Array(numBands);
    peakDecayRef.current = new Float32Array(numBands);
    smoothBandsRef.current = new Float32Array(numBands);
  }, [numBands]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Sync canvas size to container
    const syncSize = () => {
      const w = container.clientWidth || 200;
      canvas.width = w;
      canvas.height = height;
    };
    syncSize();

    const ro = new ResizeObserver(() => syncSize());
    ro.observe(container);

    if (!analyserNode) {
      // Draw idle state
      const ctx = canvas.getContext('2d')!;
      const drawIdle = () => {
        const w = canvas.width;
        const h = canvas.height;
        ctx.fillStyle = '#0f1117';
        ctx.fillRect(0, 0, w, h);
        const barW = Math.max(1, (w / numBands) - 1);
        for (let i = 0; i < numBands; i++) {
          const t = i / (numBands - 1);
          // tiny noise floor bars
          const bh = 2 + Math.random() * 2;
          ctx.fillStyle = bandColor(t, color) + '55';
          ctx.fillRect(i * (barW + 1), h - bh, barW, bh);
        }
      };
      drawIdle();
      return () => {
        stopLoop();
        ro.disconnect();
      };
    }

    analyserNode.fftSize = 2048;
    analyserNode.smoothingTimeConstant = 0.6;
    const freqBinCount = analyserNode.frequencyBinCount;
    const freqData = new Uint8Array(freqBinCount);

    const FALLOFF_SPEED = 0.08;
    const PEAK_HOLD_FRAMES = 45;
    const PEAK_DECAY = 0.015;
    const peakTimers = new Float32Array(numBands);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyserNode.getByteFrequencyData(freqData);

      const ctx = canvas.getContext('2d')!;
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = '#0f1117';
      ctx.fillRect(0, 0, w, h);

      // dB grid lines (subtle)
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 1;
      for (let db = -12; db > -60; db -= 12) {
        const y = h * (1 - (db + 60) / 60);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Map frequency bins to numBands using log scale
      const nyquist = analyserNode.context.sampleRate / 2;
      const freqMin = 20;
      const freqMax = nyquist;
      const logMin = Math.log2(freqMin);
      const logMax = Math.log2(freqMax);

      const bands = new Float32Array(numBands);
      for (let b = 0; b < numBands; b++) {
        const fLow  = Math.pow(2, logMin + (b / numBands) * (logMax - logMin));
        const fHigh = Math.pow(2, logMin + ((b + 1) / numBands) * (logMax - logMin));
        const idxLow  = Math.floor((fLow  / nyquist) * freqBinCount);
        const idxHigh = Math.ceil((fHigh / nyquist) * freqBinCount);

        let peak = 0;
        for (let i = idxLow; i <= idxHigh && i < freqBinCount; i++) {
          if (freqData[i] > peak) peak = freqData[i];
        }
        bands[b] = peak / 255;
      }

      // Smooth bands
      const smooth = smoothBandsRef.current;
      for (let b = 0; b < numBands; b++) {
        if (bands[b] > smooth[b]) {
          smooth[b] = bands[b];
        } else {
          smooth[b] += (bands[b] - smooth[b]) * FALLOFF_SPEED;
        }
      }

      const gap = 1;
      const barW = Math.max(1, (w - gap * (numBands - 1)) / numBands);

      for (let b = 0; b < numBands; b++) {
        const x = b * (barW + gap);
        const normalized = smooth[b];
        const t = b / (numBands - 1);

        // Main bar
        const barH = normalized * (h - 4);
        const barColor = bandColor(t, color);

        // Gradient fill for bar
        if (barH > 0) {
          const grad = ctx.createLinearGradient(0, h - barH, 0, h);
          grad.addColorStop(0, barColor);
          grad.addColorStop(1, barColor + '88');
          ctx.fillStyle = grad;
          ctx.fillRect(x, h - barH, barW, barH);
        }

        // Peak hold indicator
        const holdPeak = peakHoldRef.current;
        const holdDecay = peakDecayRef.current;

        if (normalized >= holdPeak[b]) {
          holdPeak[b] = normalized;
          peakTimers[b] = 0;
        } else {
          peakTimers[b]++;
          if (peakTimers[b] > PEAK_HOLD_FRAMES) {
            holdDecay[b] += PEAK_DECAY;
            holdPeak[b] = Math.max(0, holdPeak[b] - holdDecay[b]);
          }
        }

        if (holdPeak[b] > 0.01) {
          const peakY = h - holdPeak[b] * (h - 4) - 2;
          ctx.fillStyle = holdPeak[b] > 0.85
            ? '#ef4444'
            : holdPeak[b] > 0.65
            ? '#f59e0b'
            : barColor;
          ctx.fillRect(x, peakY, barW, 2);
        }
      }

      // Freq labels
      ctx.fillStyle = '#4b5563';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('20', 0, h - 2);
      ctx.textAlign = 'center';
      ctx.fillText('1k', w * 0.42, h - 2);
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(nyquist / 1000)}k`, w, h - 2);
    };

    draw();

    return () => {
      stopLoop();
      ro.disconnect();
    };
  }, [analyserNode, numBands, color, height]);

  return (
    <div ref={containerRef} className={`w-full overflow-hidden rounded ${className}`} style={{ height }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: `${height}px` }}
        className="rounded"
      />
    </div>
  );
};

export default SpectrumAnalyzer;
