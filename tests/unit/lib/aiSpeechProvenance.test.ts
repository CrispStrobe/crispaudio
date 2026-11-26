import {expect,it} from 'vitest';
import {audioReceipt,clipSpeechRegions,editedSpeechRegions,importedSpeechWavRegions,markSpeechWav,projectAudioReceipt,retimedSpeechRegions,scaledSpeechRegions,speechGeneration} from '../../../src/lib/aiSpeechProvenance';
import {encodeWavJS} from '../../../src/lib/wavRuntime';
import type {AudioSegment,AudioSource,TimelineProject} from '../../../src/types/audio';

const generation=speechGeneration('/private/person/models/sidon-v0.1-q8_0.gguf',new Date('2026-11-26T12:00:00Z'));
const source={sampleRate:100,aiSpeech:[{...generation,start:.5,end:2}]} as AudioSource;
const clip={sourceId:'s',sourceOffset:1,duration:2,startTime:10,gain:1} as AudioSegment;
function project(){return {sampleRate:100,duration:20,tracks:[{id:'track',name:'Human recording',volume:1,muted:false,solo:false,pan:0,segments:[clip]}],masterEffects:[]} as TimelineProject;}

it('records only successful speech regeneration, with a public model identity',()=>{
 expect(generation.model).toBe('sidon-v0.1-q8_0.gguf');
 expect(speechGeneration('/private/Jane_Doe_voice_clone.gguf').model).toBe('configured-local-speech-model');
 expect(speechGeneration('https://host/model?token=secret').model).toBe('configured-local-speech-model');
 const plain={sampleRate:100} as AudioSource;
 const op={type:'speech',channel:-1,ranges:[{start:20,end:70}],targetDb:-1,aiSpeech:generation};
 expect(editedSpeechRegions(plain,0,1,op)).toEqual([{...generation,start:.2,end:.7}]);
 expect(editedSpeechRegions(plain,0,1,{...op,type:'separate'})).toEqual([]);
 expect(editedSpeechRegions(plain,0,1,{...op,aiSpeech:undefined})).toEqual([]);
});
it('preserves attribution through crops and DSP, and removes silenced spans',()=>{
 expect(editedSpeechRegions(source,1,2)).toEqual([{...generation,start:0,end:1}]);
 expect(editedSpeechRegions(source,1,2,{type:'silence',channel:-1,ranges:[{start:25,end:75}],targetDb:0}))
  .toEqual([{...generation,start:0,end:.25},{...generation,start:.75,end:1}]);
});
it('silencing the only channel removes that source ancestry',()=>{
 expect(editedSpeechRegions({...source,channels:1},1,2,{type:'silence',channel:0,ranges:[{start:0,end:100}],targetDb:0})).toEqual([]);
});
it('does not lose reverse-retimed full-span lineage to floating point roundoff',()=>{
 const originalDuration=48367/48000,duration=16122/48000;
 const regions=retimedSpeechRegions([{...generation,start:0,end:originalDuration}],{rate:3,reverse:true,preservePitch:true,semitones:0,original:{offset:0,duration:originalDuration},renderDuration:duration});
 expect(regions).toEqual([{...generation,start:0,end:duration}]);expect(audioReceipt(regions)).toBeDefined();
 expect(scaledSpeechRegions(regions,duration,duration/2)).toEqual([{...generation,start:0,end:duration/2}]);
});
it('scopes mix metadata to contributing regions and the requested export range',()=>{
 const p=project(),sources=new Map([['s',source]]);
 const receipt=projectAudioReceipt(p,sources,{start:10.25,end:11.5})!;
 expect(receipt.regions).toEqual([{...generation,start:0,end:.75}]);
 expect(receipt.originalSourceOrigin).toBe('not-asserted');
 expect(receipt).not.toHaveProperty('aiGenerated');
 expect(JSON.stringify(receipt)).not.toContain('/private/person');
 expect(projectAudioReceipt(p,sources,{start:12,end:15})).toBeUndefined();
 p.tracks[0].muted=true;expect(projectAudioReceipt(p,sources)).toBeUndefined();
 p.tracks[0].solo=true;expect(projectAudioReceipt(p,sources)).toBeDefined();
 p.tracks[0].solo=false;p.tracks[0].muted=false;p.tracks[0].output='sink';
 p.tracks.push({id:'sink',kind:'bus',volume:0,muted:true,solo:false,segments:[]} as TimelineProject['tracks'][number]);
 expect(projectAudioReceipt(p,sources)).toBeUndefined();
});
it.each([8,24])('appends metadata after odd mono %i-bit PCM without changing samples',async bitDepth=>{
 const input=new Uint8Array(await encodeWavJS(new Float32Array([.1,-.2,.3]),16000,bitDepth).arrayBuffer());
 const receipt=audioReceipt([{...generation,start:0,end:3/16000}])!;
 expect(input.length%2).toBe(1);
 const out=markSpeechWav(input,receipt);
 expect(out.slice(44,input.length)).toEqual(input.slice(44));expect(out[input.length]).toBe(0);
 expect(new DataView(out.buffer).getUint32(40,true)).toBe(3*bitDepth/8);
 expect(importedSpeechWavRegions(out)).toEqual(receipt.regions.map(r=>({...r,basis:'imported-unsigned-declaration'})));
});
it('imports only valid own-format declarations and never upgrades their basis',async()=>{
 const input=new Uint8Array(await encodeWavJS(new Float32Array(3),16000,16).arrayBuffer());
 const receipt=audioReceipt([{...generation,start:0,end:3/16000}])!;
 const declared=importedSpeechWavRegions(markSpeechWav(input,receipt));
 expect(declared[0].basis).toBe('imported-unsigned-declaration');
 expect(audioReceipt(declared)!.regions[0].basis).toBe('imported-unsigned-declaration');
 for(const changed of [{...receipt,signature:'signed'},{...receipt,schema:'unknown'},{...receipt,regions:[{...generation,start:-1,end:2}]}]) {
  expect(importedSpeechWavRegions(markSpeechWav(input,changed as typeof receipt))).toEqual([]);
 }
 expect(importedSpeechWavRegions(input)).toEqual([]);
 expect(importedSpeechWavRegions(new Uint8Array([0,1,2]))).toEqual([]);
 const privateReceipt={...receipt,regions:[{...generation,start:0,end:1,model:'/private/Jane_Doe.gguf',apiKey:'secret',sourcePath:'/recording.wav'}]};
 const safe=importedSpeechWavRegions(markSpeechWav(input,privateReceipt));
 expect(safe[0].model).toBe('configured-local-speech-model');
 expect(JSON.stringify(safe)).not.toMatch(/Jane|secret|recording/);
});
it('respects static gain, gain automation, pre-fader sends and master silence',()=>{
 const p=project(),sources=new Map([['s',source]]),track=p.tracks[0];
 track.volume=0;track.automation=[{time:0,value:1}];
 expect(projectAudioReceipt(p,sources)).toBeUndefined();
 track.sends=[{target:'master',gain:1,preFader:true}];
 expect(projectAudioReceipt(p,sources)).toBeDefined();
 track.automation=[{time:0,value:0}];expect(projectAudioReceipt(p,sources)).toBeUndefined();
 track.volume=1;track.sends=[];
 expect(projectAudioReceipt(p,sources)).toBeUndefined();
 track.automation=[{time:0,value:0,curve:'step'},{time:10.5,value:1}];
 expect(projectAudioReceipt(p,sources)!.regions).toEqual([{...generation,start:10.5,end:11}]);
 expect(projectAudioReceipt(p,sources,{start:10,end:10.5})).toBeUndefined();
 p.masterVolume=0;expect(projectAudioReceipt(p,sources)).toBeUndefined();
});
it('uses the frozen derivative mask when it is reused or cropped',()=>{
 const p=project(),s={aiSpeech:[{...generation,start:1,end:2}]};
 p.tracks[0].segments=[{...clip,sourceId:'frozen',startTime:20,sourceOffset:1.5,duration:1}];
 expect(projectAudioReceipt(p,new Map([['frozen',s]]))!.regions).toEqual([{...generation,start:20,end:20.5}]);
});
it('retimed/reversed clips map retained source provenance without relabelling originals',()=>{
 const reversed={...clip,startTime:5,sourceId:'rendered',sourceOffset:0,duration:2,
  retime:{rate:2,reverse:true,semitones:0,preservePitch:true,renderDuration:2,original:{sourceId:'s',offset:1,duration:4}}};
 const regions=clipSpeechRegions(reversed,new Map([['s',{aiSpeech:[{...generation,start:1,end:2}]}]]));
 expect(regions).toEqual([{...generation,start:6.5,end:7}]);
 expect(clipSpeechRegions(clip,new Map())).toEqual([]);
});
it('WAV receipt preserves PCM bytes, alignment and native C2PA',async()=>{
 const input=new Uint8Array(await encodeWavJS(new Float32Array([.1,-.2,.3]),16000,16).arrayBuffer());
 const receipt=audioReceipt([{...generation,start:0,end:3/16000}])!;
 const output=markSpeechWav(input,receipt),view=new DataView(output.buffer);
 expect(output.slice(44,50)).toEqual(input.slice(44,50));
 expect(view.getUint32(4,true)).toBe(output.length-8);
 let found=false;
 for(let at=12;at<output.length;){
  const id=new TextDecoder().decode(output.slice(at,at+4)),size=view.getUint32(at+4,true);
  if(id==='capr'){expect(JSON.parse(new TextDecoder().decode(output.slice(at+8,at+8+size)))).toEqual(receipt);found=true;}
  at+=8+size+size%2;
 }
 expect(found).toBe(true);
 const signed=new Uint8Array(input.length+12);signed.set(input);signed.set(new TextEncoder().encode('c2pa'),input.length);
 new DataView(signed.buffer).setUint32(input.length+4,4,true);
 new DataView(signed.buffer).setUint32(4,signed.length-8,true);
 const original=signed.slice();expect(()=>markSpeechWav(signed,receipt)).toThrow('signed WAV');expect(signed).toEqual(original);
 const invalid=input.slice();new DataView(invalid.buffer).setUint32(4,input.length,true);
 expect(()=>markSpeechWav(invalid,receipt)).toThrow('Invalid WAV size');
});
