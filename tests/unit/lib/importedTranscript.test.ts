import {describe,expect,it} from 'vitest';
import {withSourceTranscript,withTimelineTranscript} from '../../../src/lib/importedTranscript';
import {useProjectStore} from '../../../src/stores/projectStore';
import {deleteSpokenWord,speechLayout} from '../../../src/lib/spokenEdits';
import {mappedSourceTranscript} from '../../../src/lib/sourceTranscript';
import type {AudioSource,AudioSegment} from '../../../src/types/audio';
const clip={id:'c',trackId:'t',sourceId:'s',startTime:0,sourceOffset:10,duration:5,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'} as AudioSegment;
const project=()=>({...useProjectStore.getInitialState().project,duration:5,tracks:[{id:'t',name:'Voice',volume:1,pan:0,muted:false,solo:false,segments:[clip]}]});
const source={id:'s',name:'Original',duration:20} as AudioSource;
// Current CrisperWeaver FileUtils.generateJsonContent output, including disclosure.
const exported=JSON.stringify({_disclosure:'Machine-generated transcript',segments:[{text:'Hallo Welt',startTime:1,endTime:3,speaker:'Ada',confidence:.9}]});
const words=JSON.stringify({segments:[{text:'Hallo Welt',startTime:1,endTime:3,speaker:'Ada',words:[{word:'Hallo',startTime:1,endTime:2},{word:'Welt',startTime:2.1,endTime:3}]}]});
describe('transcript handoff',()=>{
 it('imports actual CrisperWeaver cue schema without inventing words',()=>{
  const next=withTimelineTranscript(project(),exported);expect(next.transcript![0]).toMatchObject({text:'Hallo Welt',start:1,end:3,speaker:'Ada'});
  expect(next.transcript![0].words).toBeUndefined();expect(next.transcriptLayout).toBeUndefined();expect(()=>deleteSpokenWord(next,'not-a-word')).toThrow('untimed');
 });
 it('preserves real word/startTime fields and installs a layout guard on the shifted clock',()=>{
  const p=project(),next=withTimelineTranscript(p,words,.5);expect(next.transcriptLayout).toEqual(speechLayout(p));
  expect(next.transcript![0].words?.map(w=>[w.text,w.start,w.end])).toEqual([['Hallo',1.5,2.5],['Welt',2.6,3.5]]);expect(p.transcript).toBeUndefined();
 });
 it('keeps SRT and VTT cue-only',()=>{
  for(const text of ['1\n00:00:01,000 --> 00:00:03,000\nHallo Welt','WEBVTT\n\n00:01.000 --> 00:03.000\nHallo Welt'])expect(withTimelineTranscript(project(),text).transcript![0].words).toBeUndefined();
 });
 it('rejects transcript clocks outside the timeline',()=>{
  expect(()=>withTimelineTranscript(project(),words,4)).toThrow('spoken.bounds');expect(()=>withTimelineTranscript(project(),words,-2)).toThrow('Invalid timed transcript');
 });
 it('attaches original-clock words and maps a trimmed occurrence',()=>{
  const shifted=JSON.parse(words);for(const cue of shifted.segments){cue.startTime+=10;cue.endTime+=10;for(const w of cue.words){w.startTime+=10;w.endTime+=10;}}
  const p=project(),next=withSourceTranscript(p,source,JSON.stringify(shifted));expect(next.sourceTranscripts![0].cues[0].start).toBe(11);
  expect(mappedSourceTranscript(next)[0].words?.map(w=>[w.text,w.start])).toEqual([['Hallo',1],['Welt',expect.closeTo(2.1)]]);expect(p.sourceTranscripts).toBeUndefined();
 });
 it('rejects source overrun and word bounds that cannot roundtrip in a project',()=>{
  expect(()=>withSourceTranscript(project(),{...source,duration:2},words)).toThrow('sourceSpeech.bounds');
  expect(()=>withSourceTranscript(project(),source,JSON.stringify([{start:0,end:1,text:'Hi',words:[{start:0,end:1.01,text:'Hi'}]}]))).toThrow('Invalid word timestamps');
 });
});
