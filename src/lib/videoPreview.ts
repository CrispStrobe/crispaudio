import type {VideoClip} from '../types/audio';
/** Interactive preview. FFmpeg is authoritative for blur/zoom/pixelize exports. */
export function clipOpacity(clip:VideoClip,time:number):number {
  const local=time-clip.startTime;
  if(local<0||local>=clip.duration)return 0;
  return Math.min(1,clip.fadeIn>0?local/clip.fadeIn:1)*Math.min(1,clip.fadeOut>0?(clip.duration-local)/clip.fadeOut:1);
}
export function transitionStyle(clip:VideoClip,time:number):{incoming:Record<string,string|number>;outgoing:Record<string,string|number>;background:string;approximate:boolean} {
  const p=Math.max(0,Math.min(1,(time-clip.startTime)/Math.max(.001,clip.transitionDuration)));
  const incoming:Record<string,string|number>={opacity:p},outgoing:Record<string,string|number>={opacity:1},background=clip.transition==='fadewhite'?'white':'black';
  const type=clip.transition;
  if(type==='fadeblack'||type==='fadewhite'){incoming.opacity=Math.max(0,2*p-1);outgoing.opacity=Math.max(0,1-2*p);}
  if(type.startsWith('wipe')) {incoming.opacity=1;incoming.clipPath=type==='wipeleft'?`inset(0 0 0 ${(1-p)*100}%)`:type==='wiperight'?`inset(0 ${(1-p)*100}% 0 0)`:type==='wipeup'?`inset(${(1-p)*100}% 0 0 0)`:`inset(0 0 ${(1-p)*100}% 0)`;}
  if(type.startsWith('slide')) {incoming.opacity=1;const horizontal=type==='slideleft'||type==='slideright',sign=type==='slideleft'||type==='slideup'?1:-1;incoming.transform=`translate${horizontal?'X':'Y'}(${sign*(1-p)*100}%)`;outgoing.transform=`translate${horizontal?'X':'Y'}(${-sign*p*100}%)`;}
  if(type==='hblur'){incoming.filter=`blur(${(1-p)*12}px)`;outgoing.filter=`blur(${p*12}px)`;}
  if(type==='zoomin'){outgoing.transform=`scale(${1+p})`;outgoing.opacity=1-p;}
  return {incoming,outgoing,background,approximate:['hblur','zoomin','pixelize','whip','glitch','pagepeel'].includes(type)};
}
