import {test,expect,type Page} from "@playwright/test";
import {mkdirSync} from "node:fs";
import {nativeFixture} from "./helpers/nativeFixture";

async function settings(page:Page,tab:string){
 await page.getByRole("button",{name:"Settings",exact:true}).first().click();
 await page.locator(".settings-nav").getByRole("button",{name:tab,exact:true}).click();
}
test("Home banner is hidden by default and its visibility survives restart",async({page})=>{
 await nativeFixture(page);await page.goto("/");
 await expect(page.locator(".home-hero")).toHaveCount(0);
 await expect(page.getByRole("heading",{name:"Continue playing",exact:true})).toBeVisible();
 await settings(page,"Background");
 const toggle=page.getByRole("switch",{name:"Show Home banner",exact:true});
 await expect(toggle).toHaveAttribute("aria-checked","false");await toggle.click();
 await page.keyboard.press("Escape");await expect(page.locator(".home-hero")).toBeVisible();
 await page.reload();await expect(page.locator(".home-hero")).toBeVisible();
 await settings(page,"Background");await toggle.click();await page.keyboard.press("Escape");
 await page.reload();await expect(page.locator(".home-hero")).toHaveCount(0);
});

test("Continue shows the latest server with its own instance and Minecraft version",async({page})=>{
 await nativeFixture(page);await page.goto("/");
 await expect(page.locator(".last-server-card")).toHaveCount(0);
 await page.evaluate(async()=>{
  const state=(globalThis as any).__materialQA.state;
  state.instances[0].last_server={address:"old.example.org",joined_at:10};
  Object.assign(state.instances[4],{status:"ready",name:"Server pack",version_name:"2.4.7",minecraft:"1.8.9",loader:"forge",last_server:{address:"play.example.org:25566",joined_at:20}});
  const {emit}=await import("/node_modules/@tauri-apps/api/event.js");await emit("instances-changed");
 });
 const card=page.locator(".last-server-card");
 await expect(card).toContainText("Last server · play.example.org:25566");
 await expect(card).toContainText("Server pack 2.4.7 · Minecraft 1.8.9 · Forge");
 await card.getByRole("button",{name:"Play",exact:true}).click();
 await expect(card.getByRole("button",{name:"Stop",exact:true})).toBeVisible();
 const call=await page.evaluate(()=>(globalThis as any).__materialQA.calls.findLast((c:any)=>c.command==="launch_instance"));
 expect(call.args.id).toBe("instance-4");
 await card.locator(".continue-open").click();
 await expect(page.locator(".library-overview")).toBeVisible();
 await expect(page.locator(".instance-surface")).toHaveCount(0);
});

test("Surface opacity remains adjustable when cards are Solid but buttons use glass",async({page})=>{
 await page.addInitScript(()=>localStorage.setItem("canary-visual",JSON.stringify({materialPreset:"custom",materialLinked:false,surfaceOpacity:40,materialCategories:{cards:"solid",buttons:"glass",sidebar:"solid",popovers:"solid",dialogs:"solid",inputs:"solid",titlebar:"solid",floating:"solid"}})));
 await nativeFixture(page);await page.goto("/");
 const opacity=()=>page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--mat-buttons-opacity")));
 const before=await opacity();await settings(page,"Appearance");
 const slider=page.getByRole("slider",{name:"Surface opacity",exact:true});
 await expect(slider).toBeEnabled();await expect(page.getByRole("slider",{name:"Surface backdrop blur",exact:true})).toBeDisabled();
 await slider.fill("80");await slider.press("ArrowRight");await slider.press("ArrowLeft");
 await page.keyboard.press("Escape");await expect.poll(opacity).toBeGreaterThan(before);
 expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue("--mat-cards-opacity").trim())).toBe("100.0%");
});

for(const theme of ["light","dark","amoled","system"]){test(`Home surfaces keep adjustable transparency and contrast in ${theme}`,async({page})=>{
 test.setTimeout(90000);mkdirSync(".qa/home-final",{recursive:true});
 await page.addInitScript(theme=>{localStorage.setItem("canary-mode",theme);if(!localStorage.getItem("canary-visual"))localStorage.setItem("canary-visual",JSON.stringify({showCommunity:false,backgroundSource:"desktop",material:"acrylic",materialPreset:"glass",materialLinked:true,materialStyle:"glass",surfaceOpacity:40,quality:"balanced"}));},theme);
 await page.emulateMedia({colorScheme:"light"});await nativeFixture(page);await page.goto("/");
 const card=page.locator(".continuation-card").first();await expect(card).toBeVisible();
 const paint=()=>card.evaluate(e=>{
  const style=getComputedStyle(e),root=getComputedStyle(document.documentElement);
  const canvas=document.createElement("canvas");canvas.width=canvas.height=1;const ctx=canvas.getContext("2d")!;
  ctx.fillStyle=style.backgroundColor;ctx.fillRect(0,0,1,1);
  return {alpha:ctx.getImageData(0,0,1,1).data[3]/255,opacity:parseFloat(root.getPropertyValue("--mat-cards-opacity")),buttons:parseFloat(root.getPropertyValue("--mat-buttons-opacity")),border:style.borderTopWidth,text:style.color,background:style.backgroundColor};
 });
 const before=await paint();expect(before.alpha).toBeGreaterThan(.1);expect(before.alpha).toBeLessThan(.8);expect(before.border).toBe("1px");expect(before.text).not.toBe(before.background);
 await card.hover();expect((await paint()).alpha).toBeLessThan(.8);
 await page.screenshot({path:`.qa/home-final/${theme}-desktop.png`});
 await settings(page,"Appearance");const slider=page.getByRole("slider",{name:"Surface opacity",exact:true});
 await slider.fill("80");await slider.dispatchEvent("change");await slider.press("ArrowRight");await slider.press("ArrowLeft");
 await page.keyboard.press("Escape");await expect.poll(async()=>(await paint()).opacity).toBeGreaterThan(before.opacity);
 const after=await paint();expect(after.buttons).toBeGreaterThan(before.buttons);expect(after.alpha).toBeLessThan(1);
 await page.reload();expect((await paint()).opacity).toBeCloseTo(after.opacity,1);
 if(theme==="system"){await page.emulateMedia({colorScheme:"dark"});await expect(page.locator("html")).toHaveAttribute("data-mode","dark");expect((await paint()).alpha).toBeLessThan(1);}
});}
