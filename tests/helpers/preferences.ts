import type {Page} from '@playwright/test';

// Set the fixture before the next renderer mounts and reads localStorage.
export async function reloadWithSeed(page:Page,source:string){
  await page.evaluate(source);
  await page.reload();
}

export async function reloadWithPreferences(page:Page,patch:Record<string,unknown>){
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('canary-visual')||'{}'));
  await reloadWithSeed(page,`localStorage.setItem('canary-visual',${JSON.stringify(JSON.stringify({...saved,...patch}))})`);
}
