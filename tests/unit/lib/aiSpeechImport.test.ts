import {expect,it,vi} from 'vitest';
import {prepareAudioImport} from '../../../src/lib/audioImport';
import {audioReceipt,markSpeechWav,projectAudioReceipt,speechGeneration} from '../../../src/lib/aiSpeechProvenance';
import {encodeWavJS} from '../../../src/lib/wavRuntime';
import type {TimelineProject} from '../../../src/types/audio';
import {RecallBuffer} from '../../fixtures/sourcePluginRecall';

it.each([undefined,'/private/linked.wav'])('ordinary WAV import keeps declarations before audio decode detaches bytes (%s)',async filePath=>{
 const g=speechGeneration('sidon-v0.1-q8_0.gguf'),plain=new Uint8Array(await encodeWavJS(new Float32Array(160),16000,16).arrayBuffer());
 const bytes=markSpeechWav(plain,audioReceipt([{...g,start:0,end:.005}])!).buffer;
 const buffer=new RecallBuffer({length:160,sampleRate:16000,numberOfChannels:1}) as unknown as AudioBuffer;
 const ctx={decodeAudioData:vi.fn(async(input:ArrayBuffer)=>{structuredClone(input,{transfer:[input]});return buffer;})} as unknown as BaseAudioContext;
 const imported=await prepareAudioImport(ctx,{name:'voice.wav',filePath,read:async()=>bytes},new AbortController().signal,vi.fn());
 expect(bytes.byteLength).toBe(0);expect(imported.filePath).toBe(filePath);
 expect(imported.aiSpeech).toEqual([{...g,basis:'imported-unsigned-declaration',start:0,end:.005}]);
 const project={sampleRate:16000,tracks:[{id:'t',name:'Track',volume:1,pan:0,solo:false,muted:false,segments:[{sourceId:imported.id,startTime:2,sourceOffset:0,duration:buffer.duration,gain:1}]}]} as TimelineProject;
 expect(projectAudioReceipt(project,new Map([[imported.id,imported]]))!.regions[0]).toMatchObject({start:2,end:2.005,basis:'imported-unsigned-declaration'});
});
it('unmarked source audio remains unknown after an ordinary import',async()=>{
 const bytes=await encodeWavJS(new Float32Array(3),16000,16).arrayBuffer(),buffer=new RecallBuffer({length:3,sampleRate:16000,numberOfChannels:1});
 const imported=await prepareAudioImport({decodeAudioData:async()=>buffer} as unknown as BaseAudioContext,{name:'recording.wav',read:async()=>bytes},new AbortController().signal,vi.fn());
 expect(imported.aiSpeech).toBeUndefined();
});
