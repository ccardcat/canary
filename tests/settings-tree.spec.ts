import {test,expect} from "@playwright/test";
import {nativeFixture} from "./helpers/nativeFixture";
import {settingsSection} from "./helpers/settings";
import {mkdirSync} from "node:fs";

test.beforeEach(async({page})=>{
  await nativeFixture(page);await page.goto("/");await page.locator(".sidebar nav").getByRole("button",{name:"Settings",exact:true}).click();
});
test("Settings groups expand smoothly, hide collapsed controls and search opens the right branch",async({page})=>{
  const visual=page.locator('[data-settings-group="visual"] .settings-group-toggle');
  await expect(visual).toHaveAttribute("aria-expanded","true");await visual.click();await expect(visual).toHaveAttribute("aria-expanded","false");await expect(page.locator('[data-settings-section="sidebar"]')).toBeHidden();
  await visual.focus();await page.keyboard.press("Enter");await expect(visual).toHaveAttribute("aria-expanded","true");
  await page.getByRole("searchbox",{name:"Search settings"}).fill("restore");const result=page.locator('[data-settings-result="advanced"]');await expect(result).toContainText("Game & files");await result.click();
  await expect(page.locator('[data-settings-group="game"] .settings-group-toggle')).toHaveAttribute("aria-expanded","true");await expect(page.locator('[data-settings-section="advanced"]')).toHaveAttribute("aria-current","page");await expect(page.getByRole("checkbox",{name:"Restore point before content changes"})).toBeVisible();
});
test("Solid sidebar color has no artwork, changes only the sidebar and survives reload",async({page})=>{
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem("canary-visual")!));
  await settingsSection(page,"sidebar");await page.getByRole("group",{name:"Sidebar background",exact:true}).getByRole("button",{name:/Custom color/}).click();
  await page.getByLabel("Sidebar color",{exact:true}).fill("#f5e8bd");await expect(page.locator(".sidebar-art")).toHaveCount(0);await expect(page.locator("html")).toHaveAttribute("data-sidebar-color-ink","dark");
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem("canary-visual")!));expect(after.app).toBe(before.app);expect(after.backgroundSource).toBe(before.backgroundSource);expect(after.globalTreatment).toEqual(before.globalTreatment);
  const fill=await page.locator(".sidebar").evaluate(element=>{const style=getComputedStyle(element,"::after");return {image:style.backgroundImage,color:style.backgroundColor};});expect(fill.image).toBe("none");expect(fill.color).not.toBe("rgba(0, 0, 0, 0)");
  await page.getByRole("slider",{name:"Sidebar background opacity"}).fill("75");await page.getByRole("slider",{name:"Sidebar background opacity"}).press("Tab");await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-sidebar-background","color");await page.locator(".sidebar nav").getByRole("button",{name:"Settings",exact:true}).click();await settingsSection(page,"sidebar");await expect(page.getByLabel("Sidebar color",{exact:true})).toHaveValue("#f5e8bd");await expect(page.getByRole("slider",{name:"Sidebar background opacity"})).toHaveValue("75");
});
test("Picture mode restores artwork from Solid material while preserving other surface styles",async({page})=>{
  await settingsSection(page,"materials");await page.getByRole("combobox",{name:"Material preset",exact:true}).click();await page.getByRole("option",{name:"Solid",exact:true}).click();
  await settingsSection(page,"sidebar");await page.getByRole("group",{name:"Sidebar background",exact:true}).getByRole("button",{name:/Picture/}).click();
  await expect(page.locator(".sidebar-art")).toHaveCount(1);await expect(page.locator("html")).toHaveAttribute("data-material-cards","solid");await expect(page.locator("html")).toHaveAttribute("data-material-buttons","solid");await expect(page.locator("html")).toHaveAttribute("data-material-sidebar","vibrancy");
  await page.getByRole("group",{name:"Sidebar background",exact:true}).getByRole("button",{name:/Theme color/}).click();await expect(page.locator(".sidebar-art")).toHaveCount(0);
});
test("All visual pages fit narrow RU/EN windows, and reduced motion disables branch animation",async({page})=>{
  test.setTimeout(90000);mkdirSync(".qa/settings-tree",{recursive:true});await page.emulateMedia({reducedMotion:"reduce"});
  for(const language of ["en","ru"]){
    if(language==="ru"){await settingsSection(page,"language");await page.getByRole("button",{name:/Русский интерфейс/}).click();}
    for(const width of [1280,760,520]){
      await page.setViewportSize({width,height:720});
      for(const id of ["appearance","materials","background","sidebar","layout","typography","effects","window","quality"]){await settingsSection(page,id);expect(await page.locator(".settings-modal").evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);expect(await page.locator(".settings-content").evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);}
      await settingsSection(page,"sidebar");await page.screenshot({path:`.qa/settings-tree/${language}-${width}.png`});
    }
  }
  const duration=await page.locator(".settings-branch").first().evaluate(element=>getComputedStyle(element).transitionDuration);expect(duration.split(",").every(value=>Number.parseFloat(value)===0)).toBe(true);
});
