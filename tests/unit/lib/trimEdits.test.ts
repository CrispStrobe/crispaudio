import {expect,it} from 'vitest';
import {VIDEO_TRANSITIONS} from '../../../src/lib/videoEditing';
import {rollCut,rippleTrim,trimToPlayhead,adjacentEdit,slideClips,slideLimits} from '../../../src/lib/trimEdits';
import {speechLayout,deleteSpokenWord} from '../../../src/lib/spokenEdits';
import type {TimelineProject} from '../../../src/types/audio';
const sources=new Map([['s',{duration:20}]]);
function fixture():TimelineProject{
 const clip={id:'a',trackId:'mic',sourceId:'s',linkGroup:'left',startTime:0,sourceOffset:2,duration:5,gain:1,name:'a',color:'#fff',effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear' as const,fadeOutCurve:'linear' as const};
 const video={id:'v',linkGroup:'left',startTime:0,sourceOffset:2,duration:5,fadeIn:0,fadeOut:0,transition:'cut' as const,transitionDuration:0};
 return {id:'p',name:'p',sampleRate:48000,duration:10,masterEffects:[],tracks:[{id:'mic',name:'Mic',muted:false,solo:false,pan:0,volume:1,segments:[clip,{...clip,id:'b',linkGroup:'right',startTime:5,sourceOffset:7}]}],video:{path:'v.mp4',duration:20,session:{} as never,clips:[video,{...video,id:'w',linkGroup:'right',startTime:5,sourceOffset:7}]}};
}
it('rolls linked cuts while preserving total length and outer endpoints',()=>{
 const p=fixture(),out=rollCut(p,['a'],.2,sources);
 expect(out.duration).toBe(10);expect(out.tracks[0].segments.map(c=>[c.startTime,c.duration,c.sourceOffset])).toEqual([[0,5.2,2],[5.2,4.8,7.2]]);
 expect(out.video?.clips?.map(c=>[c.startTime,c.duration,c.sourceOffset])).toEqual([[0,5.2,2],[5.2,4.8,7.2]]);expect(p.tracks[0].segments[0].duration).toBe(5);
});
it('rejects source limits, ambiguous neighbours and locked linked lanes',()=>{
 const p=fixture();expect(()=>rollCut(p,['a'],-8,sources)).toThrow('handles');
 p.tracks[0].locked=true;expect(()=>rollCut(p,['v'],.2,sources)).toThrow('locked');p.tracks[0].locked=false;
 p.tracks[0].segments.push({...p.tracks[0].segments[1],id:'duplicate',linkGroup:undefined});expect(()=>rollCut(p,['a'],.2,sources)).toThrow('adjacent');
});
it('requires the complete right link group',()=>{
 const p=fixture();p.tracks.push({...p.tracks[0],id:'other',segments:[{...p.tracks[0].segments[1],id:'other-b',trackId:'other'}]});expect(()=>rollCut(p,['a'],.2,sources)).toThrow('linkedCut');
});
it('trims to playhead without moving later clips; ripple trims retime later lanes',()=>{
 const p=fixture();expect(trimToPlayhead(p,['a'],'right',4,sources).tracks[0].segments[1].startTime).toBe(5);
 const shorter=rippleTrim(p,['a'],'right',-1,sources);expect(shorter.duration).toBe(9);expect(shorter.tracks[0].segments.map(c=>[c.startTime,c.duration,c.sourceOffset])).toEqual([[0,4,2],[4,5,7]]);
 const longer=rippleTrim(p,['a'],'right',1,sources);expect(longer.duration).toBe(11);expect(longer.video?.clips?.map(c=>[c.startTime,c.duration,c.sourceOffset])).toEqual([[0,6,2],[6,5,7]]);
});
it('ripple left trim moves the remaining source to the original start',()=>{
 const out=rippleTrim(fixture(),['a'],'left',1,sources);expect(out.duration).toBe(9);expect(out.tracks[0].segments[0]).toMatchObject({startTime:0,sourceOffset:3,duration:4});
 const extended=rippleTrim(fixture(),['a'],'left',-1,sources);expect(extended.tracks[0].segments[0]).toMatchObject({startTime:0,sourceOffset:1,duration:6});expect(extended.tracks[0].segments[1].startTime).toBe(6);
});
it('navigates distinct edit boundaries, including gaps and outer canvas',()=>{
 const p=fixture();expect(adjacentEdit(p,4,1)).toBe(5);expect(adjacentEdit(p,5,1)).toBe(10);expect(adjacentEdit(p,5,-1)).toBe(0);expect(adjacentEdit(p,0,-1)).toBe(0);
});
it('keeps a long right clip endpoint stable under rolling frame nudges',()=>{
 const p=fixture();p.video=undefined;p.tracks[0].segments[0].linkGroup=undefined;p.tracks[0].segments[1].linkGroup=undefined;
 p.tracks[0].segments[0].duration=45;p.tracks[0].segments[1].startTime=45;p.tracks[0].segments[1].duration=208.72;p.duration=253.72;
 const before=p.tracks[0].segments[1].startTime+p.tracks[0].segments[1].duration;
 const out=rollCut(p,['a'],.08,new Map([['s',{duration:400}]]));expect(out.duration).toBeCloseTo(before,12);expect(Math.round(out.duration*48000)).toBe(Math.round(p.duration*48000));
});
function slideFixture(){
 const p=fixture();p.duration=15;p.frameRate=25;
 p.tracks[0].segments.push({...p.tracks[0].segments[1],id:'c',linkGroup:'last',startTime:10,sourceOffset:12});
 p.video!.clips!.push({...p.video!.clips![1],id:'x',linkGroup:'last',startTime:10,sourceOffset:12});return p;
}
it('slides fixed linked content both directions and preserves outer endpoints',()=>{
 for(const delta of [.2,-.2]){const p=slideFixture(),out=slideClips(p,['b'],delta,sources);
 expect(out.duration).toBe(15);expect(out.tracks[0].segments.map(c=>[c.startTime,c.duration,c.sourceOffset])).toEqual([[0,5+delta,2],[5+delta,5,7],[10+delta,15-(10+delta),12+delta]]);
 expect(out.video!.clips!.map(c=>[c.startTime,c.duration,c.sourceOffset])).toEqual(out.tracks[0].segments.map(c=>[c.startTime,c.duration,c.sourceOffset]));expect(p.tracks[0].segments[1].startTime).toBe(5);}
});
it('reviews slide source handles and snaps linked picture motion to frames',()=>{
 const p=slideFixture();expect(slideLimits(p,['b'],sources)).toEqual({start:5,end:10,min:-4.96,max:4.96});
 expect(slideClips(p,['b'],.07,sources).tracks[0].segments[1].startTime).toBe(5.08);
 for(const amount of [5,-5,NaN,0])expect(()=>slideClips(p,['b'],amount,sources)).toThrow();
 p.video!.clips![1].startTime=5.001;p.video!.clips![1].duration=4.999;expect(()=>slideClips(p,['b'],.2,sources)).toThrow('slideSpan');
});
it('rejects locked neighbours, overlapping lanes, external links and incoming blends',()=>{
 const p=slideFixture();p.tracks[0].locked=true;expect(()=>slideClips(p,['w'],.2,sources)).toThrow('locked');p.tracks[0].locked=false;
 p.video!.clips![1].transition='fade';p.video!.clips![1].transitionDuration=.4;expect(()=>slideClips(p,['b'],.2,sources)).toThrow();p.video!.clips![1].transition='cut';p.video!.clips![1].transitionDuration=0;
 p.tracks[0].segments.push({...p.tracks[0].segments[0],id:'overlap',linkGroup:undefined,startTime:1,duration:1});expect(()=>slideClips(p,['b'],.2,sources)).toThrow('slideAdjacent');p.tracks[0].segments.pop();
 p.tracks.push({...p.tracks[0],id:'other',segments:[{...p.tracks[0].segments[0],id:'external',trackId:'other'}]});expect(()=>slideClips(p,['b'],.2,sources)).toThrow('linkedCut');
});
it('keeps markers and automation at timeline positions and clamps only neighbour fades',()=>{
 const p=slideFixture();p.markers=[{id:'m',time:8,name:'m'}];p.tracks[0].segments[0].fadeOutDuration=5;p.tracks[0].segments[1].fadeInDuration=2;
 const out=slideClips(p,['b'],-.2,sources);expect(out.markers).toBe(p.markers);expect(out.tracks[0].segments[0].fadeOutDuration).toBe(4.8);expect(out.tracks[0].segments[1].fadeInDuration).toBe(2);
});
it('invalidates old acoustic timestamps after sliding audio',()=>{
 const p=slideFixture();p.transcript=[{id:'cue',start:6,end:7,text:'Hallo',words:[{id:'word',start:6,end:7,text:'Hallo'}]}];p.transcriptLayout=speechLayout(p);
 const out=slideClips(p,['b'],.2,sources);expect(()=>deleteSpokenWord(out,'word')).toThrow('spoken.stale');
});
function blendFixture(transition:typeof VIDEO_TRANSITIONS[number]='fade'){
 const p=fixture();p.frameRate=25;Object.assign(p.video!.clips![1],{startTime:4.6,sourceOffset:6.6,duration:5.4,transition,transitionDuration:.4});return p;
}
it('rolls every supported picture overlap both ways while preserving transition and AV offsets',()=>{
 for(const transition of VIDEO_TRANSITIONS.filter(t=>t!=='cut'))for(const delta of [.2,-.2]){
  const p=blendFixture(transition),out=rollCut(p,['a'],delta,sources),[l,r]=out.video!.clips!;
  expect(l.duration).toBe(5+delta);expect(r.startTime).toBe(4.6+delta);expect(r.sourceOffset).toBe(6.6+delta);expect(r.startTime+r.duration).toBe(10);
  expect(l.startTime+l.duration-r.startTime).toBeCloseTo(.4,12);expect(r.transition).toBe(transition);expect(r.transitionDuration).toBe(.4);expect(out.duration).toBe(10);
  expect(out.tracks[0].segments[1].startTime-r.startTime).toBeCloseTo(.4,12);expect(out.tracks[0].segments[1].sourceOffset-r.sourceOffset).toBeCloseTo(.4,12);
 }
});
it('blocks consumed transition handles, off-frame overlaps and invalid or triple overlap topology',()=>{
 const p=blendFixture();for(const delta of [-4.6,5])expect(()=>rollCut(p,['a'],delta,sources)).toThrow('handles');
 p.video!.clips![1].transitionDuration=.3;expect(()=>rollCut(p,['a'],.2,sources)).toThrow();p.video!.clips![1].transitionDuration=.4;
 p.video!.clips![1].startTime=4.61;p.video!.clips![1].transitionDuration=.39;p.video!.clips![1].duration=5.39;expect(()=>rollCut(p,['a'],.2,sources)).toThrow('blendTopology');
 const triple=blendFixture();triple.video!.clips!.push({...triple.video!.clips![1],id:'third',startTime:4.7,duration:1});expect(()=>rollCut(triple,['a'],.2,sources)).toThrow();
});
it('blocks moving a valid transition into its next transition and preserves the original',()=>{
 const p=blendFixture();p.duration=12;p.video!.clips!.push({...p.video!.clips![1],id:'third',linkGroup:undefined,startTime:9.6,sourceOffset:0,duration:2.4});
 const before=JSON.stringify(p);expect(()=>rollCut(p,['a'],4.68,sources)).toThrow();expect(JSON.stringify(p)).toBe(before);
});

function slideBlendFixture(head=.4,tail=.4){
 const p=slideFixture();Object.assign(p.video!.clips![1],{startTime:5-head,sourceOffset:7-head,duration:5+head,transition:head?'fade':'cut',transitionDuration:head});
 Object.assign(p.video!.clips![2],{startTime:10-tail,sourceOffset:12-tail,duration:5+tail,transition:tail?'wipeleft':'cut',transitionDuration:tail});return p;
}
it('slides linked clips through incoming, outgoing or both transitions with fixed content',()=>{
 for(const [head,tail] of [[.4,0],[0,.4],[.4,.4]])for(const delta of [.2,-.2]){
  const p=slideBlendFixture(head,tail),out=slideClips(p,['b'],delta,sources),[l,m,r]=out.video!.clips!;
  expect(out.duration).toBe(15);expect(m.sourceOffset).toBe(7-head);expect(m.duration).toBe(5+head);expect(m.startTime).toBe(5-head+delta);
  expect(l.startTime+l.duration-m.startTime).toBeCloseTo(head,12);expect(m.startTime+m.duration-r.startTime).toBeCloseTo(tail,12);
  expect(m.transitionDuration).toBe(head);expect(r.transitionDuration).toBe(tail);expect(r.startTime+r.duration).toBe(15);
  expect(out.tracks[0].segments[1].startTime-m.startTime).toBeCloseTo(head,12);expect(p.tracks[0].segments[1].startTime).toBe(5);
 }
});
it('reviews transition slide limits and rejects consumed handles, locks and stale words',()=>{
 const p=slideBlendFixture();expect(slideLimits(p,['b'],sources)).toEqual({start:5,end:10,min:-4.56,max:4.96});
 expect(()=>slideClips(p,['b'],-4.6,sources)).toThrow('handles');p.video!.locked=true;expect(()=>slideClips(p,['b'],.2,sources)).toThrow('locked');p.video!.locked=false;
 p.transcriptLayout=speechLayout(p);expect(()=>deleteSpokenWord(slideClips(p,['b'],.2,sources),'word')).toThrow('spoken.stale');
 const bad=slideBlendFixture();bad.video!.clips![2].transitionDuration=.3;expect(()=>slideClips(bad,['b'],.2,sources)).toThrow('blendTopology');
});
