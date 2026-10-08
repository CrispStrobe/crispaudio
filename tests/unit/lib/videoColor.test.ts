import { describe,it,expect } from 'vitest';
import { DEFAULT_VIDEO_COLOR,validVideoColor,videoColorFilter,applyVideoColorPixels } from '../../../src/lib/videoColor';
import { applyVideoColor } from '../../../src/lib/videoColorEdit';
import { validateVideoClips } from '../../../src/lib/videoEditing';
import { serializeProject,deserializeProject } from '../../../src/lib/projectFile';
import { useProjectStore } from '../../../src/stores/projectStore';
import type { VideoClip, VideoColor } from '../../../src/types/audio';

export function colorProject() {
 const p=useProjectStore.getInitialState().project;
 const clip: VideoClip={id:'a',startTime:1,sourceOffset:2,duration:3,fadeIn:.25,fadeOut:.25,transition:'cut',transitionDuration:0,linkGroup:'g'};
 return {...p,duration:7,video:{path:'camera.mp4',duration:12,session:{} as NonNullable<typeof p.video>['session'],clips:[clip,{...clip,id:'b',startTime:4}]}};
}
describe('video colour correction',()=>{
 it('applies exposure then contrast then saturation before fade, preserving alpha',()=>{
  const pixels=new Uint8ClampedArray([128,64,32,255]);
  applyVideoColorPixels(pixels,{enabled:true,exposure:1,contrast:.75,saturation:0},.5);
  expect([...pixels]).toEqual([72,72,72,255]);
  const bypass=new Uint8ClampedArray([128,64,32,255]);
  applyVideoColorPixels(bypass,{enabled:false,exposure:2,contrast:0,saturation:0});
  expect([...bypass]).toEqual([128,64,32,255]);
 });
 it('rejects malformed and out-of-range settings, even when bypassed',()=>{
  expect(validVideoColor(undefined)).toBe(true);
  for(const color of [{...DEFAULT_VIDEO_COLOR,exposure:NaN},{...DEFAULT_VIDEO_COLOR,saturation:3},{...DEFAULT_VIDEO_COLOR,enabled:false,contrast:-1},{} as VideoColor]) {
   expect(validVideoColor(color)).toBe(false);
   expect(()=>applyVideoColor(colorProject(),['a'],color)).toThrow();
  }
  expect(videoColorFilter({...DEFAULT_VIDEO_COLOR,exposure:1})).toBe('brightness(2) contrast(1) saturate(1)');
 });
 it('copies independent corrections without changing timing, audio or links',()=>{
  const p=colorProject(), color={...DEFAULT_VIDEO_COLOR,exposure:.5};
  const next=applyVideoColor(p,['a','b'],color);
  expect(next.tracks).toBe(p.tracks);
  expect(next.video!.clips![0].colorCorrection).not.toBe(next.video!.clips![1].colorCorrection);
  expect(next.video!.clips!.map(c=>[c.startTime,c.sourceOffset,c.duration,c.linkGroup])).toEqual([[1,2,3,'g'],[4,2,3,'g']]);
  expect(p.video.clips[0].colorCorrection).toBeUndefined();
  expect(validateVideoClips(next.video!.clips!,12)).toBeNull();
 });
 it('round trips correction and bypass in saved projects and keeps older projects valid',async()=>{
  const p=applyVideoColor(colorProject(),['a'],{...DEFAULT_VIDEO_COLOR,enabled:false,exposure:1});
  const restored=await deserializeProject(serializeProject(p,new Map()),{} as BaseAudioContext);
  expect(restored.project.video!.clips![0].colorCorrection).toEqual(p.video!.clips![0].colorCorrection);
  expect(restored.project.video!.clips![1].colorCorrection).toBeUndefined();
 });
});
