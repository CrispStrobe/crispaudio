import {it,expect} from 'vitest';
import {placePictureSource} from '../../../src/lib/sourcePlacement';
import type {TimelineProject} from '../../../src/types/audio';
const project=():TimelineProject=>({id:'p',name:'p',duration:4,sampleRate:48000,frameRate:25,tracks:[],masterEffects:[],video:{path:'v',duration:10,clips:[{id:'v',startTime:0,duration:4,sourceOffset:0,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0}]}});
const source={id:'legacy-video',path:'v',name:'source',duration:10};
it('places only the selected source window and splits overwritten picture',()=>{
 const before=project(),next=placePictureSource(before,source,2,3,1,'picture','overwrite');
 expect(next.video?.clips?.map(c=>[c.startTime,c.sourceOffset,c.duration])).toEqual([[0,0,1],[2,2,2],[1,2,1]]);
 expect(before.video?.clips).toHaveLength(1);expect(next.duration).toBe(4);
});
it('inserts a source interval and preserves the retained right-side source',()=>{
 const next=placePictureSource(project(),source,2,3,1,'picture','insert');
 expect(next.video?.clips?.map(c=>[c.startTime,c.sourceOffset,c.duration])).toEqual([[0,0,1],[2,1,3],[1,2,1]]);expect(next.duration).toBe(5);
});
it('appends and rejects locked destinations and invalid ranges',()=>{
 expect(placePictureSource(project(),source,2,3,0,'picture','append').video?.clips?.at(-1)?.startTime).toBe(4);
 const locked=project();locked.video!.locked=true;expect(()=>placePictureSource(locked,source,0,1,0,'picture','overwrite')).toThrow(/locked/);
 expect(()=>placePictureSource(project(),source,4,3,0,'picture','append')).toThrow(/range/);
});
