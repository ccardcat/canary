import {test,expect,type Page} from "@playwright/test";
import {nativeFixture} from "./helpers/nativeFixture";
import {mkdirSync} from "node:fs";
const nav=(page:Page,name:string)=>page.locator(".sidebar nav").getByRole("button",{name,exact:true});
async function setup(page:Page){await nativeFixture(page);await page.goto("/");await expect(page.locator(".startup-splash")).toHaveCount(0);await expect(page.locator(".home-greeting")).toBeVisible();}
async function emit(page:Page,event:string,payload:unknown){await page.evaluate(async({event,payload})=>{const {emit}=await import("/node_modules/@tauri-apps/api/event.js" as string);await emit(event,payload);},{event,payload});}
test("Activity removes Ready, groups dates, aggregates errors and clears only history",async({page})=>{
 await setup(page);const now=Math.floor(Date.now()/1000);
 await page.evaluate(now=>{const state=(globalThis as any).__materialQA.state;state.activity=[{id:"noise",kind:"ready",timestamp:now,message:"Ready"},{id:"launch",kind:"game_launched",instance:"instance-0",timestamp:now,message:"Fabulously Optimized"},...Array.from({length:7},(_,i)=>({id:"failure-"+i,kind:"operation_failed",timestamp:now-i,message:"Connection interrupted"})),{id:"previous",kind:"account_added",timestamp:now-86400,message:"Player"}];},now);
 await emit(page,"instances-changed",{});await nav(page,"Activity").click();
 await expect(page.locator(".recent-activity")).not.toContainText("Ready");
 await expect(page.locator(".recent-event")).toHaveCount(3);await expect(page.locator(".recent-activity")).toContainText("×7");
 await expect(page.locator(".activity-date-group h4").first()).toHaveText("Today");
 await page.getByRole("button",{name:"Clear history",exact:true}).click();await expect(page.getByRole("dialog",{name:"Clear activity history?"})).toBeVisible();
 await page.getByRole("dialog").getByRole("button",{name:"Clear",exact:true}).click();await expect(page.locator(".recent-event")).toHaveCount(0);
 const calls=await page.evaluate(()=>(globalThis as any).__materialQA.calls);expect(calls.some((c:any)=>c.command==="clear_activity")).toBe(true);expect(calls.some((c:any)=>c.command==="cleanup_logs")).toBe(false);
});
for(const russian of [false,true])test("Human error, collapsed details, copy and Escape "+(russian?"RU":"EN"),async({page})=>{
 await page.addInitScript(russian=>{localStorage.setItem("canary-language",russian?"ru":"en");Object.defineProperty(navigator,"clipboard",{value:{writeText:async(text:string)=>{(globalThis as any).__copied=text;}}});},russian);
 await setup(page);const error={code:"account_in_use_by_game",message:"Internal account lock 1234",stage:"account_removal",instance_id:"opaque-instance-id",retryable:false};
 await emit(page,"backend-error",error);const dialog=page.getByRole("dialog",{name:russian?"Не удалось удалить аккаунт":"Could not remove account"});
 await expect(dialog).toBeVisible();await expect(dialog.locator(".error-description")).toContainText(russian?"используется Minecraft":"being used by Minecraft");
 await expect(dialog.locator(".error-technical-message")).not.toBeVisible();await expect(dialog.getByRole("button",{name:russian?"Повторить":"Retry",exact:true})).toHaveCount(0);
 await dialog.locator("summary").click();await expect(dialog.locator(".error-technical-message")).toContainText("Internal account lock");
 await dialog.getByRole("button",{name:russian?"Копировать сведения":"Copy details"}).click();expect(await page.evaluate(()=>JSON.parse((globalThis as any).__copied).code)).toBe(error.code);
 await page.keyboard.press("Escape");await expect(dialog).toHaveCount(0);
});
test("10,000 log lines stay windowed, searchable, ANSI-free and respect scrolling up",async({page})=>{
 await setup(page);await nav(page,"Activity").click();await page.getByRole("button",{name:"Game Logs",exact:true}).click();
 await emit(page,"process-output-batch",{id:"instance-0",session:"canary-100.log",lines:Array.from({length:10000},(_,i)=>"[14:32:01] [Render thread/"+(i===9999?"ERROR":"INFO")+"]: "+(i===9999?"\u001b[31mcrash-marker\u001b[0m":"Message "+i))});
 await expect(page.locator(".game-logs")).toContainText("10,000 / 10,000");
 expect(await page.locator(".game-log-line").count()).toBeLessThan(80);await expect(page.locator(".game-log-window")).toContainText("crash-marker");
 await page.getByRole("textbox",{name:"Search logs"}).fill("crash-marker");await expect(page.locator(".game-log-line")).toHaveCount(1);await expect(page.locator(".game-log-line mark")).toHaveText("crash-marker");
 await page.getByRole("textbox",{name:"Search logs"}).fill("");await expect(page.locator(".game-logs")).toContainText("10,000 / 10,000");
 await page.locator(".game-log-viewport").evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event("scroll",{bubbles:true}));});
 const before=await page.evaluate(()=>(globalThis as any).__materialQA.calls.filter((c:any)=>c.command==="backend_snapshot").length);
 await emit(page,"process-output-batch",{id:"instance-0",session:"canary-100.log",lines:["[14:33:01] [Render thread/WARN]: New warning"]});
 await expect(page.getByRole("button",{name:"New messages"})).toBeVisible();expect(await page.locator(".game-log-viewport").evaluate(el=>el.scrollTop)).toBe(0);
 expect(await page.evaluate(()=>(globalThis as any).__materialQA.calls.filter((c:any)=>c.command==="backend_snapshot").length)).toBe(before);
 await page.getByRole("button",{name:"New messages"}).click();await expect(page.locator(".game-log-window")).toContainText("New warning");
 await page.screenshot({path:".qa/ux-pass/game-logs.png"});
});
test("Physical RAM defines manual range, high allocation persists and instance can inherit",async({page})=>{
 await setup(page);await nav(page,"Settings").click();await page.locator(".settings-nav").getByRole("button",{name:"Canary",exact:true}).click();
 for(const gb of [8,16,32,64]){await page.evaluate(gb=>(globalThis as any).__materialQA.state.physical_memory_mb=gb*1024,gb);await emit(page,"instances-changed",{});await expect(page.getByRole("slider",{name:"Maximum memory",exact:true})).toHaveAttribute("max",String(gb-1));}
 const slider=page.getByRole("slider",{name:"Maximum memory",exact:true});await slider.fill("48");await slider.press("Tab");await page.getByRole("button",{name:"Save",exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(globalThis as any).__materialQA.state.settings.max_memory)).toBe(49152);
 await page.keyboard.press("Escape");await nav(page,"Library").click();await page.locator(".instance-card").first().getByRole("button",{name:"Details",exact:true}).click();
 await expect(page.getByRole("checkbox",{name:"Use global memory"})).toBeChecked();await page.getByRole("checkbox",{name:"Use global memory"}).uncheck();
 await expect(page.getByRole("slider",{name:"Maximum memory",exact:true})).toBeEnabled();
});
test("Particle drag previews without persistence or IPC per pixel",async({page})=>{
 await page.addInitScript(()=>localStorage.setItem("canary-visual",JSON.stringify({ambient:"snow",density:12,particleOpacity:35})));
 await setup(page);await nav(page,"Settings").click();await page.locator(".settings-nav").getByRole("button",{name:"Effects",exact:true}).click();
 await expect(page.locator(".effects-preferences")).toBeVisible();await page.waitForTimeout(350); // wait for the settings page exit/entry animation
 await page.evaluate(()=>{const original=Storage.prototype.setItem;let writes=0;(globalThis as any).__writes=()=>writes;Storage.prototype.setItem=function(key:string,value:string){if(key==="canary-visual")writes++;return original.call(this,key,value);};(globalThis as any).__callsBefore=(globalThis as any).__materialQA.calls.length;});
 const slider=page.getByRole("slider",{name:"Particle speed",exact:true});await slider.scrollIntoViewIfNeeded();const box=await slider.boundingBox();expect(box).not.toBeNull();
 await page.mouse.move(box!.x+box!.width*.5,box!.y+box!.height/2);await page.mouse.down();
 for(let i=1;i<36;i++)await page.mouse.move(box!.x+box!.width*(.1+i*.022),box!.y+box!.height/2);
 expect(await page.evaluate(()=>(globalThis as any).__writes())).toBe(0);await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>(globalThis as any).__writes())).toBe(1);
 expect(await page.evaluate(()=>(globalThis as any).__materialQA.calls.length-(globalThis as any).__callsBefore)).toBe(0);
 expect(await page.locator(".ambient-particles i").count()).toBe(24);
});
test("Splash centers logo first and the final group, then unmounts permanently",async({page})=>{
 await nativeFixture(page);
 await page.addInitScript(()=>{localStorage.setItem("canary-visual",JSON.stringify({app:"green"}));(globalThis as any).__splash=[];const deadline=performance.now()+12000;function sample(){const group=document.querySelector(".startup-brand"),logo=document.querySelector(".startup-logo"),text=document.querySelector(".startup-wordmark");if(group&&logo&&text){const g=group.getBoundingClientRect(),l=logo.getBoundingClientRect();(globalThis as any).__splash.push({at:performance.now(),group:g.x+g.width/2,logo:l.x+l.width/2,text:Number(getComputedStyle(text).opacity),width:innerWidth});}if(performance.now()<deadline&&(!document.querySelector(".startup-app")||document.querySelector(".startup-splash")))requestAnimationFrame(sample);}requestAnimationFrame(sample);});
 await page.goto("/");await expect(page.locator(".startup-splash")).toHaveCount(0);
 const frames=await page.evaluate(()=>(globalThis as any).__splash);
 const solo=frames.find((f:any)=>f.text===0);expect(solo).toBeTruthy();expect(Math.abs(solo.logo-solo.width/2)).toBeLessThan(2);
 const final=frames.find((f:any)=>f.text>.99);expect(final).toBeTruthy();expect(Math.abs(final.group-final.width/2)).toBeLessThan(1);expect(final.logo).toBeLessThan(final.width/2-30);
 await nav(page,"Activity").click();await expect(page.locator(".startup-splash")).toHaveCount(0);expect(await page.locator(".startup-app").getAttribute("inert")).toBeNull();
});
test.beforeAll(()=>mkdirSync(".qa/ux-pass",{recursive:true}));

