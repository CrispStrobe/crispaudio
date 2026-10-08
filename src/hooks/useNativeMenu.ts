import i18n from '../i18n';
import { useEffect } from 'react';
import { dispatchNativeMenu, isNativeMac, nativeMenuContext } from '../lib/nativeMenu';
import { useSynthStore } from '../stores/synthStore';
import { useVoiceStore } from '../stores/voiceStore';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import { useSettingsStore } from '../stores/settingsStore';

/** One native event subscription, with coalesced context updates in order. */
export function useNativeMenu(){
 useEffect(()=>{
  if(!isNativeMac())return;
  let disposed=false,unlisten:(()=>void)|undefined,last='',queued:ReturnType<typeof nativeMenuContext>|undefined,sending=false;
  const send=async()=>{
   if(sending||disposed)return;sending=true;
   try{const {invoke}=await import('@tauri-apps/api/core');while(queued&&!disposed){const context=queued;queued=undefined;await invoke('configure_native_menu',{context});}}
   catch(error){last='';console.error('Native menu update failed:',error);}
   finally{sending=false;}
  };
  const update=()=>{const context=nativeMenuContext(),signature=JSON.stringify(context);if(signature===last)return;last=signature;queued=context;void send();};
  const observer=new MutationObserver(update);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-timeline-help','aria-modal']});
  const subscriptions=[useProjectStore.subscribe(update),useProjectStore.temporal.subscribe(update),useSynthStore.temporal.subscribe(update),useVoiceStore.temporal.subscribe(update),useUIStore.subscribe(update),useSettingsStore.subscribe(update)];
  i18n.on('languageChanged',update);
  document.addEventListener('focusin',update);document.addEventListener('focusout',update);window.addEventListener('crispaudio-menu-state',update);
  void import('@tauri-apps/api/event').then(({listen})=>listen<string>('crispaudio-menu',event=>dispatchNativeMenu(event.payload))).then(stop=>{if(disposed)stop();else{unlisten=stop;update();}}).catch(error=>console.error('Native menu listener failed:',error));
  return()=>{disposed=true;i18n.off('languageChanged',update);unlisten?.();observer.disconnect();subscriptions.forEach(stop=>stop());document.removeEventListener('focusin',update);document.removeEventListener('focusout',update);window.removeEventListener('crispaudio-menu-state',update);};
 },[]);
}
