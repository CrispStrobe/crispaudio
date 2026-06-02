// ---------------------------------------------------------------------------
// CrispAudio — useAudioEngine
// Manages a shared AudioContext, master gain, and analyser.
// Lazy-initialises on first user interaction to comply with browser autoplay policy.
// ---------------------------------------------------------------------------

import { useRef, useCallback, useEffect } from 'react';

export interface AudioEngineHandle {
  getContext: () => AudioContext;
  masterGain: GainNode;
  analyser: AnalyserNode;
  resume: () => Promise<void>;
}

// Module-level singleton so the context survives React re-mounts
let sharedCtx: AudioContext | null = null;
let sharedMasterGain: GainNode | null = null;
let sharedAnalyser: AnalyserNode | null = null;

function getOrCreateCtx(): {
  ctx: AudioContext;
  masterGain: GainNode;
  analyser: AnalyserNode;
} {
  if (sharedCtx && sharedMasterGain && sharedAnalyser) {
    return {
      ctx: sharedCtx,
      masterGain: sharedMasterGain,
      analyser: sharedAnalyser,
    };
  }

  const ctx = new AudioContext({ sampleRate: 44100, latencyHint: 'interactive' });

  const masterGain = ctx.createGain();
  masterGain.gain.value = 1;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;

  masterGain.connect(analyser);
  analyser.connect(ctx.destination);

  sharedCtx = ctx;
  sharedMasterGain = masterGain;
  sharedAnalyser = analyser;

  return { ctx, masterGain, analyser };
}

export function useAudioEngine(): AudioEngineHandle {
  const initialized = useRef(false);

  // Wire up a one-time user interaction handler to resume the context
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const resume = () => {
      if (sharedCtx && sharedCtx.state === 'suspended') {
        void sharedCtx.resume();
      }
    };

    // iOS / Chrome require a gesture before AudioContext can start
    window.addEventListener('click', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
    window.addEventListener('touchstart', resume, { once: true });

    return () => {
      window.removeEventListener('click', resume);
      window.removeEventListener('keydown', resume);
      window.removeEventListener('touchstart', resume);
    };
  }, []);

  const getContext = useCallback(() => {
    const { ctx } = getOrCreateCtx();
    return ctx;
  }, []);

  const resume = useCallback(async () => {
    const { ctx } = getOrCreateCtx();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }, []);

  // Ensure nodes are created
  const { masterGain, analyser } = getOrCreateCtx();

  return { getContext, masterGain, analyser, resume };
}
