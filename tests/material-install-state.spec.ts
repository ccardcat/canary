import {reloadWithPreferences} from './helpers/preferences';
import {test,expect,type Page,type Route} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {nativeFixture} from './helpers/nativeFixture';

const materials=['Solid','Soft','Vibrancy','Glass','Clear Glass','Liquid Glass','Transparent'];
const ids=['solid','soft','vibrancy','glass','clear','liquid','transparent'];
const directory='.qa/material-install-state';
const nav=(page:Page,name:string)=>page.locator('.sidebar').getByRole('button',{name,exact:true});
async function choose(page:Page,label:string,name:string){await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name,exact:true}).click();}
async function preset(page:Page,index:number){
 const comparison=page.locator('.material-disclosure').filter({has:page.locator('.material-preset-control')});
 if(!await comparison.evaluate(el=>(el as HTMLDetailsElement).open))await comparison.locator('summary').click();
 await page.locator('.material-preset-control').filter({has:page.locator('b',{hasText:new RegExp('^'+materials[index]+'$')})}).click();
}
test.beforeEach(async({page})=>{mkdirSync(directory,{recursive:true});await nativeFixture(page);await page.emulateMedia({reducedMotion:'reduce'});});

test('all seven presets and reset preserve every sidebar layout, unrelated settings and restart persistence',async({page})=>{
 test.setTimeout(180000);
 await page.addInitScript(()=>{
  const parameters=new URLSearchParams(location.search);if(!parameters.has('qaSidebarSide'))return;
  const side=parameters.get('qaSidebarSide'),mode=parameters.get('qaSidebarMode'),compact=parameters.get('qaCompact');
  const old=JSON.parse(localStorage.getItem('canary-visual')||'{}');
  localStorage.setItem('canary-visual',JSON.stringify({...old,sidebarSide:side,sidebarMode:mode,app:'sakura1',sidebar:'green',font:'Monocraft',fontScale:110,materialRadius:23,instanceLayout:'compact',instanceArtwork:'ambient',buttonDensity:'compact'}));
  localStorage.setItem('canary-compact',compact!);localStorage.setItem('canary-mode','amoled');localStorage.setItem('canary-accent','purple');
 });
 for(const side of ['left','right'])for(const mode of ['attached','floating'])for(const compact of [false,true]){
  // Initialize before React mounts; pagehide deliberately flushes its live state.
  await page.goto(`/?qaSidebarSide=${side}&qaSidebarMode=${mode}&qaCompact=${compact}`);
  await page.evaluate(()=>history.replaceState(null,'','/'));
  await nav(page,'Settings').click();
  const geometry=async()=>Promise.all(['.sidebar','.window-titlebar','.settings-modal'].map(selector=>page.locator(selector).boundingBox()));
  const before=await geometry();
  const unrelated=await page.evaluate(()=>{const saved=JSON.parse(localStorage.getItem('canary-visual')!);return Object.fromEntries(['sidebarSide','sidebarMode','app','sidebar','font','fontScale','materialRadius','instanceLayout','instanceArtwork','buttonDensity','backgroundSource','material','tint','windowTransparency','globalTreatment','sidebarTreatment'].map(key=>[key,saved[key]]));});
  for(let i=0;i<materials.length;i++){
   await preset(page,i);await expect(page.locator('html')).toHaveAttribute('data-material-cards',ids[i]);
   expect(await geometry()).toEqual(before);
   const after=await page.evaluate(keys=>{const saved=JSON.parse(localStorage.getItem('canary-visual')!);return Object.fromEntries(keys.map(key=>[key,saved[key]]));},Object.keys(unrelated));expect(after).toEqual(unrelated);
   expect(await page.evaluate(()=>[localStorage.getItem('canary-mode'),localStorage.getItem('canary-accent'),localStorage.getItem('canary-compact')])).toEqual(['amoled','purple',String(compact)]);
  }
  await preset(page,4);await page.reload();await expect(page.locator('html')).toHaveAttribute('data-sidebar-mode',mode);await expect(page.locator('html')).toHaveAttribute('data-sidebar-side',side);await expect(page.locator('html')).toHaveAttribute('data-material-cards','clear');
  expect(await page.locator('.sidebar').evaluate(e=>e.classList.contains('compact'))).toBe(compact);
  await nav(page,'Settings').click();await page.getByRole('button',{name:'Reset materials',exact:true}).click();
  expect(await page.evaluate(keys=>{const saved=JSON.parse(localStorage.getItem('canary-visual')!);return Object.fromEntries(keys.map(key=>[key,saved[key]]));},Object.keys(unrelated))).toEqual(unrelated);
  await page.keyboard.press('Escape');
 }
});

