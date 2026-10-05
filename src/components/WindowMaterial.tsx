import GlassSelect from "./GlassSelect";
import {useEffect,useRef,useState} from "react";
import {invoke,isTauri} from "@tauri-apps/api/core";
export type Material = "solid" | "transparent" | "acrylic" | "mica" | "mica-alt";
export const windowDefaults = {
  backgroundSource: "canary" as "canary"|"desktop"|"solid", material: "solid" as Material,
  windowTransparency: 55, surfaceOpacity: 82, surfaceBlur: 16, tint: "theme" as "neutral"|"theme"|"strong",
  vibrancyPreset: "off", glassIntensity: 35, frost: false,
  titlebarBranding: "icon-text" as "icon"|"text"|"icon-text"|"hidden",
  windowControls: "windows" as "windows"|"minimal"|"compact"|"traffic-lights",
  controlsPosition: "right" as "left"|"right", heroRotation: true, heroSpeed: 9,
  effectPreset: "medium", particleWind: 100,
};
export type WindowPreferences = typeof windowDefaults;
interface Capabilities {platform:string;build:number;supported:Material[]}
interface Applied {requested:Material;actual:Material;fallback:boolean;reason?:string}
const fallbackCaps:Capabilities={platform:"browser",build:0,supported:["solid"]};
const names:Record<Material,string>={solid:"Solid",transparent:"Transparent",acrylic:"Acrylic",mica:"Mica","mica-alt":"Mica Alt"};

export function useNativeMaterial(value:WindowPreferences) {
  const [caps,setCaps]=useState(fallbackCaps);
  const [applied,setApplied]=useState<Applied>({requested:"solid",actual:"solid",fallback:false});
  const [theme,setTheme]=useState(document.documentElement.dataset.mode||"dark");
  const [fullscreen,setFullscreen]=useState(false);
  const queue=useRef(Promise.resolve());const sequence=useRef(0);
  useEffect(()=>{if(!isTauri())return;let live=true;void invoke<Capabilities>("window_material_capabilities").then(v=>{if(live&&v?.supported)setCaps(v);}).catch(()=>{});return()=>{live=false;};},[]);
  useEffect(()=>{
    const sync=()=>{setTheme(document.documentElement.dataset.mode||"dark");setFullscreen(document.documentElement.dataset.windowFullscreen==="true");};
    const observer=new MutationObserver(sync);observer.observe(document.documentElement,{attributes:true,attributeFilter:["data-mode","data-window-fullscreen"]});sync();return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const current=++sequence.current;
    const requested=value.backgroundSource==="desktop"?value.material:"solid";
    if(!isTauri()){setApplied({requested,actual:"solid",fallback:requested!=="solid",reason:"unsupported-platform-version"});return;}
    const timer=setTimeout(()=>{
      queue.current=queue.current.catch(()=>{}).then(async()=>{
        if(current!==sequence.current)return;
        try{const result=await invoke<Applied>("apply_window_material",{requested,theme,tint:value.tint,transparency:value.windowTransparency});
          if(current===sequence.current&&result?.actual)setApplied(result);
        }catch{if(current===sequence.current)setApplied({requested,actual:"solid",fallback:true,reason:"native-effect-failed"});}
      });
    },160);
    return()=>{clearTimeout(timer);sequence.current++;};
  },[value.backgroundSource,value.material,value.tint,value.windowTransparency,theme,fullscreen]);
  useEffect(()=>{document.documentElement.dataset.windowMaterial=applied.actual;},[applied.actual]);
  return {caps,applied};
}

