import type {AudioSegment,AudioSource,SourceEdit,SourceEditOperation,SourceEditWindow,TimelineProject} from '../types/audio';

const integer=(value:number,min=0)=>Number.isSafeInteger(value)&&value>=min;
const validWindow=(window:SourceEditWindow|undefined):window is SourceEditWindow=>!!window&&integer(window.start)&&integer(window.frames,1)&&integer(window.start+window.frames,1);
/** A complete journal starts from retained original PCM. Windows may only crop
 * between operations; each operation's ranges are local to its own window. */
export function validSourceEditJournal(edit:SourceEdit):boolean{
 if(edit.journal===undefined)return true; // Legacy/partial histories never gain replay admission.
 const j=edit.journal;
 if(!j||j.version!==1||!integer(j.sampleRate,1)||j.sampleRate>768000||!integer(j.channels,1)||j.channels>32||edit.retime||typeof edit.sourceId!=='string'||!edit.sourceId||!Number.isFinite(edit.offset)||edit.offset<0||!Array.isArray(edit.operations)||!edit.operations.length||edit.operations.length>64)return false;
 let previous:SourceEditWindow|undefined;
 for(const op of edit.operations){
  if(!op||!validWindow(op.window)||typeof op.type!=='string'||!op.type||!integer(op.channel+1)||op.channel>=j.channels||!Array.isArray(op.ranges)||!op.ranges.length||op.ranges.length>64||op.ranges.some(r=>!r||!integer(r.start)||!integer(r.end,1)||r.end<=r.start||r.end>op.window!.frames))return false;
  if(previous&&(op.window.start<previous.start||op.window.start+op.window.frames>previous.start+previous.frames))return false;
  previous=op.window;
 }
 return Math.round(edit.offset*j.sampleRate)===previous!.start;
}
function clips(project:TimelineProject){return project.tracks.flatMap(t=>[t.segments,t.compBaseSegments,t.freeze?.original?.segments].flatMap(group=>Array.isArray(group)?group:[]));}
export function validProjectSourceJournals(project:TimelineProject){return clips(project).every(c=>!c.sourceEdit||validSourceEditJournal(c.sourceEdit));}
/** Shared by save, reopen and recovery. Validate against decoded PCM, not file
 * duration metadata. A later reversible retime retains the pre-retime derivative. */
export function validateSourceJournalAudio(project:TimelineProject,sources:Map<string,AudioSource>){
 if(!validProjectSourceJournals(project))throw new Error('Invalid source edit journal');
 for(const clip of clips(project))validateSourceJournalClipAudio(clip,sources);
}
export function validateSourceJournalClipAudio(clip:AudioSegment,sources:Map<string,AudioSource>){
 const edit=clip.sourceEdit;if(!edit)return;
 if(!validSourceEditJournal(edit))throw new Error('Invalid source edit journal');
 const j=edit.journal;if(!j)return;
 const original=sources.get(edit.sourceId),derived=sources.get(clip.retime?.original.sourceId??clip.sourceId),first=edit.operations[0].window!,last=edit.operations.at(-1)!.window!;
 const matches=(source:AudioSource|undefined)=>!!source&&source.sampleRate===j.sampleRate&&source.buffer.sampleRate===j.sampleRate&&source.channels===j.channels&&source.buffer.numberOfChannels===j.channels;
 if(!matches(original)||!matches(derived)||original!.id===derived!.id||first.start+first.frames>original!.buffer.length||derived!.buffer.length!==last.frames)throw new Error('Invalid source edit journal audio');
}
/** Record only histories whose complete window provenance was observed. Never
 * infer missing legacy windows, or promote a truncated/retimed journal. */
export function appendSourceEdit(clip:AudioSegment,source:AudioSource,sources:Map<string,AudioSource>,operation:SourceEditOperation,frames:number):SourceEdit{
 const rate=source.sampleRate,crop=Math.round(clip.sourceOffset*rate),previous=clip.sourceEdit;
 if(source.id!==clip.sourceId||!integer(frames,1)||!integer(crop)||crop+frames>source.buffer.length)throw new Error('sourceEditor.changed');
 if(previous?.journal){
  // Unrelated tracks need not block this editor operation.
  validateSourceJournalClipAudio(clip,sources);
 }
 const complete=!clip.retime&&!previous?.retime&&(!previous||!!previous.journal)&&(!previous||previous.operations.length<64)&&integer(rate,1)&&rate<=768000&&source.buffer.sampleRate===rate&&source.channels===source.buffer.numberOfChannels&&integer(source.channels,1)&&source.channels<=32;
 const start=complete?(previous?previous.operations.at(-1)!.window!.start:0)+crop:0;
 const next:SourceEdit={sourceId:previous?.sourceId??clip.sourceId,offset:complete?start/rate:previous?previous.offset+clip.sourceOffset:clip.sourceOffset,retime:previous?.retime??clip.retime,operations:[...(previous?.operations??[]),{...structuredClone(operation),window:complete?{start,frames}:undefined}].slice(-64)};
 if(complete){next.journal={version:1,sampleRate:rate,channels:source.channels};if(!validSourceEditJournal(next))throw new Error('sourceEditor.changed');}
 return next;
}
