import {test,expect,type Page} from '@playwright/test';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';

const config=JSON.parse(readFileSync('src-tauri/tauri.conf.json','utf8'));
const html=readFileSync('dist/index.html','utf8');
// Match Tauri's compile-time authorization of bundled inline startup scripts.
// The separate native check verifies Tauri's actual generated policy and IPC.
const hashes=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].filter(m=>m[1].trim()).map(m=>`'sha256-${createHash('sha256').update(m[1].replace(/\r\n?/g,'\n')).digest('base64')}'`);
const policy={...config.app.security.csp,'script-src':`${config.app.security.csp['script-src']} ${hashes.join(' ')}`};
const header=Object.entries(policy).map(([key,value])=>`${key} ${value}`).join('; ');
async function production(page:Page){
 await page.addInitScript(()=>{
  (globalThis as any).__csp=[];
  document.addEventListener('securitypolicyviolation',e=>(globalThis as any).__csp.push({directive:e.effectiveDirective,blocked:e.blockedURI}));
  localStorage.setItem('canary-mode','light');
  localStorage.setItem('canary-visual',JSON.stringify({backgroundSource:'canary',app:'sakura1',sidebar:'green',materialPreset:'glass',materialLinked:true,materialStyle:'glass',showHero:true,showCommunity:false,discordEnabled:false,cursor:'custom'}));
 });
 const root=resolve('dist');
 await page.route('http://127.0.0.1:1420/**',async route=>{
  const name=decodeURIComponent(new URL(route.request().url()).pathname);
  const file=name==='/'?resolve(root,'index.html'):resolve(root,'.'+name);
  if(!file.startsWith(root+sep)||!existsSync(file))return route.fulfill({status:404,body:'Not found'});
  const mime:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.ttf':'font/ttf','.woff2':'font/woff2','.svg':'image/svg+xml','.cur':'image/x-icon'};
  await route.fulfill({body:readFileSync(file),contentType:mime[extname(file)]||'application/octet-stream',headers:name==='/'?{'Content-Security-Policy':header}:{}});
 });
 await page.route('https://api.modrinth.com/v2/**',route=>{
  const path=new URL(route.request().url()).pathname;
  const item={id:'safe-pack',project_id:'safe-pack',slug:'safe-pack',title:'CSP project',description:'Readable project',project_type:'modpack',downloads:100,categories:['fabric'],versions:['1.21.1'],game_versions:['1.21.1'],loaders:['fabric'],gallery:[],icon_url:'https://cdn.modrinth.com/csp-icon.png',followers:1,published:'2026-01-01',updated:'2026-01-01',body:'## Safe description\n\n![Allowed picture](https://cdn.modrinth.com/csp-icon.png)\n\n<script>window.__injected=true</script>'};
  return route.fulfill({json:path.endsWith('/search')?{hits:[item],total_hits:1}:path.endsWith('/version')?[]:path.includes('/tag/')?[]:item,headers:{'access-control-allow-origin':'*'}});
 });
 await page.route('https://cdn.modrinth.com/csp-icon.png',route=>route.fulfill({body:readFileSync('public/branding/canary-bird-white.png'),contentType:'image/png'}));
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');await expect(page.locator('.startup-splash')).toHaveCount(0,{timeout:20000});
}

test('production CSP preserves startup, wallpaper, fonts, themes and live surfaces',async({page})=>{
 await production(page);
 await expect(page.locator('.home-hero')).toBeVisible();
 await expect(page.locator('.global-wallpaper .artwork-current')).toHaveCSS('background-image',/sakura1/);
 await expect.poll(()=>page.evaluate(()=>[...document.images].filter(i=>i.src.includes('/branding/')).every(i=>i.complete&&i.naturalWidth>0))).toBe(true);
 expect(await page.evaluate(async()=>{await document.fonts.ready;return document.fonts.check('16px Nunito');})).toBe(true);
 await page.locator('.sidebar').getByRole('button',{name:'Settings',exact:true}).click();
 for(const theme of ['Dark','AMOLED','Light']){await page.locator('.mode-grid').getByRole('button',{name:theme,exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-mode',theme.toLowerCase());}
 const slider=page.getByRole('slider',{name:'Surface opacity',exact:true});await slider.fill('54');await slider.press('Tab');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('canary-visual')!).surfaceOpacity)).toBe(54);
 expect(await page.evaluate(()=>(globalThis as any).__csp)).toEqual([]);
});

test('production CSP preserves Discover images, API search and lazy project descriptions',async({page})=>{
 await production(page);await page.locator('.sidebar').getByRole('button',{name:'Discover',exact:true}).click();
 await expect(page.locator('.project-card')).toHaveCount(1);
 await expect.poll(()=>page.locator('.project-card img').first().evaluate((i:HTMLImageElement)=>i.complete&&i.naturalWidth>0)).toBe(true);
 await page.getByRole('button',{name:'View project',exact:true}).click();
 await expect(page.locator('.markdown h2')).toHaveText('Safe description');
 await expect.poll(()=>page.locator('.markdown img').evaluate((i:HTMLImageElement)=>i.complete&&i.naturalWidth>0)).toBe(true);
 expect(await page.evaluate(()=>(globalThis as any).__injected)).toBeUndefined();
 expect(await page.evaluate(()=>(globalThis as any).__csp)).toEqual([]);
});

test('production CSP rejects injected scripts, event handlers, frames and unrelated connections',async({page})=>{
 await production(page);
 await page.route('https://untrusted.example/**',r=>r.fulfill({body:'window.__remoteInjected=true',contentType:'text/javascript'}));
 await page.evaluate(async()=>{
  const inline=document.createElement('script');inline.textContent='window.__inlineInjected=true';document.body.append(inline);
  const remote=document.createElement('script');remote.src='https://untrusted.example/script.js';document.body.append(remote);
  const button=document.createElement('button');button.setAttribute('onclick','window.__eventInjected=true');document.body.append(button);button.click();
  const frame=document.createElement('iframe');frame.src='https://untrusted.example/frame';document.body.append(frame);
  try{await fetch('https://untrusted.example/collect');(globalThis as any).__unexpectedFetch=true;}catch{}
 });
 await expect.poll(()=>page.evaluate(()=>(globalThis as any).__csp.length)).toBeGreaterThanOrEqual(5);
 expect(await page.evaluate(()=>['__inlineInjected','__remoteInjected','__eventInjected','__unexpectedFetch'].some(key=>(globalThis as any)[key]))).toBe(false);
 const violations=await page.evaluate(()=>(globalThis as any).__csp.map((e:any)=>e.directive));
 expect(violations).toEqual(expect.arrayContaining(['script-src-elem','script-src-attr','frame-src','connect-src']));
 expect(config.app.security.csp['script-src']).not.toMatch(/unsafe-inline|unsafe-eval|https:/);
});
