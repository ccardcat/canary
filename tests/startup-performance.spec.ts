import {settingsSection} from "./helpers/settings";
import {test,expect} from "@playwright/test";
import {mkdirSync,writeFileSync} from "node:fs";
import {nativeFixture} from "./helpers/nativeFixture";

test("fresh profile opens with a translucent splash and a simple black interface",async({page})=>{
 mkdirSync(".qa/startup",{recursive:true});await nativeFixture(page);
 const queries:string[]=[];page.on("request",request=>{if(request.url().includes("api.modrinth.com"))queries.push(request.url());});
 await page.goto("/");const splash=page.locator(".startup-splash");
 await expect(splash).toBeVisible();await expect(splash).toHaveCSS("backdrop-filter","none");
 await expect(splash).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
 await expect(splash).toHaveCSS("background-image",/radial-gradient/);
 await expect(page.locator(".startup-app")).toHaveAttribute("inert","");
 await expect(page.locator(".startup-app")).toHaveCSS("visibility","hidden");
 await page.screenshot({path:".qa/startup/splash.png"});
 await expect(splash).toHaveCount(0);await expect(page.locator("html")).toHaveAttribute("data-startup","ready");
 await expect(page.locator("html")).toHaveAttribute("data-mode","amoled");
 await expect(page.locator("html")).toHaveAttribute("data-background-source","solid");
 await expect(page.locator(".window-titlebar")).toHaveCSS("background-color","rgb(0, 0, 0)");
 await expect(page.locator(".global-wallpaper,.sidebar-art,.ambient-particles,.home-hero,.community-section")).toHaveCount(0);
 expect(queries).toEqual([]);
 expect(await page.evaluate(()=>(globalThis as any).__materialQA.calls.find((c:any)=>c.command==="backend_snapshot").args.localOnly)).toBe(true);
 await page.screenshot({path:".qa/startup/fresh-profile.png"});
 await page.getByRole("button",{name:"Library",exact:true}).first().click();
 await expect(page.locator(".library-intro .overline,.topbar .breadcrumb")).toHaveCount(0);
 await page.getByRole("button",{name:"Discover",exact:true}).first().click();
 await expect.poll(()=>queries.length).toBeGreaterThan(0);
});

