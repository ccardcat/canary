import {memo,useCallback,useRef} from "react";
import {useBackend} from "../services/backend";
import {projectInstallTask,isTerminal} from "../services/activity";
import {Download,Info,Plus} from "lucide-react";
import {categories,type T} from "../locales";
import {type Project,type ContentType} from "../services/modrinth";
import {providerName,providerAvailable} from "../services/providers";
import RemoteImage from "./RemoteImage";
import {cardSpotlight} from "./DesktopBehavior";
type ProjectCardProps = {
  compatibility?:string;
  selection?:{checked:boolean;disabled?:boolean;onChange:()=>void;label:string};
  p: Project;
  t: T;
  type: ContentType;
  installed: boolean;
  installationDisabled?:boolean;
  interactionDisabled?:boolean;
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
const CardView=memo(function CardView({p,t,type,installed,onOpen,onInstall,compatibility,selection,interactionDisabled,busy,blocked,taskId,percent}:ProjectCardProps & {busy:boolean;blocked:boolean;taskId?:string;percent?:number}) {
  return (
    <article data-project-id={`${p.provider||"modrinth"}:${p.project_id}`} data-task-id={taskId} className={"project-card compact-project-card"+(selection?.checked?" project-selected":"")} onPointerMove={cardSpotlight}>
      <div className="project-card-heading">
        <button className="project-icon-button" disabled={interactionDisabled} onClick={onOpen} aria-label={t("view")+": "+p.title}><RemoteImage src={p.icon_url} alt=""/></button>
        <div className="project-heading-copy"><span className="card-kind">{t(type)}</span><button className="card-title" disabled={interactionDisabled} onClick={onOpen}>{p.title}</button></div>
        {selection&&<label className="project-selection"><input type="checkbox" aria-label={selection.label} checked={selection.checked} disabled={selection.disabled} onChange={selection.onChange}/></label>}
      </div>
      <div className="card-body">
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
          <button className="material-icon project-open-action" disabled={interactionDisabled} aria-label={t("view")} data-tooltip={t("view")} onClick={onOpen}><Info size={16}/></button>
          {(type === "modpack"||!!selection) && (
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
