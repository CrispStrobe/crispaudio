import { describe,it,expect } from 'vitest';
import { DEFAULT_VIDEO_TRANSFORM,validVideoTransform,fittedVideoSize,videoTransformStyle } from '../../../src/lib/videoTransform';
import { applyVideoTransform } from '../../../src/lib/videoTransformEdit';
import { serializeProject,deserializeProject } from '../../../src/lib/projectFile';
import { useProjectStore } from '../../../src/stores/projectStore';
import type { VideoClip,VideoTransform } from '../../../src/types/audio';
describe('picture orientation',()=>{
 it('fits a quarter-turned landscape source in a fixed frame without stretching',()=>{
  const t={...DEFAULT_VIDEO_TRANSFORM,rotation:90 as const,flipHorizontal:true};
  expect(fittedVideoSize(t,1920,1080,320,180)).toEqual({width:180,height:101.25});
  expect(videoTransformStyle(t,1920,1080,320,180)).toBe('scale(0.5625) scale(-1, 1) rotate(90deg)');
  expect(fittedVideoSize({...t,rotation:180},1920,1080,320,180)).toEqual({width:320,height:180});
 });
 it('preserves audio, links, trims and canvas and round trips independent settings',async()=>{
  const initial=useProjectStore.getInitialState().project;
  const clip:VideoClip={id:'a',startTime:0,sourceOffset:1,duration:2,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0,linkGroup:'g'};
  const p={...initial,duration:12,video:{path:'camera.mp4',duration:10,session:{} as never,clips:[clip,{...clip,id:'b',startTime:2}]}};
  const next=applyVideoTransform(p,['a','b'],{...DEFAULT_VIDEO_TRANSFORM,rotation:270});
  expect(next.tracks).toBe(p.tracks);expect(next.duration).toBe(12);
  expect(next.video!.clips![0].transform).not.toBe(next.video!.clips![1].transform);
  expect(next.video!.clips![0]).toMatchObject(clip);
  const restored=await deserializeProject(serializeProject(next,new Map()),{} as BaseAudioContext);
  expect(restored.project.video!.clips![0].transform!.rotation).toBe(270);
  expect(applyVideoTransform(next,['a'],undefined).video!.clips![0].transform).toBeUndefined();
  expect(p.video.clips[0].transform).toBeUndefined();
 });
 it('rejects malformed orientations even when reading saved projects',async()=>{
  for(const t of [{...DEFAULT_VIDEO_TRANSFORM,rotation:45},{rotation:90},null])expect(validVideoTransform(t as VideoTransform)).toBe(false);
  const initial=useProjectStore.getInitialState().project;
  const invalid={...initial,video:{path:'camera.mp4',duration:2,clips:[{transform:{rotation:45}}]}};
  await expect(deserializeProject(JSON.stringify({format:'crispaudio-project',version:3,project:invalid,sources:[]}),{} as BaseAudioContext)).rejects.toThrow('orientation');
 });
});
