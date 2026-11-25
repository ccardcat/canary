import {useState} from "react";
import {Check, Undo2} from "lucide-react";
import {backgrounds} from "../services/backgrounds";
import {materialPresetPatch, type MaterialPreset} from "./MaterialSystem";
import {useVisualAppearance, type Preferences} from "./VisualAppearance";

const scenes: {wallpaper:string; title:[string,string]; details:[string,string]; material:MaterialPreset; ambient:Preferences["ambient"]}[] = [
  {wallpaper:"starlit-castle", title:["Звёздный замок","Starlit Castle"], details:["Стекло · мягкий снег","Glass · gentle snow"], material:"glass", ambient:"snow"},
  {wallpaper:"golden-mines", title:["Золотые шахты","Golden Mines"], details:["Матовые поверхности · листья","Soft surfaces · falling leaves"], material:"soft", ambient:"autumn"},
  {wallpaper:"amethyst-cave", title:["Аметистовая пещера","Amethyst Cave"], details:["Жидкое стекло · сакура","Liquid Glass · cherry blossoms"], material:"liquid", ambient:"sakura"},
];

export function AppearanceScenes({russian}:{russian:boolean}) {
  const {value,update} = useVisualAppearance();
  const [previous,setPrevious] = useState<Partial<Preferences> | null>(null);
  const language = russian ? 0 : 1;
  function apply(scene:typeof scenes[number]) {
    const patch:Partial<Preferences> = {
      ...materialPresetPatch(scene.material),
      reduceTransparency:value.reduceTransparency,
      app:scene.wallpaper,
      backgroundSource:"canary",
      ambient:scene.ambient,
      effectPreset:"custom",
    };
    setPrevious(old => old ?? Object.fromEntries(
      (Object.keys(patch) as (keyof Preferences)[]).map(key => [key,value[key]])
    ));
    update(patch);
  }

  return <section className="appearance-scenes">
    <div className="appearance-scenes-heading">
      <h4>{russian ? "Сцены оформления" : "Appearance scenes"}</h4>
      {previous && <button type="button" className="quiet-button" onClick={() => { update(previous); setPrevious(null); }}><Undo2 size={15}/>{russian ? "Вернуть оформление" : "Undo scene"}</button>}
    </div>
    <div className="scene-grid">
      {scenes.map(scene => {
        const artwork = backgrounds.find(background => background.id === scene.wallpaper);
        const active = value.backgroundSource === "canary" && value.app === scene.wallpaper &&
          value.materialPreset === scene.material && value.ambient === scene.ambient;
        return <button type="button" key={scene.wallpaper} aria-pressed={active} aria-label={scene.title[language]} onClick={() => apply(scene)}>
          <span className="scene-art" aria-hidden="true">{artwork?.thumbnail && <img src={artwork.thumbnail} loading="lazy" alt=""/>}{active && <Check size={20}/>}</span>
          <strong>{scene.title[language]}</strong><small>{scene.details[language]}</small>
        </button>;
      })}
    </div>
  </section>;
}
