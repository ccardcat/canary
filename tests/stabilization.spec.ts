import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { nativeFixture } from "./helpers/nativeFixture";

const directory = ".qa/stabilization";
const nav = (page:Page, name:string) => page.locator(".sidebar nav").getByRole("button", {name,exact:true});
async function choose(page:Page, label:string, name:string) {
  await page.getByRole("combobox",{name:label,exact:true}).click();
  await page.getByRole("option",{name,exact:true}).click();
}
async function layout(page:Page, scope:Locator) {
  const geometry = await scope.evaluate(root => {
    const visible = (e:Element) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== "hidden";
    const rows = root.querySelectorAll(".runtime-inline,.header-actions,.content-header,.library-toolbar,.detail-actions,.account-logins,.storage-actions,.font-options,.discover-toolbar");
    const overlaps:string[]=[];
    for(const row of rows) {
      const controls=[...row.children].filter(visible);
      for(let i=0;i<controls.length;i++) for(let j=i+1;j<controls.length;j++) {
        const a=controls[i].getBoundingClientRect(),b=controls[j].getBoundingClientRect();
        if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1) overlaps.push(controls[i].textContent+" / "+controls[j].textContent);
      }
    }
    const clipped=[...root.querySelectorAll("button,.glass-select")].filter(visible).filter(e=>{
      const r=e.getBoundingClientRect(),p=root.getBoundingClientRect();return r.left<p.left-1||r.right>p.right+1;
    }).map(e=>e.textContent);
    return {overlaps,clipped,overflow:root.scrollWidth>root.clientWidth+1};
  });
  expect(geometry).toEqual({overlaps:[],clipped:[],overflow:false});
}
test.beforeEach(async({page})=>{mkdirSync(directory,{recursive:true});await nativeFixture(page);});

for(const russian of [false,true]) test(`Content header and button rows resize with ${russian?"RU Monocraft":"EN Nunito"}`,async({page})=>{
  test.setTimeout(90000);
  await page.addInitScript(({russian})=>{
    localStorage.setItem("canary-language",russian?"ru":"en");
    localStorage.setItem("canary-visual",JSON.stringify({font:russian?"Monocraft":"Nunito",minecraft:"full",materialLinked:true,materialStyle:"liquid"}));
  },{russian});
  await page.goto("/");await nav(page,russian?"Библиотека":"Library").click();
  await page.locator(".instance-links").first().getByRole("button",{name:russian?"Контент":"Content",exact:true}).click();
  await expect(page.locator(".content-manager")).toBeVisible();
  const measured=[];
  for(const [width,height] of [[1920,1080],[1280,800],[1000,640],[780,540],[600,420],[480,340]]) {
    await page.setViewportSize({width,height});await page.waitForTimeout(250);
    await layout(page,page.locator(".instance-surface"));
    const button=await page.locator(".instance-surface .primary-button").boundingBox();
    const provider=await page.locator(".content-header .glass-select-trigger").boundingBox();
    expect(button!.y+button!.height).toBeLessThan(provider!.y);
    measured.push({width,height,button,provider});
    await page.screenshot({path:`${directory}/content-${russian?"ru":"en"}-${width}.png`,fullPage:true});
  }
  writeFileSync(`${directory}/content-${russian?"ru":"en"}.json`,JSON.stringify(measured,null,2));
  await choose(page,russian?"Источник проектов":"Provider",russian?"CurseForge · недоступен":"CurseForge · unavailable");
  await expect(page.locator(".content-manager .empty-state")).toContainText(russian?"CurseForge недоступен":"CurseForge is unavailable");
  await expect(page.locator(".content-project-grid,.content-loading,.content-pagination")).toHaveCount(0);
  const calls=await page.evaluate(()=>(globalThis as any).__materialQA.calls);
  expect(calls.some((c:any)=>c.args?.provider==="curseforge")).toBe(false);
  await choose(page,russian?"Источник проектов":"Provider","Modrinth");
  await expect(page.locator(".content-project-grid")).toContainText("Sodium");
});

