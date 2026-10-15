import {invoke} from '@tauri-apps/api/core';
import {createRoot} from 'react-dom/client';
import {NativeRenderedHarness} from './nativeRenderedHarness';
import {useProjectStore} from '../../src/stores/projectStore';
import {useSettingsStore} from '../../src/stores/settingsStore';
import {useUIStore} from '../../src/stores/uiStore';
import type {TimelineProject,AudioSource} from '../../src/types/audio';
import i18n from '../../src/i18n';
async function until(check:()=>boolean,label:string){const end=performance.now()+15000;while(!check()){if(performance.now()>end)throw new Error(`Native GUI timed out: ${label} (${useUIStore.getState().nativePreviewStatus})`);await new Promise(resolve=>setTimeout(resolve,20));}}
async function released(){const end=performance.now()+10000;while(true){const status=await invoke<{entries:number;bytes:number}>('native_snapshot_status');if(!status.entries&&!status.bytes)return;if(performance.now()>end)throw new Error('GUI native snapshot cleanup timed out');await new Promise(resolve=>setTimeout(resolve,20));}}
export async function nativeLiveUI(project:TimelineProject,sources:Map<string,AudioSource>){
 const errors:string[]=[],failed=(event:Event)=>errors.push(String((event as CustomEvent).detail));window.addEventListener('crispaudio-edit-error',failed);
 useSettingsStore.getState().setNativePlaybackMode('live');await i18n.changeLanguage('de');
 useProjectStore.setState({project,sources,isPlaying:false,playheadPosition:0,rangePlayback:false,loopEnabled:true});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const click=(key:string)=>{const button=[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.getAttribute('aria-label')===i18n.t(key));if(!button)throw new Error(`Missing native GUI control ${key}`);button.click();};
 try{
  root.render(<NativeRenderedHarness/>);await until(()=>!!host.querySelector('[data-native-preview]'),'mount');
  click('timeline.play');await until(()=>useUIStore.getState().nativePreviewStatus==='playing','play');await until(()=>useProjectStore.getState().playheadPosition>.15,'clock');
  click('timeline.pause');await until(()=>useUIStore.getState().nativePreviewStatus==='ready','pause');const held=useProjectStore.getState().playheadPosition;
  await new Promise(resolve=>setTimeout(resolve,200));if(useProjectStore.getState().playheadPosition!==held)throw new Error('Paused GUI position advanced');
  click('timeline.play');await until(()=>useUIStore.getState().nativePreviewStatus==='playing','resume');
  const state=useProjectStore.getState();useProjectStore.setState({project:{...state.project,masterVolume:.25}});await new Promise(resolve=>setTimeout(resolve,150));if(!useProjectStore.getState().isPlaying||useUIStore.getState().nativePreviewStatus!=='playing')throw new Error('Fader stopped live GUI');
  useProjectStore.getState().setPlayheadPosition(1.5);await until(()=>useUIStore.getState().nativePreviewStatus==='playing'&&useProjectStore.getState().playheadPosition>=1.5,'seek');
  window.dispatchEvent(new Event('crispaudio-output-changed'));await until(()=>useUIStore.getState().nativePreviewStatus==='playing','device rebind');
  click('timeline.stop');await until(()=>!useProjectStore.getState().isPlaying&&useUIStore.getState().nativePreviewStatus==='idle','stop');
  click('timeline.play');await until(()=>useUIStore.getState().nativePreviewStatus==='rendering','prepare');click('timeline.pause');await until(()=>!useProjectStore.getState().isPlaying&&useUIStore.getState().nativePreviewStatus==='idle','cancel');
  if(errors.length)throw new Error(errors.join('\n'));
  return {language:'de',play:'passed',pause:'held',resume:'passed',fader:'continuous',seek:'passed',deviceRebind:'passed',stop:'passed',cancel:'passed',muted:true};
 }finally{root.unmount();host.remove();window.removeEventListener('crispaudio-edit-error',failed);await released();}
}
