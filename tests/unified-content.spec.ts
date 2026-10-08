import {test,expect,type Page} from "@playwright/test";
import {nativeFixture} from "./helpers/nativeFixture";
import {mkdirSync} from "node:fs";
const nav=(p:Page,name:string)=>p.locator(".sidebar nav").getByRole("button",{name,exact:true});
const choose=async(p:Page,name:string,value:string)=>{await p.getByRole("combobox",{name,exact:true}).click();await p.getByRole("option",{name:value,exact:true}).click();};
async function start(page:Page){
 await nativeFixture(page);await page.emulateMedia({reducedMotion:"reduce"});
 await page.route("https://api.modrinth.com/v2/search*",r=>r.fulfill({json:{hits:Array.from({length:8},(_,i)=>({project_id:"project-"+i,title:"Compact project "+i,description:"A small project description with readable details.",project_type:"modpack",downloads:1000+i,versions:["1.21.1"],categories:["fabric"],icon_url:"/branding/canary-bird-white.png"})),total_hits:8}}));
 await page.goto("/");await expect(page.locator(".startup-splash")).toHaveCount(0);
 await page.evaluate(()=>{
  const qa=(globalThis as any).__materialQA;let inventory={items:[],history:[],snapshots:[]};
  qa.overrides={
   content_inventory:()=>inventory,
   content_search:(a:any)=>({hits:Array.from({length:3},(_,i)=>({project_id:a.kind+"-"+i,title:a.kind+" Project "+i,description:"Compact content description",downloads:100,versions:["1.21.1"],categories:["fabric"],icon_url:"/branding/canary-bird-white.png"})),total_hits:3}),
   bulk_content_preview:(a:any)=>{if(qa.previewFailure)return Promise.reject({code:"content_incompatible",message:"A selected project is incompatible"});return a.requests.map((r:any)=>({items:[{project:r.project,version:r.project+"-v1",name:r.project,number:"1",kind:r.kind}],optional:[],fingerprint:r.project+"-approved",world:r.world}));},
   bulk_install_content:(a:any)=>{inventory={items:a.requests.map((r:any)=>({id:r.project,project:r.project,name:r.project,version:"1",kind:r.kind,path:(r.kind==="mod"?"mods":r.kind==="shader"?"shaderpacks":r.kind==="datapack"?"saves/"+r.world+"/datapacks":"resourcepacks")+"/"+r.project+".jar",enabled:true,source:"modrinth",provider:"modrinth",missing:false,hash:"fixture",dependencies:[]})),history:[],snapshots:[]};return inventory;}
  };
 });
}
async function content(page:Page){await nav(page,"Library").click();await page.locator(".instance-card").first().getByRole("button",{name:"Content",exact:true}).click();await expect(page.locator(".content-manager")).toBeVisible();}
test.beforeAll(()=>mkdirSync(".qa/unified-content",{recursive:true}));

test("Microsoft account shows a skin head, branded capitalized provider and no Signed in label",async({page})=>{
 await start(page);
 const texture='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect x="8" y="8" width="8" height="8" fill="#c28a60"/><rect x="10" y="11" width="2" height="1" fill="#ddd"/><rect x="13" y="11" width="2" height="1" fill="#ddd"/></svg>');
 await page.evaluate(texture=>{const q=(globalThis as any).__materialQA;q.state.accounts[1].avatar=texture;},texture);
 await nav(page,"Settings").click();await page.locator(".settings-nav").getByRole("button",{name:"Account",exact:true}).click();
 const account=page.locator(".runtime-account").filter({hasText:"LicensedPlayer"});
 await account.locator(".popover-action").click();await expect(account.locator(".account-provider")).toHaveText("Microsoft");
 await expect(account.locator(".microsoft-logo")).toBeVisible();await expect(account).not.toContainText("Signed in");
 await expect.poll(()=>account.locator(".skin-avatar img").first().evaluate(e=>(e as HTMLImageElement).naturalWidth)).toBe(64);
 await expect(account.locator(".skin-hat")).toHaveCount(1);await page.screenshot({path:".qa/unified-content/account.png"});
});

test("Discover and content use compact cards with icons on the left",async({page})=>{
 await start(page);await nav(page,"Discover").click();
 const card=page.locator(".discover-page .compact-project-card").first();await expect(card).toBeVisible();
 await expect(card.locator(".card-visual")).toHaveCount(0);
 const icon=(await card.locator(".project-icon-button").boundingBox())!,title=(await card.locator(".card-title").boundingBox())!;
 expect(icon.x+icon.width).toBeLessThan(title.x);expect((await card.boundingBox())!.height).toBeLessThan(320);
 await page.screenshot({path:".qa/unified-content/discover.png"});
 await content(page);await expect(page.locator(".content-project-grid .compact-project-card")).toHaveCount(3);
 await expect(page.locator(".content-project-grid .card-visual")).toHaveCount(0);
 await page.screenshot({path:".qa/unified-content/content.png"});
});

