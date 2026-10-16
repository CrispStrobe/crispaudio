import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.CRISPAUDIO_PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CRISPAUDIO_CHROME_EXECUTABLE});
try{
 for(const touch of [false,true]){
  const page=await browser.newPage({viewport:touch?{width:390,height:844}:{width:1280,height:900},hasTouch:touch,isMobile:touch}),errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(process.env.CRISPAUDIO_TEST_URL||'http://127.0.0.1:5197');await page.waitForLoadState('networkidle');
  const labels=await page.evaluate(async()=>{
   const {default:React}=await import('/node_modules/.vite/deps/react.js'),client=await import('/node_modules/.vite/deps/react-dom_client.js'),{NativeParameterAutomation}=await import('/src/components/timeline/NativeParameterAutomation.tsx'),{useProjectStore:store}=await import('/src/stores/projectStore.ts'),{default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage('de');
   const effect={instanceId:'fx',pluginId:'au:validation-fixture',name:'Gain',format:'AU',enabled:true,bypass:false,state:'opaque-fixture',parameters:{gain:-6},parameterAutomation:{gain:{min:-24,max:12,points:[{time:1,value:.25},{time:3,value:.75}]}}};
   store.getState().loadProjectState({...store.getInitialState().project,id:'visual-curve',duration:4,minimumDuration:4,nativeEffects:[effect],tracks:[]},new Map());store.temporal.getState().clear();window.curveStore=store;
   const host=document.createElement('div');document.body.append(host);(client.createRoot??client.default.createRoot)(host).render(React.createElement(NativeParameterAutomation,{snapshot:store.getState().project,scope:'master',target:{instanceId:'fx',address:'gain',min:-24,max:12},name:'Verstärkung',unit:'dB',onClose:()=>{}}));
   return Object.fromEntries(['fxInspector.point','fxInspector.value','fxInspector.time','fxInspector.segment','fxInspector.curve','fxInspector.apply','fxInspector.clear'].map(key=>[key,i18n.t(key)]));
  });
  const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.evaluate(async node=>{await Promise.all(node.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));});assert.equal(await dialog.locator('details[open]').count(),0);
  const initialGraph=dialog.getByRole('img',{name:labels['fxInspector.curve'],exact:true}),initialRect=await initialGraph.boundingBox();
  const firstPoint={x:initialRect.x+156/600*initialRect.width,y:initialRect.y+114/160*initialRect.height};
  if(touch)await page.touchscreen.tap(firstPoint.x,firstPoint.y);else await page.mouse.click(firstPoint.x,firstPoint.y);
  assert.equal((await initialGraph.boundingBox()).y,initialRect.y,'Selecting the first point must not move the graph');
  const fill=async(label,value)=>{const input=dialog.getByRole('spinbutton',{name:label,exact:true});await input.fill(value);await input.press('Enter');};
  await fill(labels['fxInspector.point'],'1');await fill(`${labels['fxInspector.value']} (dB)`,'-6');await fill(labels['fxInspector.time'],'2');await dialog.getByRole('combobox',{name:labels['fxInspector.segment'],exact:true}).selectOption('step');
  assert.deepEqual(await page.evaluate(()=>window.curveStore.getState().project.nativeEffects[0].parameterAutomation.gain.points),[{time:1,value:.25},{time:3,value:.75}]);
  const graph=dialog.getByRole('img',{name:labels['fxInspector.curve'],exact:true});await graph.scrollIntoViewIfNeeded();const rect=await graph.boundingBox(),at=(time,value)=>({x:rect.x+(12+time/4*576)/600*rect.width,y:rect.y+(148-value*136)/160*rect.height}),start=at(2,.5),end=at(1.5,.6);
  if(touch){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[end]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
  else{await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:4});await page.mouse.up();}
  await page.screenshot({path:`/tmp/crispaudio-native-curve-${touch?'touch':'desktop'}.png`});
  assert.equal(await page.evaluate(()=>document.body.scrollWidth>innerWidth),false);await dialog.getByRole('button',{name:labels['fxInspector.apply'],exact:true}).click();
  const saved=await page.evaluate(()=>({points:window.curveStore.getState().project.nativeEffects[0].parameterAutomation.gain.points,state:window.curveStore.getState().project.nativeEffects[0].state,undo:window.curveStore.temporal.getState().pastStates.length}));
  assert.ok(Math.abs(saved.points[0].time-1.5)<=1/48000);assert.ok(Math.abs(saved.points[0].value-.6)<1e-6);assert.equal(saved.points[0].curve,'step');assert.equal(saved.state,'opaque-fixture');assert.equal(saved.undo,1);assert.deepEqual(errors,[]);
  await page.evaluate(()=>window.curveStore.temporal.getState().undo());assert.deepEqual(await page.evaluate(()=>window.curveStore.getState().project.nativeEffects[0].parameterAutomation.gain.points),[{time:1,value:.25},{time:3,value:.75}]);
  console.log(JSON.stringify({touch,germanLayout:true,noOverflow:true,recordCollapsed:true,firstSelectionStable:true,numericDomain:true,drag:true,draftOnly:true,oneUndo:true,opaqueStatePreserved:true}));await page.close();
 }
}finally{await browser.close();}
