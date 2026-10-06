import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useVisualAppearance } from "./VisualAppearance";

import {discordDefaults,useViewedProject,type DiscordPreferences,type DiscordStatus} from "../services/discord";
export type {DiscordStatus} from "../services/discord";
export interface PresenceView {
  kind: "idle" | "home" | "discover" | "project" | "library" | "settings" | "error";
  locale: "ru" | "en";
  projectName: string;
  provider: string;
  category: string;
}

/** One renderer bridge. Rust reads tasks and OS process sessions itself. */
export function useDiscordPresence(view: PresenceView): DiscordStatus {
  const { value } = useVisualAppearance();
  const project=useViewedProject();
  if(project&&view.kind!=="settings")view={...view,kind:"project",projectName:project.name,provider:project.provider,category:project.category};
  const [status, setStatus] = useState<DiscordStatus>(isTauri() ? "unavailable" : "preview");
  const latest = useRef<{ view: PresenceView; preferences: object } | null>(null);
  const busy = useRef(false);
  const statusVersion = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    if (!isTauri()) return () => { mounted.current = false; };
    const listener = listen<DiscordStatus>("discord-presence-status", event => {
      if (mounted.current) {statusVersion.current++;setStatus(event.payload);}
    });
    return () => { mounted.current = false; void listener.then(unlisten => unlisten()).catch(() => {}); };
  }, []);
  const serialized = JSON.stringify({ view, preferences: {
    enabled: value.discordEnabled, instanceNames: value.discordInstanceNames,
    projectNames: value.discordProjectNames, downloads: value.discordDownloads,
    currentPage: value.discordCurrentPage,
  } });
  useEffect(() => {
    if (!isTauri()) return;
    latest.current = JSON.parse(serialized);
    // Serialize and coalesce so an older privacy command cannot overwrite Off.
    async function flush() {
      if (busy.current) return;
      busy.current = true;
      try {
        while (latest.current && mounted.current) {
          const context = latest.current; latest.current = null;
          try {
            const before=statusVersion.current;
            const result=await invoke<DiscordStatus>("discord_presence_context", context);
            if(mounted.current&&before===statusVersion.current&&["disabled","unavailable","connected"].includes(result))setStatus(result);
          }
          catch { if (mounted.current) setStatus("unavailable"); }
        }
      } finally { busy.current = false; }
    }
    void flush();
  }, [serialized]);
  return value.discordEnabled ? status : "disabled";
}

export function DiscordSettings({ russian, status }: { russian: boolean; status: DiscordStatus }) {
  const { value, update } = useVisualAppearance();
  const labels = russian ? {
    discordEnabled: ["Discord Rich Presence", "Показывать активность Canary в локальном Discord. При выключении статус сразу очищается."],
    discordInstanceNames: ["Показывать название экземпляра", "Разрешить название сборки при запуске и игре. Учётные данные никогда не публикуются."],
    discordProjectNames: ["Показывать названия проектов", "Разрешить название просматриваемого или устанавливаемого проекта."],
    discordDownloads: ["Показывать установки и загрузки", "Разрешить состояние операции, процент и количество файлов. Имена файлов остаются в Canary."],
    discordCurrentPage: ["Показывать раздел Canary", "Показывать главную, каталог, библиотеку и настройки, когда игра не запущена."],
  } : {
    discordEnabled: ["Discord Rich Presence", "Share Canary activity with the local Discord client. Turning this off clears your status immediately."],
    discordInstanceNames: ["Show instance name", "Allow the pack name while launching and playing. Account credentials are never shared."],
    discordProjectNames: ["Show project names", "Allow the name of the project you are viewing or installing."],
    discordDownloads: ["Show installations and downloads", "Allow operation progress and file counts. Filenames stay inside Canary."],
    discordCurrentPage: ["Show current Canary page", "Show Home, Discover, Library and Settings when no game is running."],
  };
  const statuses = russian ? {
    connected: "Подключено", unavailable: "Discord не запущен или недоступен", disabled: "Выключено", preview: "Доступно в приложении Canary",
  } : {
    connected: "Connected", unavailable: "Discord not running or unavailable", disabled: "Disabled", preview: "Available in the Canary desktop app",
  };
  return <section className="visual-preferences discord-settings">
    <h3>Discord Rich Presence</h3>
    <p className="settings-note" role="status" data-discord-status={status}>{statuses[status]}</p>
    {(Object.keys(discordDefaults) as (keyof DiscordPreferences)[]).map(key => <div className="toggle-setting" key={key}>
      <div><b>{labels[key][0]}</b><span>{labels[key][1]}</span></div>
      <button className={value[key] ? "toggle on" : "toggle"} role="switch" aria-label={labels[key][0]} aria-checked={value[key]}
        onClick={() => update({ [key]: !value[key] })}><i /></button>
    </div>)}
    <p className="settings-note">{russian ? "Discord можно открыть позже: Canary подключится автоматически. Пароль или вход в Discord через лаунчер не нужны." : "You can open Discord later: Canary reconnects automatically. No Discord password or launcher sign-in is needed."}</p>
  </section>;
}
