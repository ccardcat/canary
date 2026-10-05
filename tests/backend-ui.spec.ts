import {test,expect} from "@playwright/test";
// Contract tests only. Actual Minecraft/download/storage integration is run
// separately through the native backend-check executable, without these fixtures.
test.beforeEach(async({page})=>{
  await page.route("https://api.modrinth.com/v2/**",route=>route.fulfill({json:{hits:[],total_hits:0}}));
  await page.route("**/src/main.tsx*",async route=>{
    const response=await route.fetch();const body=await response.text();
    await route.fulfill({response,body:`
import {mockIPC,mockWindows,mockConvertFileSrc} from '/node_modules/@tauri-apps/api/mocks.js';
globalThis.isTauri=true;mockWindows('main');mockConvertFileSrc('windows');
const state={instances:[{id:'contract-instance',name:'Contract instance',provider:'vanilla',version_name:'1.21.1',minecraft:'1.21.1',loader:'fabric',directory:'C:/Canary/instances/contract-instance',installed:1,playtime:0,favorite:false,status:'ready',overrides:{}}],accounts:[],settings:{backup_before_changes:true,backup_retention:8,log_retention_days:30,update_checks:true,automatic_java:true,min_memory:512,max_memory:4096,jvm_args:[],game_args:[],width:1280,height:720,concurrency:4,fullscreen:false,snapshots:false},activity:[],providers:{},data_folder:'C:/Canary',physical_memory_mb:8192};
let fullscreen=false;
const inventory={items:[],history:[],snapshots:[]};
globalThis.__backendTest={state,calls:[],inventory};
mockIPC((command,args)=>{
  globalThis.__backendTest.calls.push({command,args});
  if(command==='backend_snapshot')return structuredClone(state);
  if(command==='list_wallpapers')return [];
  if(command==='storage_usage')return {path:'D:/Canary',free:10737418240,used:1073741824,available:true,breakdown:{instances:1073741824,cache:2147483648,java:1073741824,logs:0,total:4294967296}};
  if(command==='catalog_search'){const data={hits:[{provider:'curseforge',project_id:'100',title:globalThis.__backendTest.slowSearch&&args.query?args.query+' CF pack':'CurseForge contract pack',description:'Provider contract',author:'Author',downloads:123,versions:['1.21.1'],categories:['fabric'],project_type:'modpack'}],total_hits:1};return globalThis.__backendTest.slowSearch&&args.query?new Promise(resolve=>setTimeout(()=>resolve(data),600)):data;}
  if(command==='catalog_versions')return [{provider:'curseforge',id:'200',project_id:'100',name:'Pack 2',version_number:'2',version_type:'release',game_versions:['1.21.1'],loaders:['fabric'],date_published:'2026-10-01',files:[{filename:'pack.zip',url:'https://example.invalid/pack.zip',size:1,hashes:{sha1:'contract'}}]}];
  if(command==='content_project'&&args.provider==='curseforge')return {provider:'curseforge',id:'100',slug:'contract-pack',title:'CurseForge contract pack',description:'Provider contract',body:'<p>Safe CF description</p><script>window.cfUnsafe=true</script>',body_format:'html',project_type:'modpack',downloads:123,followers:0,game_versions:['1.21.1'],categories:['fabric'],updated:'2026-10-01',gallery:[]};
  if(command==='install_curseforge_pack'){const instance={...state.instances[0],id:'curseforge-100-200',provider:'curseforge',project_id:'100',version_id:'200',name:'CurseForge contract pack',directory:'C:/Canary/instances/curseforge-100-200'};state.instances.push(instance);return instance;}
  if(command==='content_inventory')return structuredClone(inventory);
  if(command==='content_worlds')return [];
  if(command==='content_search')return {hits:[{project_id:'sodium',title:'Sodium',author:'Author',description:'A compatible optimization mod',downloads:123,versions:['1.21.1'],categories:['fabric']}],total_hits:1};
  if(command==='content_project')return {id:'sodium',title:'Sodium',description:'Optimized rendering',body:'**Safe description**',game_versions:['1.21.1'],loaders:['fabric']};
  if(command==='content_versions')return [{id:'sodium-v1',name:'Sodium 1',version_number:'1',version_type:'release'}];
  if(command==='content_preview')return {items:[{project:'sodium',version:'sodium-v1',name:'Sodium',number:'1',kind:'mod'},{project:'fabric-api',version:'api-v1',name:'Fabric API',number:'1',kind:'mod'}],optional:['Optional recommendation'],fingerprint:'contract-plan'};
  if(command==='install_content'){inventory.items=[{id:'item-sodium',name:'Sodium',version:'1',kind:'mod',path:'mods/sodium.jar',enabled:true,source:'modrinth',project:'sodium',provider_version:'sodium-v1',hash:'contract',dependencies:['fabric-api'],compatibility:'compatible'},{id:'item-api',name:'Fabric API',version:'1',kind:'mod',path:'mods/api.jar',enabled:true,source:'modrinth',project:'fabric-api',provider_version:'api-v1',hash:'contract-api',dependencies:[],compatibility:'compatible'}];inventory.snapshots.push({});return structuredClone(inventory);}
  if(command==='pack_update_preview')return {version:'pack-v2',name:'2',user_files:1,fingerprint:'pack-contract-plan'};
  if(command==='apply_pack_update'){state.instances[0].version_name='2';return structuredClone(inventory);}
  if(command==='content_action'){if(args.action==='remove'){inventory.items=inventory.items.filter(i=>!args.ids.includes(i.id));return structuredClone(inventory);}for(const i of inventory.items.filter(i=>args.ids.includes(i.id)))i.enabled=args.action==='enable';return structuredClone(inventory);}
  if(command==='authenticate_elyby')return new Promise((resolve,reject)=>setTimeout(()=>reject({code:'auth_two_factor',message:'Enter code'}),300));
  if(command==='create_local_account'){const account={id:'local-'+(state.accounts.length+1),uuid:'contract-stable-uuid',username:args.username,provider:'local',status:'local'};state.accounts.push(account);state.settings.active_account=account.id;return account;}
  if(command==='update_instance'){const item=state.instances.find(i=>i.id===args.instance.id);if(item)Object.assign(item,{name:args.instance.name,overrides:args.instance.overrides});return item;}
  if(command==='delete_instance'){state.instances=state.instances.filter(i=>i.id!==args.id);return;}
  if(command==='switch_account'){state.settings.active_account=args.id;return;}
  if(command==='launch_instance'){state.instances[0].status='running';return 123;}
  if(command==='stop_instance'){if(globalThis.__backendTest.stopPending&&!args.force){state.instances[0].status='stopping';throw {code:'stop_pending',message:'Close the game normally'};}state.instances[0].status='ready';state.instances[0].playtime=30;return;}
  if(command==='prepare_instance')throw {code:'checksum',stage:'libraries',message:'Technical checksum contract details',retryable:true};
  if(command==='detect_java')return [{path:'C:/Java/bin/java.exe',vendor:'Test vendor',version:'21.0.1',major:21,architecture:'amd64',managed:false}];
  if(command==='save_backend_settings'){state.settings=args.settings;return;}
  if(command==='core:window|is_maximized'||command==='plugin:window|is_maximized')return false;
  if(command==='plugin:window|is_fullscreen')return fullscreen;
  if(command==='plugin:window|set_fullscreen'){fullscreen=args.value;return;}
  if(command==='plugin:window|outer_position')return {x:90,y:80};
  if(command==='plugin:window|inner_size')return {width:1280,height:800};
  return null;
},{shouldMockEvents:true});
`+body});
  });
  await page.goto("/");
});
test("native account, Play/Stop and human error details connect to the backend",async({page})=>{
  await page.getByRole("button",{name:"Playing as",exact:true}).click();
  await page.getByRole("textbox",{name:"Username",exact:true}).fill("ContractPlayer");
  await page.getByRole("button",{name:"Create Local account",exact:true}).click();
  await expect(page.locator(".account-button")).toContainText("ContractPlayer");
  await page.locator("h1").click();
  await page.getByRole("button",{name:"Library",exact:true}).first().click();
  await page.getByRole("button",{name:"Play",exact:true}).click();
  await expect(page.getByRole("button",{name:"Stop game",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Stop game",exact:true}).click();
  await expect(page.locator(".library-grid")).toContainText("Less than a minute");
  await page.getByRole("button",{name:"Check / repair",exact:true}).click();
  const error=page.getByRole("alert");await expect(error).toContainText("failed verification");
  await expect(error).not.toContainText("Technical checksum");
  await error.getByRole("button",{name:"Details",exact:true}).click();
  await expect(error.locator("pre")).toContainText("Technical checksum contract details");
  const calls=await page.evaluate(()=> (globalThis as unknown as {__backendTest:{calls:{command:string;args:{id?:string}}[]}}).__backendTest.calls);
  expect(calls.find(call=>call.command==="launch_instance")?.args.id).toBe("contract-instance");
});
test("existing Settings saves real runtime settings and Java selection",async({page})=>{
  await page.getByRole("button",{name:"Settings",exact:true}).first().click();
  await page.locator(".settings-nav").getByRole("button",{name:"Canary",exact:true}).click();
  await page.getByRole("button",{name:"Find Java",exact:true}).click();
  await page.getByRole("combobox",{name:"Java executable",exact:true}).selectOption("C:/Java/bin/java.exe");
  await page.getByLabel("Maximum RAM (MB)",{exact:true}).fill("6144");
  await page.getByRole("button",{name:"Save",exact:true}).click();
  const settings=await page.evaluate(()=> (globalThis as unknown as {__backendTest:{state:{settings:{max_memory:number;java_path:string}}}}).__backendTest.state.settings);
  expect(settings.max_memory).toBe(6144);expect(settings.java_path).toBe("C:/Java/bin/java.exe");
});

test("instance settings stay outside the grid and bind to stable instance identity",async({page})=>{
 await page.setViewportSize({width:1920,height:1080});
 await page.evaluate(()=>{const test=(globalThis as any).__backendTest;test.state.instances.push({...test.state.instances[0],id:"instance-b",name:"Second instance",overrides:{max_memory:2048}});});
 await page.getByRole("button",{name:"Library",exact:true}).first().click();
 await page.locator(".library-grid").getByRole("button",{name:"Favorites",exact:true}).first().click();
 const cards=page.locator(".library-grid .project-card");await expect(cards).toHaveCount(2);
 const before=await cards.evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().height*100)/100));
 await cards.nth(0).getByRole("button",{name:"Details",exact:true}).click();
 await expect(page.locator(".instance-surface")).toHaveCount(1);
 await expect(page.locator(".instance-surface input").first()).toHaveValue("Contract instance");
 expect(await cards.evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().height*100)/100))).toEqual(before);
 await expect(cards.locator(".runtime-panel")).toHaveCount(0);
 await cards.nth(1).getByRole("button",{name:"Details",exact:true}).click();
 await expect(page.locator(".instance-surface input").first()).toHaveValue("Second instance");
 await page.locator(".instance-surface input").first().fill("Second renamed");
 await page.locator(".instance-surface").getByRole("button",{name:"Save",exact:true}).click();
 const calls=await page.evaluate(()=> (globalThis as any).__backendTest.calls);
 expect(calls.findLast((c:any)=>c.command==="update_instance").args.instance.id).toBe("instance-b");
 await expect(page.locator(".instance-surface h3").first()).toHaveText("Second renamed");
 await page.locator(".instance-surface").getByRole("button",{name:"Delete instance",exact:true}).click();
 await page.getByRole("dialog",{name:"Delete instance",exact:true}).getByRole("button",{name:"Confirm",exact:true}).click();
 await expect(page.locator(".instance-surface")).toHaveCount(0);await expect(cards).toHaveCount(1);
});

