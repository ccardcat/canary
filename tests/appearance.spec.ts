import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://api.modrinth.com/**", route => route.fulfill({ json: { hits: [], total_hits: 0 } }));
  await page.addInitScript(()=>{if(!localStorage.getItem("canary-visual"))localStorage.setItem("canary-visual",JSON.stringify({backgroundSource:"canary",materialLinked:true,materialStyle:"glass"}));});
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
});

test("interface scale updates centrally and persists independently of font family",async({page})=>{
 await page.locator(".settings-nav").getByRole("button",{name:"Typography",exact:true}).click();
 for(const font of ["Nunito","Monocraft"]){
  await page.locator(".font-options").getByRole("button",{name:font,exact:true}).click();
  if(font==="Monocraft")await page.getByRole("button",{name:"Full interface",exact:true}).click();
  for(const scale of [90,100,110,120]){
   await page.getByRole("button",{name:`${scale}%`,exact:true}).click();
   await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue("--ui-font-scale").trim())).toBe(String(scale/100));
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
 }
 await page.reload();await page.getByRole("button",{name:"Settings",exact:true}).click();await page.locator(".settings-nav").getByRole("button",{name:"Typography",exact:true}).click();
 await expect(page.getByRole("button",{name:"120%",exact:true})).toHaveAttribute("aria-pressed","true");
 await expect(page.locator(".font-options").getByRole("button",{name:"Monocraft",exact:true})).toHaveAttribute("aria-pressed","true");
 await page.locator(".settings-nav").getByRole("button",{name:"Language",exact:true}).click();
 await page.getByRole("button",{name:/Русский интерфейс/}).click();
 await page.locator(".settings-nav").getByRole("button",{name:"Типографика",exact:true}).click();
 await expect(page.locator(".visual-preferences[data-visual-group]")).toContainText("Размер интерфейса");
 for(const font of ["Nunito","Monocraft"]){await page.locator(".font-options").getByRole("button",{name:font,exact:true}).click();for(const scale of [90,100,110,120]){await page.getByRole("button",{name:`${scale}%`,exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}}
 await expect(page.locator(".settings-modal")).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("background pairing, independent selections and restart persistence", async ({ page }) => {
  const background=()=>page.locator(".settings-nav").getByRole("button",{name:"Background",exact:true}).click();
  const target=(name:string)=>page.getByRole("group",{name:"Background target"}).getByRole("button",{name,exact:true}).click();
  await background();const options=page.locator('[data-visual-group="background"] .background-options');
  for(const name of ["Dark Blue","Gray","Green","Sakura 1","Sakura 2"]){
    await options.getByRole("button",{name,exact:true}).click();
    await expect(options.getByRole("button",{name,exact:true})).toHaveAttribute("aria-pressed","true");
    await expect(page.locator(".global-wallpaper")).toHaveCount(1);
  }
  await target("Sidebar");
  for(const name of ["Default","Dark Blue","Gray","Green","Sakura 1","Sakura 2"]){await options.getByRole("button",{name,exact:true}).click();await expect(options.getByRole("button",{name,exact:true})).toHaveAttribute("aria-pressed","true");}
  await target("Launcher");await options.getByRole("button",{name:"Green",exact:true}).click();
  const linked=page.getByRole("checkbox",{name:"Use one picture for launcher and sidebar"});await linked.check();
  await target("Sidebar");await expect(options.getByRole("button",{name:"Green",exact:true})).toHaveAttribute("aria-pressed","true");
  await options.getByRole("button",{name:"Dark Blue",exact:true}).click();await target("Launcher");
  await expect(options.getByRole("button",{name:"Dark Blue",exact:true})).toHaveAttribute("aria-pressed","true");
  await linked.uncheck();await options.getByRole("button",{name:"Green",exact:true}).click();
  await page.getByRole("slider",{name:"Wallpaper visibility",exact:true}).fill("1");await page.keyboard.press("Tab");await page.reload();
  await page.getByRole("button",{name:"Settings",exact:true}).click();await background();
  await expect(options.getByRole("button",{name:"Green",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("slider",{name:"Wallpaper visibility",exact:true})).toHaveValue("1");
  await target("Sidebar");await expect(options.getByRole("button",{name:"Dark Blue",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.locator(".global-wallpaper .artwork-current")).toHaveCSS("background-image",/green-bg.webp/);
});

test("fonts, Minecraft modes, ambient and reduced motion", async ({ page }) => {
  await page.locator(".settings-nav").getByRole("button",{name:"Typography",exact:true}).click();
  for (const name of ["Manrope", "Plus Jakarta Sans", "Rubik", "Monocraft", "Nunito"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-ui-font", name);
    expect(await page.evaluate(name => document.fonts.load(`600 14px "${name}"`).then(f => f.length), name)).toBeGreaterThan(0);
  }
  await page.getByRole("button", { name: "Monocraft", exact: true }).click();
  await page.getByRole("button", { name: "Full interface", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-minecraft", "full");
  await page.locator(".settings-nav").getByRole("button",{name:"Effects",exact:true}).click();
  await page.getByRole("button", { name: "Snow", exact: true }).click();
  await expect(page.locator(".ambient-particles i:visible")).toHaveCount(12);
  await page.getByRole("switch", { name: "Reduce motion", exact: true }).click();
  await expect(page.locator(".ambient-particles")).toBeHidden();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".ambient-particles")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ui-font", "Monocraft");
  await expect(page.locator("html")).toHaveAttribute("data-minecraft", "full");
  await expect(page.locator("html")).toHaveAttribute("data-ambient", "snow");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
});

test("theme-aware title bar, language and desktop geometry", async ({ page }) => {
  for (const mode of ["Light", "Dark", "AMOLED", "System"]) {
    await page.locator(".mode-grid").getByRole("button", { name: mode, exact: true }).click();
    await expect(page.locator(".preset-grid button.selected")).toHaveCount(1);
    await expect(page.locator(".window-titlebar")).toBeVisible();
    const light = await page.locator("html").getAttribute("data-mode") === "light";
    await expect(page.locator(".window-titlebar img")).toHaveAttribute("src", `/branding/canary-bird-${light ? "black" : "white"}.png`);
  }
  await page.locator(".settings-nav").getByRole("button", { name: "Language", exact: true }).click();
  await page.getByRole("button", { name: /Русский интерфейс/ }).click();
  await page.locator(".settings-nav").getByRole("button", { name: "Фон", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Фон лаунчера", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  for (const [width, height] of [[1280,720],[1440,900],[1920,1080],[800,600]]) {
    await page.setViewportSize({width,height});
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("Sakura pairs crossfade, persist and select automatic ambient without overriding explicit effects", async ({ page }) => {
  const section=(name:string)=>page.locator(".settings-nav").getByRole("button",{name,exact:true}).click();
  await section("Effects");await page.getByRole("button",{name:"Automatic",exact:true}).click();await section("Background");
  const options=page.locator('[data-visual-group="background"] .background-options');
  await page.getByRole("checkbox",{name:"Use one picture for launcher and sidebar"}).check();
  for(const number of [1,2]){
    await options.getByRole("button",{name:"Sakura "+number,exact:true}).click();
    await expect(page.locator(".global-wallpaper .artwork-current")).toHaveCSS("background-image",new RegExp("sakura"+number+"-bg.jpg"));
    await expect(page.locator(".sidebar-art .artwork-current")).toHaveCSS("background-image",new RegExp("sakura"+number+"-sidebar.jpg"));
    await expect(page.locator(".ambient-particles")).toHaveClass(/sakura/);
  }
  await page.reload();await page.getByRole("button",{name:"Settings",exact:true}).click();await section("Background");
  await expect(options.getByRole("button",{name:"Sakura 2",exact:true})).toHaveAttribute("aria-pressed","true");
  await section("Effects");await page.getByRole("button",{name:"Snow",exact:true}).click();await section("Background");
  await options.getByRole("button",{name:"Sakura 1",exact:true}).click();await expect(page.locator(".ambient-particles")).toHaveClass(/snow/);
  await page.getByRole("checkbox",{name:"Use one picture for launcher and sidebar"}).uncheck();
  await page.getByRole("group",{name:"Background target"}).getByRole("button",{name:"Sidebar",exact:true}).click();await options.getByRole("button",{name:"Gray",exact:true}).click();
  await page.reload();await expect(page.locator(".global-wallpaper .artwork-current")).toHaveCSS("background-image",/sakura1-bg.jpg/);
  await expect(page.locator(".sidebar-art .artwork-current")).toHaveCSS("background-image",/gray-sidebar.jpg/);
});

test("settings search finds Window and Effects, and appearance preferences persist",async({page})=>{
 const search=page.getByRole("searchbox",{name:"Search settings",exact:true});await search.fill("F11");await page.locator(".settings-results").getByRole("button",{name:/Window/}).click();
 await page.getByRole("combobox",{name:"Window controls style",exact:true}).click();await page.getByRole("option",{name:"Traffic Lights",exact:true}).click();
 await page.getByRole("combobox",{name:"Control position",exact:true}).click();await page.getByRole("option",{name:"Left",exact:true}).click();await expect(page.locator(".window-titlebar")).toHaveAttribute("data-controls","traffic-lights");await expect(page.locator(".window-titlebar")).toHaveAttribute("data-controls-position","left");
 await search.fill("Snow");await page.locator(".settings-results").getByRole("button",{name:/Effects/}).click();await page.getByRole("button",{name:"Autumn Leaves",exact:true}).click();
 for(const [preset,count] of [["Low",6],["Medium",12],["High",16]] as const){await page.getByRole("combobox",{name:"Effect preset",exact:true}).click();await page.getByRole("option",{name:preset,exact:true}).click();await expect(page.locator(".ambient-particles i:visible")).toHaveCount(count);}
 await page.reload();await expect(page.locator("html")).toHaveAttribute("data-ambient","autumn");await expect(page.locator(".window-titlebar")).toHaveAttribute("data-controls-position","left");
 await page.emulateMedia({reducedMotion:"reduce"});await expect(page.locator(".ambient-particles")).toHaveCount(0);
});

test("Hero rotates global backgrounds, pauses on hover and keeps manual controls in reduced motion",async({page})=>{
 await page.addInitScript(()=>localStorage.setItem("canary-visual",JSON.stringify({showHero:true})));await page.keyboard.press("Escape");await page.clock.install();await page.reload();await expect(page.locator(".hero-art .artwork-current")).toBeVisible();
 const artwork=page.locator(".hero-art .artwork-current");const first=await artwork.evaluate(e=>getComputedStyle(e).backgroundImage);expect(first).not.toMatch(/sidebar/);
 await page.clock.fastForward(9500);await expect.poll(()=>artwork.evaluate(e=>getComputedStyle(e).backgroundImage)).not.toBe(first);
 await page.locator(".home-hero").hover();const held=await artwork.evaluate(e=>getComputedStyle(e).backgroundImage);await page.clock.fastForward(20000);await expect(artwork).toHaveCSS("background-image",held);
 await page.emulateMedia({reducedMotion:"reduce"});await page.getByRole("button",{name:"Next background",exact:true}).click();await expect.poll(()=>artwork.evaluate(e=>getComputedStyle(e).backgroundImage)).not.toBe(held);
});

test("invalid saved material preferences clamp to readable supported settings",async({page})=>{
 await page.addInitScript(()=>localStorage.setItem("canary-visual",JSON.stringify({material:"impossible",surfaceOpacity:0,surfaceBlur:999,heroSpeed:-1,windowControls:"broken",ambient:"unknown"})));await page.reload();
 await expect(page.locator(".startup-splash")).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem("canary-visual")||"{}").surfaceOpacity)).toBe(20);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("canary-visual")||"{}"));expect(saved.material).toBe("solid");expect(saved.surfaceOpacity).toBe(20);expect(saved.surfaceBlur).toBe(32);expect(saved.heroSpeed).toBe(7);expect(saved.windowControls).toBe("windows");expect(saved.ambient).toBe("off");
});

test("light dialogs remain readable and low quality limits surface blur",async({page})=>{
 await page.addInitScript(()=>localStorage.setItem("canary-visual",JSON.stringify({quality:"low",surfaceBlur:32,surfaceOpacity:55})));
 await page.reload();await page.getByRole("button",{name:"Settings",exact:true}).click();
 await page.locator(".mode-grid").getByRole("button",{name:"Light",exact:true}).click();
 await expect(page.locator("html")).toHaveAttribute("data-mode","light");
 const alpha=async(selector:string)=>page.locator(selector).evaluate(e=>{const canvas=document.createElement("canvas");canvas.width=canvas.height=1;const context=canvas.getContext("2d")!;context.fillStyle=getComputedStyle(e).backgroundColor;context.fillRect(0,0,1,1);return context.getImageData(0,0,1,1).data[3]/255;});
 expect(await alpha(".settings-modal")).toBeGreaterThanOrEqual(.99);
 await expect(page.locator("html")).toHaveAttribute("data-quality","low");
 await expect(page.locator(".settings-modal")).toHaveCSS("backdrop-filter","none");
 await page.locator(".settings-nav").getByRole("button",{name:"Background",exact:true}).click();await page.getByText("Windows window material",{exact:true}).click();await page.getByRole("combobox",{name:"Background source",exact:true}).click();
 expect(await alpha("dialog.glass-select-popup[open]")).toBeGreaterThanOrEqual(.68);
 await page.keyboard.press("Escape");await expect(page.locator(".settings-modal")).toBeVisible();
});

