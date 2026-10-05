import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

// Connect to the real WebView2 of the packaged executable. No mocked IPC.
if(process.platform!=='win32')throw Error('This check requires a Windows desktop runner');
const folder=resolve('qa/windows-window-smoke');await mkdir(folder,{recursive:true});
const report={platform:process.platform,cases:[]};const port=9384;
const app=spawn(resolve(process.argv[2]||'src-tauri/target/release/scaffold.exe'),[],{env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`},stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));let socket;
async function until(test,label,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){if(app.exitCode!==null)throw Error(`Canary exited (${app.exitCode}) during ${label}`);try{if(await test())return;}catch(error){if(Date.now()-start>timeout-500)throw error;}await delay(100);}throw Error(`Timed out: ${label}`);}
try{
 let target;await until(async()=>{const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();target=targets.find(t=>t.type==='page'&&t.url.includes('tauri.localhost'));return !!target?.webSocketDebuggerUrl;},'WebView2 inspector',45000);
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
 let next=0;const pending=new Map();
 socket.addEventListener('message',event=>{const result=JSON.parse(event.data);const waiter=pending.get(result.id);if(waiter){pending.delete(result.id);result.error?waiter.reject(Error(JSON.stringify(result.error))):waiter.resolve(result.result);}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`Inspector timeout: ${method}`));},20000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result?.value;};
 const invoke=(command,args={})=>evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`);
 const win=(command,args={})=>invoke(`plugin:window|${command}`,{label:'main',...args});
 const key=async(key,code)=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:code});await call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:code});};
 const click=expression=>evaluate(`${expression}.click()`);
 const textButton=(scope,text)=>`[...document.querySelectorAll(${JSON.stringify(scope)})].find(b=>b.textContent.trim()===${JSON.stringify(text)})`;
 const choose=async(name,text)=>{await click(`[...document.querySelectorAll('button[role="combobox"]')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(name)})`);await until(()=>evaluate(`!!document.querySelector('dialog.glass-select-popup[open]')`),'open glass select');await click(textButton('dialog.glass-select-popup[open] button',text));await delay(350);};
 const state=async()=>({fullscreen:await win('is_fullscreen'),maximized:await win('is_maximized'),size:await win('inner_size'),position:await win('outer_position'),ui:await evaluate(`({state:document.documentElement.dataset.windowState,fullscreen:document.documentElement.dataset.windowFullscreen,titlebar:getComputedStyle(document.querySelector('.window-titlebar')).display})`)});
 const finished=()=>until(()=>evaluate(`document.documentElement.dataset.windowTransition==='false'`),'fullscreen transition');
 const screenshot=async name=>{await delay(200);const {data}=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(resolve(folder,`${name}.png`),Buffer.from(data,'base64'));};
 await call('Runtime.enable');await call('Page.enable');await until(()=>evaluate(`!!document.querySelector('.window-titlebar')&&document.documentElement.dataset.windowTransition==='false'&&!!window.__TAURI_INTERNALS__`),'Canary UI');
 report.capabilities=await invoke('window_material_capabilities');assert.equal(report.capabilities.platform,'windows');
 await win('unmaximize');await win('set_size',{value:{Physical:{width:1080,height:680}}});await win('set_position',{value:{Physical:{x:70,y:40}}});await delay(300);
 const normal=await state();assert.equal(normal.fullscreen,false);
 await key('F11',122);await until(()=>win('is_fullscreen'),'enter fullscreen');await finished();assert.equal((await state()).ui.titlebar,'none');await screenshot('fullscreen');
 await key('F11',122);await until(async()=>!await win('is_fullscreen'),'exit fullscreen');await finished();const restored=await state();assert.deepEqual(restored.size,normal.size);assert.deepEqual(restored.position,normal.position);report.cases.push({name:'normal-fullscreen-normal',before:normal,after:restored});
 await win('maximize');await until(()=>win('is_maximized'),'maximize');await key('F11',122);await until(()=>win('is_fullscreen'),'maximized fullscreen');await finished();await key('F11',122);await until(async()=>!await win('is_fullscreen'),'restore maximized');await finished();assert.equal(await win('is_maximized'),true);report.cases.push({name:'maximized-fullscreen-maximized',state:await state()});
 await win('unmaximize');await delay(200);
 // Dispatch duplicates synchronously in the real renderer while its native IPC is pending.
 await evaluate(`(()=>{for(let n=0;n<6;n++)document.dispatchEvent(new KeyboardEvent('keydown',{key:'F11',bubbles:true}));})()`);await until(()=>win('is_fullscreen'),'rapid F11');await finished();assert.equal(await win('is_fullscreen'),true);await key('Escape',27);await until(async()=>!await win('is_fullscreen'),'Escape fullscreen');await finished();report.cases.push({name:'rapid-F11-and-Escape',state:await state()});
 await click(textButton('.sidebar button','Settings'));await until(()=>evaluate(`!!document.querySelector('.settings-modal')`),'Settings');
 for(const theme of ['Light','Dark','AMOLED']){
  await click(textButton('.mode-grid button',theme));await until(()=>evaluate(`document.documentElement.dataset.mode===${JSON.stringify(theme.toLowerCase())}`),'theme');
  for(const material of report.capabilities.supported){
   const names={solid:'Solid',transparent:'Transparent',acrylic:'Acrylic',mica:'Mica','mica-alt':'Mica Alt'};await choose('Window Material',names[material]);
   const actual=await evaluate(`document.documentElement.dataset.windowMaterial`);const root=await evaluate(`getComputedStyle(document.documentElement).backgroundColor`);if(actual!=='solid')assert.equal(root,'rgba(0, 0, 0, 0)');
   await screenshot(`${theme.toLowerCase()}-${material}`);report.cases.push({name:'material',theme,requested:material,actual,root});
   await key('F11',122);await until(()=>win('is_fullscreen'),'material fullscreen');await finished();await delay(250);await screenshot(`${theme.toLowerCase()}-${material}-fullscreen`);assert.equal((await state()).ui.titlebar,'none');
   // Settings consumes the first Escape; true fullscreen consumes the next.
   await key('Escape',27);await until(()=>evaluate(`!document.querySelector('.settings-modal')`),'Escape Settings');assert.equal(await win('is_fullscreen'),true);
   await key('Escape',27);await until(async()=>!await win('is_fullscreen'),'Escape native fullscreen');await finished();
   await click(textButton('.sidebar button','Settings'));await until(()=>evaluate(`!!document.querySelector('.settings-modal')`),'reopen Settings');
  }
 }
 const slider=async(name,value)=>{await evaluate(`(()=>{const e=[...document.querySelectorAll('input[type=range]')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(name)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);};
 await slider('Window transparency',77);await slider('Surface opacity',74);await slider('UI surface blur',23);await choose('Tint intensity','Strong');
 const custom=await evaluate(`JSON.parse(localStorage.getItem('canary-visual'))`);assert.equal(custom.windowTransparency,77);assert.equal(custom.surfaceOpacity,74);assert.equal(custom.surfaceBlur,23);assert.equal(custom.tint,'strong');report.cases.push({name:'custom-opacity-blur-tint',windowTransparency:custom.windowTransparency,surfaceOpacity:custom.surfaceOpacity,surfaceBlur:custom.surfaceBlur,tint:custom.tint});
 await click(textButton('[role=group][aria-label="Sidebar position"] button','Right'));await key('F11',122);await until(()=>win('is_fullscreen'),'right-sidebar fullscreen');await finished();await screenshot('right-sidebar-fullscreen');await key('Escape',27);await until(()=>evaluate(`!document.querySelector('.settings-modal')`),'close right-sidebar Settings');assert.equal(await win('is_fullscreen'),true);await key('Escape',27);await until(async()=>!await win('is_fullscreen'),'right-sidebar restore');await finished();await click(textButton('.sidebar button','Settings'));await until(()=>evaluate(`!!document.querySelector('.settings-modal')`),'reopen Settings');
 await click(textButton('.settings-nav button','Window'));await choose('Window controls style','Traffic Lights');await choose('Control position','Left');await screenshot('left-traffic-controls');
 await choose('Titlebar branding','Text');assert.equal(await evaluate(`document.querySelectorAll('.window-brand img').length`),0);await screenshot('centered-text-brand');
 await click(`[...document.querySelectorAll('button[role="combobox"]')].find(b=>b.getAttribute('aria-label')==='Titlebar branding')`);await screenshot('glass-dropdown');await key('Escape',27);assert.equal(await evaluate(`!!document.querySelector('.settings-modal')`),true);
 report.status='success';console.log('WINDOWS_NATIVE_FULLSCREEN_GEOMETRY_MATERIAL_THEMES_DROPDOWNS_VERIFIED');
}catch(error){report.status='failure';report.error=String(error);throw error;}
finally{await writeFile(resolve(folder,'result.json'),JSON.stringify(report,null,2));socket?.close();app.kill();}