test("content browsing prefills compatibility and requires dependency confirmation",async({page})=>{
 await page.getByRole("button",{name:"Library",exact:true}).first().click();
 await page.locator(".library-grid").getByRole("button",{name:"Content",exact:true}).click();
 const manager=page.locator(".content-manager");await expect(manager).toContainText("Content — Contract instance");
 await expect(manager.getByRole("checkbox",{name:"Only compatible projects"})).toBeChecked();
 await manager.getByRole("button",{name:"Sodium",exact:true}).click();
 await manager.getByRole("button",{name:"Add",exact:true}).click();
 const dialog=page.getByRole("dialog",{name:"Review installation"});await expect(dialog).toContainText("Fabric API");
 expect(await page.evaluate(()=> (globalThis as any).__backendTest.calls.some((c:any)=>c.command==="install_content"))).toBe(false);
 await dialog.getByRole("button",{name:"Confirm",exact:true}).click();
 await expect(manager.locator(".content-item")).toHaveCount(2);
 await manager.getByRole("switch",{name:"Sodium",exact:true}).click();
 await expect(manager.getByRole("switch",{name:"Sodium",exact:true})).toHaveAttribute("aria-checked","false");
 const calls=await page.evaluate(()=> (globalThis as any).__backendTest.calls);
 const search=calls.find((c:any)=>c.command==="content_search");expect(search.args).toMatchObject({id:"contract-instance",kind:"mod",strict:true});
 const install=calls.find((c:any)=>c.command==="install_content");expect(install.args).toMatchObject({id:"contract-instance",version:"sodium-v1",fingerprint:"contract-plan"});
});

