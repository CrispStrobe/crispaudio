import {useEffect,useState} from 'react';
import {isTauri,isIOSApp} from '../lib/native';
import {useUIStore} from '../stores/uiStore';

/** Finder drops arrive through Tauri, rather than DOM dataTransfer.files. */
export function useMediaDrop(){
 const [hovering,setHovering]=useState(false);
 useEffect(()=>{
  if(!isTauri()||isIOSApp())return;
  let disposed=false,unsubscribe:(()=>void)|undefined;
  void import('@tauri-apps/api/webview').then(({getCurrentWebview})=>getCurrentWebview().onDragDropEvent(({payload})=>{
   if(disposed)return;
   setHovering(payload.type==='enter'||payload.type==='over');
   if(payload.type==='drop')useUIStore.getState().queueDroppedPaths(payload.paths);
  })).then(stop=>{if(disposed)stop();else unsubscribe=stop;}).catch(error=>console.error('Media drop listener failed',error));
  return()=>{disposed=true;unsubscribe?.();};
 },[]);
 return hovering;
}
