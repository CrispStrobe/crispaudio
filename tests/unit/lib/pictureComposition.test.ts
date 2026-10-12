import {describe,it,expect} from 'vitest';
import {DEFAULT_PICTURE,pictureAt,pictureTracks,validPicture,retainedPictureAnimation,hasPictureComposition} from '../../../src/lib/pictureComposition';
import {validateVideoClips} from '../../../src/lib/videoEditing';
import type {VideoClip} from '../../../src/types/audio';
const clip=(id:string,lane?:string):VideoClip=>({id,videoTrackId:lane,startTime:0,sourceOffset:0,duration:4,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0});
describe('ordered picture composition',()=>{
 it('keeps old projects implicit and allows overlapping separate lanes',()=>{
  const video={path:'v.mp4',duration:4};expect(pictureTracks(video)[0].id).toBe('picture');expect(hasPictureComposition(video)).toBe(false);
  expect(validateVideoClips([clip('a'),clip('b','upper')],4)).toBeNull();expect(validateVideoClips([clip('a'),clip('b')],4)).toMatch(/Overlapping/);
 });
 it('does not mutate saved order when traversing layers bottom to top',()=>{const tracks=['upper','picture'].map(id=>({id,name:id,visible:true,locked:false,rippleEnabled:true}));pictureTracks({path:'v',duration:4,tracks}).reverse();expect(tracks.map(t=>t.id)).toEqual(['upper','picture']);});
 it('interpolates animation and preserves the local clock through left trims',()=>{
  const original={...clip('a'),composition:{...DEFAULT_PICTURE,keyframes:[{time:0,x:0,y:0,scale:1,rotation:0,opacity:0},{time:4,x:1,y:0,scale:2,rotation:90,opacity:1}]}};
  expect(pictureAt(original,2).x).toBe(.5);expect(pictureAt(original,2).opacity).toBe(.5);
  const trimmed=retainedPictureAnimation(original,{...original,startTime:1,sourceOffset:1,duration:3});for(const key of ['x','y','scale','rotation','opacity'] as const)expect(pictureAt(trimmed,2)[key]).toBe(pictureAt(original,2)[key]);
  expect(retainedPictureAnimation(original,{...original,sourceOffset:1})).toEqual({...original,sourceOffset:1});
 });
 it('rejects empty crops and recognizes composition without explicit tracks',()=>{
  expect(validPicture({...DEFAULT_PICTURE,crop:{left:.5,right:.5,top:0,bottom:0}})).toBe(false);
  expect(hasPictureComposition({path:'v',duration:4,clips:[{...clip('a'),composition:DEFAULT_PICTURE}]})).toBe(true);
 });
});
