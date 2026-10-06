import {test, expect, type Page} from '@playwright/test';
import {mkdirSync, writeFileSync} from 'node:fs';
import {nativeFixture} from './helpers/nativeFixture';

const nav=(page:Page,name:string)=>page.locator('.sidebar nav').getByRole('button',{name,exact:true});
async function choose(page:Page,label:string,name:string){await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name,exact:true}).click();}
const palettes=[['light','white'],['light','softLight'],['light','frost'],['light','warm'],['dark','graphite'],['dark','black'],['dark','softDark'],['dark','midnight'],['amoled','graphite']];
const accents=['monochrome','white','gray','mint','emerald','aqua','blue','purple','rose','orange'];
const materials=['Solid','Soft','Vibrancy','Glass','Liquid Glass','Transparent'];
test.beforeEach(async({page})=>{mkdirSync('.qa/theme-contrast',{recursive:true});await nativeFixture(page);await page.emulateMedia({reducedMotion:'reduce'});});

test('rendered foreground contrast across every palette, accent and material on extreme underlays',async({page})=>{
  test.setTimeout(120000);
  await page.goto('/');await nav(page,'Settings').click();await choose(page,'Material preset','Vibrancy');
  const results:any[]=[];
  for(const material of materials){
    await choose(page,'Shared material',material);
    for(const [mode,preset] of palettes){
      const metrics=await page.evaluate(async({mode,preset,accents})=>{
        const root=document.documentElement;root.dataset.mode=mode;root.dataset.preset=preset;
        const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d')!;
        const rgba=(color:string)=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v);};
        const blend=(a:number[],b:number[])=>a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3]));
        const lum=(rgb:number[])=>rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
        const ratio=(a:number[],b:number[])=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
        const token=(name:string)=>{const e=document.createElement('span');e.style.color=`var(${name})`;root.append(e);const result=rgba(getComputedStyle(e).color);e.remove();return result;};
        const worst=(fg:number[],fill:number[])=>Math.min(...[[0,0,0],[255,255,255]].map(base=>ratio(fg,blend(fill,base))));
        const output=[];
        for(const accent of accents){
          root.dataset.accent=accent;await new Promise(resolve=>setTimeout(resolve,20));
          const modal=document.querySelector('.settings-modal')!,input=document.querySelector('.settings-search input')!,button=document.querySelector('.mode-grid button:not(.selected)')!;
          const modalFill=rgba(getComputedStyle(modal).backgroundColor),inputFill=rgba(getComputedStyle(input).backgroundColor),buttonFill=rgba(getComputedStyle(button).backgroundColor);
          const placeholder=rgba(getComputedStyle(input,'::placeholder').color);
          output.push({mode,preset,accent,primary:worst(token('--text'),modalFill),secondary:worst(token('--muted'),modalFill),tertiary:worst(token('--faint'),modalFill),placeholder:worst(placeholder,inputFill),control:worst(rgba(getComputedStyle(button).color),buttonFill),accentInk:worst(token('--accent'),inputFill),modalAlpha:modalFill[3],inputAlpha:inputFill[3]});
        }
        return output;
      },{mode,preset,accents});
      results.push(...metrics.map(m=>({...m,material})));
    }
  }
  writeFileSync('.qa/theme-contrast/contrast-matrix.json',JSON.stringify(results,null,2));
  for(const r of results){
    const context=`${r.mode}/${r.preset}/${r.accent}/${r.material}`;
    expect(r.primary,context+' primary').toBeGreaterThanOrEqual(7);
    for(const key of ['secondary','tertiary','placeholder','control'])expect(r[key],context+' '+key).toBeGreaterThanOrEqual(4.5);
    expect(r.accentInk,context+' accent').toBeGreaterThanOrEqual(4.5);
    expect(r.modalAlpha,context+' dialog tint').toBeGreaterThanOrEqual(.94);
    expect(r.inputAlpha,context+' input tint').toBeGreaterThanOrEqual(.94);
  }
});

