import {restoreSource,type RestorationSettings} from './sourceRestoration';
import type {SampleRange} from './sourceEditing';
self.onmessage=(event:MessageEvent<{channels:Float32Array[];ranges:SampleRange[];rate:number;channel:number;settings:RestorationSettings}>)=>{
 try{const {channels,ranges,rate,channel,settings}=event.data,result=restoreSource(channels,ranges,rate,channel,settings);self.postMessage(result,{transfer:result.channels.map(c=>c.buffer)});}catch(error){self.postMessage({error:error instanceof Error?error.message:String(error)});}
};
