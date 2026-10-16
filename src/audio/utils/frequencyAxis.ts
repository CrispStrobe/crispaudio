export type FrequencyScale='linear'|'log';
/** Log1p keeps DC selectable while expanding low frequencies. Coordinates run bottom to top. */
export function frequencyPosition(hz:number,nyquist:number,scale:FrequencyScale='linear'){
 const value=Math.max(0,Math.min(nyquist,hz));return scale==='log'?Math.log1p(value/100)/Math.log1p(nyquist/100):value/nyquist;
}
export function positionFrequency(position:number,nyquist:number,scale:FrequencyScale='linear'){
 const value=Math.max(0,Math.min(1,position));return scale==='log'?100*Math.expm1(value*Math.log1p(nyquist/100)):value*nyquist;
}
