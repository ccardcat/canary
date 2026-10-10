import {settingsSection} from "./helpers/settings";
import {test,expect,type Page} from "@playwright/test";
import {nativeFixture} from "./helpers/nativeFixture";
import {mkdirSync} from "node:fs";
const nav=(page:Page,name:string)=>page.locator(".sidebar nav").getByRole("button",{name,exact:true});
async function start(page:Page,saved:Record<string,unknown>={}){
 await nativeFixture(page);await page.emulateMedia({reducedMotion:"reduce"});
 await page.addInitScript(saved=>{if(!localStorage.getItem("canary-visual"))localStorage.setItem("canary-visual",JSON.stringify({app:"green",backgroundVersion:1,...saved}));},saved);
 await page.goto("/");await expect(page.locator(".startup-splash")).toHaveCount(0);await page.evaluate(()=>document.fonts.ready);
 await nav(page,"Settings").click();await settingsSection(page,"materials");
}
async function background(page:Page){await settingsSection(page,"Background");await expect(page.locator('[data-visual-group="background"] .background-settings')).toBeVisible();}
async function choose(page:Page,name:string,option:string){
 if(await page.locator(".settings-modal").isVisible()){if(["Material preset","Shared material","Button style","Card material"].includes(name))await settingsSection(page,"materials");if(name==="Sidebar layout")await settingsSection(page,"sidebar");}
await page.getByRole("combobox",{name,exact:true}).click();await page.getByRole("option",{name:option,exact:true}).click();}
async function commit(page:Page,name:string,n:string){const slider=page.getByRole("slider",{name,exact:true});await slider.fill(n);await slider.press("Tab");}
test("Background drag changes the real wallpaper before release without disk or IPC per pixel",async({page})=>{
 await start(page);await background(page);
 const slider=page.getByRole("slider",{name:"Wallpaper blur",exact:true});await slider.scrollIntoViewIfNeeded();
 await page.evaluate(()=>{let writes=0;const original=Storage.prototype.setItem;(globalThis as any).__writes=()=>writes;Storage.prototype.setItem=function(key:string,value:string){if(key==="canary-visual")writes++;return original.call(this,key,value);};(globalThis as any).__calls=(globalThis as any).__materialQA.calls.length;});
 const box=(await slider.boundingBox())!;await page.mouse.move(box.x+box.width*.7,box.y+box.height/2);await page.mouse.down();
 for(let i=0;i<20;i++)await page.mouse.move(box.x+box.width*(.45+i*.015),box.y+box.height/2);
 await expect.poll(()=>page.locator(".global-wallpaper").evaluate(el=>getComputedStyle(el).filter)).not.toContain("blur(8px)");
 expect(await page.evaluate(()=>(globalThis as any).__writes())).toBe(0);
 expect(await page.evaluate(()=>(globalThis as any).__materialQA.calls.length-(globalThis as any).__calls)).toBe(0);
 const draft=Number(await slider.inputValue());await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>(globalThis as any).__writes())).toBe(1);
 await page.reload();await nav(page,"Settings").click();await background(page);await expect(page.getByRole("slider",{name:"Wallpaper blur",exact:true})).toHaveValue(String(draft));
});
test("Shading and visibility span their full range; main image pixels and sidebar tint really change",async({page})=>{
 await start(page);await background(page);
 await commit(page,"Background shading","20");const first=await page.locator(".wallpaper-veil").evaluate(el=>getComputedStyle(el).backgroundImage);
 await commit(page,"Background shading","60");const second=await page.locator(".wallpaper-veil").evaluate(el=>getComputedStyle(el).backgroundImage);expect(first).not.toBe(second);
 await commit(page,"Wallpaper visibility","0");await expect(page.locator(".global-wallpaper")).toHaveCSS("opacity","0");
 await page.keyboard.press("Escape");await nav(page,"Activity").click();await page.mouse.move(1270,790);
 const hidden=await page.screenshot({clip:{x:300,y:620,width:250,height:100}});
 await nav(page,"Settings").click();await background(page);await commit(page,"Wallpaper visibility","100");await commit(page,"Background shading","20");await commit(page,"Wallpaper blur","0");
 await page.keyboard.press("Escape");await page.mouse.move(1270,790);const visible=await page.screenshot({clip:{x:300,y:620,width:250,height:100}});expect(hidden.equals(visible)).toBe(false);
 await nav(page,"Settings").click();await background(page);await settingsSection(page,"sidebar");
 await commit(page,"Sidebar tint","15");const faint=await page.locator(".sidebar").evaluate(el=>getComputedStyle(el,"::after").backgroundImage);
 await commit(page,"Sidebar tint","75");expect(await page.locator(".sidebar").evaluate(el=>getComputedStyle(el,"::after").backgroundImage)).not.toBe(faint);
 await expect(page.locator(".sidebar nav")).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
});
test("Surface opacity and blur are live; Solid explains its disabled sliders",async({page})=>{
 await start(page);await choose(page,"Material preset","Glass");
 const slider=page.getByRole("slider",{name:"Surface opacity",exact:true});await slider.scrollIntoViewIfNeeded();
 const before=await page.locator(".material-preview-card").evaluate(el=>getComputedStyle(el).backgroundColor);const box=(await slider.boundingBox())!;
 await page.mouse.move(box.x+box.width*.3,box.y+box.height/2);await page.mouse.down();await expect.poll(()=>page.locator(".material-preview-card").evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(before);await page.mouse.up();
 const blur=page.getByRole("slider",{name:"Surface backdrop blur",exact:true});await blur.fill("30");
 await expect.poll(()=>page.locator(".material-preview-card").evaluate(el=>getComputedStyle(el).backdropFilter)).toContain("blur(30px)");
 await blur.press("Tab");await choose(page,"Material preset","Solid");await expect(slider).toBeDisabled();await expect(blur).toBeDisabled();
 await choose(page,"Material preset","Clear Glass");await expect(slider).toBeEnabled();await expect(blur).toBeEnabled();
 await choose(page,"Material preset","Transparent");await expect(slider).toBeEnabled();await expect(blur).toBeDisabled();
 await page.getByRole("checkbox",{name:"Reduce transparency",exact:true}).check();await background(page);await settingsSection(page,"sidebar");await expect(page.getByRole("slider",{name:"Sidebar tint",exact:true})).toBeDisabled();await expect(page.locator(".background-settings [role=status]")).toContainText("make the sidebar opaque");
});
test("Wallpaper selection, custom import and background target survive reload; native fallback is honest",async({page})=>{
 await start(page,{linked:true,app:"green",sidebar:"gray",backgroundSource:"canary"});await background(page);await page.locator(".background-options").getByRole("button",{name:"Sakura 1",exact:true}).click();
 await expect(page.locator(".global-wallpaper .artwork-current")).toHaveCSS("background-image",/sakura1/);
 await page.getByRole("button",{name:"Choose custom image"}).click();
 await settingsSection(page,"sidebar");await expect(page.locator(".background-options").getByRole("button",{name:"Gray",exact:true})).toHaveAttribute("aria-pressed","true");
 await page.getByRole("button",{name:"Choose custom image"}).click();
 expect(await page.evaluate(()=>(globalThis as any).__materialQA.calls.filter((c:any)=>c.command==="import_wallpaper").map((c:any)=>c.args.target))).toEqual(["app","sidebar"]);
 await page.reload();await nav(page,"Settings").click();await background(page);
 await expect(page.locator(".background-options").getByRole("button",{name:"Sakura 1",exact:true})).toHaveAttribute("aria-pressed","true");
 await expect(page.getByRole("checkbox",{name:"Use one picture for launcher and sidebar"})).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("canary-visual")!).linked)).toBeUndefined();
 await expect(page.getByRole("button",{name:"Desktop",exact:false})).toBeDisabled();
 await page.getByRole("button",{name:"Solid color",exact:false}).click();await expect(page.locator(".visual-backdrop")).toBeHidden();
 await page.getByRole("button",{name:"Picture",exact:false}).click();await expect(page.locator(".visual-backdrop")).toBeVisible();
});
test("Legacy defaults become visible once, custom settings remain and RU fits narrow windows",async({page})=>{
 await start(page,{backgroundVersion:0,app:"normal",intensity:45,globalTreatment:{brightness:100,saturation:75,overlay:65,vignette:55,zoom:100,position:"center"}});
 await background(page);await expect(page.getByRole("slider",{name:"Wallpaper visibility",exact:true})).toHaveValue("85");await expect(page.getByRole("slider",{name:"Background shading",exact:true})).toHaveValue("28");
 await commit(page,"Wallpaper visibility","37");await commit(page,"Background shading","49");
 await page.reload();await nav(page,"Settings").click();await background(page);await expect(page.getByRole("slider",{name:"Wallpaper visibility",exact:true})).toHaveValue("37");
 await settingsSection(page,"Language");await page.getByRole("button",{name:/Русский интерфейс/}).click();
 await settingsSection(page,"Фон");await page.setViewportSize({width:760,height:540});
 await expect(page.getByRole("slider",{name:"Размытие изображения",exact:true})).toBeVisible();
 expect(await page.locator(".settings-modal").evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.getByRole("slider",{name:"Размытие изображения",exact:true}).scrollIntoViewIfNeeded();await page.waitForTimeout(250);await page.screenshot({path:".qa/background-live/ru-background.png"});
});
test("Background and surface settings stay readable in three themes and show the real launcher scene",async({page})=>{
 await start(page);await choose(page,"Material preset","Glass");await commit(page,"Surface opacity","65");
 await page.locator(".material-preview").scrollIntoViewIfNeeded();await page.screenshot({path:".qa/background-live/surfaces.png"});
 for(const theme of ["Dark","Light","AMOLED"]){
  await settingsSection(page,"appearance");await settingsSection(page,"appearance");await page.locator(".mode-grid").getByRole("button",{name:theme,exact:true}).click();await background(page);
  await page.getByRole("slider",{name:"Wallpaper visibility",exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:".qa/background-live/"+theme.toLowerCase()+"-settings.png"});
  expect(await page.locator(".settings-modal").evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");await nav(page,"Library").click();await expect(page.locator(".instance-card").first()).toBeVisible();await page.mouse.move(1270,790);
  await page.screenshot({path:".qa/background-live/"+theme.toLowerCase()+"-launcher.png"});
  await nav(page,"Settings").click();await settingsSection(page,"Appearance");
 }
});
test.beforeAll(()=>mkdirSync(".qa/background-live",{recursive:true}));