test("Ely.by clears the one-use password and offers the documented two-factor retry",async({page})=>{
 await page.getByRole("button",{name:"Playing as",exact:true}).click();
 await page.getByRole("button",{name:"Sign in to Ely.by",exact:true}).click();
 const dialog=page.getByRole("dialog",{name:"Sign in to Ely.by"});
 await dialog.getByLabel("Login / email",{exact:true}).fill("disposable-ui-test");
 await dialog.getByLabel("Password",{exact:true}).fill("disposable-contract-only-password");
 await dialog.getByRole("button",{name:"Sign in",exact:true}).click();
 await expect(dialog.getByLabel("Password",{exact:true})).toHaveValue("");
 await expect(dialog.getByLabel("Two-factor code",{exact:true})).toBeVisible();
 const persisted=await page.evaluate(()=>JSON.stringify(localStorage));expect(persisted).not.toContain("disposable-contract-only-password");
 await dialog.getByRole("button",{name:"Cancel",exact:true}).click();await expect(dialog).toHaveCount(0);
});

test("shader support uses enabled archive IDs rather than display names",async({page})=>{
 await page.evaluate(()=>{(globalThis as any).__backendTest.inventory.items.push({id:"renderer",name:"Renamed rendering support",version:"1",kind:"mod",path:"mods/renderer.jar",enabled:true,missing:false,source:"local",hash:"fixture",dependencies:[],mod_ids:["canvas"],compatibility:"compatible"});});
 await page.getByRole("button",{name:"Library",exact:true}).first().click();
 await page.locator(".library-grid").getByRole("button",{name:"Content",exact:true}).click();
 const manager=page.locator(".content-manager");await manager.getByRole("button",{name:"Shaders",exact:true}).click();
 await expect(manager.getByRole("button",{name:"Find compatible shader support",exact:true})).toHaveCount(0);
 await manager.getByRole("button",{name:"Installed",exact:true}).click();
 await manager.getByRole("button",{name:"Mods",exact:true}).click();
 await manager.getByRole("switch",{name:"Renamed rendering support",exact:true}).click();
 await manager.getByRole("button",{name:"Shaders",exact:true}).click();
 await expect(manager.getByRole("button",{name:"Find compatible shader support",exact:true})).toBeVisible();
});

