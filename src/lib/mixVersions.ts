import {frozenTrackChangeAllowed} from './frozenTrackState';
import {validNativeEffects} from './nativeEffects';
import {validDucking} from '../audio/dsp/ducking';
import type {TimelineProject,TimelineTrack,AudioSegment,EffectConfig} from '../types/audio';
import {validEffectAutomation} from './effectAutomation';
import {validAutomationCurve} from './mixAutomation';
import {validOutputLimiter} from '../audio/dsp/samplePeakLimiter';
import {routingOrder} from './audioRouting';
export type MixSlot='A'|'B';
const trackFields=['volume','pan','muted','solo','automation','panAutomation','effects','nativeEffects','output','sends','ducking','fadeInDuration','fadeOutDuration','fadeInCurve','fadeOutCurve'] as const;
const clipFields=['gain','effects','nativeEffects','fadeInDuration','fadeOutDuration','fadeInCurve','fadeOutCurve'] as const;
type TrackMix=Pick<TimelineTrack,typeof trackFields[number]>;
type ClipMix=Pick<AudioSegment,typeof clipFields[number]>;
export interface MixVersion {signature:string;masterEffects:EffectConfig[];nativeEffects?:TimelineProject['nativeEffects'];masterVolume?:number;outputLimiter?:TimelineProject['outputLimiter'];tracks:{id:string;state:TrackMix;clips:{id:string;state:ClipMix}[]}[]}
const pick=<T,K extends keyof T>(object:T,keys:readonly K[])=>Object.fromEntries(keys.map(k=>[k,object[k]])) as Pick<T,K>;
const applyFields=<T,K extends keyof T>(object:T,keys:readonly K[],values:Pick<T,K>)=>({...object,...Object.fromEntries(keys.map(k=>[k,structuredClone(values[k])]))});
/** Names/order/view edits are harmless; arrangement/source changes invalidate a comparison. */
export function mixSignature(project:TimelineProject){return JSON.stringify([project.id,project.sampleRate,project.tracks.map(t=>[t.id,t.kind??'audio',t.segments.map(c=>[c.id,c.sourceId,c.startTime,c.sourceOffset,c.duration,c.retime??null,c.midi??null]).sort((a,b)=>String(a[0])<String(b[0])?-1:String(a[0])>String(b[0])?1:0)]).sort((a,b)=>String(a[0])<String(b[0])?-1:String(a[0])>String(b[0])?1:0)]);}
export function captureMix(project:TimelineProject):MixVersion{return structuredClone({signature:mixSignature(project),masterEffects:project.masterEffects,nativeEffects:project.nativeEffects,masterVolume:project.masterVolume,outputLimiter:project.outputLimiter,tracks:project.tracks.map(t=>({id:t.id,state:pick(t,trackFields),clips:t.segments.map(c=>({id:c.id,state:pick(c,clipFields)}))}))});}
const finite=(n:unknown)=>typeof n==='number'&&Number.isFinite(n),positive=(n:unknown)=>finite(n)&&Number(n)>=0;
const curve=(points:unknown,min:number,max:number)=>points===undefined||Array.isArray(points)&&points.length<=100000&&points.every(p=>p&&finite(p.time)&&p.time>=0&&finite(p.value)&&p.value>=min&&p.value<=max&&validAutomationCurve(p));
const effectTypes=['distortion','chorus','delay','reverb','ringmod','bitcrush','lowpass','highpass','peaking','lowshelf','highshelf','compressor'];
const effects=(rack:unknown)=>rack===undefined||Array.isArray(rack)&&rack.length<=256&&rack.every(e=>e&&effectTypes.includes(e.type)&&typeof e.enabled==='boolean'&&e.params&&typeof e.params==='object'&&!Array.isArray(e.params)&&Object.values(e.params).every(finite)&&validEffectAutomation(e));
const fades=(state:Partial<TrackMix|ClipMix>)=>['fadeInDuration','fadeOutDuration'].every(k=>state[k as keyof typeof state]===undefined||positive(state[k as keyof typeof state]))&&['fadeInCurve','fadeOutCurve'].every(k=>state[k as keyof typeof state]===undefined||['linear','exponential','scurve'].includes(String(state[k as keyof typeof state])));
export function validMixVersion(v:MixVersion|undefined){
 if(!v||typeof v.signature!=='string'||v.signature.length>2000000||!Array.isArray(v.masterEffects)||!effects(v.masterEffects)||!validNativeEffects(v.nativeEffects)||v.masterVolume!==undefined&&!positive(v.masterVolume)||!validOutputLimiter(v.outputLimiter)||!Array.isArray(v.tracks)||v.tracks.length>10000||new Set(v.tracks.map(t=>t?.id)).size!==v.tracks.length)return false;
 return v.tracks.every(t=>t&&typeof t.id==='string'&&t.id&&t.state&&positive(t.state.volume)&&finite(t.state.pan)&&Math.abs(t.state.pan)<=1&&typeof t.state.muted==='boolean'&&typeof t.state.solo==='boolean'&&curve(t.state.automation,0,Infinity)&&curve(t.state.panAutomation,-1,1)&&effects(t.state.effects)&&validNativeEffects(t.state.nativeEffects)&&fades(t.state)&&(t.state.output===undefined||typeof t.state.output==='string')&&(t.state.ducking===undefined||validDucking(t.state.ducking))&&(t.state.sends===undefined||Array.isArray(t.state.sends)&&t.state.sends.every(s=>s&&typeof s.id==='string'&&typeof s.target==='string'&&positive(s.gain)&&s.gain<=4&&typeof s.preFader==='boolean'))&&Array.isArray(t.clips)&&new Set(t.clips.map(c=>c?.id)).size===t.clips.length&&t.clips.every(c=>c&&typeof c.id==='string'&&c.id&&c.state&&positive(c.state.gain)&&Array.isArray(c.state.effects)&&effects(c.state.effects)&&validNativeEffects(c.state.nativeEffects)&&fades(c.state)));
}
export function validMixVersions(project:TimelineProject){const versions=project.mixVersions;return versions===undefined||!!versions&&typeof versions==='object'&&!Array.isArray(versions)&&Object.keys(versions).every(k=>(k==='A'||k==='B')&&validMixVersion(versions[k]));}
/** Preview/application never changes clip geometry, names, folders or source references. */
export function mixProject(project:TimelineProject,version:MixVersion,protectLocks=true):TimelineProject{
 if(!validMixVersion(version)||version.signature!==mixSignature(project))throw new Error('mixReview.changed');
 const tracks=project.tracks.map(track=>{const saved=version.tracks.find(t=>t.id===track.id);if(!saved||saved.clips.length!==track.segments.length)throw new Error('mixReview.changed');const next=applyFields(track,trackFields,saved.state);next.segments=track.segments.map(clip=>{const c=saved.clips.find(c=>c.id===clip.id);if(!c)throw new Error('mixReview.changed');return applyFields(clip,clipFields,c.state);});if(protectLocks&&track.locked&&(track.freeze?!frozenTrackChangeAllowed(track,next):(JSON.stringify(pick(track,trackFields))!==JSON.stringify(pick(next,trackFields))||JSON.stringify(track.segments.map(c=>pick(c,clipFields)))!==JSON.stringify(next.segments.map(c=>pick(c,clipFields))))))throw new Error('mixReview.locked');return next;});
 routingOrder(tracks);
 const next={...project,tracks,masterEffects:structuredClone(version.masterEffects),nativeEffects:structuredClone(version.nativeEffects),masterVolume:version.masterVolume,outputLimiter:structuredClone(version.outputLimiter)};
 return JSON.stringify(captureMix(next))===JSON.stringify(captureMix(project))?project:next;
}
export function saveMixVersion(project:TimelineProject,slot:MixSlot){const version=captureMix(project);if(!validMixVersion(version))throw new Error('mixReview.invalid');if(JSON.stringify(project.mixVersions?.[slot])===JSON.stringify(version))return project;return {...project,mixVersions:{...project.mixVersions,[slot]:version}};}
