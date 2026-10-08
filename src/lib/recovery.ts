import type { AudioSource, TimelineProject } from '../types/audio';
import { encodeAudioBufferWav } from './wavExport';
import { computeWaveformPeaks } from '../audio/utils/audioBufferUtils';
interface RecoverySource {id:string;name:string;path?:string;sampleRate:number;channels:number;provenance?:AudioSource['provenance']}
interface Snapshot {project:TimelineProject;sources:RecoverySource[];savedAt:string}
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open('crispaudio-recovery',1);request.onupgradeneeded=()=>{request.result.createObjectStore('audio');request.result.createObjectStore('snapshot');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
function request<T>(store:IDBObjectStore,key:IDBValidKey):Promise<T>{return new Promise((resolve,reject)=>{const read=store.get(key);read.onsuccess=()=>resolve(read.result as T);read.onerror=()=>reject(read.error);});}
function transactionDone(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('Recovery transaction aborted'));});}
export async function cacheRecovery(project:TimelineProject,sources:Map<string,AudioSource>):Promise<void>{
  const db=await database();try{
    const used=new Set(project.tracks.flatMap(t=>t.segments).map(c=>c.sourceId)),metadata:RecoverySource[]=[];
    for(const id of used){
      const source=sources.get(id);if(!source)throw new Error('Recovery: missing audio source');
      const path='__TAURI_INTERNALS__' in window?source.filePath:undefined;
      metadata.push({id,name:source.name,path,sampleRate:source.sampleRate,channels:source.channels,provenance:source.provenance});
      if(path)continue;
      const cached=await request<Blob|undefined>(db.transaction('audio').objectStore('audio'),id);
      if(cached)continue;
      if(source.buffer.length*source.channels*4>256*1024*1024)throw new Error('Recovery cache: save long recordings as a linked desktop project');
      const blob=await encodeAudioBufferWav(source.buffer,32);
      const tx=db.transaction('audio','readwrite');tx.objectStore('audio').put(blob,id);await transactionDone(tx);
    }
    // Publish the metadata only after all media is durable. A failed save retains
    // the preceding recoverable snapshot. Reclaim superseded audio atomically.
    const tx=db.transaction(['audio','snapshot'],'readwrite');
    tx.objectStore('snapshot').put({project,sources:metadata,savedAt:new Date().toISOString()} satisfies Snapshot,'latest');
    const cursor=tx.objectStore('audio').openCursor();cursor.onsuccess=()=>{const entry=cursor.result;if(entry){if(!used.has(String(entry.key)))entry.delete();entry.continue();}};
    await transactionDone(tx);
    localStorage.setItem('crispaudio-recovery-ready','1');
  }finally{db.close();}
}
export async function loadRecovery(ctx:BaseAudioContext):Promise<{project:TimelineProject;sources:Map<string,AudioSource>}>{
  const db=await database();try{
    const snapshot=await request<Snapshot|undefined>(db.transaction('snapshot').objectStore('snapshot'),'latest');if(!snapshot)throw new Error('No recoverable arrangement');
    const sources=new Map<string,AudioSource>();
    for(const source of snapshot.sources){
      let bytes:ArrayBuffer;
      if(source.path){const {readFile}=await import('@tauri-apps/plugin-fs');const file=await readFile(source.path);bytes=file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength) as ArrayBuffer;}
      else{const blob=await request<Blob|undefined>(db.transaction('audio').objectStore('audio'),source.id);if(!blob)throw new Error('Recovery media is missing');bytes=await blob.arrayBuffer();}
      const decoder=ctx.sampleRate!==source.sampleRate?new OfflineAudioContext(source.channels,1,source.sampleRate):ctx;
      const buffer=await decoder.decodeAudioData(bytes);
      sources.set(source.id,{...source,buffer,filePath:source.path,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,duration:buffer.duration,peaks:computeWaveformPeaks(buffer.getChannelData(0),Math.min(8000,Math.ceil(buffer.duration*200)))});
    }
    return {project:snapshot.project,sources};
  }finally{db.close();}
}