test("pack updates require review and preserve the selected instance identity",async({page})=>{
 await page.evaluate(()=>{const state=(globalThis as any).__backendTest.state;state.instances[0].provider="modrinth";state.instances[0].version_name="1";state.instances[0].project_id="contract-pack";});
 await page.getByRole("button",{name:"Library",exact:true}).first().click();
 await page.locator(".library-grid").getByRole("button",{name:"Favorites",exact:true}).first().click();
 await page.locator(".library-grid").getByRole("button",{name:"Content",exact:true}).click();
 await page.locator(".content-manager").getByRole("button",{name:"Installed",exact:true}).click();
 await page.locator(".content-manager").getByRole("button",{name:"Update modpack",exact:true}).click();
 const dialog=page.getByRole("dialog",{name:"Update modpack",exact:true});await expect(dialog).toContainText("1 → 2");await expect(dialog).toContainText("user files will be preserved");
 expect(await page.evaluate(()=> (globalThis as any).__backendTest.calls.some((c:any)=>c.command==="apply_pack_update"))).toBe(false);
 await dialog.getByRole("button",{name:"Confirm",exact:true}).click();await expect(dialog).toHaveCount(0);
 const request=await page.evaluate(()=> (globalThis as any).__backendTest.calls.find((c:any)=>c.command==="apply_pack_update"));expect(request.args).toMatchObject({id:"contract-instance",fingerprint:"pack-contract-plan"});
});

