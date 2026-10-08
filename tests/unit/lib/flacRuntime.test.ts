import {it,expect,vi,beforeEach} from 'vitest';
const mock=vi.hoisted(()=>({write:undefined as undefined|((bytes:Uint8Array,n:number)=>void),metadata:undefined as undefined|((value:unknown)=>void),process:vi.fn(),delete:vi.fn()}));
vi.mock('../../../src/lib/flac/flac.mjs',()=>({default:()=>({
 isReady:()=>true,create_libflac_encoder:()=>1,
 init_encoder_stream:(_id:number,write:typeof mock.write,metadata:typeof mock.metadata)=>{mock.write=write;mock.metadata=metadata;return 0;},
 FLAC__stream_encoder_process_interleaved:mock.process,
 FLAC__stream_encoder_finish:()=>{const bytes=new Uint8Array(42);bytes.set([102,76,97,67]);mock.write!(bytes,42);mock.metadata!({min_framesize:3,max_framesize:5,total_samples:2,md5sum:'0123456789abcdef0123456789abcdef'});return true;},
 FLAC__stream_encoder_delete:mock.delete,
})}));
import {encodeFlac} from '../../../src/lib/flacRuntime';
beforeEach(()=>{mock.process.mockReset().mockReturnValue(true);mock.delete.mockClear();});
it('rejects invalid layouts before loading an encoder',async()=>{
 for(const [channels,rate,length] of [[0,48000,4],[2,48000,3],[2,NaN,4],[9,48000,9]])await expect(encodeFlac(new Float32Array(length),channels,rate)).rejects.toThrow('layout');
});
it('quantizes signed 24-bit samples and writes final stream checksum/count',async()=>{
 const pcm=new Float32Array([-1,1,-.5,.5]);const bytes=await encodeFlac(pcm,2,48000);
 const block=mock.process.mock.calls[0][1] as Int32Array;
 expect([...block.slice(0,4)]).toEqual([-8388608,8388607,-4194304,4194304]);
 expect(new DataView(bytes).getBigUint64(18)&((1n<<36n)-1n)).toBe(2n);
 expect([...new Uint8Array(bytes).slice(26,30)]).toEqual([1,35,69,103]);expect(mock.delete).toHaveBeenCalledOnce();
});
it('releases encoder state on non-finite samples or encoding failure',async()=>{
 await expect(encodeFlac(new Float32Array([NaN]),1,48000)).rejects.toThrow('Non-finite');expect(mock.delete).toHaveBeenCalledOnce();
 mock.process.mockReturnValue(false);await expect(encodeFlac(new Float32Array([0]),1,48000)).rejects.toThrow('encoding failed');expect(mock.delete).toHaveBeenCalledTimes(2);
});
