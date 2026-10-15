import {test,expect,type Page} from "@playwright/test";
import {nativeFixture} from "./helpers/nativeFixture";
import {settingsSection} from "./helpers/settings";

const id="d7bb8754-2485-49c6-a41f-c228e927a941";
async function library(page:Page){
 await page.evaluate(id=>{
  const qa=(globalThis as any).__materialQA;
  qa.overrides={...qa.overrides,
   list_fonts:()=>JSON.parse(localStorage.getItem("qa-font-library")||"[]"),
   import_font:()=>{const font={id,name:"My typeface",path:"C:/Isolated/fonts/"+id+".otf"};localStorage.setItem("qa-font-library",JSON.stringify([font]));return font;},
   remove_font:()=>localStorage.setItem("qa-font-library","[]"),
  };
 },id);
}
test("custom TTF/OTF selection loads real font bytes, persists, and removal restores a built-in font",async({page})=>{
 test.setTimeout(60000);await nativeFixture(page);await page.emulateMedia({reducedMotion:"reduce"});
 await page.route("http://asset.localhost/**",async route=>{const response=await page.request.get("http://127.0.0.1:1420/Monocraft.ttf");await route.fulfill({response});});
 await page.goto("/");await library(page);
 await page.locator(".sidebar").getByRole("button",{name:"Settings",exact:true}).click();await settingsSection(page,"Typography");
 await page.getByRole("button",{name:"Add font",exact:true}).click();
 await expect(page.locator("html")).toHaveAttribute("data-ui-font","custom:"+id);
 expect(await page.evaluate(id=>document.fonts.check('14px "CanaryUser-'+id+'"'),id)).toBe(true);
 await expect(page.getByRole("button",{name:"My typeface",exact:true})).toHaveAttribute("aria-pressed","true");
 await page.reload();await library(page);
 await expect(page.locator("html")).toHaveAttribute("data-ui-font","custom:"+id);
 await expect.poll(()=>page.evaluate(id=>[...document.fonts].some(font=>font.family==="CanaryUser-"+id&&font.status==="loaded"),id)).toBe(true);
 await page.locator(".sidebar").getByRole("button",{name:"Settings",exact:true}).click();await settingsSection(page,"Typography");
 await page.getByRole("button",{name:"Remove font My typeface",exact:true}).click();
 await expect(page.locator("html")).toHaveAttribute("data-ui-font","Nunito");
 await expect(page.getByRole("button",{name:"My typeface",exact:true})).toHaveCount(0);
});

test("a rejected custom font leaves the built-in interface usable",async({page})=>{
 await nativeFixture(page);await page.goto("/");await library(page);
 await page.route("http://asset.localhost/**",route=>route.fulfill({status:200,body:"invalid font bytes"}));
 await page.locator(".sidebar").getByRole("button",{name:"Settings",exact:true}).click();await settingsSection(page,"Typography");
 await page.getByRole("button",{name:"Add font",exact:true}).click();
 await expect(page.locator(".custom-font-library [role=alert]")).toBeVisible();
 await expect(page.locator("html")).toHaveAttribute("data-ui-font","Nunito");
 await page.locator(".font-options").getByRole("button",{name:"Rubik",exact:true}).click();
 await expect(page.locator("html")).toHaveAttribute("data-ui-font","Rubik");
});
