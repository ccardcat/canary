import {useEffect, useState} from "react";
import {convertFileSrc} from "@tauri-apps/api/core";
import RemoteImage from "./RemoteImage";
import {providerAvailable, providerDetail} from "../services/providers";
import {safeRemoteImageUrl} from "../services/links";
import type {RuntimeInstance} from "../services/backend";

const icons = new Map<string, {expires: number; promise: Promise<string | undefined>}>();
function projectIcon(instance: RuntimeInstance): Promise<string | undefined> {
  const key = `${instance.provider}:${instance.project_id}`;
  const cached = icons.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const entry = {expires: Date.now() + 60000, promise: Promise.resolve(undefined) as Promise<string | undefined>};
  entry.promise = providerDetail({project_id: instance.project_id!, provider: instance.provider as "modrinth" | "curseforge", title: instance.name, description: "", downloads: 0}, controller.signal)
    .then(project => {const icon = safeRemoteImageUrl(project.icon_url); if (icon) entry.expires = Date.now() + 3600000; return icon;})
    .catch(() => undefined).finally(() => clearTimeout(timer));
  if (icons.size >= 64) icons.delete(icons.keys().next().value!);
  icons.set(key, entry);
  return entry.promise;
}
export function InstanceIcon({instance}: {instance: RuntimeInstance}) {
  const source = instance.icon && !/^(https?:|asset:)/i.test(instance.icon) ? convertFileSrc(instance.icon) : instance.icon;
  return <Icon key={`${instance.provider}:${instance.project_id}:${source}`} instance={instance} source={source}/>;
}
function Icon({instance, source}: {instance: RuntimeInstance; source?: string}) {
  const [unavailable, setUnavailable] = useState(!source);
  const [fallback, setFallback] = useState<string>();
  useEffect(() => {
    if (!unavailable || !instance.project_id || !["modrinth", "curseforge"].includes(instance.provider) || !providerAvailable(instance.provider)) return;
    let live = true;
    void projectIcon(instance).then(icon => {if (live) setFallback(icon);});
    return () => {live = false;};
  }, [unavailable, instance.provider, instance.project_id]);
  return <RemoteImage src={unavailable ? fallback : source} onUnavailable={() => setUnavailable(true)}/>;
}
