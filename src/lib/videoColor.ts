import type { VideoColor } from '../types/audio';

export const DEFAULT_VIDEO_COLOR: VideoColor = {enabled:true, exposure:0, contrast:1, saturation:1};
export function validVideoColor(color: VideoColor | undefined): boolean {
  return color === undefined || (!!color && typeof color.enabled === 'boolean' &&
    Number.isFinite(color.exposure) && color.exposure >= -2 && color.exposure <= 2 &&
    Number.isFinite(color.contrast) && color.contrast >= 0 && color.contrast <= 2 &&
    Number.isFinite(color.saturation) && color.saturation >= 0 && color.saturation <= 2);
}
/** Browser filter order also defines the native RGB export order. */
export function videoColorFilter(color?: VideoColor): string {
  if (!color?.enabled || !validVideoColor(color)) return '';
  return `brightness(${2 ** color.exposure}) contrast(${color.contrast}) saturate(${color.saturation})`;
}

/** RGB reference for the small custom-transition preview; fade follows colour. */
export function applyVideoColorPixels(data: Uint8ClampedArray, color?: VideoColor, opacity = 1): void {
  const settings = color?.enabled && validVideoColor(color) ? color : DEFAULT_VIDEO_COLOR;
  const exposure = 2 ** settings.exposure, contrast = settings.contrast, saturation = settings.saturation;
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  for (let i=0; i<data.length; i+=4) {
    const r=clamp((clamp(data[i]*exposure)-127.5)*contrast+127.5);
    const g=clamp((clamp(data[i+1]*exposure)-127.5)*contrast+127.5);
    const b=clamp((clamp(data[i+2]*exposure)-127.5)*contrast+127.5);
    const luma=.213*r+.715*g+.072*b;
    data[i]=clamp(luma+(r-luma)*saturation)*opacity;
    data[i+1]=clamp(luma+(g-luma)*saturation)*opacity;
    data[i+2]=clamp(luma+(b-luma)*saturation)*opacity;
  }
}
