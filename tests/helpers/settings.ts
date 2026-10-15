import {expect,type Page} from "@playwright/test";

// Keep tests independent of translated navigation copy and collapsed groups.
const aliases:Record<string,string>={cursor:"layout",Cursor:"layout",Appearance:"appearance",Оформление:"appearance",Materials:"materials",Background:"background",Фон:"background",Sidebar:"sidebar",Layout:"layout",Typography:"typography",Типографика:"typography",Effects:"effects",Эффекты:"effects",Window:"window",Окно:"window",Advanced:"advanced",Canary:"minecraft",Minecraft:"minecraft",Downloads:"downloads",Storage:"storage",Account:"accountSettings",Language:"language",Discord:"discord",About:"about"};
export async function settingsSection(page:Page,name:string) {
  const id=aliases[name]??name;
  const button=page.locator(`.settings-nav [data-settings-section="${id}"]`);
  const toggle=button.locator("xpath=ancestor::*[@data-settings-group]").locator(".settings-group-toggle");
  if(await toggle.getAttribute("aria-expanded")==="false")await toggle.click();
  await button.click();
  const content=page.locator(`.settings-content>[data-settings-content="${id}"]`);
  await expect(content).toBeVisible();
  await expect(content).toHaveAttribute("aria-hidden","false");
  await expect(content).toHaveCSS("opacity","1");
}
