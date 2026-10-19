import type {AudioSource,PluginRecipe,TimelineProject,SourceEditOperation,NativeEffect} from '../types/audio';
import {sourcePluginWaveformPlan} from '../audio/engine/SourcePluginWaveform';
import type {NativeSourceInput} from '../audio/engine/NativeSourceAudition';
import {sampleRanges,type SampleRange} from './sourceEditing';
import {validateSourceJournalClipAudio} from './sourceEditJournal';
import {validNativeEffects} from './nativeEffects';

export const SOURCE_PLUGIN_RECALL_BYTES=256*1024*1024;
export const SOURCE_REPLAY_BASIC=new Set<string>(['normalize','silence','dc','fade']);
export const SOURCE_REPLAY_UTILITIES=new Set<string>(['invert','swap','mono','leftToRight','rightToLeft']);
export interface RecallState {project:TimelineProject;sources:Map<string,AudioSource>;isPlaying:boolean}
function fail(key:string):never{throw new Error(`sourceRecall.${key}`);}
export function sourceRecallEffect(recipe:PluginRecipe):NativeEffect{
 if(!recipe||typeof recipe.id!=='string'||!recipe.parameters||typeof recipe.parameters!=='object'||Array.isArray(recipe.parameters))fail('format');
 const effect:NativeEffect={instanceId:'source-recall',pluginId:recipe.id,name:recipe.name,format:recipe.id.startsWith('vst3:')?'VST3':'AU',enabled:true,bypass:false,parameters:{...recipe.parameters},state:recipe.state};
 if(!validNativeEffects([effect])||!Number.isFinite(recipe.latency)||recipe.latency<0||recipe.latency>10)fail('format');return effect;
}
function validReplayOperation(op:SourceEditOperation,channels:number){
 if(op.type==='plugin'){if(op.chain||op.parameters)fail('unsupported');sourceRecallEffect(op.plugin!);return;}
 if(!SOURCE_REPLAY_BASIC.has(op.type)&&!SOURCE_REPLAY_UTILITIES.has(op.type)||op.plugin||op.chain||op.parameters&&Object.keys(op.parameters).length)fail('unsupported');
 if(!Number.isFinite(op.targetDb)||op.targetDb< -60||op.targetDb>0)fail('format');
 if(SOURCE_REPLAY_UTILITIES.has(op.type)&&op.type!=='invert'&&(channels!==2||op.channel!==-1))fail('format');
}
/** Each operation processes its entire saved window before the next crop.
 * Display/audition use the final derivative; mask fields use the chosen window. */
