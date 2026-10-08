import { convertFileSrc, invoke } from '@tauri-apps/api/core';
// Bounded URL cache. Native preparation checks file existence on explicit retry.
const urls=new Map<string,Promise<string>>();
export function previewUrl(path:string,retry=false):Promise<string>{
  if(retry)urls.delete(path);
  let pending=urls.get(path);
  if(!pending){pending=invoke<string>('prepare_video_preview',{path:proxies.get(path)??path}).then(convertFileSrc).catch(error=>{urls.delete(path);throw error;});urls.set(path,pending);if(urls.size>32)urls.delete(urls.keys().next().value!);}
  return pending;
}

const proxies=new Map<string,string>();
export function setPreviewProxy(path:string,proxy:string){proxies.set(path,proxy);urls.delete(path);window.dispatchEvent(new Event('crispaudio-preview-change'));}

export function clearPreviewCache(){urls.clear();proxies.clear();}
