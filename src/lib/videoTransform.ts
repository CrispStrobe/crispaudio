import type { VideoTransform } from '../types/audio';
export const DEFAULT_VIDEO_TRANSFORM: VideoTransform = {rotation:0,flipHorizontal:false,flipVertical:false};
export function validVideoTransform(value: VideoTransform | undefined): boolean {
  return value === undefined || (!!value && [0,90,180,270].includes(value.rotation) &&
    typeof value.flipHorizontal === 'boolean' && typeof value.flipVertical === 'boolean');
}
/** Fit the rotated source inside a fixed composition; mirroring uses screen axes. */
export function fittedVideoSize(value: VideoTransform | undefined, sourceWidth:number, sourceHeight:number, width:number,height:number) {
  const rotated=(value?.rotation??0)%180!==0;
  const scale=Math.min(width/(rotated?sourceHeight:sourceWidth),height/(rotated?sourceWidth:sourceHeight));
  return {width:sourceWidth*scale,height:sourceHeight*scale};
}
export function videoTransformStyle(value: VideoTransform | undefined, sw:number,sh:number,w:number,h:number): string {
  if(!value||!validVideoTransform(value)||sw<=0||sh<=0||w<=0||h<=0)return '';
  const before=fittedVideoSize(undefined,sw,sh,w,h),after=fittedVideoSize(value,sw,sh,w,h);
  return `scale(${after.width/before.width}) scale(${value.flipHorizontal?-1:1}, ${value.flipVertical?-1:1}) rotate(${value.rotation}deg)`;
}
export function drawOrientedVideo(ctx:CanvasRenderingContext2D,video:HTMLVideoElement|HTMLCanvasElement,value:VideoTransform|undefined,w:number,h:number) {
  const transform=value??DEFAULT_VIDEO_TRANSFORM;
  const sw='videoWidth' in video?video.videoWidth:video.width,sh='videoHeight' in video?video.videoHeight:video.height;
  const size=fittedVideoSize(transform,sw,sh,w,h);
  ctx.save();ctx.fillStyle='black';ctx.fillRect(0,0,w,h);ctx.translate(w/2,h/2);
  ctx.scale(transform.flipHorizontal?-1:1,transform.flipVertical?-1:1);ctx.rotate(transform.rotation*Math.PI/180);
  ctx.drawImage(video,-size.width/2,-size.height/2,size.width,size.height);ctx.restore();
}
