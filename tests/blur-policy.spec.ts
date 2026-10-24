import {test,expect,type Page} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {nativeFixture} from './helpers/nativeFixture';
import {settingsSection} from './helpers/settings';

const nav=(page:Page,name:string)=>page.locator('.sidebar').getByRole('button',{name,exact:true});
async function setup(page:Page){
 await nativeFixture(page);await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>{
  (globalThis as any).__startupQA={nativeCaps:{platform:'windows',build:22621,supported:['solid','transparent','acrylic','mica','mica-alt']},nativeMaterials:true};
  if(!localStorage.getItem('canary-visual'))localStorage.setItem('canary-visual',JSON.stringify({backgroundSource:'desktop',material:'acrylic',quality:'high',frost:true,surfaceBlur:24,materialPreset:'glass',materialLinked:true,materialStyle:'glass',sidebarBackgroundSource:'theme',sidebarColorOpacity:45}));
 });
 await page.goto('/');await expect(page.locator('html')).toHaveAttribute('data-window-material','acrylic');
 await nav(page,'Settings').click();
}
for(const policy of ['quality','reduceTransparency','focus'] as const){
 test(policy+' removes every modal blur and frost, suspends native acrylic, and restores it live',async({page})=>{
  await setup(page);
  const setPolicy=async(on:boolean)=>{
   if(policy==='quality'){await settingsSection(page,'quality');await page.getByRole('button',{name:on?'Low':'High',exact:true}).click();}
   else if(policy==='focus'){await settingsSection(page,'layout');const toggle=page.getByRole('switch',{name:'Focus mode',exact:true});if((await toggle.getAttribute('aria-checked')==='true')!==on)await toggle.click();}
   else{await settingsSection(page,'materials');const advanced=page.locator('.material-advanced');if(!await advanced.evaluate(el=>(el as HTMLDetailsElement).open))await advanced.locator('summary').click();await page.getByRole('checkbox',{name:'Reduce transparency',exact:true}).setChecked(on);}
  };
  await setPolicy(true);
  await expect(page.locator('html')).toHaveAttribute('data-window-material','solid');
  for(const selector of ['.modal-backdrop','.settings-modal','.sidebar'])await expect(page.locator(selector)).toHaveCSS('backdrop-filter','none');
  expect(await page.locator('.settings-modal').evaluate(el=>getComputedStyle(el,'::before').display)).toBe('none');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('canary-visual')!));
  expect(saved.material).toBe('acrylic');expect(saved.backgroundSource).toBe('desktop');
  expect(await page.evaluate(()=>(globalThis as any).__materialQA.calls.filter((c:any)=>c.command==='apply_window_material').at(-1).args.requested)).toBe('solid');
  await setPolicy(false);
  await expect(page.locator('html')).toHaveAttribute('data-window-material','acrylic');
  await expect(page.locator('.modal-backdrop')).toHaveCSS('backdrop-filter','blur(3px)');
  await expect.poll(()=>page.locator('.settings-modal').evaluate(el=>getComputedStyle(el).backdropFilter)).not.toBe('none');
  expect(await page.locator('.settings-modal').evaluate(el=>getComputedStyle(el,'::before').display)).not.toBe('none');
  mkdirSync('.qa/blur-policy',{recursive:true});await page.screenshot({path:'.qa/blur-policy/'+policy+'-restored.png'});
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-window-material','acrylic');
 });
}

test('zero surface blur also removes the modal scrim blur without blurring text',async({page})=>{
 await setup(page);await settingsSection(page,'materials');
 const blur=page.getByRole('slider',{name:'Surface backdrop blur',exact:true});await blur.fill('0');await blur.press('Tab');
 await expect(page.locator('.modal-backdrop')).toHaveCSS('backdrop-filter','none');
 await expect(page.locator('.settings-modal')).toHaveCSS('backdrop-filter','none');
 await expect(page.locator('.settings-top h2')).toHaveCSS('filter','none');
 await blur.fill('18');await blur.press('Tab');await expect(page.locator('.modal-backdrop')).toHaveCSS('backdrop-filter','blur(3px)');
});
