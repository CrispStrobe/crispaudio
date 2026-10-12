import {it,expect} from 'vitest';
import {mappedSourceTranscript,proposeSpeechEdit,validSourceTranscripts} from '../../../src/lib/sourceTranscript';
import type {TimelineProject} from '../../../src/types/audio';
const project=()=>({id:'p',name:'p',duration:4,sampleRate:48000,masterEffects:[],sections:[{id:'part',name:'Answer',start:0,end:4}],markers:[{id:'later',time:3,name:'Later'}],tracks:[{id:'mic',name:'Mic',pan:0,volume:1,muted:false,solo:false,segments:[{id:'a',trackId:'mic',sourceId:'s',sourceOffset:10,startTime:0,duration:4,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear',name:'source',color:'#fff'}]}],sourceTranscripts:[{id:'r',sourceId:'s',name:'Original',cues:[{id:'c',start:11,end:13,text:'Hallo Welt',speaker:'Ada',words:[{id:'hello',start:11,end:11.5,text:'Hallo'},{id:'world',start:12,end:13,text:'Welt'}]}]}]} as TimelineProject);
it('maps source words through trims and repeated clip occurrences with distinct selection IDs',()=>{
 const p=project(),c=p.tracks[0].segments[0];p.tracks[0].segments.push({...c,id:'repeat',startTime:5});const mapped=mappedSourceTranscript(p);expect(mapped.map(c=>c.start)).toEqual([1,6]);expect(mapped[0].speaker).toBe('Ada');expect(mapped[0].words![0].id).not.toBe(mapped[1].words![0].id);expect(p.sourceTranscripts![0].cues[0].start).toBe(11);expect(validSourceTranscripts(p,new Set(['s']))).toBe(true);
});
it('a reviewed extraction changes linked arrangement clocks, markers and sections while retaining source text/timing',()=>{
 const p=project(),id=mappedSourceTranscript(p)[0].words![0].id,proposal=proposeSpeechEdit(p,[id],'extract');expect(proposal.ranges).toEqual([{start:1,end:1.5}]);expect(proposal.project.duration).toBe(3.5);expect(proposal.project.markers![0].time).toBe(2.5);expect(proposal.project.sourceTranscripts).toBe(p.sourceTranscripts);expect(mappedSourceTranscript(proposal.project).flatMap(c=>c.words??[]).map(w=>[w.text,w.start])).toEqual([['Welt',1.5]]);expect(p.tracks[0].segments).toHaveLength(1);
 const lifted=proposeSpeechEdit(p,[id],'lift');expect(lifted.project.duration).toBe(4);expect(lifted.project.tracks[0].segments[1].startTime).toBe(1.5);
});
it('maps preserved source timing through speed and reverse; locks and partially trimmed words block proposals',()=>{
 const p=project(),c=p.tracks[0].segments[0];c.sourceId='derived';c.sourceOffset=0;c.duration=2;c.retime={rate:2,reverse:true,preservePitch:true,semitones:0,original:{sourceId:'s',offset:10,duration:4}};
 const mapped=mappedSourceTranscript(p);expect(mapped[0].words!.map(w=>[w.text,w.start,w.end])).toEqual([['Welt',.5,1],['Hallo',1.25,1.5]]);p.tracks[0].locked=true;expect(()=>proposeSpeechEdit(p,[mapped[0].words![0].id],'extract')).toThrow(/locked/);p.tracks[0].locked=false;c.sourceOffset=.75;c.duration=.5;const partial=mappedSourceTranscript(p)[0].words![0];expect(partial.partial).toBe(true);expect(()=>proposeSpeechEdit(p,[partial.id],'extract')).toThrow(/partial/);
});
