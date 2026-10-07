import {useState} from "react";
import {isTauri} from "@tauri-apps/api/core";
import {useVisualAppearance,type Preferences} from "./VisualAppearance";
import {useBackend} from "../services/backend";
import {SmoothRange} from "./SmoothRange";
import {WindowMaterialSettings} from "./WindowMaterial";
import {polishDefaults} from "./PolishControls";
import GlassSelect from "./GlassSelect";
export function BackgroundSettings({russian}:{russian:boolean}){
 const {value,update,preview,registry,reload,native}=useVisualAppearance();const {run}=useBackend();
 const [target,setTarget]=useState<"app"|"sidebar">("app"),[importing,setImporting]=useState(false);
 const label=(ru:string,en:string)=>russian?ru:en,sidebar=target==="sidebar";
 const treatment=sidebar?value.sidebarTreatment:value.globalTreatment;
 const sidebarOpaque=sidebar&&(value.reduceTransparency||value.focus||value.quality==="low");
 const patch=(key:string,n:number|string):Partial<Preferences>=>sidebar?{sidebarTreatment:{...treatment,[key]:n}}:{globalTreatment:{...treatment,[key]:n}};
 const range=(name:string,n:number,min:number,max:number,toPatch:(n:number)=>Partial<Preferences>,unit="%")=><SmoothRange key={target+name} label={name} value={n} min={min} max={max} unit={unit} disabled={sidebarOpaque} onPreview={n=>preview(toPatch(n))} onCommit={n=>update(toPatch(n))}/>;
 const chosen=registry.find(p=>p.id===(sidebar?value.sidebar:value.app));const art=sidebar?chosen?.sidebar??"/backgrounds/sidebar-bg.webp":chosen?.app;
 const desktopAvailable=!!native?.caps.supported.some(m=>m!=="solid");
 const choose=(id:string)=>{const p=registry.find(p=>p.id===id);update(value.linked&&p?.app&&p.sidebar?{app:id,sidebar:id,backgroundSource:"canary"}:sidebar?{sidebar:id}:{app:id,backgroundSource:"canary"});};
 return <section className="background-settings">
  <div className="setting-intro"><h3>{label("Фон лаунчера","Launcher background")}</h3><p>{label("Изменения видны сразу. Настройте картинку, её размытие и затемнение отдельно от карточек.","Changes are visible immediately. Adjust the picture, blur and shading separately from cards.")}</p></div>
  <div className="font-options background-target" role="group" aria-label={label("Настраиваемая область","Background target")}><button aria-pressed={!sidebar} onClick={()=>setTarget("app")}>{label("Лаунчер","Launcher")}</button><button aria-pressed={sidebar} onClick={()=>setTarget("sidebar")}>{label("Боковая панель","Sidebar")}</button></div>
  {sidebarOpaque&&<p className="settings-note" role="status">{label("Сейчас панель непрозрачна. Отключите уменьшение прозрачности, фокус-режим или низкое качество, чтобы настроить её фон.","The sidebar is currently opaque. Turn off Reduce transparency, Focus mode or Low quality to adjust its background.")}</p>}
  {!sidebar&&<div className="background-source-options" role="group" aria-label={label("Источник фона","Background source")}>
   <button aria-pressed={value.backgroundSource==="canary"} onClick={()=>update({backgroundSource:"canary",app:value.app==="normal"?"green":value.app})}><b>{label("Изображение","Picture")}</b><small>{label("Готовый фон или своё изображение","Built-in or custom wallpaper")}</small></button>
   <button aria-pressed={value.backgroundSource==="solid"} onClick={()=>update({backgroundSource:"solid"})}><b>{label("Однотонный","Solid color")}</b><small>{label("Цвет текущей темы","Use the current theme color")}</small></button>
   <button disabled={!desktopAvailable} aria-pressed={value.backgroundSource==="desktop"} onClick={()=>update({backgroundSource:"desktop",material:native!.caps.supported.includes("acrylic")?"acrylic":native!.caps.supported.find(m=>m!=="solid")!})}><b>{label("Рабочий стол","Desktop")}</b><small>{desktopAvailable?label("Прозрачное окно Windows","Transparent Windows window"):label("Недоступно на этой системе","Unavailable on this system")}</small></button>
  </div>}
  {(!sidebar&&value.backgroundSource!=="canary")?<>
   <p className="settings-note">{value.backgroundSource==="solid"?label("Для картинки и её размытия выберите «Изображение».","Choose Picture to adjust wallpaper and its blur."):label("Системное размытие задаёт Windows. Прозрачность окна настраивается ниже.","Windows controls the desktop blur. Adjust window transparency below.")}</p>
   {value.backgroundSource==="desktop"&&native&&<WindowMaterialSettings russian={russian} value={value} update={update} preview={preview} nativeOnly {...native}/>}
  </>:<>
   <div className={"background-live-preview "+(sidebar?"sidebar-preview":"launcher-preview")} aria-label={label("Предпросмотр фона","Background preview")}>
    <div className="background-live-art" style={art?{backgroundImage:'url("'+art+'")'}:{}}/>
    <div className="background-live-veil"/><div className="background-live-copy"><b>Canary</b><span>{label("Ваш следующий мир","Your next world")}</span></div>
   </div>
   <div className="background-primary-controls">
    {range(label("Видимость изображения","Wallpaper visibility"),sidebar?value.sidebarIntensity:value.intensity,0,100,n=>sidebar?{sidebarIntensity:n}:{intensity:n})}
    {range(label("Размытие изображения","Wallpaper blur"),sidebar?value.sidebarBlur:value.blur,0,sidebar?20:32,n=>sidebar?{sidebarBlur:n}:{blur:n}," px")}
    {range(label(sidebar?"Тонирование панели":"Затемнение фона",sidebar?"Sidebar tint":"Background shading"),treatment.overlay,0,100,n=>patch("overlay",n))}
   </div>
   <p className="settings-note">{label("Больше видимости — ярче картинка. Размытие смягчает детали. Затемнение помогает читать текст.","More visibility reveals the picture. Blur softens details. Shading keeps text readable.")}</p>
   <h4>{label("Выбрать изображение","Choose wallpaper")}</h4>
   <div className="background-options">{(sidebar?[{id:"default",name:label("По умолчанию","Default"),sidebar:"/backgrounds/sidebar-bg.webp"},...registry.filter(p=>p.sidebar)]:registry.filter(p=>p.app)).map(p=><button key={p.id} aria-pressed={(sidebar?value.sidebar:value.app)===p.id} onClick={()=>choose(p.id)}><span className="background-preview" style={{backgroundImage:'url("'+("thumbnail" in p&&p.thumbnail||("app" in p&&!sidebar?p.app:p.sidebar))+'")'}}/><span>{p.name}</span></button>)}</div>
   <details className="polish-disclosure"><summary>{label("Цвет и кадрирование","Color and framing")}</summary><div className="polish-range-grid">
    {range(label("Яркость","Brightness"),treatment.brightness,50,130,n=>patch("brightness",n))}
    {range(label("Насыщенность","Saturation"),treatment.saturation,0,130,n=>patch("saturation",n))}
    {range(label("Затемнение по краям","Vignette"),treatment.vignette,0,90,n=>patch("vignette",n))}
    {range(label("Масштаб","Zoom"),treatment.zoom,100,140,n=>patch("zoom",n))}
   </div><label>{label("Положение","Position")}<GlassSelect disabled={sidebarOpaque} aria-label={label("Положение фона","Wallpaper position")} value={treatment.position} onChange={e=>update(patch("position",e.target.value))}>{[["center","По центру","Center"],["left","Слева","Left"],["right","Справа","Right"],["top","Сверху","Top"],["bottom","Снизу","Bottom"]].map(([id,ru,en])=><option key={id} value={id}>{russian?ru:en}</option>)}</GlassSelect></label></details>
   {isTauri()&&<div className="background-custom-actions"><button className="quiet-button" disabled={importing} onClick={()=>{setImporting(true);void run("import_wallpaper",{target:value.linked?"both":target}).then(reload).catch(()=>{}).finally(()=>setImporting(false));}}>{importing?label("Импорт…","Importing…"):label("Выбрать своё изображение","Choose custom image")}</button>{chosen?.custom&&<button className="quiet-button destructive" disabled={importing} onClick={()=>{setImporting(true);void run("remove_wallpaper",{id:chosen.id}).then(()=>{update({...value.app===chosen.id?{app:"green"}:{},...value.sidebar===chosen.id?{sidebar:"default"}:{}});return reload();}).catch(()=>{}).finally(()=>setImporting(false));}}>{label("Удалить изображение","Remove image")}</button>}</div>}
   <button className="quiet-button" onClick={()=>update(sidebar?{sidebarTreatment:{...polishDefaults.sidebarTreatment},sidebarIntensity:85,sidebarBlur:12}:{globalTreatment:{...polishDefaults.globalTreatment},intensity:85,blur:8})}>{label("Сбросить обработку фона","Reset background adjustments")}</button>
  </>}
  <label className="material-check"><input type="checkbox" checked={value.linked} onChange={e=>update({linked:e.target.checked,...e.target.checked&&chosen?.app&&chosen.sidebar?{app:chosen.id,sidebar:chosen.id}:{}})}/>{label("Одна картинка для лаунчера и боковой панели","Use one picture for launcher and sidebar")}</label>
  {(!sidebar&&native&&value.backgroundSource!=="desktop")&&<details className="polish-disclosure"><summary>{label("Материал окна Windows","Windows window material")}</summary><WindowMaterialSettings russian={russian} value={value} update={update} preview={preview} nativeOnly {...native}/></details>}
 </section>;
}
