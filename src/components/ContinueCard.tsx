import {ChevronRight, LoaderCircle, Play, Square} from "lucide-react";
import {useBackend} from "../services/backend";
import {isTerminal} from "../services/activity";
import type {Project} from "../services/modrinth";
import type {T} from "../locales";
import {InstanceIcon} from "./InstanceIcon";
import {LoaderLabel} from "./ProjectTags";
import RemoteImage from "./RemoteImage";

export default function ContinueCard({p, t, russian, onLibrary, serverMode = false}: {
  p: Project; t: T; russian: boolean; onLibrary: () => void; serverMode?: boolean;
}) {
  const {snapshot, run, progress, tasks} = useBackend();
  const instance = snapshot?.instances.find(current => current.id === p.native_instance_id);
  const running = instance?.status === "running";
  const stopping = instance?.status === "stopping";
  const unavailable = instance?.status === "unavailable";
  const pending = !running && !!instance && (progress?.id === instance.id && progress.status === "running"
    || tasks.some(task => task.operationId === instance.id && !isTerminal(task)));
  const status = stopping ? russian ? "Завершение…" : "Stopping…"
    : unavailable ? russian ? "Диск недоступен" : "Drive unavailable"
    : pending ? russian ? "Подготовка…" : "Preparing…"
    : running ? russian ? "Игра запущена" : "Running"
    : instance?.error || instance?.status === "failed" ? russian ? "Требуется восстановление" : "Repair needed" : "";
  const title = serverMode ? `${russian ? "Последний сервер" : "Last server"} · ${instance?.last_server?.address || p.title}` : p.title;
  const playLabel = stopping ? russian ? "Завершение…" : "Stopping…"
    : pending ? russian ? "Подготовка…" : "Preparing…"
    : running ? russian ? "Остановить" : "Stop" : russian ? "Играть" : "Play";

  return <article className={`mini-card continuation-card${serverMode ? " last-server-card" : ""}`} data-instance-id={instance?.id}>
    <button className="continue-open" onClick={onLibrary} aria-label={`${t("openLibrary")} — ${title}`}>
      <span className="continue-art">{instance ? <InstanceIcon instance={instance}/> : <RemoteImage src={p.icon_url}/>}</span>
      <span className="continue-copy">
        <b title={title}>{title}</b>
        <small>{instance ? <>
          {serverMode && <>{instance.name} · </>}
          Minecraft {instance.minecraft} · <LoaderLabel loader={instance.loader}/>
        </> : p.description || p.version_name}</small>
        {!serverMode && instance?.last_server && <span className="continue-server">{russian ? "Сервер" : "Server"}: {instance.last_server.address}</span>}
        {status && <span className={`continue-status ${running ? "running-status" : ""}`} role="status">{status}</span>}
      </span>
      <ChevronRight className="continue-chevron" size={15} aria-hidden="true"/>
    </button>
    {instance && <button className="primary-button continue-play" disabled={pending || stopping || unavailable} aria-label={playLabel} title={playLabel} aria-busy={pending || stopping} onClick={() => void run(
      running ? "stop_instance" : "launch_instance",
      running ? {id: instance.id, force: false} : {id: instance.id},
    ).catch(() => {})}>
      {pending || stopping ? <LoaderCircle className="continue-spinner" size={15} aria-hidden="true"/> : running ? <Square size={15} aria-hidden="true"/> : <Play size={15} aria-hidden="true"/>}
      <span>{playLabel}</span>
    </button>}
  </article>;
}