test("F11 changes native fullscreen and Escape respects the settings dialog",async({page})=>{await expect(page.locator(".window-titlebar")).toBeVisible();await page.keyboard.press("F11");await expect(page.locator("html")).toHaveAttribute("data-window-fullscreen","true");await expect(page.locator(".window-titlebar")).toBeHidden();await page.getByRole("button",{name:"Settings",exact:true}).first().click();await page.keyboard.press("Escape");await expect(page.locator(".settings-modal")).toHaveCount(0);await expect(page.locator("html")).toHaveAttribute("data-window-fullscreen","true");await page.keyboard.press("Escape");await expect(page.locator("html")).toHaveAttribute("data-window-fullscreen","false");const calls=await page.evaluate(()=>(globalThis as any).__backendTest.calls);expect(calls.filter((c:any)=>c.command==="plugin:window|set_fullscreen").map((c:any)=>c.args.value)).toEqual([true,false]);expect(calls.some((c:any)=>c.command==="plugin:window|set_position")).toBe(true);});
test("internal instances stay hidden while user names remain visible and playtime is human readable",async({page})=>{await page.evaluate(()=>{const t=(globalThis as any).__backendTest;t.state.instances[0].name="User validation world";t.state.instances[0].playtime=4320;t.state.instances.push({...t.state.instances[0],id:"internal-validation",name:"Technical QA",internal:true});});await page.getByRole("button",{name:"Library",exact:true}).first().click();await page.getByRole("button",{name:"Check updates",exact:true}).click();await expect(page.locator(".library-grid .project-card")).toHaveCount(1);await expect(page.locator(".library-grid")).toContainText("User validation world");await expect(page.locator(".library-grid")).toContainText("1 h 12 min");});

test("CurseForge detail accepts ZIP pack versions and retains provider during installation",async({page})=>{
  await page.getByRole("button",{name:"Discover",exact:true}).first().click();
  await page.getByRole("combobox",{name:"Provider",exact:true}).selectOption("curseforge");
  await page.locator(".card-title").filter({hasText:"CurseForge contract pack"}).click();
  await expect(page.locator(".detail-page")).toContainText("Safe CF description");
  await expect(page.getByRole("combobox",{name:"Version to install",exact:true})).toHaveValue("200");
  expect(await page.evaluate(()=>(window as any).cfUnsafe)).toBeUndefined();
  await page.locator(".detail-actions").getByRole("button",{name:"Install",exact:true}).click();
  await expect(page.locator(".library-grid")).toContainText("CurseForge contract pack");
  const calls=await page.evaluate(()=>(globalThis as any).__backendTest.calls);
  expect(calls.find((call:any)=>call.command==="install_curseforge_pack")?.args).toEqual({projectId:100,fileId:200});
  expect(calls.some((call:any)=>call.command==="install_modpack")).toBe(false);
});


