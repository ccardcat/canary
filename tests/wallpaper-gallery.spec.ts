import {test,expect} from "@playwright/test";
import {settingsSection} from "./helpers/settings";
import {nativeFixture} from "./helpers/nativeFixture";

test("Wallpaper gallery scrolls independently, expands all thumbnails and preserves selection",async({page})=>{
 await nativeFixture(page);await page.addInitScript(()=>localStorage.setItem('canary-visual',JSON.stringify({app:'meadow',backgroundSource:'canary',backgroundVersion:1})));
 await page.goto('/');await page.locator('.sidebar nav').getByRole('button',{name:'Settings',exact:true}).click();await settingsSection(page,'background');
 const gallery=page.getByRole('region',{name:'Wallpaper gallery'});await expect(gallery.locator('.background-options button')).toHaveCount(18);await expect(gallery.locator('.background-options')).toHaveText('');
 expect(await gallery.evaluate(element=>element.scrollHeight>element.clientHeight)).toBe(true);
 const contentScroll=await page.locator('.settings-content').evaluate(element=>element.scrollTop);await gallery.evaluate(element=>element.scrollTop=200);
 expect(await gallery.evaluate(element=>element.scrollTop)).toBeGreaterThan(0);expect(await page.locator('.settings-content').evaluate(element=>element.scrollTop)).toBe(contentScroll);
 await page.getByRole('button',{name:'Show all wallpapers',exact:true}).click();await expect.poll(()=>gallery.evaluate(element=>element.clientHeight)).toBeGreaterThan(236);
 await gallery.getByRole('button',{name:'Starlit Castle',exact:true}).click();await expect(gallery.getByRole('button',{name:'Starlit Castle',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Collapse gallery',exact:true}).click();await expect.poll(()=>gallery.evaluate(element=>element.clientHeight)).toBeLessThanOrEqual(236);
 await page.reload();await page.locator('.sidebar nav').getByRole('button',{name:'Settings',exact:true}).click();await settingsSection(page,'background');await expect(gallery.getByRole('button',{name:'Starlit Castle',exact:true})).toHaveAttribute('aria-pressed','true');
});

test("Custom wallpapers preserve manual and automatic particles, and snow has flake geometry",async({page})=>{
 await nativeFixture(page);await page.addInitScript(()=>{localStorage.setItem('canary-visual',JSON.stringify({app:'wallpaper-fixture',backgroundSource:'canary',ambient:'snow',backgroundVersion:1}));(globalThis as any).__customWallpapers=[{id:'wallpaper-fixture',name:'Custom fixture',target:'app',image:'custom.webp',thumbnail:'custom-thumb.webp'}];});
 await page.route('http://asset.localhost/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100" height="60" fill="#326d68"/></svg>'}));
 await page.goto('/');await expect(page.locator('.ambient-particles.snow i svg')).toHaveCount(24);
 const z=await page.evaluate(()=>({particles:Number(getComputedStyle(document.querySelector('.ambient-particles')!).zIndex),app:Number(getComputedStyle(document.querySelector('.canary-app')!).zIndex)}));expect(z.particles).toBeGreaterThan(z.app);
 await page.locator('.sidebar nav').getByRole('button',{name:'Settings',exact:true}).click();await settingsSection(page,'effects');
 for(const name of ['Sakura','Autumn Leaves','Automatic']){await page.getByRole('button',{name,exact:true}).click();await expect(page.locator('.ambient-particles')).toHaveClass(new RegExp(name==='Sakura'?'sakura':name==='Autumn Leaves'?'autumn':'snow'));}
 await settingsSection(page,'background');await expect(page.locator('.background-options').getByRole('button',{name:'Custom fixture',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.reload();await expect(page.locator('.ambient-particles.snow')).toHaveCount(1);await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.ambient-particles')).toHaveCount(0);
});
