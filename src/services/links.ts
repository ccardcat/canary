import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
export function externalLink(url: string) {
  if (!/^https?:\/\//i.test(url)) return;
  if (isTauri()) void openUrl(url).catch(console.error);
  else window.open(url, "_blank", "noopener,noreferrer");
}
