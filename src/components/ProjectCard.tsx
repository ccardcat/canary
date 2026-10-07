import {memo,useCallback,useRef} from "react";
import {useBackend} from "../services/backend";
import {projectInstallTask,isTerminal} from "../services/activity";
import {Download,SquareArrowOutUpRight,Plus} from "lucide-react";
import {categories,type T} from "../locales";
import {artwork,type Project,type ContentType} from "../services/modrinth";
import {providerName,providerAvailable} from "../services/providers";
import RemoteImage from "./RemoteImage";
import {cardSpotlight} from "./DesktopBehavior";
type ProjectCardProps = {
  compatibility?:string;
  p: Project;
  t: T;
  type: ContentType;
  installed: boolean;
  installationDisabled?:boolean;
  onOpen: () => void;
  onInstall: () => void;
};
function ProjectCard(props:ProjectCardProps) {
  const {tasks}=useBackend();
  const task=projectInstallTask(tasks,props.p.provider||'modrinth',props.p.project_id);
  const blocked=!!props.installationDisabled||tasks.some(current=>current.projectId&&!isTerminal(current));
  const handlers=useRef(props);handlers.current=props;
  const onOpen=useCallback(()=>handlers.current.onOpen(),[]);
  const onInstall=useCallback(()=>handlers.current.onInstall(),[]);
  return <CardView {...props} onOpen={onOpen} onInstall={onInstall} busy={!!task} taskId={task?.id} percent={task&&task.total>0?Math.round(task.percent):undefined} blocked={blocked}/>;
}
const CardView=memo(function CardView({p,t,type,installed,onOpen,onInstall,compatibility,busy,blocked,taskId,percent}:ProjectCardProps & {busy:boolean;blocked:boolean;taskId?:string;percent?:number}) {
  const art = artwork(p) || p.icon_url;
  return (
    <article data-project-id={`${p.provider||"modrinth"}:${p.project_id}`} data-task-id={taskId} className="project-card" onPointerMove={cardSpotlight}>
      <button
        className="card-visual"
        onClick={onOpen}
        aria-label={`${t("view")}: ${p.title}`}
      >
        {art && (
          <div
            className={
              "card-bg " + (artwork(p) ? "gallery-art" : "blurred-icon")
            }
            style={{ backgroundImage: `url(${art})` }}
          />
        )}
        <div className="card-icon-wrap">
          <RemoteImage src={p.icon_url} alt="" />
        </div>
      </button>
      <div className="card-body">
        <div className="card-kind">{t(type)}</div>
        <button className="card-title" onClick={onOpen}>
          {p.title}
        </button>
        <p>{p.description || t("noDescription")}</p>
        <div className="chips">{compatibility&&<span>{compatibility}</span>}
          <span>{p.versions?.[p.versions.length - 1] || "Minecraft"}</span>
          {p.categories?.slice(0, 2).map((c) => (
            <span key={c}>{categories[c] ? t(categories[c]) : c}</span>
          ))}
        </div>
        <div className="card-foot">
          <span className="downloads" data-tooltip={t("downloads")}>
            <Download size={13} />
            {Intl.NumberFormat(undefined, {
              notation: "compact",
              maximumFractionDigits: 1,
            }).format(p.downloads || 0)}
          </span>
          <button className="compact-action" onClick={onOpen}>
            {t("view")}
            <SquareArrowOutUpRight size={13} />
          </button>
          {type === "modpack" && (
            <button
              className={
                installed
                  ? "compact-action installed"
                  : "compact-action install-action"
              }
              disabled={installed || blocked || !providerAvailable(p.provider)}
              onClick={onInstall}
              aria-label={busy&&percent!==undefined?`${t("installing")} · ${percent}%`:undefined}
            >
              {installed
                ? t("installed")
                : busy
                  ? t("installing")
                  : t("install")}
              {!installed && <Plus size={13} />}
            </button>
          )}
          {busy&&percent!==undefined&&<span className="card-install-progress" aria-hidden="true">{percent}%</span>}
        </div>
        <span className="card-provider">{providerName(p.provider)}</span>
      </div>
    </article>
  );
});

export default memo(ProjectCard);
