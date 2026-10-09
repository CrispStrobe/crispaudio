import type { TranscriptCue } from '../types/audio';
function clock(value:string):number {
  const parts=value.trim().replace(',','.').split(':').map(Number);
  return parts.reduce((total,n)=>total*60+n,0);
}
export function parseTranscript(text:string,offset=0):TranscriptCue[]{
  let cues: Omit<TranscriptCue,'id'>[];
  if(text.trim().startsWith('{')||text.trim().startsWith('[')){
    const doc=JSON.parse(text);offset+=Number(doc.crispaudioOffset??0);const segments=Array.isArray(doc)?doc:doc.segments??doc.cues??doc.transcript??doc.transcription;
    if(!Array.isArray(segments))throw new Error('Expected timed segments in JSON');
    const timing=(c:Record<string,unknown>)=>{const o=c.offsets as {from:number;to:number}|undefined;return {start:o?Number(o.from)/1000:Number(c.start??c.startTime),end:o?Number(o.to)/1000:Number(c.end??c.endTime)};};
    cues=segments.map(c=>({...timing(c),text:String(c.text??''),...(Array.isArray(c.words)?{words:c.words.map((w:Record<string,unknown>)=>({...timing(w),id:crypto.randomUUID(),text:String(w.text??'')}))}:{})}));
  }else{
    cues=text.replace(/^\uFEFF/,'').replace(/\r/g,'').split(/\n\s*\n/).flatMap(block=>{
      const lines=block.trim().split('\n'),at=lines.findIndex(line=>line.includes('-->'));
      if(at<0)return [];
      const [a,b]=lines[at].split('-->');return [{start:clock(a),end:clock(b.trim().split(/\s/)[0]),text:lines.slice(at+1).join('\n')}];
    });
  }
  if(!Number.isFinite(offset)||!cues.length||cues.some(c=>!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.end<=c.start||c.start+offset<0||!c.text.trim()))throw new Error('Invalid timed transcript');
  for(const c of cues)if(c.words?.some(w=>!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.end<=w.start||w.start<c.start-.02||w.end>c.end+.02||!w.text.trim()))throw new Error('Invalid word timestamps');
  for(const c of cues)if(c.words?.some((w,i)=>i>0&&w.start<c.words![i-1].start))throw new Error('Unordered word timestamps');
  return cues.map(c=>({...c,id:crypto.randomUUID(),start:c.start+offset,end:c.end+offset,words:c.words?.map(w=>({...w,start:w.start+offset,end:w.end+offset}))})).sort((a,b)=>a.start-b.start);
}
export function transcriptSrt(cues:TranscriptCue[]):string {
  const clock=(t:number)=>{const ms=Math.round(t*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
  return cues.map((c,i)=>`${i+1}\n${clock(c.start)} --> ${clock(c.end)}\n${c.text}\n`).join('\n');
}
export async function saveText(text:string,name:string,extension:string){
  if('__TAURI_INTERNALS__' in window){const {save}=await import('@tauri-apps/plugin-dialog'),{writeTextFile}=await import('@tauri-apps/plugin-fs');const path=await save({defaultPath:`${name}.${extension}`,filters:[{name:extension.toUpperCase(),extensions:[extension]}]});if(path)await writeTextFile(path,text);}
  else{const url=URL.createObjectURL(new Blob([text],{type:'text/plain'})),a=document.createElement('a');a.href=url;a.download=`${name}.${extension}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
