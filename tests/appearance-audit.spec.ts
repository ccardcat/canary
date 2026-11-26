import {mkdirSync,writeFileSync} from "node:fs";
import {expect,test,type Page} from "@playwright/test";
import {backgrounds} from "../src/services/backgrounds";
import {lightPalettes,darkPalettes,amoledPalettes} from "../src/services/theme";
import {buttonStyles} from "../src/services/buttonStyles";
import {nativeFixture} from "./helpers/nativeFixture";
import {settingsSection} from "./helpers/settings";

const sections=[
  "appearance","appearanceProfiles","buttonStyles","materials","background","sidebar","layout","typography","effects",
  "window","quality","minecraft","downloads","storage","advanced","accountSettings","discord","language","about",
];
const pages=["Home","Discover","Library","Downloads","Screenshots","Activity"];
const nav=(page:Page,name:string)=>page.locator(".sidebar nav").getByRole("button",{name,exact:true});
const settle=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
const qa=".qa/appearance-audit";

test.describe.configure({mode:"parallel"});

test.beforeEach(async ({page})=>{
  mkdirSync(qa,{recursive:true});
  await nativeFixture(page);
  await page.emulateMedia({reducedMotion:"reduce"});
});

const themeCases = [
  ...lightPalettes.map(preset=>({mode:"light",preset})),
  ...darkPalettes.map(preset=>({mode:"dark",preset})),
  ...amoledPalettes.map(preset=>({mode:"amoled",preset})),
  {mode:"system",preset:"frost",system:"light" as const},
  {mode:"system",preset:"viceCity",system:"dark" as const},
];

for (const theme of themeCases) test(`${theme.mode}/${theme.preset} fits every page and settings section`,async ({page})=>{
  if ("system" in theme) await page.emulateMedia({colorScheme:theme.system,reducedMotion:"reduce"});
  await page.setViewportSize({width:740,height:550});
  await page.addInitScript(theme=>{
    localStorage.setItem("canary-mode",theme.mode);
    localStorage.setItem("canary-palettes",JSON.stringify({["system" in theme?theme.system:theme.mode]:theme.preset}));
    localStorage.setItem("canary-visual",JSON.stringify({backgroundSource:"canary",app:"vice-city",materialStyle:"glass",materialLinked:true}));
  },theme);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-preset",theme.preset);
  await nav(page,"Home").waitFor();
  const problems:string[]=[];
  for (const name of pages) {
    await nav(page,name).evaluate((button:HTMLButtonElement)=>button.click());
    await expect(nav(page,name)).toHaveAttribute("aria-current","page");
    if (await page.locator(".content-shell").evaluate(node=>node.scrollWidth>node.clientWidth+1)) problems.push(name);
  }
  await nav(page,"Settings").click();
  await page.locator(".settings-group-toggle[aria-expanded=false]")
    .evaluateAll(buttons=>buttons.forEach(button=>(button as HTMLButtonElement).click()));
  expect(await page.locator(".settings-children button>span").evaluateAll(labels=>
    labels.filter(label=>label.scrollWidth>label.clientWidth+1).map(label=>label.textContent))).toEqual([]);
  for (const id of sections) {
    await page.locator(`[data-settings-section="${id}"]`).evaluate((button:HTMLButtonElement)=>button.click());
    await expect(page.locator(`[data-settings-section="${id}"]`)).toHaveAttribute("aria-current","page");
    await page.evaluate(settle);
    if (await page.locator(".settings-content").evaluate(node=>node.scrollWidth>node.clientWidth+1)) problems.push(id);
  }
  expect(problems).toEqual([]);
});

const wallpaperSelectors=[".home-greeting > span:last-child",".topbar-sub",".hero-content h2",".hero-content p",".sidebar nav .nav-label",".sidebar-bottom .nav-label"];
const wallpaperThemes=themeCases.filter(theme=>theme.mode!=="system");

