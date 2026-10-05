import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import type { CSSProperties } from "react";
import "./VisualAppearance.css";
import "./CursorPack.css";
import ArtworkFade from "./ArtworkFade";
import DesktopBehavior from "./DesktopBehavior";
import { PolishControls, QualityControls, polishDefaults, type PolishPreferences } from "./PolishControls";
import { appearanceMessages } from "../locales/appearance";

const files = Object.keys(import.meta.glob("/public/backgrounds/*.{png,jpg,jpeg,webp}"));
export const backgrounds = [...new Set(files.map(p => p.match(/\/([^/]+)-(?:bg|sidebar)\./)?.[1]).filter((p): p is string => !!p && p !== "sidebar"))].map(id => ({
  id, name: id === "darkblue" ? "Dark Blue" : (id[0].toUpperCase() + id.slice(1)).replace(/(\D)(\d+)$/, "$1 $2"),
  ambient: id.startsWith("sakura") ? "sakura" : "off",
  app: files.find(p => p.includes(`/${id}-bg.`))?.replace("/public", ""),
  sidebar: files.find(p => p.includes(`/${id}-sidebar.`))?.replace("/public", ""),
}));
const fonts = ["Nunito", "Manrope", "Plus Jakarta Sans", "Rubik", "Monocraft"];
type Preferences = PolishPreferences & { app: string; sidebar: string; linked: boolean; intensity: number; blur: number; sidebarBlur: number; font: string; fontScale: 90 | 100 | 110 | 120; minecraft: "headings" | "full"; ambient: "off" | "automatic" | "sakura" | "snow" };
const defaults: Preferences = { ...polishDefaults, app: "normal", sidebar: "default", linked: false, intensity: 45, blur: 5, sidebarBlur: 12, font: "Nunito", fontScale:100, minecraft: "headings", ambient: "off" };
const Context = createContext<{ value: Preferences; update: (patch: Partial<Preferences>) => void }>({ value: defaults, update: () => {} });
export function VisualAppearanceProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<Preferences>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("canary-visual") || "{}");
      return {
        ...defaults, ...saved,
        fontScale: [90,100,110,120].includes(saved.fontScale) ? saved.fontScale : 100,
        // Old generated cursor choices migrate to the supplied native pack.
        cursor: saved.cursor === "system" ? "system" : "custom",
        globalTreatment: { ...polishDefaults.globalTreatment, ...saved.globalTreatment },
        sidebarTreatment: { ...polishDefaults.sidebarTreatment, ...saved.sidebarTreatment },
      };
    } catch { return defaults; }
  });
  const [reduced, setReduced] = useState(false);
  useEffect(() => { const media = matchMedia("(prefers-reduced-motion: reduce)"); const sync = () => setReduced(media.matches); sync(); media.addEventListener("change", sync); return () => media.removeEventListener("change", sync); }, []);
  useLayoutEffect(() => {
    localStorage.setItem("canary-visual", JSON.stringify(value));
    const root = document.documentElement;
    root.style.setProperty("--ui-font-scale", String(value.fontScale / 100));
    root.dataset.uiFont = value.font; root.dataset.minecraft = value.minecraft;
    root.dataset.ambient = value.ambient;
    root.dataset.sidebarSide = value.sidebarSide; root.dataset.cursor = value.cursor;
    root.dataset.focus = String(value.focus); root.dataset.quality = value.quality;
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
    root.style.setProperty("--sidebar-art", `url("${backgrounds.find(p => p.id === value.sidebar)?.sidebar || "/backgrounds/sidebar-bg.webp"}")`);
    root.style.setProperty("--sidebar-blur", `${value.sidebarBlur}px`);
  }, [value]);
  const automaticSakura = value.sidebar === "default" ||
    backgrounds.some(p => (p.id === value.app || p.id === value.sidebar) && p.ambient === "sakura");
  const effect = value.ambient === "automatic" ? (automaticSakura ? "sakura" : "off") : value.ambient;
  const image = backgrounds.find(p => p.id === value.app)?.app;
  return <Context.Provider value={{ value, update: patch => setValue(old => ({ ...old, ...patch })) }}>
    <div className="visual-backdrop" aria-hidden="true" style={{ "--wallpaper-opacity": value.intensity / 100, "--wallpaper-blur": `${value.blur}px` } as CSSProperties}>
      <ArtworkFade source={image} className="global-wallpaper" />
      <div className="wallpaper-veil" />
    </div>
    {children}
    {!reduced && !value.focus && effect !== "off" && <div className={`ambient-particles ${effect}`} aria-hidden="true">{Array.from({ length: Math.min(value.density, value.quality === "low" ? 6 : value.quality === "balanced" ? 16 : 24) }, (_, i) => <i key={i} style={{ left: `${(i * 37 + 9) % 100}%`, animationDelay: `${-i * 2.7}s`, animationDuration: `${(22 + i % 5 * 4) / (value.particleSpeed / 100)}s`, "--drift": `${i % 2 ? 45 : -35}px`, opacity: value.particleOpacity / 100 * (.6 + (i % 4) * .12), "--particle-scale": value.particleSize / 100 } as CSSProperties} />)}</div>}
  <DesktopBehavior />
  </Context.Provider>;
}
export function VisualPreferences({ russian }: { russian: boolean }) {
  const { value, update } = useContext(Context);
  const text = appearanceMessages[russian ? "ru" : "en"];
  const choose = (kind: "app" | "sidebar", id: string) => update(value.linked ? { app: id === "default" ? "normal" : id, sidebar: id === "normal" ? "default" : id } : { [kind]: id });
  const preview = (kind: "app" | "sidebar") => <div className="background-options">{[{ id: kind === "app" ? "normal" : "default", name: text[kind === "app" ? "Normal" : "Default"], app: undefined, sidebar: "/backgrounds/sidebar-bg.webp" }, ...backgrounds.filter(p => p[kind])].map(p => <button key={p.id} aria-pressed={value[kind] === p.id} className={value[kind] === p.id ? "selected" : ""} onClick={() => choose(kind, p.id)}><span className="background-preview" style={p[kind] ? { backgroundImage: `url("${p[kind]}")` } : {}} /><span>{p.name}</span></button>)}</div>;

  return <section className="visual-preferences">
    <PolishControls russian={russian} value={value} update={update} />
    <h4>{text["Application background"]}</h4>{preview("app")}
    <h4>{text["Sidebar background"]}</h4>{preview("sidebar")}
    <div className="toggle-setting"><div><b>{text["Link application and sidebar backgrounds"]}</b></div><button className={value.linked ? "toggle on" : "toggle"} role="switch" aria-checked={value.linked} aria-label={text["Link backgrounds"]} onClick={() => update({ linked: !value.linked, ...(value.linked ? {} : { sidebar: value.app === "normal" ? "default" : value.app }) })}><i /></button></div>

    <h4>{text["Interface font"]}</h4><div className="font-options">{fonts.map(font => <button key={font} style={{ fontFamily: `"${font}", Nunito, sans-serif` }} className={value.font === font ? "selected" : ""} aria-pressed={value.font === font} onClick={() => update({ font })}>{font}</button>)}</div>
    <h4>{text["Interface size"]}</h4><div className="font-options">{([90,100,110,120] as const).map(fontScale=><button key={fontScale} aria-pressed={value.fontScale===fontScale} className={value.fontScale===fontScale?"selected":""} onClick={()=>update({fontScale})}>{fontScale}%</button>)}</div>
    {value.font === "Monocraft" && <><h4>{text["Minecraft style"]}</h4><div className="font-options">{(["headings", "full"] as const).map(minecraft => <button key={minecraft} aria-pressed={value.minecraft === minecraft} className={value.minecraft === minecraft ? "selected" : ""} onClick={() => update({ minecraft })}>{minecraft === "headings" ? text["Headings"] : text["Full interface"]}</button>)}</div></>}
    <h4>{text["Ambient effects"]}</h4><div className="font-options">{(["off", "automatic", "sakura", "snow"] as const).map(ambient => <button key={ambient} aria-pressed={value.ambient === ambient} className={value.ambient === ambient ? "selected" : ""} onClick={() => update({ ambient })}>{({ off: text["Off"], automatic: text["Automatic"], sakura: text["Sakura"], snow: text["Snow"] })[ambient]}</button>)}</div>
  </section>;
}

export function SidebarArtwork() {
  const { value } = useContext(Context);
  return <ArtworkFade source={backgrounds.find(p => p.id === value.sidebar)?.sidebar || "/backgrounds/sidebar-bg.webp"} className="sidebar-art" />;
}
export function VisualQuality({ russian }: { russian: boolean }) {
  const { value, update } = useContext(Context);
  return <QualityControls russian={russian} value={value} update={update} />;
}
