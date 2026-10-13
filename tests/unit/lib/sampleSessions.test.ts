import {expect,it} from 'vitest';
import {sampleAudio,buildSampleSession} from '../../../src/lib/sampleSessions';
import {validGraphics} from '../../../src/lib/graphics';
import {validRecording} from '../../../src/lib/recordingTakes';
import {validEffectAutomation} from '../../../src/lib/effectAutomation';
const ctx={createBuffer:(channels:number,length:number,sampleRate:number)=>{const data=Array.from({length:channels},()=>new Float32Array(length));return {length,numberOfChannels:channels,sampleRate,duration:length/sampleRate,getChannelData:(ch:number)=>data[ch]} as AudioBuffer;}};
it('generates deterministic audible audio with headroom and distinct alternate takes',()=>{
 for(const kind of ['rhythm','keys','pad','alternate'] as const){const a=sampleAudio(ctx,kind).getChannelData(0),b=sampleAudio(ctx,kind).getChannelData(0);expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);let peak=0,sum=0;for(const value of a){peak=Math.max(peak,Math.abs(value));sum+=value*value;}expect(peak).toBeLessThan(.25);expect(Math.sqrt(sum/a.length)).toBeGreaterThan(.01);}
 expect(sampleAudio(ctx,'keys').getChannelData(0)[1000]).not.toBe(sampleAudio(ctx,'alternate').getChannelData(0)[1000]);
});
for(const kind of ['mix','picture','takes'] as const)it(`builds a valid independent ${kind} session with actual sources and FX`,()=>{
 const {project:p,sources}=buildSampleSession(kind,ctx,key=>key);expect(p.tracks).toHaveLength(3);expect(p.duration).toBe(14);expect(p.tracks.some(t=>t.effects?.length)).toBe(true);expect(p.masterEffects).toHaveLength(1);
 const ids=new Set<string>();for(const track of p.tracks){for(const clip of track.segments){expect(sources.has(clip.sourceId)).toBe(true);expect(ids.has(clip.id)).toBe(false);ids.add(clip.id);expect(clip.sourceOffset+clip.duration).toBeLessThanOrEqual(sources.get(clip.sourceId)!.duration+.00001);}for(const effect of track.effects??[])expect(validEffectAutomation(effect)).toBe(true);}
 expect(validRecording(p,new Set(sources.keys()))).toBe(true);expect(validGraphics(p.video)).toBe(true);
 if(kind==='picture'){expect(p.video!.clips).toHaveLength(2);expect(p.video!.graphics![0].clips[0].type).toBe('title');}
 if(kind==='takes'){expect(p.tracks[0].takes).toHaveLength(2);expect(p.tracks[0].compRegions).toHaveLength(1);expect(p.tracks[0].compBaseSegments).toHaveLength(1);}
});
