import {expect,it,vi,beforeEach} from 'vitest';
vi.mock('../../../src/lib/native',()=>({isTauri:()=>false,isIOSApp:()=>false}));
class Context {
 state='suspended';sinkId='';sampleRate=48000;currentTime=0;
 resume=vi.fn(async()=>{this.state='running';});
 setSinkId=vi.fn(async(id:string)=>{if(id==='bad')throw new Error('Unavailable');this.sinkId=id;});
 addEventListener=vi.fn();
}
beforeEach(()=>{
 vi.resetModules();Object.defineProperty(Context.prototype,'setSinkId',{configurable:true,value:undefined});vi.stubGlobal('AudioContext',Context);Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{enumerateDevices:async()=>[{kind:'audioinput',deviceId:'mic',label:'Input'},{kind:'audiooutput',deviceId:'speaker',label:'Speakers'}]}});
});
it('resumes an interrupted context and routes both existing and newly created playback contexts',async()=>{
 const {createPlaybackContext,resumePlaybackContext,selectPlaybackOutput,playbackOutputs}=await import('../../../src/lib/audioOutput');
 const a=createPlaybackContext(),b=createPlaybackContext();await selectPlaybackOutput('speaker');
 (a as unknown as Context).state='interrupted';await resumePlaybackContext(a);await resumePlaybackContext(b);
 const c=createPlaybackContext();await resumePlaybackContext(c);
 for(const ctx of [a,b,c])expect((ctx as unknown as Context).sinkId).toBe('speaker');
 expect((a as unknown as Context).resume).toHaveBeenCalled();expect((await playbackOutputs()).devices.map(d=>d.id)).toEqual(['','speaker']);
});
it('rolls back every live context and keeps the selected device when routing fails',async()=>{
 const {createPlaybackContext,resumePlaybackContext,selectPlaybackOutput,playbackOutputs}=await import('../../../src/lib/audioOutput');
 const a=createPlaybackContext(),b=createPlaybackContext();await selectPlaybackOutput('speaker');
 await expect(selectPlaybackOutput('bad')).rejects.toThrow('Unavailable');
 expect((a as unknown as Context).sinkId).toBe('speaker');expect((b as unknown as Context).sinkId).toBe('speaker');expect((await playbackOutputs()).selectedId).toBe('speaker');
 const c=createPlaybackContext();await resumePlaybackContext(c);expect((c as unknown as Context).sinkId).toBe('speaker');
});
it('lets a context opened during a failed device change use the restored device',async()=>{
 const {createPlaybackContext,resumePlaybackContext,selectPlaybackOutput}=await import('../../../src/lib/audioOutput');
 const a=createPlaybackContext() as unknown as Context;await selectPlaybackOutput('speaker');
 let fail:(error:Error)=>void=()=>{};a.setSinkId.mockImplementationOnce(()=>new Promise<void>((_,reject)=>{fail=reject;}));
 const changing=selectPlaybackOutput('bad'),c=createPlaybackContext();fail(new Error('Disconnected'));await expect(changing).rejects.toThrow('Disconnected');await resumePlaybackContext(c);expect((c as unknown as Context).sinkId).toBe('speaker');
});
it('rejects a context that stays suspended rather than pretending playback started',async()=>{
 const {resumePlaybackContext}=await import('../../../src/lib/audioOutput');const ctx=new Context();ctx.resume.mockImplementationOnce(async()=>{});await expect(resumePlaybackContext(ctx as unknown as AudioContext)).rejects.toThrow('notRunning');
});
