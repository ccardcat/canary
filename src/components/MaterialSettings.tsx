import {SmoothRange} from "./SmoothRange";
import {useLayoutEffect,useRef} from "react";
import {Play, Pencil, Trash2, Star, RotateCcw} from 'lucide-react';
import GlassSelect from './GlassSelect';
import {materialStyles, materialCategories, materialPresetPatch, primaryMaterialPresets, applyMaterialTokens, type MaterialPreset, type LayoutPreferences, type MaterialPreferences, type MaterialCategory, type SurfaceMaterial} from './MaterialSystem';
type Values=MaterialPreferences & LayoutPreferences & {surfaceOpacity:number;surfaceBlur:number;quality?:string;focus?:boolean};
const materialDescriptions = {
 en: {solid:'Dense opaque surfaces',soft:'Soft surfaces with gentle depth',vibrancy:'Background colors softly flow through the interface',glass:'Blurred translucent glass',clear:'Cleaner, more transparent glass',liquid:'Soft layered glass with depth',transparent:'Minimal, almost transparent surfaces'},
 ru: {solid:'Плотные непрозрачные поверхности',soft:'Мягкие поверхности с лёгкой глубиной',vibrancy:'Цвета фона мягко проходят через интерфейс',glass:'Размытое полупрозрачное стекло',clear:'Более чистое и прозрачное стекло',liquid:'Мягкое многослойное стекло с глубиной',transparent:'Минимальные почти прозрачные поверхности'},
};
function MaterialSwatch({preset,value}:{preset:MaterialPreset;value:Values}) {
 const ref=useRef<HTMLSpanElement>(null);
 useLayoutEffect(()=>{if(ref.current)applyMaterialTokens(ref.current,{...value,...materialPresetPatch(preset),glassIntensity:35,quality:'balanced',focus:false});},[preset,value]);
 return <span ref={ref} className="material-swatch" aria-hidden="true"><span className="material-swatch-sheet"><i/><i/><i/></span></span>;
}
export default function MaterialSettings({russian,value,update,preview}:{russian:boolean;value:Values;update:(patch:Partial<Values>)=>void;preview?:(patch:Partial<Values>)=>void}){
 const label=(en:string,ru:string)=>russian?ru:en;
 const names:Record<SurfaceMaterial,string>={solid:label('Solid','Сплошной'),soft:label('Soft','Мягкий'),vibrancy:'Vibrancy',glass:label('Glass','Стекло'),clear:label('Clear Glass','Чистое стекло'),liquid:label('Liquid Glass','Жидкое стекло'),transparent:label('Transparent','Прозрачный')};
 const categories:Record<MaterialCategory,string>={cards:label('Card material','Материал карточек'),buttons:label('Button style','Стиль кнопок'),sidebar:label('Sidebar material','Материал боковой панели'),popovers:label('Popovers / dropdowns','Меню и списки'),dialogs:label('Dialogs / modals','Диалоги'),inputs:label('Input controls','Поля ввода'),titlebar:label('Titlebar material','Материал заголовка'),floating:label('Floating controls','Плавающие элементы')};
 const presets:Record<string,string>={solid:names.solid,soft:names.soft,glass:names.glass,canary:'Canary Default',graphite:label('Graphite','Графит'),vibrancy:'Vibrancy',clear:label('Clear Glass','Чистое стекло'),liquid:names.liquid,minimal:label('Minimal','Минимал'),transparent:names.transparent,amoled:'AMOLED Glass'};
 const change=(patch:Partial<Values>)=>update({...patch,materialPreset:'custom'});
 const categoryValues=value.materialLinked?Object.fromEntries(materialCategories.map(key=>[key,value.materialStyle])) as Values["materialCategories"]:value.materialCategories;
 const selectCategory=(key:MaterialCategory)=><label key={key}>{categories[key]}<GlassSelect aria-label={categories[key]} value={value.materialLinked?value.materialStyle:value.materialCategories[key]} onChange={e=>change({materialLinked:false,materialCategories:{...categoryValues,[key]:e.target.value as SurfaceMaterial}})}>{materialStyles.map(s=><option key={s} value={s}>{names[s]}</option>)}</GlassSelect></label>;
 const range=(name:string,key:'materialIntensity'|'surfaceBlur'|'surfaceOpacity'|'materialSaturation'|'materialBrightness'|'materialContrast'|'materialHighlight'|'materialBorder'|'materialShadow'|'materialRadius'|'sidebarMaterialIntensity'|'titlebarMaterialIntensity',min:number,max:number)=><SmoothRange key={key} label={name} value={value[key]} min={min} max={max} unit={key==="surfaceBlur"||key==="materialRadius"?" px":"%"} disabled={(key==="surfaceBlur"||key==="surfaceOpacity")&&( (value.materialLinked?value.materialStyle:value.materialCategories.cards)==="solid"||(key==="surfaceBlur"&&(value.materialLinked?value.materialStyle:value.materialCategories.cards)==="transparent")||value.reduceTransparency||value.quality==="low"||value.focus)} onPreview={n=>preview?.({[key]:n})} onCommit={n=>key==="materialRadius"?update({materialRadius:n}):change({[key]:n})}/>;
 return <section className="material-settings" aria-label={label('Materials','Материалы')}>
  <div className="setting-intro"><div className="overline">CANARY / MATERIALS</div><h3>{label('Surfaces','Поверхности')}</h3><p>{label('Choose a style, then adjust card opacity and blur. Changes appear immediately.','Выберите стиль, затем настройте прозрачность карточек и размытие. Изменения видны сразу.')}</p></div>
  <label>{label('Material preset','Пресет материалов')}<GlassSelect aria-label={label('Material preset','Пресет материалов')} value={value.materialPreset} onChange={e=>update(materialPresetPatch(e.target.value as MaterialPreset))}>{['canary',...primaryMaterialPresets,...(['graphite','minimal','amoled'].includes(value.materialPreset)?[value.materialPreset]:[])].map(id=>[id,presets[id]]).map(([id,name])=><option key={id} value={id}>{name}</option>)}{value.materialPreset==='custom'&&<option value="custom">{label('Custom','Свой')}</option>}</GlassSelect></label>
  <div className="material-controls">{range(label("Surface opacity","Непрозрачность поверхностей"),"surfaceOpacity",20,100)}{range(label('Surface backdrop blur','Размытие за поверхностями'),'surfaceBlur',0,32)}</div>
  <p className="settings-note">{label("Opacity controls cards and panels; menus and dialogs keep readable text. Solid is opaque; Transparent has no blur. Choose Glass, Clear Glass or Vibrancy to adjust both.","Непрозрачность меняет карточки и панели; меню и диалоги сохраняют читаемость. «Сплошной» непрозрачный; «Прозрачный» работает без размытия. Для обеих настроек выберите «Стекло», «Чистое стекло» или Vibrancy.")}</p>
  {(value.reduceTransparency||value.quality==="low"||value.focus)&&<p role="status" className="settings-note">{label("Transparency is disabled by Reduce transparency, Focus mode or Low quality. Turn that mode off to adjust glass.","Прозрачность отключена режимом фокуса, уменьшением прозрачности или низким качеством. Отключите этот режим для настройки стекла.")}</p>}
  <div className="material-preview" aria-label={label('Live material preview','Живой предпросмотр материалов')}>
    <aside className="material-preview-sidebar"><Star size={18}/><span>Canary</span></aside><article className="material-preview-card"><b>{label('Your next world','Ваш следующий мир')}</b><p>Minecraft · Fabric</p><div className="runtime-inline"><button className="primary-button" type="button"><Play size={14}/>{label('Play','Играть')}</button><button className="quiet-button" type="button">{label('Details','Подробнее')}</button><button className="material-icon" type="button" aria-label={label('Rename preview','Переименовать в предпросмотре')} data-tooltip={label('Rename','Переименовать')}><Pencil size={16}/></button><button className="material-icon destructive" type="button" aria-label={label('Delete preview','Удалить в предпросмотре')} data-tooltip={label('Delete','Удалить')}><Trash2 size={16}/></button></div></article>
  </div>
  <details className="material-disclosure"><summary>{label("Compare material styles","Сравнить материалы")}</summary>  <div className="material-preset-grid" role="group" aria-label={label('Material previews','Предпросмотр материалов')}>
   {primaryMaterialPresets.map(id=><button type="button" key={id} className="material-preset-control" aria-pressed={value.materialPreset===id} data-tooltip={materialDescriptions[russian?'ru':'en'][id]} onClick={()=>update(materialPresetPatch(id))}><MaterialSwatch preset={id} value={value}/><b>{names[id]}</b><small>{materialDescriptions[russian?'ru':'en'][id]}</small></button>)}
  </div>
</details>
  <details className="material-disclosure material-advanced"><summary>{label('Advanced materials','Дополнительные настройки материалов')}</summary><label className="material-check"><input type="checkbox" checked={value.materialLinked} onChange={e=>change({materialLinked:e.target.checked,materialStyle:value.materialCategories.cards,materialCategories:{...categoryValues}})}/>{label("Use one style everywhere","Использовать один стиль везде")}</label>
  {value.materialLinked?<label>{label("Shared material","Общий материал")}<GlassSelect aria-label={label("Shared material","Общий материал")} value={value.materialStyle} onChange={e=>change({materialStyle:e.target.value as SurfaceMaterial})}>{materialStyles.map(s=><option key={s} value={s}>{names[s]}</option>)}</GlassSelect></label>:<div className="material-controls">{materialCategories.map(selectCategory)}</div>}
  <div className="material-controls">{range(label('Material intensity','Интенсивность материала'),'materialIntensity',0,100)}{range(label('Saturation','Насыщенность'),'materialSaturation',50,160)}{range(label('Brightness','Яркость'),'materialBrightness',80,120)}{range(label('Contrast','Контраст'),'materialContrast',80,120)}{range(label('Edge highlight','Светлый кант'),'materialHighlight',0,160)}{range(label('Border strength','Выраженность края'),'materialBorder',30,160)}{range(label('Shadow depth','Глубина теней'),'materialShadow',0,160)}{range(label('Corner radius','Скругление'),'materialRadius',8,28)}{range(label('Sidebar intensity','Интенсивность боковой панели'),'sidebarMaterialIntensity',0,150)}{range(label('Titlebar intensity','Интенсивность заголовка'),'titlebarMaterialIntensity',0,150)}</div><label className="material-check"><input type="checkbox" checked={value.materialAccent} onChange={e=>change({materialAccent:e.target.checked})}/>{label('Subtle accent tint','Лёгкий оттенок акцента')}</label></details>
  <label className="material-check"><input type="checkbox" checked={value.reduceTransparency} onChange={e=>change({reduceTransparency:e.target.checked})}/>{label('Reduce transparency','Уменьшить прозрачность')}</label>
  <button className="quiet-button" onClick={()=>update(materialPresetPatch())}><RotateCcw size={14}/>{label('Reset materials','Сбросить материалы')}</button>
 </section>;
}

