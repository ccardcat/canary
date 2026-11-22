import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
test.beforeEach(async({page})=>{await page.route('https://api.modrinth.com/**',route=>route.fulfill({json:{hits:[],total_hits:0}}));await page.goto('/');});
test('real HTML and Markdown rendering reject executable provider content and unsafe image/link URLs',async({page})=>{
 await page.evaluate(async()=>{
  const React=(await import('/node_modules/.vite/deps/react.js')).default;const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;const {default:Markdown}=await import('/src/components/Markdown.tsx');
  const html='<h2>Readable provider description</h2><script>window.__securityXss=true</script><img src="asset://localhost/scoped-private-screenshot.png"><img src="http://asset.localhost/scoped-private-screenshot.png"><img src="/branding/canary-bird-black.png"><img src="https://127.0.0.1/private" onerror="window.__securityXss=true"><a href="javascript:window.__securityXss=true">Unsafe link</a><svg onload="window.__securityXss=true"><foreignObject><iframe srcdoc="<script>window.__securityXss=true</script>"></iframe></foreignObject></svg><p>Useful description survives</p>';
  const node=document.createElement('div');node.id='security-render';document.body.append(node);createRoot(node).render(React.createElement(Markdown,{body:html,format:'html'}));
 });
 const view=page.locator('#security-render');await expect(view.getByRole('heading')).toHaveText('Readable provider description');await expect(view).toContainText('Useful description survives');
 await expect(view.locator('script,svg,iframe,[onerror],[onload],a[href^="javascript:"],img[src]')).toHaveCount(0);
 await view.getByText('Unsafe link').click();expect(await page.evaluate(()=>(window as any).__securityXss)).toBeUndefined();
});
test('Copy Details and visible details remove synthetic secrets while preserving error code and useful diagnostics',async({page})=>{
 await page.evaluate(async()=>{
  const React=(await import('/node_modules/.vite/deps/react.js')).default;const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;const {InlineError}=await import('/src/components/InlineError.tsx');
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as any).__copiedDetails=text;}}});
  const error={code:'checksum',stage:'download',message:'File mismatch; bEaReR synthetic-bearer-value; refresh_token=synthetic-refresh-value',accessToken:'synthetic-access-value',cookies:'Cookie: session=synthetic-cookie-value',password:'synthetic-password-value',path:'/home/tester/Canary/cache/file.jar',url:'https://example.org/?code=synthetic-oauth-value&ticket=synthetic-ticket-value'};
  const node=document.createElement('div');node.id='security-details';document.body.append(node);createRoot(node).render(React.createElement(InlineError,{error,russian:false}));
 });
 const view=page.locator('#security-details');await view.locator('summary').click();await expect(view).toContainText('checksum');expect(await view.textContent()).not.toContain('synthetic-');await view.getByRole('button',{name:'Copy details'}).click();
 const copied=await page.evaluate(()=>(window as any).__copiedDetails);expect(copied).toContain('checksum');expect(copied).toContain('File mismatch');expect(copied).not.toContain('synthetic-');expect(copied).not.toContain('/home/tester');
});
test('external URL validation rejects normalized internal addresses, credentials and dangerous schemes',async({page})=>{
 const rejected=await page.evaluate(async()=>{const {safeExternalUrl,safeImageUrl}=await import('/src/services/links.ts');return ['javascript:alert(1)','data:image/svg+xml,<svg/>','file:///C:/Windows','https://2130706433/','https://0x7f000001/','https://127.1/','https://[::1]/','https://169.254.169.254/','https://service.local/','https://service.local./','https://localhost./','https://secret@example.com/'].map(url=>!safeExternalUrl(url)&&!safeImageUrl(url));});expect(rejected.every(Boolean)).toBe(true);
});
test('all registered Rust commands require an explicit main local capability',()=>{
 const source=readFileSync('src-tauri/src/lib.rs','utf8');const registered=source.match(/generate_handler!\[([^\]]+)\]/)![1].split(',').sort();const manifest=[...readFileSync('src-tauri/src/app_commands.rs','utf8').matchAll(/"([a-z_]+)"/g)].map(m=>m[1]).sort();const permissions=[...readFileSync('src-tauri/permissions/backend.toml','utf8').matchAll(/^  "([a-z_]+)",/gm)].map(m=>m[1]).sort();
 expect(manifest).toEqual(registered);expect(permissions).toEqual(registered);const cap=JSON.parse(readFileSync('src-tauri/capabilities/default.json','utf8'));expect(cap.windows).toEqual(['main']);expect(cap.local).toBe(true);expect(cap.remote).toBeUndefined();expect(cap.permissions).toContain('canary-backend');expect(cap.permissions).not.toContain('opener:default');expect(cap.permissions).not.toContain('shell:default');expect(readFileSync('src-tauri/build.rs','utf8')).toContain('AppManifest::new().commands(COMMANDS)');
});

test('Markdown raw HTML and provider-local images remain inert while useful HTTPS links survive',async({page})=>{
 await page.evaluate(async()=>{
  const React=(await import('/node_modules/.vite/deps/react.js')).default;const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;const {default:Markdown}=await import('/src/components/Markdown.tsx');
  const node=document.createElement('div');node.id='security-markdown';document.body.append(node);createRoot(node).render(React.createElement(Markdown,{body:'# Useful Markdown\\n\\n[Official page](https://modrinth.com/)\\n\\n![Private local image](asset://localhost/scoped-private-screenshot.png)\\n\\n<script>window.__securityMarkdownXss=true</script>'}));
 });
 const view=page.locator('#security-markdown');await expect(view.getByRole('heading')).toHaveText('Useful Markdown');await expect(view.getByRole('link',{name:/Official page/})).toHaveAttribute('href','https://modrinth.com/');await expect(view.locator('script,img[src^="asset:"],img[src*="asset.localhost"]')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).__securityMarkdownXss)).toBeUndefined();
});
