import {expect,it} from 'vitest';
import {pointerTrim,sourceHandles} from '../../../src/lib/trimFeedback';
import type {TimelineProject} from '../../../src/types/audio';
function fixture():TimelineProject {
 const c={id:'a',trackId:'mic',sourceId:'s',startTime:3,sourceOffset:2,duration:4,gain:1,name:'a',color:'#fff',effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear' as const,fadeOutCurve:'linear' as const};
 return {id:'p',name:'p',sampleRate:48000,duration:7,masterEffects:[],tracks:[{id:'mic',name:'Mic',volume:1,pan:0,muted:false,solo:false,segments:[c]}]};
}
const sources=new Map([['s',{duration:10}]]);
it('left dragging stops at source start while retaining the original right edge and source end',()=>{
 const p=fixture(),out=pointerTrim(p,'a','left',-100,sources);
 expect(out.project.tracks[0].segments[0]).toMatchObject({startTime:1,sourceOffset:0,duration:6});
 expect(out.feedback).toMatchObject({limited:true,applied:-2});expect(p.tracks[0].segments[0].duration).toBe(4);
});
it('left dragging respects timeline zero even when more source material exists',()=>{
 const p=fixture();p.tracks[0].segments[0].startTime=1;
 expect(pointerTrim(p,'a','left',-100,sources).project.tracks[0].segments[0]).toMatchObject({startTime:0,sourceOffset:1,duration:5});
});
it('right dragging cannot create silent nonexistent source tail and allows coming back after a limit',()=>{
 const p=fixture(),out=pointerTrim(p,'a','right',100,sources);
 expect(out.project.tracks[0].segments[0].duration).toBe(8);expect(out.feedback.limited).toBe(true);
 expect(pointerTrim(p,'a','right',.5,sources).project.tracks[0].segments[0].duration).toBe(4.5);
});
it('uses the tightest partner source handle and quantizes linked picture clamps inward to frames',()=>{
 const p=fixture();p.frameRate=25;p.tracks[0].segments[0].linkGroup='av';
 p.video={path:'camera.mp4',duration:6.015,session:{} as never,clips:[{id:'v',linkGroup:'av',startTime:3,sourceOffset:2,duration:4,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0}]};
 const out=pointerTrim(p,'a','right',1,sources);expect(out.project).toBe(p);expect(out.feedback.limited).toBe(true);
 p.video.duration=6.075;const next=pointerTrim(p,'a','right',1,sources);expect(next.feedback.applied).toBeCloseTo(.04);expect(next.project.video!.clips![0].duration).toBeCloseTo(4.04);
 const tiny=pointerTrim(p,'a','right',-100,sources);expect(tiny.project.video!.clips![0].duration).toBeCloseTo(.04);
});
it('reports source spans for all partners and prevents locked/missing/invalid source edits',()=>{
 const p=fixture();expect(sourceHandles(p,['a'],sources)[0]).toMatchObject({name:'Mic',start:2,end:6,before:2,after:4});
 p.tracks[0].locked=true;expect(()=>pointerTrim(p,'a','right',1,sources)).toThrow('locked');p.tracks[0].locked=false;
 expect(()=>pointerTrim(p,'a','right',1,new Map())).toThrow('missingSource');p.tracks[0].segments[0].sourceOffset=9;expect(()=>pointerTrim(p,'a','right',1,sources)).toThrow('invalidSource');
});
it('preserves exact project identity for zero movement, retaining existing redo history',()=>{
 const p=fixture();expect(pointerTrim(p,'a','right',0,sources).project).toBe(p);
});
