import { useCallback, useEffect, useRef, useState } from 'react';

export function useSfxPlayback(buffer: Float32Array | null, sampleRate: number, isPlaying: boolean, setIsPlaying: (playing: boolean) => void) {
  const [isLooping, setIsLooping] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const loopRef = useRef(false);
  const generationRef = useRef(0);
  const bufferCacheRef = useRef<{ samples: Float32Array; rate: number; ctx: AudioContext; audio: AudioBuffer } | null>(null);


  const stopSource = useCallback(() => {
    generationRef.current++;
    const src = sourceRef.current;
    sourceRef.current = null;
    if (!src) return;
    src.onended = null;
    try { src.stop(); } catch { /* already stopped */ }
    src.disconnect();
  }, []);

  const handlePlay = useCallback(async () => {
    if (!buffer) return;
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext({ sampleRate });
    }
    const ctx = audioCtxRef.current;
    stopSource();
    const generation = generationRef.current;
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch {
        if (generation === generationRef.current) setIsPlaying(false);
        return;
      }
    }
    if (generation !== generationRef.current || audioCtxRef.current !== ctx) return;
    let cached = bufferCacheRef.current;
    if (!cached || cached.samples !== buffer || cached.rate !== sampleRate || cached.ctx !== ctx) {
      const audio = ctx.createBuffer(1, buffer.length, sampleRate);
      audio.getChannelData(0).set(buffer);
      cached = { samples: buffer, rate: sampleRate, ctx, audio };
      bufferCacheRef.current = cached;
    }
    const ab = cached.audio;
    const src = ctx.createBufferSource();
    src.buffer = ab;
    src.loop = loopRef.current;
    src.connect(ctx.destination);
    src.start();
    src.onended = () => {
      if (sourceRef.current !== src) return;
      sourceRef.current = null;
      src.disconnect();
      setIsPlaying(false);
    };
    sourceRef.current = src;
    setIsPlaying(true);
  }, [buffer, sampleRate, setIsPlaying, stopSource]);


  // Cleanup audio on unmount — stop playback, close context
  useEffect(() => {
    return () => {
      loopRef.current = false;
      stopSource();
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      sourceRef.current = null;
      bufferCacheRef.current = null;
      setIsPlaying(false);
    };
  }, [setIsPlaying, stopSource]);

  const handleStop = useCallback(() => {
    loopRef.current = false;
    setIsLooping(false);
    stopSource();
    setIsPlaying(false);
  }, [setIsPlaying, stopSource]);

  const toggleLoop = useCallback(() => {
    const next = !isLooping;
    setIsLooping(next);
    loopRef.current = next;
    if (sourceRef.current) sourceRef.current.loop = next;
    if (next && !isPlaying && buffer) {
      handlePlay();
    }
    if (!next && isPlaying) {
      // let current play finish naturally
    }
  }, [isLooping, isPlaying, buffer, handlePlay]);

  return { audioCtxRef, sourceRef, isLooping, handlePlay, handleStop, toggleLoop };
}
