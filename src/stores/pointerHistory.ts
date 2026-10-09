import {useProjectStore} from './projectStore';
/** Cancel only the owning pointer gesture, restoring redo discarded by its live edits. */
export function capturePointerHistory(){
 const history=useProjectStore.temporal.getState();
 return {pastStates:[...history.pastStates],futureStates:[...history.futureStates]};
}
export function restorePointerHistory(snapshot:ReturnType<typeof capturePointerHistory>){
 useProjectStore.temporal.setState(snapshot);
}
