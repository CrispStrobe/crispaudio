import {invoke} from '@tauri-apps/api/core';
import {isIOSApp} from './native';

export function usesMacResourceAccess():boolean {
 return typeof window!=='undefined' && '__TAURI_INTERNALS__' in window && !isIOSApp() && /Mac/.test(navigator.platform+' '+navigator.userAgent);
}
/** Call while the OS picker/drop grant is active, before using or retaining paths. */
export async function rememberResources(paths:string[],writable=false):Promise<void>{
 if(usesMacResourceAccess()&&paths.length)await invoke('remember_resources',{paths,writable});
}

function visitPaths(value:unknown,visit:(record:Record<string,unknown>,key:string)=>void){
 if(!value||typeof value!=='object')return;
 if(Array.isArray(value)){for(const child of value)visitPaths(child,visit);return;}
 for(const [key,child]of Object.entries(value)){
  if(key==='path'||key==='originalPath')visit(value as Record<string,unknown>,key);
  else visitPaths(child,visit);
 }
}
/** Recover linked paths without sending embedded audio through native IPC. */
export async function restoreProjectResources(json:string):Promise<string>{
 if(!usesMacResourceAccess())return json;
 const doc:unknown=JSON.parse(json),paths=new Set<string>();
 visitPaths(doc,(record,key)=>{const path=record[key];if(typeof path==='string'&&path.startsWith('/'))paths.add(path);});
 if(!paths.size)return json;
 const list=[...paths],replacements:Record<string,string>={};
 for(let start=0;start<list.length;start+=4096){
  Object.assign(replacements,await invoke<Record<string,string>>('relocate_resource_paths',{paths:list.slice(start,start+4096)}));
 }
 let changed=false;
 visitPaths(doc,(record,key)=>{const previous=record[key];if(typeof previous!=='string'||!paths.has(previous))return;const current=replacements[previous];if(typeof current==='string'&&current.startsWith('/')&&current!==previous){record[key]=current;changed=true;}});
 return changed?JSON.stringify(doc):json;
}