test("transparent splash crossfades the interface smoothly and keeps input locked until completion",async({page})=>{
 mkdirSync(".qa/startup",{recursive:true});
 await page.emulateMedia({reducedMotion:"no-preference"});
 await page.addInitScript(()=>{
  localStorage.setItem("canary-visual",JSON.stringify({backgroundSource:"canary",app:"amethyst-cave",sidebar:"meadow",showCommunity:false}));
  (globalThis as any).__startupQA={holdSnapshot:true};(globalThis as any).__revealFrames=[];
  window.addEventListener("canary-startup-ready",()=>{(globalThis as any).__revealFinishedAt=performance.now();});
  function sample(){
   const splash=document.querySelector(".startup-splash"),app=document.querySelector(".startup-app>.canary-app");
   if(splash&&app&&document.documentElement.dataset.startup==="revealing"){
    // Seek real browser animations synchronously, then resume from their original
    // time. Intermediate opacity must not depend on the runner's RAF frequency.
    if(!(globalThis as any).__revealProbe){
     const incoming=app.getAnimations().find(a=>(a as CSSAnimation).animationName==="startup-ui-in");
     const outgoing=splash.getAnimations().find(a=>(a as CSSTransition).transitionProperty==="opacity");
     if(incoming&&outgoing){
      const animations=[incoming,outgoing],times=animations.map(a=>a.currentTime);
      animations.forEach(a=>{a.pause();a.currentTime=Number(a.effect!.getComputedTiming().duration)/2;});
      (globalThis as any).__revealProbe={app:Number(getComputedStyle(app).opacity),splash:Number(getComputedStyle(splash).opacity)};
      animations.forEach((a,i)=>{a.currentTime=times[i];a.play();});
     }
    }
    (globalThis as any).__revealFrames.push({at:performance.now(),splash:Number(getComputedStyle(splash).opacity),app:Number(getComputedStyle(app).opacity),animation:getComputedStyle(app).animationName,motion:document.documentElement.dataset.motion,locked:document.querySelector(".startup-app")?.hasAttribute("inert")});
   }
   if(document.documentElement.dataset.startup!=="ready")requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
 });
 await nativeFixture(page);await page.goto("/");await expect(page.locator(".startup-splash")).toBeVisible();
 await expect(page.locator(".global-wallpaper .artwork-current")).toHaveCSS("background-image",/amethyst-cave/);
 await page.screenshot({path:".qa/startup/transparent-splash.png"});
 await page.waitForTimeout(3000);
 await page.evaluate(()=>{const qa=(globalThis as any).__startupQA;qa.holdSnapshot=false;qa.resolvers.forEach((release:()=>void)=>release());});
 await expect(page.locator("html")).toHaveAttribute("data-startup","revealing");
 await expect(page.locator(".startup-app")).toHaveAttribute("inert","");
 await expect(page.locator(".startup-splash")).toHaveCount(0);
 const frames=await page.evaluate(()=>(globalThis as any).__revealFrames);
 writeFileSync(".qa/startup/reveal-frames.json",JSON.stringify(frames,null,2));
 await test.info().attach("reveal-frames",{body:JSON.stringify(frames),contentType:"application/json"});
 const probe=await page.evaluate(()=>(globalThis as any).__revealProbe);
 expect(probe.splash).toBeGreaterThan(.1);expect(probe.splash).toBeLessThan(.9);
 expect(probe.app).toBeGreaterThan(.1);expect(probe.app).toBeLessThan(.9);
 expect(frames.every((f:any)=>f.locked)).toBe(true);
 expect(await page.evaluate(()=>(globalThis as any).__revealFinishedAt)-frames[0].at).toBeGreaterThan(750);
 await expect(page.locator(".startup-app>.canary-app")).toHaveCSS("opacity","1");
 expect(await page.locator(".startup-app").getAttribute("inert")).toBeNull();
});

test("reduced motion uses a short startup without moving the splash brand",async({page})=>{
 await page.emulateMedia({reducedMotion:"reduce"});await nativeFixture(page);await page.goto("/");
 await expect(page.locator(".startup-brand")).toHaveCSS("transform","none");
 await expect(page.locator(".startup-splash")).toHaveClass(/reduced/);
 await expect(page.locator(".startup-splash")).toHaveCSS("transition-duration","0s");
 expect(await page.locator("html").evaluate(el=>el.style.getPropertyValue("--startup-exit-duration"))).toBe("220ms");
 await expect(page.locator(".startup-splash")).toHaveCount(0);
});

test("splash waits for delayed local data and defers remote maintenance",async({page})=>{
 await page.addInitScript(()=>{(globalThis as any).__startupQA={holdSnapshot:true};});
 await nativeFixture(page);await page.goto("/");
 await expect(page.locator(".startup-splash")).toBeVisible();
 await page.waitForTimeout(3250);
 await expect(page.locator(".startup-splash")).toBeVisible();
 expect(await page.evaluate(()=>(globalThis as any).__materialQA.calls.some((c:any)=>["restore_accounts","check_modpack_updates"].includes(c.command)))).toBe(false);
 await page.evaluate(()=>{const qa=(globalThis as any).__startupQA;qa.holdSnapshot=false;qa.resolvers.forEach((release:()=>void)=>release());});
 await expect(page.locator(".startup-splash")).toHaveCount(0);
 await expect(page.locator(".continuation-card")).toHaveCount(3);
 await expect.poll(()=>page.evaluate(()=>(globalThis as any).__materialQA.calls.some((c:any)=>c.command==="restore_accounts"))).toBe(true);
});

test("startup preserves a saved light glass theme and background",async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem("canary-mode","light");localStorage.setItem("canary-preset","warm");localStorage.setItem("canary-visual",JSON.stringify({backgroundSource:"canary",app:"amethyst-cave",sidebar:"meadow",materialPreset:"glass",materialLinked:true,materialStyle:"glass",surfaceOpacity:42,fontScale:110,showCommunity:false}));});
 await nativeFixture(page);await page.goto("/");await expect(page.locator(".startup-splash")).toHaveCount(0);
 await expect(page.locator("html")).toHaveAttribute("data-mode","light");await expect(page.locator("html")).toHaveAttribute("data-preset","warm");
 await expect(page.locator("html")).toHaveAttribute("data-material-cards","glass");
 await expect(page.locator(".global-wallpaper .artwork-current")).toBeVisible();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("canary-visual")!));
 expect(saved).toMatchObject({app:"amethyst-cave",sidebar:"meadow",surfaceOpacity:42,fontScale:110});
 const material=await page.evaluate(()=>(globalThis as any).__materialQA.calls.filter((c:any)=>c.command==="apply_window_material"));
 expect(material).toHaveLength(1);expect(material[0].args.theme).toBe("light");
 await page.screenshot({path:".qa/startup/saved-light.png"});
 await page.getByRole("button",{name:"Settings",exact:true}).first().click();
 await settingsSection(page,"Background");
 await page.getByRole("button",{name:/Solid color/}).click();
 await expect(page.locator("html")).toHaveAttribute("data-background-source","solid");
 await page.waitForTimeout(250);
 expect(await page.evaluate(()=>(globalThis as any).__materialQA.calls.filter((c:any)=>c.command==="apply_window_material").length)).toBe(1);
});

test("background animations pause while the document is hidden",async({page})=>{
 await page.addInitScript(()=>localStorage.setItem("canary-visual",JSON.stringify({backgroundSource:"canary",app:"meadow",ambient:"snow",showCommunity:false})));
 await nativeFixture(page);await page.goto("/");await expect(page.locator(".startup-splash")).toHaveCount(0);
 await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"));});
 await expect(page.locator("html")).toHaveAttribute("data-document-visible","false");
 await expect(page.locator(".global-wallpaper")).toHaveCSS("animation-play-state","paused");
 await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,value:false});document.dispatchEvent(new Event("visibilitychange"));});
 await expect(page.locator("html")).toHaveAttribute("data-document-visible","true");
});

