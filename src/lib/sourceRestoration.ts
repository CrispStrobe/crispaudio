import {fft} from '../audio/utils/fft';
import {sampleRanges,type SampleRange} from './sourceEditing';
export type RestorationKind='dehum'|'spectral'|'declip';
export interface RestorationSettings {kind:RestorationKind;frequency:number;harmonics:number;width:number;low:number;high:number;reduction:number;ceiling:number}
export const DEFAULT_RESTORATION:RestorationSettings={kind:'dehum',frequency:50,harmonics:4,width:2,low:1800,high:2200,reduction:18,ceiling:0};
export interface RestorationResult {channels:Float32Array[];repaired:number;skipped:number;peak:number}
export const RESTORATION_BYTES=32*1024*1024,RESTORATION_SECONDS=30,SPECTRAL_SIZE=2048;
export function validateRestoration(channels:Float32Array[],ranges:SampleRange[],rate:number,channel:number,settings:RestorationSettings){
 const length=channels[0]?.length??0,selected=sampleRanges(ranges,length);
 if(!Number.isFinite(rate)||rate<8000||rate>192000||!length||!channels.length||channels.length>8||channels.some(c=>c.length!==length)||!Number.isInteger(channel)||channel< -1||channel>=channels.length)throw new Error('restoration.invalid');
 if(length*channels.length*4>RESTORATION_BYTES||selected.reduce((n,r)=>n+r.end-r.start,0)>rate*RESTORATION_SECONDS)throw new Error('restoration.budget');
 if(!selected.length||!['dehum','spectral','declip'].includes(settings.kind))throw new Error('restoration.invalid');
 const finite=(value:number,min:number,max:number)=>Number.isFinite(value)&&value>=min&&value<=max;
 if(settings.kind==='dehum'&&(selected.some(r=>r.end-r.start<rate*.02)||selected.reduce((n,r)=>n+Math.min(length,r.end+rate*2)-Math.max(0,r.start-rate*2),0)>rate*120))throw new Error('restoration.short');
 if(settings.kind==='dehum'&&(!finite(settings.frequency,40,70)||!Number.isInteger(settings.harmonics)||!finite(settings.harmonics,1,8)||!finite(settings.width,.5,10)))throw new Error('restoration.invalid');
 if(settings.kind==='spectral'&&(!finite(settings.low,0,rate/2)||!finite(settings.high,0,rate/2)||settings.high-settings.low<rate/SPECTRAL_SIZE||!finite(settings.reduction,0,60)||selected.some(r=>r.end-r.start<SPECTRAL_SIZE)))throw new Error('restoration.band');
 if(settings.kind==='declip'&&!finite(settings.ceiling,-24,0))throw new Error('restoration.invalid');
 return selected;
}
function edgeWeight(index:number,range:SampleRange,rate:number){const fade=Math.min(Math.round(rate*.005),Math.floor((range.end-range.start-1)/2));return fade>0?Math.min(1,(index-range.start)/fade,(range.end-1-index)/fade):1;}
/** RBJ notch coefficients: https://webaudio.github.io/Audio-EQ-Cookbook/audio-eq-cookbook.html */
function notch(samples:Float64Array,rate:number,frequency:number,width:number,reverse:boolean){
 const omega=2*Math.PI*frequency/rate,alpha=Math.sin(omega)/(2*(frequency/width)),a0=1+alpha,b0=1/a0,b1=-2*Math.cos(omega)/a0,b2=b0,a1=b1,a2=(1-alpha)/a0;
 let x1=0,x2=0,y1=0,y2=0;
 for(let n=0;n<samples.length;n++){const i=reverse?samples.length-1-n:n,x=samples[i],y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;samples[i]=y;x2=x1;x1=x;y2=y1;y1=y;}
}
function dehum(pcm:Float32Array,out:Float32Array,range:SampleRange,rate:number,settings:RestorationSettings){
 const padding=Math.round(rate*2),start=Math.max(0,range.start-padding),end=Math.min(pcm.length,range.end+padding),work=Float64Array.from(pcm.subarray(start,end));
 for(let harmonic=1;harmonic<=settings.harmonics;harmonic++){const frequency=settings.frequency*harmonic;if(frequency>=rate/2)break;notch(work,rate,frequency,settings.width,false);notch(work,rate,frequency,settings.width,true);}
 for(let i=range.start;i<range.end;i++){const wet=edgeWeight(i,range,rate);out[i]=pcm[i]+wet*(work[i-start]-pcm[i]);}
}
function spectral(pcm:Float32Array,out:Float32Array,range:SampleRange,rate:number,settings:RestorationSettings){
 if(settings.reduction===0)return;
 const size=SPECTRAL_SIZE,hop=size/4,span=range.end-range.start,sum=new Float64Array(span),weights=new Float64Array(span),re=new Float32Array(size),im=new Float32Array(size),window=Float32Array.from({length:size},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/size)),gain=10**(-settings.reduction/20),feather=rate/size*2;
 for(let start=range.start-size+hop;start<range.end;start+=hop){
  im.fill(0);for(let i=0;i<size;i++)re[i]=(pcm[start+i]??0)*window[i];fft(re,im);
  for(let k=0;k<size;k++){const frequency=Math.min(k,size-k)*rate/size,amount=Math.max(0,Math.min(1,(frequency-settings.low+feather)/feather,(settings.high+feather-frequency)/feather)),scale=1-amount*(1-gain);re[k]*=scale;im[k]*=-scale;}
  fft(re,im);
  for(let i=Math.max(0,range.start-start);i<Math.min(size,range.end-start);i++){const index=start+i-range.start;sum[index]+=re[i]/size*window[i];weights[index]+=window[i]**2;}
 }
 for(let i=range.start;i<range.end;i++){const index=i-range.start,wet=edgeWeight(i,range,rate);out[i]=pcm[i]+wet*(sum[index]/Math.max(weights[index],1e-12)-pcm[i]);}
}
function declip(pcm:Float32Array,out:Float32Array,range:SampleRange,rate:number,settings:RestorationSettings){
 const ceiling=10**(settings.ceiling/20),threshold=ceiling*(1-1e-4),max=Math.floor(rate*.002);let repaired=0,skipped=0;
 for(let i=range.start;i<range.end;){if(Math.abs(pcm[i])<threshold){i++;continue;}const start=i,sign=Math.sign(pcm[i]),plateau=Math.abs(pcm[i]);while(i<range.end&&Math.abs(pcm[i])>=threshold&&Math.abs(pcm[i]-pcm[start])<=ceiling*1e-6)i++;const end=i;
  if(end-start<2||end-start>max||Math.abs(plateau-ceiling)>ceiling*1e-4||start<2||end+2>pcm.length||pcm.subarray(start,end).some(v=>Math.sign(v)!==sign)||[pcm[start-2],pcm[start-1],pcm[end],pcm[end+1]].some(v=>Math.abs(v)>=plateau*(1-1e-6))){skipped++;continue;}
  const left=pcm[start-1],right=pcm[end],span=end-start+1,a=(left-pcm[start-2])*span,b=(pcm[end+1]-right)*span,values:number[]=[];
  for(let n=start;n<end;n++){const x=(n-start+1)/span,x2=x*x,x3=x2*x;values.push((2*x3-3*x2+1)*left+(x3-2*x2+x)*a+(-2*x3+3*x2)*right+(x3-x2)*b);}
  if(values.some(v=>!Number.isFinite(v)||Math.sign(v)!==sign||Math.abs(v)>ceiling*4)||!values.some(v=>Math.abs(v)>plateau*1.001)){skipped++;continue;}
  for(let n=start;n<end;n++)out[n]=sign*Math.max(Math.abs(pcm[n]),Math.abs(values[n-start]));repaired++;
 }
 return {repaired,skipped};
}
/** Pure offline processing, preserving source/channel/time boundaries. Worker owns cancellation. */
export function restoreSource(channels:Float32Array[],ranges:SampleRange[],rate:number,channel:number,settings:RestorationSettings):RestorationResult{
 const selected=validateRestoration(channels,ranges,rate,channel,settings),indices=channels.map((_,i)=>i).filter(i=>channel<0||channel===i);
 // Context is read for filtering/interpolation, but never written outside the selection.
 for(const index of indices)for(const range of selected){const pad=settings.kind==='dehum'?Math.round(rate*2):settings.kind==='spectral'?SPECTRAL_SIZE:2;for(let i=Math.max(0,range.start-pad);i<Math.min(channels[index].length,range.end+pad);i++)if(!Number.isFinite(channels[index][i]))throw new Error('sourceEditor.invalidPcm');}
 const result:RestorationResult={channels:channels.map(c=>new Float32Array(c)),repaired:0,skipped:0,peak:0};
 for(const index of indices)for(const range of selected){if(settings.kind==='dehum')dehum(channels[index],result.channels[index],range,rate,settings);else if(settings.kind==='spectral')spectral(channels[index],result.channels[index],range,rate,settings);else{const report=declip(channels[index],result.channels[index],range,rate,settings);result.repaired+=report.repaired;result.skipped+=report.skipped;}}
 if(settings.kind==='declip'&&!result.repaired)throw new Error('restoration.noPeaks');
 for(const index of indices)for(const range of selected)for(let i=range.start;i<range.end;i++)if(!Number.isFinite(result.channels[index][i]))throw new Error('sourceEditor.invalidPcm');
 for(let ch=0;ch<channels.length;ch++)for(let i=0;i<channels[ch].length;i++){const peak=Math.max(Math.abs(channels[ch][i]),Math.abs(result.channels[ch][i]));if(Number.isFinite(peak))result.peak=Math.max(result.peak,peak);}
 return result;
}
