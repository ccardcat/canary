import {expect,test,type Page} from "@playwright/test";
import {nativeFixture} from "./helpers/nativeFixture";
import {settingsSection} from "./helpers/settings";

const search = (page:Page) => page.getByRole("combobox",{name:"Find in Canary"});

test.beforeEach(async ({page}) => {
  await page.emulateMedia({reducedMotion:"reduce"});
});

test("named looks switch theme and heading font with undo and keep accessibility preferences", async ({page}) => {
  await page.goto("/");
  const html=page.locator("html");
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  await page.locator(".mode-grid").getByRole("button",{name:"Light",exact:true}).click();
  await settingsSection(page,"Typography");
  await page.getByRole("combobox",{name:"Heading font"}).click();
  await page.getByRole("option",{name:"Rubik",exact:true}).click();
  await expect(page.locator(".typography-preview h4")).toHaveCSS("font-family",/^Rubik/);
  await expect(page.locator(".typography-preview p")).toHaveCSS("font-family",/^Nunito/);
  await settingsSection(page,"appearanceProfiles");
  await page.getByLabel("Look name").fill("Sunrise");
  await page.getByRole("button",{name:"Save current look"}).click();
  await expect(page.getByRole("status")).toHaveText("Look saved.");

  await settingsSection(page,"Appearance");
  await page.locator(".mode-grid").getByRole("button",{name:"Dark",exact:true}).click();
  await settingsSection(page,"Effects");
  const motion=page.getByRole("switch",{name:"Reduce motion"});
  await motion.click();
  await expect(motion).toHaveAttribute("aria-checked","true");

  await page.keyboard.press("Control+k");
  await expect(search(page)).toBeFocused();
  await search(page).fill("Sunrise");
  await search(page).press("Enter");
  await expect(html).toHaveAttribute("data-mode","light");
  await expect(motion).toHaveAttribute("aria-checked","true");

  await page.keyboard.press("Control+k");
  await search(page).fill("Sunrise");
  await search(page).press("Enter");
  await expect(html).toHaveAttribute("data-mode","light");

  await page.keyboard.press("Control+k");
  await search(page).fill("undo look");
  await search(page).press("Enter");
  await expect(html).toHaveAttribute("data-mode","dark");
  await page.reload();
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  await settingsSection(page,"appearanceProfiles");
  await page.getByRole("button",{name:"Apply look: Sunrise"}).click();
  await expect(html).toHaveAttribute("data-heading-font","Rubik");
  await expect(page.locator(".appearance-profile-card")).toHaveAttribute("data-active","true");
});

test("look JSON carries visual choices and ignores unrelated settings during import", async ({page}) => {
  await page.setViewportSize({width:520,height:420});
  await page.goto("/");
  await page.getByRole("button",{name:"Quick search"}).click();
  await search(page).fill("my looks");
  await search(page).press("Enter");
  await page.getByLabel("Look name").fill("Original");
  await page.getByRole("button",{name:"Save current look"}).click();
  await page.getByRole("button",{name:"Export look: Original"}).click();
  const json=page.getByLabel("Look JSON");
  const profile=JSON.parse(await json.inputValue());
  expect(profile).toMatchObject({format:"canary-appearance",version:1,name:"Original"});
  expect(profile.visual).not.toHaveProperty("focus");
  expect(profile.visual).not.toHaveProperty("reduceTransparency");
  await json.fill("{broken");
  await page.getByRole("button",{name:"Import look"}).click();
  await expect(page.getByRole("alert")).toContainText("file format");
  profile.name="Imported";
  Object.assign(profile.visual,{
    focus:true,reduceTransparency:true,headingFont:"system",
    materialPreset:"constructor",sidebarMode:["floating"],
  });
  await json.fill(JSON.stringify(profile));
  await page.getByRole("button",{name:"Import look"}).click();
  await page.getByRole("button",{name:"Apply look: Imported"}).click();
  await expect(page.locator("html")).toHaveAttribute("data-focus","false");
  await expect(page.locator("html")).toHaveAttribute("data-heading-font","system");
  await expect(page.locator("html")).toHaveAttribute("data-material-preset","canary");
  await expect(page.locator("html")).toHaveAttribute("data-sidebar-mode","attached");
  await expect.poll(() => page.evaluate(() => {
    const preferences=JSON.parse(localStorage.getItem("canary-visual") || "{}");
    return preferences.reduceTransparency;
  })).toBe(false);
  const horizontalOverflow=await page.locator(".settings-content").evaluate(content=>content.scrollWidth-content.clientWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});

test("quick search navigates with the keyboard and opens instance settings without launching", async ({page}) => {
  await nativeFixture(page);
  await page.goto("/");
  const trigger=page.getByRole("button",{name:"Quick search"});
  await trigger.click();
  await expect(search(page)).toBeFocused();
  const choices=page.getByRole("listbox",{name:"Results"}).getByRole("option");
  await search(page).press("ArrowDown");
  await expect(choices.nth(1)).toHaveAttribute("aria-selected","true");
  await search(page).press("Escape");
  await expect(page.getByRole("dialog",{name:"Quick search"})).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Control+k");
  await search(page).fill("heading font");
  await expect(choices.first()).toContainText("Typography");
  await search(page).press("Enter");
  await expect(page.getByRole("combobox",{name:"Heading font"})).toBeVisible();

  await page.keyboard.press("Control+k");
  await search(page).fill("Fabulously Optimized");
  await expect(choices.first()).toContainText("Fabulously Optimized");
  await search(page).press("Enter");
  await expect(page.locator(".instance-surface")).toHaveAttribute("aria-label",/Fabulously Optimized/);
  const commands=await page.evaluate(()=>(window as unknown as {
    __materialQA:{calls:{command:string}[]};
  }).__materialQA.calls.map(call=>call.command));
  expect(commands).not.toContain("launch_instance");
  expect(commands).not.toContain("install_modpack");
});

test("instance filters narrow the local library and can be cleared", async ({page}) => {
  await nativeFixture(page);
  await page.goto("/");
  await page.getByRole("button",{name:"Library",exact:true}).click();
  const cards=page.locator(".instance-card");
  await expect(cards).toHaveCount(9);
  await page.getByText("Instance filters",{exact:true}).click();
  await page.getByRole("combobox",{name:"Filter by Minecraft version"}).click();
  await page.getByRole("option",{name:"1.21.1",exact:true}).click();
  await page.getByRole("combobox",{name:"Filter by loader"}).click();
  await page.getByRole("option",{name:"fabric",exact:true}).click();
  await page.getByRole("checkbox",{name:"Needs attention"}).check();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Canary world 2");
  await page.getByRole("button",{name:"Clear instance filters"}).click();
  await expect(cards).toHaveCount(9);
});
