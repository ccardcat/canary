import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  ArrowDownToLine,
  Check,
  CircleAlert,
  Gamepad2,
  Play,
  RefreshCw,
  Square,
  Wrench,
} from "lucide-react";
import { useBackend } from "../services/backend";
import {
  isTerminal,
  type ActivityTask,
  type TaskKind,
  type GameSession,
} from "../services/activity";
import {
  activityMessages,
  stageLabel,
  type ActivityText,
} from "../locales/activity";
import { useVisualAppearance } from "./VisualAppearance";
import "./ActivityDock.css";
const icons: Record<TaskKind, typeof Activity> = {
  download: ArrowDownToLine,
  install: ArrowDownToLine,
  update: RefreshCw,
  repair: Wrench,
  launch: Play,
};
const bytes = (n: number) =>
  n >= 1073741824
    ? `${(n / 1073741824).toFixed(1)} GB`
    : `${(n / 1048576).toFixed(1)} MB`;
export function TaskCancel({
  task,
  russian,
}: {
  task: ActivityTask;
  russian: boolean;
}) {
  const { cancelTask } = useBackend();
  const text = activityMessages[russian ? "ru" : "en"];
  return (
    <button
      type="button"
      className="quiet-button activity-cancel"
      disabled={!task.cancellable || task.cancelRequested}
      onClick={() => void cancelTask(task.id).catch(() => {})}
    >
      {task.cancelRequested
        ? text.cancelling
        : !task.cancellable
          ? text.finalizing
          : text.cancel}
    </button>
  );
}
export function TaskRow({
  task,
  russian,
  details = true,
  names = true,
  onOpen,
  cancelAction = true,
}: {
  task: ActivityTask;
  russian: boolean;
  details?: boolean;
  names?: boolean;
  onOpen?: (id: string) => void;
  cancelAction?: boolean;
}) {
  const text = activityMessages[russian ? "ru" : "en"];
  const [expanded, setExpanded] = useState(false);
  const terminal = isTerminal(task);
  const Icon =
    task.status === "failed"
      ? CircleAlert
      : terminal
        ? Check
        : icons[task.kind];
  const status = terminal
    ? text[task.status as "completed" | "cancelled" | "failed"]
    : task.cancelRequested
      ? text.cancelling
      : !task.cancellable
        ? text.finalizing
        : stageLabel(task.stage, text);
  const known = task.total > 0 || task.bytesTotal > 0;
  return (
    <article
      className={`activity-task ${task.status}`}
      data-task-id={task.id}
      data-task-status={task.status}
      aria-busy={!terminal}
    >
      <div className="activity-row-heading">
        <Icon size={16} aria-hidden="true" />
        <b>{names ? task.title : text[task.kind]}</b>
        <span>
          {!terminal && details && known ? `${Math.round(task.percent)}%` : ""}
        </span>
      </div>
      <p className="activity-status">
        {terminal ? status : `${text[task.kind]} · ${status}`}
      </p>
      {!terminal && details && (
        <>
          <progress
            className="activity-progress"
            max={100}
            value={known ? task.percent : undefined}
            aria-label={status}
          />
          <p className="activity-stats">
            {task.total > 0 &&
              `${task.completed} / ${task.total} ${text.files}`}
            {task.total > 0 && task.downloaded > 0 && " · "}
            {task.downloaded > 0 &&
              `${bytes(task.downloaded)}${task.bytesTotal > 0 ? ` / ${bytes(task.bytesTotal)}` : ""}`}
            {task.speed > 0 && ` · ${bytes(task.speed)}/s`}
          </p>
          {task.currentFile && (
            <p className="activity-file selectable" title={task.currentFile}>
              {task.currentFile}
            </p>
          )}
        </>
      )}
      {!terminal && cancelAction && (
        <TaskCancel task={task} russian={russian} />
      )}
      {task.status === "failed" && (
        <>
          <button
            className="quiet-button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            {text.details}
          </button>
          {expanded && (
            <p className="activity-error selectable">
              {task.error?.message || text.failed}
            </p>
          )}
          {task.instanceId && onOpen && (
            <button
              className="quiet-button"
              onClick={() => onOpen(task.instanceId!)}
            >
              {text.open}
            </button>
          )}
        </>
      )}
    </article>
  );
}
export function ActivityTasks({ russian }: { russian: boolean }) {
  const { tasks } = useBackend();
  const text = activityMessages[russian ? "ru" : "en"];
  const active = tasks.filter((t) => !isTerminal(t));
  const recent = tasks.filter(isTerminal).slice(-10).reverse();
  return (
    <section className="activity-downloads" aria-label={text.activity}>
      <h2>{text.activity}</h2>
      {!active.length && <p>{text.empty}</p>}
      <div className="activity-active">
        {active.map((task) => (
          <TaskRow key={task.id} task={task} russian={russian} />
        ))}
      </div>
      {recent.length > 0 && (
        <details className="activity-recent">
          <summary>{text.recent}</summary>
          {recent.map((task) => (
            <TaskRow key={task.id} task={task} russian={russian} />
          ))}
        </details>
      )}
    </section>
  );
}
function GameRow({
  instance,
  text,
  names,
  onOpen,
}: {
  instance: GameSession;
  text: ActivityText;
  names: boolean;
  onOpen: (id: string) => void;
}) {
  const { run } = useBackend();
  const [now, setNow] = useState(Date.now());
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  return (
    <article className="activity-task playing">
      <div className="activity-row-heading">
        <Gamepad2 size={16} />
        <b>{names ? instance.title : "Minecraft"}</b>
        <i className="activity-game-dot" />
      </div>
      <p>{instance.status === "stopping" ? text.stopping : text.playing}</p>
      <p className="activity-stats">
        Minecraft {instance.minecraft} · {instance.loader}
      </p>
      <p className="activity-stats">
        {Math.max(0, Math.floor((now / 1000 - instance.startedAt) / 60))}{" "}
        {text.minutes}
      </p>
      <div className="activity-game-actions">
        <button
          className="quiet-button"
          onClick={() => onOpen(instance.instanceId)}
        >
          {text.open}
        </button>
        <button
          className="quiet-button"
          disabled={stopping || instance.status === "stopping"}
          onClick={() => {
            setStopping(true);
            void run("stop_instance", { id: instance.instanceId, force: false })
              .catch(() => {})
              .finally(() => setStopping(false));
          }}
        >
          <Square size={12} />
          {text.stop}
        </button>
      </div>
    </article>
  );
}
export function ActivityDock({
  russian,
  onOpen,
  onDownloads,
}: {
  russian: boolean;
  onOpen: (id: string) => void;
  onDownloads: () => void;
}) {
  const { tasks, sessions } = useBackend();
  const { value } = useVisualAppearance();
  const text = activityMessages[russian ? "ru" : "en"];
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [position, setPosition] = useState({ left: 0, top: 44, width: 320 });
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const hover = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const grace = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clear = () => {
    clearTimeout(hover.current);
    clearTimeout(grace.current);
  };
  const active = tasks.filter((t) => !isTerminal(t));
  const games = value.showGameActivity ? sessions : [];
  const recent = tasks
    .filter(
      (t) =>
        isTerminal(t) &&
        t.status !== "cancelled" &&
        now / 1000 - t.updatedAt < (t.status === "failed" ? 30 : 6),
    )
    .slice(-1);
  const visible = [...active, ...(active.length + games.length ? [] : recent)];
  const primary = visible[0];
  const count = active.length + games.length;
  const failed = primary?.status === "failed";
  const running = primary && !isTerminal(primary);
  const Icon = failed
    ? CircleAlert
    : running
      ? icons[primary.kind]
      : games.length
        ? Gamepad2
        : primary
          ? Check
          : Activity;
  const known = primary && (primary.total > 0 || primary.bytesTotal > 0);
  const status = running
    ? primary.cancelRequested
      ? text.cancelling
      : !primary.cancellable
        ? text.finalizing
        : `${text[primary.kind]}${value.showDownloadProgress && known ? ` ${Math.round(primary.percent)}%` : ""}`
    : games.length
      ? text.playing
      : failed
        ? text.failed
        : primary
          ? text.completed
          : text.idle;
  useEffect(() => {
    if (!recent.length && !open) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [open, recent.length]);
  useEffect(() => () => clear(), []);
  useEffect(() => {
    if (!value.showActivityDock) {
      clear();
      setOpen(false);
    }
  }, [value.showActivityDock]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, innerWidth - 16);
      const height = Math.min(
        panel.current?.offsetHeight ?? 300,
        innerHeight - 52,
      );
      const left =
        value.sidebarSide === "right"
          ? rect.left - width - 12
          : rect.right + 12;
      setPosition({
        width,
        left: Math.max(8, Math.min(innerWidth - width - 8, left)),
        top: Math.max(
          44,
          Math.min(innerHeight - height - 8, rect.bottom - height),
        ),
      });
    };
    place();
    const observer = new ResizeObserver(place);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [
    open,
    value.sidebarSide,
    value.sidebarMode,
    visible.length,
    games.length,
  ]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (
        !trigger.current?.contains(e.target as Node) &&
        !panel.current?.contains(e.target as Node)
      ) {
        clear();
        setOpen(false);
      }
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        clear();
        trigger.current?.focus();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  const enter = () => {
    clearTimeout(grace.current);
    clearTimeout(hover.current);
    hover.current = setTimeout(() => setOpen(true), 200);
  };
  const leave = () => {
    clearTimeout(hover.current);
    clearTimeout(grace.current);
    grace.current = setTimeout(() => {
      if (
        !panel.current?.contains(document.activeElement) &&
        document.activeElement !== trigger.current
      )
        setOpen(false);
    }, 250);
  };
  const focusLeave = (event: FocusEvent<HTMLElement>) => {
    if (
      !panel.current?.contains(event.relatedTarget as Node) &&
      event.relatedTarget !== trigger.current
    ) {
      clear();
      setOpen(false);
    }
  };
  if (!value.showActivityDock) return null;
  return (
    <>
      <button
        ref={trigger}
        className={`activity-dock ${failed ? "failed" : running ? "working" : games.length ? "playing" : "idle"}`}
        aria-label={`${text.activity}: ${status}`}
        aria-expanded={open}
        aria-controls="canary-activity-popover"
        data-tooltip={open ? undefined : `${text.activity}: ${status}`}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={() => {
          clear();
          setOpen(true);
        }}
        onBlur={focusLeave}
        onClick={(event) => {
          clear();
          setOpen(true);
          if (event.detail === 0)
            panel.current
              ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
              ?.focus();
        }}
      >
        <span className="activity-dock-icon">
          <Icon size={18} aria-hidden="true" />
          {running && value.showDownloadProgress && known && (
            <svg
              viewBox="0 0 30 30"
              className="activity-ring"
              aria-hidden="true"
            >
              <circle cx="15" cy="15" r="13" />
              <circle
                cx="15"
                cy="15"
                r="13"
                pathLength={100}
                strokeDasharray={`${primary.percent} 100`}
              />
            </svg>
          )}
          {games.length > 0 && <i className="activity-game-dot" />}
        </span>
        <span className="nav-label">{status}</span>
        {count > 1 && <span className="activity-count">{count}</span>}
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id="canary-activity-popover"
            role="region"
            aria-label={text.activity}
            className="popover activity-popover"
            style={position}
            onMouseEnter={() => clear()}
            onMouseLeave={leave}
            onFocusCapture={() => clear()}
            onBlurCapture={focusLeave}
          >
            <div className="activity-popover-heading">
              <b>{text.activity}</b>
              {count > 1 && <small>{count}</small>}
            </div>
            <div className="activity-popover-items">
              {visible.slice(0, 3).map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  russian={russian}
                  details={value.showDownloadProgress}
                  names={value.showActivityNames}
                  onOpen={onOpen}
                />
              ))}
              {games
                .slice(0, Math.max(0, 3 - visible.length))
                .map((instance) => (
                  <GameRow
                    key={instance.instanceId}
                    instance={instance}
                    names={value.showActivityNames}
                    text={text}
                    onOpen={onOpen}
                  />
                ))}
              {!visible.length && !games.length && (
                <p className="activity-idle">{text.idle}</p>
              )}
            </div>
            <button
              className="quiet-button activity-more"
              onClick={() => {
                setOpen(false);
                onDownloads();
              }}
            >
              {count > 3 ? `${text.more} (${count - 3})` : text.downloads}
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
export function ActivitySettings({ russian }: { russian: boolean }) {
  const { value, update } = useVisualAppearance();
  const text = activityMessages[russian ? "ru" : "en"];
  return (
    <section className="activity-settings">
      <h3>{text.activity}</h3>
      {(
        [
          ["showActivityDock", "showDock"],
          ["showGameActivity", "showGame"],
          ["showDownloadProgress", "showProgress"],
          ["showActivityNames", "showNames"],
        ] as const
      ).map(([key, label]) => (
        <div className="toggle-setting" key={key}>
          <b>{text[label]}</b>
          <button
            className={value[key] ? "toggle on" : "toggle"}
            role="switch"
            aria-label={text[label]}
            aria-checked={value[key]}
            onClick={() => update({ [key]: !value[key] })}
          >
            <i />
          </button>
        </div>
      ))}
    </section>
  );
}
