import {test,expect,type Page} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {nativeFixture} from './helpers/nativeFixture';

async function choose(page:Page,name:string,option:string){
 await page.getByRole('combobox',{name,exact:true}).evaluate(el=>{for(let details=el.closest('details');details;details=details.parentElement?.closest('details')??null)details.open=true;});
 await page.getByRole('combobox',{name,exact:true}).click();
 await page.getByRole('option',{name:option,exact:true}).click();
}
async function settings(page:Page){await page.getByRole('button',{name:'Settings',exact:true}).first().click();}
test('legacy preferences migrate without losing artwork, typography, cursor or independent categories',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('canary-visual',JSON.stringify({app:'sakura1',sidebar:'green',font:'Monocraft',cursor:'system',surfaceBlur:12,materialCategories:{cards:'liquid',buttons:'bogus'},materialIntensity:Infinity})));
 await page.route('https://api.modrinth.com/**',r=>r.fulfill({json:{hits:[],total_hits:0}}));await page.goto('/');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('canary-visual')!).materialCategories?.buttons)).toBe('soft');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('canary-visual')!));
 expect(saved).toMatchObject({app:'sakura1',sidebar:'green',font:'Monocraft',cursor:'system',surfaceBlur:12,materialCategories:{cards:'liquid',buttons:'soft'},materialIntensity:50});
 await expect(page.locator('html')).toHaveAttribute('data-material-cards','liquid');
});

test('all seven materials switch real card, button, sidebar and modal surfaces; presets persist',async({page})=>{
 await nativeFixture(page);await page.goto('/');await settings(page);
 await choose(page,'Material preset','Liquid Glass');
 await expect(page.locator('html')).toHaveAttribute('data-sidebar-mode','attached');
 await page.getByText('Advanced materials',{exact:true}).click();
 const styles=['Solid','Soft','Vibrancy','Glass','Clear Glass','Liquid Glass','Transparent'];const filters:string[]=[];
 for(const name of styles){
  await choose(page,'Shared material',name);
  const result=await page.locator('.material-preview-card').evaluate(el=>({background:getComputedStyle(el).backgroundImage,filter:getComputedStyle(el).backdropFilter,shadow:getComputedStyle(el).boxShadow}));
  // The preview owns its artwork scene; only controls use foreground glass.
  expect(['Solid','Transparent'].includes(name)?result.filter==='none':result.filter!=='none').toBe(true);expect(result.background).not.toBe('none');
  filters.push(await page.locator('.sidebar').evaluate(el=>getComputedStyle(el).backdropFilter));
  const dialog=await page.locator('.settings-modal').evaluate(el=>getComputedStyle(el).backdropFilter);
  expect(['Solid','Transparent'].includes(name)?dialog==='none':dialog!=='none').toBe(true);
  expect(await page.locator('.material-preview .primary-button').evaluate(el=>getComputedStyle(el).backdropFilter)).toBe('none');
  if(name==='Liquid Glass'){expect(result.shadow).toContain('inset');expect(await page.locator('.settings-modal').evaluate(el=>(getComputedStyle(el).boxShadow.match(/(?:rgba?|color)\(/g)||[]).length)).toBe(2);}
 }
 expect(new Set(filters).size).toBeGreaterThan(4);
 await choose(page,'Material preset','Liquid Glass');
 const intensity=page.getByRole('slider',{name:'Material intensity',exact:true});
 await intensity.fill('0');await intensity.press('Tab');const lowIntensity=await page.locator('.material-preview-card').evaluate(el=>getComputedStyle(el).backdropFilter);
 await intensity.fill('100');await intensity.press('Tab');const highIntensity=await page.locator('.material-preview-card').evaluate(el=>getComputedStyle(el).backdropFilter);
 expect(Number(highIntensity.match(/saturate\(([^)]+)\)/)![1])).toBeGreaterThan(Number(lowIntensity.match(/saturate\(([^)]+)\)/)![1]));
 await choose(page,'Material preset','Liquid Glass');
 await page.reload();await settings(page);await expect(page.getByRole('combobox',{name:'Material preset',exact:true})).toContainText('Liquid Glass');
 await page.getByText('Advanced materials',{exact:true}).click();await page.getByRole('checkbox',{name:'Use one style everywhere',exact:true}).uncheck();
 await choose(page,'Button style','Solid');
 await expect(page.locator('html')).toHaveAttribute('data-material-buttons','solid');await expect(page.locator('html')).toHaveAttribute('data-material-cards','liquid');
 await expect(page.getByRole('combobox',{name:'Material preset',exact:true})).toContainText('Custom');
 await page.getByRole('checkbox',{name:'Reduce transparency',exact:true}).check();
 await expect(page.locator('.settings-modal')).toHaveCSS('backdrop-filter','none');
});

