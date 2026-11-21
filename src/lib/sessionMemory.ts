import type {AudioSource} from '../types/audio';

const GiB=1024**3;
/**
 * Decoded GUI audio is memory-resident Float32 PCM (see DAW_GAP_ANALYSIS
 * "Large sessions"). These advisory budgets are provisional until measured on
 * devices: iOS/iPadOS WebKit content processes are terminated well below the
 * device's RAM, desktop WebViews tolerate more. They only drive a warning.
 */
export function sessionMemoryBudget(userAgent=typeof navigator==='undefined'?'':navigator.userAgent,touchPoints=typeof navigator==='undefined'?0:navigator.maxTouchPoints):number{
  const mobile=/iPhone|iPad|iPod|Android/.test(userAgent)||(/Macintosh/.test(userAgent)&&touchPoints>1);
  return mobile?1*GiB:4*GiB;
}
/** Bytes of decoded PCM held by distinct source buffers (shared buffers count once). */
export function decodedPcmBytes(sources:Iterable<AudioSource>):number{
  const seen=new Set<AudioBuffer>();let total=0;
  for(const source of sources){const buffer=source.buffer;if(!buffer||seen.has(buffer))continue;seen.add(buffer);total+=buffer.length*buffer.numberOfChannels*4;}
  return total;
}
/** Minutes of 48 kHz stereo audio that fit in `bytes` of decoded PCM. */
export const stereoMinutes=(bytes:number)=>bytes/(48000*2*4*60);
