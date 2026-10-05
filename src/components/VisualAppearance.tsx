import GlassSelect from "./GlassSelect";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { CSSProperties } from "react";
import "./VisualAppearance.css";
import "./CursorPack.css";
import "./LiquidGlass.css";
import ArtworkFade from "./ArtworkFade";
import DesktopBehavior from "./DesktopBehavior";
import { PolishControls, QualityControls, polishDefaults, type PolishPreferences } from "./PolishControls";
import { appearanceMessages } from "../locales/appearance";

import {backgrounds,type Background} from "../services/backgrounds";
export {backgrounds} from "../services/backgrounds";
import {isTauri,convertFileSrc} from "@tauri-apps/api/core";
import {useBackend} from "../services/backend";
import {windowDefaults,useNativeMaterial,WindowMaterialSettings,WindowControlsSettings,type WindowPreferences} from "./WindowMaterial";
const fonts = ["Nunito", "Manrope", "Plus Jakarta Sans", "Rubik", "Monocraft"];
export type Preferences = PolishPreferences & WindowPreferences & { app: string; sidebar: string; linked: boolean; intensity: number; blur: number; sidebarBlur: number; font: string; fontScale: 90 | 100 | 110 | 120; minecraft: "headings" | "full"; ambient: "off" | "automatic" | "sakura" | "snow" | "autumn" };
const defaults: Preferences = { ...polishDefaults,...windowDefaults, app: "normal", sidebar: "default", linked: false, intensity: 45, blur: 5, sidebarBlur: 12, font: "Nunito", fontScale:100, minecraft: "headings", ambient: "off" };
export function normalizePreferences(input:unknown):Preferences {
 const saved=input&&typeof input==="object"?input as Record<string,unknown>:{};
 const result={...defaults,globalTreatment:{...defaults.globalTreatment},sidebarTreatment:{...defaults.sidebarTreatment}};
 const fields=result as unknown as Record<string,unknown>;
 for(const key of Object.keys(defaults)){const value=saved[key];if(typeof value===typeof fields[key]&&(typeof value!=="number"||Number.isFinite(value)))fields[key]=value;}
 const enums:Record<string,string[]>={backgroundSource:["canary","desktop","solid"],material:["solid","transparent","acrylic","mica","mica-alt"],tint:["neutral","theme","strong"],vibrancyPreset:["off","subtle","balanced","glass","custom"],titlebarBranding:["icon","text","icon-text","hidden"],windowControls:["windows","minimal","compact","traffic-lights"],controlsPosition:["left","right"],effectPreset:["off","low","medium","high","custom"],ambient:["off","automatic","sakura","snow","autumn"],quality:["low","balanced","high"],sidebarSide:["left","right"],cursor:["system","custom"],minecraft:["headings","full"],font:fonts};
 for(const [key,allowed] of Object.entries(enums))if(!allowed.includes(String(fields[key])))fields[key]=(defaults as unknown as Record<string,unknown>)[key];
 const ranges:Record<string,[number,number]>={windowTransparency:[0,100],surfaceOpacity:[55,100],surfaceBlur:[0,32],glassIntensity:[0,70],heroSpeed:[7,20],particleWind:[0,200],density:[4,24],particleSpeed:[40,180],particleOpacity:[5,70],particleSize:[50,150],glass:[5,35],intensity:[0,100],blur:[0,10],sidebarBlur:[0,20],sidebarIntensity:[0,100]};
 for(const [key,[min,max]] of Object.entries(ranges))fields[key]=Math.min(max,Math.max(min,Number(fields[key])));
 result.fontScale=[90,100,110,120].includes(result.fontScale)?result.fontScale:100;
 for(const key of ["globalTreatment","sidebarTreatment"] as const){const input=saved[key]&&typeof saved[key]==="object"?saved[key] as Record<string,unknown>:{};const treatment={...defaults[key]};for(const [name,[min,max]] of Object.entries({brightness:[50,130],saturation:[0,130],overlay:[35,95],vignette:[0,90],zoom:[100,140]})){if(typeof input[name]==="number"&&Number.isFinite(input[name]))(treatment as unknown as Record<string,unknown>)[name]=Math.min(max,Math.max(min,input[name] as number));}treatment.position=["center","top","bottom","left","right"].includes(String(input.position))?String(input.position):"center";result[key]=treatment;}
 return result;
}
const Context = createContext<{ registry:Background[];reload:()=>Promise<void>;value: Preferences; native:ReturnType<typeof useNativeMaterial>|null;update: (patch: Partial<Preferences>) => void }>({registry:backgrounds,reload:async()=>{},value: defaults,native:null,update: () => {} });
export const useVisualAppearance=()=>useContext(Context);
export function VisualAppearanceProvider({ children }: { children: ReactNode }) {
  const {run}=useBackend();const [custom,setCustom]=useState<Background[]>([]);
  const objectUrls=useRef(new Set<string>());const loadSequence=useRef(0);
  useEffect(()=>()=>{loadSequence.current++;objectUrls.current.forEach(url=>URL.revokeObjectURL(url));objectUrls.current.clear();},[]);
  const reload=async()=>{
    if(!isTauri())return;const sequence=++loadSequence.current;const created:string[]=[];
    const imageUrl=async(path:string)=>{const url=convertFileSrc(path);if(!url.startsWith("asset:"))return url;
      // WebKit can fetch the registered asset protocol but reject it for image decoding.
      const response=await fetch(url);if(!response.ok)throw Error("Cannot read imported background");
      const result=URL.createObjectURL(await response.blob());created.push(result);return result;};
    try{
      const data=await run<{id:string;name:string;target:string;image:string;thumbnail:string}[]>("list_wallpapers");
      const results=await Promise.allSettled(data.map(async p=>{const image=await imageUrl(p.image);const thumbnail=await imageUrl(p.thumbnail);return {id:p.id,name:p.name,ambient:"off" as const,custom:true,thumbnail,...(p.target!=="sidebar"?{app:image}:{}),...(p.target!=="app"?{sidebar:image}:{})};}));
      const entries=results.map(result=>{if(result.status==="rejected")throw result.reason;return result.value;});
      if(sequence!==loadSequence.current){created.forEach(url=>URL.revokeObjectURL(url));return;}
      const retired=[...objectUrls.current];created.forEach(url=>objectUrls.current.add(url));setCustom(entries);
      setTimeout(()=>{retired.forEach(url=>{URL.revokeObjectURL(url);objectUrls.current.delete(url);});},1000);
    }catch(error){created.forEach(url=>URL.revokeObjectURL(url));throw error;}
  };
  useEffect(()=>{void reload().catch(()=>{});},[run]);const registry=[...backgrounds,...custom];

  const [value, setValue] = useState<Preferences>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("canary-visual") || "{}");
      return normalizePreferences({
        ...defaults, ...saved,
        fontScale: [90,100,110,120].includes(saved.fontScale) ? saved.fontScale : 100,
        // Old generated cursor choices migrate to the supplied native pack.
        cursor: saved.cursor === "system" ? "system" : "custom",
        globalTreatment: { ...polishDefaults.globalTreatment, ...saved.globalTreatment },
        sidebarTreatment: { ...polishDefaults.sidebarTreatment, ...saved.sidebarTreatment },
      });
    } catch { return defaults; }
  });
  const [reduced, setReduced] = useState(false);
  const native=useNativeMaterial(value);
  useEffect(() => { const media = matchMedia("(prefers-reduced-motion: reduce)"); const sync = () => setReduced(media.matches); sync(); media.addEventListener("change", sync); return () => media.removeEventListener("change", sync); }, []);
  useLayoutEffect(() => {
    localStorage.setItem("canary-visual", JSON.stringify(value));
    const root = document.documentElement;
    root.style.setProperty("--ui-font-scale", String(value.fontScale / 100));
    root.dataset.uiFont = value.font; root.dataset.minecraft = value.minecraft;
    root.dataset.ambient = value.ambient;
    root.dataset.sidebarSide = value.sidebarSide; root.dataset.cursor = value.cursor;
    root.dataset.focus = String(value.focus); root.dataset.quality = value.quality;
    root.dataset.backgroundSource=value.backgroundSource;root.dataset.frost=String(value.frost);
    root.style.setProperty("--surface-opacity",`${value.focus?97:value.surfaceOpacity}%`);
    root.style.setProperty("--material-blur",`${value.focus||value.quality==="low"?Math.min(value.surfaceBlur,4):value.surfaceBlur}px`);
    root.style.setProperty("--glass-strength",String(value.glassIntensity/100));
    const tint=value.tint==="strong"?12:value.tint==="neutral"?-8:0;
    root.style.setProperty("--window-veil-opacity",`${Math.min(100,Math.max(0,100-value.windowTransparency+tint))}%`);
    root.style.setProperty("--glass-opacity", `${100 - value.glass}%`);
    for (const [prefix, treatment] of [["wallpaper", value.globalTreatment], ["sidebar", value.sidebarTreatment]] as const) {
      root.style.setProperty(`--${prefix}-brightness`, String(treatment.brightness / 100));
      root.style.setProperty(`--${prefix}-saturation`, String(treatment.saturation / 100));
      root.style.setProperty(`--${prefix}-overlay`, `${treatment.overlay}%`);
      root.style.setProperty(`--${prefix}-vignette`, `${treatment.vignette}%`);
      root.style.setProperty(`--${prefix}-scale`, String(treatment.zoom / 100));
      root.style.setProperty(`--${prefix}-position`, treatment.position);
    }
    root.style.setProperty("--sidebar-opacity", String(value.sidebarIntensity / 100));
    root.style.setProperty("--ui-font", value.font === "Monocraft" && value.minecraft === "headings" ? "Nunito" : `"${value.font}"`);
    root.style.setProperty("--heading-font", `"${value.font}"`);
    root.style.setProperty("--sidebar-art", `url("${registry.find(p => p.id === value.sidebar)?.sidebar || "/backgrounds/sidebar-bg.webp"}")`);
    root.style.setProperty("--sidebar-blur", `${value.sidebarBlur}px`);
  }, [value,custom]);
  const automaticSakura = value.sidebar === "default" ||
    registry.some(p => (p.id === value.app || p.id === value.sidebar) && p.ambient === "sakura");
  const effect = value.ambient === "automatic" ? (automaticSakura ? "sakura" : "off") : value.ambient;
  const image = registry.find(p => p.id === value.app)?.app;
  return <Context.Provider value={{registry,reload,value,native,update: patch => setValue(old => ({ ...old, ...patch })) }}>
    <div className="visual-backdrop" aria-hidden="true" style={{ "--wallpaper-opacity": value.intensity / 100, "--wallpaper-blur": `${value.blur}px` } as CSSProperties}>
      <ArtworkFade source={image} className="global-wallpaper" />
      <div className="wallpaper-veil" />
    </div>
    {value.backgroundSource!=="canary"&&<div className="native-window-veil" aria-hidden="true"/>}
    {children}
    {!reduced && !value.focus && effect !== "off" && <div className={`ambient-particles ${effect}`} aria-hidden="true">{Array.from({ length: Math.min(value.density, value.quality === "low" ? 6 : value.quality === "balanced" ? 16 : 24) }, (_, i) => <i key={i} style={{ left: `${(i * 37 + 9) % 100}%`, animationDelay: `${-i * 2.7}s`, animationDuration: `${(22 + i % 5 * 4) / (value.particleSpeed / 100)}s`, "--drift": `${(i % 2 ? 65 : -55)*value.particleWind/100}px`, "--sway":`${(i%3+1)*9}px`,"--leaf-color":["#dca14a","#e0b358","#c97938"][i%3],opacity: value.particleOpacity / 100 * (.75 + (i % 4) * .08), "--particle-scale": value.particleSize / 100*(.8+(i%5)*.15) } as CSSProperties} />)}</div>}
  <DesktopBehavior />
  </Context.Provider>;
}
export function VisualPreferences({ russian,group="all" }: { russian: boolean;group?:string }) {
  const {value,update,registry,reload,native}=useContext(Context);const {run}=useBackend();const [importTarget,setImportTarget]=useState("both");const [importing,setImporting]=useState(false);
  const text = appearanceMessages[russian ? "ru" : "en"];
  const choose=(kind:"app"|"sidebar",id:string)=>{const selected=registry.find(p=>p.id===id);update(value.linked&&selected?.app&&selected.sidebar?{app:id,sidebar:id}:{[kind]:id});};
  const preview = (kind: "app" | "sidebar") => <div className="background-options">{[{ id: kind === "app" ? "normal" : "default", name: text[kind === "app" ? "Normal" : "Default"], app: undefined, sidebar: "/backgrounds/sidebar-bg.webp" }, ...registry.filter(p => p[kind])].map(p => <button key={p.id} aria-pressed={value[kind] === p.id} className={value[kind] === p.id ? "selected" : ""} onClick={() => choose(kind, p.id)}><span className="background-preview" style={p[kind] ? { backgroundImage: `url("${"thumbnail" in p&&p.thumbnail||p[kind]}")` } : {}} /><span>{p.name}</span></button>)}</div>;

  return <section className="visual-preferences" data-visual-group={group}>
    <div className="visual-appearance-group">{native&&<WindowMaterialSettings russian={russian} value={value} update={update} {...native}/>}
    <PolishControls russian={russian} value={value} update={update}/></div>
    <div className="visual-background-group"><h4>{text["Application background"]}</h4>{preview("app")}
    <h4>{text["Sidebar background"]}</h4>{preview("sidebar")}
    <div className="toggle-setting"><div><b>{text["Link application and sidebar backgrounds"]}</b></div><button className={value.linked ? "toggle on" : "toggle"} role="switch" aria-checked={value.linked} aria-label={text["Link backgrounds"]} onClick={() => update({ linked: !value.linked, ...(value.linked ? {} : { sidebar:registry.find(p=>p.id===value.app)?.sidebar?value.app:value.sidebar }) })}><i /></button></div>

    {isTauri()&&<div className="runtime-panel"><h4>{russian?"Свои изображения":"Custom images"}</h4><label>{russian?"Применить к":"Use for"}<GlassSelect value={importTarget} onChange={e=>setImportTarget(e.target.value)}><option value="both">{russian?"Фон и боковая панель":"Background and sidebar"}</option><option value="app">{russian?"Фон":"Background"}</option><option value="sidebar">{russian?"Боковая панель":"Sidebar"}</option></GlassSelect></label><button className="quiet-button" disabled={importing} onClick={()=>{setImporting(true);void run("import_wallpaper",{target:importTarget}).then(reload).catch(()=>{}).finally(()=>setImporting(false));}}>{importing?(russian?"Импорт…":"Importing…"):(russian?"Импортировать изображение":"Import image")}</button>{registry.filter(p=>p.custom).map(p=><div className="runtime-inline" key={p.id}><span>{p.name}</span><button className="quiet-button" disabled={importing} onClick={()=>{setImporting(true);void run("remove_wallpaper",{id:p.id}).then(()=>{update({...value.app===p.id?{app:"normal"}:{},...value.sidebar===p.id?{sidebar:"default"}:{}});return reload();}).catch(()=>{}).finally(()=>setImporting(false));}}>{russian?"Удалить":"Remove"}</button></div>)}</div>}
    </div><div className="visual-typography-group"><h4>{text["Interface font"]}</h4><div className="font-options">{fonts.map(font => <button key={font} style={{ fontFamily: `"${font}", Nunito, sans-serif` }} className={value.font === font ? "selected" : ""} aria-pressed={value.font === font} onClick={() => update({ font })}>{font}</button>)}</div>
    <h4>{text["Interface size"]}</h4><div className="font-options">{([90,100,110,120] as const).map(fontScale=><button key={fontScale} aria-pressed={value.fontScale===fontScale} className={value.fontScale===fontScale?"selected":""} onClick={()=>update({fontScale})}>{fontScale}%</button>)}</div>
    {value.font === "Monocraft" && <><h4>{text["Minecraft style"]}</h4><div className="font-options">{(["headings", "full"] as const).map(minecraft => <button key={minecraft} aria-pressed={value.minecraft === minecraft} className={value.minecraft === minecraft ? "selected" : ""} onClick={() => update({ minecraft })}>{minecraft === "headings" ? text["Headings"] : text["Full interface"]}</button>)}</div></>}
    </div><EffectsPreferences russian={russian}/>
  </section>;
}

