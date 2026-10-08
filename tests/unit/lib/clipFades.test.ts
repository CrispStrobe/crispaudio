import { describe, it, expect } from 'vitest';
import { applyClipFades } from '../../../src/lib/clipFades';
import { validateVideoClips } from '../../../src/lib/videoEditing';
import { clipOpacity } from '../../../src/lib/videoPreview';
import { useProjectStore } from '../../../src/stores/projectStore';
import type { AudioSegment, VideoClip } from '../../../src/types/audio';

function fixture() {
  const p = useProjectStore.getInitialState().project;
  const audio = {id:'a', trackId:'t', sourceId:'s', startTime:3, sourceOffset:2, duration:2,
    fadeInDuration:0, fadeOutDuration:0, fadeInCurve:'linear', fadeOutCurve:'linear', effects:[], gain:1, name:'A', color:'#fff', linkGroup:'g'} as AudioSegment;
  const video = {id:'v', startTime:3, sourceOffset:1, duration:1, fadeIn:0, fadeOut:0, transition:'cut', transitionDuration:0, linkGroup:'g'} as VideoClip;
  return {...p, duration:5, tracks:[{id:'t', name:'T', muted:false, solo:false, volume:1, pan:0, segments:[audio,{...audio,id:'other'}]}],
    video:{path:'camera.mp4', duration:20, session:{} as NonNullable<typeof p.video>['session'], clips:[video]}};
}
describe('batch clip fades', () => {
  it('limits selected AV fades to each length without moving or trimming material', () => {
    const p = fixture(), next = applyClipFades(p,['a','v'],'both',1.5,'scurve');
    const a = next.tracks[0].segments[0], v = next.video!.clips![0];
    expect([a.fadeInDuration,a.fadeOutDuration,a.fadeInCurve]).toEqual([1.5,1.5,'scurve']);
    expect([v.fadeIn,v.fadeOut]).toEqual([1,1]);
    expect(validateVideoClips(next.video!.clips!,20)).toBeNull();
    expect([a.startTime,a.sourceOffset,a.duration,v.startTime,v.sourceOffset,v.duration]).toEqual([3,2,2,3,1,1]);
    expect(next.tracks[0].segments[1]).toBe(p.tracks[0].segments[1]);
    expect(p.tracks[0].segments[0].fadeInDuration).toBe(0);
  });
  it('keeps untouched legacy video eligible for its export fast path', () => {
    const p = fixture(); delete (p.video as {clips?: unknown}).clips;
    expect(applyClipFades(p,['a'],'both',.2,'linear').video).toBe(p.video);
  });
  it('clears both sides, leaves the other side unchanged and rejects invalid numbers', () => {
    const p = applyClipFades(fixture(),['a'],'both',.5,'linear');
    expect(applyClipFades(p,['a'],'in',.2,'scurve').tracks[0].segments[0].fadeOutDuration).toBe(.5);
    const a = applyClipFades(p,['a'],'both',0,'linear').tracks[0].segments[0];
    expect([a.fadeInDuration,a.fadeOutDuration]).toEqual([0,0]);
    for(const value of [-1,NaN,Infinity]) expect(()=>applyClipFades(p,['a'],'in',value,'linear')).toThrow();
  });
  it('matches sequential FFmpeg fade filters when video fades overlap', () => {
    const clip = {...fixture().video.clips[0],fadeIn:1,fadeOut:1};
    expect(clipOpacity(clip,3.5)).toBe(.25);
    expect(clipOpacity(clip,3)).toBe(0);
    expect(clipOpacity(clip,4)).toBe(0);
  });
});