for (const theme of wallpaperThemes) test(`${theme.mode}/${theme.preset}: every wallpaper keeps text readable`,async ({page})=>{
  test.setTimeout(180000);
  await page.setViewportSize({width:1000,height:740});
  await page.addInitScript(({mode,preset})=>{
    localStorage.setItem("canary-mode",mode);
    localStorage.setItem("canary-palettes",JSON.stringify({[mode]:preset}));
    localStorage.setItem("canary-visual",JSON.stringify({
      backgroundSource:"canary",app:"meadow",intensity:100,blur:0,
      globalTreatment:{overlay:0,vignette:0,brightness:100,saturation:100},
      sidebarIntensity:100,sidebarBlur:0,
      sidebarTreatment:{overlay:0,vignette:0,brightness:100,saturation:100},
      showHero:true,heroFollowWallpaper:true,
    }));
  },theme);
  await page.goto("/");
  await nav(page,"Settings").click();
  await settingsSection(page,"Background");
  const section=(id:string)=>page.locator(`[data-settings-section="${id}"]`)
    .evaluate((button:HTMLButtonElement)=>button.click());
  await page.addStyleTag({content:`
    .modal-backdrop,.canary-tooltip { opacity:0 !important; }
    [data-audit-ink] { -webkit-text-fill-color:transparent !important; }
    .hero-content[data-vice-city] h2[data-audit-ink] { background-image:none !important; }
  `});
  const report=[];
  for (const wallpaper of backgrounds) {
    await section("background");
    await page.locator(".background-options").getByRole("button",{name:wallpaper.name,exact:true,includeHidden:true})
      .evaluate((button:HTMLButtonElement)=>button.click());
    await expect(page.locator(".global-wallpaper .artwork-current")).toHaveCSS("background-image",`url("http://127.0.0.1:1420${wallpaper.app}")`);
    await expect(page.locator(".hero-art .artwork-current")).toHaveCSS("background-image",`url("http://127.0.0.1:1420${wallpaper.app}")`);
    await section("sidebar");
    await page.locator(".background-options").getByRole("button",{name:wallpaper.name,exact:true,includeHidden:true})
      .evaluate((button:HTMLButtonElement)=>button.click());
    await expect(page.locator(".sidebar-art .artwork-current")).toHaveCSS("background-image",`url("http://127.0.0.1:1420${wallpaper.sidebar}")`);
    const probes=await page.evaluate((selectors)=>{
      const canvas=document.createElement("canvas");
      const ctx=canvas.getContext("2d")!;
      return selectors.flatMap(selector=>[...document.querySelectorAll(selector)].flatMap(node=>{
        const range=document.createRange();
        range.selectNodeContents(node);
        ctx.clearRect(0,0,1,1);
        ctx.fillStyle=getComputedStyle(node).color;
        ctx.fillRect(0,0,1,1);
        const ink=[...ctx.getImageData(0,0,1,1).data].slice(0,3);
        node.setAttribute("data-audit-ink","");
        return [...range.getClientRects()].filter(box=>box.width>4&&box.height>4&&box.y>=0&&box.bottom<innerHeight)
          .map(box=>({selector,ink,x:box.x,y:box.y,width:box.width,height:box.height}));
      }));
    },wallpaperSelectors);
    expect(probes.length).toBeGreaterThanOrEqual(wallpaperSelectors.length);
    const screenshot=await page.screenshot({animations:"disabled"});
    const samples=await page.evaluate(async ({image,probes})=>{
      const source=new Image();
      source.src="data:image/png;base64,"+image;
      await source.decode();
      const canvas=document.createElement("canvas");
      canvas.width=source.width;canvas.height=source.height;
      const ctx=canvas.getContext("2d")!;
      ctx.drawImage(source,0,0);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      const lum=(values:number[])=>values.map(channel=>channel/255).reduce((sum,channel,i)=>
        sum+[.2126,.7152,.0722][i]*(channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4),0);
      return probes.map(({selector,ink,x,y,width,height})=>{
        let min=21;
        const foreground=lum(ink);
        for(let iy=Math.ceil(y)+2;iy<y+height-2;iy+=3) for(let ix=Math.ceil(x)+2;ix<x+width-2;ix+=3) {
          const offset=(iy*canvas.width+ix)*4;
          const background=lum([pixels[offset],pixels[offset+1],pixels[offset+2]]);
          min=Math.min(min,(Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05));
        }
        return {selector,ratio:Number(min.toFixed(2))};
      });
    },{image:screenshot.toString("base64"),probes});
    report.push({wallpaper:wallpaper.id,samples});
  }
  writeFileSync(`${qa}/wallpapers-${theme.preset}.json`,JSON.stringify(report,null,2));
  expect(report.flatMap(({wallpaper,samples})=>samples.filter(sample=>sample.ratio<4.5).map(sample=>({wallpaper,...sample})))).toEqual([]);
});

