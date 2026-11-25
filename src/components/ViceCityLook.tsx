import {Check, Palette, Undo2} from "lucide-react";
import {materialPresetPatch} from "./MaterialSystem";
import {treatmentDefaults} from "./PolishControls";
import type {AppearanceSnapshot} from "../services/appearanceProfiles";
import "./ViceCityLook.css";

export const viceCityWallpaper = "vice-city";

export function viceCityLook(current:AppearanceSnapshot):AppearanceSnapshot {
  const {reduceTransparency, ...materials} = materialPresetPatch("glass");
  return {
    theme:{...current.theme, mode:"dark", accent:"custom", accentColor:"#f995c8",
      palettes:{...current.theme.palettes, dark:"viceCity"}},
    visual:{
      ...current.visual, ...materials,
      app:viceCityWallpaper, backgroundSource:"canary", intensity:93, blur:0,
      globalTreatment:{...treatmentDefaults, overlay:43, vignette:20, saturation:110},
      sidebarBackgroundSource:"theme", materialRadius:18, surfaceOpacity:88, surfaceBlur:14,
      headingFont:"Rubik", buttonStyle:"neon", ambient:"off", effectPreset:"off",
      showHero:true, heroFollowWallpaper:true,
    },
  };
}

export function ViceCityLook({russian,active,onApply,onUndo}:{
  russian:boolean; active:boolean; onApply:()=>void; onUndo?:()=>void;
}) {
  return <section className="vice-city-preview" aria-label="Vice City">
    <img className="vice-city-preview-image" src="/backgrounds/vice-city.webp" alt="" loading="lazy"/>
    <div className="vice-city-preview-copy">
      <h4>Vice City</h4>
      <p>{russian?"Майами после заката. Розовый неон, тёмное стекло и огни набережной.":"Miami after sunset. Pink neon, dark glass, and a glowing waterfront."}</p>
      <div className="vice-city-preview-actions">
        <button type="button" className="primary-button" aria-pressed={active} onClick={onApply}>
          {active?<Check size={16}/>:<Palette size={16}/>}
          {active?(russian?"Тема включена":"Theme applied"):(russian?"Применить тему Vice City":"Apply Vice City theme")}
        </button>
        {onUndo&&<button type="button" className="quiet-button" onClick={onUndo}>
          <Undo2 size={16}/>{russian?"Вернуть оформление":"Restore previous look"}
        </button>}
      </div>
    </div>
  </section>;
}
