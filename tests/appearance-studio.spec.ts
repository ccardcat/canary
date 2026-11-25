import {expect, test} from "@playwright/test";
import {settingsSection} from "./helpers/settings";

test("system theme remembers both palettes and derives a readable custom accent", async ({page}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("canary-mode")) {
      localStorage.setItem("canary-mode", "system");
      localStorage.setItem("canary-preset", "midnight");
    }
  });
  await page.emulateMedia({colorScheme:"dark",reducedMotion:"reduce"});
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-preset", "midnight");
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  await page.getByLabel("Custom accent").fill("#111112");
  await expect(html).toHaveAttribute("data-accent","custom");
  const darkAccent = await html.evaluate(el => getComputedStyle(el).getPropertyValue("--chosen-accent"));
  expect(darkAccent).not.toBe("#111112");

  await page.emulateMedia({colorScheme:"light"});
  await page.locator(".preset-grid").getByRole("button", {name:"Frost",exact:true}).click();
  await expect(html).toHaveAttribute("data-preset","frost");
  await expect.poll(() => html.evaluate(el => getComputedStyle(el).getPropertyValue("--chosen-accent"))).toBe("#111112");
  await page.emulateMedia({colorScheme:"dark"});
  await expect(html).toHaveAttribute("data-preset","midnight");
  await page.reload();
  await page.emulateMedia({colorScheme:"light"});
  await expect(html).toHaveAttribute("data-preset","frost");
  await expect(html).toHaveAttribute("data-accent","custom");
});

test("scenes undo appearance changes and motion preferences respect reduced motion", async ({page}) => {
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/");
  const html = page.locator("html");
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  await page.getByRole("button",{name:"Starlit Castle",exact:true}).click();
  await expect(html).toHaveAttribute("data-material-preset","glass");
  await expect(page.locator(".global-wallpaper .artwork-current")).toHaveCSS("background-image",/starlit-castle/);
  await expect(page.locator(".ambient-particles")).toHaveCount(0);
  await page.getByRole("button",{name:"Undo scene",exact:true}).click();
  await expect(html).toHaveAttribute("data-background-source","solid");

  await settingsSection(page,"Effects");
  await page.getByRole("button",{name:"Expressive",exact:true}).click();
  await expect(html).toHaveAttribute("data-navigation-motion","expressive");
  await expect(page.locator(".settings-section-entry")).toHaveCSS("animation-name","none");

  await settingsSection(page,"Typography");
  await page.getByRole("button",{name:"System font",exact:true}).click();
  await expect(page.locator(".typography-preview h4")).toHaveCSS("font-family",/^system-ui/);
  await page.reload();
  await expect(html).toHaveAttribute("data-ui-font","system");
});
