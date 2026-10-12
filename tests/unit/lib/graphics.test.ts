import {it,expect} from 'vitest';
import {DEFAULT_TITLE,validGraphics,captionVtt,wrapTitle,editGraphicsRange,titlePose} from '../../../src/lib/graphics';
import {pictureAt} from '../../../src/lib/pictureComposition';
import {graphicAsVideo} from '../../../src/lib/graphics';
import type {TimelineProject} from '../../../src/types/audio';
const video=():NonNullable<TimelineProject['video']>=>({path:'video',duration:4,session:{} as never,graphics:[{id:'titles',name:'Titles',visible:true,locked:false,rippleEnabled:true,clips:[{id:'title',type:'title',name:'Title',startTime:0,duration:4,text:'Grüße aus München',style:{...DEFAULT_TITLE},composition:{...titlePose('title'),keyframes:[{time:0,x:0,y:0,scale:1,rotation:0,opacity:0},{time:4,x:1,y:0,scale:1,rotation:0,opacity:1}]}}]}],captions:{id:'captions',name:'Captions',visible:true,locked:false,rippleEnabled:true,burnIn:false,style:{...DEFAULT_TITLE},cues:[{id:'cue',start:0,end:4,text:'Grüße'}]}});
it('validates independent saved titles/captions and rejects broken style/timing',()=>{
 const v=video();expect(validGraphics(v)).toBe(true);v.graphics![0].clips[0].style!.size=NaN;expect(validGraphics(v)).toBe(false);
 const next=video();next.captions!.cues[0].end=-1;expect(validGraphics(next)).toBe(false);
});
it('exports delivery captions to VTT and wraps German text and long words',()=>{
 expect(captionVtt([{id:'cue',start:1.234,end:2.567,text:'Grüße'}])).toContain('00:00:01.234 --> 00:00:02.567');
 expect(wrapTitle('Grüße München\nabcdef',5,s=>[...s].length)).toEqual(['Grüße','Münch','en','abcde','f']);
});
it('extracts across graphics/captions and retains original animation time',()=>{
 const original=video(),next=editGraphicsRange(original,1,2,'extract'),right=next.graphics![0].clips[1];
 expect(next.captions!.cues.map(c=>[c.start,c.end,c.text])).toEqual([[0,1,'Grüße'],[1,3,'Grüße']]);
 expect(right.composition.keyframeOffset).toBe(2);expect(pictureAt(graphicAsVideo(right),2).x).toBe(.75);
 expect(original.graphics![0].clips).toHaveLength(1);
});
it('keeps excluded graphics in place and rejects affected locked tracks',()=>{
 const v=video();v.graphics![0].locked=true;expect(()=>editGraphicsRange(v,1,2,'extract')).toThrow(/locked/);v.graphics![0].rippleEnabled=false;expect(editGraphicsRange(v,1,2,'extract').graphics![0]).toBe(v.graphics![0]);
});
