import {afterEach,expect,it,vi} from 'vitest';
import {cacheRecovery,loadRecovery} from '../../../src/lib/recovery';
import {speechGeneration} from '../../../src/lib/aiSpeechProvenance';
import {RecallBuffer,recallFixture} from '../../fixtures/sourcePluginRecall';
vi.mock('../../../src/lib/wavExport',()=>({encodeSourceBufferWav:async()=>new Blob([new Uint8Array([1,2,3])])}));
afterEach(()=>{vi.unstubAllGlobals();localStorage.clear();});

/** Storage-only test double: exercise the real snapshot writer/loader and
 * decoder boundary, without a browser database or a model download. */
function storage(){
 const records=new Map<string,Map<unknown,unknown>>([['audio',new Map()],['snapshot',new Map()]]);
 const request=(result:unknown)=>{const r={result,onsuccess:undefined as (()=>void)|undefined};queueMicrotask(()=>r.onsuccess?.());return r;};
 const db={close:()=>{},objectStoreNames:{contains:()=>true},transaction:(names:unknown,mode?:string)=>{
  const tx={oncomplete:undefined as (()=>void)|undefined,objectStore:(name:string)=>({get:(key:unknown)=>request(records.get(name)!.get(key)),put:(value:unknown,key:unknown)=>records.get(name)!.set(key,value),openCursor:()=>request(null)})};
  if(mode==='readwrite')setTimeout(()=>tx.oncomplete?.(),0);void names;return tx;
 }};
 vi.stubGlobal('indexedDB',{open:()=>request(db)});
 return records;
}
it('known source ancestry survives recovery save/reopen without leaking arbitrary metadata',async()=>{
 const saved=storage(),f=recallFixture(48000,1),g=speechGeneration('/private/person/custom.gguf');
 f.clip.sourceEdit=undefined;f.state.project.tracks[0].segments=[f.clip];f.source.filePath=undefined;
 f.source.aiSpeech=[{...g,start:.025,end:.05,apiKey:'secret'} as never];
 await cacheRecovery(f.state.project,f.state.sources);
 const snapshot=saved.get('snapshot')!.get('latest') as {sources:{aiSpeech:unknown}[]};
 expect(snapshot.sources).toHaveLength(1);expect(JSON.stringify(snapshot.sources[0].aiSpeech)).not.toMatch(/secret|private/);
 const context={sampleRate:48000,decodeAudioData:async()=>new RecallBuffer({length:4800,sampleRate:48000,numberOfChannels:1})} as unknown as BaseAudioContext;
 const restored=await loadRecovery(context);
 expect(restored.sources.get('edited')!.aiSpeech).toEqual([{...g,start:.025,end:.05}]);
});
