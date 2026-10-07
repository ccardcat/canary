import {test,expect} from '@playwright/test';
import {nativeFixture} from './helpers/nativeFixture';
import {materialPresetQA} from '../.github/scripts/material-preset-qa.mjs';
import {discoverInstallQA} from '../.github/scripts/discover-install-qa.mjs';
import {mkdirSync} from 'node:fs';

test('Windows preset QA harness exercises actual renderer controls before native CI',async({page})=>{
 test.setTimeout(180000);await nativeFixture(page);await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
 await page.locator('.sidebar').getByRole('button',{name:'Settings',exact:true}).click();
 const report:any={cases:[]};mkdirSync('.qa/native-material-harness',{recursive:true});
 await materialPresetQA({
  evaluate:(expression:string)=>page.evaluate(expression),
  choose:async(name:string,text:string)=>{await page.getByRole('combobox',{name,exact:true}).click();await page.getByRole('option',{name:text,exact:true}).click();},
  click:(expression:string)=>page.evaluate(`${expression}.click()`),
  textButton:(scope:string,text:string)=>`[...document.querySelectorAll(${JSON.stringify(scope)})].find(b=>b.textContent.trim()===${JSON.stringify(text)})`,
  call:async(method:string)=>{expect(method).toBe('Page.reload');await page.reload();},
  win:async(command:string,args:any)=>{expect(command).toBe('set_size');await page.setViewportSize(args.value.Physical);},
  until:async(fn:()=>Promise<boolean>)=>{await expect.poll(fn,{timeout:10000}).toBe(true);},
  delay:(ms:number)=>page.waitForTimeout(ms),
  screenshot:async(name:string)=>{await page.locator('.material-preview').screenshot({path:`.qa/native-material-harness/${name}.png`});},
  report,
 });
 expect(report.surfaceMaterials).toHaveLength(98);
 expect(report.cases[0]).toMatchObject({combinations:56,themes:3,resizeWidths:[1200,960],nativeIPC:true});
 // This validates the harness in Chromium; only CI can establish native WebView2/IPC.
});

test('native live Discover QA harness validates scoped tasks and cancellation before CI',async({page})=>{
 await nativeFixture(page);await page.emulateMedia({reducedMotion:'reduce'});
 const projects=Array.from({length:5},(_,i)=>({project_id:'pack-'+i,title:'QA pack '+i,project_type:'modpack',description:'Scoped installation QA',downloads:100,versions:['1.21.1'],categories:['fabric']}));
 await page.route('https://api.modrinth.com/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/search'))return route.fulfill({json:{hits:projects,total_hits:5}});
  if(url.pathname.endsWith('/version'))return route.fulfill({json:[{id:'version-one',version_number:'1',files:[{filename:'qa.mrpack',url:'https://example.invalid/qa.mrpack'}]}]});
  return route.fulfill({json:[]});
 });
 await page.goto('/');const report:any={};
 await discoverInstallQA({
  evaluate:(expression:string)=>page.evaluate(expression),
  invoke:async(command:string)=>{expect(command).toBe('backend_snapshot');return page.evaluate(()=>{const qa=(globalThis as any).__materialQA;return {...qa.state,tasks:(qa.installs||[]).map((install:any)=>({...install.task,provider:'modrinth',projectId:install.args.projectId,versionId:install.args.versionId,status:document.querySelector(`.activity-task[data-task-id="${install.task.id}"]`)?.getAttribute('data-task-status')||install.task.status}))};});},
  click:(expression:string)=>page.evaluate(`${expression}.click()`),
  textButton:(scope:string,text:string)=>`[...document.querySelectorAll(${JSON.stringify(scope)})].find(b=>b.textContent.trim()===${JSON.stringify(text)})`,
  until:async(fn:()=>Promise<boolean>)=>{await expect.poll(fn,{timeout:10000}).toBe(true);},
  screenshot:async()=>{},report,
 });
 expect(report.liveDiscover).toMatchObject({status:'success',cards:5,installingCards:1,terminal:'cancelled',ghostInstance:false,versionId:'version-one'});
 // The adapters above are explicitly fixtures; CI supplies real IPC/network.
});
