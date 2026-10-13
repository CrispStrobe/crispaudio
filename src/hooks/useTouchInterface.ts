import {useEffect,useState} from 'react';
/** A connected mouse does not remove access to touch commands. */
export function useTouchInterface(){
 const [touch,setTouch]=useState(()=>window.matchMedia?.('(pointer:coarse)').matches||navigator.maxTouchPoints>0);
 useEffect(()=>{const media=window.matchMedia?.('(pointer:coarse)'),changed=()=>setTouch(media?.matches||navigator.maxTouchPoints>0),pointer=(e:PointerEvent)=>{if(e.pointerType==='touch')setTouch(true);};media?.addEventListener?.('change',changed);window.addEventListener('pointerdown',pointer,{passive:true});return()=>{media?.removeEventListener?.('change',changed);window.removeEventListener('pointerdown',pointer);};},[]);
 return touch;
}