test("Long lines wrap within a bounded buffer; crash summary, filters and copy use game output",async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,"clipboard",{value:{writeText:async(text:string)=>{(globalThis as any).__copied=text;}}}));
 await setup(page);await nav(page,"Activity").click();await page.getByRole("button",{name:"Game Logs",exact:true}).click();
 await emit(page,"process-output-batch",{id:"instance-0",session:"canary-200.log",lines:[...Array.from({length:5000},(_,i)=>"[14:32:01] [Render thread/INFO]: "+i+" "+("x".repeat(1000))),"[14:32:02] [Render thread/ERROR]: Diagnostic marker"]});
 await expect(page.locator(".game-log-window")).toContainText("Diagnostic marker");
 const buffer=await page.evaluate(async()=>{const {gameLogStore}=await import("/src/services/gameLogStore.ts" as string);const lines=gameLogStore.value.lines["instance-0:canary-200.log"];return {count:lines.length,size:lines.reduce((n:any,l:any)=>n+l.raw.length,0)};});
 expect(buffer.count).toBeLessThan(10000);expect(buffer.size).toBeLessThanOrEqual(1_000_000);
 await page.getByRole("checkbox",{name:"Wrap lines"}).check();expect(await page.locator(".game-log-line").count()).toBeLessThan(80);
 expect(await page.locator(".game-log-viewport").evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await emit(page,"process-exited",{id:"instance-0",status:"crashed"});await expect(page.locator(".game-crash-summary")).toBeVisible();
 await page.getByRole("combobox",{name:"Log level"}).click();await page.getByRole("option",{name:"Errors",exact:true}).click();await expect(page.locator(".game-log-line")).toHaveCount(1);
 await page.getByRole("button",{name:"Copy",exact:true}).click();await expect.poll(()=>page.evaluate(()=>(globalThis as any).__copied)).toContain("Diagnostic marker");
 await page.getByRole("button",{name:"Open file",exact:true}).click();
 expect(await page.evaluate(()=>(globalThis as any).__materialQA.calls.some((c:any)=>c.command==="open_game_log"&&c.args.session==="canary-200.log"))).toBe(true);
});
test("Vibrancy is distinct, has no bright frame or nested blur, and fits three themes",async({page})=>{
 await page.addInitScript(()=>localStorage.setItem("canary-visual",JSON.stringify({materialStyle:"vibrancy",materialLinked:true,materialPreset:"vibrancy",surfaceOpacity:76,surfaceBlur:28,app:"sakura1",font:"Monocraft",minecraft:"headings"})));
 await setup(page);await nav(page,"Settings").click();await page.getByText("Advanced materials",{exact:true}).click();
 await expect(page.locator("html")).toHaveAttribute("data-material-sidebar","vibrancy");
 await expect(page.locator(".sidebar")).toHaveCSS("border-top-color","rgba(0, 0, 0, 0)");
 expect(await page.locator(".sidebar .nav-capsule").evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).backdropFilter==="none"))).toBe(true);
 const signatures=[];
 for(const style of ["Vibrancy","Glass","Clear Glass","Liquid Glass"]){
  await page.getByRole("combobox",{name:"Shared material",exact:true}).click();await page.getByRole("option",{name:style,exact:true}).click();
  signatures.push(await page.evaluate(()=>["--mat-cards-opacity","--mat-cards-blur","--mat-cards-sheen"].map(p=>document.documentElement.style.getPropertyValue(p)).join("|")));
 }
 expect(new Set(signatures).size).toBe(4);
 await page.getByRole("combobox",{name:"Material preset",exact:true}).click();await page.getByRole("option",{name:"Vibrancy",exact:true}).click();
 for(const mode of ["Dark","Light","AMOLED"]){
  await page.locator(".mode-grid").getByRole("button",{name:mode,exact:true}).click();
  await expect(page.locator(".settings-modal")).toBeVisible();expect(await page.locator(".settings-modal").evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.locator(".material-preview").scrollIntoViewIfNeeded();await page.waitForTimeout(300); // allow the theme transition to finish
  await page.screenshot({path:".qa/ux-pass/vibrancy-"+mode.toLowerCase()+".png"});
 }
});
