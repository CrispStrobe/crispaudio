import type {GainPoint} from '../types/audio';
/** Dense captures use a bounded overview; every stored point remains addressable by index. */
export function curveOverview(points:GainPoint[]){
 if(points.length<=2048)return points;
 const result:GainPoint[]=[],stride=Math.ceil(points.length/512);
 for(let i=0;i<points.length;i+=stride){const chunk=points.slice(i,i+stride);let low=chunk[0],high=chunk[0];for(const point of chunk){if(point.value<low.value)low=point;if(point.value>high.value)high=point;}result.push(...[...new Set([chunk[0],low,high,chunk.at(-1)!])].sort((a,b)=>a.time-b.time));}
 return result;
}
