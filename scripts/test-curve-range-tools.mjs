import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CRISPAUDIO_CHROME_EXECUTABLE});
try{
 for(const native of [false,true])for(const touch of [false,true]){
  const page=await browser.newPage({viewport:touch?{width:390,height:844}:{width:1280,height:900},hasTouch:touch,isMobile:touch}),errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5197');await page.waitForLoadState('networkidle');
  const labels=await page.evaluate(async native=>{
   const {default:React}=await import('/node_modules/.vite/deps/react.js'),client=await import('/node_modules/.vite/deps/react-dom_client.js'),{NativeParameterAutomation}=await import('/src/components/timeline/NativeParameterAutomation.tsx'),{ScopedEffectAutomation}=await import('/src/components/timeline/ScopedEffectAutomation.tsx'),{useProjectStore:store}=await import('/src/stores/projectStore.ts'),{default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage('de');
   const plugin={instanceId:'fx',pluginId:'au:range-fixture',name:'Gain',format:'AU',enabled:true,bypass:false,state:'opaque',parameters:{gain:-6},parameterAutomation:{gain:{min:-24,max:12,points:[{time:1,value:.25},{time:3,value:.75}]}}},effect={type:'delay',enabled:true,params:{time:.5,mix:.3},automation:{time:[{time:1,value:.5},{time:3,value:1.5}],mix:[{time:0,value:.3}]}};
   store.getState().loadProjectState({...store.getInitialState().project,id:'curve-ranges',duration:4,minimumDuration:4,masterEffects:native?[]:[effect],nativeEffects:native?[plugin]:[],tracks:[]},new Map());store.temporal.getState().clear();window.rangeStore=store;
   const host=document.createElement('div');document.body.append(host);(client.createRoot??client.default.createRoot)(host).render(React.createElement(native?NativeParameterAutomation:ScopedEffectAutomation,native?{snapshot:store.getState().project,scope:'master',target:{instanceId:'fx',address:'gain',min:-24,max:12},name:'Gain',unit:'dB',onClose:()=>{}}:{snapshot:store.getState().project,original:store.getState().project.masterEffects[0],scope:'master',index:0,onClose:()=>{}}));
   return Object.fromEntries(['curveRange.actions','curveRange.select','curveRange.start','curveRange.end','curveRange.copy','curveRange.fit','fxInspector.parameter','fxInspector.curve','fxInspector.apply'].map(key=>[key,i18n.t(key)]));
  },native);
  const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.evaluate(async node=>{await Promise.all(node.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})));});
  if(!native)await dialog.getByRole('combobox',{name:labels['fxInspector.parameter'],exact:true}).selectOption('time');
  const menu=async action=>{await dialog.getByRole('button',{name:labels['curveRange.actions'],exact:true}).click();await page.getByRole('menuitem',{name:labels[action],exact:true}).click();};
  await menu('curveRange.select');const graph=dialog.getByRole('img',{name:labels['fxInspector.curve'],exact:true});await graph.scrollIntoViewIfNeeded();const rect=await graph.boundingBox(),at=t=>({x:rect.x+(12+t/4*576)/600*rect.width,y:rect.y+rect.height/2}),start=at(1),end=at(2);
  if(touch){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[end]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else{await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:4});await page.mouse.up();}
  const input=key=>dialog.getByRole('spinbutton',{name:labels[key],exact:true});assert.ok(Math.abs(Number(await input('curveRange.start').inputValue())-1)<=1/48000);assert.ok(Math.abs(Number(await input('curveRange.end').inputValue())-2)<=1/48000);
  await menu('curveRange.copy');const before=await page.evaluate(()=>window.rangeStore.getState().project);
  for(const [key,value] of [['curveRange.end','4'],['curveRange.start','3']]){await input(key).fill(value);await input(key).press('Enter');}
  await menu('curveRange.fit');assert.deepEqual(await page.evaluate(()=>window.rangeStore.getState().project),before);
  await dialog.getByRole('button',{name:labels['curveRange.actions'],exact:true}).click();const items=await page.getByRole('menuitem').evaluateAll(nodes=>nodes.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));assert.ok(items.every(r=>r.height>=44&&r.width>=44));
  await page.screenshot({path:`/tmp/crispaudio-curve-range-${native?'native':'builtin'}-${touch?'touch':'desktop'}.png`});await page.getByRole('menu').press('Escape');assert.equal(await dialog.count(),1);assert.equal(await page.evaluate(()=>document.body.scrollWidth>innerWidth),false);
  await dialog.getByRole('button',{name:labels['fxInspector.apply'],exact:true}).click();const saved=await page.evaluate(native=>{const s=window.rangeStore.getState(),e=native?s.project.nativeEffects[0]:s.project.masterEffects[0];return{points:native?e.parameterAutomation.gain.points:e.automation.time,undo:window.rangeStore.temporal.getState().pastStates.length,state:e.state,mix:e.automation?.mix};},native);
  assert.ok(Math.abs(saved.points.find(p=>p.time===3).value-(native?.25:.5))<1e-6);assert.ok(Math.abs(saved.points.find(p=>p.time===4).value-(native?.5:1))<1e-6);assert.equal(saved.undo,1);if(native)assert.equal(saved.state,'opaque');else assert.deepEqual(saved.mix,[{time:0,value:.3}]);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({native,touch,rangeDrag:true,relativeCopy:true,fitPaste:true,localDraft:true,oneUndo:true,menu44:true,escapeKeepsInspector:true,noOverflow:true}));await page.close();
 }
}finally{await browser.close();}