test("particles resume after a hidden native window opens without visibilitychange",async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem("canary-visual",JSON.stringify({backgroundSource:"canary",app:"frozen-lake",ambient:"snow",showCommunity:false}));
  Object.defineProperty(document,"hidden",{configurable:true,get:()=>!(globalThis as any).__particleWindowVisible});
 });
 await nativeFixture(page);await page.goto("/");await expect(page.locator(".startup-splash")).toHaveCount(0);
 const particle=page.locator(".ambient-particles.snow i").first();
 await expect(particle).toHaveCSS("animation-play-state","paused");
 for(const event of ["canary-startup-ready","focus","pageshow"]){
  await page.evaluate(event=>{(globalThis as any).__particleWindowVisible=true;window.dispatchEvent(new Event(event));},event);
  await expect(particle).toHaveCSS("animation-play-state","running");
  const time=await particle.evaluate(element=>Number(element.getAnimations()[0].currentTime));
  await expect.poll(()=>particle.evaluate(element=>Number(element.getAnimations()[0].currentTime))).toBeGreaterThan(time+20);
  await page.evaluate(()=>{(globalThis as any).__particleWindowVisible=false;document.dispatchEvent(new Event("visibilitychange"));});
  await expect(particle).toHaveCSS("animation-play-state","paused");
 }
});

test("wallpaper changes remain paired and settle to a single decoded layer",async({page})=>{
 await page.addInitScript(()=>{if(!localStorage.getItem("canary-visual"))localStorage.setItem("canary-visual",JSON.stringify({backgroundSource:"canary",app:"meadow",materialLinked:true,materialStyle:"glass",showCommunity:false}));});
 await nativeFixture(page);await page.goto("/");await expect(page.locator(".startup-splash")).toHaveCount(0);
 await page.getByRole("button",{name:"Settings",exact:true}).first().click();
 await settingsSection(page,"Background");
 for(const number of [1,2]){
  await settingsSection(page,"Background");
  await page.locator(".background-options").getByRole("button",{name:number===1?"Amethyst Cave":"End Eclipse",exact:true}).click();
  await expect(page.locator(".global-wallpaper .artwork-current")).toHaveCSS("background-image",new RegExp(number===1?"amethyst-cave.webp":"end-eclipse.webp"));
  await settingsSection(page,"sidebar");await page.locator(".background-options").getByRole("button",{name:number===1?"Amethyst Cave":"End Eclipse",exact:true}).click();
  await expect(page.locator(".sidebar-art .artwork-current")).toHaveCSS("background-image",new RegExp(number===1?"amethyst-cave.webp":"end-eclipse.webp"));
  await expect(page.locator(".global-wallpaper .artwork-layer")).toHaveCount(1);
 }
 // Decoding a later wallpaper must never re-show a minimized window.
 expect(await page.evaluate(()=>(globalThis as any).__materialQA.calls.filter((c:any)=>c.command==="show_main_window").length)).toBe(1);
 await page.reload();await expect(page.locator(".startup-splash")).toHaveCount(0);
 await expect(page.locator(".global-wallpaper .artwork-current")).toHaveCSS("background-image",/end-eclipse.webp/);
});

test("native material deduplication restores Solid after a delayed Desktop request",async({page})=>{
 await page.addInitScript(()=>{(globalThis as any).__startupQA={nativeCaps:{platform:"windows",build:22621,supported:["solid","acrylic"]}};});
 await nativeFixture(page);await page.goto("/");await expect(page.locator(".startup-splash")).toHaveCount(0);
 await page.evaluate(()=>{const qa=(globalThis as any).__startupQA;(globalThis as any).__materialQA.overrides={apply_window_material:(args:any)=>args.requested==="acrylic"?new Promise(resolve=>{qa.releaseMaterial=()=>resolve({requested:"acrylic",actual:"acrylic",fallback:false});}):{requested:args.requested,actual:args.requested,fallback:false}};});
 await page.getByRole("button",{name:"Settings",exact:true}).first().click();
 await settingsSection(page,"Background");
 await page.getByRole("button",{name:/Desktop.*Transparent Windows window/}).click();
 await expect.poll(()=>page.evaluate(()=>!!(globalThis as any).__startupQA.releaseMaterial)).toBe(true);
 await page.getByRole("button",{name:/Solid color/}).click();
 await page.evaluate(()=>(globalThis as any).__startupQA.releaseMaterial());
 await expect.poll(()=>page.evaluate(()=>(globalThis as any).__materialQA.calls.filter((c:any)=>c.command==="apply_window_material").at(-1).args.requested)).toBe("solid");
 await expect(page.locator("html")).toHaveAttribute("data-window-material","solid");
});
