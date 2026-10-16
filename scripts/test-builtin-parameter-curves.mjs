import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CRISPAUDIO_CHROME_EXECUTABLE});
try{
 for(const touch of [false,true]){
  const page=await browser.newPage({viewport:touch?{width:390,height:844}:{width:1280,height:900},hasTouch:touch,isMobile:touch}),errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5197');await page.waitForLoadState('networkidle');
  const labels=await page.evaluate(async()=>{
   const {default:React}=await import('/node_modules/.vite/deps/react.js'),client=await import('/node_modules/.vite/deps/react-dom_client.js'),{ScopedEffectAutomation}=await import('/src/components/timeline/ScopedEffectAutomation.tsx'),{useProjectStore:store}=await import('/src/stores/projectStore.ts'),{default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage('de');
   const effect={type:'delay',enabled:true,params:{time:.5,mix:.3,feedback:.2},automation:{time:[{time:1,value:.5},{time:3,value:1.5}],mix:[{time:0,value:.3}]}};
   store.getState().loadProjectState({...store.getInitialState().project,id:'builtin-visual-curve',duration:4,minimumDuration:4,masterEffects:[effect],tracks:[]},new Map());store.temporal.getState().clear();window.curveStore=store;
   const host=document.createElement('div');document.body.append(host);(client.createRoot??client.default.createRoot)(host).render(React.createElement(ScopedEffectAutomation,{snapshot:store.getState().project,original:store.getState().project.masterEffects[0],scope:'master',index:0,onClose:()=>{}}));
   return Object.fromEntries(['fxInspector.point','fxInspector.value','fxInspector.time','fxInspector.segment','fxInspector.curve','fxInspector.apply','fxInspector.clear','fxInspector.parameter'].map(key=>[key,i18n.t(key)]));
  });
  const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.evaluate(async node=>{await Promise.all(node.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));});assert.equal(await dialog.locator('details[open]').count(),0);await dialog.getByRole('combobox',{name:labels['fxInspector.parameter'],exact:true}).selectOption('time');
  const initialGraph=dialog.getByRole('img',{name:labels['fxInspector.curve'],exact:true}),initialRect=await initialGraph.boundingBox();
  const firstPoint={x:initialRect.x+156/600*initialRect.width,y:initialRect.y+114/160*initialRect.height};
  if(touch)await page.touchscreen.tap(firstPoint.x,firstPoint.y);else await page.mouse.click(firstPoint.x,firstPoint.y);
  assert.equal((await initialGraph.boundingBox()).y,initialRect.y,'Selecting the first point must not move the graph');
  const fill=async(label,value)=>{const input=dialog.getByRole('spinbutton',{name:label,exact:true});await input.fill(value);await input.press('Enter');};
  await fill(labels['fxInspector.point'],'1');await fill(`${labels['fxInspector.value']} (ms)`,'1000');await fill(labels['fxInspector.time'],'2');await dialog.getByRole('combobox',{name:labels['fxInspector.segment'],exact:true}).selectOption('step');
  assert.deepEqual(await page.evaluate(()=>window.curveStore.getState().project.masterEffects[0].automation.time),[{time:1,value:.5},{time:3,value:1.5}]);
  const graph=dialog.getByRole('img',{name:labels['fxInspector.curve'],exact:true});await graph.scrollIntoViewIfNeeded();const rect=await graph.boundingBox(),at=(time,value)=>({x:rect.x+(12+time/4*576)/600*rect.width,y:rect.y+(148-value*136)/160*rect.height}),start=at(2,.5),end=at(1.5,.6);
  if(touch){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[end]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
  else{await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:4});await page.mouse.up();}
  await page.screenshot({path:`/tmp/crispaudio-builtin-curve-${touch?'touch':'desktop'}.png`});
  assert.equal(await page.evaluate(()=>document.body.scrollWidth>innerWidth),false);await dialog.getByRole('button',{name:labels['fxInspector.apply'],exact:true}).click();
  const saved=await page.evaluate(()=>({points:window.curveStore.getState().project.masterEffects[0].automation.time,mix:window.curveStore.getState().project.masterEffects[0].automation.mix,undo:window.curveStore.temporal.getState().pastStates.length}));
  assert.ok(Math.abs(saved.points[0].time-1.5)<=1/48000);assert.ok(Math.abs(saved.points[0].value-1.2)<1e-6);assert.equal(saved.points[0].curve,'step');assert.deepEqual(saved.mix,[{time:0,value:.3}]);assert.equal(saved.undo,1);assert.deepEqual(errors,[]);
  await page.evaluate(()=>window.curveStore.temporal.getState().undo());assert.deepEqual(await page.evaluate(()=>window.curveStore.getState().project.masterEffects[0].automation.time),[{time:1,value:.5},{time:3,value:1.5}]);
  console.log(JSON.stringify({touch,germanLayout:true,noOverflow:true,recordCollapsed:true,firstSelectionStable:true,numericDomain:true,drag:true,draftOnly:true,oneUndo:true,otherLanePreserved:true}));await page.close();
 }
}finally{await browser.close();}
