export interface MenuPoint {trackId:string;x:number;y:number}
export function openTrackMenu(trackId:string,x:number,y:number){window.dispatchEvent(new CustomEvent<MenuPoint>('crispaudio-track-menu',{detail:{trackId,x,y}}));}
