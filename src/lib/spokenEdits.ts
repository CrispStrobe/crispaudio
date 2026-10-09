import type { TimelineProject } from '../types/audio';
import { editTimeRange, RangeEditError } from './rangeEdits';
export function spokenCutRange(project:TimelineProject,word:{start:number;end:number}){
  const fps=project.frameRate??25;
  return project.video?{start:Math.floor(word.start*fps+1e-7)/fps,end:Math.ceil(word.end*fps-1e-7)/fps}:{start:word.start,end:word.end};
}

export function speechLayout(project:TimelineProject):(string|number)[][] {
  return project.tracks.flatMap(t=>t.segments.map(c=>[t.id,c.id,c.sourceId,c.startTime,c.sourceOffset,c.duration]));
}
/** Delete aligned speech on the arrangement clock, across ALL lanes, in one undo step. */
export function deleteSpokenWord(project:TimelineProject,id:string):TimelineProject {
  if(project.transcriptLayout&&JSON.stringify(project.transcriptLayout)!==JSON.stringify(speechLayout(project)))throw new Error('spoken.stale');
  const word=project.transcript?.flatMap(c=>c.words??[]).find(w=>w.id===id);
  if(!word||!Number.isFinite(word.start)||!Number.isFinite(word.end)||word.end<=word.start)throw new Error('spoken.untimed');
  const {start,end}=spokenCutRange(project,word);
  if(end<=start)throw new Error('spoken.tooShort');
  // Do not silently remove speech adjacent to the selected word through frame rounding.
  if(project.transcript?.some(c=>c.words?.some(w=>w.id!==id&&w.start<end-1e-6&&w.end>start+1e-6)))throw new Error('spoken.neighbour');
  const remaining=project.transcript?.flatMap(c=>{
    if(!c.words?.length){if(c.start<end&&c.end>start)throw new RangeEditError('rangeEdits.cueBoundary');return [c];}
    const words=c.words.filter(w=>w.id!==id);
    if(!words.length)return [];
    const retime=(time:number)=>time>=end?time-(end-start):time>start?start:time;
    const next=words.map(w=>({...w,start:retime(w.start),end:retime(w.end)}));
    return [{...c,words:next,text:next.map(w=>w.text.trim()).join(' '),start:next[0].start,end:next.at(-1)!.end}];
  });
  // Existing range safety still validates locks, links, blend boundaries and source offsets.
  const next=editTimeRange({...project,transcript:undefined},start,end,'extract',{trackIds:project.tracks.map(t=>t.id),includeVideo:!!project.video,retimeGlobal:true});
  return {...next,transcriptLayout:project.transcriptLayout?speechLayout(next):undefined,transcript:remaining?.map(c=>c.words?c:{...c,start:c.start>=end?c.start-(end-start):c.start,end:c.end>=end?c.end-(end-start):c.end})};
}
