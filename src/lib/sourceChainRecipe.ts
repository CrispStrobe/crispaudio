import type {TimelineProject} from '../types/audio';

export const SOURCE_CHAIN_KINDS=['highpass','lowpass','gain','clipper'] as const;
export type SourceChainKind=typeof SOURCE_CHAIN_KINDS[number];
export interface SourceChainStage {id:string;kind:SourceChainKind;enabled:boolean;value:number}
export interface SourceChainRecipe {version:1;stages:SourceChainStage[]}
export const SOURCE_CHAIN_MAX=6;
export function sourceChainBounds(kind:SourceChainKind){return kind==='highpass'?{min:20,max:2000,step:1,unit:'Hz'}:kind==='lowpass'?{min:200,max:20000,step:1,unit:'Hz'}:{min:-24,max:0,step:.1,unit:kind==='clipper'?'dBFS':'dB'};}
export function validSourceChain(value:unknown):value is SourceChainRecipe {
 if(!value||typeof value!=='object')return false;
 const recipe=value as SourceChainRecipe;
 return recipe.version===1&&Array.isArray(recipe.stages)&&recipe.stages.length>0&&recipe.stages.length<=SOURCE_CHAIN_MAX&&new Set(recipe.stages.map(s=>s?.id)).size===recipe.stages.length&&recipe.stages.every(s=>{
  if(!s||typeof s.id!=='string'||!s.id||s.id.length>64||!SOURCE_CHAIN_KINDS.includes(s.kind)||typeof s.enabled!=='boolean'||!Number.isFinite(s.value))return false;
  const b=sourceChainBounds(s.kind);return s.value>=b.min&&s.value<=b.max;
 });
}
export function sourceChainTopology(recipe:SourceChainRecipe|undefined){return recipe?JSON.stringify(recipe.stages.map(s=>[s.id,s.kind])):'legacy-filter';}
export function validProjectSourceChains(project:TimelineProject){
 return project.tracks.every(t=>[t.segments,t.compBaseSegments,t.freeze?.original?.segments].every(group=>group===undefined||Array.isArray(group)&&group.every(c=>!c?.sourceEdit||Array.isArray(c.sourceEdit.operations)&&c.sourceEdit.operations.every(op=>op&&(op.chain===undefined?op.type!=='chain':op.type==='chain'&&validSourceChain(op.chain))))));
}