test('legacy Clear Glass normalization preserves explicit layout and custom category choices',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('canary-visual',JSON.stringify({materialPreset:'clear',materialLinked:true,materialStyle:'glass',sidebarMode:'floating',sidebarSide:'right',app:'green',font:'Monocraft',materialCategories:{cards:'liquid',sidebar:'vibrancy'},materialRadius:25})));
 await page.goto('/');const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('canary-visual')!));
 expect(saved).toMatchObject({materialStyle:'clear',sidebarMode:'floating',sidebarSide:'right',app:'green',font:'Monocraft',materialRadius:25,materialCategories:{cards:'liquid',sidebar:'vibrancy'}});
});

test('material identity differs on five backgrounds in Light, Dark, AMOLED and live System transitions; resize is stable',async({page})=>{
 test.setTimeout(600000);const rows:any[]=[];await page.goto('/');await nav(page,'Settings').click();
 const backgrounds=[['dark','linear-gradient(#090e17,#090e17)'],['bright','linear-gradient(#fafcf9,#fafcf9)'],['colorful','linear-gradient(45deg,#b97183,#619d92,#577bc1)'],['photo','url(/backgrounds/sakura1-bg.jpg)'],['gradient','linear-gradient(135deg,#838f99,#a3a296)']];
 for(const theme of ['Light','Dark','AMOLED','System']){
  await page.locator('.mode-grid').getByRole('button',{name:theme,exact:true}).click();
  if(theme==='System')await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});
  for(let i=0;i<materials.length;i++){
   await preset(page,i);
   const geometry=await page.locator('.settings-modal').boundingBox();
   for(const [background,image] of backgrounds){
    await page.locator('.material-preview').evaluate((e:HTMLElement,image)=>e.style.backgroundImage=image,image);
    await page.locator('.sidebar-art .artwork-layer').evaluateAll((nodes,image)=>nodes.forEach(node=>(node as HTMLElement).style.backgroundImage=image),image);
    const metrics=await page.locator('.material-preview-card').evaluate(e=>{const s=getComputedStyle(e);return {fill:s.backgroundColor,filter:s.backdropFilter,sheen:s.backgroundImage,shadow:s.boxShadow,border:s.borderColor};});
    rows.push({theme,material:materials[i],background,...metrics});
    await page.locator('.material-preview').scrollIntoViewIfNeeded();
    await page.locator('.material-preview').screenshot({path:`${directory}/${theme}-${ids[i]}-${background}.png`});expect(await page.locator('.settings-modal').boundingBox()).toEqual(geometry);
   }
   if(theme==='System'){
    await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});await expect(page.locator('html')).toHaveAttribute('data-mode','dark');await expect(page.locator('html')).toHaveAttribute('data-material-cards',ids[i]);
    await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});await expect(page.locator('html')).toHaveAttribute('data-mode','light');
   }
  }
 }
 for(const theme of ['Light','Dark','AMOLED','System'])for(const [background] of backgrounds){const variants=rows.filter(row=>row.theme===theme&&row.background===background).map(({fill,filter,sheen,shadow,border})=>JSON.stringify({fill,filter,sheen,shadow,border}));expect(new Set(variants).size).toBe(7);}
 for(const width of [1920,1280,780,480]){await page.setViewportSize({width,height:width===480?340:800});for(let i=0;i<materials.length;i++){await preset(page,i);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('.settings-modal').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);}}
 writeFileSync(`${directory}/materials.json`,JSON.stringify(rows,null,2));
});

