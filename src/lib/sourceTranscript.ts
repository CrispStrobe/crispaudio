import type {TimelineProject,TranscriptCue,TranscriptWord,SourceTranscript} from '../types/audio';
import {originalWindow} from './clipRetime';
import {editTimeRange} from './rangeEdits';
export interface MappedWord extends TranscriptWord {sourceWordId:string;recordId:string;clipId:string;partial:boolean}
export interface MappedCue extends TranscriptCue {recordId:string;clipId:string;sourceCueId:string;words?:MappedWord[]}
/** Source timestamps never move when the arrangement is edited. Each occurrence maps separately. */
export function mappedSourceTranscript(project:TimelineProject):MappedCue[]{
 const result:MappedCue[]=[];
 for(const track of project.tracks)for(const clip of track.segments){const window=originalWindow(clip),rate=window.duration/clip.duration,reverse=clip.retime?.reverse??false;
  for(const record of project.sourceTranscripts??[])if(record.sourceId===window.sourceId)for(const cue of record.cues){
   const a=Math.max(window.offset,cue.start),b=Math.min(window.offset+window.duration,cue.end);if(b<=a)continue;
   const at=(time:number)=>clip.startTime+(reverse?window.offset+window.duration-time:time-window.offset)/rate;
   const words:MappedWord[]|undefined=cue.words?.flatMap(word=>{const start=Math.max(a,word.start),end=Math.min(b,word.end);if(end<=start)return [];return [{...word,id:`${record.id}/${word.id}/${clip.id}`,sourceWordId:word.id,recordId:record.id,clipId:clip.id,partial:start>word.start+1e-6||end<word.end-1e-6,start:Math.min(at(start),at(end)),end:Math.max(at(start),at(end))}];}).sort((a,b)=>a.start-b.start);
   result.push({...cue,id:`${record.id}/${cue.id}/${clip.id}`,recordId:record.id,sourceCueId:cue.id,clipId:clip.id,start:Math.min(at(a),at(b)),end:Math.max(at(a),at(b)),words,text:words?.length?words.map(w=>w.text).join(' '):cue.text});
  }
 }return result.sort((a,b)=>a.start-b.start);
}
export interface SpeechProposal {snapshot:TimelineProject;operation:'lift'|'extract';wordIds:string[];ranges:{start:number;end:number}[];duration:number;project:TimelineProject}
export function proposeSpeechEdit(project:TimelineProject,ids:string[],operation:'lift'|'extract'):SpeechProposal{
 const words=mappedSourceTranscript(project).flatMap(c=>c.words??[]),selected=new Set(ids),chosen=words.filter(w=>selected.has(w.id));if(!chosen.length||chosen.some(w=>w.partial))throw new Error('sourceSpeech.partial');
 const fps=project.frameRate??25,ranges:{start:number;end:number}[]=[];
 for(const word of chosen.sort((a,b)=>a.start-b.start)){const start=project.video?Math.floor(word.start*fps+1e-7)/fps:word.start,end=project.video?Math.ceil(word.end*fps-1e-7)/fps:word.end;const last=ranges.at(-1);if(last&&start<=last.end+1e-7)last.end=Math.max(last.end,end);else ranges.push({start,end});}
 if(words.some(w=>!selected.has(w.id)&&ranges.some(r=>w.start<r.end-1e-6&&w.end>r.start+1e-6)))throw new Error('sourceSpeech.neighbour');
 let next=project;for(const range of [...ranges].reverse())next=editTimeRange({...next,transcript:undefined},range.start,range.end,operation,{trackIds:project.tracks.map(t=>t.id),includeVideo:!!project.video,includeAllPictureTracks:true,retimeGlobal:true});
 // Edited timeline cues are a derived artifact; source records retain corrections and timestamps.
 const mapped=mappedSourceTranscript(next).map(cue=>({id:cue.id,start:cue.start,end:cue.end,text:cue.text,words:cue.words,speaker:cue.speaker}));
 next={...next,transcript:mapped,transcriptLayout:next.tracks.flatMap(t=>t.segments.map(c=>[t.id,c.id,c.sourceId,c.startTime,c.sourceOffset,c.duration]))};
 return {snapshot:project,operation,wordIds:chosen.map(w=>w.id),ranges,duration:ranges.reduce((sum,r)=>sum+r.end-r.start,0),project:next};
}
export function validSourceTranscripts(project:TimelineProject,sourceIds:Set<string>):boolean{
 const records=project.sourceTranscripts??[];
 const valid=(cue:TranscriptCue)=>typeof cue.id==='string'&&typeof cue.text==='string'&&Number.isFinite(cue.start)&&Number.isFinite(cue.end)&&cue.start>=0&&cue.end>cue.start&&(cue.speaker===undefined||typeof cue.speaker==='string')&&(!cue.words||new Set(cue.words.map(w=>w.id)).size===cue.words.length&&cue.words.every(w=>typeof w.id==='string'&&typeof w.text==='string'&&[w.start,w.end].every(Number.isFinite)&&w.start>=cue.start-1e-6&&w.end<=cue.end+1e-6&&w.end>w.start));
 return new Set(records.map(r=>r.id)).size===records.length&&records.every((r:SourceTranscript)=>typeof r.id==='string'&&typeof r.name==='string'&&sourceIds.has(r.sourceId)&&new Set(r.cues.map(c=>c.id)).size===r.cues.length&&r.cues.every(valid))&&(project.sections??[]).every(s=>typeof s.id==='string'&&typeof s.name==='string'&&[s.start,s.end].every(Number.isFinite)&&s.start>=0&&s.end>s.start);
}