test("all button finishes remain distinct on real controls during pointer and keyboard interaction",async ({page})=>{
  test.setTimeout(90000);
  await page.goto("/");
  const labels=["Classic","Capsules","Frosted glass","Outline","Retro","Neon"];
  const control=page.locator(".library-intro .primary-button");
  const face=()=>control.evaluate(node=>{
    const css=getComputedStyle(node);
    return {
      background:css.backgroundColor, color:css.color, shadow:css.boxShadow,
      radius:css.borderRadius, outline:css.outlineStyle,
    };
  });
  for (const mode of ["Light","Dark"]) {
    const signatures=[];
    for (const [index,label] of labels.entries()) {
      await nav(page,"Settings").click();
      await page.locator(".mode-grid").getByRole("button",{name:mode,exact:true}).click();
      await settingsSection(page,"buttonStyles");
      await page.getByRole("group",{name:"Button style"}).getByRole("button",{name:label,exact:true}).click();
      await expect(page.locator("html")).toHaveAttribute("data-button-style",buttonStyles[index]);
      await page.keyboard.press("Escape");
      await nav(page,"Library").click();
      await page.mouse.move(0,0);
      const normal=await face();
      const geometry=await control.boundingBox();
      await control.hover();
      const hover=await face();
      await page.mouse.down();
      const pressed=await face();
      await page.mouse.move(0,0);
      await page.mouse.up();
      expect(await control.boundingBox()).toEqual(geometry);
      expect(pressed.background).not.toBe(hover.background);
      await page.keyboard.press("Tab");
      await control.focus();
      expect((await face()).outline).toBe("solid");
      if (label==="Capsules") expect(normal).toMatchObject({color:"rgb(255, 255, 255)",radius:"999px",background:"rgb(0, 98, 213)"});
      signatures.push([normal.background,normal.radius,normal.shadow].join("/"));
    }
    expect(new Set(signatures).size).toBe(buttonStyles.length);
  }
});

test("advanced material controls update live surfaces and preserve reduced transparency across presets",async ({page})=>{
  test.setTimeout(90000);
  await page.goto("/");
  await nav(page,"Settings").click();
  await settingsSection(page,"materials");
  const preset=async (name:string)=>{
    await page.getByRole("combobox",{name:"Material preset",exact:true}).click();
    await page.getByRole("option",{name,exact:true}).click();
  };
  await preset("Liquid Glass");
  await page.getByText("Advanced materials",{exact:true}).click();
  const sliders=[
    ["Surface opacity","surfaceOpacity","--mat-cards-opacity"],
    ["Surface backdrop blur","surfaceBlur","--mat-cards-blur"],
    ["Material intensity","materialIntensity","--mat-cards-glow"],
    ["Saturation","materialSaturation","--mat-cards-saturation"],
    ["Brightness","materialBrightness","--mat-cards-filter"],
    ["Contrast","materialContrast","--mat-cards-filter"],
    ["Edge highlight","materialHighlight","--mat-cards-light"],
    ["Border strength","materialBorder","--mat-cards-edge"],
    ["Shadow depth","materialShadow","--mat-cards-shadow"],
    ["Corner radius","materialRadius","--mat-cards-radius"],
    ["Titlebar intensity","titlebarMaterialIntensity","--mat-titlebar-light"],
    ["Sidebar material intensity","sidebarMaterialIntensity","--mat-sidebar-light"],
  ];
  for (const [name,key,token] of sliders) {
    if (key==="sidebarMaterialIntensity") {
      await settingsSection(page,"Sidebar");
      await page.getByText("Sidebar material and depth",{exact:true}).click();
    }
    const slider=page.getByRole("slider",{name,exact:true});
    const min=await slider.getAttribute("min");
    const max=await slider.getAttribute("max");
    const rendered=(key:string)=>page.evaluate(name=>document.documentElement.style.getPropertyValue(name),key);
    await slider.press("Home");
    await expect(slider).toHaveValue(min!);
    const before=await rendered(token);
    await slider.press("End");
    await expect(slider).toHaveValue(max!);
    expect(await rendered(token),name).not.toBe(before);
    expect(await page.evaluate(key=>JSON.parse(localStorage.getItem("canary-visual")!)[key],key)).toBe(Number(max));
  }
  await settingsSection(page,"materials");
  const reduced=page.getByRole("checkbox",{name:"Reduce transparency",exact:true});
  await reduced.check();
  await preset("Glass");
  await expect(reduced).toBeChecked();
  await expect(page.getByRole("slider",{name:"Surface opacity",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Reset materials",exact:true}).click();
  await expect(reduced).toBeChecked();
  await reduced.uncheck();
  await expect(page.getByRole("slider",{name:"Surface opacity",exact:true})).toBeEnabled();
});
