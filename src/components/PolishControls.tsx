import { useState } from "react";
import { polishMessages } from "../locales/polish";

export const treatmentDefaults = { brightness: 100, saturation: 75, overlay: 65, vignette: 55, zoom: 100, position: "center" };
export const polishDefaults = {
  sidebarSide: "left", cursor: "custom", focus: false, quality: "balanced", glass: 22,
  globalTreatment: { ...treatmentDefaults }, sidebarTreatment: { ...treatmentDefaults, overlay: 80 },
  sidebarIntensity: 85, density: 12, particleSpeed: 100, particleOpacity: 20, particleSize: 100,
};
export type PolishPreferences = typeof polishDefaults;
type Props = { russian: boolean; value: PolishPreferences & { intensity: number; blur: number; sidebarBlur: number }; update: (patch: Partial<Props["value"]>) => void };
export function QualityControls({ russian, value, update }: Props) {
  const text = polishMessages[russian ? "ru" : "en"];
  return <section className="visual-preferences"><h3>{text.quality}</h3><div className="font-options">{["low", "balanced", "high"].map(quality => <button key={quality} className={value.quality === quality ? "selected" : ""} aria-pressed={value.quality === quality} onClick={() => update({ quality })}>{text[quality as "low"]}</button>)}</div><p className="settings-note">{russian?"Низкое качество отключает размытие UI и frost, ограничивая эффекты шестью частицами.":"Low quality disables UI blur and frost, and limits effects to six particles."}</p></section>;
}
export function PolishControls({ russian, value, update }: Props) {
  const text = polishMessages[russian ? "ru" : "en"];
  const [target, setTarget] = useState<"globalTreatment" | "sidebarTreatment">("globalTreatment");
  const range = (label: string, number: number, min: number, max: number, change: (n: number) => void, unit = "%") => <label className="visual-range"><span>{label}<output>{number}{unit}</output></span><input type="range" aria-label={label} min={min} max={max} value={number} onChange={e => change(Number(e.target.value))} /></label>;
  const treatment = value[target];
  const patch = (key: string, n: number | string) => update({ [target]: { ...treatment, [key]: n } });
  return <>
    <h4>{text.sidebar}</h4><div className="font-options" role="group" aria-label={text.sidebar}>{["left", "right"].map(sidebarSide => <button key={sidebarSide} aria-pressed={value.sidebarSide === sidebarSide} className={value.sidebarSide === sidebarSide ? "selected" : ""} onClick={() => update({ sidebarSide })}>{text[sidebarSide as "left"]}</button>)}</div>
    <h4>{text.cursor}</h4><div className="font-options" role="group" aria-label={text.cursor}>{(["custom", "system"] as const).map(cursor => <button key={cursor} aria-pressed={value.cursor === cursor} className={value.cursor === cursor ? "selected" : ""} onClick={() => update({ cursor })}>{text[({ custom: "customCursor", system: "system" } as const)[cursor]]}</button>)}</div>
    <div className="toggle-setting"><div><b>{text.focus}</b><span>{text.focusSub}</span></div><button className={value.focus ? "toggle on" : "toggle"} role="switch" aria-label={text.focus} aria-checked={value.focus} onClick={() => update({ focus: !value.focus })}><i /></button></div>
    {range(text.glass, value.glass, 5, 35, glass => update({ glass }))}
    <details className="polish-disclosure"><summary>{text.backgrounds}</summary><div className="font-options">{(["globalTreatment", "sidebarTreatment"] as const).map(key => <button key={key} className={target === key ? "selected" : ""} aria-pressed={target === key} onClick={() => setTarget(key)}>{key === "globalTreatment" ? text.global : text.panel}</button>)}</div>
      <div className="polish-range-grid">
        {range(text.intensity, target === "globalTreatment" ? value.intensity : value.sidebarIntensity, 0, 100, n => update(target === "globalTreatment" ? { intensity: n } : { sidebarIntensity: n }))}
        {range(text.blur, target === "globalTreatment" ? value.blur : value.sidebarBlur, 0, target === "globalTreatment" ? 10 : 20, n => update(target === "globalTreatment" ? { blur: n } : { sidebarBlur: n }), "px")}
        {range(text.brightness, treatment.brightness, 50, 130, n => patch("brightness", n))}
        {range(text.saturation, treatment.saturation, 0, 130, n => patch("saturation", n))}
        {range(text.overlay, treatment.overlay, 35, 95, n => patch("overlay", n))}
        {range(text.vignette, treatment.vignette, 0, 90, n => patch("vignette", n))}
        {range(text.zoom, treatment.zoom, 100, 140, n => patch("zoom", n))}
      </div><h4>{text.position}</h4><div className="font-options" role="group" aria-label={text.position}>{(["center", "left", "right", "top", "bottom"] as const).map(position => <button key={position} className={treatment.position === position ? "selected" : ""} aria-pressed={treatment.position === position} onClick={() => patch("position", position)}>{text[position]}</button>)}</div>
      <button className="quiet-button polish-reset" onClick={() => update(target === "globalTreatment" ? { globalTreatment: { ...polishDefaults.globalTreatment }, intensity: 45, blur: 5 } : { sidebarTreatment: { ...polishDefaults.sidebarTreatment }, sidebarIntensity: 85, sidebarBlur: 12 })}>{text.reset}</button>
    </details>
    <details className="polish-disclosure"><summary>{text.particles}</summary><div className="polish-range-grid">
      {range(text.density, value.density, 4, 24, density => update({ density }), "")}
      {range(text.speed, value.particleSpeed, 50, 150, particleSpeed => update({ particleSpeed }))}
      {range(text.opacity, value.particleOpacity, 5, 35, particleOpacity => update({ particleOpacity }))}
      {range(text.size, value.particleSize, 60, 140, particleSize => update({ particleSize }))}
    </div><button className="quiet-button polish-reset" onClick={() => update({ density: 12, particleSpeed: 100, particleOpacity: 20, particleSize: 100 })}>{text.reset}</button></details>
  </>;
}
