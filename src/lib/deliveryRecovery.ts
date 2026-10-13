import {serializeProject,deserializeProject,projectSourceIds} from './projectFile';
import type {DeliveryJob,DeliveryPlan} from './delivery';
interface SavedJob {id:string;output:string;status:DeliveryJob['status'];phase:string;error?:string;document:string;plan:Omit<DeliveryPlan,'project'|'sources'>}
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open('crispaudio-delivery',1);r.onupgradeneeded=()=>r.result.createObjectStore('jobs',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
const documents=new WeakMap<DeliveryPlan,string>();
export async function saveDeliveryJob(job:DeliveryJob){
 let document=documents.get(job.plan);if(!document){const used=projectSourceIds(job.plan.project),sources=new Map([...job.plan.sources].filter(([id])=>used.has(id)));for(const s of sources.values())if(!s.filePath&&s.buffer.length*s.channels*4>256*1024*1024)throw new Error('delivery.recoveryTooLarge');document=serializeProject(job.plan.project,sources,'linked');documents.set(job.plan,document);}
 const {project:_,sources:__,...plan}=job.plan;void _;void __;
 const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('jobs','readwrite');tx.objectStore('jobs').put({id:job.id,output:job.output,status:job.status,phase:job.phase,error:job.error,document,plan} satisfies SavedJob);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
export async function loadDeliveryJobs(ctx:BaseAudioContext):Promise<{jobs:DeliveryJob[];errors:string[]}>{
 const db=await database();let saved:SavedJob[];try{saved=await new Promise((resolve,reject)=>{const r=db.transaction('jobs').objectStore('jobs').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}
 const jobs:DeliveryJob[]=[],errors:string[]=[];for(const j of saved){try{const doc=JSON.parse(j.document);if(doc.format!=='crispaudio-project'||!doc.project)throw new Error('Invalid saved delivery');const loaded=j.status==='done'?{project:doc.project,sources:new Map()}:await deserializeProject(j.document,ctx),plan={...j.plan,...loaded};documents.set(plan,j.document);jobs.push({id:j.id,output:j.output,status:j.status,phase:j.phase,error:j.error,plan});}catch(e){errors.push(`${j.output}: ${String(e)}`);}}return {jobs,errors};
}