test('Soft Light settings keep distinct navigation, selected, hover, pressed, disabled and single search focus',async({page})=>{
  await page.addInitScript(()=>{localStorage.setItem('canary-mode','light');localStorage.setItem('canary-preset','softLight');localStorage.setItem('canary-language','ru');localStorage.setItem('canary-visual',JSON.stringify({materialLinked:true,materialStyle:'glass',app:'sakura1',intensity:100}));});
  await page.goto('/');await nav(page,'Настройки').click();
  await expect(page.locator('.preset-grid button.selected')).toHaveText('Мягкий светлый');
  await expect(page.locator('.sidebar-bottom button')).toHaveCount(2);
  await expect(page.locator('.activity-dock,.activity-overlay')).toHaveCount(0);
  const surface=async(selector:string)=>page.locator(selector).evaluate(e=>({fill:getComputedStyle(e).backgroundColor,border:getComputedStyle(e).borderColor,color:getComputedStyle(e).color,opacity:getComputedStyle(e).opacity}));
  expect((await surface('.settings-nav')).fill).not.toBe((await surface('.settings-modal')).fill);
  const target=page.locator('.preset-grid button').first();const normal=await surface('.preset-grid button:first-child');
  await target.hover();const hover=await surface('.preset-grid button:first-child');expect(hover.fill).not.toBe(normal.fill);
  await page.mouse.down();const pressed=await surface('.preset-grid button:first-child');expect(pressed.fill).not.toBe(hover.fill);await page.mouse.move(10,10);await page.mouse.up();
  await target.evaluate((e:HTMLButtonElement)=>e.disabled=true);const disabled=await surface('.preset-grid button:first-child');expect(disabled.opacity).toBe('1');expect(disabled.color).not.toBe(normal.color);
  await target.evaluate((e:HTMLButtonElement)=>e.disabled=false);
  const selected=page.locator('.preset-grid button.selected');await selected.hover();const selectedHover=await selected.evaluate(e=>getComputedStyle(e).backgroundColor);await page.mouse.down();expect(await selected.evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe(selectedHover);await page.mouse.move(10,10);await page.mouse.up();
  const search=page.getByRole('searchbox');await search.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
  const focus=await search.evaluate(e=>({outline:getComputedStyle(e).outlineStyle,width:getComputedStyle(e).outlineWidth,border:getComputedStyle(e).borderWidth,placeholder:getComputedStyle(e,'::placeholder').opacity}));
  expect(focus).toMatchObject({outline:'none',border:'1px',placeholder:'1'});expect(await search.evaluate(e=>getComputedStyle(e).boxShadow)).not.toBe('none');
  await search.fill('Vibrancy');await expect(search).toHaveValue('Vibrancy');await search.fill('');
  await page.screenshot({path:'.qa/theme-contrast/soft-light-after.png'});
});

for(const [locale,font] of [['en','Nunito'],['ru','Monocraft']])test(`Soft Light screen flow at 760x540: ${locale}/${font}`,async({page})=>{
  test.setTimeout(60000);await page.setViewportSize({width:760,height:540});
  await page.addInitScript(({locale,font})=>{localStorage.setItem('canary-mode','light');localStorage.setItem('canary-preset','softLight');localStorage.setItem('canary-language',locale);localStorage.setItem('canary-visual',JSON.stringify({font,minecraft:'full',fontScale:120,materialLinked:true,materialStyle:'liquid',app:'sakura1',intensity:100}));},{locale,font});
  const ru=locale==='ru';await page.goto('/');
  const shot=async(name:string)=>{await expect(page.locator('.page-transition')).toHaveCSS('opacity','1');for(const selector of ['.detail-content>div','.settings-content>div']){for(const node of await page.locator(selector).all())await expect(node).toHaveCSS('opacity','1');}if(await page.locator('.settings-modal').count())await expect(page.locator('.settings-modal')).toHaveCSS('opacity','1');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:`.qa/theme-contrast/${locale}-${name}.png`});};
  await expect(page.locator('.home-greeting')).toBeVisible();await shot('home');
  await nav(page,ru?'Библиотека':'Library').click();await expect(page.locator('.instance-card')).toHaveCount(9);await shot('library');
  await choose(page,ru?'Карточки экземпляров':'Instance card layout',ru?'Компактные':'Compact');await shot('library-compact');
  await nav(page,ru?'Загрузки':'Downloads').click();
  await page.evaluate(async()=>{const {emit}=await import('/node_modules/@tauri-apps/api/event.js' as string);await emit('activity-task',{id:'contrast-task',operationId:'contrast-operation',kind:'install',title:'Better MC',status:'running',stage:'libraries',startedAt:100,updatedAt:100,revision:1,cancellable:true,cancelRequested:false,completed:43,total:97,downloaded:1024,bytesTotal:2048,percent:67,speed:1024,currentFile:'library.jar'});});
  await expect(page.locator('.activity-active progress')).toHaveAttribute('value','67');await expect(page.locator('.activity-active button')).toBeEnabled();await shot('downloads');
  const project={project_id:'contrast-project',id:'contrast-project',title:'Better MC',slug:'contrast-project',project_type:'modpack',description:'A readable project description',body:'# Better MC\n\nA calm, readable description.\n\n[Website](https://example.org)',downloads:1234,followers:120,versions:['1.21.1'],categories:['fabric'],icon_url:'',license:{id:'MIT'},gallery:[{url:'http://127.0.0.1:1420/branding/canary-bird-black.png',title:'Gallery image',description:'Readable gallery caption',featured:true}]};
  const version={id:'contrast-version',name:'1.21.1',version_number:'1.21.1',version_type:'release',game_versions:['1.21.1'],loaders:['fabric'],date_published:'2026-10-01T00:00:00Z',downloads:100,dependencies:[],files:[{filename:'better-mc.mrpack',url:'https://example.org/better-mc.mrpack',primary:true,size:2048,hashes:{}}]};
  await page.route('https://api.modrinth.com/v2/**',route=>route.fulfill({json:route.request().url().includes('/version')?[version]:route.request().url().includes('/search')?{hits:[project],total_hits:1}:project}));
  await nav(page,ru?'Обзор':'Discover').click();await page.locator('.search-field input').fill('Better');await expect(page.locator('.project-card')).toHaveCount(1);await shot('discover');
  await page.locator('.project-card .card-title').click();await expect(page.locator('.detail-page')).toBeVisible();await shot('project');
  for(const tab of await page.locator('.detail-tabs button').all()){await tab.click();await expect(tab).toHaveAttribute('aria-selected','true');await shot('project-'+(await tab.textContent())!.trim());}
  await page.keyboard.press('Escape');await nav(page,ru?'Настройки':'Settings').click();await shot('settings-small');
  expect(await page.locator('.settings-content').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
});

