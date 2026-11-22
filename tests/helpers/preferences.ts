import type {Page} from '@playwright/test';

// Seed the new document after pagehide flushes the old renderer's preferences.
// Remove the initializer so subsequent reloads test real persisted settings.
export async function reloadWithSeed(page:Page,source:string){
  const session=await page.context().newCDPSession(page);
  const {identifier}=await session.send('Page.addScriptToEvaluateOnNewDocument',{source});
  try{await page.reload();}
  finally{await session.send('Page.removeScriptToEvaluateOnNewDocument',{identifier});await session.detach();}
}

export async function reloadWithPreferences(page:Page,patch:Record<string,unknown>){
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('canary-visual')||'{}'));
  await reloadWithSeed(page,`localStorage.setItem('canary-visual',${JSON.stringify(JSON.stringify({...saved,...patch}))})`);
}
