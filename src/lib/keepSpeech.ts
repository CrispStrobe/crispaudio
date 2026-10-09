import type { TimelineProject, TranscriptWord } from '../types/audio';
import { timelineDuration } from './timelineView';
import { editTimeRange } from './rangeEdits';
import { speechLayout, spokenCutRange } from './spokenEdits';

// Original implementation for deletion-only edits: no embedding model or fuzzy substitution.
export function speechTokens(text:string):string[]{
  return (text.normalize('NFKC').toLowerCase().replaceAll('’',"'").match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu)??[]);
}
export interface KeepRange {start:number;end:number;text:string}
export interface KeepOptions {choice?:'earliest'|'latest';occurrences?:Record<number,number>}
export interface KeepPlan {
  wordIds:string[]; ranges:KeepRange[]; removed:{start:number;end:number}[];
  keptWords:number; deletedWords:number; duration:number;
  ambiguous:boolean; ambiguity?:{token:number;text:string;candidates:{index:number;start:number;text:string}[];more:boolean};
}
const fail=(key:string):never=>{throw new Error(`keepSpeech.${key}`);};
function timedWords(project:TimelineProject):TranscriptWord[]{
  if(project.transcriptLayout&&JSON.stringify(project.transcriptLayout)!==JSON.stringify(speechLayout(project)))throw new Error('spoken.stale');
  if(!project.transcript?.length||project.transcript.some(c=>!c.words?.length))fail('untimed');
  const words=project.transcript!.flatMap(c=>c.words!);
  if(new Set(words.map(w=>w.id)).size!==words.length||words.some((w,i)=>!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<0||w.end<=w.start||w.end>timelineDuration(project)+1e-6||(i>0&&w.start<words[i-1].start)))fail('untimed');
  return words;
}
/** Word IDs already reviewed by the user; preserve contiguous passages and natural pauses. */
export function planKeptWords(project:TimelineProject,wordIds:string[],reviewOnly=false):Omit<KeepPlan,'ambiguous'> {
  const words=timedWords(project),ids=new Set(wordIds);
  if(project.video&&(!Number.isFinite(project.frameRate??25)||(project.frameRate??25)<=0))fail('untimed');
  const allIds=new Set(words.map(w=>w.id));
  if(!ids.size||ids.size!==wordIds.length||wordIds.some(id=>!allIds.has(id)))fail('empty');
  const ranges:KeepRange[]=[];
  for(let i=0;i<words.length;i++){
    if(!ids.has(words[i].id))continue;
    const first=i;while(i+1<words.length&&ids.has(words[i+1].id))i++;
    const bounds=spokenCutRange(project,{start:words[first].start,end:words[i].end});
    ranges.push({...bounds,start:Math.max(0,bounds.start),end:Math.min(timelineDuration(project),bounds.end),text:words.slice(first,i+1).map(w=>w.text.trim()).join(' ')});
  }
  // Frame padding must never silently retain a deleted word, or overlapping speech.
  const merged:KeepRange[]=[];
  for(const range of ranges){const previous=merged.at(-1);if(previous&&range.start<=previous.end+1e-7){previous.end=Math.max(previous.end,range.end);previous.text+=' '+range.text;}else merged.push({...range});}
  let at=0;for(const word of words){while(at<merged.length&&merged[at].end<=word.start+1e-6)at++;if(!reviewOnly&&!ids.has(word.id)&&at<merged.length&&word.start<merged[at].end-1e-6&&word.end>merged[at].start+1e-6)fail('neighbour');}
  const removed:{start:number;end:number}[]=[];let cursor=0;
  for(const range of merged){if(range.start>cursor+1e-7)removed.push({start:cursor,end:range.start});cursor=range.end;}
  const duration=timelineDuration(project);if(cursor<duration-1e-7)removed.push({start:cursor,end:duration});
  if(removed.length>2000)fail('tooManyCuts');
  return {wordIds:words.filter(w=>ids.has(w.id)).map(w=>w.id),ranges:merged,removed,keptWords:ids.size,deletedWords:words.length-ids.size,duration:merged.reduce((sum,r)=>sum+r.end-r.start,0)};
}
/** Linear earliest/latest subsequence passes detect ALL ordered alternatives, including repeats. */
export function planKeptText(project:TimelineProject,text:string,options:KeepOptions={}):KeepPlan {
  if(options.choice&&options.choice!=='earliest'&&options.choice!=='latest')fail('mismatch');
  if(text.length>1_000_000)fail('tooLarge');
  const words=timedWords(project),source=words.flatMap((w,word)=>speechTokens(w.text).map(key=>({key,word}))),target=speechTokens(text);
  if(!target.length)fail('empty');if(source.length>100_000||target.length>100_000)fail('tooLarge');
  const pins=options.occurrences??{},first:number[]=[],last:number[]=[];
  for(const [key,value] of Object.entries(pins))if(!Number.isInteger(Number(key))||Number(key)<0||Number(key)>=target.length||!Number.isInteger(value)||value<0||value>=source.length)fail('mismatch');
  let pos=0;
  for(let i=0;i<target.length;i++){
    if(pins[i]!==undefined){if(pins[i]<pos||source[pins[i]]?.key!==target[i])fail('mismatch');pos=pins[i];}
    else while(pos<source.length&&source[pos].key!==target[i])pos++;
    if(pos>=source.length)fail('mismatch');first.push(pos++);
  }
  pos=source.length-1;
  for(let i=target.length-1;i>=0;i--){
    if(pins[i]!==undefined){if(pins[i]>pos||source[pins[i]]?.key!==target[i])fail('mismatch');pos=pins[i];}
    else while(pos>=0&&source[pos].key!==target[i])pos--;
    if(pos<0)fail('mismatch');last[i]=pos--;
  }
  const ambiguousAt=first.findIndex((x,i)=>x!==last[i]);
  const mapping=options.choice==='latest'?last:first;
  const selected=new Set(mapping),kept=new Set(mapping.map(index=>source[index].word));
  const ambiguous=ambiguousAt>=0&&!options.choice;
  if(!ambiguous&&source.some((token,i)=>kept.has(token.word)&&!selected.has(i)))fail('partialWord');
  const plan=planKeptWords(project,[...kept].map(i=>words[i].id),ambiguous);
  let ambiguity:KeepPlan['ambiguity'];
  if(ambiguous){const candidates:NonNullable<KeepPlan['ambiguity']>['candidates']=[];let count=0;
    for(let i=first[ambiguousAt];i<=last[ambiguousAt];i++)if(source[i].key===target[ambiguousAt]){count++;if(candidates.length<200){const at=source[i].word;candidates.push({index:i,start:words[at].start,text:words.slice(Math.max(0,at-2),at+3).map(w=>w.text.trim()).join(' ')});}}
    ambiguity={token:ambiguousAt,text:target[ambiguousAt],candidates,more:count>200};
  }
  return {...plan,ambiguous,ambiguity};
}
/** Reviewed plan -> one immutable project. Caller commits once; never change original sources. */
export function keepSpokenWords(project:TimelineProject,wordIds:string[]):TimelineProject {
  const plan=planKeptWords(project,wordIds),ids=new Set(plan.wordIds);
  let next={...project,transcript:undefined} as TimelineProject;
  for(const range of [...plan.removed].reverse())next=editTimeRange(next,range.start,range.end,'extract',{trackIds:project.tracks.map(t=>t.id),includeVideo:!!project.video,retimeGlobal:true});
  const prefix=[0];for(const range of plan.removed)prefix.push(prefix.at(-1)!+range.end-range.start);
  const retime=(time:number)=>{let left=0,right=plan.removed.length;while(left<right){const mid=(left+right)>>>1;if(plan.removed[mid].end<=time)left=mid+1;else right=mid;}return time-prefix[left]-(left<plan.removed.length?Math.max(0,time-plan.removed[left].start):0);};
  const transcript=project.transcript!.flatMap(c=>{
    const words=c.words!.filter(w=>ids.has(w.id)).map(w=>({...w,start:retime(w.start),end:retime(w.end)}));
    return words.length?[{...c,words,text:words.map(w=>w.text.trim()).join(' '),start:words[0].start,end:words.at(-1)!.end}]:[];
  });
  return {...next,transcript,transcriptLayout:speechLayout(next)};
}