export function SidebarArtwork() {
  const { value,registry } = useContext(Context);
  if(value.backgroundSource!=="canary")return null;
  return <ArtworkFade source={registry.find(p => p.id === value.sidebar)?.sidebar || "/backgrounds/sidebar-bg.webp"} className="sidebar-art" />;
}
export function WindowPreferencesPanel({russian}:{russian:boolean}){const {value,update}=useContext(Context);return <WindowControlsSettings russian={russian} value={value} update={update}/>;}
export function EffectsPreferences({russian}:{russian:boolean}){
 const {value,update}=useContext(Context);const text=appearanceMessages[russian?"ru":"en"];
 const preset=(p:string)=>{const settings={off:{ambient:"off" as const},low:{density:6,particleOpacity:25,particleSize:85,particleSpeed:75},medium:{density:12,particleOpacity:35,particleSize:110,particleSpeed:100},high:{density:24,particleOpacity:45,particleSize:125,particleSpeed:115},custom:{}};update({...settings[p as keyof typeof settings],effectPreset:p,...p!=="off"&&value.ambient==="off"?{ambient:"snow" as const}:{}});};
 const range=(name:string,n:number,min:number,max:number,change:(v:number)=>void)=><label className="visual-range"><span>{name}<output>{n}</output></span><input type="range" aria-label={name} min={min} max={max} value={n} onChange={e=>change(Number(e.target.value))}/></label>;
 return <section className="effects-preferences"><h4>{text["Ambient effects"]}</h4><div className="font-options">{(["off","automatic","sakura","snow","autumn"] as const).map(ambient=><button key={ambient} aria-pressed={value.ambient===ambient} className={value.ambient===ambient?"selected":""} onClick={()=>update({ambient,...value.particleOpacity<25?{particleOpacity:35}:{}})}>{ambient==="autumn"?(russian?"Осенние листья":"Autumn Leaves"):({off:text["Off"],automatic:text["Automatic"],sakura:text["Sakura"],snow:text["Snow"]})[ambient]}</button>)}</div>
 <label>{russian?"Пресет частиц":"Effect preset"}<GlassSelect aria-label={russian?"Пресет частиц":"Effect preset"} value={value.effectPreset} onChange={e=>preset(e.target.value)}>{["off","low","medium","high","custom"].map(p=><option key={p} value={p}>{p[0].toUpperCase()+p.slice(1)}</option>)}</GlassSelect></label>
 <div className="polish-range-grid">{range(russian?"Количество частиц":"Particle count",value.density,4,24,density=>update({density,effectPreset:"custom"}))}{range(russian?"Размер частиц":"Particle size",value.particleSize,60,160,particleSize=>update({particleSize,effectPreset:"custom"}))}{range(russian?"Скорость частиц":"Particle speed",value.particleSpeed,50,150,particleSpeed=>update({particleSpeed,effectPreset:"custom"}))}{range(russian?"Непрозрачность частиц":"Particle opacity",value.particleOpacity,5,50,particleOpacity=>update({particleOpacity,effectPreset:"custom"}))}{range(russian?"Ветер":"Particle wind",value.particleWind,0,180,particleWind=>update({particleWind,effectPreset:"custom"}))}</div>
 </section>;
}
export function VisualQuality({ russian }: { russian: boolean }) {
  const { value, update } = useContext(Context);
  return <QualityControls russian={russian} value={value} update={update} />;
}
