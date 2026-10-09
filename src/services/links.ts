import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
export function safeExternalUrl(value:string):string|undefined {
 try {const url=new URL(value);const host=url.hostname.toLowerCase().replace(/\.+$/,"");
  if(!["https:","http:"].includes(url.protocol)||url.username||url.password||/[\u0000-\u001f\u007f]/.test(value)||!host.includes(".")||/\.(?:localhost|local|internal|home|lan)$/.test(host))return;
  // URL normalizes decimal/hexadecimal IP spellings before this check.
  if(host.startsWith("[")||/^\d+\.\d+\.\d+\.\d+$/.test(host)){const ip=host.split(".").map(Number);if(host.startsWith("[")||ip[0]===0||ip[0]===10||ip[0]===127||ip[0]>=224||ip[0]===169&&ip[1]===254||ip[0]===172&&ip[1]>=16&&ip[1]<=31||ip[0]===192&&ip[1]===168||ip[0]===100&&ip[1]>=64&&ip[1]<=127)return;}
  return url.href;
 } catch{return;}
}
// Provider text may reference public HTTPS images, never local asset origins.
export function safeRemoteImageUrl(value?:string):string|undefined {
 if(!value)return;
 const url=safeExternalUrl(value);return url?.startsWith("https:")?url:undefined;
}
export function safeImageUrl(value?:string):string|undefined {
 if(!value)return;
 if(/^asset:\/\/localhost\//i.test(value)||/^https?:\/\/asset\.localhost\//i.test(value)||/^\/(?:assets|branding)\//.test(value))return value;
 return safeRemoteImageUrl(value);
}
export function externalLink(url: string) {
  const safe=safeExternalUrl(url);if(!safe)return;
  if (isTauri()) void openUrl(safe).catch(()=>{});
  else window.open(safe, "_blank", "noopener,noreferrer");
}
