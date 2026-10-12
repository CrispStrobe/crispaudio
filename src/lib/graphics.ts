import type {GraphicClip,TimelineProject,TitleStyle,TranscriptCue,VideoClip} from '../types/audio';
import {validPicture,DEFAULT_PICTURE} from './pictureComposition';
import {transcriptSrt} from './transcript';
export const TITLE_FONTS=['Arial','Georgia','Courier New'] as const;
export const DEFAULT_TITLE:TitleStyle={font:'Arial',size:.06,align:'center',color:'#ffffff',background:'#000000',backgroundOpacity:.65,boxWidth:.8,lineHeight:1.2};
export const TITLE_PRESETS={title:{...DEFAULT_TITLE,size:.09,backgroundOpacity:0},lowerThird:{...DEFAULT_TITLE,size:.045,align:'left' as const,boxWidth:.7},caption:{...DEFAULT_TITLE,size:.045,boxWidth:.85}};
export function titlePose(preset:keyof typeof TITLE_PRESETS){return {...DEFAULT_PICTURE,y:preset==='title'?0:preset==='lowerThird'?.3:.38,crop:{...DEFAULT_PICTURE.crop}};}
export function validTitle(style:TitleStyle){return !!style&&typeof style.font==='string'&&TITLE_FONTS.includes(style.font as typeof TITLE_FONTS[number])&&Number.isFinite(style.size)&&style.size>=.01&&style.size<=.3&&['left','center','right'].includes(style.align)&&/^#[0-9a-f]{6}$/i.test(style.color)&&/^#[0-9a-f]{6}$/i.test(style.background)&&Number.isFinite(style.backgroundOpacity)&&style.backgroundOpacity>=0&&style.backgroundOpacity<=1&&Number.isFinite(style.boxWidth)&&style.boxWidth>=.1&&style.boxWidth<=1&&Number.isFinite(style.lineHeight)&&style.lineHeight>=1&&style.lineHeight<=2;}
export function validGraphics(video:TimelineProject['video']):boolean{
 const ids=new Set<string>(),add=(id:string)=>typeof id==='string'&&!!id&&!ids.has(id)&&!!ids.add(id);
 const track=(t:{id:string;name:string;visible:boolean;locked:boolean;rippleEnabled:boolean})=>add(t.id)&&typeof t.name==='string'&&['visible','locked','rippleEnabled'].every(k=>typeof t[k as keyof typeof t]==='boolean');
 if(video?.graphics!==undefined&&(!Array.isArray(video.graphics)||video.graphics.length>32||!video.graphics.every(t=>track(t)&&Array.isArray(t.clips)&&t.clips.length<=1000&&t.clips.every(c=>add(c.id)&&Number.isFinite(c.startTime)&&c.startTime>=0&&Number.isFinite(c.duration)&&c.duration>=1/120&&validPicture(c.composition)&&(c.type==='image'?typeof c.path==='string'&&!!c.path:c.type==='title'&&typeof c.text==='string'&&c.text.trim().length>0&&c.text.length<=4000&&validTitle(c.style!))))))return false;
 if(video?.titlePresets!==undefined&&(!Array.isArray(video.titlePresets)||video.titlePresets.length>64||!video.titlePresets.every(p=>add(p.id)&&typeof p.name==='string'&&typeof p.text==='string'&&!!p.text.trim()&&p.text.length<=4000&&Number.isFinite(p.duration)&&p.duration>=1/120&&validTitle(p.style)&&validPicture(p.composition))))return false;
 const caption=video?.captions;
 return !caption||(track(caption)&&typeof caption.burnIn==='boolean'&&validTitle(caption.style)&&Array.isArray(caption.cues)&&caption.cues.length<=10000&&caption.cues.every(c=>add(c.id)&&Number.isFinite(c.start)&&c.start>=0&&Number.isFinite(c.end)&&c.end>c.start&&typeof c.text==='string'&&c.text.trim().length>0&&c.text.length<=4000));
}
export function graphicAsVideo(clip:GraphicClip):VideoClip{return {id:clip.id,startTime:clip.startTime,duration:clip.duration,sourceOffset:0,fadeIn:0,fadeOut:0,transition:'cut',transitionDuration:0,composition:clip.composition};}
export function captionVtt(cues:TranscriptCue[]):string{return 'WEBVTT\n\n'+transcriptSrt(cues).replace(/(\d\d:\d\d:\d\d),(\d{3})/g,'$1.$2');}
/** Shared deterministic word wrapping; long words wrap at Unicode code points. */
export function wrapTitle(text:string,width:number,measure:(s:string)=>number):string[]{
 const lines:string[]=[];
 for(const paragraph of text.split('\n')){let line='';for(const word of paragraph.split(/\s+/).filter(Boolean)){
  if(line&&measure(line+' '+word)>width){lines.push(line);line='';}
  if(measure(word)>width){for(const character of word){if(line&&measure(line+character)>width){lines.push(line);line='';}line+=character;}}else line+=(line?' ':'')+word;
 }lines.push(line);}
 return lines;
}
export function drawTitle(ctx:CanvasRenderingContext2D,text:string,style:TitleStyle,width:number,height:number){
 ctx.save();const size=style.size*height;ctx.font=`${size}px "${style.font}"`;ctx.textAlign=style.align;ctx.textBaseline='middle';const box=style.boxWidth*width,pad=size*.3,lines=wrapTitle(text,box-2*pad,s=>ctx.measureText(s).width),lineHeight=size*style.lineHeight,block=lines.length*lineHeight+2*pad;
 ctx.globalAlpha*=style.backgroundOpacity;ctx.fillStyle=style.background;ctx.fillRect((width-box)/2,(height-block)/2,box,block);ctx.globalAlpha/=style.backgroundOpacity||1;
 // Preserve clip opacity even for a fully transparent text background.
 ctx.restore();ctx.save();ctx.font=`${size}px "${style.font}"`;ctx.textAlign=style.align;ctx.textBaseline='middle';ctx.fillStyle=style.color;
 const x=style.align==='left'?(width-box)/2+pad:style.align==='right'?(width+box)/2-pad:width/2;
 lines.forEach((line,i)=>ctx.fillText(line,x,height/2+(i-(lines.length-1)/2)*lineHeight));ctx.restore();
}

/** Delivery graphics follow picture ripple scope; captions keep their own text. */
export function editGraphicsRange(video:NonNullable<TimelineProject['video']>,start:number,end:number,operation:'lift'|'extract'|'insert',includeAll=false){
 const length=end-start;
 const pieces=(a:number,duration:number)=>{
  const b=a+duration;
  if(b<=start)return [{start:a,duration,offset:0}];
  if(operation==='insert'&&a>=start)return [{start:a+length,duration,offset:0}];
  if(operation!=='insert'&&a>=end)return [{start:operation==='extract'?a-length:a,duration,offset:0}];
  const result:{start:number;duration:number;offset:number}[]=[];
  if(a<start)result.push({start:a,duration:start-a,offset:0});
  const cut=operation==='insert'?start:end;
  if(operation==='insert'||b>end)result.push({start:operation==='extract'?start:end,duration:b-cut,offset:cut-a});
  return result;
 };
 const graphics=video.graphics?.map(t=>{
  if(!includeAll&&!t.rippleEnabled)return t;
  const clips=t.clips.flatMap(c=>{
   const result=pieces(c.startTime,c.duration);
   if(result.length===1&&result[0].start===c.startTime&&result[0].duration===c.duration)return [c];
   if(t.locked)throw new Error('rangeEdits.locked');
   return result.filter(p=>p.duration>=1/120).map((p,i)=>({...c,id:i?crypto.randomUUID():c.id,startTime:p.start,duration:p.duration,composition:c.composition.keyframes?.length?{...c.composition,keyframeOffset:(c.composition.keyframeOffset??0)+p.offset}:c.composition}));
  });return {...t,clips};
 });
 const caption=video.captions;
 const captions=caption&&(includeAll||caption.rippleEnabled)?{...caption,cues:caption.cues.flatMap(c=>{
  const result=pieces(c.start,c.end-c.start);
  if(result.length===1&&result[0].start===c.start&&result[0].duration===c.end-c.start)return [c];
  if(caption.locked)throw new Error('rangeEdits.locked');
  return result.filter(p=>p.duration>0).map((p,i)=>({...c,id:i?crypto.randomUUID():c.id,start:p.start,end:p.start+p.duration,words:undefined}));
 })}:caption;
 return {...video,graphics,captions};
}