test('compact instances preserve primary actions, move favorite up and persist layout',async({page})=>{
 await nativeFixture(page);await page.goto('/');await page.getByRole('button',{name:'Library',exact:true}).first().click();
 await choose(page,'Instance card layout','Comfortable');const first=page.locator('.instance-card').first();const comfortable=(await first.boundingBox())!.height;
 await page.screenshot({path:'.qa/materials/comfortable-library.png'});
 await choose(page,'Instance card layout','Compact');
 await expect(first.locator('.card-visual')).toBeHidden();await expect(first.locator('.instance-small-icon')).toBeVisible();
 expect((await first.boundingBox())!.height).toBeLessThan(comfortable-100);expect((await first.boundingBox())!.height).toBeLessThan(280);
 await page.screenshot({path:'.qa/materials/compact-library.png'});
 await first.locator('.instance-heading').getByRole('button',{name:'Favorites',exact:true}).click();
 await expect(first.locator('.favorite-action')).toHaveAttribute('aria-pressed','true');await expect(first.locator('.instance-actions .favorite-action')).toHaveCount(0);
 await first.getByRole('button',{name:'Play',exact:true}).click();await expect(first.getByRole('button',{name:'Stop game',exact:true})).toBeVisible();
 await first.getByRole('button',{name:'Stop game',exact:true}).click();await expect(first.getByRole('button',{name:'Play',exact:true})).toBeVisible();
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-instance-layout','compact');
});

test('account actions stay horizontal, destructive hover/focus resets, rename/delete keep confirmations',async({page})=>{
 await nativeFixture(page);await page.goto('/');await settings(page);await choose(page,'Material preset','Liquid Glass');await page.locator('.settings-nav').getByRole('button',{name:'Account',exact:true}).click();
 const account=page.locator('.runtime-account').first();const edit=account.getByRole('button',{name:'Rename',exact:true});const remove=account.getByRole('button',{name:'Remove',exact:true});
 await expect(account).toBeVisible();
 await expect.poll(async()=>{const a=(await edit.boundingBox())!,b=(await remove.boundingBox())!;return Math.abs(a.y-b.y);}).toBeLessThan(2);
 await page.waitForTimeout(300);await page.screenshot({path:'.qa/materials/accounts.png'});
 await expect(account).not.toContainText('Local · Local');
 const normal=await remove.evaluate(el=>getComputedStyle(el).color);await remove.hover();await expect.poll(()=>remove.evaluate(el=>getComputedStyle(el).color)).not.toBe(normal);
 await edit.hover();await expect.poll(()=>remove.evaluate(el=>getComputedStyle(el).color)).toBe(normal);
 await edit.focus();await page.keyboard.press("Tab");await expect(remove).toBeFocused();await expect.poll(()=>remove.evaluate(el=>getComputedStyle(el).color)).not.toBe(normal);
 await edit.click();await account.getByRole('textbox',{name:'Username',exact:true}).fill('RenamedPlayer');await account.getByRole('button',{name:'Save',exact:true}).click();await expect(account).toContainText('RenamedPlayer');
 await remove.click();await account.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.locator('.runtime-account')).toHaveCount(2);
 await remove.click();await account.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.locator('.runtime-account')).toHaveCount(1);
 const remaining=page.locator('.runtime-account .destructive');await page.mouse.move(0,0);await page.getByRole('heading',{name:'Settings',exact:true}).click();await expect.poll(()=>remaining.evaluate(el=>getComputedStyle(el).color)).toBe(normal);
});

