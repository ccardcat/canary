import {spawn,execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openSync,closeSync} from 'node:fs';
import assert from 'node:assert/strict';
import {materialPresetQA} from './material-preset-qa.mjs';
import {discoverInstallQA} from './discover-install-qa.mjs';

// Connect to the real WebView2 of the packaged executable. No mocked IPC.
if(process.platform!=='win32')throw Error('This check requires a Windows desktop runner');
const folder=resolve('qa/windows-window-smoke');await mkdir(folder,{recursive:true});
const qaDataRoot=resolve(folder,'data-'+randomUUID());
const report={platform:process.platform,cases:[],captures:[],thumbnails:[]};const port=9384;
const stdout=openSync(resolve(folder,'app-stdout.log'),'w'),stderr=openSync(resolve(folder,'app-stderr.log'),'w');
const launch=()=>spawn(resolve(process.argv[2]||'src-tauri/target/release/scaffold.exe'),[],{windowsHide:true,env:{...process.env,CANARY_QA_DATA_ROOT:qaDataRoot,CANARY_STARTUP_LOG:resolve(folder,'app-startup.log'),WEBVIEW2_USER_DATA_FOLDER:resolve(folder,'webview-data'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`},stdio:['ignore',stdout,stderr]});
let app,launchError;
const delay=ms=>new Promise(r=>setTimeout(r,ms));let socket;
async function until(test,label,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){if(launchError)throw launchError;if(app?.exitCode!=null)throw Error(`Canary exited (${app.exitCode}) during ${label}`);try{if(await test())return;}catch(error){if(Date.now()-start>timeout-500)throw error;}await delay(100);}throw Error(`Timed out: ${label}`);}
// Every suite/restart must release its inspector before a new process is launched.
const inspectorReleased=()=>until(async()=>{try{await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1000)});return false;}catch(error){if(error.name==='TimeoutError')return false;return true;}},'previous WebView2 inspector shutdown');
try{
 await inspectorReleased();app=launch();app.once('error',error=>{launchError=error;});
 let target;await until(async()=>{const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();target=targets.find(t=>t.type==='page'&&t.url.includes('tauri.localhost'));return !!target?.webSocketDebuggerUrl;},'WebView2 inspector',45000);
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
 let next=0;const pending=new Map();
 const receive=event=>{const result=JSON.parse(event.data);const waiter=pending.get(result.id);if(waiter){pending.delete(result.id);result.error?waiter.reject(Error(JSON.stringify(result.error))):waiter.resolve(result.result);}};
 socket.addEventListener('message',receive);
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`Inspector timeout: ${method}`));},20000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result?.value;};
 const readyUI=()=>until(()=>evaluate(`document.readyState==='complete'&&document.documentElement?.dataset.startup==='ready'&&!!document.querySelector('.window-titlebar')&&document.documentElement.dataset.windowTransition==='false'&&!!window.__TAURI_INTERNALS__?.invoke&&!window.__canarySecurityProbe`),'stable Canary main UI',30000);
 // Seed preferences only after startup is stable: pagehide flushes the running UI's state.
 const reloadWithPreferences=async source=>{
  await readyUI();
  const marker=String(Date.now())+Math.random();const {identifier}=await call('Page.addScriptToEvaluateOnNewDocument',{source:source+';window.__canaryQASeed='+JSON.stringify(marker)});
  try{await call('Page.reload');await until(()=>evaluate('window.__canaryQASeed==='+JSON.stringify(marker)),'preference seed');await readyUI();}finally{await call('Page.removeScriptToEvaluateOnNewDocument',{identifier});}
 };
 const invoke=(command,args={})=>evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`);
 const win=(command,args={})=>invoke(`plugin:window|${command}`,{label:'main',...args});
 const key=async(key,code)=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:code});await call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:code});};
 const click=async expression=>{await until(()=>evaluate(`!!(${expression})`),'render click target');return evaluate(`(${expression}).click()`);};
 const textButton=(scope,text)=>`[...document.querySelectorAll(${JSON.stringify(scope)})].find(b=>b.textContent.trim()===${JSON.stringify(text)}||b.getAttribute('aria-label')===${JSON.stringify(text)})`;
 const choose=async(name,text)=>{await until(()=>evaluate(`[...document.querySelectorAll('button[role="combobox"]')].some(b=>b.getAttribute('aria-label')===${JSON.stringify(name)})`),`render ${name}`);await evaluate(`(()=>{const control=[...document.querySelectorAll('button[role="combobox"]')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(name)});for(let details=control?.closest('details');details;details=details.parentElement?.closest('details'))details.open=true;})()`);await click(`[...document.querySelectorAll('button[role="combobox"]')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(name)})`);await until(()=>evaluate(`!!document.querySelector('dialog.glass-select-popup[open]')`),'open glass select');await click(textButton('dialog.glass-select-popup[open] button',text));await delay(350);};
 const section=async id=>{
  await until(()=>evaluate(`!!document.querySelector('[data-settings-section="${id}"]')`),'settings navigation');
  await evaluate(`(()=>{const button=document.querySelector('[data-settings-section="${id}"]');const toggle=button.closest('[data-settings-group]')?.querySelector('.settings-group-toggle');if(toggle?.getAttribute('aria-expanded')==='false')toggle.click();button.click();})()`);
  await until(()=>evaluate(`(()=>{const content=document.querySelector('[data-settings-content="${id}"][aria-hidden="false"]');return !!content&&getComputedStyle(content).opacity==='1';})()`),'settings section '+id);
 };
 const state=async()=>({fullscreen:await win('is_fullscreen'),maximized:await win('is_maximized'),size:await win('inner_size'),position:await win('outer_position'),ui:await evaluate(`({state:document.documentElement.dataset.windowState,fullscreen:document.documentElement.dataset.windowFullscreen,titlebar:getComputedStyle(document.querySelector('.window-titlebar')).display})`)});
 const finished=()=>until(()=>evaluate(`document.documentElement.dataset.windowTransition==='false'`),'fullscreen transition');
 const screenshot=async name=>{
  await delay(200);const file=resolve(folder,`${name}.png`);const thumbnail=resolve(folder,`${name}-preview.png`);const q=value=>"'"+value.replaceAll("'","''")+"'";
  try{
   const size=await win('inner_size'),position=await win('outer_position'),fullscreen=await win('is_fullscreen');
   const command=`$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Drawing;Add-Type -AssemblyName System.Windows.Forms;Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class CanaryQaWindow{[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();}';$canaryHandle=(Get-Process -Id ${app.pid}).MainWindowHandle;$area=[Windows.Forms.Screen]::FromHandle($canaryHandle).${fullscreen?'Bounds':'WorkingArea'};if(${position.x} -lt $area.Left -or ${position.y} -lt $area.Top -or (${position.x}+${size.width}) -gt $area.Right -or (${position.y}+${size.height}) -gt $area.Bottom){throw 'Native window extends outside the visible desktop working area'};[CanaryQaWindow]::SetForegroundWindow($canaryHandle)|Out-Null;Start-Sleep -Milliseconds 150;if([CanaryQaWindow]::GetForegroundWindow() -ne $canaryHandle){throw 'Native desktop focus unavailable'};$bitmap=[Drawing.Bitmap]::new(${size.width},${size.height},[Drawing.Imaging.PixelFormat]::Format24bppRgb);$graphics=[Drawing.Graphics]::FromImage($bitmap);$graphics.CopyFromScreen(${position.x},${position.y},0,0,$bitmap.Size);$colors=[Collections.Generic.HashSet[int]]::new();for($gx=0;$gx -lt 10;$gx++){for($gy=0;$gy -lt 10;$gy++){[void]$colors.Add($bitmap.GetPixel([int](($gx+.5)*$bitmap.Width/10),[int](($gy+.5)*$bitmap.Height/10)).ToArgb())}};if($colors.Count -lt 2){throw 'Desktop capture has no painted content'};$bitmap.Save(${q(file)},[Drawing.Imaging.ImageFormat]::Png);$preview=[Drawing.Bitmap]::new(400,[int](400*$bitmap.Height/$bitmap.Width));$pg=[Drawing.Graphics]::FromImage($preview);$pg.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;$pg.DrawImage($bitmap,0,0,$preview.Width,$preview.Height);$preview.Save(${q(thumbnail)},[Drawing.Imaging.ImageFormat]::Png);$pg.Dispose();$preview.Dispose();$graphics.Dispose();$bitmap.Dispose();`;
   execFileSync('pwsh.exe',['-NoProfile','-WindowStyle','Hidden','-Command',command],{windowsHide:true,timeout:15000,stdio:'pipe'});report.captures.push({name,method:'native-desktop'});
   if(['dark-acrylic','light-acrylic','dark-mica-fullscreen'].includes(name))report.thumbnails.push({name,method:'native-desktop',png:(await readFile(thumbnail)).toString('base64')});
  }catch(error){
   const {data}=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(file,Buffer.from(data,'base64'));report.captures.push({name,method:'webview-only',desktopUnavailable:String(error).split('\n')[0]});
  }
 };

 await call('Runtime.enable');await call('Page.enable');await readyUI();
 const initial=await invoke('backend_snapshot',{localOnly:true});assert.equal(resolve(initial.data_folder),qaDataRoot,'Native window QA must use this process and isolated storage');assert.deepEqual(initial.accounts,[]);
 // This suite deliberately exercises Hero geometry; fresh-user Hero stays off.
 await reloadWithPreferences(`localStorage.setItem('canary-language','en');localStorage.setItem('canary-visual',JSON.stringify({...JSON.parse(localStorage.getItem('canary-visual')||'{}'),showHero:true}));`);
 await invoke('save_collection_preferences',{preferences:{...initial.settings,close_to_tray:false}});
 report.capabilities=await invoke('window_material_capabilities');assert.equal(report.capabilities.platform,'windows');
 await win('unmaximize');await win('set_size',{value:{Physical:{width:900,height:620}}});await win('set_position',{value:{Physical:{x:50,y:40}}});await delay(300);
 const normal=await state();assert.equal(normal.fullscreen,false);
 await key('F11',122);await until(()=>win('is_fullscreen'),'enter fullscreen');await finished();assert.equal((await state()).ui.titlebar,'none');await screenshot('fullscreen');
 await key('F11',122);await until(async()=>!await win('is_fullscreen'),'exit fullscreen');await finished();const restored=await state();assert.deepEqual(restored.size,normal.size);assert.deepEqual(restored.position,normal.position);report.cases.push({name:'normal-fullscreen-normal',before:normal,after:restored});
 await win('maximize');await until(()=>win('is_maximized'),'maximize');await key('F11',122);await until(()=>win('is_fullscreen'),'maximized fullscreen');await finished();await key('F11',122);await until(async()=>!await win('is_fullscreen'),'restore maximized');await finished();assert.equal(await win('is_maximized'),true);report.cases.push({name:'maximized-fullscreen-maximized',state:await state()});
 await win('unmaximize');await delay(200);
 // Dispatch duplicates synchronously in the real renderer while its native IPC is pending.
 await evaluate(`(()=>{for(let n=0;n<6;n++)document.dispatchEvent(new KeyboardEvent('keydown',{key:'F11',bubbles:true}));})()`);await until(()=>win('is_fullscreen'),'rapid F11');await finished();assert.equal(await win('is_fullscreen'),true);await key('Escape',27);await until(async()=>!await win('is_fullscreen'),'Escape fullscreen');await finished();report.cases.push({name:'rapid-F11-and-Escape',state:await state()});
 await click(textButton('.sidebar button','Settings'));await until(()=>evaluate(`!!document.querySelector('.settings-modal')`),'Settings');
 for(const theme of ['Light','Dark','AMOLED']){
  await section('appearance');await click(textButton('.mode-grid button',theme));await until(()=>evaluate(`document.documentElement.dataset.mode===${JSON.stringify(theme.toLowerCase())}`),'theme');
  for(const material of report.capabilities.supported){
   await section('background');
   // Selecting Solid hides the native section; Desktop exposes it again.
   await click("[...document.querySelectorAll('.background-source-options button')].find(b=>b.querySelector('b')?.textContent==='Desktop')");
   const names={solid:'Solid',transparent:'Transparent',acrylic:'Acrylic',mica:'Mica','mica-alt':'Mica Alt'};await choose('Window Material',names[material]);
   const actual=await evaluate(`document.documentElement.dataset.windowMaterial`);const root=await evaluate(`getComputedStyle(document.documentElement).backgroundColor`);if(actual!=='solid')assert.equal(root,'rgba(0, 0, 0, 0)');
   await screenshot(`${theme.toLowerCase()}-${material}`);report.cases.push({name:'material',theme,requested:material,actual,root});
   await key('F11',122);await until(()=>win('is_fullscreen'),'material fullscreen');await finished();await delay(250);await screenshot(`${theme.toLowerCase()}-${material}-fullscreen`);assert.equal((await state()).ui.titlebar,'none');
   if(['mica','mica-alt'].includes(actual))await until(()=>evaluate(`!['mica','mica-alt'].includes(document.documentElement.dataset.windowMaterial)`),'fullscreen backdrop fallback');
   const fullscreenMaterial=await evaluate(`document.documentElement.dataset.windowMaterial`);
   // Settings consumes the first Escape; true fullscreen consumes the next.
   await key('Escape',27);await until(()=>evaluate(`!document.querySelector('.settings-modal')`),'Escape Settings');assert.equal(await win('is_fullscreen'),true);
   await key('Escape',27);await until(async()=>!await win('is_fullscreen'),'Escape native fullscreen');await finished();
   await until(()=>evaluate(`document.documentElement.dataset.windowMaterial===${JSON.stringify(actual)}`),'restored material');report.cases.push({name:'fullscreen-material-restoration',theme,requested:material,normal:actual,fullscreen:fullscreenMaterial,restored:await evaluate(`document.documentElement.dataset.windowMaterial`)});
   await click(textButton('.sidebar button','Settings'));await until(()=>evaluate(`!!document.querySelector('.settings-modal')`),'reopen Settings');
  }
 }
 const slider=async(name,value)=>{await evaluate(`(()=>{const e=[...document.querySelectorAll('input[type=range]')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(name)});if(!e)throw Error('Missing slider: '+${JSON.stringify(name)});if(e.disabled)throw Error('Disabled slider: '+${JSON.stringify(name)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);};
 const desktopActive=await evaluate("document.documentElement.dataset.windowMaterial!=='solid'");
 await section('background');
 if(desktopActive){await click("[...document.querySelectorAll('.background-source-options button')].find(b=>b.querySelector('b')?.textContent==='Desktop')");await slider('Window transparency',77);await delay(750);await choose('Tint intensity','Strong');}
 await section('materials');await choose('Material preset','Glass');await slider('Surface opacity',74);await slider('Surface backdrop blur',23);await delay(750);
 const custom=await evaluate(`JSON.parse(localStorage.getItem('canary-visual'))`);if(desktopActive)assert.equal(custom.windowTransparency,77);assert.equal(custom.surfaceOpacity,74);assert.equal(custom.surfaceBlur,23);if(desktopActive)assert.equal(custom.tint,'strong');report.cases.push({name:'custom-opacity-blur-tint',windowTransparency:custom.windowTransparency,surfaceOpacity:custom.surfaceOpacity,surfaceBlur:custom.surfaceBlur,tint:custom.tint});
 await section('sidebar');await click(textButton('[role=group][aria-label="Sidebar side"] button','Right'));await key('F11',122);await until(()=>win('is_fullscreen'),'right-sidebar fullscreen');await finished();await screenshot('right-sidebar-fullscreen');await key('Escape',27);await until(()=>evaluate(`!document.querySelector('.settings-modal')`),'close right-sidebar Settings');assert.equal(await win('is_fullscreen'),true);await key('Escape',27);await until(async()=>!await win('is_fullscreen'),'right-sidebar restore');await finished();await click(textButton('.sidebar button','Settings'));await until(()=>evaluate(`!!document.querySelector('.settings-modal')`),'reopen Settings');
 await section('window');await choose('Window controls style','Traffic Lights');await choose('Control position','Left');await screenshot('left-traffic-controls');
 await choose('Titlebar branding','Text');assert.equal(await evaluate(`document.querySelectorAll('.window-brand img').length`),0);await screenshot('centered-text-brand');
 await click(`[...document.querySelectorAll('button[role="combobox"]')].find(b=>b.getAttribute('aria-label')==='Titlebar branding')`);await screenshot('glass-dropdown');await key('Escape',27);assert.equal(await evaluate(`!!document.querySelector('.settings-modal')`),true);
 await materialPresetQA({evaluate,choose,click,textButton,call,win,until,delay,screenshot,report,reloadWithPreferences});
 // Sample the real compositor with desktop material, glass, ambient motion and
 // Hero enabled. Record runner timings, without inventing a hardware FPS result.
 report.performance=[];
 for(const quality of ['high','low']){
  await reloadWithPreferences(`(()=>{const old=JSON.parse(localStorage.getItem('canary-visual')||'{}');localStorage.setItem('canary-visual',JSON.stringify({...old,quality:${JSON.stringify(quality)},backgroundSource:'desktop',material:${JSON.stringify(report.capabilities.supported.includes('acrylic')?'acrylic':'solid')},ambient:'autumn',effectPreset:'high',density:24,heroRotation:true,heroSpeed:9,glassIntensity:55,surfaceOpacity:82,surfaceBlur:24}));localStorage.setItem('canary-mode','dark');})()`);
  await until(()=>evaluate(`!!document.querySelector('.home-hero')&&document.documentElement.dataset.quality===${JSON.stringify(quality)}&&document.documentElement.dataset.windowTransition==='false'`),'performance UI');
  await call('Page.bringToFront');await key('F11',122);await until(()=>win('is_fullscreen'),'performance fullscreen');await finished();await delay(500);
  const timing=await evaluate(`new Promise(resolve=>{const samples=[];const start=performance.now();let last=start,complete=false;function finish(){if(complete)return;complete=true;const sorted=[...samples].sort((a,b)=>a-b);resolve({quality:${JSON.stringify(quality)},durationMs:performance.now()-start,frames:samples.length,medianMs:sorted[Math.floor(sorted.length*.5)]??null,p95Ms:sorted[Math.floor(sorted.length*.95)]??null,over50ms:samples.filter(n=>n>50).length,particles:[...document.querySelectorAll('.ambient-particles i')].filter(e=>getComputedStyle(e).display!=='none').length,sidebarBlur:getComputedStyle(document.querySelector('.sidebar')).backdropFilter,material:document.documentElement.dataset.windowMaterial,fullscreen:document.documentElement.dataset.windowFullscreen});}function frame(now){if(complete)return;samples.push(now-last);last=now;if(now-start>=4000)finish();else requestAnimationFrame(frame);}setTimeout(finish,6000);requestAnimationFrame(frame);})`);
  assert.ok(timing.frames>0,'Real WebView2 must paint frames');if(quality==='low'){assert.ok(timing.particles<=6);assert.equal(timing.sidebarBlur,'none');}report.performance.push(timing);await screenshot(`performance-${quality}-fullscreen`);
  await key('Escape',27);await until(async()=>!await win('is_fullscreen'),'performance restore');await finished();
 }
 // Close the actual process, reopen with the same WebView2 profile and verify
 // the exact persisted layout/material combination through fresh startup.
 await click(textButton('.sidebar button','Settings'));await section('sidebar');
 await section('sidebar');await click(textButton('[role=group][aria-label="Sidebar side"] button','Right'));await choose('Sidebar layout','Floating');
 if(!await evaluate(`document.querySelector('.sidebar').classList.contains('compact')`))await click(`document.querySelector('.sidebar button[aria-label="Collapse sidebar"]')`);
 await section('materials');await choose('Material preset','Clear Glass');
 const persistence=()=>evaluate(`({visual:JSON.parse(localStorage.getItem('canary-visual')),compact:localStorage.getItem('canary-compact'),cards:document.documentElement.dataset.materialCards,sidebarCompact:document.querySelector('.sidebar').classList.contains('compact')})`);
 await until(async()=>{const current=await persistence();return current.visual.materialPreset==='clear'&&current.visual.materialStyle==='clear'&&current.visual.sidebarSide==='right'&&current.visual.sidebarMode==='floating'&&current.compact==='true'&&current.cards==='clear';},'persist layout and Clear Glass before restart');
 const saved=await persistence();assert.equal(saved.visual.sidebarSide,'right');assert.equal(saved.visual.sidebarMode,'floating');assert.equal(saved.compact,'true');assert.equal(saved.cards,'clear');
 const previousPid=app.pid;const exited=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Canary process did not close')),15000);app.once('exit',()=>{clearTimeout(timer);resolve();});});
 // The close IPC can lose its response when the WebView is destroyed.
 void win('close').catch(()=>{});await exited;socket.close();app=undefined;await inspectorReleased();launchError=undefined;app=launch();app.once('error',error=>{launchError=error;});
 await until(async()=>{const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();target=targets.find(t=>t.type==='page'&&t.url.includes('tauri.localhost'));return !!target?.webSocketDebuggerUrl;},'restarted WebView2 inspector',45000);
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});socket.addEventListener('message',receive);
 await call('Runtime.enable');await call('Page.enable');await readyUI();await until(()=>evaluate(`!!document.querySelector('.home-hero')&&document.documentElement.dataset.windowTransition==='false'`),'restarted Canary Home');
 const restartedSnapshot=await invoke('backend_snapshot',{localOnly:true});assert.equal(resolve(restartedSnapshot.data_folder),qaDataRoot);assert.deepEqual(restartedSnapshot.accounts,[]);
 const reopened=await persistence();assert.deepEqual(reopened,saved);assert.notEqual(app.pid,previousPid);await screenshot('right-floating-compact-clear-process-restart');
 report.cases.push({name:'material-layout-full-process-restart',previousPid,restartedPid:app.pid,sidebarSide:reopened.visual.sidebarSide,sidebarMode:reopened.visual.sidebarMode,compact:reopened.compact,preset:reopened.cards,configurationPreserved:true});
 await discoverInstallQA({evaluate,invoke,click,textButton,until,screenshot,report});
 report.status='success';console.log('WINDOWS_NATIVE_FULLSCREEN_GEOMETRY_MATERIAL_THEMES_DROPDOWNS_VERIFIED');
}catch(error){
 report.status='failure';report.error=String(error);
 for(const file of ['app-startup.log','app-stderr.log']){try{report[file]=String(await readFile(resolve(folder,file),'utf8')).slice(-4000);}catch{}}
 if(error.cause)report.cause=String(error.cause);
 try{
  const output=execFileSync('pwsh.exe',['-NoProfile','-WindowStyle','Hidden','-Command',`$ErrorActionPreference='Stop';$p=Get-Process -Id ${app.pid};$children=@(Get-Process msedgewebview2 -ErrorAction SilentlyContinue | Select-Object Id,ProcessName);@{pid=$p.Id;title=$p.MainWindowTitle;responding=$p.Responding;handle=$p.MainWindowHandle.ToInt64();session=$p.SessionId;webviews=$children}|ConvertTo-Json -Depth 4 -Compress`],{windowsHide:true,timeout:30000,encoding:'utf8'});report.startup=JSON.parse(output);
 }catch(diagnosticError){report.startupDiagnosticError=String(diagnosticError).split('\n')[0];}
 throw error;
}
finally{await writeFile(resolve(folder,'result.json'),JSON.stringify(report,null,2));socket?.close();app?.kill();closeSync(stdout);closeSync(stderr);}