test("CurseForge Discover is immediately unavailable and never leaks previous Modrinth results",async({page})=>{
  await page.route("https://api.modrinth.com/v2/search*",route=>route.fulfill({json:{hits:[{project_id:"modrinth-only",title:"Modrinth only",description:"Available provider",versions:["1.21.1"],categories:[],downloads:100}],total_hits:1}}));
  await page.goto("/");await nav(page,"Discover").click();await expect(page.locator(".project-grid")).toContainText("Modrinth only");
  await choose(page,"Provider","CurseForge · unavailable");
  await expect(page.locator(".empty-state")).toContainText("CurseForge is unavailable");
  await expect(page.locator(".discover-page .project-grid,.discover-page .pagination,.discover-toolbar")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  const calls=await page.evaluate(()=>(globalThis as any).__materialQA.calls);
  expect(calls.some((c:any)=>["catalog_search","catalog_versions","install_curseforge_pack"].includes(c.command))).toBe(false);
  await choose(page,"Provider","Modrinth");await expect(page.locator(".project-grid")).toContainText("Modrinth only");
});

test("Storage, Accounts and About keep their geometry at narrow widths and low heights",async({page})=>{
  test.setTimeout(90000);await page.goto("/");await nav(page,"Settings").click();
  for(const [width,height] of [[1280,800],[780,540],[600,420],[480,340]]) {
    await page.setViewportSize({width,height});
    for(const tab of ["Storage","Account","About"]) {
      const match=tab;
      await page.locator(".settings-nav").getByRole("button",{name:match,exact:true}).click();await page.waitForTimeout(600);
      await layout(page,page.locator(".settings-content"));
      if(tab==="Storage") {
        const gap=await page.locator(".storage-settings").evaluate(e=>{const a=e.querySelector(".storage-maintenance")!.getBoundingClientRect(),b=e.querySelector(".storage-actions")!.getBoundingClientRect();return b.top-a.bottom;});
        expect(gap).toBeGreaterThanOrEqual(8);
      }
      if(tab==="Account") await expect(page.locator(".account-logins button").last()).toBeDisabled();
      if(tab==="About") {await expect(page.locator(".about-card")).toContainText("CurseForge unavailable");await expect(page.locator(".about-card .planned-badge")).toHaveCount(0);}
      await page.screenshot({path:`${directory}/settings-${tab.toLowerCase()}-${width}.png`});
    }
  }
});

test("Hero arrows change decoded artwork without changing hero, copy, controls or scale",async({page})=>{
  test.setTimeout(90000);await page.addInitScript(()=>localStorage.setItem("canary-visual",JSON.stringify({ambient:"sakura",heroRotation:false})));
  await page.goto("/");
  for(const [width,height] of [[1920,1080],[1280,800],[780,540],[480,340]]) {
    await page.setViewportSize({width,height});await page.waitForTimeout(300);
    const geometry=()=>page.locator(".home-hero").evaluate(e=>{const r=e.getBoundingClientRect();const relative=(element:Element)=>{const b=element.getBoundingClientRect();return {x:b.left-r.left,y:b.top-r.top,width:b.width,height:b.height};};return {hero:{width:r.width,height:r.height},copy:relative(e.querySelector(".hero-content")!),controls:relative(e.querySelector(".hero-carousel-controls")!),title:e.querySelector("h2")!.textContent,transform:getComputedStyle(e.querySelector(".hero-art")!).transform};});
    const before=await geometry();
    for(let n=0;n<12;n++) {await page.getByRole("button",{name:"Next background",exact:true}).click();await page.waitForTimeout(100);expect(await geometry()).toEqual(before);}
    expect(before.transform).toBe("none");await page.screenshot({path:`${directory}/hero-${width}.png`});
  }
});

test("shared controls keep size, baseline and soft focus through interaction",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});await page.goto("/");await nav(page,"Library").click();await page.waitForTimeout(600);
  const selectors=[".library-intro .primary-button",".library-toolbar .quiet-button",".instance-actions .compact-action",".instance-actions .material-icon"];
  for(const selector of selectors) {
    const target=page.locator(selector).first();const before=await target.boundingBox();
    await target.hover();await page.waitForTimeout(180);expect(await target.boundingBox()).toEqual(before);
    await page.mouse.down();expect(await target.boundingBox()).toEqual(before);await page.mouse.move(0,0);await page.mouse.up();
    await page.keyboard.press("Tab");await target.focus();
    const metrics=await target.evaluate((e:HTMLButtonElement)=>{e.focus();const r=e.getBoundingClientRect(),svg=e.querySelector("svg")!.getBoundingClientRect();return {height:r.height,icon:svg.height,center:Math.abs((r.top+r.bottom)/2-(svg.top+svg.bottom)/2),outline:getComputedStyle(e).outlineStyle};});
    expect(metrics.height).toBe(40);expect(metrics.icon).toBe(16);expect(metrics.center).toBeLessThan(1);expect(metrics.outline).toBe("solid");
  }
});