test("pending Stop waits for an explicit Force choice",async({page})=>{
  await page.evaluate(()=>{const test=(globalThis as any).__backendTest;test.state.instances[0].status="running";test.stopPending=true;});
  await page.getByRole("button",{name:"Library",exact:true}).first().click();
  await page.getByRole("button",{name:"Check updates",exact:true}).click();
  await page.getByRole("button",{name:"Stop game",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Minecraft is still running"});
  await expect(dialog).toContainText("unsaved progress");
  let calls=await page.evaluate(()=>(globalThis as any).__backendTest.calls.filter((c:any)=>c.command==="stop_instance"));
  expect(calls.map((c:any)=>c.args.force)).toEqual([false]);
  await dialog.getByRole("button",{name:"Wait",exact:true}).click();
  await expect(dialog.getByRole("button",{name:"Wait",exact:true})).toBeEnabled();
  calls=await page.evaluate(()=>(globalThis as any).__backendTest.calls.filter((c:any)=>c.command==="stop_instance"));
  expect(calls.map((c:any)=>c.args.force)).toEqual([false,false]);
  await dialog.getByRole("button",{name:"Force stop",exact:true}).click();
  await expect(dialog).toHaveCount(0);
  calls=await page.evaluate(()=>(globalThis as any).__backendTest.calls.filter((c:any)=>c.command==="stop_instance"));
  expect(calls.map((c:any)=>c.args.force)).toEqual([false,false,true]);
});


test("changing CurseForge search cancels the native request and discards stale results",async({page})=>{
  await page.evaluate(()=>(globalThis as any).__backendTest.slowSearch=true);
  await page.getByRole("button",{name:"Discover",exact:true}).first().click();
  await page.getByRole("combobox",{name:"Provider",exact:true}).selectOption("curseforge");
  const search=page.getByRole("textbox",{name:"Search projects",exact:true});
  await search.fill("first");
  await expect.poll(()=>page.evaluate(()=>(globalThis as any).__backendTest.calls.some((c:any)=>c.command==="catalog_search"&&c.args.query==="first"))).toBe(true);
  await search.fill("second");
  await expect(page.locator(".card-title")).toContainText("second CF pack");
  const calls=await page.evaluate(()=>(globalThis as any).__backendTest.calls);
  const first=calls.find((c:any)=>c.command==="catalog_search"&&c.args.query==="first");
  expect(first.args.requestId).toMatch(/^provider-/);
  expect(calls.some((c:any)=>c.command==="cancel_operation"&&c.args.id===first.args.requestId)).toBe(true);
  await expect(page.locator(".card-title")).not.toContainText("first CF pack");
});

test("storage cleanup requires confirmation and RAM warning leaves account defaults selectable",async({page})=>{
 await page.getByRole("button",{name:"Settings",exact:true}).first().click();
 await page.locator(".settings-nav").getByRole("button",{name:"Canary",exact:true}).click();
 const storage=page.locator(".storage-settings");await expect(storage.locator(".storage-breakdown")).toContainText("Cache");await expect(storage.locator(".storage-breakdown")).toContainText("4.00 GB");
 await storage.getByRole("button",{name:"Clear cache",exact:true}).click();const dialog=page.getByRole("dialog",{name:"Clear cache",exact:true});await expect(dialog).toContainText("Worlds, instances, Java and accounts are preserved");
 expect(await page.evaluate(()=> (globalThis as any).__backendTest.calls.some((c:any)=>c.command==="clear_download_cache"))).toBe(false);
 await dialog.getByRole("button",{name:"Cancel",exact:true}).click();await expect(dialog).toHaveCount(0);
 await storage.getByRole("button",{name:"Clear cache",exact:true}).click();await dialog.getByRole("button",{name:"Clear",exact:true}).click();await expect(dialog).toHaveCount(0);
 expect(await page.evaluate(()=> (globalThis as any).__backendTest.calls.filter((c:any)=>c.command==="clear_download_cache").length)).toBe(1);
 const max=page.locator("label").filter({hasText:"Maximum RAM"}).getByRole("spinbutton");await max.fill("7000");await expect(page.getByText("You are allocating most of your RAM.",{exact:false})).toBeVisible();
 await page.getByLabel("Default account",{exact:true}).selectOption("");await expect(page.getByLabel("Default account",{exact:true})).toHaveValue("");
 await page.evaluate(()=>{const state=(globalThis as any).__backendTest.state;state.accounts=[{id:"older",provider:"local",username:"OlderQA",last_used:100,status:"local"},{id:"recent",provider:"local",username:"RecentQA",last_used:200,status:"local"}];});
 await page.getByRole("button",{name:"Save",exact:true}).click();await expect(page.locator(".account-button")).toContainText("RecentQA");
});
