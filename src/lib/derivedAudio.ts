/** Read our native IEEE-float WAV without a browser codec changing mono layout. */
export async function decodeDerivedAudio(bytes:Uint8Array,projectRate:number,signal?:AbortSignal):Promise<AudioBuffer>{
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),tag=(at:number)=>String.fromCharCode(...bytes.subarray(at,at+4));
 if(bytes.length<44||tag(0)!=='RIFF'||tag(8)!=='WAVE')throw new Error('Invalid derived WAV');
 let channels=0,rate=0,format=0,bits=0,data=0,size=0;
 for(let at=12;at+8<=bytes.length;){const length=view.getUint32(at+4,true);if(at+8+length>bytes.length)throw new Error('Truncated derived WAV');if(tag(at)==='fmt '&&length>=16){format=view.getUint16(at+8,true);channels=view.getUint16(at+10,true);rate=view.getUint32(at+12,true);bits=view.getUint16(at+22,true);if(format===65534&&length>=40&&view.getUint16(at+26,true)===32&&[3,0,0,0,0,0,16,0,128,0,0,170,0,56,155,113].every((byte,i)=>bytes[at+32+i]===byte))format=3;}if(tag(at)==='data'){data=at+8;size=length;}at+=8+length+(length%2);}
 if(format!==3||bits!==32||channels<1||channels>2||rate!==48000||!size||size%(4*channels)||size>256*1024*1024)throw new Error('Invalid derived PCM layout');
 const length=size/(4*channels),buffer=new AudioBuffer({length,numberOfChannels:channels,sampleRate:rate});
 for(let ch=0;ch<channels;ch++){const target=buffer.getChannelData(ch);for(let i=0;i<length;i++){const value=view.getFloat32(data+(i*channels+ch)*4,true);if(!Number.isFinite(value))throw new Error('Non-finite derived PCM');target[i]=value;if(i%262144===0){signal?.throwIfAborted();await new Promise(resolve=>setTimeout(resolve,0));}}}
 signal?.throwIfAborted();if(rate===projectRate)return buffer;
 const ctx=new OfflineAudioContext(channels,Math.round(length*projectRate/rate),projectRate),node=ctx.createBufferSource();node.buffer=buffer;node.connect(ctx.destination);node.start();const resampled=await ctx.startRendering();signal?.throwIfAborted();return resampled;
}
