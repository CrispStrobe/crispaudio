import type {MenuPoint} from './trackHeaderMenu';
export function openPictureTrackMenu(trackId:string,x:number,y:number){
  window.dispatchEvent(new CustomEvent<MenuPoint>('crispaudio-picture-track-menu',{detail:{trackId,x,y}}));
}
export function openPictureTrackSettings(){window.dispatchEvent(new Event('crispaudio-picture-track-settings'));}
