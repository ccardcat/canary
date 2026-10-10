import {settingsSection} from "./helpers/settings";
import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";
test("Card layout choices align by row in RU/EN; the sidebar has its own page and keeps its selection",async({page})=>{
 mkdirSync(".qa/layout-controls",{recursive:true});
 await page.route("https://api.modrinth.com/**",r=>r.fulfill({json:{hits:[],total_hits:0}}));
 await page.emulateMedia({reducedMotion:"reduce"});
 await page.goto("/");await page.getByRole("button",{name:"Settings",exact:true}).click();
 await settingsSection(page,"layout");
 const grid=page.locator(".material-layout-controls");
 for(const language of ["en","ru"]){
  if(language==="ru"){
   await settingsSection(page,"Language");
   await page.getByRole("button",{name:/Русский интерфейс/}).click();
   await settingsSection(page,"layout");
  }
  for(const width of [1280,1000,760]){
   await page.setViewportSize({width,height:800});await grid.scrollIntoViewIfNeeded();
   const controls=grid.getByRole("combobox");
   await expect(controls).toHaveCount(3);
   for(const [a,b] of [[0,1]]){
    await expect.poll(async()=>{const x=(await controls.nth(a).boundingBox())!,y=(await controls.nth(b).boundingBox())!;return Math.abs(x.y-y.y);}).toBeLessThan(1);
    const x=(await controls.nth(a).boundingBox())!,y=(await controls.nth(b).boundingBox())!;
    expect(Math.abs(x.width-y.width)).toBeLessThan(1);
    expect(y.x).toBeGreaterThan(x.x+x.width);
   }
   expect(await grid.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
   await page.waitForTimeout(200);await grid.screenshot({path:".qa/layout-controls/"+language+"-"+width+".png"});
  }
 }
 await settingsSection(page,"sidebar");
 const sidebar=grid.getByRole("combobox",{name:"Расположение боковой панели",exact:true});
 await sidebar.click();await page.getByRole("option",{name:"Плавающая",exact:true}).click();
 await page.reload();await page.getByRole("button",{name:"Настройки",exact:true}).click();await settingsSection(page,"sidebar");
 await expect(grid.getByRole("combobox",{name:"Расположение боковой панели",exact:true})).toContainText("Плавающая");
});
