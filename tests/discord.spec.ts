import { test, expect, type Page } from "@playwright/test";
import { nativeFixture } from "./helpers/nativeFixture";

const nav=(page:Page,name:string)=>page.locator(".sidebar nav").getByRole("button",{name,exact:true});
const last=async(page:Page)=>page.evaluate(()=>
  (window as any).__materialQA.calls.filter((c:any)=>c.command==="discord_presence_context").at(-1)?.args);
async function settings(page:Page){await nav(page,"Settings").click();await page.locator(".settings-nav").getByRole("button",{name:"Discord",exact:true}).click();}
test.beforeEach(async({page})=>{await nativeFixture(page);await page.goto("/");await expect(page.locator(".home-greeting")).toBeVisible();});

test("old preferences default to On; Off and privacy settings persist across restart",async({page})=>{
  await settings(page);const main=page.getByRole("switch",{name:"Discord Rich Presence",exact:true});await expect(main).toHaveAttribute("aria-checked","true");
  await page.getByRole("switch",{name:"Show instance name",exact:true}).click();
  await page.getByRole("switch",{name:"Show project names",exact:true}).click();
  await page.getByRole("switch",{name:"Show installations and downloads",exact:true}).click();
  await main.click();await expect.poll(async()=>((await last(page))?.preferences)).toEqual({enabled:false,instanceNames:false,projectNames:false,downloads:false,currentPage:true});
  await expect(page.locator("[data-discord-status]")).toHaveAttribute("data-discord-status","disabled");
  await page.reload();await expect.poll(async()=>((await last(page))?.preferences.enabled)).toBe(false);await settings(page);
  for(const name of ["Discord Rich Presence","Show instance name","Show project names","Show installations and downloads"]){await expect(page.getByRole("switch",{name,exact:true})).toHaveAttribute("aria-checked","false");}
  await main.click();await expect.poll(async()=>((await last(page))?.preferences.enabled)).toBe(true);
});

test("one semantic bridge tracks Home, Discover, Library and Settings without account or game data",async({page})=>{
  await expect.poll(async()=>((await last(page))?.view.kind)).toBe("home");
  for(const [name,kind] of [["Discover","discover"],["Library","library"],["Settings","settings"]]){await nav(page,name).click();await expect.poll(async()=>((await last(page))?.view.kind)).toBe(kind);}
  const context=await last(page);expect(Object.keys(context).sort()).toEqual(["preferences","view"]);
  const serialized=JSON.stringify(context);expect(serialized).not.toMatch(/CanaryPlayer|LicensedPlayer|C:\/|access_token|instance-1|startedAt/);
  await page.keyboard.press("Escape");await expect.poll(async()=>((await last(page))?.view.kind)).toBe("library");
});

test("opening and closing a provider project updates semantic project context",async({page})=>{
  const project={project_id:"test-project",id:"test-project",title:"Длинный проект Canary",slug:"test-project",project_type:"modpack",description:"QA project",body:"Public description",downloads:1,versions:["1.21.1"],categories:["fabric"],icon_url:"",license:{id:"MIT"}};
  await page.route("https://api.modrinth.com/v2/**",route=>{
    const url=route.request().url();return route.fulfill({json:url.includes("/version")?[]:url.includes("/search")?{hits:[project],total_hits:1}:project});
  });
  await nav(page,"Discover").click();await page.getByRole("button",{name:"View project",exact:true}).click();
  await expect.poll(async()=>((await last(page))?.view)).toMatchObject({kind:"project",projectName:project.title,provider:"modrinth",category:"modpack"});
  await page.keyboard.press("Escape");await expect.poll(async()=>((await last(page))?.view.kind)).toBe("discover");
});

test("language switch localizes Discord settings and sends updated presence locale",async({page})=>{
  await settings(page);await page.locator(".settings-nav").getByRole("button",{name:"Language",exact:true}).click();await page.getByRole("button",{name:"Русский Русский интерфейс"}).click();
  await expect.poll(async()=>((await last(page))?.view.locale)).toBe("ru");
  await page.locator(".settings-nav").getByRole("button",{name:"Discord",exact:true}).click();
  await expect(page.getByRole("switch",{name:"Показывать название экземпляра",exact:true})).toBeVisible();
  await expect(page.getByRole("switch",{name:"Показывать установки и загрузки",exact:true})).toBeVisible();
  await expect(page.locator(".discord-settings")).toContainText("Discord не запущен или недоступен");
});

test("Discord status is neutral and settings fit Light, Dark, AMOLED and Monocraft",async({page})=>{
  await page.evaluate(()=>{const old=JSON.parse(localStorage.getItem("canary-visual")||"{}");localStorage.setItem("canary-visual",JSON.stringify({...old,font:"Monocraft",minecraft:"full"}));});await page.reload();
  await nav(page,"Settings").click();
  for(const theme of ["Light","Dark","AMOLED"]){
    await page.locator(".settings-nav").getByRole("button",{name:"Appearance",exact:true}).click();await page.locator(".mode-grid").getByRole("button",{name:theme,exact:true}).click();
    await page.locator(".settings-nav").getByRole("button",{name:"Discord",exact:true}).click();await expect(page.locator(".discord-settings [role=switch]")).toHaveCount(5);
    expect(await page.locator(".settings-content").evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
});
