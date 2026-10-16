import {sampleRanges,type SampleRange} from './sourceEditing';

export type SourceUtility='invert'|'swap'|'mono'|'leftToRight'|'rightToLeft'|'repair';
export const SOURCE_UTILITIES:SourceUtility[]=['invert','swap','mono','leftToRight','rightToLeft','repair'];
export const MAX_CLICK_SECONDS=.001;
/** Each gap needs two untouched neighbours on either side; never use another gap as context. */
export function canRepairSource(ranges:SampleRange[],length:number,rate:number){
 const selected=sampleRanges(ranges,length),max=Math.max(1,Math.floor(rate*MAX_CLICK_SECONDS));
 return Number.isFinite(rate)&&rate>=8000&&rate<=384000&&selected.length>0&&selected.every((range,index)=>range.end-range.start<=max&&range.start>=2&&range.end+2<=length&&selected.every((other,j)=>j===index||other.end<=range.start-2||other.start>=range.end+2));
}
/** Conservative cubic interpolation: preserve edge slopes without overshooting the clean anchors. */
function repairGap(pcm:Float32Array,result:Float32Array,range:SampleRange){
 const left=pcm[range.start-1],right=pcm[range.end],span=range.end-range.start+1,delta=right-left;
 let a=(left-pcm[range.start-2])*span,b=(pcm[range.end+1]-right)*span;
 if(delta===0){a=0;b=0;}else{
  a=Math.sign(a)===Math.sign(delta)?a:0;b=Math.sign(b)===Math.sign(delta)?b:0;
  const norm=Math.hypot(a/delta,b/delta);if(norm>3){a*=3/norm;b*=3/norm;}
 }
 for(let i=range.start;i<range.end;i++){const x=(i-range.start+1)/span,x2=x*x,x3=x2*x;result[i]=Math.max(Math.min(left,right),Math.min(Math.max(left,right),(2*x3-3*x2+1)*left+(x3-2*x2+x)*a+(-2*x3+3*x2)*right+(x3-x2)*b));}
}
/** Static source operations: no channel-count, source-clock, routing or original PCM changes. */
export function processSourceUtility(channels:Float32Array[],ranges:SampleRange[],operation:SourceUtility,selectedChannel=-1,rate=48000):Float32Array[]{
 const length=channels[0]?.length??0,selected=sampleRanges(ranges,length);
 if(!length||channels.some(c=>c.length!==length)||!SOURCE_UTILITIES.includes(operation))throw new Error('sourceEditor.invalidPcm');
 if(!Number.isInteger(selectedChannel)||selectedChannel< -1||selectedChannel>=channels.length||!selected.length)throw new Error('sourceEditor.select');
 const stereo=operation!=='invert'&&operation!=='repair';
 if(stereo&&(channels.length!==2||selectedChannel!==-1))throw new Error('sourceTools.stereoRequired');
 if(operation==='repair'&&!canRepairSource(selected,length,rate))throw new Error('sourceTools.repairSelection');
 // Validate only the samples used by this operation, including repair context.
 for(const range of selected)for(let ch=0;ch<channels.length;ch++)if(stereo||selectedChannel<0||selectedChannel===ch){for(let i=range.start-(operation==='repair'?2:0);i<range.end+(operation==='repair'?2:0);i++)if(!Number.isFinite(channels[ch][i]))throw new Error('sourceEditor.invalidPcm');}
 const result=channels.map(c=>new Float32Array(c));
 for(const range of selected){
  if(operation==='repair'){for(let ch=0;ch<channels.length;ch++)if(selectedChannel<0||selectedChannel===ch)repairGap(channels[ch],result[ch],range);continue;}
  for(let i=range.start;i<range.end;i++){
   if(operation==='invert'){for(let ch=0;ch<channels.length;ch++)if(selectedChannel<0||selectedChannel===ch)result[ch][i]=-channels[ch][i];}
   else if(operation==='swap'){result[0][i]=channels[1][i];result[1][i]=channels[0][i];}
   else if(operation==='mono')result[0][i]=result[1][i]=channels[0][i]*.5+channels[1][i]*.5;
   else if(operation==='leftToRight')result[1][i]=channels[0][i];
   else if(operation==='rightToLeft')result[0][i]=channels[1][i];
  }
 }
 return result;
}

/** Audition context is separate from the samples repaired/persisted. Merge overlapping windows once. */
export function repairAuditionRanges(ranges:SampleRange[],length:number,rate:number,context:boolean):SampleRange[]{
 const selected=sampleRanges(ranges,length),padding=context?Math.round(rate*.1):0;
 return sampleRanges(selected.map(range=>({start:range.start-padding,end:range.end+padding})),length);
}