test('System follows OS light/dark and materials retain legible tint over bright/dark/colorful artwork',async({page})=>{
  test.setTimeout(60000);await page.addInitScript(()=>{localStorage.setItem('canary-mode','system');localStorage.setItem('canary-preset','softLight');localStorage.setItem('canary-visual',JSON.stringify({materialLinked:true,materialStyle:'transparent',app:'sakura1',intensity:100,blur:0}));});
  await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});await page.goto('/');await nav(page,'Settings').click();await expect(page.locator('html')).toHaveAttribute('data-mode','light');
  for(const name of materials){
    await choose(page,'Shared material',name);
    for(const [art,background] of [['bright','#fff'],['dark','#000'],['colorful','linear-gradient(45deg,#ff0077,#00ffbb,#0033ff)'],['blurred','linear-gradient(45deg,#f1e1c8,#b5c8de)']]){
      await page.locator('.visual-backdrop').evaluate((e:HTMLElement,bg)=>{e.style.background=bg;e.style.zIndex='0';e.style.filter=bg.includes('f1e1')?'blur(20px)':'none';e.querySelectorAll('*').forEach(n=>(n as HTMLElement).style.display='none');},background);
      await page.screenshot({path:`.qa/theme-contrast/system-${name.replaceAll(' ','-')}-${art}.png`});
      await expect(page.locator('.settings-search input')).toHaveCSS('color','rgb(36, 49, 40)');
    }
  }
  await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});await expect(page.locator('html')).toHaveAttribute('data-mode','dark');
  await expect(page.locator('.settings-search input')).toHaveCSS('color','rgb(237, 242, 239)');await page.screenshot({path:'.qa/theme-contrast/system-dark.png'});
});

test('bare page text remains readable over extreme images at maximum intensity and minimum overlay',async({page})=>{
  test.setTimeout(60000);const metrics:any[]=[];
  for(const mode of ['light','dark','amoled']){
    await page.addInitScript(mode=>{localStorage.setItem('canary-mode',mode);localStorage.setItem('canary-preset',mode==='light'?'softLight':'graphite');localStorage.setItem('canary-visual',JSON.stringify({app:'sakura1',intensity:100,blur:0,globalTreatment:{overlay:35,vignette:0},materialLinked:true,materialStyle:'glass'}));},mode);
    await page.goto('/');await expect(page.locator('.page-transition')).toHaveCSS('opacity','1');
    for(const [name,image] of [['bright','linear-gradient(#fff,#fff)'],['dark','linear-gradient(#000,#000)'],['colorful','linear-gradient(45deg,#ff0077,#00ffbb,#0033ff)']]){
      await page.locator('.global-wallpaper .artwork-current').evaluate((e:HTMLElement,image)=>e.style.backgroundImage=image,image);
      const point=await page.locator('.topbar-sub').evaluate(e=>{const r=e.getBoundingClientRect();return {x:Math.floor(r.right-2),y:Math.floor(r.top+1)};});
      const png=await page.screenshot({path:`.qa/theme-contrast/page-${mode}-${name}.png`});
      const result=await page.evaluate(async({png,point})=>{
        const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);const bg=[...ctx.getImageData(point.x,point.y,1,1).data].slice(0,3);
        const lum=(rgb:number[])=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
        const contrast=(selector:string)=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=getComputedStyle(document.querySelector(selector)!).color;ctx.fillRect(0,0,1,1);const fg=[...ctx.getImageData(0,0,1,1).data].slice(0,3);return (Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05);};
        return {bg,primary:contrast('.home-greeting'),secondary:contrast('.topbar-sub'),tertiary:contrast('.breadcrumb')};
      },{png:png.toString('base64'),point});
      metrics.push({mode,name,...result});
    }
  }
  writeFileSync('.qa/theme-contrast/page-pixel-contrast.json',JSON.stringify(metrics,null,2));
  for(const m of metrics){const context=m.mode+'/'+m.name;expect(m.primary,context+' primary').toBeGreaterThanOrEqual(7);expect(m.secondary,context+' secondary').toBeGreaterThanOrEqual(4.5);expect(m.tertiary,context+' tertiary').toBeGreaterThanOrEqual(3.5);}
});
