import {NativeTimelineRecording,type NativeInputInventory} from './NativeTimelineRecording';
const aborted=()=>new DOMException('Native recording cancelled','AbortError');
/** Called only by an explicit Record action. Device inventory remains read-only.
 * WebKit requests the OS grant; release its temporary permission stream BEFORE
 * opening the selected CoreAudio input. Never publish samples from that stream. */
export async function authorizeNativeRecording(inventory:NativeInputInventory,isCurrent:()=>boolean){
 const check=()=>{if(!isCurrent())throw aborted();};check();
 if(inventory.permission==='Authorized')return inventory;
 if(inventory.permission!=='Undetermined')throw new Error('recording.nativePermission');
 let stream:MediaStream|undefined;
 try{stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});}
 catch{check();throw new Error('recording.nativePermission');}
 finally{stream?.getTracks().forEach(track=>track.stop());}
 check();const updated=await NativeTimelineRecording.inputs();check();
 if(updated.permission!=='Authorized')throw new Error('recording.nativePermission');
 return updated;
}
