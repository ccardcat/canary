import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';

// Real packaged WebView2 and IPC, separate from the browser fixture tests.
// Storage redirection is compiled only into native-qa builds.
if(process.platform!=='win32')throw Error('Windows CSP QA only');
const folder=resolve(process.env.CANARY_CSP_QA_OUTPUT||'.qa/csp-native');
const data=resolve(folder,'data-'+randomUUID()),profile=resolve(folder,'webview-'+randomUUID());
await mkdir(folder,{recursive:true});
const report={status:'running',cases:[],violations:[]},port=Number(process.env.CANARY_CSP_QA_PORT||9385);
let browser,app,stderr='';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 app=spawn(resolve(process.argv[2]||'.qa/rust-target/debug/scaffold.exe'),[],{windowsHide:true,env:{...process.env,CANARY_QA_DATA_ROOT:data,CANARY_STARTUP_LOG:resolve(folder,'startup.log'),WEBVIEW2_USER_DATA_FOLDER:profile,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`},stdio:['ignore','ignore','pipe']});
 app.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-6000);});
 let launchError;app.on('error',error=>{launchError=error;});
 for(let attempt=0;attempt<120;attempt++){
  if(launchError)throw launchError;if(app.exitCode!==null)throw Error(`Canary exited ${app.exitCode}: ${stderr}`);
  try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:1000});break;}catch{await delay(500);}
 }
 assert.ok(browser,'WebView2 inspector did not start');
 const context=browser.contexts()[0];let page;
 for(let attempt=0;attempt<60;attempt++){page=context.pages().find(p=>p.url().includes('tauri.localhost'));if(page)break;await delay(500);}
 assert.ok(page,'Packaged Canary page is missing');
 await page.addInitScript(()=>{
  globalThis.__cspQA=[];
  document.addEventListener('securitypolicyviolation',e=>globalThis.__cspQA.push({directive:e.effectiveDirective,blocked:e.blockedURI}));
  localStorage.setItem('canary-language','en');localStorage.setItem('canary-mode','light');localStorage.setItem('canary-visual',JSON.stringify({backgroundSource:'canary',app:'sakura1',sidebar:'green',materialPreset:'glass',materialLinked:true,materialStyle:'glass',showHero:true,showCommunity:false,discordEnabled:false,cursor:'custom'}));
 });
 const response=await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.startup==='ready',{},{timeout:30000});
 const snapshot=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('backend_snapshot',{localOnly:true}));
 assert.equal(resolve(snapshot.data_folder),data,'Native QA must never use real user storage');
 assert.deepEqual(snapshot.accounts,[]);report.cases.push('actual IPC with isolated storage');
 const csp=await page.evaluate(()=>document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content)||await response?.headerValue('content-security-policy');
 assert.ok(csp?.includes('script-src'),'Tauri must actually inject CSP into the bundled document');
 assert.ok(csp.includes('sha256-')||csp.includes('nonce-'),'Bundled startup script must have explicit authorization');
 report.policy=csp;report.cases.push('actual generated Tauri CSP and opaque startup');
 await page.locator('.home-hero').waitFor();
 assert.ok(await page.evaluate(async()=>{await document.fonts.ready;return document.fonts.check('16px Nunito');}));
 assert.ok((await page.locator('.global-wallpaper .artwork-current').evaluate(e=>getComputedStyle(e).backgroundImage)).includes('sakura1'));
 await page.locator('.sidebar').getByRole('button',{name:'Settings',exact:true}).click();
 for(const theme of ['Dark','AMOLED','Light']){await page.locator('.mode-grid').getByRole('button',{name:theme,exact:true}).click();await page.waitForFunction(theme=>document.documentElement.dataset.mode===theme,theme.toLowerCase());}
 const slider=page.getByRole('slider',{name:'Surface opacity',exact:true});await slider.fill('54');await slider.press('Tab');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('canary-visual')).surfaceOpacity===54);
 report.cases.push('wallpaper, local fonts, themes and live surface styles');
 // Local custom-protocol fetch must reach Rust. A deliberately absent asset can
 // return 403/404, but CSP must not block the asset origin at the browser boundary.
 await page.evaluate(async()=>{await fetch('http://asset.localhost/csp-absent-image.png').catch(()=>{});});
 assert.deepEqual(await page.evaluate(()=>globalThis.__cspQA),[],'Normal UI must produce no CSP violations');
 await page.evaluate(async()=>{
  const inline=document.createElement('script');inline.textContent='window.__cspInline=true';document.body.append(inline);
  const remote=document.createElement('script');remote.src='https://untrusted.example/script.js';document.body.append(remote);
  const button=document.createElement('button');button.setAttribute('onclick','window.__cspHandler=true');document.body.append(button);button.click();
  const frame=document.createElement('iframe');frame.src='https://untrusted.example/frame';document.body.append(frame);
  try{await fetch('https://untrusted.example/collect');window.__cspFetch=true;}catch{}
 });
 await page.waitForFunction(()=>globalThis.__cspQA.length>=5);
 assert.equal(await page.evaluate(()=>!!(window.__cspInline||window.__cspHandler||window.__cspFetch)),false);
 report.violations=await page.evaluate(()=>globalThis.__cspQA);
 for(const directive of ['script-src-elem','script-src-attr','frame-src','connect-src'])assert.ok(report.violations.some(v=>v.directive===directive),directive);
 report.cases.push('injected scripts, handlers, frames and unrelated requests blocked');
 await page.screenshot({path:resolve(folder,'native-csp.png')});
 report.status='success';console.log('CANARY_NATIVE_CSP_STARTUP_IPC_STYLES_AND_INJECTION_BLOCKING_VERIFIED');
}catch(error){report.status='failure';report.error=String(error);report.stderr=stderr;throw error;}
finally{await writeFile(resolve(folder,'result.json'),JSON.stringify(report,null,2));app?.kill();await browser?.close().catch(()=>{});}
