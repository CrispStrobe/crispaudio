import type {SampleRange} from './sourceEditing';

/** Draw offscreen in bounded work slices, then publish the complete current frame once. */
export async function drawSourceWaveform(canvas:HTMLCanvasElement,channels:Float32Array[],view:SampleRange,ranges:SampleRange[],processed:boolean,signal:AbortSignal){
 signal.throwIfAborted();
 const output=canvas.getContext('2d');if(!output)return;
 const frame=document.createElement('canvas');frame.width=canvas.width;frame.height=canvas.height;
 const ctx=frame.getContext('2d');if(!ctx)return;
 const w=frame.width,h=frame.height,length=channels[0]?.length??0,span=Math.max(1,view.end-view.start);
 let deadline=performance.now()+8;
 const checkpoint=async()=>{signal.throwIfAborted();if(performance.now()>=deadline){await new Promise<void>(resolve=>setTimeout(resolve,0));deadline=performance.now()+8;}signal.throwIfAborted();};
 ctx.fillStyle='#0f172a';ctx.fillRect(0,0,w,h);ctx.fillStyle='#4338ca88';for(const r of ranges)ctx.fillRect((r.start-view.start)/span*w,0,(r.end-r.start)/span*w,h);
 for(let index=0;index<channels.length;index++){
  const pcm=channels[index],top=index*h/channels.length,row=h/channels.length,mid=top+row/2;
  ctx.strokeStyle='#64748b';ctx.beginPath();ctx.moveTo(0,mid);ctx.lineTo(w,mid);ctx.stroke();ctx.strokeStyle=processed?'#fbbf24':'#38bdf8';
  if(span<=w*2){
   ctx.beginPath();const first=Math.max(0,Math.ceil(view.start)),last=Math.min(length-1,Math.floor(view.end));
   for(let i=first;i<=last;i++){const x=(i-view.start)/span*w,y=mid-pcm[i]*row*.45;if(i===first)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();
   if(span<=w/8){ctx.fillStyle=ctx.strokeStyle;for(let i=first;i<=last;i++){ctx.beginPath();ctx.arc((i-view.start)/span*w,mid-pcm[i]*row*.45,2,0,Math.PI*2);ctx.fill();}}
  }else{
   ctx.beginPath();for(let x=0;x<w;x++){
    const from=Math.max(0,Math.floor(view.start+x/w*span)),to=Math.min(length,Math.max(from+1,Math.ceil(view.start+(x+1)/w*span)));let lo=1,hi=-1;
    for(let i=from;i<to;i++){lo=Math.min(lo,pcm[i]);hi=Math.max(hi,pcm[i]);}
    ctx.moveTo(x,mid-hi*row*.45);ctx.lineTo(x,mid-lo*row*.45);await checkpoint();
   }ctx.stroke();
  }
  await checkpoint();
 }
 signal.throwIfAborted();output.drawImage(frame,0,0);
}
