import {test,expect,type Page} from "@playwright/test";
import {mkdirSync} from "node:fs";
import {nativeFixture} from "./helpers/nativeFixture";
const presets=["Solid","Soft","Vibrancy","Glass","Clear Glass","Liquid Glass","Transparent"];
const nav=(page:Page,name:string)=>page.locator(".sidebar nav").getByRole("button",{name,exact:true});
async function choose(page:Page,name:string,option:string){await page.getByRole("combobox",{name,exact:true}).click();await page.getByRole("option",{name:option,exact:true}).click();}
async function start(page:Page,mode="dark",side="left",layout="attached",compact=false){
 await nativeFixture(page);await page.emulateMedia({reducedMotion:"reduce"});
 await page.addInitScript(({mode,side,layout,compact})=>{
  localStorage.setItem("canary-mode",mode);localStorage.setItem("canary-compact",String(compact));
  localStorage.setItem("canary-visual",JSON.stringify({sidebarSide:side,sidebarMode:layout,app:"sakura1",ambient:"off",cursor:"system"}));
 },{mode,side,layout,compact});
 await page.goto("/");await expect(page.locator(".startup-splash")).toHaveCount(0);await page.evaluate(()=>document.fonts.ready);
}
async function controls(page:Page){
 const results=await page.locator(".sidebar button,.sidebar button .nav-capsule").evaluateAll(nodes=>nodes.map(node=>{
  const s=getComputedStyle(node);const transparent=(color:string)=>color==="transparent"||color.endsWith(", 0)")||color.endsWith("/ 0)");
  return {name:node.getAttribute("aria-label")||node.className,border:[s.borderTopColor,s.borderRightColor,s.borderBottomColor,s.borderLeftColor].every(transparent),
   shadow:s.boxShadow,outline:s.outlineWidth,focus:node.matches(":focus-visible"),pseudo:["::before","::after"].every(p=>{const ps=getComputedStyle(node,p);return ps.boxShadow==="none"&&parseFloat(ps.outlineWidth)===0&&[ps.borderTopWidth,ps.borderRightWidth,ps.borderBottomWidth,ps.borderLeftWidth].every(n=>parseFloat(n)===0);})};
 }));
 for(const r of results){expect(r.border,String(r.name)).toBe(true);expect(r.shadow,String(r.name)).toBe("none");if(r.focus)expect(parseFloat(r.outline),String(r.name)).toBeGreaterThan(0);else expect(r.outline,String(r.name)).toBe("0px");expect(r.pseudo,String(r.name)).toBe(true);}
}
async function geometry(page:Page,compact:boolean){
 const data=await page.locator(".sidebar button").evaluateAll(nodes=>nodes.map(button=>{
  const b=button.getBoundingClientRect(),icon=button.querySelector(".sidebar-icon")!.getBoundingClientRect(),svg=button.querySelector("svg");
  const s=svg?.getBoundingClientRect();return {x:icon.x+icon.width/2,y:icon.y+icon.height/2,bx:b.x+b.width/2,by:b.y+b.height/2,width:b.width,height:b.height,iw:icon.width,ih:icon.height,svg:s?{w:s.width,h:s.height,x:s.x+s.width/2,y:s.y+s.height/2,viewBox:svg!.getAttribute("viewBox")}:null};
 }));
 for(const r of data){expect(Math.abs(r.y-r.by)).toBeLessThan(.6);expect(r.iw).toBe(20);expect(r.ih).toBe(20);expect(r.height).toBe(45);if(compact)expect(Math.abs(r.x-r.bx)).toBeLessThan(.6);if(r.svg){expect(r.svg.viewBox).toBe("0 0 24 24");expect(r.svg.w).toBe(20);expect(r.svg.h).toBe(20);expect(Math.abs(r.svg.x-r.x)).toBeLessThan(.6);expect(Math.abs(r.svg.y-r.y)).toBeLessThan(.6);}}

 expect(Math.max(...data.map(d=>d.width))-Math.min(...data.map(d=>d.width))).toBeLessThan(1);
 expect(Math.max(...data.map(d=>d.x))-Math.min(...data.map(d=>d.x))).toBeLessThan(1);
 return data;
}
for(const [mode,system] of [["dark","dark"],["light","light"],["amoled","dark"],["system","dark"],["system","light"]] as const){
 test("Preview and Sidebar stay clean: "+mode+"/"+system+", all materials",async({page})=>{
  test.setTimeout(120000);await page.emulateMedia({colorScheme:system});await start(page,mode);
  for(const preset of presets){
   await nav(page,"Settings").click();await choose(page,"Material preset",preset);
   const text=await page.locator(".material-preview b,.material-preview p,.material-preview span,.material-preview button").evaluateAll(nodes=>nodes.map(node=>{const s=getComputedStyle(node);return {tag:node.tagName,shadow:s.textShadow,stroke:s.webkitTextStrokeWidth,filter:s.filter,background:s.backgroundColor};}));
   for(const t of text){expect(t.shadow).toBe("none");expect(parseFloat(t.stroke)).toBe(0);expect(t.filter).not.toContain("drop-shadow");if(t.tag!=="BUTTON")expect(t.background).toBe("rgba(0, 0, 0, 0)");}
   const contrasts=await page.locator(".material-preview").evaluate(scene=>{
    const canvas=document.createElement("canvas");canvas.width=canvas.height=1;const ctx=canvas.getContext("2d")!;
    const rgb=(color:string)=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return Array.from(ctx.getImageData(0,0,1,1).data).map((v,i)=>i===3?v/255:v);};
    const blend=(fg:number[],bg:number[])=>fg.slice(0,3).map((v,i)=>v*fg[3]+bg[i]*(1-fg[3]));
    const lum=(c:number[])=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
    const ratio=(a:number[],b:number[])=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    const probe=document.createElement("span");probe.style.color="var(--surface-primary)";scene.append(probe);const tint=rgb(getComputedStyle(probe).color);probe.remove();tint[3]=.88;
    return Array.from(scene.querySelectorAll("b,p,button,aside>span")).map(node=>{
     const surface=node.closest("article,aside")!,fill=rgb(getComputedStyle(surface).backgroundColor),fg=rgb(getComputedStyle(node).color);
     return Math.min(...[[0,0,0],[255,255,255]].map(base=>{let bg=blend(fill,blend(tint,base));if(node.tagName==="BUTTON")bg=blend(rgb(getComputedStyle(node).backgroundColor),bg);return ratio(fg,bg);}));
    });
   });
   for(const contrast of contrasts)expect(contrast,preset+" preview contrast").toBeGreaterThanOrEqual(4.5);
   if(preset==="Transparent"){
    await page.locator(".material-preview").scrollIntoViewIfNeeded();
    await page.screenshot({path:".qa/sidebar-preview/"+mode+"-"+system+"-preview.png"});
   }
   await page.keyboard.press("Escape");await expect(page.locator(".settings-modal")).toHaveCount(0);await controls(page);await geometry(page,false);
   const target=nav(page,"Home");const before=await target.boundingBox();await target.hover();await controls(page);
   expect(await target.boundingBox()).toEqual(before);
   await page.mouse.down();await controls(page);expect(await target.boundingBox()).toEqual(before);await page.mouse.up();
   await page.mouse.move(1270,790);
  }
  await nav(page,"Home").focus();await page.keyboard.press("Tab");
  const focus=page.locator(".sidebar button:focus-visible");await expect(focus).toHaveCount(1);await expect(focus).not.toHaveCSS("outline-width","0px");
  await page.mouse.click(1270,790);await controls(page);
 });
}
for(const side of ["left","right"])for(const layout of ["attached","floating"])for(const compact of [false,true]){
 test("Sidebar icon geometry "+side+"/"+layout+"/"+(compact?"compact":"expanded"),async({page})=>{
  await start(page,"dark",side,layout,compact);await expect(page.locator("html")).toHaveAttribute("data-sidebar-side",side);await expect(page.locator("html")).toHaveAttribute("data-sidebar-mode",layout);
  await expect(page.locator(".sidebar .brand")).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
  await expect(page.locator(".sidebar nav")).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
  await expect(page.locator(".sidebar-bottom")).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
  if(compact){
   const centers=await page.locator(".sidebar").evaluate(sidebar=>{const r=sidebar.getBoundingClientRect();return Array.from(sidebar.querySelectorAll(".sidebar-icon")).map(icon=>{const b=icon.getBoundingClientRect();return Math.abs(b.x+b.width/2-r.x-r.width/2);});});
   for(const delta of centers)expect(delta).toBeLessThan(.6);
  }
  const before=await geometry(page,compact);await nav(page,"Library").click();await expect(nav(page,"Library")).toHaveAttribute("aria-current","page");await controls(page);
  expect(await geometry(page,compact)).toEqual(before);await nav(page,"Library").hover();expect(await geometry(page,compact)).toEqual(before);
  await page.screenshot({path:".qa/sidebar-preview/"+side+"-"+layout+"-"+(compact?"compact":"expanded")+".png"});
  if(compact&&side==="left"&&layout==="attached"){await page.mouse.move(800,400);await page.locator(".sidebar").screenshot({path:".qa/sidebar-preview/sidebar-fixed.png"});}
 });
}
test.beforeAll(()=>mkdirSync(".qa/sidebar-preview",{recursive:true}));
