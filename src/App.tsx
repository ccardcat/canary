import {version as appVersion} from "../package.json";
import GlassSelect from "./components/GlassSelect";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import ProjectCard from "./components/ProjectCard";
import {providerDetail,providerVersions,providerName,providerSite,type Provider} from "./services/providers";
import { useDiscovery } from "./hooks/useDiscovery";
import { diagnostics, type Progress } from "./services/installation";
import { externalLink } from "./services/links";
import RemoteImage from "./components/RemoteImage";
const Markdown = lazy(() => import("./components/Markdown"));
import { isTauri, invoke,convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Activity,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Download,
  ExternalLink,
  GalleryHorizontalEnd,
  House,
  Image,
  Layers3,
  Library as LibraryIcon,
  ListFilter,
  Package,
  PanelLeftClose,
  Plus,
  Puzzle,
  Search,
  Server,
  Settings as SettingsIcon,
  SlidersHorizontal,
  UserRound,
  X,
  Sun,
  Moon,
  Monitor,
  Palette,
  Info,
  Heart,
} from "lucide-react";
import "./App.css";

import TitleBar from "./components/TitleBar";
import {HeroCarousel,HeroSettings} from "./components/HeroCarousel";
import {StorageSettings} from "./components/StorageSettings";
import { useBackend,defaultAccount } from "./services/backend";
import AccountAvatar from "./components/AccountAvatar";
import { AccountsPanel, RuntimeSettingsPanel, RuntimeLibrary, RuntimeProgress, RuntimeActivity, RuntimeScreenshots, BackendErrors } from "./components/RuntimeUI";
import { MaterialPreferencesPanel, VisualPreferences, SidebarArtwork, VisualQuality, WindowPreferencesPanel, EffectsPreferences } from "./components/VisualAppearance";
import { en, ru, type Key, type T, categories } from "./locales";
import {
  readStored,
  searchProjects,
  type ContentType,
  type Detail,
  type Project,
  type Version,
} from "./services/modrinth";

type Page =
  | "Home"
  | "Discover"
  | "Library"
  | "Downloads"
  | "Screenshots"
  | "Activity"
  | "Settings";
type Mode = "dark" | "light" | "amoled" | "system";
type Accent =
  | "monochrome"
  | "white"
  | "gray"
  | "mint"
  | "emerald"
  | "aqua"
  | "blue"
  | "purple"
  | "rose"
  | "orange";
