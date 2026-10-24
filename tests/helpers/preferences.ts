import type {Page} from '@playwright/test';

// Seed the new document after pagehide flushes the old renderer's preferences.
// Remove the initializer so subsequent reloads test real persisted settings.
export async function reloadWithSeed(page:Page,source:string){
  const marker=`canary-test-seed-${crypto.randomUUID()}`;
  // Browser init scripts work across Chromium builds. A session marker makes
  // each initializer run only once, so later reloads test saved preferences.
  await page.addInitScript({content:`if(!sessionStorage.getItem(${JSON.stringify(marker)})){sessionStorage.setItem(${JSON.stringify(marker)},'applied');${source}}`});
  await page.reload();
}

export async function reloadWithPreferences(page:Page,patch:Record<string,unknown>){
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('canary-visual')||'{}'));
  await reloadWithSeed(page,`localStorage.setItem('canary-visual',${JSON.stringify(JSON.stringify({...saved,...patch}))})`);
}
