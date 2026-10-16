import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";
import {nativeFixture} from "./helpers/nativeFixture";
import {settingsSection} from "./helpers/settings";
const nav=(page:any,name:string)=>page.locator(".sidebar nav").getByRole("button",{name,exact:true});

test("skins belong to the sidebar and follow Microsoft or Ely.by without automatic uploads",async({page})=>{
 await nativeFixture(page);await page.goto("/");
 await page.evaluate(()=>{
  const qa=(globalThis as any).__materialQA;
  const canvas=document.createElement("canvas");canvas.width=canvas.height=64;
  const ctx=canvas.getContext("2d")!;ctx.fillStyle="#e9b770";ctx.fillRect(0,0,64,64);ctx.clearRect(0,32,64,32);
  qa.state.accounts.push({id:"ely",uuid:"fixture-ely",username:"ElyPlayer",provider:"elyby",status:"authenticated"});
  qa.skinLibrary=[];qa.overrides={...qa.overrides,list_skins:()=>qa.skinLibrary,save_account_skin:(args:any)=>{const skin={id:"950e05de-6f28-4aef-89cc-a7bcc28a4722",name:"ElyPlayer",model:"classic",legacy:false,preview:canvas.toDataURL()};qa.skinLibrary.push(skin);return skin;},get_account_skin:(args:any)=>({account_id:args.accountId,provider:args.accountId==="ms"?"microsoft":"elyby",model:args.accountId==="ms"?"slim":"classic",legacy:false,preview:canvas.toDataURL()})};
 });
 await nav(page,"Settings").click();await settingsSection(page,"Account");await expect(page.locator(".settings-modal .skin-library")).toHaveCount(0);await page.keyboard.press("Escape");
 await nav(page,"Skins").click();await expect(page.locator("h1")).toHaveText("Skins");
 await page.getByRole("combobox",{name:"Skin account"}).click();await page.getByRole("option",{name:"LicensedPlayer · Microsoft"}).click();
 await expect(page.locator(".skin-account-copy")).toContainText("Microsoft / Minecraft");await expect(page.locator(".skin-account-copy")).toContainText("Slim");
 await expect(page.locator(".skin-account-preview").getByRole("img",{name:"3D skin preview"})).toBeVisible();
 await page.getByRole("combobox",{name:"Skin account"}).click();await page.getByRole("option",{name:"ElyPlayer · Ely.by"}).click();
 await expect(page.locator(".skin-account-copy")).toContainText("Ely.by");await expect(page.locator(".skin-account-copy")).toContainText("Classic");
 expect(await page.evaluate(()=>(globalThis as any).__materialQA.calls.filter((c:any)=>c.command==="get_account_skin").map((c:any)=>c.args.accountId))).toEqual(["ms","ely"]);
 expect(await page.evaluate(()=>(globalThis as any).__materialQA.calls.some((c:any)=>c.command==="apply_skin"))).toBe(false);
 await expect(page.getByRole("button",{name:"Open Ely.by",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Save to my skins",exact:true}).click();await expect(page.locator(".skin-entry[aria-pressed=true]")).toContainText("ElyPlayer");
 expect(await page.evaluate(()=>(globalThis as any).__materialQA.calls.find((c:any)=>c.command==="save_account_skin").args)).toEqual({accountId:"ely"});
 mkdirSync(".qa/collection-regressions",{recursive:true});await page.screenshot({path:".qa/collection-regressions/ely-skins.png",fullPage:true});
});

test("late Microsoft skin responses cannot replace the selected Ely.by profile",async({page})=>{
 await nativeFixture(page);await page.goto("/");await page.evaluate(()=>{
  const qa=(globalThis as any).__materialQA;qa.state.accounts.push({id:"ely",uuid:"fixture",username:"ElyPlayer",provider:"elyby",status:"authenticated"});
  qa.overrides={...qa.overrides,list_skins:()=>[],get_account_skin:(args:any)=>args.accountId==="ms"?new Promise(resolve=>{qa.finishSkin=()=>resolve(null);}):null};
 });
 await nav(page,"Skins").click();await page.getByRole("combobox",{name:"Skin account"}).click();await page.getByRole("option",{name:"LicensedPlayer · Microsoft"}).click();
 await expect.poll(()=>page.evaluate(()=>!!(globalThis as any).__materialQA.finishSkin)).toBe(true);
 await page.getByRole("combobox",{name:"Skin account"}).click();await page.getByRole("option",{name:"ElyPlayer · Ely.by"}).click();
 await page.evaluate(()=>(globalThis as any).__materialQA.finishSkin());await expect(page.locator(".skin-account-copy h2")).toHaveText("ElyPlayer");await expect(page.locator(".skin-account-copy")).not.toContainText("Microsoft / Minecraft");
});

test("narrow Russian library cards keep play repair and folder on the same row",async({page})=>{
 await nativeFixture(page);await page.addInitScript(()=>{localStorage.setItem("canary-language","ru");localStorage.setItem("canary-visual",JSON.stringify({instanceLayout:"compact",instanceArtwork:"ambient",fontScale:120}));});
 await page.setViewportSize({width:760,height:620});await page.goto("/");await nav(page,"Библиотека").click();
 const card=page.locator(".library-grid .instance-card").first();
 const actions=card.locator(".instance-actions");
 await expect(actions).toBeVisible();
 const metrics=await actions.evaluate(el=>{const buttons=[...el.querySelectorAll("button")];const rects=buttons.map(b=>b.getBoundingClientRect());const card=el.closest(".instance-card")!.getBoundingClientRect();return {centers:rects.map(r=>r.top+r.height/2),inside:rects.every(r=>r.left>=card.left&&r.right<=card.right),overflow:el.scrollWidth>el.clientWidth};});
 expect(Math.max(...metrics.centers)-Math.min(...metrics.centers)).toBeLessThan(2);expect(metrics.inside).toBe(true);expect(metrics.overflow).toBe(false);
 await expect(actions.locator("button")).toHaveCount(3);
 mkdirSync(".qa/collection-regressions",{recursive:true});await page.screenshot({path:".qa/collection-regressions/ru-library-760.png",fullPage:true});
});

test("active background installations never render a progress bar above pages",async({page})=>{
 await nativeFixture(page);await page.goto("/");
 await page.evaluate(async()=>{const {emit}=await import("/node_modules/@tauri-apps/api/event.js");await emit("activity-task",{id:"3b1a5e93-14f2-4ee1-b220-d17340353664",operationId:"install",projectId:"fixture",provider:"modrinth",kind:"install",title:"Background install",status:"running",stage:"libraries",startedAt:1,updatedAt:1,revision:1,cancellable:true,cancelRequested:false,completed:1,total:10,downloaded:1,bytesTotal:10,percent:10,speed:0,currentFile:"fixture.jar"});});
 for(const name of ["Home","Library","Skins","Discover"]){await nav(page,name).click();await expect(page.locator(".pack-downloads,.status-dock,[data-status-dock]")).toHaveCount(0);await expect(page.locator(".content-shell .activity-task")).toHaveCount(0);}
 await nav(page,"Downloads").click();await expect(page.locator(".activity-active")).toContainText("Background install");
});
