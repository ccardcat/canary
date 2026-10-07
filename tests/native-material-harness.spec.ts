import {test,expect} from '@playwright/test';
import {nativeFixture} from './helpers/nativeFixture';
import {materialPresetQA} from '../.github/scripts/material-preset-qa.mjs';
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
