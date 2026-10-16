import {NativeParameterAutomation} from './NativeParameterAutomation';
import {useProjectGesture} from '../../hooks/useProjectGesture';
import {useSettingsStore} from '../../stores/settingsStore';
import {isNativeMac} from '../../lib/nativeMenuPlatform';
import {create} from 'zustand';
import {NativePluginPicker} from './NativePluginPicker';
import {useEffect,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Power,Trash2,ArrowUp,ArrowDown,CircleSlash,SlidersHorizontal,Copy,ClipboardPaste,Activity} from 'lucide-react';
import {useProjectStore} from '../../stores/projectStore';
import {useUIStore} from '../../stores/uiStore';
import {nativeEffectScopes} from '../../lib/nativeEffects';
import {mediaJob} from '../../lib/mediaJob';
import {isTauri,isIOSApp} from '../../lib/native';
import type {NativeEffect} from '../../types/audio';
import {ToolButton} from '../common/ToolButton';
import {InfoButton} from '../common/InfoButton';
import {ParamSlider} from '../shared/ParamSlider';
const useNativeClipboard=create<{effects:NativeEffect[]|null}>(()=>({effects:null}));
interface Parameter {address:string;name:string;min:number;max:number;value:number;unit:string}
function NativeRow({scope,effect,index,count,disabled,controlsDisabled,update,move,remove}:{scope:string;effect:NativeEffect;index:number;count:number;disabled:boolean;controlsDisabled:boolean;update:(patch:Partial<NativeEffect>)=>void;move:(direction:number)=>void;remove:()=>void}){
 const gesture=useProjectGesture();
 const [automation,setAutomation]=useState<{snapshot:ReturnType<typeof useProjectStore.getState>['project'];parameter:Parameter}>();
 const {t}=useTranslation(),[expanded,setExpanded]=useState(false),[result,setResult]=useState<{id:string;state:string;parameters:Parameter[];error:string}>();
 const supported=isTauri()&&!isIOSApp()&&navigator.userAgent.includes('Mac'),info=result?.id===effect.pluginId&&result.state===effect.state?result:undefined,parameters=info?.parameters??[],error=supported?info?.error??'':t('nativeRack.macOnly'),busy=expanded&&supported&&!info;
 useEffect(()=>{if(!expanded||!supported)return;const controller=new AbortController();
  void mediaJob<{parameters:Parameter[]}>('audio_unit_plugin',{operation:'plugin-info',request:{id:effect.pluginId,state:effect.state}},controller.signal).then(info=>{if(!controller.signal.aborted)setResult({id:effect.pluginId,state:effect.state,parameters:info.parameters,error:''});}).catch(reason=>{if(!controller.signal.aborted)setResult({id:effect.pluginId,state:effect.state,parameters:[],error:String(reason)});});return ()=>controller.abort();
 },[expanded,effect.pluginId,effect.state,supported]);
 return <div className="border border-gray-700 rounded p-1 space-y-2" data-native-insert={effect.instanceId}>
  <div className="flex items-center gap-1 flex-wrap"><span className="text-xs text-gray-400">{effect.format}</span><button type="button" className="min-h-11 min-w-0 flex-1 truncate text-left px-1" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)} title={effect.name}>{effect.name}</button><ToolButton icon={SlidersHorizontal} label={t('sourcePlugins.parameters')} aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}/></div>
  <fieldset disabled={disabled} className="flex flex-wrap gap-1"><ToolButton icon={Power} label={t(effect.enabled?'timeline.disableEffect':'timeline.enableEffect')} aria-pressed={effect.enabled} className={effect.enabled?'text-green-300':''} onClick={()=>update({enabled:!effect.enabled})}/></fieldset><fieldset disabled={controlsDisabled} className="flex gap-1"><ToolButton icon={CircleSlash} label={t('sourcePlugins.bypass')} aria-pressed={effect.bypass} className={effect.bypass?'text-amber-300':''} onClick={()=>update({bypass:!effect.bypass})}/></fieldset><fieldset disabled={disabled} className="flex gap-1"><ToolButton icon={ArrowUp} label={t('rack.moveUp')} disabled={index===0} onClick={()=>move(-1)}/><ToolButton icon={ArrowDown} label={t('rack.moveDown')} disabled={index===count-1} onClick={()=>move(1)}/><ToolButton icon={Trash2} label={t('timeline.removeEffect')} onClick={remove}/></fieldset>
  {expanded&&<div className="space-y-2 px-1">{busy&&<p role="status">{t('sourcePlugins.processing')}</p>}{error&&<p role="alert" className="text-sm text-amber-300 break-words">{error}</p>}<fieldset disabled={controlsDisabled} className="space-y-2">{parameters.map(parameter=><div key={parameter.address} className="flex items-center gap-1"><div className="flex-1 min-w-0"><ParamSlider disabled={!!effect.parameterAutomation?.[parameter.address]?.points.length} label={parameter.name} value={effect.parameters[parameter.address]??parameter.value} min={parameter.min} max={parameter.max} step={(parameter.max-parameter.min)/1000||1} unit={parameter.unit} liveNumber onInteractionStart={gesture.begin} onInteractionEnd={gesture.end} onChange={value=>update({parameters:{...effect.parameters,[parameter.address]:value}})}/></div><ToolButton icon={Activity} label={`${t('nativeRack.automation')} · ${parameter.name}`} aria-pressed={!!effect.parameterAutomation?.[parameter.address]?.points.length} disabled={!Number.isFinite(parameter.max-parameter.min)||parameter.max<=parameter.min} onClick={()=>setAutomation({snapshot:useProjectStore.getState().project,parameter})}/></div>)}</fieldset></div>}
  {automation&&<NativeParameterAutomation snapshot={automation.snapshot} scope={scope} target={{instanceId:effect.instanceId,address:automation.parameter.address,min:automation.parameter.min,max:automation.parameter.max}} name={automation.parameter.name} unit={automation.parameter.unit} defaultValue={automation.parameter.value} onClose={()=>setAutomation(undefined)}/>}
 </div>;
}
/** Structural edits wait for Stop; live parameter and bypass changes keep DSP running. */
export function NativeEffectRack({scope,pickerOpen=false,onPickerClose=()=>{}}:{scope:string;pickerOpen?:boolean;onPickerClose?:()=>void}){
 const {t}=useTranslation(),project=useProjectStore(state=>state.project),playing=useProjectStore(state=>state.isPlaying),recording=useUIStore(state=>state.timelineRecording),[error,setError]=useState('');
 const live=useSettingsStore(state=>state.nativePlaybackMode)==='live'&&isNativeMac();
 const clipboard=useNativeClipboard(state=>state.effects);
 const scopes=nativeEffectScopes(project);
 const effects=scopes.find(([key])=>key===scope)?.[1]??[],track=project.tracks.find(track=>scope===`track:${track.id}`||track.segments.some(clip=>scope===`clip:${clip.id}`));
 if(!scopes.some(([key])=>key===scope)||!effects.length&&!pickerOpen&&!clipboard)return null;const disabled=playing||recording||!!track?.locked;
 const change=(next:NativeEffect[])=>{try{useProjectStore.getState().setNativeEffects(scope,next);setError('');}catch(reason){setError(String(reason));}};
 return <section aria-label={t('nativeRack.title')} className="space-y-2 border-t border-gray-700 pt-2"><div className="flex items-center justify-between"><span className="text-sm">{t('nativeRack.title')} · {effects.length}</span><ToolButton icon={Copy} label={t('nativeRack.copy')} disabled={disabled||!effects.length} onClick={()=>useNativeClipboard.setState({effects:structuredClone(effects)})}/><ToolButton icon={ClipboardPaste} label={t('nativeRack.paste')} disabled={disabled||!clipboard} onClick={()=>{if(clipboard)change(clipboard.map(effect=>({...structuredClone(effect),instanceId:crypto.randomUUID()})));}}/><InfoButton label={t('nativeRack.title')}><p>{t('nativeRack.help')}</p></InfoButton></div>{pickerOpen&&<NativePluginPicker key={scope} scope={scope} disabled={disabled} onClose={onPickerClose}/ >}{effects.map((effect,index)=><NativeRow scope={scope} key={effect.instanceId} effect={effect} index={index} count={effects.length} disabled={disabled} controlsDisabled={recording||!!track?.locked||playing&&!live} update={patch=>change(effects.map((entry,i)=>i===index?{...entry,...patch}:entry))} remove={()=>change(effects.filter((_,i)=>i!==index))} move={direction=>{const next=[...effects],target=index+direction;[next[index],next[target]]=[next[target],next[index]];change(next);}}/>)}{error&&<p role="alert" className="text-sm text-amber-300">{error}</p>}</section>;
}
