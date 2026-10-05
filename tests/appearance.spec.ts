import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://api.modrinth.com/**", route => route.fulfill({ json: { hits: [], total_hits: 0 } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
});

test("interface scale updates centrally and persists independently of font family",async({page})=>{
 for(const font of ["Nunito","Monocraft"]){
  await page.locator(".font-options").getByRole("button",{name:font,exact:true}).click();
  if(font==="Monocraft")await page.getByRole("button",{name:"Full interface",exact:true}).click();
  for(const scale of [90,100,110,120]){
   await page.getByRole("button",{name:`${scale}%`,exact:true}).click();
   await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue("--ui-font-scale").trim())).toBe(String(scale/100));
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
 }
 await page.reload();await page.getByRole("button",{name:"Settings",exact:true}).click();
 await expect(page.getByRole("button",{name:"120%",exact:true})).toHaveAttribute("aria-pressed","true");
 await expect(page.locator(".font-options").getByRole("button",{name:"Monocraft",exact:true})).toHaveAttribute("aria-pressed","true");
 await page.locator(".settings-nav").getByRole("button",{name:"Language",exact:true}).click();
 await page.getByRole("button",{name:/Русский интерфейс/}).click();
 await page.locator(".settings-nav").getByRole("button",{name:"Оформление",exact:true}).click();
 await expect(page.locator(".visual-preferences[data-visual-group]")).toContainText("Размер интерфейса");
 for(const font of ["Nunito","Monocraft"]){await page.locator(".font-options").getByRole("button",{name:font,exact:true}).click();for(const scale of [90,100,110,120]){await page.getByRole("button",{name:`${scale}%`,exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}}
 await expect(page.locator(".settings-modal")).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("background pairing, independent selections and restart persistence", async ({ page }) => {
  const options = page.locator(".background-options");
  for (const name of ["Normal", "Dark Blue", "Gray", "Green", "Sakura 1", "Sakura 2"]) {
    await options.nth(0).getByRole("button", { name, exact: true }).click();
    await expect(options.nth(0).getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".global-wallpaper")).toHaveCount(name === "Normal" ? 0 : 1);
  }
  for (const name of ["Default", "Dark Blue", "Gray", "Green", "Sakura 1", "Sakura 2"]) {
    await options.nth(1).getByRole("button", { name, exact: true }).click();
    await expect(options.nth(1).getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await options.nth(0).getByRole("button", { name: "Green", exact: true }).click();
  await page.getByRole("switch", { name: "Link backgrounds" }).click();
  await expect(options.nth(1).getByRole("button", { name: "Green", exact: true })).toHaveAttribute("aria-pressed", "true");
  await options.nth(1).getByRole("button", { name: "Dark Blue" }).click();
  await expect(options.nth(0).getByRole("button", { name: "Dark Blue" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("switch", { name: "Link backgrounds" }).click();
  await options.nth(0).getByRole("button", { name: "Green", exact: true }).click();
  await page.getByText("Advanced background controls", { exact: true }).click();
  await page.getByRole("slider", { name: "Intensity", exact: true }).focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(options.nth(0).getByRole("button", { name: "Green", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(options.nth(1).getByRole("button", { name: "Dark Blue" })).toHaveAttribute("aria-pressed", "true");
  await page.getByText("Advanced background controls", { exact: true }).click();
  await expect(page.getByRole("slider", { name: "Intensity", exact: true })).toHaveValue("1");
  await expect(page.locator(".global-wallpaper .artwork-current")).toHaveCSS("background-image", /green-bg.webp/);
});

test("fonts, Minecraft modes, ambient and reduced motion", async ({ page }) => {
  for (const name of ["Manrope", "Plus Jakarta Sans", "Rubik", "Monocraft", "Nunito"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-ui-font", name);
    expect(await page.evaluate(name => document.fonts.load(`600 14px "${name}"`).then(f => f.length), name)).toBeGreaterThan(0);
  }
  await page.getByRole("button", { name: "Monocraft", exact: true }).click();
  await page.getByRole("button", { name: "Full interface", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-minecraft", "full");
  await page.getByRole("button", { name: "Snow", exact: true }).click();
  await expect(page.locator(".ambient-particles i")).toHaveCount(12);
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
    await expect(page.locator(".window-titlebar")).toBeVisible();
    const light = await page.locator("html").getAttribute("data-mode") === "light";
    await expect(page.locator(".window-titlebar img")).toHaveAttribute("src", `/branding/canary-bird-${light ? "black" : "white"}.png`);
  }
  await page.locator(".settings-nav").getByRole("button", { name: "Language", exact: true }).click();
  await page.getByRole("button", { name: /Русский интерфейс/ }).click();
  await page.locator(".settings-nav").getByRole("button", { name: "Оформление", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Фон приложения", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  for (const [width, height] of [[1280,720],[1440,900],[1920,1080],[800,600]]) {
    await page.setViewportSize({width,height});
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("Sakura pairs crossfade, persist and select automatic ambient without overriding explicit effects", async ({ page }) => {
  const options = page.locator(".background-options");
  await page.getByRole("switch", {name:"Link backgrounds"}).click();
  await page.getByRole("button", {name:"Automatic",exact:true}).click();
  for (const number of [1,2]) {
    await options.first().getByRole("button", {name:`Sakura ${number}`,exact:true}).click();
    await expect(options.nth(1).getByRole("button", {name:`Sakura ${number}`,exact:true})).toHaveAttribute("aria-pressed","true");
    await expect(page.locator(".global-wallpaper .artwork-current")).toHaveCSS("background-image",new RegExp(`sakura${number}-bg.jpg`));
    await expect(page.locator(".sidebar-art .artwork-current")).toHaveCSS("background-image",new RegExp(`sakura${number}-sidebar.jpg`));
    await expect(page.locator(".ambient-particles")).toHaveClass(/sakura/);
  }
  await page.reload();
  await page.getByRole("button", {name:"Settings",exact:true}).click();
  await expect(options.first().getByRole("button",{name:"Sakura 2",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(options.nth(1).getByRole("button",{name:"Sakura 2",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button", {name:"Snow",exact:true}).click();
  await options.first().getByRole("button",{name:"Sakura 1",exact:true}).click();
  await expect(page.locator(".ambient-particles")).toHaveClass(/snow/);
  await page.getByRole("switch", {name:"Link backgrounds"}).click();
  await options.nth(1).getByRole("button",{name:"Gray",exact:true}).click();
  await page.reload();
  await expect(page.locator(".global-wallpaper .artwork-current")).toHaveCSS("background-image",/sakura1-bg.jpg/);
  await expect(page.locator(".sidebar-art .artwork-current")).toHaveCSS("background-image",/gray-sidebar.jpg/);
});


test("settings search finds Window and Effects, and appearance preferences persist",async({page})=>{
 const search=page.getByRole("searchbox",{name:"Search settings",exact:true});await search.fill("F11");await page.locator(".settings-results").getByRole("button",{name:/Window/}).click();
 await page.getByRole("combobox",{name:"Window controls style",exact:true}).click();await page.getByRole("option",{name:"Traffic Lights",exact:true}).click();
 await page.getByRole("combobox",{name:"Control position",exact:true}).click();await page.getByRole("option",{name:"Left",exact:true}).click();await expect(page.locator(".window-titlebar")).toHaveAttribute("data-controls","traffic-lights");await expect(page.locator(".window-titlebar")).toHaveAttribute("data-controls-position","left");
 await search.fill("Snow");await page.locator(".settings-results").getByRole("button",{name:/Effects/}).click();await page.getByRole("button",{name:"Autumn Leaves",exact:true}).click();
 for(const [preset,count] of [["Low",6],["Medium",12],["High",16]] as const){await page.getByRole("combobox",{name:"Effect preset",exact:true}).click();await page.getByRole("option",{name:preset,exact:true}).click();await expect(page.locator(".ambient-particles i")).toHaveCount(count);}
 await page.reload();await expect(page.locator("html")).toHaveAttribute("data-ambient","autumn");await expect(page.locator(".window-titlebar")).toHaveAttribute("data-controls-position","left");
 await page.emulateMedia({reducedMotion:"reduce"});await expect(page.locator(".ambient-particles")).toHaveCount(0);
});

test("Hero rotates global backgrounds, pauses on hover and keeps manual controls in reduced motion",async({page})=>{
 await page.keyboard.press("Escape");await page.clock.install();await page.reload();await expect(page.locator(".hero-art .artwork-current")).toBeVisible();
 const artwork=page.locator(".hero-art .artwork-current");const first=await artwork.evaluate(e=>getComputedStyle(e).backgroundImage);expect(first).not.toMatch(/sidebar/);
 await page.clock.fastForward(9500);await expect.poll(()=>artwork.evaluate(e=>getComputedStyle(e).backgroundImage)).not.toBe(first);
 await page.locator(".home-hero").hover();const held=await artwork.evaluate(e=>getComputedStyle(e).backgroundImage);await page.clock.fastForward(20000);await expect(artwork).toHaveCSS("background-image",held);
 await page.emulateMedia({reducedMotion:"reduce"});await page.getByRole("button",{name:"Next background",exact:true}).click();await expect.poll(()=>artwork.evaluate(e=>getComputedStyle(e).backgroundImage)).not.toBe(held);
});

test("invalid saved material preferences clamp to readable supported settings",async({page})=>{
 await page.evaluate(()=>localStorage.setItem("canary-visual",JSON.stringify({material:"impossible",surfaceOpacity:0,surfaceBlur:999,heroSpeed:-1,windowControls:"broken",ambient:"unknown"})));await page.reload();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("canary-visual")||"{}"));expect(saved.material).toBe("solid");expect(saved.surfaceOpacity).toBe(55);expect(saved.surfaceBlur).toBe(32);expect(saved.heroSpeed).toBe(7);expect(saved.windowControls).toBe("windows");expect(saved.ambient).toBe("off");
});
