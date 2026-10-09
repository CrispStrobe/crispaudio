// Optional real-WebKit speech deletion, undo/reopen and AV rendering check.
// Private recordings/transcripts remain outside the repository.
import {pathToFileURL} from 'node:url';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const {webkit,chromium}=await import(pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href);
const browser=process.env.CRISPAUDIO_CHROME_EXECUTABLE?await chromium.launch({headless:true,executablePath:process.env.CRISPAUDIO_CHROME_EXECUTABLE}):await webkit.launch({headless:true,executablePath:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE});
const root=process.env.CRISPAUDIO_SPEECH_FIXTURE;
const doc=JSON.parse(await readFile(`${root}/MVI_8251.crispaudio`,'utf8'));
const out=`${root}/ux/spoken-085`;await mkdir(out,{recursive:true});
for(const name of ['native-deleted.crispaudio','deleted-word.wav','deleted-word.mp4'])await rm(`${out}/${name}`,{force:true});
const transcript=await readFile(`${out}/cohere-words.json`,'utf8');
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});await page.goto('http://127.0.0.1:5190');await page.waitForLoadState('networkidle');
 const before=await page.evaluate(async({doc,transcript})=>{
  const {useUIStore}=await import('/src/stores/uiStore.ts');useUIStore.getState().setActivePanel('timeline');
  const {parseTranscript}=await import('/src/lib/transcript.ts');
  const {useProjectStore}=await import('/src/stores/projectStore.ts');
  const {speechLayout}=await import('/src/lib/spokenEdits.ts');
  const p={...doc.project,transcript:parseTranscript(transcript),transcriptLayout:speechLayout(doc.project)};useProjectStore.getState().loadProjectState(p,new Map());useProjectStore.temporal.getState().clear();return p;
 },{doc,transcript});
 await page.getByRole('button',{name:'Workspace',exact:true}).click();
 await page.getByRole('tab',{name:'Transcript',exact:true}).click();
 const editor=page.getByRole('group',{name:'Spoken words (Delete cuts audio and video)'});
 await editor.getByRole('button',{name:'Muslimen',exact:true}).click();await page.keyboard.press('Delete');
 const after=await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return useProjectStore.getState().project;});
 assert.ok(Math.abs(before.duration-after.duration-.52)<1e-6);
 assert.equal(after.transcript[0].text.includes('Muslimen'),false);
 for(let i=0;i<3;i++){assert.equal(after.tracks[i].segments.length,before.tracks[i].segments.length+1);assert.ok(Math.abs(after.tracks[i].segments[1].sourceOffset-(before.tracks[i].segments[0].sourceOffset+45.48))<1e-6);}
 assert.ok(Math.abs(after.video.clips[1].sourceOffset-((before.video.clips?.[0]?.sourceOffset??0)+45.48))<1e-6);
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.temporal.getState().undo();});
 assert.deepEqual(await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return useProjectStore.getState().project;}),before);
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.temporal.getState().redo();});
 // Native recipe must produce the same clocks and source mapping.
 if(process.env.CRISPAUDIO_CLI){
  const input=`${out}/before-word.crispaudio`,recipe=`${out}/delete-word.json`,output=`${out}/native-deleted.crispaudio`;
  await writeFile(input,JSON.stringify({...doc,project:before}));await writeFile(recipe,JSON.stringify([{op:'delete-word',wordId:before.transcript[0].words.find(w=>w.text==='Muslimen').id}]));
  execFileSync(process.env.CRISPAUDIO_CLI,['edit-project','--input',input,'--recipe',recipe,'--output',output]);
  const native=JSON.parse(await readFile(output,'utf8')).project;
  assert.ok(Math.abs(native.duration-after.duration)<1e-6);const rounded=x=>JSON.parse(JSON.stringify(x,(_,v)=>typeof v==='number'?Math.round(v*1e9)/1e9:v));assert.deepEqual(rounded(native.transcript),rounded(after.transcript));
  const mapping=p=>p.tracks.map(t=>t.segments.map(c=>[c.startTime,c.duration,c.sourceOffset]));assert.deepEqual(rounded(mapping(native)),rounded(mapping(after)));
 }
 const saved=JSON.stringify({...doc,project:after});await writeFile(`${out}/deleted-word.crispaudio`,saved);
 await page.evaluate(async json=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.getState().loadProjectState(JSON.parse(json).project,new Map());},saved);
 assert.equal(await editor.getByRole('button',{name:'Muslimen',exact:true}).count(),0);
 await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const {default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage('de');});
 assert.equal(await page.getByRole('group',{name:'Gesprochene Wörter (Entf schneidet Ton und Bild)'}).count(),1);
 if(process.env.CRISPAUDIO_CLI){
  execFileSync(process.env.CRISPAUDIO_CLI,['render-project','--input',`${out}/deleted-word.crispaudio`,'--output',`${out}/deleted-word.wav`,'--start','44','--end','46']);
  execFileSync(process.env.CRISPAUDIO_CLI,['render-project','--input',`${out}/deleted-word.crispaudio`,'--output',`${out}/deleted-word.mp4`,'--video','--start','44','--end','46']);
 }
 console.log(JSON.stringify({realWords:before.transcript.flatMap(c=>c.words).length,deleted:'Muslimen',cut:[44.96,45.48],durationRemoved:.52,allThreeMicsAndPicture:'passed',undoRedoReopen:'passed',germanPhoneEditor:'passed'}));
}finally{await browser.close();}
