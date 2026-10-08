declare module '*/flac.mjs' {
  interface FlacModule {
    isReady():boolean;
    onready:undefined|(()=>void);
    create_libflac_encoder(rate:number,channels:number,bits:number,level:number,frames:number,verify:boolean):number;
    init_encoder_stream(id:number,write:(data:Uint8Array,bytes:number)=>void,metadata?:(value:{min_framesize:number;max_framesize:number;total_samples:number;md5sum:string})=>void):number;
    FLAC__stream_encoder_process_interleaved(id:number,pcm:Int32Array,frames:number):boolean;
    FLAC__stream_encoder_finish(id:number):boolean;
    FLAC__stream_encoder_delete(id:number):void;
  }
  export default function createFlac(url:string):FlacModule;
}
