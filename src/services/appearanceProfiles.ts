import {normalizePreferences, type Preferences} from "../components/VisualAppearance";
import {modes, normalizeAccent, normalizeAccentColor, normalizePalettes, type Mode, type Palettes, type SelectedAccent} from "./theme";

const keys = [
  "backgroundVersion", "compactCardsVersion", "font", "headingFont", "fontScale", "minecraft", "cursor",
  "backgroundSource", "app", "intensity", "blur", "globalTreatment", "sidebar", "sidebarIntensity",
  "sidebarBlur", "sidebarTreatment", "sidebarBackgroundSource", "sidebarColor", "sidebarColorOpacity",
  "sidebarSide", "sidebarMode", "materialRadius", "instanceLayout", "instanceArtwork", "buttonDensity",
  "materialPreset", "materialLinked", "materialStyle", "materialCategories", "materialIntensity", "materialSaturation",
  "materialBrightness", "materialContrast", "materialHighlight", "materialBorder", "materialShadow", "materialAccent",
  "sidebarMaterialIntensity", "titlebarMaterialIntensity", "surfaceOpacity", "surfaceBlur", "glassIntensity", "glass", "frost",
  "ambient", "effectPreset", "density", "particleSpeed", "particleSize", "particleOpacity", "particleWind",
  "showHero", "heroSpeed", "heroRotation", "navigationMotion",
  "material", "tint", "vibrancyPreset", "windowTransparency", "titlebarBranding", "windowControls", "controlsPosition",
] as const satisfies readonly (keyof Preferences)[];

export type ProfileVisuals = Pick<Preferences, typeof keys[number]>;
export type ProfileTheme = {mode:Mode; accent:SelectedAccent; accentColor:string; palettes:Palettes; compact:boolean};
export type AppearanceSnapshot = {theme:ProfileTheme; visual:ProfileVisuals};
export type AppearanceProfile = AppearanceSnapshot & {id:string; name:string};

export const profileStorageKey = "canary-appearance-profiles";
export const profileLimit = 16;
export const profileNameLimit = 36;
export const profileJsonLimit = 32_768;

export function profileVisuals(value: Preferences): ProfileVisuals {
  return Object.fromEntries(keys.map(key => [key,value[key]])) as ProfileVisuals;
}

const record = (value:unknown):value is Record<string,unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function readProfile(value:unknown) {
  if (!record(value) || !record(value.theme) || !record(value.visual)) return null;
  const {theme,visual} = value;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const mode = modes.find(mode => mode === theme.mode);
  if (!name || name.length > profileNameLimit || !mode || typeof visual.font !== "string" || typeof visual.backgroundSource !== "string") return null;
  const normalized = normalizePreferences(visual);
  // Only local wallpaper identifiers are portable. Paths and URLs belong to the wallpaper registry.
  if (!/^[a-z0-9_-]{1,96}$/i.test(normalized.app)) normalized.app = "meadow";
  if (!/^[a-z0-9_-]{1,96}$/i.test(normalized.sidebar)) normalized.sidebar = "meadow";
  return {name,visual:profileVisuals(normalized),theme:{
    mode,accent:normalizeAccent(theme.accent),
    accentColor:normalizeAccentColor(typeof theme.accentColor === "string" ? theme.accentColor : null),
    palettes:normalizePalettes(theme.palettes),compact:theme.compact === true,
  }};
}

export function readAppearanceProfiles(): AppearanceProfile[] {
  try {
    const data:unknown = JSON.parse(localStorage.getItem(profileStorageKey) || "[]");
    if (!Array.isArray(data)) return [];
    const ids = new Set<string>();
    return data.slice(0,profileLimit).flatMap((value:unknown) => {
      if (!record(value) || typeof value.id !== "string" || !/^[a-f\d-]{36}$/.test(value.id) || ids.has(value.id)) return [];
      const profile = readProfile(value);
      if (!profile) return [];
      ids.add(value.id);
      return [{...profile,id:value.id}];
    });
  } catch {
    return [];
  }
}

export function decodeAppearanceProfile(json:string):Omit<AppearanceProfile,"id"> | null {
  if (json.length > profileJsonLimit) return null;
  try {
    const value:unknown = JSON.parse(json);
    return record(value) && value.format === "canary-appearance" && value.version === 1 ? readProfile(value) : null;
  } catch {
    return null;
  }
}

export function encodeAppearanceProfile({name,theme,visual}:AppearanceProfile):string {
  return JSON.stringify({format:"canary-appearance",version:1,name,theme,visual},null,2);
}