const nav: Record<Page, typeof House> = {
  Home: House,
  Discover: Compass,
  Library: LibraryIcon,
  Downloads: Download,
  Screenshots: Image,
  Activity,
  Settings: SettingsIcon,
};
const types: { id: ContentType; icon: typeof Boxes; key: Key }[] = [
  { id: "modpack", icon: Boxes, key: "modpack" },
  { id: "mod", icon: Puzzle, key: "mod" },
  { id: "resourcepack", icon: Layers3, key: "resourcepack" },
  { id: "datapack", icon: Package, key: "datapack" },
  { id: "shader", icon: GalleryHorizontalEnd, key: "shader" },
  { id: "server", icon: Server, key: "server" },
];
const accentColors: Record<Accent, string> = {
  monochrome: "#e9efec",
  white: "#ffffff",
  gray: "#aeb9b5",
  mint: "#72d6ac",
  emerald: "#47c98b",
  aqua: "#61cfe0",
  blue: "#83a8ed",
  purple: "#b29aed",
  rose: "#ed9bad",
  orange: "#e8ae79",
};
const modes: Mode[] = ["dark", "light", "amoled", "system"];
function getInitialLanguage() {
  const saved = localStorage.getItem("canary-language");
  if (saved === "ru" || saved === "en") return saved;
  return navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
}
function App() {
  const backend = useBackend();
  const activeAccount=defaultAccount(backend.snapshot);
  const [lang, setLang] = useState<"en" | "ru">(getInitialLanguage);
  const dict = lang === "ru" ? ru : en;
  const t = useCallback<T>((key) => dict[key] ?? en[key], [dict]);
  const [page, setPage] = useState<Page>("Home");
  const discovery = useDiscovery();
  const [community, setCommunity] = useState<Project[]>([]);
  const [communityError, setCommunityError] = useState(false);
  const [librarySelectionId,setLibrarySelectionId]=useState<string|null>(null);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [lib, setLib] = useState<Project[]>(() =>
    readStored("canary-library", []),
  );
  const homeLibrary:Project[]=isTauri()?(backend.snapshot?.instances||[]).filter(i=>!i.internal).map(i=>({native_instance_id:i.id,project_id:i.project_id||i.id,provider:i.provider==="curseforge"?"curseforge":"modrinth",title:i.name,description:`Minecraft ${i.minecraft} · ${i.loader}`,icon_url:i.icon&&!/^https?:|^asset:/i.test(i.icon)?convertFileSrc(i.icon):i.icon,downloads:0,versions:[i.minecraft],categories:[i.loader],project_type:"modpack",version_name:i.version_name,instance_path:i.directory})):lib;
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const progressRef = useRef<Progress | null>(null);
  const installing = useRef(false);
  const [error, setError] = useState<{
    message: string;
    details?: string;
    retry?: () => void;
    title?: string;
  } | null>(null);
  const [success, setSuccess] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedVersion, setSelectedVersion] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const detailAbort = useRef<AbortController | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("appearance");
  const [accountOpen, setAccountOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(
    () => (localStorage.getItem("canary-mode") as Mode) || "dark",
  );
  const [accent, setAccent] = useState<Accent>(
    () => (localStorage.getItem("canary-accent") as Accent) || "monochrome",
  );
  const [compact, setCompact] = useState(
    () => localStorage.getItem("canary-compact") === "true",
  );
  const [reduceMotion, setReduceMotion] = useState(
    () => localStorage.getItem("canary-motion") === "reduced",
  );
  const [systemLight, setSystemLight] = useState(
    () => matchMedia("(prefers-color-scheme: light)").matches,
  );
  const [narrow, setNarrow] = useState(
    () => matchMedia("(max-width: 900px)").matches,
  );
  const [preset, setPreset] = useState(
    () => localStorage.getItem("canary-preset") || "graphite",
  );
  const resolvedMode =
    mode === "system" ? (systemLight ? "light" : "dark") : mode;
  const sidebarOpen = !compact && !narrow;
  const accountRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const light = matchMedia("(prefers-color-scheme: light)");
    const small = matchMedia("(max-width: 900px)");
    const updateLight = () => setSystemLight(light.matches);
    const updateSmall = () => setNarrow(small.matches);
    light.addEventListener("change", updateLight);
    small.addEventListener("change", updateSmall);
    return () => {
      light.removeEventListener("change", updateLight);
      small.removeEventListener("change", updateSmall);
    };
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.mode = resolvedMode;
    document.documentElement.dataset.accent = accent;
    document.documentElement.dataset.preset = preset;
    document.documentElement.dataset.motion = reduceMotion ? "reduced" : "full";
    document.documentElement.lang = lang;
    localStorage.setItem("canary-language", lang);
    localStorage.setItem("canary-mode", mode);
    localStorage.setItem("canary-accent", accent);
    localStorage.setItem("canary-preset", preset);
    localStorage.setItem("canary-compact", String(compact));
    localStorage.setItem("canary-motion", reduceMotion ? "reduced" : "full");
  }, [mode, resolvedMode, accent, preset, compact, reduceMotion, lang]);
  useEffect(() => {
    const controller = new AbortController();
    searchProjects(
      "modpack",
      "",
      "downloads",
      0,
      { loader: "", game: "", category: "", environment: "" },
      controller.signal,
    )
      .then((data) => setCommunity(data.hits.slice(0, 3)))
      .catch(() => {
        if (!controller.signal.aborted) setCommunityError(true);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    listen<Progress>("install-progress", (event) => {
      if (installing.current) {
        progressRef.current = event.payload;
        setProgress(event.payload);
      }
    })
      .then((fn) => {
        if (disposed) fn();
        else unsubscribe = fn;
      })
      .catch((e) =>
        setError({ message: t("networkError"), details: String(e) }),
      );
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [t]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!accountRef.current?.contains(e.target as Node))
        setAccountOpen(false);
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector("dialog[open]")) return;
      if (settingsOpen) setSettingsOpen(false);
      else if (accountOpen) setAccountOpen(false);
      else if (filterOpen) setFilterOpen(false);
      else if (error) setError(null);
      else if (detail) setDetail(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [settingsOpen, accountOpen, filterOpen, error, detail]);
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(false), 6000);
    return () => clearTimeout(timer);
  }, [success]);
  useEffect(() => () => detailAbort.current?.abort(), []);
  useEffect(() => {
    document.querySelector(".content-shell")?.scrollTo({ top: 0 });
  }, [page, detail?.id]);

  async function openProject(p: Project) {
    detailAbort.current?.abort();
    const controller = new AbortController();
    detailAbort.current = controller;
    setDetailLoading(true);
    setVersions([]);
    setSelectedVersion("");
    try {
      const [d, v] = await Promise.all([
        providerDetail(p,controller.signal),
        providerVersions(p,controller.signal),
      ]);
      if (!controller.signal.aborted) {
        setDetail(d);
        setVersions(v);
        setSelectedVersion(
          (d.project_type === "modpack" && p.provider!=="curseforge"
            ? v.find((version) =>
                version.files.some((file) => file.filename.endsWith(".mrpack")),
              )
            : v[0]
          )?.id || "",
        );
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError({
          message: t("networkError"),
          details: String(e),
          retry: () => void openProject(p),
        });
    } finally {
      if (!controller.signal.aborted) setDetailLoading(false);
    }
  }
  async function install(p: Project, versionId?: string) {
    if (installing.current || backend.snapshot?.instances.some(x=>x.project_id===p.project_id&&x.provider===(p.provider||"modrinth")) || lib.some((x) => x.project_id === p.project_id&&(x.provider||"modrinth")===(p.provider||"modrinth")))
      return;
    if (!isTauri()) {
      setError({ title: t("installError"), message: t("nativeRequired") });
      return;
    }
    installing.current = true;
    setBusy(true);
    setError(null);
    setSuccess(false);
    const base: Progress = {
      stage: "fetch_version",
      status: "running",
      file: "",
      completed: 0,
      total: 0,
      downloaded: 0,
      bytes_total: 0,
      percent: 0,
    };
    progressRef.current = base;
    setProgress(base);
    let stage = "fetch_version";
    let current = base;
    try {
      // Never reuse versions from a different open project.
      const list = await providerVersions(p);
      const version = versionId
        ? list.find((v) => v.id === versionId)
        : p.provider==="curseforge"?list[0]:list.find((v) => v.files.some((f) => f.filename.endsWith(".mrpack")));
      if (!version) throw Error("No compatible modpack version");
      const instancePath = p.provider==="curseforge" ? (await backend.run<{directory:string}>("install_curseforge_pack",{projectId:Number(p.project_id),fileId:Number(version.id)})).directory : await invoke<string>("install_modpack", {projectId:p.project_id,versionId:version.id,name:p.title});
      if(p.provider!=="curseforge")await backend.run("prepare_instance",{id:`${p.project_id}-${version.id}`,repair:false});
      stage = "add_to_library";
      current = { ...(progressRef.current || base), stage, percent: 99 };
      setProgress(current);
      console.info("[install][add_to_library] starting", p.project_id);
      const next = [
        ...lib.filter((x) => x.project_id !== p.project_id||(x.provider||"modrinth")!==(p.provider||"modrinth")),
        {
          ...p,
          instance_path: instancePath,
          version_id: version.id,
          version_name: version.version_number,
          installed_at: new Date().toISOString(),
        },
      ];
      // A failed storage write must not report a successful library insertion.
      localStorage.setItem("canary-library", JSON.stringify(next));
      setLib(next);
      console.info("[install][add_to_library] success", instancePath);
      setProgress({
        ...current,
        stage: "finalize",
        status: "success",
        percent: 100,
      });
      console.info("[install][finalize] success");
      setSuccess(true);
      setDetail(null);
      setPage("Library");
    } catch (e) {
      console.error(
        `[install][${typeof e === "object" && e && "stage" in e ? e.stage : stage}] failure`,
        e,
      );
      setProgress((prev) =>
        prev
          ? { ...prev, status: "failure" }
          : { ...current, status: "failure" },
      );
      setError({
        title: t("installError"),
        message: t("installErrorSub"),
        details: diagnostics(e, stage),
        retry: () => void install(p, versionId),
      });
    } finally {
      installing.current = false;
      setBusy(false);
    }
  }
  const isInstalled = (id: string,provider:Provider=discovery.provider) => backend.snapshot?.instances.some(x=>x.project_id===id&&x.provider===provider)||lib.some((x) => x.project_id === id&&(x.provider||"modrinth")===provider);
  const navigation = (next: Page) => {
    if (next === "Settings") {
      setSettingsOpen(true);
      setSettingsTab("appearance");
    } else {
      detailAbort.current?.abort();
      setDetailLoading(false);
      setDetail(null);
      setPage(next);
    }
    setAccountOpen(false);
    setFilterOpen(false);
  };
  const activeNav = settingsOpen ? "Settings" : page;
  return (
    <MotionConfig
      reducedMotion={reduceMotion ? "always" : "user"}
      transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <TitleBar light={resolvedMode === "light"} russian={lang === "ru"} />
      <div className={"canary-app" + (busy ? " is-installing" : "")}>
        <aside className={sidebarOpen ? "sidebar" : "sidebar compact"}>
          <SidebarArtwork />
          <div className="brand">
            <img
              src={
                resolvedMode === "light"
                  ? "/branding/canary-bird-black.png"
                  : "/branding/canary-bird-white.png"
              }
              alt=""
              draggable={false}
            />
            <span>Canary</span>
          </div>
          <nav aria-label={t("navigation")}>
            {(Object.keys(nav) as Page[]).map((id) => {
              const Icon = nav[id];
              return (
                <button
                  key={id}
                  aria-label={t(id.toLowerCase() as Key)}
                  aria-current={activeNav === id ? "page" : undefined}
                  data-tooltip={t(id.toLowerCase() as Key)}
                  className={activeNav === id ? "active" : ""}
                  onClick={() => navigation(id)}
                >
                  {activeNav === id && (
                    <motion.span
                      className="nav-capsule"
                      layoutId="sidebar-active"
                    />
                  )}
                  <Icon size={19} />
                  <span className="nav-label">
                    {t(id.toLowerCase() as Key)}
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="sidebar-bottom">
            <button
              onClick={() => setCompact(!compact)}
              aria-label={compact ? t("expand") : t("collapse")}
              data-tooltip={compact ? t("expand") : t("collapse")}
            >
              <PanelLeftClose size={18} />
              <span className="nav-label">{t("collapse")}</span>
            </button>
            <button
              onClick={() => {
                setSettingsTab("language");
                setSettingsOpen(true);
              }}
              data-tooltip={t("language")}
            >
              <span className="language-code">{lang.toUpperCase()}</span>
              <span className="nav-label">{t("language")}</span>
            </button>
          </div>
        </aside>
        <main className="content-shell">
          <header className="topbar">
            <div className="topbar-heading">
              <div className="breadcrumb">
                CANARY <span>/</span>{" "}
                {detail ? t("view") : t(page.toLowerCase() as Key)}
              </div>
              <h1>
                {detail
                  ? detail.title
                  : page === "Home"
                    ? t("welcome")
                    : t(page.toLowerCase() as Key)}
              </h1>
              {page === "Home" && !detail && (
                <p className="topbar-sub">{t("sub")}</p>
              )}
            </div>
            <div className="account-wrap" ref={accountRef}>
              <button
                className="account-button"
                onClick={() => setAccountOpen(!accountOpen)}
                aria-expanded={accountOpen}
                aria-label={t("account")}
              >
                <AccountAvatar key={activeAccount?.id} username={activeAccount?.username} skin={activeAccount?.avatar}/>
                <div className="account-label">
                  <small>{t("account")}</small>
                  <b>{activeAccount?.username || t("noAccount")}</b>
                </div>
                <ChevronDown
                  className={accountOpen ? "rotated" : ""}
                  size={16}
                />
              </button>
              <AnimatePresence>
                {accountOpen && (
                  <AccountPopover t={t} onClose={() => setAccountOpen(false)} />
                )}
              </AnimatePresence>
            </div>
          </header>
          {busy && progress && (
            <button
              className="install-strip"
              aria-busy="true"
              onClick={() => navigation("Downloads")}
            >
              <Download size={16} />
              <span>{t("installing")}</span>
              <div className="progress">
                <i style={{ width: `${progress.percent}%` }} />
              </div>
              <b>{Math.round(progress.percent)}%</b>
            </button>
          )}
          {detailLoading && (
            <div className="loading-detail" role="status">
              {t("loading")}
            </div>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              className="page-transition"
              key={detail ? `project-${detail.provider || "modrinth"}-${detail.id}` : page}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              {detail ? (
                <DetailPage
                  detail={detail}
                  versions={versions}
                  selected={selectedVersion}
                  setSelected={setSelectedVersion}
                  onBack={() => setDetail(null)}
                  onLibrary={() => navigation("Library")}
                  onInstall={() =>
                    install(
                      {
                        provider: detail.provider || "modrinth",
                        project_type: detail.project_type,
                        project_id: detail.id,
                        title: detail.title,
                        description: detail.description,
                        icon_url: detail.icon_url,
                        downloads: detail.downloads,
                      },
                      selectedVersion,
                    )
                  }
                  installed={isInstalled(detail.id,detail.provider||"modrinth")}
                  busy={busy}
                  t={t}
                />
              ) : page === "Home" ? (
                <HomePage
                  russian={lang === "ru"}
                  t={t}
                  lib={homeLibrary}
                  projects={community}
                  communityError={communityError}
                  onDiscover={() => navigation("Discover")}
                  onOpen={p=>{if(p.native_instance_id){setLibrarySelectionId(p.native_instance_id);navigation("Library");}else void openProject(p);}}
                  onInstall={install}
                  installed={id=>isInstalled(id,"modrinth")}
                  busy={busy}
                />
              ) : page === "Discover" ? (
                <DiscoverPage
                  t={t}
                  {...discovery}
                  filterOpen={filterOpen}
                  setFilterOpen={setFilterOpen}
                  filterRef={filterRef}
                  onOpen={openProject}
                  onInstall={install}
                  installed={isInstalled}
                  busy={busy}
                />
              ) : page === "Library" ? (
                isTauri() ? <RuntimeLibrary russian={lang === "ru"} initialInstanceId={librarySelectionId} onInitialOpened={()=>setLibrarySelectionId(null)}/> : <LibraryPage
                  t={t}
                  lib={lib}
                  query={libraryQuery}
                  setQuery={setLibraryQuery}
                  onOpen={openProject}
                  onDiscover={() => navigation("Discover")}
                />
              ) : page === "Downloads" ? (
                <><RuntimeProgress russian={lang === "ru"}/><DownloadsPage t={t} progress={progress} error={error} /></>
              ) : page === "Screenshots" ? (
                isTauri() ? <RuntimeScreenshots russian={lang === "ru"}/> : <EmptyPage
                  icon={Image}
                  title={t("screenshots")}
                  text={t("noScreensSub")}
                  t={t}
                />
              ) : (
                isTauri() ? <RuntimeActivity russian={lang === "ru"}/> : <EmptyPage
                  icon={Activity}
                  title={t("noActivity")}
                  text={t("noActivitySub")}
                  t={t}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
        <AnimatePresence>
          {settingsOpen && (
            <SettingsModal
              t={t}
              tab={settingsTab}
              setTab={setSettingsTab}
              onClose={() => setSettingsOpen(false)}
              lang={lang}
              setLang={setLang}
              mode={mode}
              setMode={setMode}
              accent={accent}
              setAccent={setAccent}
              compact={compact}
              setCompact={setCompact}
              reduceMotion={reduceMotion}
              setReduceMotion={setReduceMotion}
              preset={preset}
              setPreset={setPreset}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {error && (
            <ErrorToast
              key="error"
              error={error}
              t={t}
              onClose={() => setError(null)}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {success && (
            <motion.div
              className="toast success-toast"
              role="status"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
            >
              <LibraryIcon size={18} />
              <span>{t("success")}</span>
              <button aria-label={t("close")} onClick={() => setSuccess(false)}>
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <BackendErrors russian={lang === "ru"}/>
    </MotionConfig>
  );
}
function AccountPopover({ t, onClose }: { t: T; onClose: () => void }) {
  return (
    <motion.div
      className="popover account-popover"
      role="dialog"
      aria-label={t("account")}
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
    >
      <div className="popover-title">
        <span>{t("account")}</span>
        <span className="status-dot" />
      </div>
      {isTauri() ? <AccountsPanel russian={t("home") === "Главная"}/> : <>
      <div className="account-empty">
        <div className="big-avatar">
          <UserRound size={21} />
        </div>
        <b>{t("noAccount")}</b>
        <p>{t("accountSub")}</p>
      </div>
      <button className="popover-action" onClick={onClose}>
        <Plus size={17} />
        {t("addAccount")}
        <span className="planned">{t("planned")}</span>
      </button>
      </>}
    </motion.div>
  );
}
function HomePage({
  t,
  russian,
  lib,
  projects,
  communityError,
  onDiscover,
  onOpen,
  onInstall,
  installed,
  busy,
}: {
  t: T;
  russian:boolean;
  lib: Project[];
  projects: Project[];
  communityError: boolean;
  onDiscover: () => void;
  onOpen: (p: Project) => void;
  onInstall: (p: Project) => void;
  installed: (id: string) => boolean;
  busy: boolean;
}) {
  return (
    <section className="home-page">
      <HeroCarousel russian={russian}>
        <div className="hero-content">
          <div className="overline">CANARY / {t("home").toUpperCase()}</div>
          <h2>{t("discoverTitle")}</h2>
          <p>{t("discoverSub")}</p>
          <button className="primary-button" onClick={onDiscover}>
            <Compass size={17} />
            {t("browse")}
          </button>
          <div className="hero-caption">
            <span className="status-dot" />
            {t("heroCaption")}
          </div>
        </div>
      </HeroCarousel>
      <div className="home-section-head">
        <div>
          <h3>{t("continue")}</h3>
          <p>{lib.length ? t("noPlay") : t("emptyContinue")}</p>
        </div>
      </div>
      {lib.length ? (
        <div className="home-row">
          {lib.slice(0, 3).map((p) => (
            <MiniCard key={p.native_instance_id || `${p.provider || "modrinth"}:${p.project_id}`} p={p} t={t} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <div className="home-empty">
          <div className="empty-emblem">
            <LibraryIcon size={22} />
          </div>
          <div>
            <b>{t("emptyContinue")}</b>
            <p>{t("emptyLibrarySub")}</p>
          </div>
          <button className="quiet-button" onClick={onDiscover}>
            {t("discover")}
            <ChevronRight size={15} />
          </button>
        </div>
      )}
      <div className="home-section-head">
        <div>
          <h3>{t("trending")}</h3>
          <p>{t("communitySub")}</p>
        </div>
        <button className="quiet-button" onClick={onDiscover}>
          {t("showAll")}
          <ChevronRight size={15} />
        </button>
      </div>
      {projects.length ? (
        <div className="home-community">
          {projects.map((p) => (
            <ProjectCard
              key={p.native_instance_id || `${p.provider || "modrinth"}:${p.project_id}`}
              p={p}
              t={t}
              type="modpack"
              installed={installed(p.project_id)}
              busy={busy}
              onOpen={() => onOpen(p)}
              onInstall={() => onInstall(p)}
            />
          ))}
        </div>
      ) : (
        <div className="home-empty" role="status">
          <Compass size={20} />
          <span>{t(communityError ? "networkError" : "loadingSub")}</span>
        </div>
      )}
    </section>
  );
}
function MiniCard({
  p,
  t,
  onOpen,
}: {
  p: Project;
  t: T;
  onOpen: (p: Project) => void;
}) {
  return (
    <button className="mini-card" onClick={() => onOpen(p)}>
      <RemoteImage src={p.icon_url} className="mini-art" />
      <div>
        <b>{p.title}</b>
        <small>
          {t("installed")} · {p.version_name}
        </small>
      </div>
      <ChevronRight size={15} />
    </button>
  );
}
function DiscoverPage({
  provider,setProvider,
  t,
  type,
  setType,
  projects,
  loading,
  error,
  retry,
  query,
  setQuery,
  filters,
  setFilters,
  filterOpen,
  setFilterOpen,
  filterRef,
  sort,
  setSort,
  total,
  page,
  setPage,
  onOpen,
  onInstall,
  installed,
  busy,
}: {
  provider:Provider;setProvider:(value:Provider)=>void;
  t: T;
  type: ContentType;
  setType: (x: ContentType) => void;
  projects: Project[];
  loading: boolean;
  error: string | null;
  retry: () => void;
  query: string;
  setQuery: (x: string) => void;
  filters: {
    loader: string;
    game: string;
    category: string;
    environment: string;
  };
  setFilters: (x: {
    loader: string;
    game: string;
    category: string;
    environment: string;
  }) => void;
  filterOpen: boolean;
  setFilterOpen: (x: boolean) => void;
  filterRef: React.RefObject<HTMLDivElement | null>;
  sort: string;
  setSort: (x: string) => void;
  total: number;
  page: number;
  setPage: (x: number) => void;
  onOpen: (p: Project) => void;
  onInstall: (p: Project) => void;
  installed: (id: string) => boolean;
  busy: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / 12));
  return (
    <section className="discover-page">
      <div className="discover-intro">
        <p>{t("discoverSub")}</p>
        <div className="provider-badge">
          <span className="provider-dot" />
          <GlassSelect aria-label="Provider" value={provider} onChange={e=>setProvider(e.target.value as Provider)}><option value="modrinth">Modrinth</option><option value="curseforge">CurseForge</option></GlassSelect>
        </div>
      </div>
      <div className="type-tabs" role="tablist" aria-label={t("contentTypes")}>
        {types.map(({ id, icon: Icon, key }) => (
          <button
            role="tab"
            aria-selected={type === id}
            className={type === id ? "selected" : ""}
            onClick={() => setType(id)}
            key={id}
          >
            {type === id && (
              <motion.span
                className="segment-capsule"
                layoutId="discover-tab"
              />
            )}
            <Icon size={16} />
            <span>{t(key)}</span>
          </button>
        ))}
      </div>
      <div className="discover-toolbar">
        <div className="search-field">
          <Search size={18} />
          <input
            aria-label={t("search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
          />
          {query && (
            <button aria-label={t("reset")} onClick={() => setQuery("")}>
              <X size={14} />
            </button>
          )}
        </div>
        <div className="filter-wrap" ref={filterRef}>
          <button
            className="control-button"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen(!filterOpen)}
          >
            <ListFilter size={17} />
            {t("filters")}
            <span className="filter-count">
              {Object.values(filters).filter(Boolean).length || ""}
            </span>
          </button>
          <AnimatePresence>
            {filterOpen && (
              <FilterPopover
                provider={provider}
                t={t}
                filters={filters}
                setFilters={setFilters}
                type={type}
              />
            )}
          </AnimatePresence>
        </div>
        <div className="sort-wrap">
          <GlassSelect
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label={t("sort")}
          >
            <option value="downloads">{t("popular")}</option>
            <option value="relevance">{t("relevance")}</option>
            <option value="updated">{t("updated")}</option>
            <option value="newest">{t("newest")}</option>
            {provider==="modrinth"&&<option value="follows">{t("follows")}</option>}
          </GlassSelect>
          <ChevronDown size={14} />
        </div>
      </div>
      {type === "server" ? (
        <div className="notice-empty">
          <Server size={25} />
          <h3>{t("serverUnavailable")}</h3>
          <p>{t("serverUnavailableSub")}</p>
        </div>
      ) : (
        <>
          <div className="results-line">
            <span>{t("results")}</span>
            <small aria-live="polite">
              {loading ? t("loading") : total.toLocaleString()}
            </small>
          </div>
          <div aria-busy={loading}>
            {loading ? (
              <SkeletonGrid />
            ) : error ? (
              <div className="notice-empty" role="alert">
                <h3>{t("networkError")}</h3>
                <button className="quiet-button" onClick={retry}>
                  {t("retry")}
                </button>
                <details className="selectable">
                  <summary>{t("details")}</summary>
                  {error}
                </details>
              </div>
            ) : projects.length ? (
              <div className="project-grid">
                {projects.map((p) => (
                  <ProjectCard
                    key={p.native_instance_id || `${p.provider || "modrinth"}:${p.project_id}`}
                    p={p}
                    t={t}
                    type={type}
                    installed={installed(p.project_id)}
                    busy={busy}
                    onOpen={() => onOpen(p)}
                    onInstall={() => onInstall(p)}
                  />
                ))}
              </div>
            ) : (
              <div className="notice-empty">
                <Search size={25} />
                <h3>{t("noResults")}</h3>
                <p>{t("noResultsSub")}</p>
              </div>
            )}
          </div>
          <div className="pagination" aria-label={t("page")}>
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={15} />
              {t("previous")}
            </button>
            <span aria-live="polite" data-testid="page-label">
              {t("page")} {page} / {pages}
            </span>
            <button
              disabled={page >= pages || loading}
              onClick={() => setPage(page + 1)}
            >
              {t("next")}
              <ChevronRight size={15} />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
function FilterPopover({
  provider="modrinth",
  t,
  filters,
  setFilters,
  type,
}: {
  provider?:Provider;
  t: T;
  filters: {
    loader: string;
    game: string;
    category: string;
    environment: string;
  };
  setFilters: (x: {
    loader: string;
    game: string;
    category: string;
    environment: string;
  }) => void;
  type: ContentType;
}) {
  const update = (key: keyof typeof filters, value: string) =>
    setFilters({ ...filters, [key]: value });
  return (
    <motion.div
      className="popover filter-popover"
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
    >
      <div className="filter-head">
        <b>{t("filters")}</b>
        <button
          onClick={() =>
            setFilters({ loader: "", game: "", category: "", environment: "" })
          }
        >
          {t("reset")}
        </button>
      </div>
      <label>
        {t("gameVersion")}
        <GlassSelect
          value={filters.game}
          onChange={(e) => update("game", e.target.value)}
        >
          <option value="">{t("any")}</option>
          {["1.21.1", "1.21", "1.20.1", "1.20", "1.19.2", "1.16.5"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </GlassSelect>
      </label>
      {type !== "resourcepack" && type !== "shader" && (
        <label>
          {t("loader")}
          <GlassSelect
            value={filters.loader}
            onChange={(e) => update("loader", e.target.value)}
          >
            <option value="">{t("any")}</option>
            {["fabric", "forge", "neoforge", "quilt"].map((x) => (
              <option key={x} value={x}>
                {x[0].toUpperCase() + x.slice(1)}
              </option>
            ))}
          </GlassSelect>
        </label>
      )}
      {provider==="modrinth"&&(<label>
        {t("category")}
        <GlassSelect
          value={filters.category}
          onChange={(e) => update("category", e.target.value)}
        >
          <option value="">{t("any")}</option>
          {Object.entries(categories)
            .slice(0, 10)
            .map(([value, key]) => (
              <option value={value} key={value}>
                {t(key)}
              </option>
            ))}
        </GlassSelect>
      </label>)}
      {type === "mod" && provider==="modrinth" && (
        <label>
          {t("environment")}
          <GlassSelect
            value={filters.environment}
            onChange={(e) => update("environment", e.target.value)}
          >
            <option value="">{t("any")}</option>
            <option value="client">{t("client")}</option>
            <option value="server">{t("serverSide")}</option>
          </GlassSelect>
        </label>
      )}
    </motion.div>
  );
}
function SkeletonGrid() {
  return (
    <div className="project-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <div className="skeleton-card" key={i}>
          <div />
          <span />
          <span />
          <small />
        </div>
      ))}
    </div>
  );
}
function LibraryPage({
  t,
  lib,
  query,
  setQuery,
  onOpen,
  onDiscover,
}: {
  t: T;
  lib: Project[];
  query: string;
  setQuery: (x: string) => void;
  onOpen: (p: Project) => void;
  onDiscover: () => void;
}) {
  const shown = lib.filter((p) =>
    p.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="library-page">
      <div className="library-intro">
        <div>
          <div className="overline">CANARY / {t("library").toUpperCase()}</div>
          <h2>{lib.length ? t("library") : t("emptyLibrary")}</h2>
          <p>
            {lib.length
              ? `${lib.length} ${t("installedCount").toLowerCase()}`
              : t("emptyLibrarySub")}
          </p>
        </div>
        <button className="primary-button" onClick={onDiscover}>
          <Compass size={17} />
          {t("browse")}
        </button>
      </div>
      {lib.length > 0 && (
        <div className="library-toolbar">
          <div className="search-field">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchLibrary")}
            />
          </div>
          <div className="library-tabs">
            <button className="selected">{t("allInstances")}</button>
            <button disabled data-tooltip={t("planned")}>
              {t("favorites")}
            </button>
          </div>
        </div>
      )}
      {shown.length ? (
        <div className="project-grid library-grid">
          {shown.map((p) => (
            <ProjectCard
              key={p.native_instance_id || `${p.provider || "modrinth"}:${p.project_id}`}
              p={p}
              t={t}
              type="modpack"
              installed
              onOpen={() => onOpen(p)}
              onInstall={() => undefined}
            />
          ))}
        </div>
      ) : (
        <div className="library-empty">
          <LibraryIcon size={34} />
          <h3>{t("emptyLibrary")}</h3>
          <p>{t("emptyLibrarySub")}</p>
          <button className="primary-button" onClick={onDiscover}>
            {t("browse")}
          </button>
        </div>
      )}
    </section>
  );
}
function DetailPage({
  detail,
  versions,
  selected,
  setSelected,
  onBack,
  onLibrary,
  onInstall,
  installed,
  busy,
  t,
}: {
  detail: Detail;
  versions: Version[];
  selected: string;
  setSelected: (x: string) => void;
  onBack: () => void;
  onLibrary: () => void;
  onInstall: () => void;
  installed: boolean;
  busy: boolean;
  t: T;
}) {
  const [tab, setTab] = useState("description");
  const gallery = detail.gallery?.filter((x) => x.url) || [];
  const available =
    detail.project_type === "modpack" && detail.provider !== "curseforge"
      ? versions.filter((v) =>
          v.files.some((f) => f.filename.endsWith(".mrpack")),
        )
      : versions;
  const art =
    gallery.find((g) => g.featured)?.url || gallery[0]?.url || detail.icon_url;
  return (
    <section className="detail-page">
      <button className="back-button" onClick={onBack}>
        <ChevronLeft size={17} />
        {t("back")}
      </button>
      <div className="detail-hero">
        {art && (
          <div
            className="detail-art"
            aria-hidden="true"
            style={{ backgroundImage: `url(${art})` }}
          />
        )}
        <div className="detail-visual">
          <RemoteImage src={detail.icon_url} />
        </div>
        <div className="detail-heading">
          <div className="overline">{t(detail.project_type)}</div>
          <h2>{detail.title}</h2>
          <p>{detail.description}</p>
          <div className="detail-meta">
            <span>
              <Download size={14} />
              {Intl.NumberFormat().format(detail.downloads)}
            </span>
            <span>
              <Heart size={14} />
              {Intl.NumberFormat().format(detail.followers)}
            </span>
            <span>{providerName(detail.provider)}</span>
          </div>
          <div className="detail-actions">
            {detail.project_type !== "modpack" ? (
              <button
                className="primary-button"
                onClick={() =>
                  externalLink(
                    providerSite(detail),
                  )
                }
              >
                <ExternalLink size={16} />
                {t("projectSite")}
              </button>
            ) : installed ? (
              <button className="primary-button" onClick={onLibrary}>
                <LibraryIcon size={16} />
                {t("openLibrary")}
              </button>
            ) : (
              <>
                <label className="version-control">
                  <span>{t("selectedVersion")}</span>
                  <GlassSelect
                    aria-label={t("selectedVersion")}
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">{t("selection")}</option>
                    {available.map((v) => (
                      <option value={v.id} key={v.id}>
                        {v.version_number} · {v.game_versions.join(", ")} ·{" "}
                        {v.loaders.join(", ")}
                      </option>
                    ))}
                  </GlassSelect>
                </label>
                <button
                  className="primary-button"
                  onClick={onInstall}
                  disabled={
                    busy ||
                    !selected ||
                    !available.some((v) => v.id === selected)
                  }
                >
                  <Download size={16} />
                  {t(busy ? "installing" : "install")}
                </button>
              </>
            )}
          </div>
          {!available.length && <small>{t("noVersions")}</small>}
        </div>
      </div>
      <div className="detail-tabs" role="tablist" aria-label={t("view")}>
        {["description", "versions", "gallery"].map((key) => (
          <button
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "selected" : ""}
            onClick={() => setTab(key)}
            key={key}
          >
            {t(key as Key)}
            {key === "versions"
              ? ` · ${versions.length}`
              : key === "gallery"
                ? ` · ${gallery.length}`
                : ""}
          </button>
        ))}
      </div>
      <div className="detail-content">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {tab === "description" ? (
            <Suspense fallback={<p role="status">{t("loading")}</p>}>
              <Markdown body={detail.body || t("noDescription")} format={detail.body_format}/>
            </Suspense>
          ) : tab === "gallery" ? (
            gallery.length ? (
              <div className="gallery-strip">
                {gallery.map((g) => (
                  <RemoteImage key={g.url} src={g.url} alt={g.title} />
                ))}
              </div>
            ) : (
              <p>{t("noGallery")}</p>
            )
          ) : (
            <div className="version-list">
              {versions.map((v) => (
                <details key={v.id}>
                  <summary>
                    <b>{v.version_number}</b>
                    <span>{v.game_versions.join(" · ")}</span>
                    <small>
                      {new Date(v.date_published).toLocaleDateString()}
                    </small>
                  </summary>
                  <Suspense fallback={<p role="status">{t("loading")}</p>}>
                    <Markdown body={v.changelog || t("noDescription")} />
                  </Suspense>
                </details>
              ))}
            </div>
          )}
        </motion.div>
        <aside className="detail-side">
          <b>{t("lastUpdated")}</b>
          <span>{new Date(detail.updated).toLocaleDateString()}</span>
          <b>{t("gameVersion")}</b>
          <span>{detail.game_versions?.slice(-6).join(" · ") || t("any")}</span>
          <b>{t("category")}</b>
          <span>
            {detail.categories
              ?.map((c) => (categories[c] ? t(categories[c]) : c))
              .join(" · ") || t("any")}
          </span>
          {detail.source_url && (
            <button
              className="text-link"
              onClick={() => externalLink(detail.source_url!)}
            >
              <ExternalLink size={13} />
              {t("source")}
            </button>
          )}
        </aside>
      </div>
    </section>
  );
}
function ErrorToast({
  error,
  t,
  onClose,
}: {
  error: {
    title?: string;
    message: string;
    details?: string;
    retry?: () => void;
  };
  t: T;
  onClose: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(error.details || error.message);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  };
  return (
    <motion.div
      className="toast error-toast"
      role="alert"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
    >
      <div className="toast-head">
        <b>{error.title || t("error")}</b>
        <button onClick={onClose} aria-label={t("dismiss")}>
          <X size={17} />
        </button>
      </div>
      <p>{error.message}</p>
      <div className="toast-actions">
        {error.retry && (
          <button className="quiet-button" onClick={error.retry}>
            {t("retry")}
          </button>
        )}
        {error.details && (
          <button
            className="quiet-button"
            onClick={() => setShowDetails(!showDetails)}
          >
            {t(showDetails ? "hideDetails" : "details")}
          </button>
        )}
      </div>
      {showDetails && (
        <div className="toast-details">
          <pre>{error.details}</pre>
          <button className="quiet-button" onClick={copy}>
            {t(copied ? "copied" : "copy")}
          </button>
          {copyError && <p>{t("copyFallback")}</p>}
        </div>
      )}
    </motion.div>
  );
}
function DownloadsPage({
  t,
  progress,
  error,
}: {
  t: T;
  progress: Progress | null;
  error: { message: string; details?: string } | null;
}) {
  return (
    <section className="downloads-page">
      <div className="overline">CANARY / {t("downloads").toUpperCase()}</div>
      <h2>
        {progress?.status === "success"
          ? t("completed")
          : progress
            ? t("installation")
            : t("noDownloads")}
      </h2>
      <p>{progress ? t("loadingSub") : t("noDownloadsSub")}</p>
      {progress ? (
        <div className="download-panel">
          <div className="download-stage">
            <Download size={19} />
            <div>
              <b>
                {t(
                  (progress.stage in en
                    ? progress.stage
                    : "installation") as Key,
                )}
              </b>
              <span className="selectable">
                {progress.file ||
                  t(progress.status === "success" ? "success" : "loadingSub")}
              </span>
            </div>
            <strong>{Math.round(progress.percent)}%</strong>
          </div>
          <div className="progress">
            <i style={{ width: `${progress.percent}%` }} />
          </div>
          <small>
            {progress.completed} / {progress.total} {t("files")} ·{" "}
            {progress.downloaded
              ? `${(progress.downloaded / 1024 / 1024).toFixed(1)} MB ${t("bytes").toLowerCase()}`
              : ""}
          </small>
        </div>
      ) : (
        <div className="empty-surface">
          <Download size={30} />
        </div>
      )}
      {error && (
        <div className="inline-error">
          <b>{t("installError")}</b>
          <span>{error.message}</span>
        </div>
      )}
    </section>
  );
}
function EmptyPage({
  icon: Icon,
  title,
  text,
  t,
  onAction,
}: {
  icon: typeof Image;
  title: string;
  text: string;
  t: T;
  onAction?: () => void;
}) {
  return (
    <section className="empty-page">
      <div className="empty-surface">
        <Icon size={30} />
        <h2>{title}</h2>
        <p>{text}</p>
        {onAction && (
          <button className="primary-button" onClick={onAction}>
            <SettingsIcon size={16} />
            {t("appearance")}
          </button>
        )}
      </div>
    </section>
  );
}
function SettingsModal({
  t,
  tab,
  setTab,
  onClose,
  lang,
  setLang,
  mode,
  setMode,
  accent,
  setAccent,
  compact,
  setCompact,
  reduceMotion,
  setReduceMotion,
  preset,
  setPreset,
}: {
  t: T;
  tab: string;
  setTab: (x: string) => void;
  onClose: () => void;
  lang: "en" | "ru";
  setLang: (x: "en" | "ru") => void;
  mode: Mode;
  setMode: (x: Mode) => void;
  accent: Accent;
  setAccent: (x: Accent) => void;
  compact: boolean;
  setCompact: (x: boolean) => void;
  reduceMotion: boolean;
  setReduceMotion: (x: boolean) => void;
  preset: string;
  setPreset: (x: string) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [search,setSearch]=useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),select:not([aria-hidden='true']),input,a[href],[tabindex='0']",
        ) || []),
      ];
      const first = elements[0],
        last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, []);
  const russian=lang==="ru";
  const sections: [string,string,typeof Palette,string][] = [
    ["appearance",t("appearance"),Palette,"appearance material vibrancy glass opacity blur tint acrylic mica transparency оформление материал стекло прозрачность размытие"],
    ["window",russian?"Окно":"Window",Monitor,"window titlebar branding controls F11 fullscreen maximize окно заголовок кнопки fullscreen"],
    ["background",russian?"Фон":"Background",Image,"background wallpaper hero rotation import фон обои главная карусель"],
    ["effects",russian?"Эффекты":"Effects",Sun,"effects particles snow sakura autumn wind motion эффекты снег сакура листья ветер"],
    ["typography",russian?"Типографика":"Typography",SlidersHorizontal,"font typography size Monocraft шрифт масштаб размер"],
    ["storage",russian?"Хранилище":"Storage",LibraryIcon,"storage directory migration cache папка диск хранилище перенос кэш"],
    ["minecraft","Minecraft",Boxes,"minecraft java memory ram arguments resolution игра память аргументы разрешение"],
    ["downloads",t("downloads"),Download,"downloads concurrency загрузки параллельные"],
    ["accountSettings",t("accountSettings"),UserRound,"accounts Microsoft Ely.by local профиль аккаунт вход"],
    ["advanced",t("advanced"),SettingsIcon,"advanced quality performance logs backups restore retention дополнительные качество логи резервные"],
    ["language",t("language"),SlidersHorizontal,"language locale язык локализация"],
    ["canary",t("canary"),Download,"canary runtime settings настройки minecraft"],
    ["about",t("about"),Info,"about version версия информация"],
  ];
  const results=sections.filter(([id,label,_icon,words])=>(id+" "+label+" "+words).toLowerCase().includes(search.toLowerCase().trim()));
  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        className="settings-modal"
        ref={panel}
        role="dialog"
        aria-label={t("settings")}
        aria-modal="true"
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 8 }}
        transition={{ duration: 0.26 }}
      >
        <div className="settings-top">
          <div>
            <div className="overline">CANARY</div>
            <h2>{t("settings")}</h2>
          </div>
          <button onClick={onClose} aria-label={t("close")}>
            <X size={19} />
          </button>
        </div>
        <div className="settings-search"><input type="search" aria-label={russian?"Поиск настроек":"Search settings"} placeholder={russian?"Поиск настроек: Vibrancy, F11, фон, шрифт…":"Search settings: Vibrancy, F11, background, font…"} value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label={t("settings")}>
            {sections.map(([id, label, Icon]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => {setSearch("");setTab(id);}}
              >
                {tab === id && (
                  <motion.span
                    className="nav-capsule"
                    layoutId="settings-active"
                  />
                )}
                <Icon size={17} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="settings-content">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
              >
                {search.trim()?<div className="settings-results">{results.length?results.map(([id,label,Icon,words])=><button key={id} onClick={()=>{setTab(id);setSearch("");}}><Icon size={17}/> {label}<small>{words.split(" ").slice(0,7).join(" · ")}</small></button>):<p>{russian?"Настройки не найдены":"No settings found"}</p>}</div>:tab === "window" ? <WindowPreferencesPanel russian={russian}/> :tab === "background" ? <><VisualPreferences russian={russian} group="background"/><HeroSettings russian={russian}/></> :tab === "effects" ? <EffectsPreferences russian={russian}/> :tab === "typography" ? <VisualPreferences russian={russian} group="typography"/> :tab === "storage" ? <StorageSettings russian={russian}/> :tab === "minecraft"?<RuntimeSettingsPanel russian={russian} section="minecraft"/> :tab === "downloads"?<RuntimeSettingsPanel russian={russian} section="downloads"/> :tab === "appearance" ? (
                  <Appearance
                    t={t}
                    mode={mode}
                    setMode={setMode}
                    accent={accent}
                    setAccent={setAccent}
                    compact={compact}
                    setCompact={setCompact}
                    reduceMotion={reduceMotion}
                    setReduceMotion={setReduceMotion}
                    preset={preset}
                    setPreset={setPreset}
                  />
                ) : tab === "accountSettings" && isTauri() ? (
                  <AccountsPanel russian={lang === "ru"}/>
                ) : tab === "canary" && isTauri() ? (
                  <RuntimeSettingsPanel russian={lang === "ru"}/>
                ) : tab === "advanced" ? (
                  <><VisualQuality russian={lang === "ru"}/>{isTauri()&&<RuntimeSettingsPanel russian={russian} section="advanced"/>}</>
                ) : tab === "language" ? (
                  <LanguageSettings t={t} lang={lang} setLang={setLang} />
                ) : (
                  <SettingsInfo
                    t={t}
                    icon={
                      tab === "accountSettings"
                        ? UserRound
                        : tab === "canary"
                          ? Download
                          : Info
                    }
                    title={
                      tab === "accountSettings"
                        ? t("accountTitle")
                        : tab === "about"
                          ? "Canary"
                          : t(tab as Key)
                    }
                    text={
                      tab === "accountSettings"
                        ? t("accountSub")
                        : tab === "canary"
                          ? t("noDownloadsSub")
                          : tab === "advanced"
                            ? t("advancedSub")
                            : `${t("aboutSub")} ${t("version")} ${appVersion} · Modrinth / CurseForge`
                    }
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
function Appearance({
  t,
  mode,
  setMode,
  accent,
  setAccent,
  compact,
  setCompact,
  reduceMotion,
  setReduceMotion,
  preset,
  setPreset,
}: {
  t: T;
  mode: Mode;
  setMode: (x: Mode) => void;
  accent: Accent;
  setAccent: (x: Accent) => void;
  compact: boolean;
  setCompact: (x: boolean) => void;
  reduceMotion: boolean;
  setReduceMotion: (x: boolean) => void;
  preset: string;
  setPreset: (x: string) => void;
}) {
  const modeIcon = { dark: Moon, light: Sun, amoled: Moon, system: Monitor };
  const presets: Key[] =
    (mode === "light" || (mode === "system" && matchMedia("(prefers-color-scheme: light)").matches))
      ? ["white", "softLight", "frost", "warm"]
      : ["graphite", "black", "softDark", "midnight"];
  return (
    <div className="appearance-settings">
      <div className="setting-intro">
        <div className="overline">CANARY / {t("appearance").toUpperCase()}</div>
        <h3>{t("appearance")}</h3>
        <p>{t("appearanceSub")}</p>
      </div>
      <h4>{t("mode")}</h4>
      <div className="mode-grid">
        {modes.map((m) => {
          const Icon = modeIcon[m];
          return (
            <button
              className={mode === m ? "selected" : ""}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              key={m}
            >
              <Icon size={18} />
              <span>{t(m)}</span>
            </button>
          );
        })}
      </div>
      <MaterialPreferencesPanel russian={t("home")==="Главная"}/>
      <h4>{t("preset")}</h4>
      <div className="preset-grid">
        {presets.map((p) => (
          <button
            key={p}
            aria-pressed={preset === p}
            className={preset === p ? "selected" : ""}
            onClick={() => setPreset(p)}
          >
            {t(p)}
          </button>
        ))}
      </div>
      <h4>{t("accent")}</h4>
      <div className="accent-grid">
        {(Object.keys(accentColors) as Accent[]).map((a) => (
          <button
            className={accent === a ? "selected" : ""}
            aria-pressed={accent === a}
            onClick={() => setAccent(a)}
            key={a}
          >
            <i style={{ background: accentColors[a] }} />
            <span>{t(a === "white" ? "accentWhite" : a)}</span>
          </button>
        ))}
      </div>
      <div className="toggle-setting">
        <div>
          <b>{t("compact")}</b>
          <span>{t("compactSub")}</span>
        </div>
        <button
          className={compact ? "toggle on" : "toggle"}
          role="switch"
          aria-label={t("compact")}
          aria-checked={compact}
          onClick={() => setCompact(!compact)}
        >
          <i />
        </button>
      </div>
      <div className="toggle-setting">
        <div>
          <b>{t("reduceMotion")}</b>
          <span>{t("reduceMotionSub")}</span>
        </div>
        <button
          className={reduceMotion ? "toggle on" : "toggle"}
          role="switch"
          aria-label={t("reduceMotion")}
          aria-checked={reduceMotion}
          onClick={() => setReduceMotion(!reduceMotion)}
        >
          <i />
        </button>
      </div>
      <VisualPreferences russian={t("home") == "Главная"} />
      <p className="settings-note">{t("storedLocally")}</p>
    </div>
  );
}
function LanguageSettings({
  t,
  lang,
  setLang,
}: {
  t: T;
  lang: "en" | "ru";
  setLang: (x: "en" | "ru") => void;
}) {
  return (
    <div className="language-settings">
      <div className="setting-intro">
        <div className="overline">DISPLAY / {t("language").toUpperCase()}</div>
        <h3>{t("language")}</h3>
        <p>{t("languageSub")}</p>
      </div>
      <div className="language-cards">
        <button
          className={lang === "ru" ? "selected" : ""}
          onClick={() => setLang("ru")}
        >
          <span>А</span>
          <div>
            <b>Русский</b>
            <small>Русский интерфейс</small>
          </div>
        </button>
        <button
          className={lang === "en" ? "selected" : ""}
          onClick={() => setLang("en")}
        >
          <span>A</span>
          <div>
            <b>English</b>
            <small>English interface</small>
          </div>
        </button>
      </div>
    </div>
  );
}
function SettingsInfo({
  t,
  icon: Icon,
  title,
  text,
}: {
  t: T;
  icon: typeof UserRound;
  title: string;
  text: string;
}) {
  return (
    <div className="settings-info">
      <Icon size={28} />
      <div className="setting-intro">
        <div className="overline">CANARY</div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      <span className="planned-badge">{t("planned")}</span>
    </div>
  );
}
export default App;
