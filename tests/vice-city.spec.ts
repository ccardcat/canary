import {expect,test} from "@playwright/test";
import {nativeFixture} from "./helpers/nativeFixture";
import {settingsSection} from "./helpers/settings";

test.beforeEach(async ({page})=> {
  await page.emulateMedia({reducedMotion:"reduce"});
});

test("Vice City applies a full look, follows its wallpaper and restores the previous look", async ({page})=>{
  await page.addInitScript(()=>{
    if (!localStorage.getItem("canary-mode")) {
      localStorage.setItem("canary-mode","light");
      localStorage.setItem("canary-visual",JSON.stringify({reduceTransparency:true,buttonStyle:"retro"}));
    }
  });
  await page.goto("/");
  const html=page.locator("html");
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  await page.getByRole("button",{name:"Apply Vice City theme"}).click();
  await expect(html).toHaveAttribute("data-preset","viceCity");
  await expect(html).toHaveAttribute("data-button-style","neon");
  await expect(html).toHaveAttribute("data-reduce-transparency","true");
  await page.keyboard.press("Escape");
  await expect(page.locator(".global-wallpaper .artwork-current")).toHaveCSS("background-image",/vice-city\.webp/);
  await expect(page.locator(".hero-art .artwork-current")).toHaveCSS("background-image",/vice-city\.webp/);
  await expect(page.locator(".hero-carousel-controls")).toHaveCount(0);
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  await page.getByRole("button",{name:"Restore previous look"}).click();
  await expect(html).toHaveAttribute("data-mode","light");
  await expect(html).toHaveAttribute("data-button-style","retro");
  await expect(html).toHaveAttribute("data-reduce-transparency","true");
  await page.getByRole("button",{name:"Apply Vice City theme"}).click();
  await page.reload();
  await expect(html).toHaveAttribute("data-preset","viceCity");
  await expect(page.locator(".hero-art .artwork-current")).toHaveCSS("background-image",/vice-city\.webp/);
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  await settingsSection(page,"Background");
  await page.getByRole("switch",{name:"Use launcher wallpaper in Home banner"}).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".hero-carousel-controls")).toBeVisible();
});

test("button styles change real controls and travel in appearance profiles", async ({page})=>{
  await page.setViewportSize({width:500,height:430});
  await page.goto("/");
  const html=page.locator("html");
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  await settingsSection(page,"buttonStyles");
  const group=page.getByRole("group",{name:"Button style"});
  const shapes=[["Capsules","999px"],["Frosted glass","16px"],["Outline","8px"],["Retro","4px"],["Neon","12px 4px"]];
  for (const [title,radius] of shapes) {
    const choice=group.getByRole("button",{name:title,exact:true});
    await choice.click();
    await expect(choice).toHaveAttribute("aria-pressed","true");
    await expect(page.getByRole("button",{name:"Quick search"})).toHaveCSS("border-radius",radius);
  }
  expect(await page.locator(".settings-content").evaluate(node=>node.scrollWidth-node.clientWidth)).toBeLessThanOrEqual(1);
  await settingsSection(page,"appearanceProfiles");
  await page.getByLabel("Look name").fill("Custom Neon");
  await page.getByRole("button",{name:"Save current look"}).click();
  await page.getByRole("button",{name:"Export look: Custom Neon"}).click();
  const profile=JSON.parse(await page.getByLabel("Look JSON").inputValue());
  expect(profile.visual.buttonStyle).toBe("neon");
  await settingsSection(page,"buttonStyles");
  await group.getByRole("button",{name:"Classic",exact:true}).click();
  await expect(html).toHaveAttribute("data-button-style","classic");
  await settingsSection(page,"appearanceProfiles");
  await page.getByRole("button",{name:"Apply look: Custom Neon"}).click();
  await expect(html).toHaveAttribute("data-button-style","neon");
});

test("the library remembers filters on request and copies a public instance summary",async ({page,context})=>{
  await context.grantPermissions(["clipboard-read","clipboard-write"]);
  await nativeFixture(page);
  await page.goto("/");
  const library=page.locator(".sidebar").getByRole("button",{name:"Library",exact:true});
  const cards=page.locator(".instance-card");
  const openFilters=()=>page.locator(".library-filters summary").click();
  await library.click();
  await expect(cards).toHaveCount(9);
  await openFilters();
  await page.getByRole("checkbox",{name:"Needs attention"}).check();
  await page.getByRole("checkbox",{name:"Remember filters"}).check();
  await page.reload();
  await library.click();
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText("Canary world 2");
  await openFilters();
  await expect(page.getByRole("checkbox",{name:"Remember filters"})).toBeChecked();
  await page.getByRole("checkbox",{name:"Remember filters"}).uncheck();
  await page.reload();
  await library.click();
  await expect(cards).toHaveCount(9);
  await cards.first().getByRole("button",{name:"Details"}).click();
  const surface=page.locator(".instance-surface");
  await surface.locator("summary").getByText("Instance summary").click();
  const summary=await surface.getByRole("textbox",{name:"Instance summary"}).inputValue();
  expect(summary).toContain("Instance: Fabulously Optimized");
  expect(summary).toContain("Minecraft: 1.21.1");
  expect(summary).toContain("Loader: fabric");
  expect(summary).not.toMatch(/C:\/Canary|LicensedPlayer/);
  await surface.getByRole("button",{name:"Copy summary"}).click();
  await expect(surface.getByRole("status")).toContainText("Summary copied.");
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(summary);
});
