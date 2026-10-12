import { drawOrientedVideo } from './videoTransform';
import { applyVideoColorPixels } from './videoColor';
import { clipOpacity } from './videoPreview';
import type {VideoClip} from '../types/audio';
const frames = new WeakMap<HTMLVideoElement, {key:string; canvas:HTMLCanvasElement}>();
function appearance(video: HTMLVideoElement, clip: VideoClip | undefined, time:number, width:number, height:number): HTMLCanvasElement {
  const opacity=clip?clipOpacity(clip,time):1;
  const key=JSON.stringify([video.currentTime,clip?.colorCorrection,clip?.transform,opacity,width,height]);
  const cached=frames.get(video); if(cached?.key===key)return cached.canvas;
  const canvas=cached?.canvas??document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  if(ctx){
    const source=document.createElement('canvas');
    source.width=width;source.height=Math.max(1,Math.round(width*video.videoHeight/Math.max(1,video.videoWidth)));
    const sourceContext=source.getContext('2d');
    if(sourceContext){
      sourceContext.drawImage(video,0,0,source.width,source.height);
      if(clip?.colorCorrection?.enabled){
        try { const image=sourceContext.getImageData(0,0,source.width,source.height);applyVideoColorPixels(image.data,clip.colorCorrection);sourceContext.putImageData(image,0,0); }
        catch { /* Foreign media may deny pixel access; local assets supply CORS. */ }
      }
      drawOrientedVideo(ctx,source,clip?.transform,width,height);
      ctx.fillStyle=`rgba(0,0,0,${1-opacity})`;ctx.fillRect(0,0,width,height);
    }
  }
  frames.set(video,{key,canvas});return canvas;
}
/** Small canvas limits touch-device GPU/CPU cost; exported effects use full resolution. */
export function drawVideoTransition(canvas:HTMLCanvasElement,a:HTMLVideoElement,b:HTMLVideoElement,clip:VideoClip,time:number,outgoing?:VideoClip) {
  const ctx=canvas.getContext('2d');if(!ctx||a.readyState<2||b.readyState<2)return;
  const height=Math.max(1,Math.round(320*a.videoHeight/Math.max(1,a.videoWidth)));if(canvas.height!==height)canvas.height=height;
  const w=canvas.width,h=canvas.height,p=Math.max(0,Math.min(1,(time-clip.startTime)/Math.max(.001,clip.transitionDuration)));
  const first=appearance(a,outgoing,time,w,h),second=appearance(b,clip,time,w,h);
  drawPictureTransition(canvas,first,second,clip.transition,p);
}

/** Full-canvas layers retain alpha so picture gaps reveal lower tracks. */
export function drawPictureTransition(canvas:HTMLCanvasElement,first:HTMLCanvasElement,second:HTMLCanvasElement,kind:VideoClip['transition'],p:number){
  const ctx=canvas.getContext('2d');if(!ctx)return;const w=canvas.width,h=canvas.height;
  ctx.save();ctx.clearRect(0,0,w,h);ctx.imageSmoothingEnabled=true;
  const draw=(video:HTMLCanvasElement,x=0)=>ctx.drawImage(video,x,0,w,h);
  if(kind==='fadeblack'||kind==='fadewhite'){
    ctx.fillStyle=kind==='fadewhite'?'white':'black';ctx.fillRect(0,0,w,h);
    ctx.globalAlpha=Math.max(0,1-2*p);draw(first);ctx.globalAlpha=Math.max(0,2*p-1);draw(second);
  }else if(kind.startsWith('wipe')){
    draw(first);ctx.beginPath();
    if(kind==='wipeleft')ctx.rect(w*(1-p),0,w*p,h);else if(kind==='wiperight')ctx.rect(0,0,w*p,h);else if(kind==='wipeup')ctx.rect(0,h*(1-p),w,h*p);else ctx.rect(0,0,w,h*p);ctx.clip();draw(second);
  }else if(kind.startsWith('slide')){
    const horizontal=kind==='slideleft'||kind==='slideright',sign=kind==='slideleft'||kind==='slideup'?1:-1;
    ctx.drawImage(first,horizontal?-sign*w*p:0,horizontal?0:-sign*h*p,w,h);ctx.drawImage(second,horizontal?sign*w*(1-p):0,horizontal?0:sign*h*(1-p),w,h);
  }else if(kind==='fade'||kind==='cut'||kind==='hblur'||kind==='zoomin'){
    if(kind==='hblur')ctx.filter=`blur(${p*12}px)`;
    if(kind==='zoomin'){ctx.save();ctx.translate(w/2,h/2);ctx.scale(1+p,1+p);ctx.translate(-w/2,-h/2);ctx.globalAlpha=1-p;draw(first);ctx.restore();}else draw(first);
    ctx.globalAlpha=kind==='cut'?1:p;ctx.filter=kind==='hblur'?`blur(${(1-p)*12}px)`:'none';draw(second);
  }else if(kind==='whip'){
    const progress=p*p*(3-2*p);ctx.filter=`blur(${Math.sin(Math.PI*p)*4}px)`;draw(first,-w*progress);draw(second,w*(1-progress));
  }else if(kind==='glitch'){
    const video=p<.5?first:second;
    for(let y=0;y<h;y+=6){const shift=w*.12*Math.sin(Math.floor(y/6)*9+Math.floor(p*24)*7)*Math.sin(Math.PI*p);ctx.drawImage(video,0,y/h*video.height,video.width,6/h*video.height,shift,y,w,6);if(shift>0)ctx.drawImage(video,0,y/h*video.height,video.width,6/h*video.height,shift-w,y,w,6);else ctx.drawImage(video,0,y/h*video.height,video.width,6/h*video.height,shift+w,y,w,6);}
  }else if(kind==='pagepeel'){
    draw(second);const edge=w*(1-p),band=w*.15*Math.sin(Math.PI*p);
    ctx.save();ctx.beginPath();ctx.rect(0,0,edge,h);ctx.clip();draw(first);ctx.restore();
    if(band>1){ctx.save();ctx.beginPath();ctx.rect(edge-band,0,band,h);ctx.clip();ctx.translate(2*edge,0);ctx.scale(-1,1);ctx.filter='grayscale(1) brightness(.7)';draw(first);ctx.restore();}
  }else {
    const size=Math.max(1,Math.round(1+30*Math.sin(Math.PI*p)));
    const small=document.createElement('canvas');small.width=Math.max(1,Math.round(w/size));small.height=Math.max(1,Math.round(h/size));const sc=small.getContext('2d');if(sc){sc.drawImage(first,0,0,small.width,small.height);sc.globalAlpha=p;sc.drawImage(second,0,0,small.width,small.height);ctx.imageSmoothingEnabled=false;ctx.drawImage(small,0,0,w,h);}
  }
  ctx.restore();
}
