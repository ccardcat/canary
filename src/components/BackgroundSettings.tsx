import {useState} from "react";
import {isTauri} from "@tauri-apps/api/core";
import {useVisualAppearance,type Preferences} from "./VisualAppearance";
import {useBackend} from "../services/backend";
import {SmoothRange} from "./SmoothRange";
import {WindowMaterialSettings} from "./WindowMaterial";
import {polishDefaults} from "./PolishControls";
import GlassSelect from "./GlassSelect";
import {materialCategories} from "./MaterialSystem";
import {BackgroundGallery} from "./BackgroundGallery";
import {defaultSidebarImage} from "../services/backgrounds";
export function BackgroundSettings({russian,target:fixedTarget}:{russian:boolean;target?:"app"|"sidebar"}){
 const {value,update,preview,registry,reload,native}=useVisualAppearance();const {run}=useBackend();
 const [selectedTarget,setTarget]=useState<"app"|"sidebar">("app"),[importing,setImporting]=useState(false);
 const target=fixedTarget??selectedTarget;
 const label=(ru:string,en:string)=>russian?ru:en,sidebar=target==="sidebar";
 const treatment=sidebar?value.sidebarTreatment:value.globalTreatment;
 const sidebarOpaque=sidebar&&(value.reduceTransparency||value.focus||value.quality==="low");
 const patch=(key:string,n:number|string):Partial<Preferences>=>sidebar?{sidebarTreatment:{...treatment,[key]:n}}:{globalTreatment:{...treatment,[key]:n}};
 const range=(name:string,n:number,min:number,max:number,toPatch:(n:number)=>Partial<Preferences>,unit="%")=><SmoothRange key={target+name} label={name} value={n} min={min} max={max} unit={unit} disabled={sidebarOpaque} onPreview={n=>preview(toPatch(n))} onCommit={n=>update(toPatch(n))}/>;
 const chosen=registry.find(p=>p.id===(sidebar?value.sidebar:value.app));const art=sidebar?chosen?.sidebar??defaultSidebarImage:chosen?.app;
 const desktopAvailable=!!native?.caps.supported.some(m=>m!=="solid");
 const sidebarStyle=value.materialLinked?value.materialStyle:value.materialCategories.sidebar;
 const picturePatch=():Partial<Preferences>=>({sidebarBackgroundSource:"picture",...sidebarStyle==="solid"?{materialLinked:false,materialCategories:{...(value.materialLinked?Object.fromEntries(materialCategories.map(key=>[key,value.materialStyle])) as typeof value.materialCategories:value.materialCategories),sidebar:"vibrancy"}}:{}});
 const choose=(id:string)=>update(sidebar?{sidebar:id,...picturePatch()}:{app:id,backgroundSource:"canary"});
 return <section className="background-settings">
  <div className="setting-intro"><h3>{sidebar?label("Фон боковой панели","Sidebar background"):label("Фон лаунчера","Launcher background")}</h3><p>{sidebar?label("Выберите картинку, цвет темы или свой однотонный цвет. Эти параметры меняют только панель.","Choose a picture, theme color or your own solid color. These controls affect only the sidebar."):label("Изменения видны сразу. Настройте картинку, её размытие и затемнение отдельно от карточек.","Changes are visible immediately. Adjust the picture, blur and shading separately from cards.")}</p></div>
  {!fixedTarget&&<div className="font-options background-target" role="group" aria-label={label("Настраиваемая область","Background target")}><button aria-pressed={!sidebar} onClick={()=>setTarget("app")}>{label("Лаунчер","Launcher")}</button><button aria-pressed={sidebar} onClick={()=>setTarget("sidebar")}>{label("Боковая панель","Sidebar")}</button></div>}
  {sidebar&&<div className="background-source-options" role="group" aria-label={label("Фон боковой панели","Sidebar background")}>
   {([['picture','Изображение','Picture','Готовый фон или своя картинка','Built-in or custom picture'],['theme','Цвет темы','Theme color','Однотонный фон в цветах лаунчера','Solid background that follows the launcher theme'],['color','Свой цвет','Custom color','Любой однотонный цвет без картинки','Your own solid color, without artwork']] as const).map(([source,ru,en,ruNote,enNote])=><button key={source} aria-pressed={value.sidebarBackgroundSource===source} onClick={()=>update(source==="picture"?picturePatch():{sidebarBackgroundSource:source})}><b>{label(ru,en)}</b><small>{label(ruNote,enNote)}</small></button>)}
  </div>}
  {sidebarOpaque&&<p className="settings-note" role="status">{label("Режим фокуса, уменьшение прозрачности или низкое качество делают фон панели непрозрачным. Отключите этот режим, чтобы настроить прозрачность и размытие.","Focus mode, Reduce transparency or Low quality make the sidebar opaque. Turn that mode off to adjust opacity and blur.")}</p>}
  {sidebar&&value.sidebarBackgroundSource==="picture"&&sidebarStyle==="solid"&&<p className="settings-note" role="status">{label("Материал «Сплошной» скрывает картинку. Нажмите «Изображение», чтобы включить её, или выберите другой материал панели ниже.","Solid material hides artwork. Press Picture to enable it, or choose another sidebar material below.")}</p>}
  {!sidebar&&<div className="background-source-options" role="group" aria-label={label("Источник фона","Background source")}>
   <button aria-pressed={value.backgroundSource==="canary"} onClick={()=>update({backgroundSource:"canary",app:value.app==="normal"?"meadow":value.app})}><b>{label("Изображение","Picture")}</b><small>{label("Готовый фон или своё изображение","Built-in or custom wallpaper")}</small></button>
   <button aria-pressed={value.backgroundSource==="solid"} onClick={()=>update({backgroundSource:"solid"})}><b>{label("Однотонный","Solid color")}</b><small>{label("Цвет текущей темы","Use the current theme color")}</small></button>
   <button disabled={!desktopAvailable} aria-pressed={value.backgroundSource==="desktop"} onClick={()=>update({backgroundSource:"desktop",material:native!.caps.supported.includes("acrylic")?"acrylic":native!.caps.supported.find(m=>m!=="solid")!})}><b>{label("Рабочий стол","Desktop")}</b><small>{desktopAvailable?label("Прозрачное окно Windows","Transparent Windows window"):label("Недоступно на этой системе","Unavailable on this system")}</small></button>
  </div>}
  {sidebar&&value.sidebarBackgroundSource!=="picture"?<>
   {value.sidebarBackgroundSource==="color"&&<label className="sidebar-color-control">{label("Цвет панели","Sidebar color")}<input type="color" aria-label={label("Цвет панели","Sidebar color")} value={value.sidebarColor} onChange={event=>update({sidebarColor:event.target.value})}/><span className="selectable">{value.sidebarColor.toUpperCase()}</span></label>}
   <div className="sidebar-color-preview" style={{background:value.sidebarBackgroundSource==="color"?value.sidebarColor:"var(--surface-sidebar)",color:value.sidebarBackgroundSource==="color"?"var(--sidebar-color-ink)":"var(--text)"}} aria-label={label("Предпросмотр цвета панели","Sidebar color preview")}><b>Canary</b><span>{label("Главная · Библиотека · Настройки","Home · Library · Settings")}</span></div>
   <SmoothRange label={label("Непрозрачность фона панели","Sidebar background opacity")} value={value.sidebarColorOpacity} min={20} max={100} unit="%" disabled={sidebarOpaque} onPreview={sidebarColorOpacity=>preview({sidebarColorOpacity})} onCommit={sidebarColorOpacity=>update({sidebarColorOpacity})}/>
   <p className="settings-note">{label("100% — сплошной цвет без фонового изображения. При меньшем значении сквозь панель виден фон лаунчера. Цвет текста подбирается автоматически.","100% gives a solid color without background artwork. Lower values reveal the launcher background. Text color is chosen automatically.")}</p>
  </>:(!sidebar&&value.backgroundSource!=="canary")?<>
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
   <BackgroundGallery russian={russian} selected={sidebar?value.sidebar:value.app} onSelect={choose} images={sidebar?registry.filter(p=>p.sidebar).map(p=>({...p,app:undefined})):registry.filter(p=>p.app)}/>
   <details className="polish-disclosure"><summary>{label("Цвет и кадрирование","Color and framing")}</summary><div className="polish-range-grid">
    {range(label("Яркость","Brightness"),treatment.brightness,50,130,n=>patch("brightness",n))}
    {range(label("Насыщенность","Saturation"),treatment.saturation,0,130,n=>patch("saturation",n))}
    {range(label("Затемнение по краям","Vignette"),treatment.vignette,0,90,n=>patch("vignette",n))}
    {range(label("Масштаб","Zoom"),treatment.zoom,100,140,n=>patch("zoom",n))}
   </div><label>{label("Положение","Position")}<GlassSelect disabled={sidebarOpaque} aria-label={label("Положение фона","Wallpaper position")} value={treatment.position} onChange={e=>update(patch("position",e.target.value))}>{[["center","По центру","Center"],["left","Слева","Left"],["right","Справа","Right"],["top","Сверху","Top"],["bottom","Снизу","Bottom"]].map(([id,ru,en])=><option key={id} value={id}>{russian?ru:en}</option>)}</GlassSelect></label></details>
   {isTauri()&&<div className="background-custom-actions"><button className="quiet-button" disabled={importing} onClick={()=>{setImporting(true);void run("import_wallpaper",{target}).then(reload).catch(()=>{}).finally(()=>setImporting(false));}}>{importing?label("Импорт…","Importing…"):label("Выбрать своё изображение","Choose custom image")}</button>{chosen?.custom&&<button className="quiet-button destructive" disabled={importing} onClick={()=>{setImporting(true);void run("remove_wallpaper",{id:chosen.id}).then(()=>{update({...value.app===chosen.id?{app:"meadow"}:{},...value.sidebar===chosen.id?{sidebar:"meadow"}:{}});return reload();}).catch(()=>{}).finally(()=>setImporting(false));}}>{label("Удалить изображение","Remove image")}</button>}</div>}
   <button className="quiet-button" onClick={()=>update(sidebar?{sidebarTreatment:{...polishDefaults.sidebarTreatment},sidebarIntensity:85,sidebarBlur:12}:{globalTreatment:{...polishDefaults.globalTreatment},intensity:85,blur:8})}>{label("Сбросить обработку фона","Reset background adjustments")}</button>
  </>}
  {(!sidebar&&native&&value.backgroundSource!=="desktop")&&<details className="polish-disclosure"><summary>{label("Материал окна Windows","Windows window material")}</summary><WindowMaterialSettings russian={russian} value={value} update={update} preview={preview} nativeOnly {...native}/></details>}
 </section>;
}
