import {useVisualAppearance} from "./VisualAppearance";
import {BackgroundSettings} from "./BackgroundSettings";
import {MaterialLayoutSettings} from "./MaterialSettings";
import {materialCategories,materialStyles,type SurfaceMaterial} from "./MaterialSystem";
import GlassSelect from "./GlassSelect";
import {SmoothRange} from "./SmoothRange";

export function SidebarSettings({russian,compact,setCompact}:{russian:boolean;compact:boolean;setCompact:(value:boolean)=>void}) {
  const {value,update,preview}=useVisualAppearance();
  const text=(ru:string,en:string)=>russian?ru:en;
  const names:Record<SurfaceMaterial,string>={solid:text("Сплошной","Solid"),soft:text("Мягкий","Soft"),vibrancy:"Vibrancy",glass:text("Стекло","Glass"),clear:text("Чистое стекло","Clear Glass"),liquid:text("Жидкое стекло","Liquid Glass"),transparent:text("Прозрачный","Transparent")};
  const style=value.materialLinked?value.materialStyle:value.materialCategories.sidebar;
  const setStyle=(sidebar:SurfaceMaterial)=>update({materialLinked:false,materialCategories:{...(value.materialLinked?Object.fromEntries(materialCategories.map(key=>[key,value.materialStyle])) as typeof value.materialCategories:value.materialCategories),sidebar}});
  return <section className="sidebar-settings">
    <h3>{text("Боковая панель","Sidebar")}</h3>
    <p className="settings-note">{text("Все настройки панели в одном месте. Изменения видны сразу; фон лаунчера настраивается отдельно.","All sidebar settings in one place. Changes appear immediately; the launcher background has its own settings.")}</p>
    <h4>{text("Расположение и размер","Position and size")}</h4>
    <div className="font-options" role="group" aria-label={text("Сторона боковой панели","Sidebar side")}>
      {(["left","right"] as const).map(side=><button key={side} aria-pressed={value.sidebarSide===side} onClick={()=>update({sidebarSide:side})}>{side==="left"?text("Слева","Left"):text("Справа","Right")}</button>)}
    </div>
    <MaterialLayoutSettings russian={russian} value={value} update={update} group="sidebar"/>
    <div className="toggle-setting"><div><b>{text("Компактная панель","Compact sidebar")}</b><span>{text("Оставляет только значки навигации. Панель можно раскрыть кнопкой внизу.","Show navigation icons only. Expand the sidebar with its bottom button.")}</span></div><button className={compact?"toggle on":"toggle"} role="switch" aria-label={text("Компактная панель","Compact sidebar")} aria-checked={compact} onClick={()=>setCompact(!compact)}><i/></button></div>
    <BackgroundSettings russian={russian} target="sidebar"/>
    <details className="material-disclosure"><summary>{text("Материал и глубина панели","Sidebar material and depth")}</summary>
      <label>{text("Материал боковой панели","Sidebar material")}<GlassSelect aria-label={text("Материал боковой панели","Sidebar material")} value={style} onChange={event=>setStyle(event.target.value as SurfaceMaterial)}>{materialStyles.map(material=><option key={material} value={material}>{names[material]}</option>)}</GlassSelect></label>
      <SmoothRange label={text("Интенсивность материала панели","Sidebar material intensity")} value={value.sidebarMaterialIntensity} min={0} max={150} unit="%" onPreview={sidebarMaterialIntensity=>preview({sidebarMaterialIntensity})} onCommit={sidebarMaterialIntensity=>update({sidebarMaterialIntensity})}/>
      <p className="settings-note">{text("Материал меняет глубину и отражения только этой панели. Однотонный фон не содержит изображения; его непрозрачность задаётся выше.","Material changes depth and reflections for this sidebar only. Solid backgrounds contain no artwork; adjust their opacity above.")}</p>
    </details>
  </section>;
}
