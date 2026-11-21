import {finishingGain,type LoudnessReading} from '../audio/dsp/loudness';
import type {TimelineProject} from '../types/audio';

/** Common delivery targets; all verified against the rendered 4x-oversampled peak. */
export const LOUDNESS_PRESETS={
  podcast:{target:-16,ceiling:-1},
  streaming:{target:-14,ceiling:-1},
  broadcast:{target:-23,ceiling:-1},
} as const;
export type LoudnessPreset=keyof typeof LOUDNESS_PRESETS;

export interface LoudnessPlan {
  candidate:TimelineProject;before:LoudnessReading;after:LoudnessReading;gain:number;target:number;
  /** Output limiter ceiling (dBFS sample peak) when the limiter was used to reach the target. */
  limiterCeiling?:number;
}

const ATTEMPTS=8,TP_TOLERANCE=.005,LUFS_TOLERANCE=.2,LIMITER_MARGIN=.3,MAX_LIMITER_DEPTH=6;

/**
 * Finds a master gain (and optionally an output-limiter ceiling) whose actual
 * rendered result meets the true-peak ceiling. Without the limiter, gain alone
 * is reduced, so a loud target can end below the requested loudness. With the
 * limiter, gain aims at the target and the sample-peak limiter ceiling is
 * lowered until the oversampled true peak also complies. Every step re-renders
 * the real mix; nothing is predicted.
 */
export async function planLoudness(snapshot:TimelineProject,measure:(project:TimelineProject)=>Promise<LoudnessReading>,
  {target,ceiling,useLimiter}:{target:number;ceiling:number;useLimiter:boolean},signal?:AbortSignal):Promise<LoudnessPlan>{
  const before=await measure(snapshot);signal?.throwIfAborted();
  const base=snapshot.masterVolume??1,release=snapshot.outputLimiter?.release??.1;
  const build=(gain:number,limiter?:number):TimelineProject=>({...snapshot,masterVolume:base*10**(gain/20),
    ...(limiter===undefined?{}:{outputLimiter:{enabled:true,ceiling:limiter,release}})});
  if(!useLimiter){
    let gain=finishingGain(before,target,ceiling),candidate=snapshot,after=before,measured=gain;
    for(let attempt=0;attempt<4;attempt++){
      candidate=build(gain);measured=gain;after=await measure(candidate);signal?.throwIfAborted();
      // Verify the real post-limiter mix, then attenuate any intersample overshoot.
      if(after.truePeak!==null&&after.truePeak>ceiling+TP_TOLERANCE){gain-=after.truePeak-ceiling+.02;continue;}
      break;
    }
    if(after.truePeak===null||after.truePeak>ceiling+.01)throw new Error('loudness.peakFailed');
    return {candidate,before,after,gain:measured,target};
  }
  // Validate inputs and silence exactly like the gain-only path.
  finishingGain(before,target,ceiling);
  let gain=Math.max(-60,Math.min(20,target-before.integrated!)),limiter=ceiling-LIMITER_MARGIN,candidate=snapshot,after=before,measured={gain,limiter};
  for(let attempt=0;attempt<ATTEMPTS;attempt++){
    candidate=build(gain,limiter);measured={gain,limiter};after=await measure(candidate);signal?.throwIfAborted();
    if(after.integrated===null||after.truePeak===null)throw new Error('loudness.silence');
    if(after.truePeak>ceiling+TP_TOLERANCE){
      limiter-=after.truePeak-ceiling+.05;
      if(limiter<ceiling-MAX_LIMITER_DEPTH)throw new Error('loudness.peakFailed');
      continue;
    }
    // Limiting removes energy; push gain until the measured loudness lands.
    const miss=target-after.integrated;
    if(Math.abs(miss)>LUFS_TOLERANCE&&gain+miss<=20){gain+=miss;continue;}
    break;
  }
  if(after.truePeak===null||after.truePeak>ceiling+.01)throw new Error('loudness.peakFailed');
  return {candidate,before,after,gain:measured.gain,target,limiterCeiling:measured.limiter};
}
