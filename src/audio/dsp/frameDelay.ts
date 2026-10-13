/** Exact integer-frame delay; no AudioParam interpolation or asynchronous processing. */
export class FrameDelay {
 private buffers:Float32Array[];private cursor=0;readonly frames:number;
 constructor(channels:number,frames:number){if(![1,2].includes(channels)||!Number.isSafeInteger(frames)||frames<0||frames>192000*180)throw new Error('Invalid frame delay');this.frames=frames;this.buffers=Array.from({length:channels},()=>new Float32Array(frames));}
 process(input:Float32Array[],output:Float32Array[]){for(let i=0;i<(output[0]?.length??0);i++){for(let ch=0;ch<output.length;ch++){const value=input[ch]?.[i]??input[0]?.[i]??0,buffer=this.buffers[ch];if(!buffer){output[ch][i]=0;continue;}if(!this.frames){output[ch][i]=value;continue;}output[ch][i]=buffer[this.cursor];buffer[this.cursor]=value;}if(this.frames)this.cursor=(this.cursor+1)%this.frames;}}
}
