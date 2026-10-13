import {AnimatedDetails} from "./AnimatedDetails";
import {InlineError} from "./InlineError";
import {useLiveTasks} from "../services/taskStore";
import {EmptyState} from "./EmptyState";
import { useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  Check,
  CircleAlert,
  Play,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { useBackend } from "../services/backend";
import {
  isTerminal,
  type ActivityTask,
  type TaskKind,
} from "../services/activity";
import { activityMessages, stageLabel } from "../locales/activity";
import "./TaskActivity.css";
const icons: Record<TaskKind, typeof Activity> = {
  copy: Activity, export: ArrowDownToLine, backup: Wrench, import: ArrowDownToLine,
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
      title={!task.cancellable?(russian?"Файлы уже сохраняются. Дождитесь завершения установки.":"Files are being saved. Wait for installation to finish."):undefined}
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
  cancelAction = true,
}: {
  task: ActivityTask;
  russian: boolean;
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
        <b>{task.title}</b>
        <span>{!terminal && known ? `${Math.round(task.percent)}%` : ""}</span>
      </div>
      <p className="activity-status">
        {terminal ? status : `${text[task.kind]} · ${status}`}
      </p>
      {!terminal && (
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
            <InlineError error={task.error??{code:"task_interrupted"}} russian={russian}/>
          )}
        </>
      )}
    </article>
  );
}
export function PackDownloads({russian}:{russian:boolean}){
 const tasks=useLiveTasks().filter(t=>t.kind==="install"&&t.projectId&&!isTerminal(t));
 if(!tasks.length)return null;
 return <section className="pack-downloads" aria-label={russian?"Текущая установка":"Current installation"}>{tasks.map(task=><TaskRow key={task.id} task={task} russian={russian}/>)}</section>;
}
export function ActivityTasks({ russian,showRecent=true }: { russian: boolean;showRecent?:boolean }) {
  const tasks=useLiveTasks();
  const text = activityMessages[russian ? "ru" : "en"];
  const active = tasks.filter((t) => !isTerminal(t));
  const recent = tasks.filter(isTerminal).slice(-10).reverse();
  return (
    <section className="activity-downloads" aria-label={text.activity}>
      <h2>{russian?"Активные операции":"Active operations"}</h2>
      {!active.length && <EmptyState icon={ArrowDownToLine} title={text.empty}/>}
      <div className="activity-active">
        {active.map((task) => (
          <TaskRow key={task.id} task={task} russian={russian} />
        ))}
      </div>
      {showRecent && recent.length > 0 && (
        <AnimatedDetails className="activity-recent">
          <summary>{text.recent}</summary>
          {recent.map((task) => (
            <TaskRow key={task.id} task={task} russian={russian} />
          ))}
        </AnimatedDetails>
      )}
    </section>
  );
}
