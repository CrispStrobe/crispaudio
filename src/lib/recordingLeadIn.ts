import type {RecordingInput,TimelineProject} from '../types/audio';
import {barSeconds,DEFAULT_MUSIC} from './musicalTime';
/** Existing countIn is a legacy silent delay in seconds; never reinterpret it as bars. */
export function recordingLeadIn(project:TimelineProject,inputs:RecordingInput[],cursor:number,range?:{start:number;end:number},loop=false){
 const music=project.music??DEFAULT_MUSIC;
 const bars=(value:number|undefined)=>{if(value===undefined)return 0;if(!Number.isInteger(value)||value<0||value>4)throw new Error('recording.leadInBudget');return value;};
 const countBars=Math.max(0,...inputs.map(i=>bars(i.countInBars))),preBars=Math.max(0,...inputs.map(i=>bars(i.preRollBars)));
 const delay=Math.max(0,...inputs.map(i=>i.countIn));
 if(!Number.isFinite(cursor)||cursor<0||!Number.isFinite(delay)||delay<0||delay>10)throw new Error('recording.rangeRequired');
 if(range&&(!Number.isFinite(range.start)||!Number.isFinite(range.end)||range.start<0||range.end<=range.start))throw new Error('recording.rangeRequired');
 const recordStart=range?.start??cursor;
 // Preserve existing punch playback from an earlier cursor; loops start at their in-point.
 const base=loop?recordStart:Math.min(cursor,recordStart);
 const playbackStart=Math.max(0,Math.min(base,recordStart-preBars*barSeconds(music)));
 const countSeconds=countBars*barSeconds(music),preRollSeconds=recordStart-playbackStart;
 if(!Number.isFinite(countSeconds)||!Number.isFinite(preRollSeconds)||delay+countSeconds+Math.min(recordStart,preBars*barSeconds(music))>60)throw new Error('recording.leadInBudget');
 return {recordStart,takeStart:preRollSeconds>0?recordStart:undefined,playbackStart,countSeconds,preRollSeconds,delay,music};
}
