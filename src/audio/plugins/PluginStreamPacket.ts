import type {PluginStreamReply} from './NativePluginStream';
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
/** LE JSON-length, UTF-8 metadata, then planar LE float32 PCM. */
export function encodePluginPacket(metadata:Record<string,unknown>,samples:Float32Array[]){
 const header=encoder.encode(JSON.stringify(metadata));if(header.length>16384)throw new Error('Plugin packet metadata too large');
 const packet=new ArrayBuffer(4+header.length+samples.reduce((n,s)=>n+s.length*4,0)),view=new DataView(packet);view.setUint32(0,header.length,true);new Uint8Array(packet,4,header.length).set(header);let offset=4+header.length;
 for(const channel of samples)for(const value of channel){view.setFloat32(offset,value,true);offset+=4;}return packet;
}
export function decodePluginPacket(packet:ArrayBuffer,channels:number,frames:number,sampleRate:number):PluginStreamReply{
 if(!(packet instanceof ArrayBuffer)||packet.byteLength<4||packet.byteLength>1048576+32772)throw new Error('Invalid plugin reply packet');
 const view=new DataView(packet),length=view.getUint32(0,true);if(length>1048576||length>packet.byteLength-4)throw new Error('Invalid plugin reply header');
 const metadata=JSON.parse(decoder.decode(new Uint8Array(packet,4,length))) as PluginStreamReply['metadata'];
 if(metadata.channels!==channels||metadata.frames!==frames||metadata.sampleRate!==sampleRate||!Number.isSafeInteger(metadata.sequence)||metadata.sequence<1||!Number.isSafeInteger(metadata.latencySamples)||metadata.latencySamples<0||packet.byteLength!==4+length+channels*frames*4)throw new Error('Invalid plugin reply format');
 let offset=4+length;const samples=Array.from({length:channels},()=>{const pcm=new Float32Array(frames);for(let i=0;i<frames;i++){const value=view.getFloat32(offset,true);offset+=4;if(!Number.isFinite(value))throw new Error('Invalid plugin reply PCM');pcm[i]=value;}return pcm;});return {metadata,samples};
}
