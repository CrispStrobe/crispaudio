import {NativeRenderedHarness} from './nativeRenderedHarness';
import {createRoot} from 'react-dom/client';
import {invoke} from '@tauri-apps/api/core';
import {NativePluginStream} from '../../src/audio/plugins/NativePluginStream';
import {useProjectStore} from '../../src/stores/projectStore';
import {useUIStore} from '../../src/stores/uiStore';
import i18n from '../../src/i18n';
import type {AudioSource} from '../../src/types/audio';
const failures:string[]=[];
async function until(check:()=>boolean,label='unknown'){const deadline=performance.now()+8000;while(!check()){if(performance.now()>deadline)throw new Error(`Rendered preview GUI ${label} timed out: ${useUIStore.getState().nativePreviewStatus}, playing=${useProjectStore.getState().isPlaying}, visibility=${document.visibilityState}, errors=${failures.join(' / ')}`);await new Promise(resolve=>setTimeout(resolve,20));}}
async function closed(){const deadline=performance.now()+12000;while(true){const counts=await invoke<{active:number;opening:number}>('native_validation_status');if(!counts.active&&!counts.opening)break;if(performance.now()>deadline)throw new Error('Preview GUI retained helpers');await new Promise(resolve=>setTimeout(resolve,30));}}
export async function nativeRenderedUI(plugin:string){
 const failed=(event:Event)=>failures.push(String(event instanceof ErrorEvent?event.message:(event as CustomEvent).detail));window.addEventListener('error',failed);window.addEventListener('crispaudio-edit-error',failed);
 await invoke('native_validation_window',{hidden:false});
 await i18n.changeLanguage('de');const buffer=new AudioBuffer({numberOfChannels:2,length:192000,sampleRate:48000});buffer.getChannelData(0)[60000]=1;
 const initial=useProjectStore.getInitialState().project;
 useProjectStore.setState({project:{...initial,id:'preview-gui',duration:4,minimumDuration:4,sampleRate:48000,nativeEffects:[{instanceId:'n',name:'ADelay',pluginId:plugin,format:'VST3',enabled:true,bypass:false,parameters:{'100':.002,'101':0},state:''}],tracks:[{id:'t',name:'Track',volume:1,pan:0,muted:false,solo:false,segments:[{id:'c',name:'Clip',color:'#4488cc',trackId:'t',sourceId:'s',startTime:0,sourceOffset:0,duration:4,gain:1,effects:[],fadeInDuration:0,fadeOutDuration:0,fadeInCurve:'linear',fadeOutCurve:'linear'}]}]},sources:new Map([['s',{id:'s',buffer} as AudioSource]]),isPlaying:false,playheadPosition:0,rangePlayback:false,loopEnabled:false});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let releaseOpen:(()=>void)|undefined;const originalOpen=NativePluginStream.open;let calls=0;const original=NativePluginStream.prototype.process;NativePluginStream.prototype.process=function(...args){calls++;return original.apply(this,args);};
 const click=(key:string)=>{const button=[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.getAttribute('aria-label')===i18n.t(key));if(!button)throw new Error(`Preview control missing: ${key}`);button.click();};
 try{
  root.render(<NativeRenderedHarness/>);await until(()=>!!host.querySelector('[data-native-preview]'),'mount');
  const record=[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.getAttribute('aria-label')===i18n.t('nativePreview.recording'));if(!record?.disabled)throw new Error('Native preview recording guard missing');
  click('nativePreview.render');await until(()=>useUIStore.getState().nativePreviewStatus==='playing','play');const renderedCalls=calls;
  await until(()=>useProjectStore.getState().playheadPosition>.1,'clock');click('timeline.pause');await until(()=>useUIStore.getState().nativePreviewStatus==='ready','pause');
  click('nativePreview.play');await until(()=>useUIStore.getState().nativePreviewStatus==='playing','play');if(calls!==renderedCalls)throw new Error('GUI pause rebuilt native preview');
  useProjectStore.getState().setPlayheadPosition(1);useProjectStore.getState().setLoopEnabled(true);
  useProjectStore.setState({project:{...useProjectStore.getState().project,masterVolume:.3}});await until(()=>!useProjectStore.getState().isPlaying&&useUIStore.getState().nativePreviewStatus==='idle');
  const gate=new Promise<void>(resolve=>{releaseOpen=resolve;});NativePluginStream.open=async(request,signal)=>{await gate;return originalOpen.call(NativePluginStream,request,signal);};
  click('nativePreview.render');await until(()=>useUIStore.getState().nativePreviewStatus==='rendering','render');click('nativePreview.cancel');await until(()=>!useProjectStore.getState().isPlaying&&useUIStore.getState().nativePreviewStatus==='idle');
  releaseOpen?.();NativePluginStream.open=originalOpen;
  return {language:'de',playhead:'advances',pauseCache:'reused',mixChange:'invalidated',cancel:'stopped',recording:'guarded'};
 }finally{window.removeEventListener('error',failed);window.removeEventListener('crispaudio-edit-error',failed);root.unmount();releaseOpen?.();NativePluginStream.open=originalOpen;host.remove();NativePluginStream.prototype.process=original;await closed();}
}