test("every Settings section and main page is contained across materials and modes",async({page})=>{
  test.setTimeout(180000);await page.goto("/");
  const results=[];
  for(const material of ["Solid","Soft","Vibrancy","Glass","Clear Glass","Liquid Glass","Transparent"]) {
    await nav(page,"Settings").click();await choose(page,"Material preset","Vibrancy");await page.getByText("Advanced materials",{exact:true}).click();await choose(page,"Shared material",material);
    for(const mode of ["Light","Dark","AMOLED"]) {
      await page.locator(".mode-grid").getByRole("button",{name:mode,exact:true}).click();await page.waitForTimeout(300);
      await layout(page,page.locator(".settings-content"));
      await page.screenshot({path:`${directory}/material-${material.replaceAll(" ","-")}-${mode}.png`});
      results.push({material,mode});
    }
    await page.locator(".settings-top").getByRole("button",{name:"Close",exact:true}).click();
    for(const screen of ["Home","Discover","Library","Downloads"]) {await nav(page,screen).click();await page.waitForTimeout(400);await layout(page,page.locator(".page-transition"));await page.screenshot({path:`${directory}/page-${material.replaceAll(" ","-")}-${screen}.png`});}
  }
  await nav(page,"Settings").click();
  const tabs=await page.locator(".settings-nav button").all();
  for(const tab of tabs) {await tab.click();await page.waitForTimeout(400);await layout(page,page.locator(".settings-content"));await page.screenshot({path:`${directory}/section-${(await tab.textContent())!.trim()}.png`});}
  writeFileSync(`${directory}/materials.json`,JSON.stringify(results,null,2));
});

test("tooltips stay above native modals, popup bounds and titlebar hit targets remain usable",async({page})=>{
  await page.goto("/");await nav(page,"Library").click();
  await page.getByRole("button",{name:"New instance",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"New instance",exact:true});await expect(dialog).toBeVisible();
  await dialog.getByRole("button",{name:"Close",exact:true}).hover();
  const tooltip=page.getByRole("tooltip");await expect(tooltip).toBeVisible();
  expect(await tooltip.evaluate(e=>e.matches(":popover-open"))).toBe(true);
  const box=(await tooltip.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(12);expect(box.y).toBeGreaterThanOrEqual(12);
  await page.mouse.move(0,0);await dialog.getByRole("combobox").first().click();
  const popup=page.getByRole("listbox");await expect(popup).toBeVisible();
  const bounds=(await popup.boundingBox())!;expect(bounds.x).toBeGreaterThanOrEqual(12);expect(bounds.x+bounds.width).toBeLessThanOrEqual(1268);expect(bounds.y+bounds.height).toBeLessThanOrEqual(788);
  await page.keyboard.press("Escape");await expect(popup).toBeHidden();await page.waitForTimeout(250);await expect(dialog).not.toHaveClass(/closing/);await expect(dialog).toBeVisible();await dialog.getByRole("button",{name:"Close",exact:true}).click();
  await expect(dialog).toBeHidden();
  await nav(page,"Settings").click();await page.locator(".settings-nav").getByRole("button",{name:"Window",exact:true}).click();
  await page.waitForTimeout(400);await page.screenshot({path:`${directory}/window-controls-settings.png`});
  await page.evaluate(()=>document.querySelector(".window-titlebar")!.setAttribute("data-controls","traffic-lights"));
  for(const target of await page.locator(".window-controls button").all()){const r=(await target.boundingBox())!;expect(r.width).toBeGreaterThanOrEqual(28);expect(r.height).toBeGreaterThanOrEqual(28);}
});

test("imported backgrounds with different natural sizes leave Hero geometry unchanged",async({page})=>{
  await page.addInitScript(()=>{
    (globalThis as any).__customWallpapers=[{id:"custom-wide",name:"Wide image",target:"app",image:"C:/qa-wide.svg",thumbnail:"C:/qa-wide.svg"},{id:"custom-tall",name:"Tall image",target:"app",image:"C:/qa-tall.svg",thumbnail:"C:/qa-tall.svg"},{id:"custom-hd",name:"HD image",target:"app",image:"C:/qa-hd.svg",thumbnail:"C:/qa-hd.svg"}];
    localStorage.setItem("canary-visual",JSON.stringify({heroRotation:false}));
  });
  await page.route(/qa-(wide|tall|hd)\.svg/,route=>{const dimensions=route.request().url().includes("wide")?[2400,600]:route.request().url().includes("tall")?[480,900]:[1920,1080];return route.fulfill({contentType:"image/svg+xml",body:`<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions[0]}" height="${dimensions[1]}"><rect width="100%" height="100%" fill="#647866"/></svg>`});});
  await page.goto("/");await expect(page.getByRole("button",{name:"Show background: Tall image",exact:true})).toBeVisible();
  const geometry=()=>page.locator(".home-hero").evaluate(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height,title:e.querySelector("h2")!.textContent};});
  const before=await geometry();
  for(const name of ["Wide image","Tall image","HD image"]) {
    await page.getByRole("button",{name:`Show background: ${name}`,exact:true}).click();
    await expect(page.locator(".hero-art .artwork-current")).toHaveCSS("background-size","cover");
    const expected=name==="Wide image"?"qa-wide":name==="Tall image"?"qa-tall":"qa-hd";
    await expect.poll(()=>page.locator(".hero-art .artwork-current").evaluate((e,expected)=>getComputedStyle(e).backgroundImage.includes(expected),expected)).toBe(true);
    expect(await geometry()).toEqual(before);
  }
  await page.screenshot({path:`${directory}/hero-imported-aspects.png`});
});

