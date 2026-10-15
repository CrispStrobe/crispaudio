/** Relative touch adjustment: precise near the start, faster over longer drags. */
export function scrubNumber(value:number,distance:number,step:number,min=-Infinity,max=Infinity){
 if(!Number.isFinite(value)||!Number.isFinite(distance)||!Number.isFinite(step)||step<=0)return value;
 const pixels=Math.abs(distance),direction=Math.sign(distance);
 const steps=Math.trunc(Math.min(pixels,64)/8)+4*Math.trunc(Math.max(0,Math.min(pixels-64,96))/8)+10*Math.trunc(Math.max(0,pixels-160)/8);
 return Math.min(max,Math.max(min,Number((value+direction*steps*step).toFixed(12))));
}