test('RU/EN Monocraft settings, both sidebar sides, themes and scaled viewports stay inside bounds',async({page})=>{
 test.setTimeout(120000);mkdirSync('.qa/materials',{recursive:true});await nativeFixture(page);
 await page.addInitScript(()=>{if(!localStorage.getItem('canary-visual'))localStorage.setItem('canary-visual',JSON.stringify({font:'Monocraft',minecraft:'full',app:'sakura1',sidebar:'default',sidebarMode:'floating',instanceLayout:'compact'}));});
 await page.goto('/');await settings(page);await choose(page,'Material preset','Liquid Glass');
 for(const mode of ['Dark','Light','AMOLED','System']){
  await page.locator('.mode-grid').getByRole('button',{name:mode,exact:true}).click();
  const light=await page.locator('html').getAttribute('data-mode')==='light';const img=page.locator('.window-brand img');
  await expect(img).toHaveAttribute('src',`/branding/canary-bird-${light?'black':'white'}.png`);
  await expect.poll(()=>img.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const brand=(await page.locator('.window-brand').boundingBox())!;expect(Math.abs(brand.x+brand.width/2-640)).toBeLessThan(1);
  await page.locator('.material-preview').scrollIntoViewIfNeeded();
  await page.screenshot({path:`.qa/materials/${mode.toLowerCase()}-settings.png`});
 }
 await page.locator('.settings-nav').getByRole('button',{name:'Language',exact:true}).click();await page.getByRole('button',{name:/Русский интерфейс/}).click();await page.locator('.settings-nav').getByRole('button',{name:'Оформление',exact:true}).click();
 for(const scale of [1,1.25,1.5]){
  await page.setViewportSize({width:Math.round(1280/scale),height:Math.round(800/scale)});
  expect(await page.locator('.accent-grid button').evaluateAll(nodes=>nodes.every(node=>{const label=node.querySelector('span')!,a=label.getBoundingClientRect(),b=node.getBoundingClientRect();return a.left>=b.left&&a.right<=b.right+1;}))).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.locator('.settings-modal').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:`.qa/materials/ru-${scale}-settings.png`});
 }
 await page.keyboard.press('Escape');await page.setViewportSize({width:760,height:540});
 for(const side of ['left','right']){
  await page.locator('.sidebar nav').getByRole('button',{name:'Настройки',exact:true}).click();await page.locator('.settings-nav').getByRole('button',{name:'Оформление',exact:true}).click();await page.getByRole('group',{name:'Расположение боковой панели',exact:true}).getByRole('button',{name:side==='left'?'Слева':'Справа',exact:true}).click();await page.keyboard.press('Escape');await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar-side',side);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});

test('install 43/97 progress and preparation/cancel actions keep readable spacing',async({page})=>{
 await nativeFixture(page);await page.goto('/');await page.getByRole('button',{name:'Library',exact:true}).first().click();await page.getByRole('button',{name:'New instance',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'New instance',exact:true});await dialog.getByRole('textbox',{name:'Name',exact:true}).fill('Progress QA');await dialog.getByRole('button',{name:'New instance',exact:true}).click();
 await expect(dialog.locator('.activity-task')).toContainText('43 / 97');await expect(dialog.locator('.activity-file')).toContainText('very-long-library-name');
 const progress=(await dialog.locator('.activity-task').boundingBox())!,actions=(await dialog.locator('.install-dialog-actions').boundingBox())!;expect(actions.y-(progress.y+progress.height)).toBeGreaterThanOrEqual(16);
 const prepare=(await dialog.getByRole('button',{name:'Preparing',exact:true}).boundingBox())!,cancel=(await dialog.getByRole('button',{name:'Cancel',exact:true}).boundingBox())!;expect(cancel.height).toBeGreaterThanOrEqual(32);expect(cancel.x-(prepare.x+prepare.width)).toBeGreaterThanOrEqual(11);
 await page.screenshot({path:'.qa/materials/install-progress.png'});await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog.locator('form')).toHaveAttribute('aria-busy','false');
});

test('project description badge links keep intrinsic widths instead of empty action bars',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('canary-visual',JSON.stringify({showCommunity:true})));
 await page.route('https://api.modrinth.com/v2/**',async route=>{
  const url=new URL(route.request().url());const p={project_id:'fo-qa',slug:'fo-qa',title:'Fabulously Optimized',description:'Minecraft optimization',downloads:1000,project_type:'modpack',categories:['fabric'],versions:['1.21.1']};
  if(url.pathname.endsWith('/search'))return route.fulfill({json:{hits:[p],total_hits:1}});
  if(url.pathname.endsWith('/version'))return route.fulfill({json:[]});
  return route.fulfill({json:{...p,id:'fo-qa',followers:10,updated:'2026-10-01',game_versions:['1.21.1'],gallery:[],body:'[![How to install](https://cdn.modrinth.com/badge.svg)](https://example.test/install) [![Discord](https://cdn.modrinth.com/badge.svg)](https://example.test/discord) [![Rate](https://cdn.modrinth.com/badge.svg)](https://example.test/rate)'}});
 });
 await page.route('https://cdn.modrinth.com/badge.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="130" height="28"><rect width="130" height="28" rx="8" fill="#343838"/><text x="14" y="19" fill="white">External action</text></svg>'}));
 await page.goto('/');await page.locator('.home-community .card-title').first().click();const links=page.locator('.markdown a');await expect(links).toHaveCount(3);
 await expect.poll(()=>links.locator('img').evaluateAll(nodes=>nodes.every(n=>(n as HTMLImageElement).naturalWidth>0))).toBe(true);
 for(const link of await links.all()){const rect=(await link.boundingBox())!;expect(rect.width).toBeLessThan(180);expect(rect.height).toBeLessThan(60);}
 await page.screenshot({path:'.qa/materials/project-actions.png'});
});