test("Selection survives category switches and installs all projects in one approved batch",async({page})=>{
 await start(page);await content(page);
 await page.getByRole("checkbox",{name:"Select: mod Project 0",exact:true}).check();await page.getByRole("checkbox",{name:"Select: mod Project 1",exact:true}).check();
 await page.locator(".content-types").getByRole("button",{name:"Resource Packs",exact:true}).click();
 await page.getByRole("checkbox",{name:"Select: resourcepack Project 0",exact:true}).check();
 await expect(page.locator(".content-basket")).toContainText("3 Selected");
 await page.getByRole("button",{name:"Install selected",exact:true}).click();
 const review=page.getByRole("dialog",{name:"Review installation",exact:true});await expect(review.locator(".content-review-row")).toHaveCount(3);
 await review.getByRole("button",{name:"Confirm",exact:true}).click();await expect(review).toHaveCount(0);
 const calls=await page.evaluate(()=>(globalThis as any).__materialQA.calls.filter((c:any)=>c.command==="bulk_install_content"));
 expect(calls).toHaveLength(1);expect(calls[0].args.requests.map((r:any)=>r.project)).toEqual(["mod-0","mod-1","resourcepack-0"]);
 expect(calls[0].args.requests.every((r:any)=>r.fingerprint.endsWith("-approved"))).toBe(true);
 await page.locator(".content-types").getByRole("button",{name:"Mods",exact:true}).click();await expect(page.locator(".content-item")).toHaveCount(2);
});

test("Failed selection review downloads nothing and preserves the basket",async({page})=>{
 await start(page);await content(page);await page.getByRole("checkbox",{name:"Select: mod Project 0",exact:true}).check();
 await page.evaluate(()=>(globalThis as any).__materialQA.previewFailure=true);
 await page.getByRole("button",{name:"Install selected",exact:true}).click();await expect(page.locator(".content-basket")).toContainText("1 Selected");
 await expect(page.getByRole("dialog",{name:"Review installation",exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>(globalThis as any).__materialQA.calls.some((c:any)=>c.command==="bulk_install_content"||c.command==="install_content"))).toBe(false);
});

test("Cards, search, buttons and instance panels follow live material opacity in three themes",async({page})=>{
 await start(page);await nav(page,"Settings").click();await choose(page,"Material preset","Clear Glass");
 const opacity=page.getByRole("slider",{name:"Surface opacity",exact:true});await opacity.fill("55");await opacity.press("Tab");
 for(const theme of ["Dark","Light","AMOLED"]){
  await page.locator(".mode-grid").getByRole("button",{name:theme,exact:true}).click();await page.keyboard.press("Escape");
  await nav(page,"Discover").click();await expect(page.locator(".discover-page .compact-project-card").first()).toBeVisible();
  const alpha=await page.locator(".search-field").evaluate(e=>getComputedStyle(e).backgroundColor);expect(alpha).toMatch(/0\.4[0-9]|49%/);
  await page.waitForTimeout(250);await page.screenshot({path:".qa/unified-content/"+theme.toLowerCase()+".png"});
  await nav(page,"Library").click();await page.locator(".instance-card").first().getByRole("button",{name:"Details",exact:true}).click();
  const fill=await page.locator(".instance-surface").evaluate(e=>getComputedStyle(e).backgroundColor);expect(fill).not.toMatch(/94%|0\.94/);
  await page.screenshot({path:".qa/unified-content/"+theme.toLowerCase()+"-instance.png"});
  await page.getByRole("button",{name:"Close",exact:true}).last().click();
  await nav(page,"Settings").click();
 }
});

test("Shaders and datapacks keep a shared batch and the selected world",async({page})=>{
 await start(page);await page.evaluate(()=>{
  const q=(globalThis as any).__materialQA;
  q.overrides.content_inventory=()=>({items:[{id:"iris",name:"Iris",kind:"mod",enabled:true,missing:false,mod_ids:["iris"],dependencies:[],path:"mods/iris.jar"}],history:[],snapshots:[]});
  q.overrides.content_worlds=()=>[{name:"My world"}];
 });await content(page);
 await page.locator(".content-types").getByRole("button",{name:"Shaders",exact:true}).click();
 for(const n of [0,1])await page.getByRole("checkbox",{name:"Select: shader Project "+n,exact:true}).check();
 await page.locator(".content-types").getByRole("button",{name:"Data Packs",exact:true}).click();
 await page.locator(".content-manager").getByRole("combobox",{name:/World/}).click();await page.getByRole("option",{name:"My world",exact:true}).click();
 for(const n of [0,1])await page.getByRole("checkbox",{name:"Select: datapack Project "+n,exact:true}).check();
 await expect(page.locator(".content-basket")).toContainText("4 Selected");
 await page.getByRole("button",{name:"Install selected",exact:true}).click();
 await page.getByRole("dialog",{name:"Review installation",exact:true}).getByRole("button",{name:"Confirm",exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(globalThis as any).__materialQA.calls.filter((c:any)=>c.command==="bulk_install_content").length)).toBe(1);
 const requests=await page.evaluate(()=>(globalThis as any).__materialQA.calls.find((c:any)=>c.command==="bulk_install_content").args.requests);
 expect(requests.filter((r:any)=>r.kind==="shader")).toHaveLength(2);
 expect(requests.filter((r:any)=>r.kind==="datapack").map((r:any)=>r.world)).toEqual(["My world","My world"]);
});
