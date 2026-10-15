import type {NativeEffect,TimelineProject} from '../types/audio';
import type {NativeTimelineRacks} from '../audio/plugins/NativeTimelineGraph';
/** Stored rack data has no audio clock or process mode; these come from the renderer. */
export function validNativeEffects(value:unknown):value is NativeEffect[]|undefined {
 if(value===undefined)return true;
 if(!Array.isArray(value)||value.length>8)return false;
 const ids=new Set<string>();
 return value.every(effect=>{
  if(!effect||typeof effect.instanceId!=='string'||!effect.instanceId||effect.instanceId.length>128||ids.has(effect.instanceId))return false;ids.add(effect.instanceId);
  if(typeof effect.pluginId!=='string'||!effect.pluginId||effect.pluginId.length>4096||typeof effect.name!=='string'||!effect.name||effect.name.length>256||!['AU','VST3'].includes(effect.format)||(effect.format==='VST3')!==effect.pluginId.startsWith('vst3:')||typeof effect.enabled!=='boolean'||typeof effect.bypass!=='boolean'||typeof effect.state!=='string'||effect.state.length>1048576)return false;
  const parameters=effect.parameters;if(!parameters||typeof parameters!=='object'||Array.isArray(parameters)||Object.values(parameters).some(value=>typeof value!=='number'||!Number.isFinite(value)))return false;
  return new TextEncoder().encode(JSON.stringify(parameters)).length+3*Object.keys(parameters).length+512<=8192;
 });
}
export function nativeEffectScopes(project:TimelineProject):[string,NativeEffect[]|undefined][]{return [['master',project.nativeEffects],...project.tracks.flatMap(track=>[[`track:${track.id}`,track.nativeEffects] as [string,NativeEffect[]|undefined],...(track.segments??[]).map(clip=>[`clip:${clip.id}`,clip.nativeEffects] as [string,NativeEffect[]|undefined])])];}
export function validProjectNativeEffects(project:TimelineProject){return nativeEffectScopes(project).every(([,effects])=>validNativeEffects(effects))&&project.tracks.every(track=>track.compBaseSegments?.every(clip=>validNativeEffects(clip.nativeEffects))??true);}
export function hasNativeEffects(project:TimelineProject){return nativeEffectScopes(project).some(([,effects])=>effects?.some(effect=>effect.enabled));}
export function hasStoredNativeEffects(project:TimelineProject){return nativeEffectScopes(project).some(([,effects])=>!!effects?.length)||project.tracks.some(track=>track.compBaseSegments?.some(clip=>clip.nativeEffects?.length))||Object.values(project.mixVersions??{}).some(version=>version&&(version.nativeEffects?.length||version.tracks.some(track=>track.state.nativeEffects?.length||track.clips.some(clip=>clip.state.nativeEffects?.length))));}
export function projectNativeRacks(project:TimelineProject,sampleRate=project.sampleRate):NativeTimelineRacks {
 if(!validProjectNativeEffects(project))throw new Error('Invalid native effect rack');
 return new Map(nativeEffectScopes(project).flatMap(([scope,effects])=>{const entries=(effects??[]).filter(effect=>effect.enabled).map(effect=>({instanceId:effect.instanceId,id:effect.pluginId,sampleRate,channels:2 as const,parameters:{...effect.parameters},state:effect.state,bypass:effect.bypass}));return entries.length?[[scope,entries] as const]:[];}));
}
/** Apply a captured state only to the same active instances, without changing disabled inserts. */
export function applyNativeRackSnapshots(project:TimelineProject,snapshots:NativeTimelineRacks):TimelineProject {
 const expected=projectNativeRacks(project);if(expected.size!==snapshots.size||[...expected].some(([scope,entries])=>{const saved=snapshots.get(scope);return !saved||saved.length!==entries.length||entries.some((entry,index)=>saved[index].id!==entry.id||saved[index].instanceId!==entry.instanceId);}))throw new Error('Native rack changed while querying state');
 const next=structuredClone(project);
 for(const [scope,effects] of nativeEffectScopes(next)){let index=0;for(const effect of effects??[]){if(!effect.enabled)continue;const saved=snapshots.get(scope)![index++];if(typeof saved.state!=='string')throw new Error('Native plugin state unavailable');effect.state=saved.state;effect.parameters={...saved.parameters};effect.bypass=saved.bypass??false;}}
 if(!validProjectNativeEffects(next))throw new Error('Invalid native effect rack');return next;
}
export function replaceNativeEffects(project:TimelineProject,scope:string,effects:NativeEffect[]):TimelineProject {
 if(!validNativeEffects(effects))throw new Error('Invalid native effect rack');const copy=structuredClone(effects);
 if(scope==='master')return {...project,nativeEffects:copy};
 let found=false;const tracks=project.tracks.map(track=>{if(scope===`track:${track.id}`){found=true;if(track.locked)throw new Error('Track is locked');return {...track,nativeEffects:copy};}const segments=track.segments.map(clip=>{if(scope!==`clip:${clip.id}`)return clip;found=true;if(track.locked)throw new Error('Track is locked');return {...clip,nativeEffects:copy};});return segments.some((clip,index)=>clip!==track.segments[index])?{...track,segments}:track;});
 if(!found)throw new Error('Unknown native rack scope');return {...project,tracks};
}
