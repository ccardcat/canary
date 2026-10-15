import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';

// Real WebView2 IPC, isolated storage, and no user accounts or Minecraft session.
if(process.platform!=='win32')throw Error('Windows collection QA only');
const folder=resolve(process.env.CANARY_COLLECTION_QA_OUTPUT||'qa/windows-collection-smoke');
const root=join(folder,'data-'+crypto.randomUUID()),source=join(root,'instances','collection-source');
await mkdir(join(source,'saves','World'),{recursive:true});await mkdir(join(source,'mods'),{recursive:true});await mkdir(join(source,'config'),{recursive:true});
await writeFile(join(source,'saves','World','level.dat'),'original world');await writeFile(join(source,'saves','World','session.lock'),'lock');await writeFile(join(source,'mods','demo.jar'),'local mod');await writeFile(join(source,'config','demo.txt'),'mod settings');await writeFile(join(source,'options.txt'),'version:4000\nfov:0.5\nkey_jump:key.keyboard.space\nrenderDistance:12\n');
await writeFile(join(source,'instance.json'),JSON.stringify({id:'collection-source',name:'Collection QA',minecraft:'1.21.1',loader:'vanilla'}));
const fontId='a99d6db7-9850-4949-aa3c-6cef18e7a60f';
await mkdir(join(root,'fonts'),{recursive:true});
await writeFile(join(root,'fonts',fontId+'.ttf'),await readFile(resolve('public/Monocraft.ttf')));
await writeFile(join(root,'fonts','index.json'),JSON.stringify([{id:fontId,name:'Native QA typeface',extension:'ttf',hash:'fixture'}]));
const app=spawn(resolve(process.argv[2]||'qa/windows-window-smoke/canary-native-qa.exe'),[],{windowsHide:true,env:{...process.env,CANARY_QA_DATA_ROOT:root,WEBVIEW2_USER_DATA_FOLDER:join(folder,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9384 --remote-debugging-address=127.0.0.1'},stdio:'ignore'});
let socket,launchError;app.once('error',error=>{launchError=error;});const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,name,timeout=45000){const start=Date.now();while(Date.now()-start<timeout){if(launchError)throw launchError;if(app.exitCode!==null)throw Error(`Canary exited during ${name}`);try{if(await check())return;}catch{}await pause(150);}throw Error(`Timeout: ${name}`);}
const report={version:'0.1.9',cases:[]};
try{
 let target;await until(async()=>{const pages=await(await fetch('http://127.0.0.1:9384/json/list')).json();target=pages.find(p=>p.type==='page'&&p.url.includes('tauri.localhost'));return !!target?.webSocketDebuggerUrl;},'inspector');
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
 let sequence=0;const pending=new Map();socket.addEventListener('message',event=>{const message=JSON.parse(event.data),wait=pending.get(message.id);if(wait){pending.delete(message.id);message.error?wait.reject(Error(JSON.stringify(message.error))):wait.resolve(message.result);}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(`Inspector timeout: ${method}`));},30000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result?.value;};
 const invoke=(command,args={})=>evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})`);
 const win=(command)=>invoke(`plugin:window|${command}`,{label:'main'});
 await until(()=>evaluate(`document.documentElement.dataset.startup==='ready'&&!!window.__TAURI_INTERNALS__`),'startup');
 const initial=await invoke('backend_snapshot',{localOnly:true});assert.equal(resolve(initial.data_folder),root,'QA build must honor isolated storage');assert.equal(initial.accounts.length,0);
 const fonts=await invoke('list_fonts');assert.equal(fonts.length,1);assert.equal(fonts[0].id,fontId);
 const fontLoaded=await evaluate(`(async()=>{const url=window.__TAURI_INTERNALS__.convertFileSrc(${JSON.stringify(fonts[0].path)});const response=await fetch(url);if(!response.ok)throw Error('Managed font unavailable');const face=await new FontFace('CanaryNativeFont',await response.arrayBuffer()).load();document.fonts.add(face);return document.fonts.check('14px CanaryNativeFont');})()`);
 assert.equal(fontLoaded,true);await invoke('remove_font',{id:fontId});assert.equal((await invoke('list_fonts')).length,0);report.cases.push('custom font real parser, scoped file access and native removal');

 const copy=await invoke('clone_instance',{id:'collection-source',name:'Independent QA copy',options:{worlds:true,settings:false,screenshots:false}});assert.notEqual(copy.id,'collection-source');assert.equal(await readFile(join(copy.directory,'saves','World','level.dat'),'utf8'),'original world');await assert.rejects(readFile(join(copy.directory,'config','demo.txt')));await writeFile(join(copy.directory,'mods','demo.jar'),'changed copy');assert.equal(await readFile(join(source,'mods','demo.jar'),'utf8'),'local mod');report.cases.push('independent copy and optional files');
 const backup=await invoke('create_world_backup',{id:'collection-source'});assert.ok(backup.id);await writeFile(join(source,'saves','World','level.dat'),'current world');await invoke('restore_world_backup',{id:'collection-source',backupId:backup.id,confirmed:true});assert.equal(await readFile(join(source,'saves','World','level.dat'),'utf8'),'original world');assert.equal((await invoke('list_world_backups',{id:'collection-source'})).length,2);report.cases.push('world restore and current-world safeguard');
 await invoke('capture_game_settings',{id:'collection-source'});await invoke('set_shared_settings',{id:copy.id,enabled:true});report.cases.push('shared game settings commands');
 const preferences={world_backups:true,world_backup_retention:8,world_backup_max_mb:4096,close_to_tray:true,minimize_to_tray:true,library_groups:['QA']};await invoke('save_collection_preferences',{preferences});await invoke('set_instance_group',{id:copy.id,group:'QA'});const grouped=await invoke('backend_snapshot',{localOnly:true});const old=grouped.settings.library_group_ids.QA;assert.equal(grouped.instances.find(i=>i.id===copy.id).group,old);await invoke('save_collection_preferences',{preferences:{...preferences,library_groups:[]}});await invoke('save_collection_preferences',{preferences});assert.notEqual((await invoke('backend_snapshot',{localOnly:true})).settings.library_group_ids.QA,old);report.cases.push('stable group identities after removal and recreation');
 const usage=await invoke('storage_usage');assert.ok(usage.breakdown.world_backups>0);report.cases.push('world backups included in storage totals');
 const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(folder,'native-collection.png'),Buffer.from(shot.data,'base64'));
 await invoke('set_tray_language',{russian:false});await invoke('hide_to_tray');assert.equal(await win('is_visible'),false);await win('close');await until(async()=>!await win('is_visible'),'close to tray');assert.equal(app.exitCode,null);report.cases.push('native tray exists and close preserves the process');
 report.status='passed';console.log(JSON.stringify(report));
}catch(error){report.status='failed';report.error=String(error);throw error;}finally{await writeFile(join(folder,'result.json'),JSON.stringify(report,null,2));socket?.close();app.kill();}
