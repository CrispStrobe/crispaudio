import type {AudioSource,PluginRecipe,TimelineProject} from '../types/audio';
import {sourcePluginWaveformPlan} from '../audio/engine/SourcePluginWaveform';
import type {NativeSourceInput} from '../audio/engine/NativeSourceAudition';
import {sampleRanges,type SampleRange} from './sourceEditing';
import {validateSourceJournalClipAudio} from './sourceEditJournal';
import {validNativeEffects} from './nativeEffects';

export const SOURCE_PLUGIN_RECALL_BYTES=256*1024*1024;
export interface RecallState {project:TimelineProject;sources:Map<string,AudioSource>;isPlaying:boolean}
function fail(key:string):never{throw new Error(`sourceRecall.${key}`);}
/** Keep the complete derived-source window, even for a trimmed/split clip. Its
 * saved ranges and original offset refer to that window, including FX history. */
export function sourcePluginRecallPlan(snapshot:RecallState,clipId:string){
 const track=snapshot.project.tracks.find(t=>t.segments.some(c=>c.id===clipId)),clip=track?.segments.find(c=>c.id===clipId),edit=clip?.sourceEdit;
 if(!clip||!edit||track?.locked)fail('changed');
 if(!Array.isArray(edit.operations)||edit.operations.length!==1||edit.operations[0].type!=='plugin'||!edit.operations[0].plugin)fail('mixed');
 if(clip.retime||edit.retime)fail('retimed');
 const source=snapshot.sources.get(clip.sourceId),original=snapshot.sources.get(edit.sourceId);
 if(!source||!original||source.id===original.id)fail('missing');
 try{validateSourceJournalClipAudio(clip,snapshot.sources);}catch{fail('format');}
 const rate=original.sampleRate,frames=source.buffer.length,start=Math.round(edit.offset*rate),visibleStart=Math.round(clip.sourceOffset*rate),visibleEnd=visibleStart+Math.round(clip.duration*rate),op=edit.operations[0],recipe=op.plugin!;
 if(![44100,48000].includes(rate)||source.sampleRate!==rate||source.buffer.sampleRate!==rate||original.buffer.sampleRate!==rate||source.buffer.numberOfChannels!==original.buffer.numberOfChannels||source.channels!==source.buffer.numberOfChannels||original.channels!==original.buffer.numberOfChannels||![1,2].includes(source.channels))fail('format');
 if(!Number.isFinite(edit.offset)||edit.offset<0||start<0||start+frames>original.buffer.length||!Number.isFinite(clip.sourceOffset)||clip.sourceOffset<0||!Number.isFinite(clip.duration)||clip.duration<=0||visibleStart<0||visibleEnd<=visibleStart||visibleEnd>frames)fail('bounds');
 if(!Number.isInteger(op.channel)||op.channel< -1||op.channel>=source.channels||!Array.isArray(op.ranges)||!op.ranges.length||op.ranges.length>64||op.ranges.some(r=>!Number.isInteger(r.start)||!Number.isInteger(r.end)||r.start<0||r.end<=r.start||r.end>frames))fail('bounds');
 if(typeof recipe.id!=='string'||!recipe.parameters||typeof recipe.parameters!=='object'||Array.isArray(recipe.parameters))fail('format');
 const effect={instanceId:'source-recall',pluginId:recipe.id,name:recipe.name,format:recipe.id.startsWith('vst3:')?'VST3' as const:'AU' as const,enabled:true,bypass:false,parameters:{...recipe.parameters},state:recipe.state};
 if(!validNativeEffects([effect])||!Number.isFinite(recipe.latency)||recipe.latency<0||recipe.latency>10)fail('format');
 const input:NativeSourceInput={channels:Array.from({length:original.channels},(_,ch)=>original.buffer.getChannelData(ch).subarray(start,start+frames)),sampleRate:rate,effect};
 try{sourcePluginWaveformPlan(input,SOURCE_PLUGIN_RECALL_BYTES);}catch{fail('limited');}
 return {snapshot,track:track!,clip,source,original,input,recipe:structuredClone(recipe),operation:structuredClone(op),visible:{start:visibleStart,end:visibleEnd},frames,rate};
}
export type SourcePluginRecallPlan=ReturnType<typeof sourcePluginRecallPlan>;
export function assertSourcePluginRecallCurrent(plan:SourcePluginRecallPlan,current:RecallState){
 if(current.project!==plan.snapshot.project||current.sources!==plan.snapshot.sources||current.isPlaying||current.sources.get(plan.source.id)?.buffer!==plan.source.buffer||current.sources.get(plan.original.id)?.buffer!==plan.original.buffer)fail('changed');
}
export interface SourcePluginRecallSelection {channel:number;ranges:SampleRange[]}
/** Strict admission before canonicalizing overlaps; never silently clamp a bad edit. */
export function sourcePluginRecallSelection(plan:SourcePluginRecallPlan,selection:SourcePluginRecallSelection):SourcePluginRecallSelection{
 if(!Number.isInteger(selection.channel)||selection.channel< -1||selection.channel>=plan.input.channels.length||!Array.isArray(selection.ranges)||!selection.ranges.length||selection.ranges.length>64||selection.ranges.some(r=>!Number.isInteger(r.start)||!Number.isInteger(r.end)||r.start<0||r.end<=r.start||r.end>plan.frames))fail('bounds');
 return {channel:selection.channel,ranges:sampleRanges(selection.ranges,plan.frames)};
}
/** Replace the original saved operation, never append it to processed PCM. */
export function prepareSourcePluginRecall(plan:SourcePluginRecallPlan,processed:Float32Array[],recipe:PluginRecipe,selection:SourcePluginRecallSelection=plan.operation){
 const selected=sourcePluginRecallSelection(plan,selection);
 if(processed.length!==plan.input.channels.length||processed.some(c=>c.length!==plan.frames)||recipe.id!==plan.recipe.id||!Number.isFinite(recipe.latency)||recipe.latency<0||recipe.latency>10||!validNativeEffects([{...plan.input.effect,parameters:recipe.parameters,state:recipe.state}]))fail('format');
 const pcm=plan.input.channels.map(c=>new Float32Array(c));
 for(let ch=0;ch<pcm.length;ch++){
  for(const value of processed[ch])if(!Number.isFinite(value))fail('format');
  if(selected.channel>=0&&selected.channel!==ch)continue;
  for(const range of selected.ranges)pcm[ch].set(processed[ch].subarray(range.start,range.end),range.start);
 }
 return {pcm,recipe:structuredClone(recipe),selection:selected};
}
export type PreparedSourcePluginRecall=ReturnType<typeof prepareSourcePluginRecall>;
/** Pure one-publication replacement; other clips keep referencing the old source. */
export function sourcePluginRecallCommit(plan:SourcePluginRecallPlan,prepared:PreparedSourcePluginRecall,source:AudioSource,current:RecallState){
 assertSourcePluginRecallCurrent(plan,current);
 if(current.sources.has(source.id)||source.buffer.length!==plan.frames||source.sampleRate!==plan.rate||source.buffer.numberOfChannels!==plan.input.channels.length)fail('format');
 const sources=new Map(current.sources);sources.set(source.id,source);
 const project={...current.project,tracks:current.project.tracks.map(track=>track.id!==plan.track.id?track:{...track,segments:track.segments.map(clip=>clip.id!==plan.clip.id?clip:{...clip,sourceId:source.id,sourceEdit:{...clip.sourceEdit!,operations:[{...plan.operation,...sourcePluginRecallSelection(plan,prepared.selection),plugin:prepared.recipe}]}})})};
 return {project,sources,isPlaying:false};
}
