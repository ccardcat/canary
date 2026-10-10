import {sidebarDefaults,normalizeSidebar,applySidebarTokens,type SidebarPreferences} from "../services/sidebarAppearance";
import {applyBackgroundTokens} from "./appearancePreview";
import {BackgroundSettings} from "./BackgroundSettings";
import {catalogDefaults, normalizeCatalog, type CatalogPreferences} from "../services/catalog";
import {CatalogSettings} from "./CatalogControls";
import {SmoothRange} from "./SmoothRange";
import {AmbientParticles} from "./AmbientParticles";
import {startupReadyEvent} from "../services/startup";
import {defaultSidebarImage,migrateBackgroundId} from "../services/backgrounds";
import {resolveAmbient} from "../services/ambient";
import {discordDefaults,type DiscordPreferences} from "../services/discord";
import GlassSelect from "./GlassSelect";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useCallback, type ReactNode } from "react";
import "./VisualAppearance.css";
import "./CursorPack.css";
import "./LiquidGlass.css";
import {materialDefaults,materialPresetPatch,layoutDefaults,normalizeLayout,normalizeMaterials,applyLayoutTokens,applyMaterialTokens,type LayoutPreferences,type MaterialPreferences} from "./MaterialSystem";
import MaterialSettings, {MaterialLayoutSettings} from "./MaterialSettings";
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
export type Preferences = SidebarPreferences & CatalogPreferences & DiscordPreferences & PolishPreferences & WindowPreferences & MaterialPreferences & LayoutPreferences & { app: string; sidebar: string; intensity: number; blur: number; sidebarBlur: number; font: string; fontScale: 90 | 100 | 110 | 120; minecraft: "headings" | "full"; showCommunity:boolean; backgroundVersion:number;compactCardsVersion:number; ambient: "off" | "automatic" | "sakura" | "snow" | "autumn" | "embers" };
const defaults: Preferences = { ...sidebarDefaults,...catalogDefaults,...discordDefaults, ...polishDefaults,...windowDefaults,...layoutDefaults,...materialDefaults, app: "meadow", sidebar: "meadow", intensity: 85, blur: 8, sidebarBlur: 12, font: "Nunito", fontScale:100, minecraft: "headings", showCommunity:true, backgroundVersion:1, compactCardsVersion:1, ambient: "off" };
const freshDefaults:Preferences={...defaults,...materialPresetPatch("solid"),backgroundSource:"solid",materialRadius:14,cursor:"system",showCommunity:false};
export function normalizePreferences(input:unknown):Preferences {
 const saved=input&&typeof input==="object"?input as Record<string,unknown>:{};
 const base=Object.keys(saved).length?defaults:freshDefaults;
 const result={...base,...normalizeSidebar(saved),...normalizeCatalog(saved),...normalizeMaterials(Object.keys(saved).length?saved:base),...normalizeLayout(Object.keys(saved).length?saved:base),globalTreatment:{...base.globalTreatment},sidebarTreatment:{...base.sidebarTreatment}};
 const fields=result as unknown as Record<string,unknown>;
 for(const key of Object.keys(defaults).filter(key=>!(key in materialDefaults)&&!(key in layoutDefaults)&&!(key in catalogDefaults)&&!(key in sidebarDefaults))){const value=saved[key];if(typeof value===typeof fields[key]&&(typeof value!=="number"||Number.isFinite(value)))fields[key]=value;}
 const enums:Record<string,string[]>={backgroundSource:["canary","desktop","solid"],material:["solid","transparent","acrylic","mica","mica-alt"],tint:["neutral","theme","strong"],vibrancyPreset:["off","subtle","balanced","glass","custom"],titlebarBranding:["icon","text","icon-text","hidden"],windowControls:["windows","minimal","compact","traffic-lights"],controlsPosition:["left","right"],effectPreset:["off","low","medium","high","custom"],ambient:["off","automatic","sakura","snow","autumn","embers"],quality:["low","balanced","high"],sidebarSide:["left","right"],cursor:["system","custom"],minecraft:["headings","full"],font:fonts};
 for(const [key,allowed] of Object.entries(enums))if(!allowed.includes(String(fields[key])))fields[key]=(defaults as unknown as Record<string,unknown>)[key];
 const ranges:Record<string,[number,number]>={windowTransparency:[0,100],surfaceOpacity:[20,100],surfaceBlur:[0,32],glassIntensity:[0,70],heroSpeed:[7,20],particleWind:[0,200],density:[4,24],particleSpeed:[40,180],particleOpacity:[5,70],particleSize:[50,160],glass:[5,35],intensity:[0,100],blur:[0,32],sidebarBlur:[0,20],sidebarIntensity:[0,100]};
 for(const [key,[min,max]] of Object.entries(ranges))fields[key]=Math.min(max,Math.max(min,Number(fields[key])));
 result.fontScale=[90,100,110,120].includes(result.fontScale)?result.fontScale:100;
 for(const key of ["globalTreatment","sidebarTreatment"] as const){const input=saved[key]&&typeof saved[key]==="object"?saved[key] as Record<string,unknown>:{};const treatment={...defaults[key]};for(const [name,[min,max]] of Object.entries({brightness:[50,130],saturation:[0,130],overlay:[0,100],vignette:[0,90],zoom:[100,140]})){if(typeof input[name]==="number"&&Number.isFinite(input[name]))(treatment as unknown as Record<string,unknown>)[name]=Math.min(max,Math.max(min,input[name] as number));}treatment.position=["center","top","bottom","left","right"].includes(String(input.position))?String(input.position):"center";result[key]=treatment;}
 if(Number(saved.backgroundVersion??0)<1){
  if(result.app==="normal"&&result.backgroundSource==="canary")result.app="meadow";
  if(result.intensity===45)result.intensity=85;
  if(result.globalTreatment.overlay===65)result.globalTreatment.overlay=28;
  if(result.globalTreatment.vignette===55)result.globalTreatment.vignette=30;
  if(result.sidebarTreatment.overlay===80)result.sidebarTreatment.overlay=38;
 }
 if(Number(saved.compactCardsVersion??0)<1&&result.instanceLayout==='comfortable')result.instanceLayout='compact';
 result.compactCardsVersion=1;
 result.backgroundVersion=1;
 result.app=migrateBackgroundId(result.app,"app");result.sidebar=migrateBackgroundId(result.sidebar,"sidebar");
 return result;
}
const Context = createContext<{ registry:Background[];effectsPaused:"focus"|"motion"|null;wallpapersReady:boolean;reload:()=>Promise<void>;value: Preferences; native:ReturnType<typeof useNativeMaterial>|null;update: (patch: Partial<Preferences>) => void;preview:(patch:Partial<Preferences>)=>void }>({registry:backgrounds,effectsPaused:null,wallpapersReady:true,reload:async()=>{},value: defaults,native:null,update: () => {},preview:()=>{} });
export const useVisualAppearance=()=>useContext(Context);
export function VisualAppearanceProvider({ children }: { children: ReactNode }) {
  const {run}=useBackend();const [custom,setCustom]=useState<Background[]>([]);const [wallpapersReady,setWallpapersReady]=useState(!isTauri());
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
  useEffect(()=>{let live=true;void reload().catch(()=>{}).finally(()=>{if(live)setWallpapersReady(true);});return()=>{live=false;};},[run]);const registry=[...backgrounds,...custom];

  const [value, setValue] = useState<Preferences>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("canary-visual") || "{}");
      return normalizePreferences(saved);
    } catch { return freshDefaults; }
  });
  const [reduced, setReduced] = useState(false);
  const native=useNativeMaterial(value);
  useEffect(() => { const media=matchMedia("(prefers-reduced-motion: reduce)");const sync=()=>setReduced(media.matches||document.documentElement.dataset.motion==="reduced");const observer=new MutationObserver(sync);observer.observe(document.documentElement,{attributes:true,attributeFilter:["data-motion"]});sync();media.addEventListener("change",sync);return()=>{observer.disconnect();media.removeEventListener("change",sync);}; }, []);
  useLayoutEffect(() => {

    applySidebarTokens(document.documentElement,value);
    applyLayoutTokens(document.documentElement,value);
    applyMaterialTokens(document.documentElement,value);
    const root = document.documentElement;
    applyBackgroundTokens(root,value);
    root.style.setProperty("--ui-font-scale", String(value.fontScale / 100));
    root.dataset.uiFont = value.font; root.dataset.minecraft = value.minecraft;
    root.dataset.ambient = value.ambient;
    root.dataset.sidebarSide = value.sidebarSide; root.dataset.cursor = value.cursor;
    root.dataset.focus = String(value.focus); root.dataset.quality = value.quality;
    root.dataset.backgroundSource=value.backgroundSource;root.dataset.frost=String(value.frost);
    root.style.setProperty("--surface-opacity",`${value.focus?97:value.surfaceOpacity}%`);
    root.style.setProperty("--material-blur",`${value.quality==="low"?0:value.focus?Math.min(value.surfaceBlur,4):value.surfaceBlur}px`);
    root.style.setProperty("--glass-strength",String(value.glassIntensity/100));
    root.style.setProperty("--glass-opacity", (100-value.glass)+"%");
    root.style.setProperty("--ui-font", value.font === "Monocraft" && value.minecraft === "headings" ? "Nunito" : `"${value.font}"`);
    root.style.setProperty("--heading-font", `"${value.font}"`);
    root.style.setProperty("--sidebar-art", `url("${registry.find(p => p.id === value.sidebar)?.sidebar || defaultSidebarImage}")`);
    root.style.setProperty("--sidebar-blur", `${value.sidebarBlur}px`);
  }, [value,custom]);
  const savedRef=useRef(value);savedRef.current=value;
  const previewFrame=useRef(0);const pendingPreview=useRef<Partial<Preferences>>({});
  const preview=useCallback((patch:Partial<Preferences>)=>{
   pendingPreview.current={...pendingPreview.current,...patch};
   if(previewFrame.current)return;
   previewFrame.current=requestAnimationFrame(()=>{
    previewFrame.current=0;const patch=pendingPreview.current;pendingPreview.current={};
    const next={...savedRef.current,...patch};applyBackgroundTokens(document.documentElement,next);applySidebarTokens(document.documentElement,next);
    if(Object.keys(patch).some(key=>key in layoutDefaults))applyLayoutTokens(document.documentElement,next);
    if(Object.keys(patch).some(key=>key in materialDefaults||["surfaceOpacity","surfaceBlur","glassIntensity"].includes(key)))applyMaterialTokens(document.documentElement,next);
   });
  },[]);
  useEffect(()=>()=>cancelAnimationFrame(previewFrame.current),[]);
  useLayoutEffect(()=>{localStorage.setItem("canary-visual",JSON.stringify(value));},[value]);
  useEffect(()=>{const flush=()=>localStorage.setItem("canary-visual",JSON.stringify(savedRef.current));window.addEventListener("pagehide",flush);return()=>{window.removeEventListener("pagehide",flush);flush();};},[]);
  const update=useCallback((patch:Partial<Preferences>)=>{cancelAnimationFrame(previewFrame.current);previewFrame.current=0;pendingPreview.current={};setValue(old=>({...old,...patch,...(!("materialPreset" in patch)&&Object.keys(patch).some(key=>key in materialDefaults||["surfaceOpacity","surfaceBlur","glassIntensity"].includes(key))?{materialPreset:"custom"}:{})}));},[]);
  useEffect(()=>{
   // The native window starts hidden and may become visible without visibilitychange.
   // CSS owns animation-play-state; imperative pause/play would override it permanently.
   const sync=()=>{document.documentElement.dataset.documentVisible=String(!document.hidden);};sync();
   document.addEventListener("visibilitychange",sync);window.addEventListener("focus",sync);window.addEventListener("pageshow",sync);window.addEventListener(startupReadyEvent,sync);
   return()=>{document.removeEventListener("visibilitychange",sync);window.removeEventListener("focus",sync);window.removeEventListener("pageshow",sync);window.removeEventListener(startupReadyEvent,sync);};
  },[]);
  const effect=resolveAmbient(value.ambient,value.backgroundSource==="canary"?registry.find(p=>p.id===value.app)?.ambient:"off",value.sidebarBackgroundSource==="picture"?registry.find(p=>p.id===value.sidebar)?.ambient:"off");
  const image = value.backgroundSource==="canary"?registry.find(p => p.id === value.app)?.app:undefined;
  return <Context.Provider value={{registry,effectsPaused:value.focus?"focus":reduced?"motion":null,wallpapersReady,reload,value,native,update,preview }}>
    <div className="visual-backdrop" aria-hidden="true">
      <ArtworkFade source={image} className="global-wallpaper" />
      <div className="wallpaper-veil" />
    </div>
    {value.backgroundSource!=="canary"&&<div className="native-window-veil" aria-hidden="true"/>}
    {children}
    {!reduced && !value.focus && effect !== "off" && <AmbientParticles key={effect} effect={effect} density={value.density} speed={value.particleSpeed} opacity={value.particleOpacity} size={value.particleSize} wind={value.particleWind} quality={value.quality}/>}
  <DesktopBehavior />
  </Context.Provider>;
}
export function VisualPreferences({ russian,group="all",effectsControls }: { russian: boolean;group?:string;effectsControls?:ReactNode }) {
  const {value,update,preview,native}=useContext(Context);
  const text = appearanceMessages[russian ? "ru" : "en"];

  return <section className="visual-preferences" data-visual-group={group}>

    {(group==="all"||group==="layout")&&<div className="visual-appearance-group"><MaterialLayoutSettings russian={russian} value={value} update={update} group="cards"/><CatalogSettings russian={russian} value={value} update={update}/><PolishControls russian={russian} value={value} update={update} group="interface"/>{group==="all"&&native&&<details className="material-disclosure"><summary>{russian?"Материал окна Windows":"Windows window material"}</summary><WindowMaterialSettings russian={russian} value={value} update={update} preview={preview} nativeOnly {...native}/></details>}</div>}
    {(group==="all"||group==="background")&&<BackgroundSettings russian={russian} target={group==="background"?"app":undefined}/>}
    {group==="all"&&<EffectsPreferences russian={russian}>{effectsControls}</EffectsPreferences>}
    {(group==="all"||group==="typography")&&<div className="visual-typography-group"><h3>{russian?"Типографика":"Typography"}</h3><h4>{text["Interface font"]}</h4><div className="font-options">{fonts.map(font => <button key={font} style={{ fontFamily: `"${font}", Nunito, sans-serif` }} className={value.font === font ? "selected" : ""} aria-pressed={value.font === font} onClick={() => update({ font })}>{font}</button>)}</div>
    <h4>{text["Interface size"]}</h4><div className="font-options">{([90,100,110,120] as const).map(fontScale=><button key={fontScale} aria-pressed={value.fontScale===fontScale} className={value.fontScale===fontScale?"selected":""} onClick={()=>update({fontScale})}>{fontScale}%</button>)}</div>
    {value.font === "Monocraft" && <><h4>{text["Minecraft style"]}</h4><div className="font-options">{(["headings", "full"] as const).map(minecraft => <button key={minecraft} aria-pressed={value.minecraft === minecraft} className={value.minecraft === minecraft ? "selected" : ""} onClick={() => update({ minecraft })}>{minecraft === "headings" ? text["Headings"] : text["Full interface"]}</button>)}</div></>}
    </div>}
  </section>;
}

