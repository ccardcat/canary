import assert from 'node:assert/strict';

// Runs inside the packaged Canary WebView2 through the existing inspector.
// It uses actual settings controls, local persistence and native window resize.
export async function materialPresetQA({evaluate,choose,click,textButton,call,win,until,delay,screenshot,report}) {
 const original=await evaluate(`({visual:localStorage.getItem('canary-visual'),compact:localStorage.getItem('canary-compact'),narrow:localStorage.getItem('canary-sidebar-expanded-narrow'),mode:localStorage.getItem('canary-mode')})`);
 const names=['Solid','Soft','Vibrancy','Glass','Clear Glass','Liquid Glass','Transparent'];
 const ids=['solid','soft','vibrancy','glass','clear','liquid','transparent'];
 const geometry=()=>evaluate(`['.sidebar','.settings-modal','.window-titlebar','.home-hero'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})`);
 const unrelated=()=>evaluate(`(()=>{const value=JSON.parse(localStorage.getItem('canary-visual'));return Object.fromEntries(['sidebarSide','sidebarMode','materialRadius','instanceLayout','instanceArtwork','buttonDensity','app','sidebar','font','fontScale','backgroundSource','material','tint','windowTransparency'].map(key=>[key,value[key]]));})()`);
 const settings=async()=>{await until(()=>evaluate(`!!document.querySelector('.home-hero')&&getComputedStyle(document.querySelector('.page-transition')).opacity==='1'`),'material QA Home');await click(textButton('.sidebar button','Settings'));await until(()=>evaluate(`!!document.querySelector('.material-settings')&&getComputedStyle(document.querySelector('.settings-modal')).opacity==='1'`),'material QA Settings');};
 await win('set_size',{value:{Physical:{width:1200,height:760}}});await delay(300);
 report.surfaceMaterials=[];
 for(const side of ['left','right'])for(const mode of ['attached','floating'])for(const compact of [false,true]) {
  await evaluate(`(()=>{const old=JSON.parse(localStorage.getItem('canary-visual'));localStorage.setItem('canary-visual',JSON.stringify({...old,sidebarSide:${JSON.stringify(side)},sidebarMode:${JSON.stringify(mode)},quality:'balanced',focus:false,reduceTransparency:false,backgroundSource:'canary',app:'sakura1',sidebar:'green'}));localStorage.setItem('canary-compact',${JSON.stringify(String(compact))});localStorage.setItem('canary-sidebar-expanded-narrow','true');localStorage.setItem('canary-mode','dark');})()`);
  await call('Page.reload');await settings();const before=await geometry(),saved=await unrelated();
  for(let i=0;i<names.length;i++) {
   await choose('Material preset',names[i]);
   assert.equal(await evaluate(`document.documentElement.dataset.materialCards`),ids[i]);
   assert.deepEqual(await unrelated(),saved);assert.deepEqual(await geometry(),before);
   assert.equal(await evaluate(`document.querySelector('.sidebar').classList.contains('compact')`),compact);
   report.surfaceMaterials.push({side,mode,compact,preset:ids[i],geometryStable:true,unrelatedSettingsPreserved:true});
  }
  await choose('Material preset','Clear Glass');await call('Page.reload');await settings();assert.deepEqual(await unrelated(),saved);assert.equal(await evaluate(`document.documentElement.dataset.materialCards`),'clear');
 }
 // Inspect all identities in the native window on each palette, and resize
 // during switching. Geometry is compared within each viewport, never across it.
 for(const theme of ['Light','Dark','AMOLED']) {
  await click(textButton('.mode-grid button',theme));
  for(const width of [1200,960]) {
   await win('set_size',{value:{Physical:{width,height:760}}});await delay(300);const before=await geometry();
   for(let i=0;i<names.length;i++) {
    await choose('Material preset',names[i]);assert.deepEqual(await geometry(),before);
    await evaluate(`document.querySelector('.material-preview').scrollIntoView({block:'center'})`);
    await screenshot(`surface-${theme.toLowerCase()}-${width}-${ids[i]}`);
    report.surfaceMaterials.push({theme,width,preset:ids[i],geometryStable:true,nativeWindow:true});
   }
  }
 }
 await evaluate(`(()=>{const saved=${JSON.stringify(original)};for(const [key,value] of Object.entries({'canary-visual':saved.visual,'canary-compact':saved.compact,'canary-sidebar-expanded-narrow':saved.narrow,'canary-mode':saved.mode})){value===null?localStorage.removeItem(key):localStorage.setItem(key,value);}})()`);
 await call('Page.reload');await settings();
 report.cases.push({name:'surface-material-ownership-layout-persistence-resize',combinations:56,themes:3,resizeWidths:[1200,960],nativeIPC:true});
}
