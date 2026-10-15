import {useCallback,useEffect,useRef} from 'react';
import {projectHistoryGesture} from '../stores/projectStore';
/** One project Undo checkpoint for a slider drag or a focused numeric edit. */
export function useProjectGesture(){
 const active=useRef(false);
 const begin=useCallback(()=>{if(!active.current){active.current=true;projectHistoryGesture.begin();}},[]);
 const end=useCallback(()=>{if(active.current){active.current=false;projectHistoryGesture.end();}},[]);
 useEffect(()=>{const released=(event:PointerEvent)=>{if(event.target instanceof Element&&event.target.closest('input[type=number]'))return;end();};window.addEventListener('pointerup',released);window.addEventListener('pointercancel',end);window.addEventListener('blur',end);return()=>{end();window.removeEventListener('pointerup',released);window.removeEventListener('pointercancel',end);window.removeEventListener('blur',end);};},[end]);
 return {begin,end};
}
