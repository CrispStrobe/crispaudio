import type {EffectConfig,TimelineTrack} from '../types/audio';
import {validMixVersion} from './mixVersions';
import {validRecording} from './recordingTakes';
import {useProjectStore} from '../stores/projectStore';

export interface TrackTemplate {id:string;name:string;settings:Pick<TimelineTrack,'volume'|'pan'|'effects'|'nativeEffects'|'recordingInput'|'waveformMode'>}
export const TEMPLATE_LIMIT=64;
/** Explicit allowlist: templates never inherit audio, routing, automation or record/monitor state. */
export function captureTrackTemplate(track:TimelineTrack,name:string,id=crypto.randomUUID()):TrackTemplate {
 const input=track.recordingInput;
 const result:TrackTemplate={id,name:name.trim(),settings:{volume:track.volume,pan:track.pan,waveformMode:track.waveformMode,
 effects:track.effects?.map(effect=>({type:effect.type,enabled:effect.enabled,params:{...effect.params}})),
 nativeEffects:track.nativeEffects?.map(effect=>({instanceId:crypto.randomUUID(),pluginId:effect.pluginId,name:effect.name,format:effect.format,enabled:effect.enabled,bypass:effect.bypass,parameters:{...effect.parameters},state:effect.state})),
 recordingInput:input?{deviceId:'',channel:input.channel,monitor:false,countIn:input.countIn,countInBars:input.countInBars,preRollBars:input.preRollBars,latencyMs:input.latencyMs}:undefined}};
 if(!validTrackTemplate(result))throw new Error('templates.invalid');return result;
}
export function validTrackTemplate(value:unknown):value is TrackTemplate {
 if(!value||typeof value!=='object')return false;
 const v=value as TrackTemplate,s=v.settings;
 if(typeof v.id!=='string'||!v.id||v.id.length>128||typeof v.name!=='string'||!v.name.trim()||v.name.length>80||!s||Object.keys(v).some(k=>!['id','name','settings'].includes(k))||Object.keys(s).some(k=>!['volume','pan','effects','nativeEffects','recordingInput','waveformMode'].includes(k)))return false;
 if(s.volume>100||s.waveformMode!==undefined&&!['normalized','level'].includes(s.waveformMode))return false;
 if(s.effects!==undefined&&!Array.isArray(s.effects)||s.nativeEffects!==undefined&&!Array.isArray(s.nativeEffects))return false;
 if(s.effects?.some(effect=>!effect||Object.keys(effect).some(k=>!['type','enabled','params'].includes(k))))return false;
 if(s.nativeEffects?.some(effect=>!effect||Object.keys(effect).some(k=>!['instanceId','pluginId','name','format','enabled','bypass','parameters','state'].includes(k))))return false;
 const input=s.recordingInput;
 if(input!==undefined&&(!input||typeof input!=='object'))return false;
 if(input&&(input.deviceId!==''||input.monitor!==false||Object.keys(input).some(k=>!['deviceId','channel','monitor','countIn','countInBars','preRollBars','latencyMs'].includes(k))))return false;
 const track={...s,id:'template',name:v.name,segments:[],muted:false,solo:false};
 return validMixVersion({signature:'template',masterEffects:[],tracks:[{id:'template',state:track,clips:[]}]})&&validRecording({id:'template',name:v.name,sampleRate:48000,masterEffects:[],duration:0,tracks:[track]});
}
export function trackFromTemplate(template:TrackTemplate):TimelineTrack {
 if(!validTrackTemplate(template))throw new Error('templates.invalid');
 const settings=structuredClone(template.settings);
 return {...settings,id:crypto.randomUUID(),name:template.name,segments:[],muted:false,solo:false,recordArmed:false,
 effects:settings.effects?.map(effect=>({...effect,instanceId:crypto.randomUUID()})),nativeEffects:settings.nativeEffects?.map(effect=>({...effect,instanceId:crypto.randomUUID()}))};
}
/** One store mutation, one undo entry. Never edits an existing track. */
export function insertTrackTemplate(template:TrackTemplate){
 const track=trackFromTemplate(template),state=useProjectStore.getState();
 useProjectStore.setState({project:{...state.project,tracks:[...state.project.tracks,track]},selection:{trackIds:[track.id],segmentIds:[],startTime:0,endTime:0}});
 return track.id;
}
const input={deviceId:'',channel:'mono' as const,monitor:false,countIn:0,latencyMs:0};
const make=(id:string,effects:EffectConfig[]=[],stereo=false):TrackTemplate=>({id,name:id,settings:{volume:1,pan:0,effects,recordingInput:{...input,channel:stereo?'stereo':'mono'}}});
export const builtInTrackTemplates=[make('voice',[{type:'highpass',enabled:true,params:{freq:80,q:.707}}]),make('mono'),make('stereo',[],true)];