export function sourcePluginRecallPlan(snapshot:RecallState,clipId:string,operationIndex?:number){
 const track=snapshot.project.tracks.find(t=>t.segments.some(c=>c.id===clipId)),clip=track?.segments.find(c=>c.id===clipId),edit=clip?.sourceEdit;
 if(!clip||!edit||track?.locked)fail('changed');
 if(!Array.isArray(edit.operations)||!edit.operations.length)fail('mixed');
 const mixed=edit.operations.length>1;
 if(mixed&&!edit.journal)fail('mixed');
 if(clip.retime||edit.retime)fail('retimed');
 const source=snapshot.sources.get(clip.sourceId),original=snapshot.sources.get(edit.sourceId);
 if(!source||!original||source.id===original.id)fail('missing');
 try{validateSourceJournalClipAudio(clip,snapshot.sources);}catch{fail('format');}
 const choices=edit.operations.flatMap((op,index)=>op.type==='plugin'&&op.plugin?[{index,name:op.plugin.name}]:[]);
 const index=operationIndex??choices.at(-1)?.index;
 if(index===undefined||!Number.isInteger(index)||!choices.some(c=>c.index===index))fail('mixed');
 const rate=original.sampleRate,outputFrames=source.buffer.length,finalStart=Math.round(edit.offset*rate),visibleStart=Math.round(clip.sourceOffset*rate),visibleEnd=visibleStart+Math.round(clip.duration*rate),op=edit.operations[index],recipe=op.plugin!;
 if(![44100,48000].includes(rate)||source.sampleRate!==rate||source.buffer.sampleRate!==rate||original.buffer.sampleRate!==rate||source.buffer.numberOfChannels!==original.buffer.numberOfChannels||source.channels!==source.buffer.numberOfChannels||original.channels!==original.buffer.numberOfChannels||![1,2].includes(source.channels))fail('format');
 if(!Number.isFinite(edit.offset)||edit.offset<0||finalStart<0||finalStart+outputFrames>original.buffer.length||!Number.isFinite(clip.sourceOffset)||clip.sourceOffset<0||!Number.isFinite(clip.duration)||clip.duration<=0||visibleStart<0||visibleEnd<=visibleStart||visibleEnd>outputFrames)fail('bounds');
 const targetWindow=edit.journal?op.window!:{start:finalStart,frames:outputFrames},firstWindow=edit.journal?edit.operations[0].window!:targetWindow,frames=targetWindow.frames;
 if(!Number.isInteger(op.channel)||op.channel< -1||op.channel>=source.channels||!Array.isArray(op.ranges)||!op.ranges.length||op.ranges.length>64||op.ranges.some(r=>!Number.isInteger(r.start)||!Number.isInteger(r.end)||r.start<0||r.end<=r.start||r.end>frames))fail('bounds');
 if(mixed){
  if(edit.operations.length>8||firstWindow.frames/rate>30||firstWindow.frames*source.channels*4*(edit.operations.length+8)+rate*source.channels*4*20+65536>SOURCE_PLUGIN_RECALL_BYTES)fail('replayLimited');
  edit.operations.forEach(operation=>validReplayOperation(operation,source.channels));
 }
 const effect=sourceRecallEffect(recipe),input:NativeSourceInput={channels:Array.from({length:original.channels},(_,ch)=>original.buffer.getChannelData(ch).subarray(targetWindow.start,targetWindow.start+frames)),sampleRate:rate,effect};
 try{sourcePluginWaveformPlan(input,SOURCE_PLUGIN_RECALL_BYTES);}catch{fail('limited');}
 const displayInput=Array.from({length:original.channels},(_,ch)=>original.buffer.getChannelData(ch).subarray(finalStart,finalStart+outputFrames));
 return {snapshot,track:track!,clip,source,original,input,displayInput,recipe:structuredClone(recipe),operation:structuredClone(op),operations:structuredClone(edit.operations),operationIndex:index,choices,mixed,targetWindow:{...targetWindow},firstWindow:{...firstWindow},outputStart:finalStart,outputFrames,selectionVisible:{start:finalStart+visibleStart-targetWindow.start,end:finalStart+visibleEnd-targetWindow.start},visible:{start:visibleStart,end:visibleEnd},frames,rate};
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
 if(plan.mixed)fail('format');
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
export interface PreparedSourcePluginRecall {pcm:Float32Array[];recipe:PluginRecipe;selection:SourcePluginRecallSelection}
/** Pure one-publication replacement; other clips keep referencing the old source. */
export function sourcePluginRecallCommit(plan:SourcePluginRecallPlan,prepared:PreparedSourcePluginRecall,source:AudioSource,current:RecallState){
 assertSourcePluginRecallCurrent(plan,current);
 if(current.sources.has(source.id)||source.buffer.length!==plan.outputFrames||source.sampleRate!==plan.rate||source.buffer.numberOfChannels!==plan.input.channels.length)fail('format');
 const sources=new Map(current.sources);sources.set(source.id,source);
 const project={...current.project,tracks:current.project.tracks.map(track=>track.id!==plan.track.id?track:{...track,segments:track.segments.map(clip=>clip.id!==plan.clip.id?clip:{...clip,sourceId:source.id,sourceEdit:{...clip.sourceEdit!,operations:plan.operations.map((op,index)=>index!==plan.operationIndex?op:{...op,...sourcePluginRecallSelection(plan,prepared.selection),plugin:prepared.recipe})}})})};
 return {project,sources,isPlaying:false};
}

/** Final replay PCM already contains all operations, not only the selected mask. */
export function prepareReplayedSourcePluginRecall(plan:SourcePluginRecallPlan,pcm:Float32Array[],recipe:PluginRecipe,selection:SourcePluginRecallSelection){
 sourceRecallEffect(recipe);if(recipe.id!==plan.recipe.id||pcm.length!==plan.input.channels.length||pcm.some(c=>c.length!==plan.outputFrames))fail('format');
 for(const channel of pcm)for(const value of channel)if(!Number.isFinite(value))fail('format');
 return {pcm,recipe:structuredClone(recipe),selection:sourcePluginRecallSelection(plan,selection)};
}
