export type Mode = "dark" | "light" | "amoled" | "system";
type Accent =
  | "monochrome"
  | "white"
  | "gray"
  | "mint"
  | "emerald"
  | "aqua"
  | "blue"
  | "purple"
  | "rose"
  | "orange";
export type SelectedAccent = Accent | "custom";
export const accentColors: Record<Accent, string> = {
  monochrome: "#e9efec",
  white: "#ffffff",
  gray: "#aeb9b5",
  mint: "#72d6ac",
  emerald: "#47c98b",
  aqua: "#61cfe0",
  blue: "#83a8ed",
  purple: "#b29aed",
  rose: "#ed9bad",
  orange: "#e8ae79",
};
export const modes: Mode[] = ["dark", "light", "amoled", "system"];
export function normalizeAccent(value: unknown): SelectedAccent {
  if (value === "custom") return "custom";
  return (Object.keys(accentColors) as Accent[]).find(accent => accent === value) ?? "monochrome";
}

export const lightPalettes = ["white", "softLight", "frost", "warm"] as const;
export const darkPalettes = ["graphite", "black", "softDark", "midnight", "viceCity"] as const;
export const amoledPalettes = ["pureBlack", "softAmoled"] as const;
export type Palettes = {
  light: typeof lightPalettes[number];
  dark: typeof darkPalettes[number];
  amoled: typeof amoledPalettes[number];
};
export type PaletteMode = keyof Palettes;

export function readPalettes(storage: Storage): Palettes {
  let saved: unknown;
  try { saved = JSON.parse(storage.getItem("canary-palettes") || "{}"); } catch { /* Use the legacy value. */ }
  return normalizePalettes(saved, storage.getItem("canary-preset"));
}

export function normalizePalettes(value: unknown, legacy?: string | null): Palettes {
  const saved = value && typeof value === "object" ? value as Partial<Palettes> : {};
  const light = lightPalettes.find(palette => palette === saved.light);
  const dark = darkPalettes.find(palette => palette === saved.dark);
  return {
    light: light ?? lightPalettes.find(palette => palette === legacy) ?? "white",
    dark: dark ?? darkPalettes.find(palette => palette === legacy) ?? "graphite",
    amoled: amoledPalettes.find(palette => palette === saved.amoled) ?? "pureBlack",
  };
}

export const normalizeAccentColor = (color: string | null) =>
  color && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#72d6ac";

export function accessibleAccent(hex: string, light: boolean): string {
  const color = normalizeAccentColor(hex);
  const channels = [1, 3, 5].map(position => parseInt(color.slice(position, position + 2), 16));
  const toward = light ? 0 : 255;
  const weights = [0.2126, 0.7152, 0.0722];
  for (let step = 0; step <= 100; step++) {
    const rgb = channels.map(channel => Math.round(channel + (toward - channel) * step / 100));
    const luminance = rgb.reduce((sum, channel, index) => {
      const s = channel / 255;
      return sum + weights[index] * (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4);
    }, 0);
    if (light ? luminance <= 0.135 : luminance >= 0.38) {
      return "#" + rgb.map(channel => channel.toString(16).padStart(2, "0")).join("");
    }
  }
  return light ? "#000000" : "#ffffff";
}
