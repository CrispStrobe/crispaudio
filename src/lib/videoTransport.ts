/** Do not replace a pending WebKit seek every audio tick: the decoder can be
 * starved indefinitely on large Canon files. Seek completion gets the latest
 * timeline target on the next sync. */
const seeks=new WeakMap<HTMLVideoElement,{at:number;target:number}>();
export function syncVideoElement(element:HTMLVideoElement,target:number,playing:boolean,onError:(error:string)=>void){
  if(element.readyState<1||element.error){element.pause();return;}
  if(element.seeking)return;
  const previous=seeks.get(element),now=performance.now();
  const drift=Math.abs(element.currentTime-target),threshold=playing?.35:.001;
  if(drift>threshold&&(!playing||!previous||now-previous.at>500)){
    seeks.set(element,{at:now,target});element.currentTime=target;
    // Wait for the decoded target frame instead of immediately starting a
    // competing play request while a seek is in flight.
    if(element.seeking)return;
  }
  if(playing&&element.paused&&element.readyState>=2)void element.play().catch(error=>onError(String(error)));
  if(!playing&&!element.paused)element.pause();
}
/** Audio starts once visible picture has a decoded frame. Hidden viewers and
 * intentional picture gaps never block audio-only playback. */
export async function waitForPreviewFrame(signal:AbortSignal):Promise<void>{
  const started=performance.now();
  while(true){
    signal.throwIfAborted();
    const video=document.querySelector<HTMLVideoElement>('video[data-timeline-preview]');
    const loading=document.querySelector('[data-preview-loading=true]');
    if((!video&&!loading)||video?.style.opacity==='0'||(video&&video.readyState>=2&&!video.seeking))return;
    if(performance.now()-started>15000)throw new Error('Video preview is still loading; prepare a lightweight preview or hide the viewer');
    await new Promise<void>(resolve=>setTimeout(resolve,40));
  }
}
