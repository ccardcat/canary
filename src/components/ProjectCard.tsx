import {Download,SquareArrowOutUpRight,Plus} from "lucide-react";
import {categories,type T} from "../locales";
import {artwork,type Project,type ContentType} from "../services/modrinth";
import {providerName} from "../services/providers";
import RemoteImage from "./RemoteImage";
import {cardSpotlight} from "./DesktopBehavior";
export default function ProjectCard({
  p,
  t,
  type,
  installed,
  busy = false,
  onOpen,
  onInstall,
  compatibility,
}: {
  compatibility?:string;
  p: Project;
  t: T;
  type: ContentType;
  installed: boolean;
  busy?: boolean;
  onOpen: () => void;
  onInstall: () => void;
}) {
  const art = artwork(p) || p.icon_url;
  return (
    <article className="project-card" onPointerMove={cardSpotlight}>
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
              disabled={installed || busy}
              onClick={onInstall}
            >
              {installed
                ? t("installed")
                : busy
                  ? t("installing")
                  : t("install")}
              {!installed && <Plus size={13} />}
            </button>
          )}
        </div>
        <span className="card-provider">{providerName(p.provider)}</span>
      </div>
    </article>
  );
}