test('long Library uses one backdrop per card and records scrolling frame samples',async({page},info)=>{
 await nativeFixture(page);await page.addInitScript(()=>{localStorage.setItem('canary-visual',JSON.stringify({materialLinked:true,materialStyle:'liquid',instanceLayout:'compact',buttonDensity:'compact',app:'sakura1'}));});await page.goto('/');
 await page.evaluate(()=>{const state=(globalThis as any).__materialQA.state;const sample=state.instances[0];state.instances=Array.from({length:60},(_,i)=>({...sample,id:'scroll-'+i,name:'World '+i}));});
 await page.getByRole('button',{name:'Library',exact:true}).first().click();await page.getByRole('button',{name:'Check updates',exact:true}).click();await expect(page.locator('.instance-card')).toHaveCount(60);
 const nested=await page.locator('.instance-card button').evaluateAll(nodes=>nodes.filter(node=>getComputedStyle(node).backdropFilter!=='none').length);expect(nested).toBe(0);
 const results=await page.evaluate(async()=>{
  const shell=document.querySelector('.content-shell')!;const sample=async()=>{const times:number[]=[];let previous=performance.now();for(let i=0;i<36;i++){shell.scrollTop=i/35*(shell.scrollHeight-shell.clientHeight);await new Promise<void>(resolve=>requestAnimationFrame(now=>{times.push(now-previous);previous=now;resolve();}));}times.sort((a,b)=>a-b);return {mean:Math.round(times.reduce((a,b)=>a+b,0)/times.length),p95:Math.round(times[Math.floor(times.length*.95)])};};
  const liquid=await sample();document.documentElement.dataset.quality='low';const low=await sample();document.documentElement.dataset.quality='balanced';return {liquid,low,cards:60,nestedBackdropControls:0,environment:'headless Chromium software rendering; not Windows compositor'};
 });
 await info.attach('scroll-samples',{body:JSON.stringify(results,null,2),contentType:'application/json'});console.log('Material scroll samples',JSON.stringify(results));
});