const projects=['Better MC','Sodium','Fabric API','Iris','Lithium'].map((title,i)=>({project_id:'pack-'+i,title,description:'A stable project identity',downloads:100-i,project_type:'modpack',versions:['1.21.1'],categories:['fabric']}));
const card=(page:Page,index=0)=>page.locator(`[data-project-id="modrinth:pack-${index}"]`);
async function discover(page:Page,holdVersion?:(route:Route)=>void){
 await page.route('https://api.modrinth.com/v2/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/version')){if(holdVersion){holdVersion(route);return;}return route.fulfill({json:[{id:'version-'+url.pathname.split('/')[3],version_number:'1.0',name:'1.0',game_versions:['1.21.1'],loaders:['fabric'],files:[{filename:'pack.mrpack',url:'https://example.org/pack.mrpack'}]}]});}
  if(url.pathname.endsWith('/search')){let hits=[...projects];if(Number(url.searchParams.get('offset'))>0)hits=hits.map(p=>({...p,project_id:p.project_id+'-other'}));if(url.searchParams.get('query'))hits=hits.filter(p=>p.title.includes(url.searchParams.get('query')!));if(url.searchParams.get('index')==='newest')hits.reverse();return route.fulfill({json:{hits,total_hits:24}});}
  return route.fulfill({json:{}});
 });
 await page.goto('/');await nav(page,'Discover').click();await expect(page.locator('.discover-page .project-card')).toHaveCount(5);
}
async function start(page:Page,index=0){await expect(page.locator('.page-transition')).toHaveCSS('opacity','1');await card(page,index).getByRole('button',{name:'Install',exact:true}).scrollIntoViewIfNeeded();const geometry=await card(page,index).boundingBox();await card(page,index).getByRole('button',{name:'Install',exact:true}).dblclick();await expect(card(page,index)).toContainText('Installing');expect(await card(page,index).boundingBox()).toEqual(geometry);await expect(page.locator('.detail-page')).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>(globalThis as any).__materialQA.installs?.length??0)).toBe(1);}
async function scoped(page:Page,index=0){await expect(page.locator('.discover-page .project-card').filter({hasText:'Installing'})).toHaveCount(1);await expect(card(page,index)).toContainText('Installing');for(let i=0;i<projects.length;i++)if(i!==index)await expect(card(page,i)).not.toContainText('Installing');}

test('one install stays scoped through progress, search, filter, sort, pagination, scroll and navigation; Downloads cancellation clears it',async({page})=>{
 test.setTimeout(60000);await discover(page);await start(page);await scoped(page);
 const taskId=await card(page).getAttribute('data-task-id');expect(taskId).toMatch(/^[0-9a-f-]{36}$/);
 await page.evaluate(()=>(globalThis as any).__materialQA.emitInstall(0,{revision:2,percent:67,completed:67,downloaded:67}));await expect(card(page).getByRole('button',{name:'Installing · 67%',exact:true})).toBeDisabled();await expect(card(page)).toContainText('67%');
 await page.locator('.search-field input').fill('Sodium');await expect(page.locator('.discover-page .project-card')).toHaveCount(1);await expect(page.locator('.discover-page .project-card')).not.toContainText('Installing');await page.locator('.search-field input').fill('');await expect(page.locator('.discover-page .project-card')).toHaveCount(5);await scoped(page);
 await choose(page,'Sort','Newest');await scoped(page);
 await page.locator('.filter-wrap>.control-button').click();await page.locator('.filter-popover .glass-select-trigger').first().click();await page.getByRole('option',{name:'1.21.1',exact:true}).click();await page.locator('.filter-wrap>.control-button').click();await scoped(page);
 await page.locator('.pagination button').last().click();await expect(card(page)).toHaveCount(0);await expect(page.locator('.discover-page .project-card').filter({hasText:'Installing'})).toHaveCount(0);await page.locator('.pagination button').first().click();await scoped(page);
 await page.locator('.content-shell').evaluate(e=>{e.scrollTop=1000;});await card(page).scrollIntoViewIfNeeded();await scoped(page);
 await nav(page,'Library').click();await nav(page,'Discover').click();await scoped(page);await expect(card(page)).toHaveAttribute('data-task-id',taskId!);
 await nav(page,'Downloads').click();await expect(page.locator('.activity-active')).toContainText('Better MC');await page.locator('.activity-active').getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.locator('.activity-active .activity-task')).toHaveCount(0);
 await nav(page,'Discover').click();await expect(card(page).getByRole('button',{name:'Install',exact:true})).toBeEnabled();await expect(page.locator('.project-card').filter({hasText:'Installing'})).toHaveCount(0);
 await page.evaluate(()=>(globalThis as any).__materialQA.emitInstall(0,{status:'running',revision:999,percent:99}));await expect(card(page)).not.toContainText('Installing');
 await nav(page,'Library').click();await expect(page.locator('.instance-card').filter({hasText:'Better MC'})).toHaveCount(0);
});