type Props={russian:boolean;value:WindowPreferences;update:(patch:Partial<WindowPreferences>)=>void;caps:Capabilities;applied:Applied};
export function WindowMaterialSettings({russian,value,update,caps,applied}:Props){
  const label=(en:string,ru:string)=>russian?ru:en;
  const range=(name:string,number:number,min:number,max:number,change:(v:number)=>void,unit="%")=><label className="visual-range"><span>{name}<output>{number}{unit}</output></span><input type="range" aria-label={name} min={min} max={max} value={number} onChange={e=>change(Number(e.target.value))}/></label>;
  const preset=(p:string)=>{const patches:Record<string,Partial<WindowPreferences>>={off:{backgroundSource:"canary",material:"solid",windowTransparency:0,surfaceOpacity:94,glassIntensity:15},subtle:{backgroundSource:"desktop",material:"mica",windowTransparency:25,surfaceOpacity:90,glassIntensity:20},balanced:{backgroundSource:"desktop",material:"acrylic",windowTransparency:50,surfaceOpacity:82,glassIntensity:35},glass:{backgroundSource:"desktop",material:"acrylic",windowTransparency:75,surfaceOpacity:68,glassIntensity:55},custom:{}};update({...patches[p],vibrancyPreset:p});};
  return <section className="visual-preferences window-material-settings">
    <h3>{label("Window Material / Vibrancy","Материал окна / Vibrancy")}</h3>
    <label>{label("Background source","Источник фона")}<GlassSelect aria-label={label("Background source","Источник фона")} value={value.backgroundSource} onChange={e=>update({backgroundSource:e.target.value as WindowPreferences["backgroundSource"],...(e.target.value==="desktop"&&value.material==="solid"?{material:caps.supported.includes("acrylic")?"acrylic":caps.supported.includes("transparent")?"transparent":"solid"}:{})})}><option value="canary">Canary Background</option><option value="desktop">Desktop Vibrancy</option><option value="solid">Solid</option></GlassSelect></label>
    <label>{label("Window Material","Материал окна")}<GlassSelect aria-label={label("Window Material","Материал окна")} value={value.material} onChange={e=>update({material:e.target.value as Material,backgroundSource:e.target.value==="solid"?"solid":"desktop",vibrancyPreset:"custom"})}>{(Object.keys(names) as Material[]).map(m=><option key={m} value={m} disabled={!caps.supported.includes(m)}>{names[m]}{caps.supported.includes(m)?"":label(" · unavailable"," · недоступно")}</option>)}</GlassSelect></label>
    <p className="settings-note" role="status">{label("Active material: ","Активный материал: ")}{names[applied.actual]}{applied.fallback?label(" — a supported fallback is active."," — используется поддерживаемый запасной режим."):""}{caps.platform!=="windows"?label(" Native desktop vibrancy requires Windows."," Нативный desktop vibrancy доступен в Windows."):""}</p>
    <label>{label("Vibrancy preset","Пресет Vibrancy")}<GlassSelect value={value.vibrancyPreset} onChange={e=>preset(e.target.value)}>{["off","subtle","balanced","glass","custom"].map(p=><option key={p} value={p}>{p[0].toUpperCase()+p.slice(1)}</option>)}</GlassSelect></label>
    {range(label("Window transparency","Прозрачность окна"),value.windowTransparency,0,100,v=>update({windowTransparency:v,vibrancyPreset:"custom"}))}
    {range(label("Surface opacity","Непрозрачность поверхностей"),value.surfaceOpacity,55,100,v=>update({surfaceOpacity:v,vibrancyPreset:"custom"}))}
    {range(label("UI surface blur","Размытие UI-поверхностей"),value.surfaceBlur,0,32,v=>update({surfaceBlur:v}),"px")}
    <p className="settings-note">{label("This blur changes glass surfaces inside Canary. Windows controls the native desktop blur radius.","Этот ползунок размывает стеклянные поверхности внутри Canary. Радиус нативного размытия рабочего стола задаёт Windows.")}</p>
    <label>{label("Tint intensity","Интенсивность тонирования")}<GlassSelect value={value.tint} onChange={e=>update({tint:e.target.value as WindowPreferences["tint"]})}>{["neutral","theme","strong"].map(t=><option key={t} value={t}>{t[0].toUpperCase()+t.slice(1)}</option>)}</GlassSelect></label>
    <h4>Liquid Glass</h4><div className="font-options" role="group" aria-label={label("Glass strength preset","Пресет интенсивности стекла")}>{([[15,"Low","Низкая"],[35,"Medium","Средняя"],[55,"High","Высокая"]] as const).map(([strength,en,ru])=><button key={strength} aria-pressed={value.glassIntensity===strength} onClick={()=>update({glassIntensity:strength})}>{label(en,ru)}</button>)}<span>{![15,35,55].includes(value.glassIntensity)?label("Custom","Своя"):""}</span></div>{range(label("Glass intensity","Интенсивность стекла"),value.glassIntensity,0,70,v=>update({glassIntensity:v}))}
    <label className="material-check"><input type="checkbox" checked={value.frost} onChange={e=>update({frost:e.target.checked})}/>{label("Frost texture","Текстура матового стекла")}</label>
  </section>;
}
export function WindowControlsSettings({russian,value,update}:Omit<Props,"caps"|"applied">){
  const label=(en:string,ru:string)=>russian?ru:en;
  return <section className="visual-preferences"><h3>{label("Window","Окно")}</h3><p className="settings-note">{label("F11 enters true fullscreen and restores the previous size or maximized state. Escape closes a dialog first.","F11 включает настоящий fullscreen и восстанавливает размер или развёрнутое состояние. Escape сначала закрывает диалог.")}</p>
    <label>{label("Titlebar branding","Брендинг заголовка")}<GlassSelect aria-label={label("Titlebar branding","Брендинг заголовка")} value={value.titlebarBranding} onChange={e=>update({titlebarBranding:e.target.value as WindowPreferences["titlebarBranding"]})}>{[["icon","Icon"],["text","Text"],["icon-text","Icon + Text"],["hidden","Hidden"]].map(([v,n])=><option key={v} value={v}>{n}</option>)}</GlassSelect></label>
    <label>{label("Window controls style","Стиль кнопок окна")}<GlassSelect aria-label={label("Window controls style","Стиль кнопок окна")} value={value.windowControls} onChange={e=>update({windowControls:e.target.value as WindowPreferences["windowControls"]})}>{[["windows","Windows"],["minimal","Minimal"],["compact","Compact"],["traffic-lights","Traffic Lights"]].map(([v,n])=><option key={v} value={v}>{n}</option>)}</GlassSelect></label>
    <label>{label("Control position","Расположение кнопок")}<GlassSelect value={value.controlsPosition} onChange={e=>update({controlsPosition:e.target.value as WindowPreferences["controlsPosition"]})}><option value="left">{label("Left","Слева")}</option><option value="right">{label("Right","Справа")}</option></GlassSelect></label>
  </section>;
}
