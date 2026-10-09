import {memo,useCallback,useRef} from "react";
import {useLiveTasks} from "../services/taskStore";
import {projectInstallTask,isTerminal} from "../services/activity";
import {Download,Heart,Info,Plus} from "lucide-react";
import {ProjectTags} from "./ProjectTags";
import type {CatalogPreferences} from "../services/catalog";
import {categories,type T} from "../locales";
import {type Project,type ContentType} from "../services/modrinth";
import {providerName,providerAvailable} from "../services/providers";
import RemoteImage from "./RemoteImage";
import {cardSpotlight} from "./DesktopBehavior";
type ProjectCardProps = {
  catalog?:CatalogPreferences;
  library?:boolean;
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
  const tasks=useLiveTasks();
  const task=projectInstallTask(tasks,props.p.provider||'modrinth',props.p.project_id);
  const blocked=!!props.installationDisabled||props.type==="modpack"&&tasks.some(current=>current.projectId&&!isTerminal(current));
  const handlers=useRef(props);handlers.current=props;
  const onOpen=useCallback(()=>handlers.current.onOpen(),[]);
  const onInstall=useCallback(()=>handlers.current.onInstall(),[]);
  return <CardView {...props} onOpen={onOpen} onInstall={onInstall} busy={!!task} taskId={task?.id} percent={task&&task.total>0?Math.round(task.percent):undefined} blocked={blocked}/>;
}
const CardView=memo(function CardView({p,t,type,installed,onOpen,onInstall,compatibility,selection,interactionDisabled,busy,blocked,taskId,percent,catalog,library}:ProjectCardProps & {busy:boolean;blocked:boolean;taskId?:string;percent?:number}) {
  return (
    <article data-project-id={`${p.provider||"modrinth"}:${p.project_id}`} data-task-id={taskId} className={"project-card compact-project-card"+(catalog?" catalog-project-card":"")+(selection?.checked?" project-selected":"")} onPointerMove={cardSpotlight}>
      <div className="project-card-heading">
        <button className="project-icon-button" disabled={interactionDisabled} onClick={onOpen} aria-label={t("view")+": "+p.title}><RemoteImage src={p.icon_url} alt=""/></button>
        <div className="project-heading-copy">{!catalog&&<span className="card-kind">{t(type)}</span>}<button className="card-title" disabled={interactionDisabled} onClick={onOpen}>{p.title}</button>{catalog?.catalogAuthor&&p.author&&<small className="project-author">{t("home")==="Главная"?"Автор: ":"By "}{p.author}</small>}</div>
        {selection&&<label className="project-selection"><input type="checkbox" aria-label={selection.label} checked={selection.checked} disabled={selection.disabled} onChange={selection.onChange}/></label>}
      </div>
      <div className="card-body">
        {(!catalog||catalog.catalogDescription)&&<p>{p.description || t("noDescription")}</p>}
        {catalog?<ProjectTags key={p.project_id} p={p} t={t} limit={catalog.catalogTagLimit}/>:!library&&<div className="chips">{compatibility&&<span>{compatibility}</span>}
          <span>{p.versions?.[p.versions.length - 1] || "Minecraft"}</span>
          {p.categories?.slice(0, 2).map((c) => (
            <span key={c}>{categories[c] ? t(categories[c]) : c}</span>
          ))}
        </div>}
        <div className="card-foot">
          {(!catalog||catalog.catalogStats)&&!library&&<span className="downloads" data-tooltip={t("downloads")}>
            <Download size={13} />
            {Intl.NumberFormat(undefined, {
              notation: "compact",
              maximumFractionDigits: 1,
            }).format(p.downloads || 0)}
          </span>}
          {catalog?.catalogStats&&p.follows!==undefined&&<span className="downloads" data-tooltip={t("follows")}><Heart size={13}/>{Intl.NumberFormat(undefined,{notation:"compact",maximumFractionDigits:1}).format(p.follows)}</span>}
          {catalog?.catalogStats&&p.date_modified&&Number.isFinite(Date.parse(p.date_modified))&&<time className="project-updated" dateTime={p.date_modified} title={t("updated")}>{new Date(p.date_modified).toLocaleDateString(t("home")==="Главная"?"ru":"en")}</time>}
          <button className="material-icon project-open-action" disabled={interactionDisabled} aria-label={t("view")} data-tooltip={t("view")} onClick={onOpen}><Info size={16}/></button>
          {!library && (type === "modpack"||type==="mod"&&p.provider==="curseforge"||!!selection) && (
            <button
              className={
                installed
                  ? "compact-action installed"
                  : "compact-action install-action"
              }
              disabled={installed || blocked || p.download_allowed===false || !providerAvailable(p.provider)}
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
        {!library&&<span className="card-provider">{providerName(p.provider)}</span>}
      </div>
    </article>
  );
});

export default memo(ProjectCard);

