export const lightPalettes = ["white", "softLight", "frost", "warm"] as const;
export const darkPalettes = ["graphite", "black", "softDark", "midnight"] as const;
export const amoledPalettes = ["pureBlack", "softAmoled"] as const;
type Palettes = {
  light: typeof lightPalettes[number];
  dark: typeof darkPalettes[number];
  amoled: typeof amoledPalettes[number];
};
export type PaletteMode = keyof Palettes;

export function readPalettes(storage: Storage): Palettes {
  const legacy = storage.getItem("canary-preset");
  let saved: Partial<Palettes> = {};
  try { saved = JSON.parse(storage.getItem("canary-palettes") || "{}") ?? {}; } catch { /* Use the legacy value. */ }
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
