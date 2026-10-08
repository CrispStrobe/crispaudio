import type {VideoClip} from '../types/audio';
/** Small canvas limits touch-device GPU/CPU cost; exported effects use full resolution. */
export function drawVideoTransition(canvas:HTMLCanvasElement,a:HTMLVideoElement,b:HTMLVideoElement,clip:VideoClip,time:number) {
  const ctx=canvas.getContext('2d');if(!ctx||a.readyState<2||b.readyState<2)return;
  const height=Math.max(1,Math.round(320*a.videoHeight/Math.max(1,a.videoWidth)));if(canvas.height!==height)canvas.height=height;
  const w=canvas.width,h=canvas.height,p=Math.max(0,Math.min(1,(time-clip.startTime)/Math.max(.001,clip.transitionDuration)));
  ctx.save();ctx.clearRect(0,0,w,h);ctx.imageSmoothingEnabled=true;
  const draw=(video:HTMLVideoElement,x=0)=>ctx.drawImage(video,x,0,w,h);
  if(clip.transition==='whip'){
    const progress=p*p*(3-2*p);ctx.filter=`blur(${Math.sin(Math.PI*p)*4}px)`;draw(a,-w*progress);draw(b,w*(1-progress));
  }else if(clip.transition==='glitch'){
    const video=p<.5?a:b;
    for(let y=0;y<h;y+=6){const shift=w*.12*Math.sin(Math.floor(y/6)*9+Math.floor(p*24)*7)*Math.sin(Math.PI*p);ctx.drawImage(video,0,y/h*video.videoHeight,video.videoWidth,6/h*video.videoHeight,shift,y,w,6);if(shift>0)ctx.drawImage(video,0,y/h*video.videoHeight,video.videoWidth,6/h*video.videoHeight,shift-w,y,w,6);else ctx.drawImage(video,0,y/h*video.videoHeight,video.videoWidth,6/h*video.videoHeight,shift+w,y,w,6);}
  }else if(clip.transition==='pagepeel'){
    draw(b);const edge=w*(1-p),band=w*.15*Math.sin(Math.PI*p);
    ctx.save();ctx.beginPath();ctx.rect(0,0,edge,h);ctx.clip();draw(a);ctx.restore();
    if(band>1){ctx.save();ctx.beginPath();ctx.rect(edge-band,0,band,h);ctx.clip();ctx.translate(2*edge,0);ctx.scale(-1,1);ctx.filter='grayscale(1) brightness(.7)';draw(a);ctx.restore();}
  }else {
    const size=Math.max(1,Math.round(1+30*Math.sin(Math.PI*p)));
    const small=document.createElement('canvas');small.width=Math.max(1,Math.round(w/size));small.height=Math.max(1,Math.round(h/size));const sc=small.getContext('2d');if(sc){sc.drawImage(a,0,0,small.width,small.height);sc.globalAlpha=p;sc.drawImage(b,0,0,small.width,small.height);ctx.imageSmoothingEnabled=false;ctx.drawImage(small,0,0,w,h);}
  }
  ctx.restore();
}
