import {it,expect} from 'vitest';
import {createMulticam,switchMulticam,validMulticam} from '../../../src/lib/multicam';
import {editTimeRange} from '../../../src/lib/rangeEdits';
import {playbackGraphKey} from '../../../src/lib/playbackGraphKey';
import type {TimelineProject} from '../../../src/types/audio';
const clip=(id:string,lane:string,sourceId?:string)=>({id,videoTrackId:lane,sourceId,startTime:0,sourceOffset:1,duration:4,fadeIn:0,fadeOut:0,transition:'cut' as const,transitionDuration:0});
const project=()=>({id:'p',name:'p',duration:4,sampleRate:48000,frameRate:25,masterEffects:[],tracks:[{id:'mic',name:'Mic',pan:0,volume:1,muted:false,solo:false,segments:[{id:'a',name:'a',trackId:'mic',sourceId:'s',startTime:0,sourceOffset:0,duration:4,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear',color:'#fff'}]}],video:{path:'a.mp4',duration:8,session:{},tracks:['top','base'].map(id=>({id,name:id,locked:false,visible:true,rippleEnabled:true})),sources:[{id:'b',path:'b.mp4',name:'B',duration:8}],clips:[clip('one','top'),clip('two','base','b')]}} as TimelineProject);
it('switches shots at the playhead without touching microphone media or rebuilding the audio graph',()=>{
 const p=createMulticam(project(),['one','two'],'Interview'),g=p.video!.multicamGroups![0],next=switchMulticam(p,g.id,g.angles[1].id,1.5);
 expect(next.video!.clips).toHaveLength(2);expect(next.video!.clips![1].sourceOffset).toBeCloseTo(2.52);expect(next.tracks).toBe(p.tracks);expect(playbackGraphKey(next)).toBe(playbackGraphKey(p));expect(validMulticam(next)).toBe(true);
 const again=switchMulticam(next,g.id,g.angles[0].id,2.5);expect(again.video!.clips).toHaveLength(3);expect(again.video!.clips![2].sourceOffset).toBeCloseTo(3.52);
});
it('extract/split retain angle clocks and later shot switches use source time rather than the shortened timeline',()=>{
 const p=createMulticam(project(),['one','two'],'Interview'),g=p.video!.multicamGroups![0],cut=editTimeRange(p,1,2,'extract'),next=switchMulticam(cut,g.id,g.angles[1].id,1.5);
 const last=next.video!.clips!.at(-1)!;expect(last.multicam!.clockOffset).toBeCloseTo(2.52);expect(last.sourceOffset).toBeCloseTo(3.52);expect(next.tracks[0].segments[1].sourceOffset).toBe(2);
});
it('rejects missing coverage, locked angles and duplicate saved group IDs',()=>{
 const p=project();p.video!.tracks![0].locked=true;expect(()=>createMulticam(p,['one','two'],'Scene')).toThrow(/locked/);p.video!.tracks![0].locked=false;const next=createMulticam(p,['one','two'],'Scene');next.video!.multicamGroups!.push(next.video!.multicamGroups![0]);expect(validMulticam(next)).toBe(false);
});
