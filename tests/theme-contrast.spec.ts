import {settingsSection} from "./helpers/settings";
import {reloadWithSeed} from './helpers/preferences';
import {test, expect, type Page} from '@playwright/test';
import {mkdirSync, writeFileSync} from 'node:fs';
import {nativeFixture} from './helpers/nativeFixture';

const nav=(page:Page,name:string)=>page.locator('.sidebar nav').getByRole('button',{name,exact:true});
async function choose(page:Page,label:string,name:string){
 if(await page.locator(".settings-modal").isVisible()){if(["Material preset","Shared material","Button style","Card material"].includes(label))await settingsSection(page,"materials");if(label==="Sidebar layout")await settingsSection(page,"sidebar");}
await page.getByRole('combobox',{name:label,exact:true}).evaluate(el=>{for(let details=el.closest('details');details;details=details.parentElement?.closest('details')??null)details.open=true;});await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name,exact:true}).click();}
const palettes=[['light','white'],['light','softLight'],['light','frost'],['light','warm'],['dark','graphite'],['dark','black'],['dark','softDark'],['dark','midnight'],['amoled','graphite']];
const accents=['monochrome','white','winter-island','mint','emerald','aqua','blue','purple','rose','orange'];
const materials=['Solid','Soft','Vibrancy','Glass','Clear Glass','Liquid Glass','Transparent'];
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
        const extremeUnderlays=[[0,0,0],[255,255,255]];
        const output=[];
        for(const accent of accents){
          root.dataset.accent=accent;await new Promise(resolve=>setTimeout(resolve,20));
          const modal=document.querySelector('.settings-modal')!,input=document.querySelector('.settings-search input')!,button=document.querySelector('.settings-group-toggle')!;
          const modalFill=rgba(getComputedStyle(modal).backgroundColor),inputFill=rgba(getComputedStyle(input).backgroundColor),buttonFill=rgba(getComputedStyle(button).backgroundColor);
          const placeholder=rgba(getComputedStyle(input,'::placeholder').color);
          // Contrast uses the displayed stack: wallpaper tint, modal backdrop,
          // dialog fill, then the control fill. A translucent input is not
          // painted directly onto the wallpaper.
          const palette=token('--bg');
          const overlay=parseFloat(root.style.getPropertyValue('--wallpaper-overlay'))/100;
          const backdrop=rgba(getComputedStyle(document.querySelector('.modal-backdrop')!).backgroundColor);
          const modalBackgrounds=extremeUnderlays.map(base=>blend(modalFill,blend(backdrop,blend([...palette.slice(0,3),overlay],base))));
          const worst=(fg:number[],fill?:number[])=>Math.min(...modalBackgrounds.map(base=>ratio(fg,fill?blend(fill,base):base)));

          output.push({mode,preset,accent,primary:worst(token('--text')),secondary:worst(token('--muted')),tertiary:worst(token('--faint')),placeholder:worst(placeholder,inputFill),control:worst(rgba(getComputedStyle(button).color),buttonFill),accentInk:worst(token('--accent'),inputFill),modalAlpha:modalFill[3],inputAlpha:inputFill[3]});
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
    if(r.material==='Solid'){expect(r.modalAlpha).toBe(1);expect(r.inputAlpha).toBe(1);}else{expect(r.modalAlpha).toBeLessThan(1);expect(r.inputAlpha).toBeLessThan(1);}
  }
});

test('Soft Light settings keep distinct navigation, selected, hover, pressed, disabled and single search focus',async({page})=>{
  await page.addInitScript(()=>{localStorage.setItem('canary-mode','light');localStorage.setItem('canary-preset','softLight');localStorage.setItem('canary-language','ru');localStorage.setItem('canary-visual',JSON.stringify({materialLinked:true,materialStyle:'glass',app:'amethyst-cave',intensity:100}));});
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
  await page.addInitScript(({locale,font})=>{localStorage.setItem('canary-mode','light');localStorage.setItem('canary-preset','softLight');localStorage.setItem('canary-language',locale);localStorage.setItem('canary-visual',JSON.stringify({font,minecraft:'full',fontScale:120,materialLinked:true,materialStyle:'liquid',app:'amethyst-cave',intensity:100}));},{locale,font});
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
  test.setTimeout(60000);await page.addInitScript(()=>{localStorage.setItem('canary-mode','system');localStorage.setItem('canary-preset','softLight');localStorage.setItem('canary-visual',JSON.stringify({materialLinked:true,materialStyle:'transparent',app:'amethyst-cave',intensity:100,blur:0}));});
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

test('page headings keep the wallpaper visible across pages, themes and quality modes',async({page})=>{
  test.setTimeout(90000);const metrics:any[]=[];
  await page.goto('/');
  for(const mode of ['light','dark','amoled']){
    await reloadWithSeed(page,`localStorage.setItem('canary-mode',${JSON.stringify(mode)});localStorage.setItem('canary-preset',${JSON.stringify(mode==='light'?'softLight':'graphite')});localStorage.setItem('canary-visual',JSON.stringify({backgroundSource:'canary',app:'amethyst-cave',intensity:100,blur:0,globalTreatment:{overlay:35,vignette:0},materialLinked:true,materialStyle:'glass'}));`);
    await expect(page.locator('html')).toHaveAttribute('data-mode',mode);
    // A uniform mauve scene makes any separate heading plate visible in pixels.
    await page.locator('.visual-backdrop').evaluate((element:HTMLElement)=>{
      element.style.background='rgb(137, 119, 151)';element.querySelectorAll<HTMLElement>('*').forEach(child=>child.style.display='none');
    });
    for(const name of ['Home','Discover','Library','Downloads','Screenshots','Activity']){
      await nav(page,name).click();await expect(page.locator('.topbar h1')).toBeVisible();
      for(const variant of ['normal','low','focus','opaque']){
        await page.evaluate(variant=>{
          const root=document.documentElement;root.dataset.quality=variant==='low'?'low':'balanced';root.dataset.focus=String(variant==='focus');root.dataset.reduceTransparency=String(variant==='opaque');
        },variant);
        const style=await page.locator('.topbar-heading').evaluate(element=>{
          const style=getComputedStyle(element),before=getComputedStyle(element,'::before');
          return {background:style.backgroundColor,image:style.backgroundImage,shadow:style.boxShadow,before:before.content};
        });
        expect(style.background,`${mode}/${name}/${variant}`).toBe('rgba(0, 0, 0, 0)');
        expect(style.image).toBe('none');expect(style.shadow).toBe('none');expect(['none','normal']).toContain(style.before);
        await expect(page.locator('.topbar h1')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
      }
      const points=await page.locator('.topbar-heading').evaluate(element=>{
        const rect=element.getBoundingClientRect(),x=Math.floor(rect.left+rect.width/2);
        return [{x,y:Math.floor(rect.top+1)},{x,y:Math.floor(rect.top-10)}];
      });
      const png=await page.screenshot({path:`.qa/theme-contrast/unboxed-${mode}-${name.toLowerCase()}.png`});
      const pixels=await page.evaluate(async({png,points})=>{
        const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);
        return points.map(({x,y})=>[...ctx.getImageData(x,y,1,1).data].slice(0,3));
      },{png:png.toString('base64'),points});
      metrics.push({mode,name,pixels});
      expect(pixels[0],`${mode}/${name} heading matches the surrounding wallpaper`).toEqual(pixels[1]);
    }
  }
  writeFileSync('.qa/theme-contrast/unboxed-headings.json',JSON.stringify(metrics,null,2));
});