export function SidebarArtwork() {
  const { value,registry } = useContext(Context);
  if(value.sidebarBackgroundSource!=="picture"||(value.materialLinked?value.materialStyle:value.materialCategories.sidebar)==="solid")return null;
  return <ArtworkFade source={registry.find(p => p.id === value.sidebar)?.sidebar || defaultSidebarImage} className="sidebar-art" />;
}
export function WindowPreferencesPanel({russian}:{russian:boolean}){const {value,update,preview,native}=useContext(Context);return <><WindowControlsSettings russian={russian} value={value} update={update}/>{native&&<WindowMaterialSettings russian={russian} value={value} update={update} preview={preview} nativeOnly {...native}/>}</>;}
export function EffectsPreferences({russian,children}:{russian:boolean;children?:ReactNode}){
 const {value,update,effectsPaused}=useContext(Context);const text=appearanceMessages[russian?"ru":"en"];
 const preset=(p:string)=>{const settings={off:{ambient:"off" as const},low:{density:6,particleOpacity:25,particleSize:85,particleSpeed:75},medium:{density:12,particleOpacity:35,particleSize:110,particleSpeed:100},high:{density:24,particleOpacity:45,particleSize:125,particleSpeed:115},custom:{}};update({...settings[p as keyof typeof settings],effectPreset:p,...p!=="off"&&value.ambient==="off"?{ambient:"snow" as const}:{}});};
 const range=(name:string,n:number,min:number,max:number,change:(v:number)=>void,previewKey?:string)=><SmoothRange label={name} value={n} min={min} max={max} onCommit={change} previewKey={previewKey}/>;
 return <section className="effects-preferences"><h3>{russian?"Эффекты":"Effects"}</h3><h4>{text["Ambient effects"]}</h4><div className="font-options">{(["off","automatic","sakura","snow","autumn","embers"] as const).map(ambient=><button key={ambient} aria-pressed={value.ambient===ambient} className={value.ambient===ambient?"selected":""} onClick={()=>update({ambient,...ambient==="off"?{effectPreset:"off"}:value.effectPreset==="off"?{effectPreset:"custom"}:{},...value.particleOpacity<25?{particleOpacity:35}:{}})}>{ambient==="autumn"?(russian?"Осенние листья":"Autumn Leaves"):({off:text["Off"],automatic:text["Automatic"],sakura:text["Sakura"],snow:text["Snow"],embers:text["Fire Sparks"]})[ambient]}</button>)}</div>
 <p className="settings-note">{russian?"Выбранный эффект сохраняется при смене фона, включая свои изображения. «Автоматически» подбирает эффект к фону; если эффект не задан, используется снег.":"The selected effect stays active when changing wallpapers, including custom images. Automatic follows the wallpaper and uses snow when no effect is assigned."}</p>
 <p className="settings-note" role="status" hidden={!effectsPaused||value.ambient==="off"}>{effectsPaused==="focus"?(russian?"Частицы приостановлены режимом фокуса. Отключите его в разделе «Интерфейс и карточки», чтобы увидеть эффект.":"Focus mode pauses particles. Turn it off in Interface & cards to see the effect."):(russian?"Частицы приостановлены настройкой «Уменьшить анимацию» в лаунчере или системе. Выбранный эффект сохранён.":"Reduced motion in the launcher or system pauses particles. Your selected effect is saved.")}</p>
 <label>{russian?"Пресет частиц":"Effect preset"}<GlassSelect aria-label={russian?"Пресет частиц":"Effect preset"} value={value.effectPreset} onChange={e=>preset(e.target.value)}>{["off","low","medium","high","custom"].map(p=><option key={p} value={p}>{russian?({off:"Выключено",low:"Низкий",medium:"Средний",high:"Высокий",custom:"Свой"})[p as "off"]:p[0].toUpperCase()+p.slice(1)}</option>)}</GlassSelect></label>
 <div className="polish-range-grid">{range(russian?"Количество частиц":"Particle count",value.density,4,24,density=>update({density,effectPreset:"custom"}),"density")}{range(russian?"Размер частиц":"Particle size",value.particleSize,60,160,particleSize=>update({particleSize,effectPreset:"custom"}),"particleSize")}{range(russian?"Скорость частиц":"Particle speed",value.particleSpeed,50,150,particleSpeed=>update({particleSpeed,effectPreset:"custom"}),"particleSpeed")}{range(russian?"Непрозрачность частиц":"Particle opacity",value.particleOpacity,5,50,particleOpacity=>update({particleOpacity,effectPreset:"custom"}),"particleOpacity")}{range(russian?"Ветер":"Particle wind",value.particleWind,0,180,particleWind=>update({particleWind,effectPreset:"custom"}),"particleWind")}</div>
 <PolishControls russian={russian} value={value} update={update} group="effects"/>{children}</section>;
}
export function VisualQuality({ russian }: { russian: boolean }) {
  const { value, update } = useContext(Context);
  return <QualityControls russian={russian} value={value} update={update} />;
}

export function MaterialPreferencesPanel({russian}:{russian:boolean}) { const {value,update,preview}=useVisualAppearance();return <MaterialSettings russian={russian} value={value} update={update} preview={preview} excludeSidebar/>; }

export function InterfaceVisibilityPanel({ russian }: { russian: boolean }) {
  const { value, update } = useVisualAppearance();
  const label = russian
    ? "Показывать популярное в сообществе"
    : "Show popular community projects";
  return (
    <section className="visibility-settings">
      <h4>{russian ? "Видимость интерфейса" : "Interface visibility"}</h4>
      <div className="toggle-setting">
        <div>
          <b>{label}</b>
          <span>
            {russian
              ? "Показывает подборку популярных проектов на главной странице."
              : "Shows popular community projects on Home."}
          </span>
        </div>
        <button
          className={value.showCommunity ? "toggle on" : "toggle"}
          role="switch"
          aria-label={label}
          aria-checked={value.showCommunity}
          onClick={() => update({ showCommunity: !value.showCommunity })}
        >
          <i />
        </button>
      </div>
    </section>
  );
}

