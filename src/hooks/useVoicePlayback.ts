import { useCallback, useEffect, useRef, useState } from 'react';

type PlayingBuffer = 'source' | 'processed';

export function useVoicePlayback() {
  const [playingBuffer, setPlayingBuffer] = useState<PlayingBuffer | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const generationRef = useRef(0);

  const stopSource = useCallback(() => {
    generationRef.current++;
    const source = sourceRef.current;
    sourceRef.current = null;
    if (!source) return;
    source.onended = null;
    try { source.stop(); } catch { /* already stopped */ }
    source.disconnect();
  }, []);

  const handleStop = useCallback(() => {
    stopSource();
    setPlayingBuffer(null);
  }, [stopSource]);

  const handlePlay = useCallback(async (buffer: AudioBuffer | null, which: PlayingBuffer) => {
    if (!buffer) return;
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext({ sampleRate: buffer.sampleRate });
    }
    const ctx = audioCtxRef.current;
    stopSource();
    const generation = generationRef.current;
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch {
        if (generation === generationRef.current) setPlayingBuffer(null);
        return;
      }
    }
    if (generation !== generationRef.current || audioCtxRef.current !== ctx) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    sourceRef.current = source;
    source.onended = () => {
      if (sourceRef.current !== source) return;
      sourceRef.current = null;
      source.onended = null;
      source.disconnect();
      setPlayingBuffer(null);
    };
    source.start();
    setPlayingBuffer(which);
  }, [stopSource]);

  useEffect(() => () => {
    stopSource();
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
  }, [stopSource]);

  return { isPlaying: playingBuffer !== null, playingBuffer, handlePlay, handleStop };
}
