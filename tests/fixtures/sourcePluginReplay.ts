import {recallFixture} from './sourcePluginRecall';
import type {SourceEditOperation} from '../../src/types/audio';
export function replayFixture(rate=48000){
 const f=recallFixture(rate,2),base=f.clip.sourceEdit!.operations[0].plugin!;
 const operations:SourceEditOperation[]=[
  {type:'invert',channel:-1,ranges:[{start:0,end:6000}],targetDb:-1,window:{start:1200,frames:6000}},
  {type:'plugin',channel:0,ranges:[{start:0,end:2000},{start:3000,end:5400}],targetDb:-1,plugin:{...base,state:'base-a'},window:{start:1800,frames:5400}},
  {type:'silence',channel:1,ranges:[{start:100,end:200}],targetDb:-1,window:{start:2400,frames:4800}},
  {type:'plugin',channel:-1,ranges:[{start:0,end:4800}],targetDb:-1,plugin:{...base,id:'vst3:second',name:'Second',parameters:{gain:.25},state:'base-b'},window:{start:2400,frames:4800}},
 ];
 f.clip.sourceEdit={sourceId:'original',offset:2400/rate,journal:{version:1,sampleRate:rate,channels:2},operations};return {...f,operations};
}