test('failure clears only its project, retry/success publishes one Library instance and updates only that card',async({page})=>{
 await discover(page);await start(page,2);await scoped(page,2);await page.evaluate(()=>(globalThis as any).__materialQA.failInstall(0));await expect(card(page,2).getByRole('button',{name:'Install',exact:true})).toBeEnabled();
 await nav(page,'Library').click();await expect(page.locator('.instance-card').filter({hasText:'Fabric API'})).toHaveCount(0);await nav(page,'Discover').click();
 await card(page,2).getByRole('button',{name:'Install',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(globalThis as any).__materialQA.installs.length)).toBe(2);
 await page.evaluate(()=>(globalThis as any).__materialQA.completeInstall(1));await expect(page.locator('.library-intro')).toBeVisible();await expect(page.locator('.instance-card').filter({hasText:'Fabric API'})).toHaveCount(1);
 await nav(page,'Discover').click();await expect(card(page,2).getByRole('button',{name:'Installed',exact:true})).toBeDisabled();for(const i of [0,1,3,4])await expect(card(page,i).getByRole('button',{name:'Install',exact:true})).toBeEnabled();
 await page.evaluate(()=>(globalThis as any).__materialQA.emitInstall(1,{status:'running',revision:999}));await expect(page.locator('.project-card').filter({hasText:'Installing'})).toHaveCount(0);
 const args=await page.evaluate(()=>(globalThis as any).__materialQA.installs[1].args);expect(args).toMatchObject({projectId:'pack-2',versionId:'version-pack-2'});expect(args.taskId).toMatch(/^[0-9a-f-]{36}$/);
});

test('cancel during version lookup stops preparation without invoking the native install or leaving stale state',async({page})=>{
 let held:Route|undefined;await discover(page,route=>{held=route;});await card(page).getByRole('button',{name:'Install',exact:true}).click();await expect(card(page)).toContainText('Installing');await nav(page,'Downloads').click();await page.locator('.activity-active').getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.locator('.activity-active .activity-task')).toHaveCount(0);await nav(page,'Discover').click();await expect(card(page).getByRole('button',{name:'Install',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>(globalThis as any).__materialQA.calls.filter((c:any)=>['install_modpack','cancel_operation'].includes(c.command)))).toEqual([]);await held?.abort().catch(()=>{});
});

test('restored task snapshots keep provider/project identity, multiple tasks remain independent and CurseForge creates no fake task',async({page})=>{
 await discover(page);await page.evaluate(async()=>{const {emit}=await import('/node_modules/@tauri-apps/api/event.js' as string);for(const i of [0,3])await emit('activity-task',{id:crypto.randomUUID(),operationId:'opaque-'+i,projectId:'pack-'+i,versionId:'v-'+i,provider:'modrinth',kind:'install',title:'Restored task '+i,status:'running',stage:'libraries',revision:2,startedAt:100,updatedAt:100,cancellable:true,cancelRequested:false,percent:25,completed:25,total:100,downloaded:25,bytesTotal:100,speed:1,currentFile:''});});
 await expect(page.locator('.discover-page .project-card').filter({hasText:'Installing'})).toHaveCount(2);await expect(card(page,1)).not.toContainText('Installing');await choose(page,'Provider','CurseForge · unavailable');await expect(page.locator('.empty-state')).toContainText('CurseForge is unavailable');await expect(page.locator('.project-card')).toHaveCount(0);expect(await page.evaluate(()=>(globalThis as any).__materialQA.calls.some((c:any)=>c.command==='install_curseforge_pack'))).toBe(false);
});