test("account and filter popovers stay inside short viewports and preserve nested selects",async({page})=>{
  await page.goto("/");
  for(const [width,height] of [[1280,800],[760,540],[480,340]]) {
    await page.setViewportSize({width,height});
    await page.locator(".account-button").click();
    const account=page.locator(".account-popover");await expect(account).toBeVisible();
    const a=(await account.boundingBox())!;expect(a.x).toBeGreaterThanOrEqual(12);expect(a.x+a.width).toBeLessThanOrEqual(width-12);expect(a.y+a.height).toBeLessThanOrEqual(height-12);
    await account.getByRole("button",{name:"Sign in to Ely.by",exact:true}).click();
    const dialog=page.getByRole("dialog",{name:"Sign in to Ely.by",exact:true});await expect(dialog).toBeVisible();await dialog.getByRole("button",{name:"Close",exact:true}).click();await expect(dialog).toBeHidden();
    await page.keyboard.press("Escape");await expect(account).toHaveCount(0);
    await nav(page,"Discover").click();await page.getByRole("button",{name:/^Filters(?: \d+)?$/}).click();
    const filter=page.locator(".filter-popover");await expect(filter).toBeVisible();
    const b=(await filter.boundingBox())!;expect(b.x).toBeGreaterThanOrEqual(12);expect(b.x+b.width).toBeLessThanOrEqual(width-12);expect(b.y+b.height).toBeLessThanOrEqual(height-12);
    await filter.getByRole("combobox",{name:"Loader",exact:true}).click();await page.getByRole("option",{name:"Fabric",exact:true}).click();
    await expect(filter.getByRole("combobox",{name:"Loader",exact:true})).toContainText("Fabric");
    await page.keyboard.press("Escape");await expect(filter).toHaveCount(0);
  }
});

test("Screenshots and Activity empty screens retain readable controls and one activity title",async({page})=>{
  await page.goto("/");
  for(const [width,height] of [[1280,800],[760,540],[480,340]]) {
    await page.setViewportSize({width,height});
    await nav(page,"Screenshots").click();await expect(page.locator(".page-transition .empty-state")).toBeVisible();await layout(page,page.locator(".page-transition"));
    await page.waitForTimeout(300);await page.screenshot({path:`${directory}/screenshots-${width}.png`});
    await nav(page,"Activity").click();await expect(page.locator(".page-transition").getByRole("heading",{name:"Activity",exact:true})).toHaveCount(1);await layout(page,page.locator(".page-transition"));
    await expect(page.getByRole("textbox",{name:"Game logs",exact:true})).toHaveCSS("min-height","40px");
    await page.waitForTimeout(300);await page.screenshot({path:`${directory}/activity-${width}.png`});
  }
});
