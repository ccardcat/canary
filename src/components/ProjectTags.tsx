import {useState} from "react";
import {Monitor, Server} from "lucide-react";
import {loaderNames, projectTags, tagLabel} from "../services/catalog";
import type {Project} from "../services/modrinth";
import type {T} from "../locales";

export function LoaderLabel({loader}: {loader: string}) {
  const key = loader.toLowerCase();
  return <span className={`loader-label loader-${key in loaderNames ? key : "other"}`}>{loaderNames[key] || loader.charAt(0).toUpperCase() + loader.slice(1)}</span>;
}
export function ProjectTags({p, t, limit = 6}: {p: Project; t: T; limit?: number}) {
  const [expanded, setExpanded] = useState(false);
  const tags = projectTags(p);
  const visible = expanded || !limit ? tags : tags.slice(0, limit);
  const env = Array.isArray(p.environment) ? p.environment : p.environment ? [p.environment] : [];
  const client = p.client_side === "required" || p.client_side === "optional" || env.some(item => item.startsWith("client") || item === "singleplayer_only" || item === "server_only_client_optional");
  const server = p.server_side === "required" || p.server_side === "optional" || env.some(item => item.includes("server") && item !== "client_only");
  return <div className="project-tags">
    {client && <span className="project-tag"><Monitor size={12}/>{t("client")}</span>}
    {server && <span className="project-tag"><Server size={12}/>{t("serverSide")}</span>}
    {visible.map(tag => tag in loaderNames ? <LoaderLabel key={tag} loader={tag}/> : <span className="project-tag" key={tag}>{tagLabel(tag, t)}</span>)}
    {!!limit && tags.length > limit && <button className="project-tag tag-expand" aria-expanded={expanded} aria-label={t("home") === "Главная" ? expanded ? "Свернуть теги" : "Показать все теги" : expanded ? "Collapse tags" : "Show all tags"} onClick={() => setExpanded(!expanded)}>{expanded ? "−" : `+${tags.length - limit}`}</button>}
  </div>;
}
