import { invoke } from '@tauri-apps/api/core';
export async function mediaJob<T>(command:string,args:Record<string,unknown>,signal:AbortSignal):Promise<T>{
  signal.throwIfAborted();const jobId=crypto.randomUUID();let finished=false,timer:ReturnType<typeof setTimeout>|undefined;
  const cancel=()=>{void invoke<boolean>('cancel_media_job',{jobId}).then(cancelled=>{if(!cancelled&&!finished)timer=setTimeout(cancel,100);}).catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  try{const result=await invoke<T>(command,{...args,jobId});signal.throwIfAborted();return result;}
  finally{finished=true;if(timer)clearTimeout(timer);signal.removeEventListener('abort',cancel);}
}
