import {serializeProject,deserializeProject,projectSourceIds} from './projectFile';
import type {DeliveryJob,DeliveryPlan} from './delivery';
interface SavedJob {id:string;output:string;status:DeliveryJob['status'];phase:string;error?:string;snapshotId:string;plan:Omit<DeliveryPlan,'sources'>}
interface Snapshot {id:string;document:string}
const references=new WeakMap<DeliveryPlan,string>(),documents=new WeakMap<DeliveryPlan,string>();
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 const r=indexedDB.open('crispaudio-delivery',2);let blocked=false;
 r.onupgradeneeded=event=>{
  const db=r.result,tx=r.transaction!;
  if(!db.objectStoreNames.contains('jobs'))db.createObjectStore('jobs',{keyPath:'id'});
  db.createObjectStore('snapshots',{keyPath:'id'});
  if(event.oldVersion===1){const jobs=tx.objectStore('jobs'),cursor=jobs.openCursor();cursor.onsuccess=()=>{const item=cursor.result;if(!item)return;const old=item.value;if(typeof old.document==='string'){let project;try{project=JSON.parse(old.document).project;}catch{/* Retain malformed records for recovery, never erase them. */}tx.objectStore('snapshots').put({id:old.id,document:old.document});const {document:_,...record}=old;void _;item.update({...record,snapshotId:old.id,plan:{...old.plan,project}});}item.continue();};}
 };
 r.onsuccess=()=>{if(blocked)r.result.close();else{r.result.onversionchange=()=>r.result.close();resolve(r.result);}};
 r.onerror=()=>reject(r.error);r.onblocked=()=>{blocked=true;reject(new Error('delivery.recoveryBlocked'));};
});}
function collectUnusedSnapshots(tx:IDBTransaction){const records=tx.objectStore('jobs').getAll();records.onsuccess=()=>{const used=new Set(records.result.map((j:SavedJob)=>j.snapshotId)),snapshots=tx.objectStore('snapshots'),keys=snapshots.getAllKeys();keys.onsuccess=()=>{for(const id of keys.result)if(!used.has(String(id)))snapshots.delete(id);};};}
function complete(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error??new Error('delivery.recoveryFailed'));tx.onabort=()=>reject(tx.error??new Error('delivery.recoveryFailed'));});}
/** Immutable audio is written once; phase/status updates only write small job records. */
export async function saveDeliveryJob(job:DeliveryJob){
 let snapshotId=references.get(job.plan),document:string|undefined;
 if(!snapshotId){document=documents.get(job.plan);if(!document){const used=projectSourceIds(job.plan.project),sources=new Map([...job.plan.sources].filter(([id])=>used.has(id)));for(const id of used)if(!sources.has(id))throw new Error('delivery.mediaMissing');for(const s of sources.values())if(!s.filePath&&s.buffer.length*s.channels*4>256*1024*1024)throw new Error('delivery.recoveryTooLarge');document=serializeProject(job.plan.project,sources,'linked');}snapshotId=crypto.randomUUID();}
 const {sources:_,...plan}=job.plan;void _;
 const db=await database();try{const tx=db.transaction(['jobs','snapshots'],'readwrite'),done=complete(tx),snapshots=tx.objectStore('snapshots');
  if(document!==undefined)snapshots.add({id:snapshotId,document} satisfies Snapshot);
  else {const check=snapshots.getKey(snapshotId);check.onsuccess=()=>{if(check.result===undefined)tx.abort();};}
  tx.objectStore('jobs').put({id:job.id,output:job.output,status:job.status,phase:job.phase,error:job.error,snapshotId,plan} satisfies SavedJob);
  if(document!==undefined)collectUnusedSnapshots(tx);await done;references.set(job.plan,snapshotId);documents.delete(job.plan);
 }finally{db.close();}
}
/** Opening the app restores queue metadata, without reading files or decoding audio. */
export async function loadDeliveryJobs():Promise<{jobs:DeliveryJob[];errors:string[]}>{
 const db=await database();let saved:SavedJob[];try{saved=await new Promise((resolve,reject)=>{const r=db.transaction('jobs').objectStore('jobs').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}
 const jobs:DeliveryJob[]=[],errors:string[]=[];for(const j of saved){try{if(!j.snapshotId||!j.plan?.project||!['queued','running','done','failed','cancelled'].includes(j.status))throw new Error('Invalid saved delivery');const plan={...j.plan,sources:new Map()};references.set(plan,j.snapshotId);jobs.push({id:j.id,output:j.output,status:j.status,phase:j.phase,error:j.error,plan});}catch(e){errors.push(`${j.output}: ${String(e)}`);}}return {jobs,errors};
}
export async function deliveryRecoveryDocument(plan:DeliveryPlan):Promise<string>{
 const document=documents.get(plan);if(document!==undefined)return document;
 const id=references.get(plan);if(!id){const used=projectSourceIds(plan.project);return serializeProject(plan.project,new Map([...plan.sources].filter(([id])=>used.has(id))),'linked');}
 const db=await database();try{return await new Promise((resolve,reject)=>{const r=db.transaction('snapshots').objectStore('snapshots').get(id);r.onsuccess=()=>{if(typeof r.result?.document==='string')resolve(r.result.document);else reject(new Error('delivery.recoveryMissing'));};r.onerror=()=>reject(r.error);});}finally{db.close();}
}
/** Retry owns decoding; linked media missing at startup cannot block the app. */
export async function resolveDeliveryPlan(plan:DeliveryPlan,ctx:BaseAudioContext):Promise<DeliveryPlan>{
 if(!references.has(plan)&&!documents.has(plan))return plan;
 const loaded=await deserializeProject(await deliveryRecoveryDocument(plan),ctx);for(const id of projectSourceIds(loaded.project))if(!loaded.sources.has(id))throw new Error('delivery.mediaMissing');return {...plan,...loaded};
}
export function replaceDeliveryDocument(plan:DeliveryPlan,document:string):DeliveryPlan{
 const doc=JSON.parse(document);if(doc.format!=='crispaudio-project'||!doc.project||!Array.isArray(doc.sources))throw new Error('Invalid saved delivery');
 const next={...plan,project:doc.project,sources:new Map()};documents.set(next,document);return next;
}
/** Remove queue records only; exported files and active jobs belong to other owners. */
export async function removeDeliveryJobs(ids:string[]){
 if(!ids.length)return;const db=await database();try{const tx=db.transaction(['jobs','snapshots'],'readwrite'),done=complete(tx),jobs=tx.objectStore('jobs');for(const id of ids)jobs.delete(id);
  collectUnusedSnapshots(tx);await done;
 }finally{db.close();}
}
/** One writer preserves phase order, skips unchanged jobs and shares retry snapshots. */
export class DeliveryRecoveryWriter {
 private pending:Promise<void>=Promise.resolve();private seen=new Map<string,{plan:DeliveryPlan;signature:string}>();
 private failed:(error:unknown)=>void;
 constructor(failed:(error:unknown)=>void=()=>{}){this.failed=failed;}
 sync(jobs:DeliveryJob[]){const copies=jobs.map(j=>({...j})),ids=new Set(copies.map(j=>j.id)),removed=[...this.seen.keys()].filter(id=>!ids.has(id));for(const id of removed)this.seen.delete(id);
  const changed=copies.filter(j=>{const signature=JSON.stringify([j.output,j.status,j.phase,j.error]),old=this.seen.get(j.id);if(old?.plan===j.plan&&old.signature===signature)return false;this.seen.set(j.id,{plan:j.plan,signature});return true;});
  this.pending=this.pending.catch(()=>{}).then(async()=>{for(const j of changed)await saveDeliveryJob(j);await removeDeliveryJobs(removed);});void this.pending.catch(this.failed);
 }
 async beforeRun(job:DeliveryJob){this.pending=this.pending.catch(()=>{}).then(()=>saveDeliveryJob({...job}));void this.pending.catch(this.failed);await this.pending;}
}