export function MaterialLayoutSettings({
  russian,
  value,
  update,
}: {
  russian: boolean;
  value: Values;
  update: (patch: Partial<Values>) => void;
}) {
  const label = (en: string, ru: string) => (russian ? ru : en);
  const change = (patch: Partial<Values>) => update(patch);
  return (
    <div className="material-controls material-layout-controls">
      <label>
        <span className="material-control-label">{label("Sidebar layout", "Расположение боковой панели")}</span>
        <GlassSelect
          aria-label={label("Sidebar layout", "Расположение боковой панели")}
          value={value.sidebarMode}
          onChange={(e) =>
            change({ sidebarMode: e.target.value as Values["sidebarMode"] })
          }
        >
          <option value="attached">{label("Attached", "Прикреплённая")}</option>
          <option value="floating">{label("Floating", "Плавающая")}</option>
        </GlassSelect>
      </label>
      <label>
        <span className="material-control-label">{label("Instance card layout", "Карточки экземпляров")}</span>
        <GlassSelect
          aria-label={label("Instance card layout", "Карточки экземпляров")}
          value={value.instanceLayout}
          onChange={(e) =>
            update({
              instanceLayout: e.target.value as Values["instanceLayout"],
            })
          }
        >
          <option value="comfortable">{label("Comfortable", "Обычные")}</option>
          <option value="compact">{label("Compact", "Компактные")}</option>
        </GlassSelect>
      </label>
      <label>
        <span className="material-control-label">{label("Card artwork", "Изображение карточки")}</span>
        <GlassSelect
          aria-label={label("Card artwork", "Изображение карточки")}
          value={value.instanceArtwork}
          onChange={(e) =>
            update({
              instanceArtwork: e.target.value as Values["instanceArtwork"],
            })
          }
        >
          <option value="full">{label("Full", "Полное")}</option>
          <option value="ambient">{label("Ambient", "Фоновое")}</option>
          <option value="off">{label("Off", "Выключено")}</option>
        </GlassSelect>
      </label>
      <label>
        <span className="material-control-label">{label("Button density", "Плотность кнопок")}</span>
        <GlassSelect
          aria-label={label("Button density", "Плотность кнопок")}
          value={value.buttonDensity}
          onChange={(e) =>
            update({ buttonDensity: e.target.value as Values["buttonDensity"] })
          }
        >
          <option value="comfortable">{label("Comfortable", "Обычная")}</option>
          <option value="compact">{label("Compact", "Компактная")}</option>
        </GlassSelect>
      </label>
    </div>
  );
}
