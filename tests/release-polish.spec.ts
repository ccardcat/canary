import {test,expect,type Page} from '@playwright/test';
import {nativeFixture} from './helpers/nativeFixture';

async function emit(page:Page,event:string,payload:unknown){
  await page.evaluate(async({event,payload})=>{
    const {emit}=await import('/node_modules/@tauri-apps/api/event.js' as string);
    await emit(event,payload);
  },{event,payload});
}
async function setup(page:Page){
  await nativeFixture(page);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  await expect(page.locator('.startup-splash')).toHaveCount(0);
}

test('dialog padding stays open, Escape closes only the top dialog',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await emit(page,'backend-error',{code:'account_in_use_by_game',message:'Account is busy',retryable:false});
  const dialog=page.locator('.runtime-dialog');
  await expect(dialog).toBeVisible();
  await dialog.click({position:{x:8,y:8}});
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.settings-modal')).toBeVisible();
  // Reopen and verify real backdrop dismissal still works.
  await emit(page,'backend-error',{code:'account_in_use_by_game',message:'Account is busy',retryable:false});
  await expect(dialog).toBeVisible();
  await page.mouse.click(4,4);
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.settings-modal')).toBeVisible();
});

test('first error navigation resets filters and uses wrapped row offsets',async({page})=>{
  await setup(page);
  await page.locator('.sidebar nav').getByRole('button',{name:'Activity',exact:true}).click();
  await page.getByRole('button',{name:'Game Logs',exact:true}).click();
  const lines=Array.from({length:60},(_,i)=>`[14:32:01] [Render thread/INFO]: Line ${i} ${'long message '.repeat(30)}`);
  lines.splice(30,0,'[14:32:01] [Render thread/ERROR]: first-error-marker');
  lines.push('[14:32:02] [Render thread/ERROR]: last-error-marker');
  await emit(page,'process-output-batch',{id:'instance-0',session:'canary-polish.log',lines});
  await expect(page.locator('.game-logs')).toContainText('62 / 62');
  await page.getByRole('checkbox',{name:'Wrap lines'}).check();
  await emit(page,'process-exited',{id:'instance-0',status:'crashed'});
  await page.getByRole('textbox',{name:'Search logs'}).fill('last-error-marker');
  await expect(page.locator('.game-log-line')).toHaveCount(1);
  await page.getByRole('button',{name:'Jump to first error'}).click();
  await expect(page.getByRole('textbox',{name:'Search logs'})).toHaveValue('');
  await expect(page.locator('.game-log-line').filter({hasText:'first-error-marker'})).toBeVisible();
  expect(await page.locator('.game-log-viewport').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});

test('Settings search shows translated section names without internal keywords',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.locator('.settings-search input').fill('glass');
  await expect(page.locator('.settings-results')).toContainText('Appearance');
  await expect(page.locator('.settings-results small')).toHaveCount(0);
  await page.locator('.settings-results').getByRole('button',{name:'Appearance',exact:true}).click();
  await expect(page.locator('.material-settings')).toBeVisible();
});

test('decorative borders stay quiet when selected or pressed, with keyboard and system focus intact',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  const selected=page.locator('.mode-grid button.selected');
  await expect(selected).toHaveCSS('border-top-color','rgba(0, 0, 0, 0)');
  await selected.hover();
  await expect(selected).toHaveCSS('border-top-color','rgba(0, 0, 0, 0)');
  await page.mouse.down();
  await expect(selected).toHaveCSS('border-top-color','rgba(0, 0, 0, 0)');
  await page.mouse.move(4,4);
  await page.mouse.up();
  await page.keyboard.press('Tab');
  await selected.focus();
  await expect(selected).toHaveCSS('outline-style','solid');
  await expect(selected).not.toHaveCSS('outline-width','0px');
  await page.emulateMedia({forcedColors:'active'});
  await expect(selected).not.toHaveCSS('border-top-color','rgba(0, 0, 0, 0)');
});

test('startup deadline reveals the native window even if wallpaper loading stalls',async({page})=>{
  await nativeFixture(page);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>{(globalThis as any).__startupQA={holdWallpapers:true};});
  await page.goto('/');
  await expect(page.locator('.startup-splash')).toBeVisible();
  await expect(page.locator('.startup-splash')).toHaveCount(0,{timeout:16000});
  await expect(page.locator('.startup-app')).not.toHaveAttribute('inert','');
  await expect.poll(()=>page.evaluate(()=>(globalThis as any).__materialQA.calls.filter((c:any)=>c.command==='show_main_window').length)).toBe(1);
});