test('actual Discover card text retains contrast in all presets and themes over bright and colorful wallpapers',async({page})=>{
 test.setTimeout(180000);await page.addInitScript(()=>localStorage.setItem('canary-visual',JSON.stringify({app:'sakura1',intensity:100,blur:0,globalTreatment:{overlay:35,vignette:0}})));await discover(page);const results:any[]=[];
 for(const theme of ['Light','Dark','AMOLED'])for(let i=0;i<materials.length;i++){
  await nav(page,'Settings').click();await page.locator('.mode-grid').getByRole('button',{name:theme,exact:true}).click();await preset(page,i);await page.keyboard.press('Escape');await expect(page.locator('.settings-modal')).toHaveCount(0);
  for(const [background,image] of [['bright','linear-gradient(#fff,#fff)'],['colorful','linear-gradient(45deg,#d66a97,#5cc9a4,#4d75c7)']]){
   await page.locator('.global-wallpaper .artwork-layer').evaluateAll((nodes,image)=>nodes.forEach(node=>(node as HTMLElement).style.backgroundImage=image),image);
   await card(page).scrollIntoViewIfNeeded();const origin=(await card(page).boundingBox())!;
   const point=await card(page).locator('.card-body>p').evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.right-3,y:r.top+2};});
   const png=await card(page).screenshot({path:`${directory}/discover-${theme}-${ids[i]}-${background}.png`});
   const metrics=await card(page).evaluate(async(e,{png,point})=>{
    const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);const bg=[...ctx.getImageData(point.x,point.y,1,1).data].slice(0,3);
    const lum=(rgb:number[])=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
    const contrast=(selector:string)=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=getComputedStyle(e.querySelector(selector)!).color;ctx.fillRect(0,0,1,1);const fg=[...ctx.getImageData(0,0,1,1).data].slice(0,3);return (Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05);};
    return {primary:contrast('.card-title'),secondary:contrast('.card-body>p'),provider:contrast('.card-provider'),bg};
   },{png:png.toString('base64'),point:{x:Math.round(point.x-origin.x),y:Math.round(point.y-origin.y)}});
   results.push({theme,material:materials[i],background,...metrics});for(const key of ['primary','secondary','provider'] as const)expect(metrics[key],`${theme}/${materials[i]}/${background}/${key}`).toBeGreaterThanOrEqual(4.5);
  }
 }
 writeFileSync(`${directory}/discover-contrast.json`,JSON.stringify(results,null,2));
});


test('changing layout and corner radius keeps the selected material preset',async({page})=>{
 await page.goto('/');await nav(page,'Settings').click();await preset(page,4);await choose(page,'Sidebar layout','Floating');
 await page.locator('.material-advanced summary').click();await page.getByRole('slider',{name:'Corner radius',exact:true}).fill('24');await page.getByRole('slider',{name:'Corner radius',exact:true}).press('Tab');
 await expect(page.getByRole('combobox',{name:'Material preset',exact:true})).toContainText('Clear Glass');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('canary-visual')!));expect(saved).toMatchObject({materialPreset:'clear',materialStyle:'clear',materialRadius:24,sidebarMode:'floating'});
});


test('material rendering retains independent sidebar background treatment controls',async({page})=>{
 await page.goto('/');await nav(page,'Settings').click();await preset(page,4);
 const change=(patch:Record<string,unknown>)=>reloadWithPreferences(page,patch);
 const rendered=()=>page.locator('.sidebar-art').evaluate(e=>({filter:getComputedStyle(e).filter,overlay:getComputedStyle(e,'::after').backgroundImage}));
 const before=await rendered();await change({sidebarBlur:2,sidebarTreatment:{brightness:110,saturation:60,overlay:35,vignette:10,zoom:100,position:'center'}});const after=await rendered();expect(after.filter).toContain('blur(2px)');expect(after.filter).toContain('brightness(1.1)');expect(after.overlay).not.toBe(before.overlay);
 await nav(page,'Settings').click();await preset(page,5);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('canary-visual')!))).toMatchObject({sidebarBlur:2,sidebarTreatment:{brightness:110,saturation:60,overlay:35,vignette:10}});
});

