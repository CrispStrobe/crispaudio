import {prepareSourcePluginRecall,prepareReplayedSourcePluginRecall,sourcePluginRecallSelection,sourceRecallEffect,SOURCE_PLUGIN_RECALL_BYTES,SOURCE_REPLAY_BASIC,type SourcePluginRecallPlan,type SourcePluginRecallSelection} from '../../lib/sourcePluginRecall';
import {processSource,type SourceOperation} from '../../lib/sourceEditing';
import {processSourceUtility,type SourceUtility} from '../../lib/sourceRepair';
import {renderSourcePluginPass} from '../engine/SourcePluginWaveform';
import type {PluginRecipe} from '../../types/audio';

/** Fresh original-based ordered replay. Never use a prior preview/output or a
 * helper's transient post-render state as input to a later editing pass. */
export async function renderSourcePluginRecall(plan:SourcePluginRecallPlan,recipe:PluginRecipe,selection:SourcePluginRecallSelection,signal:AbortSignal){
 const selected=sourcePluginRecallSelection(plan,selection);sourceRecallEffect(recipe);signal.throwIfAborted();
 if(recipe.id!==plan.recipe.id)throw new Error('sourceRecall.format');
 if(!plan.mixed){
  const result=await renderSourcePluginPass({...plan.input,effect:sourceRecallEffect(recipe)},signal,SOURCE_PLUGIN_RECALL_BYTES);signal.throwIfAborted();
  return prepareSourcePluginRecall(plan,result.pcm,{...recipe,latency:result.latency},selected);
 }
 let pcm:Float32Array[]=Array.from({length:plan.original.channels},(_,ch)=>plan.original.buffer.getChannelData(ch).subarray(plan.firstWindow.start,plan.firstWindow.start+plan.firstWindow.frames)),start=plan.firstWindow.start,edited=recipe;
 for(let index=0;index<plan.operations.length;index++){
  signal.throwIfAborted();const op=plan.operations[index],window=op.window!,crop=window.start-start;
  pcm=pcm.map(c=>c.subarray(crop,crop+window.frames));start=window.start;
  const mask=index===plan.operationIndex?selected:op;
  if(op.type==='plugin'){
   const saved=index===plan.operationIndex?recipe:op.plugin!,result=await renderSourcePluginPass({channels:pcm,sampleRate:plan.rate,effect:sourceRecallEffect(saved)},signal,SOURCE_PLUGIN_RECALL_BYTES);signal.throwIfAborted();
   if(result.pcm.length!==pcm.length||result.pcm.some(c=>c.length!==window.frames)||!Number.isFinite(result.latency)||result.latency<0||result.latency>10)throw new Error('sourceRecall.format');
   const next=pcm.map(c=>new Float32Array(c));for(let ch=0;ch<next.length;ch++){
    for(const value of result.pcm[ch])if(!Number.isFinite(value))throw new Error('sourceRecall.format');
    if(mask.channel<0||mask.channel===ch)for(const range of mask.ranges)next[ch].set(result.pcm[ch].subarray(range.start,range.end),range.start);
   }
   pcm=next;if(index===plan.operationIndex)edited={...recipe,latency:result.latency};
  }else pcm=SOURCE_REPLAY_BASIC.has(op.type)?processSource(pcm,op.ranges,op.type as SourceOperation,op.channel,op.targetDb,Math.round(plan.rate*.005)):processSourceUtility(pcm,op.ranges,op.type as SourceUtility,op.channel,plan.rate);
  // Bound a synchronous utility stage to the admitted 30-second window, and
  // yield between stages so close/project/recording cancellation can run.
  await new Promise(resolve=>setTimeout(resolve,0));signal.throwIfAborted();
 }
 return prepareReplayedSourcePluginRecall(plan,pcm,edited,selected);
}
