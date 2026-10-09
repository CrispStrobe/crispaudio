// Private real-interview paste -> reviewed retained passages -> AV / CLI / undo checks.
import {pathToFileURL} from 'node:url';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href);
const browser=process.env.CRISPAUDIO_CHROME_EXECUTABLE?await chromium.launch({headless:true,executablePath:process.env.CRISPAUDIO_CHROME_EXECUTABLE}):await webkit.launch({headless:true,executablePath:process.env.CRISPAUDIO_WEBKIT_EXECUTABLE});
const root=process.env.CRISPAUDIO_SPEECH_FIXTURE,doc=JSON.parse(await readFile(`${root}/MVI_8251.crispaudio`,'utf8')),transcript=await readFile(`${root}/ux/spoken-085/cohere-words.json`,'utf8');
const output=`${root}/ux/keep-text-086`;await mkdir(output,{recursive:true});
for(const name of ['native.crispaudio','kept.wav','kept.mp4'])await rm(`${output}/${name}`,{force:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});await page.goto('http://127.0.0.1:5190');await page.waitForLoadState('networkidle');
 const before=await page.evaluate(async({doc,transcript})=>{
  const {useUIStore}=await import('/src/stores/uiStore.ts');useUIStore.getState().setActivePanel('timeline');
  const {useProjectStore}=await import('/src/stores/projectStore.ts');const {parseTranscript}=await import('/src/lib/transcript.ts');const {speechLayout}=await import('/src/lib/spokenEdits.ts');
  const p={...doc.project,transcript:parseTranscript(transcript),transcriptLayout:speechLayout(doc.project)};useProjectStore.getState().loadProjectState(p,new Map());useProjectStore.temporal.getState().clear();return p;
 },{doc,transcript});
 const all=before.transcript.flatMap(c=>c.words),kept=[...all.slice(0,4),...all.slice(26)];const pasted=all.slice(0,4).map(w=>w.text).join(' ')+'\n\n'+all.slice(26).map(w=>w.text).join(' ');
 await page.getByRole('button',{name:'Workspace',exact:true}).click();await page.getByRole('tab',{name:'Transcript',exact:true}).click();
 await page.getByRole('textbox',{name:'Text to keep',exact:true}).fill(pasted);await page.getByRole('button',{name:'Compare text',exact:true}).click();
 const plan=await page.evaluate(async text=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');const {planKeptText}=await import('/src/lib/keepSpeech.ts');return planKeptText(useProjectStore.getState().project,text);},pasted);
 assert.equal(plan.ambiguous,false);assert.equal(plan.ranges.length,2);assert.equal(plan.keptWords,kept.length);
 assert.equal(await page.getByRole('list',{name:'Passages to keep'}).getByRole('listitem').count(),2);
 await page.getByRole('button',{name:'Keep these audio/video passages',exact:true}).click();
 const after=await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return useProjectStore.getState().project;});
 assert.ok(Math.abs(after.duration-plan.duration)<1e-6);assert.deepEqual(after.transcript.flatMap(c=>c.words.map(w=>w.id)),kept.map(w=>w.id));
 for(let i=0;i<3;i++){assert.equal(after.tracks[i].segments.length,2);for(let j=0;j<2;j++)assert.ok(Math.abs(after.tracks[i].segments[j].sourceOffset-(before.tracks[i].segments[0].sourceOffset+plan.ranges[j].start))<1e-6);}
 assert.equal(after.video.clips.length,2);for(let j=0;j<2;j++)assert.ok(Math.abs(after.video.clips[j].sourceOffset-plan.ranges[j].start)<1e-6);
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.temporal.getState().undo();});assert.deepEqual(await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return useProjectStore.getState().project;}),before);
 await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.temporal.getState().redo();});
 const saved={...doc,project:after};await writeFile(`${output}/kept.crispaudio`,JSON.stringify(saved));await writeFile(`${output}/pasted.txt`,pasted);await writeFile(`${output}/plan.json`,JSON.stringify(plan,null,2));
 await page.evaluate(async saved=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');useProjectStore.getState().loadProjectState(saved.project,new Map());},saved);
 assert.deepEqual(await page.evaluate(async()=>{const {useProjectStore}=await import('/src/stores/projectStore.ts');return useProjectStore.getState().project.transcript;}),after.transcript);
 await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const {default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage('de');});
 assert.equal(await page.getByRole('textbox',{name:'Zu behaltender Text'}).count(),1);
 // Review fresh saved text to measure actual German controls, including long recipe label.
 await page.getByRole('button',{name:'Transkript ins Textfeld laden',exact:true}).click();await page.getByRole('button',{name:'Text vergleichen',exact:true}).click();
 const overflow=await page.getByRole('textbox',{name:'Zu behaltender Text'}).evaluate(el=>[...el.parentElement.querySelectorAll('button,textarea,select')].filter(child=>{const r=child.getBoundingClientRect();return r.width>0&&(r.left<0||r.right>innerWidth+1||child.scrollWidth>child.clientWidth+2);}).map(el=>el.textContent));assert.deepEqual(overflow,[]);
 if(process.env.CRISPAUDIO_CLI){
  await writeFile(`${output}/before.crispaudio`,JSON.stringify({...doc,project:before}));await writeFile(`${output}/recipe.json`,JSON.stringify([{op:'keep-words',wordIds:plan.wordIds}]));
  const cli=process.env.CRISPAUDIO_CLI;execFileSync(cli,['edit-project','--input',`${output}/before.crispaudio`,'--recipe',`${output}/recipe.json`,'--output',`${output}/native.crispaudio`]);
  const native=JSON.parse(await readFile(`${output}/native.crispaudio`,'utf8')).project;
  const rounded=x=>JSON.parse(JSON.stringify(x,(_,v)=>typeof v==='number'?Math.round(v*1e9)/1e9:v));const mapping=p=>({duration:p.duration,transcript:p.transcript,tracks:p.tracks.map(t=>t.segments.map(c=>[c.startTime,c.duration,c.sourceOffset])),video:p.video.clips.map(c=>[c.startTime,c.duration,c.sourceOffset])});assert.deepEqual(rounded(mapping(native)),rounded(mapping(after)));
  execFileSync(cli,['render-project','--input',`${output}/kept.crispaudio`,'--output',`${output}/kept.wav`]);execFileSync(cli,['render-project','--input',`${output}/kept.crispaudio`,'--output',`${output}/kept.mp4`,'--video']);
 }
 console.log(JSON.stringify({pasted,keptWords:kept.length,deletedWords:plan.deletedWords,sourcePassages:plan.ranges,duration:after.duration,allThreeMicsAndPicture:'passed',undoRedoReopen:'passed',germanPhone:'passed',cliParity:'passed'}));
}finally{await browser.close();}
