import { convertFileSrc } from '@tauri-apps/api/core';
import { mediaJob } from './mediaJob';
import { previewUrl } from './previewCache';

export interface VideoThumbnail { time: number; url: string }
export interface ThumbnailInterval extends VideoThumbnail { offset: number; duration: number }

/** Crop source intervals rather than dropping the tile preceding a trim. */
export function thumbnailIntervals(thumbs: VideoThumbnail[], offset: number, duration: number, sourceDuration: number): ThumbnailInterval[] {
  const sorted = [...thumbs].sort((a, b) => a.time - b.time);
  return sorted.flatMap((thumb, index) => {
    const start = Math.max(offset, thumb.time);
    const end = Math.min(offset + duration, sorted[index + 1]?.time ?? sourceDuration);
    return end > start ? [{ ...thumb, offset: start - offset, duration: end - start }] : [];
  });
}

const thumbnailCache = new Map<string, VideoThumbnail[]>();
function waitFor(video: HTMLVideoElement, event: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timeout); video.removeEventListener(event, ready); video.removeEventListener('error', fail); signal.removeEventListener('abort', fail); };
    const ready = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('Video thumbnail unavailable')); };
    const timeout = setTimeout(fail, 15000);
    video.addEventListener(event, ready, { once: true }); video.addEventListener('error', fail, { once: true }); signal.addEventListener('abort', fail, { once: true });
    if (signal.aborted) fail();
  });
}

async function decodedVideoFrame(video:HTMLVideoElement,signal:AbortSignal):Promise<void>{
  if(!video.requestVideoFrameCallback)return;
  await new Promise<void>(resolve=>{
    const done=()=>{clearTimeout(timer);video.cancelVideoFrameCallback(callback);signal.removeEventListener('abort',done);resolve();};
    const timer=setTimeout(done,120);signal.addEventListener('abort',done,{once:true});const callback=video.requestVideoFrameCallback(done);
    if(signal.aborted)done();
  });
}


/** Caller serializes sources: never open one background decoder per camera. */
export async function captureVideoThumbnails(path: string, duration: number, signal: AbortSignal, publish: (thumbs: VideoThumbnail[]) => void): Promise<void> {
  signal.throwIfAborted();
  const key = `decoded-v3:${path}:${duration}`;
  const cached = thumbnailCache.get(key);
  if (cached) { publish(cached); return; }
  const element = document.createElement('video');
  element.muted = true; element.playsInline = true; element.preload = 'auto'; element.crossOrigin = 'anonymous';
  try {
    let firstTile: string | undefined;
    try {
      const first = await mediaJob<string>('prepare_media_asset', { path, proxy: false, thumbnail: true }, signal);
      if (first) firstTile = convertFileSrc(first);
    } catch { signal.throwIfAborted(); }
    if (firstTile) publish([{ time: 0, url: firstTile }]);
    const url = await previewUrl(path);
    signal.throwIfAborted();
    const loaded = waitFor(element, 'loadeddata', signal);
    element.src = url; element.load(); await loaded;
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Video thumbnail canvas unavailable');
    const result: VideoThumbnail[] = [];
    for (let i = 0; i < 8; i++) {
      const time = Math.min(duration * i / 8, Math.max(0, duration - 0.05));
      // A tile starts at zero even though its decoded sample is slightly later.
      const sampleTime = i === 0 ? Math.min(.12, duration / 2) : time;
      if (Math.abs(element.currentTime - sampleTime) > .001) {
        const seeked = waitFor(element, 'seeked', signal); element.currentTime = sampleTime; await seeked;
      }
      await decodedVideoFrame(element, signal);
      signal.throwIfAborted();
      context.drawImage(element, 0, 0, 160, 90);
      result.push({ time, url: i === 0 && firstTile ? firstTile : canvas.toDataURL('image/jpeg', .65) });
      publish([...result]);
    }
    thumbnailCache.set(key, result);
    if (thumbnailCache.size > 24) thumbnailCache.delete(thumbnailCache.keys().next().value!);
  } finally { element.removeAttribute('src'); element.load(); }
}
