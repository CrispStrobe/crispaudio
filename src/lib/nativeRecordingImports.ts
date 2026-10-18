import type {TimelineProject} from '../types/audio';
/** Portable run identities, never machine paths. Kept in the same Undo/save
 * transaction as the imported takes; Undo makes the group available again. */
export function validNativeRecordingImports(project:TimelineProject){
 const ids=project.nativeRecordingImports;
 return ids===undefined||(Array.isArray(ids)&&ids.length<=4096&&new Set(ids).size===ids.length&&ids.every(validNativeImportId));
}
export function validNativeImportId(value:unknown):value is string{return typeof value==='string'&&value.length>0&&value.length<=128&&!/\p{Cc}/u.test(value);}
