export type AuditionOwner='source'|'mix'|'take'|'input'|'recording';
export const AUDITION_START='crispaudio-audition-start';
export interface AuditionRequest {owner:AuditionOwner;native:boolean}
/** Synchronous Web Audio teardown; native owners additionally await their join. */
export function requestAudition(owner:AuditionOwner,native=false){
 const event=new CustomEvent<AuditionRequest>(AUDITION_START,{cancelable:true,detail:{owner,native}});
 window.dispatchEvent(event);return !event.defaultPrevented;
}
