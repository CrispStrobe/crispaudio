import type {PictureComposition,PictureKeyframe,TimelineProject,VideoClip,VideoTrack} from '../types/audio';
export const DEFAULT_PICTURE:PictureComposition={x:0,y:0,scale:1,rotation:0,opacity:1,crop:{left:0,top:0,right:0,bottom:0}};
export const LEGACY_PICTURE_TRACK='picture';
export function pictureTracks(video:TimelineProject['video']):VideoTrack[]{return video?video.tracks?[...video.tracks]:[{id:LEGACY_PICTURE_TRACK,name:'',visible:true,locked:video.locked??false,rippleEnabled:video.rippleEnabled??true}]:[];}
export const pictureTrackId=(clip:VideoClip)=>clip.videoTrackId??LEGACY_PICTURE_TRACK;
export const pictureLocked=(video:TimelineProject['video'],clip:VideoClip)=>!!video?.locked||!!pictureTracks(video).find(t=>t.id===pictureTrackId(clip))?.locked;
export function validPicture(value:PictureComposition|undefined){
  if(value===undefined)return true;
  const valid=(p:Omit<PictureKeyframe,'time'>)=>p&&Number.isFinite(p.x)&&Math.abs(p.x)<=2&&Number.isFinite(p.y)&&Math.abs(p.y)<=2&&Number.isFinite(p.scale)&&p.scale>=.05&&p.scale<=4&&Number.isFinite(p.rotation)&&Math.abs(p.rotation)<=180&&Number.isFinite(p.opacity)&&p.opacity>=0&&p.opacity<=1;
  if(!valid(value)||!value.crop||!Object.values(value.crop).every(v=>Number.isFinite(v)&&v>=0&&v<1)||value.crop.left+value.crop.right>=1||value.crop.top+value.crop.bottom>=1)return false;
  if(value.keyframeOffset!==undefined&&!Number.isFinite(value.keyframeOffset))return false;
  return value.keyframes===undefined||(Array.isArray(value.keyframes)&&value.keyframes.length<=10000&&new Set(value.keyframes.map(p=>p.time)).size===value.keyframes.length&&value.keyframes.every(p=>valid(p)&&Number.isFinite(p.time)&&p.time>=0&&(p.easing===undefined||['linear','step','ease-in','ease-out','ease-in-out'].includes(p.easing))));
}
export function pictureAt(clip:VideoClip,time:number):PictureComposition{
  const value=clip.composition??DEFAULT_PICTURE,frames=[...(value.keyframes??[])].sort((a,b)=>a.time-b.time),local=time-clip.startTime+(value.keyframeOffset??0);
  if(!frames.length)return value;
  const right=frames.findIndex(p=>p.time>local);if(right===0)return {...value,...frames[0]};if(right===-1)return {...value,...frames.at(-1)!};
  const a=frames[right-1],b=frames[right],fraction=(local-a.time)/(b.time-a.time),t=pictureEasing(fraction,a.easing);
  return {...value,...Object.fromEntries((['x','y','scale','rotation','opacity'] as const).map(key=>[key,a[key]+(b[key]-a[key])*t]))};
}
/** Left trims and split/extract pieces retain the animation's original local clock. */
export function retainedPictureAnimation(original:VideoClip,edited:VideoClip):VideoClip{
  if(original.multicam&&edited.multicam&&original.sourceId===edited.sourceId&&original.duration!==edited.duration)edited={...edited,multicam:{...edited.multicam,clockOffset:original.multicam.clockOffset+edited.sourceOffset-original.sourceOffset}};
  if(original.sourceId!==edited.sourceId||!original.composition?.keyframes?.length||original.duration===edited.duration)return edited;
  const shift=edited.sourceOffset-original.sourceOffset;
  if(!shift)return edited;
  return {...edited,composition:{...edited.composition!,keyframeOffset:(original.composition.keyframeOffset??0)+shift}};
}
export function validPictureTracks(video:NonNullable<TimelineProject['video']>){
  if(video.width!==undefined&&(!Number.isInteger(video.width)||video.width<16||video.width>7680||video.width%2))return false;
  if(video.height!==undefined&&(!Number.isInteger(video.height)||video.height<16||video.height>7680||video.height%2))return false;
  if(video.tracks===undefined)return !(video.clips??[]).some(c=>c.videoTrackId&&c.videoTrackId!==LEGACY_PICTURE_TRACK);
  const ids=new Set(video.tracks.map(t=>t.id));
  return video.tracks.length>0&&video.tracks.length<=32&&ids.size===video.tracks.length&&video.tracks.some(t=>t.id===LEGACY_PICTURE_TRACK)&&video.tracks.every(t=>t.id&&typeof t.name==='string'&&typeof t.visible==='boolean'&&typeof t.locked==='boolean'&&typeof t.rippleEnabled==='boolean')&&(video.clips??[]).every(c=>ids.has(pictureTrackId(c)));
}

export function hasPictureComposition(video:TimelineProject['video']):boolean{return !!video&&(!!video.tracks||!!video.graphics?.length||!!video.captions||video.width!==undefined||video.height!==undefined||!!video.clips?.some(c=>c.composition));}

export function pictureEasing(t:number,kind:PictureKeyframe['easing']):number{switch(kind){case 'step':return 0;case 'ease-in':return t*t;case 'ease-out':return 1-(1-t)*(1-t);case 'ease-in-out':return t*t*(3-2*t);default:return t;}}
