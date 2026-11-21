import {describe,expect,it} from 'vitest';
import {LOUDNESS_PRESETS,planLoudness} from '../../../src/lib/loudnessTarget';
import type {LoudnessReading} from '../../../src/audio/dsp/loudness';
import type {TimelineProject} from '../../../src/types/audio';

const project={id:'p',name:'mix',sampleRate:48000,duration:10,tracks:[],masterEffects:[]} as unknown as TimelineProject;

/** Model mix: -24 LUFS with a -4 dBTP peak (crest 20 dB) at unity. The sample-peak
 * limiter leaves 0.4 dB of intersample overshoot and costs loudness when it works. */
function model(project:TimelineProject):LoudnessReading{
  const gain=20*Math.log10(project.masterVolume??1),rawPeak=-4+gain;
  const limiter=project.outputLimiter?.enabled?project.outputLimiter.ceiling!:Infinity;
  const reduction=Math.max(0,rawPeak-limiter);
  return {integrated:-24+gain-reduction*.35,truePeak:Math.min(rawPeak,limiter+.4),momentary:null,shortTerm:null};
}
const measure=async(p:TimelineProject)=>model(p);

describe('planLoudness',()=>{
  it('gain-only mode stops at the peak ceiling and leaves the limiter untouched',async()=>{
    const plan=await planLoudness(project,measure,{...LOUDNESS_PRESETS.podcast,useLimiter:false});
    expect(plan.after.truePeak!).toBeLessThanOrEqual(-1+.01);
    expect(plan.after.integrated!).toBeLessThan(-16-.2);
    expect(plan.candidate.outputLimiter).toBeUndefined();
    expect(plan.limiterCeiling).toBeUndefined();
    expect(model(plan.candidate)).toEqual(plan.after);
  });

  it('limiter mode reaches the loudness target while meeting the true-peak ceiling',async()=>{
    const plan=await planLoudness(project,measure,{...LOUDNESS_PRESETS.podcast,useLimiter:true});
    expect(plan.after.truePeak!).toBeLessThanOrEqual(-1+.01);
    expect(Math.abs(plan.after.integrated!+16)).toBeLessThanOrEqual(.2);
    expect(plan.candidate.outputLimiter).toEqual({enabled:true,ceiling:plan.limiterCeiling,release:.1});
    // The reported numbers describe the candidate that was actually measured.
    expect(model(plan.candidate)).toEqual(plan.after);
    expect(plan.candidate.masterVolume).toBeCloseTo(10**(plan.gain/20),12);
  });

  it('keeps an existing limiter release and does not mutate the snapshot',async()=>{
    const withLimiter={...project,masterVolume:.5,outputLimiter:{enabled:false,ceiling:-3,release:.4}};
    const plan=await planLoudness(withLimiter,measure,{target:-14,ceiling:-1,useLimiter:true});
    expect(plan.candidate.outputLimiter?.release).toBe(.4);
    expect(withLimiter.outputLimiter).toEqual({enabled:false,ceiling:-3,release:.4});
    expect(plan.candidate.masterVolume).toBeCloseTo(.5*10**(plan.gain/20),12);
  });

  it('quiet targets need no limiting and match gain-only results',async()=>{
    const plan=await planLoudness(project,measure,{...LOUDNESS_PRESETS.broadcast,useLimiter:true});
    expect(Math.abs(plan.after.integrated!+23)).toBeLessThanOrEqual(.2);
    expect(plan.after.truePeak!).toBeLessThan(-1);
  });

  it('rejects silence and unverifiable peaks',async()=>{
    const silent=async():Promise<LoudnessReading>=>({integrated:null,truePeak:null,momentary:null,shortTerm:null});
    await expect(planLoudness(project,silent,{target:-16,ceiling:-1,useLimiter:true})).rejects.toThrow('loudness.silence');
    const stubborn=async(p:TimelineProject)=>({...model(p),truePeak:0});
    await expect(planLoudness(project,stubborn,{target:-16,ceiling:-1,useLimiter:true})).rejects.toThrow('loudness.peakFailed');
  });

  it('stops promptly when cancelled',async()=>{
    const controller=new AbortController();
    const slow=async(p:TimelineProject)=>{controller.abort();return model(p);};
    await expect(planLoudness(project,slow,{target:-16,ceiling:-1,useLimiter:true},controller.signal)).rejects.toThrow();
  });
});
