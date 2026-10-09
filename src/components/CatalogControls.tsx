import {useState} from "react";
import {LayoutGrid, List, SlidersHorizontal} from "lucide-react";
import GlassSelect from "./GlassSelect";
import {type CatalogPreferences} from "../services/catalog";

type Props = {russian: boolean; value: CatalogPreferences; update: (patch: Partial<CatalogPreferences>) => void};
export function CatalogSettings({russian, value, update}: Props) {
  return <div className="catalog-settings">
    <h4>{russian ? "Вид каталога" : "Catalog appearance"}</h4>
    <div className="catalog-settings-selects">
      <label>{russian ? "Раскладка" : "Layout"}<GlassSelect value={value.catalogLayout} onChange={e => update({catalogLayout: e.target.value as CatalogPreferences["catalogLayout"]})}>
        <option value="list">{russian ? "Строки" : "List"}</option><option value="grid">{russian ? "Сетка" : "Grid"}</option>
      </GlassSelect></label>
      <label>{russian ? "Плотность" : "Density"}<GlassSelect value={value.catalogDensity} onChange={e => update({catalogDensity: e.target.value as CatalogPreferences["catalogDensity"]})}>
        <option value="comfortable">{russian ? "Свободная" : "Comfortable"}</option><option value="compact">{russian ? "Компактная" : "Compact"}</option>
      </GlassSelect></label>
      <label>{russian ? "Тегов на карточке" : "Tags per card"}<GlassSelect value={value.catalogTagLimit} onChange={e => update({catalogTagLimit: Number(e.target.value)})}>
        {[0, 3, 6, 9, 12].map(limit => <option key={limit} value={limit}>{limit === 0 ? russian ? "Все" : "All" : limit}</option>)}
      </GlassSelect></label>
    </div>
    <div className="catalog-settings-toggles">{([
      ["catalogDescription", russian ? "Описание" : "Description"],
      ["catalogAuthor", russian ? "Автор" : "Author"],
      ["catalogStats", russian ? "Статистика" : "Statistics"],
    ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={value[key]} onChange={e => update({[key]: e.target.checked})}/>{label}</label>)}</div>
  </div>;
}
export function CatalogControls(props: Props) {
  const [open, setOpen] = useState(false);
  return <div className="catalog-controls-area">
    <div className="catalog-controls" role="group" aria-label={props.russian ? "Вид каталога" : "Catalog appearance"}>
      <button className="quiet-button" aria-label={props.russian ? "Каталог строками" : "Catalog list"} aria-pressed={props.value.catalogLayout === "list"} onClick={() => props.update({catalogLayout: "list"})}><List size={17}/></button>
      <button className="quiet-button" aria-label={props.russian ? "Каталог сеткой" : "Catalog grid"} aria-pressed={props.value.catalogLayout === "grid"} onClick={() => props.update({catalogLayout: "grid"})}><LayoutGrid size={17}/></button>
      <button className="quiet-button" aria-expanded={open} onClick={() => setOpen(!open)}><SlidersHorizontal size={16}/>{props.russian ? "Настроить вид" : "Customize view"}</button>
    </div>
    {open && <CatalogSettings {...props}/>}
  </div>;
}
