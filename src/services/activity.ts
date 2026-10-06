export const taskKinds = [
  "download",
  "install",
  "update",
  "repair",
  "launch",
] as const;
export type TaskKind = (typeof taskKinds)[number];
export type TaskStatus =
  | "running"
  | "cancelling"
  | "completed"
  | "cancelled"
  | "failed";
export interface ActivityTask {
  id: string;
  operationId: string;
  instanceId?: string;
  kind: TaskKind;
  title: string;
  status: TaskStatus;
  stage: string;
  startedAt: number;
  updatedAt: number;
  revision: number;
  cancellable: boolean;
  cancelRequested: boolean;
  completed: number;
  total: number;
  downloaded: number;
  bytesTotal: number;
  percent: number;
  speed: number;
  currentFile: string;
  error?: { code?: string; message: string };
}
export const isTerminal = (task: ActivityTask) =>
  ["completed", "cancelled", "failed"].includes(task.status);
export function mergeTask(
  tasks: ActivityTask[],
  task: ActivityTask,
): ActivityTask[] {
  const old = tasks.find((t) => t.id === task.id);
  if (old && (isTerminal(old) || old.revision > task.revision)) return tasks;
  const next = {
    ...task,
    percent: Math.min(
      100,
      Math.max(0, Number.isFinite(task.percent) ? task.percent : 0),
    ),
  };
  if (old?.cancelRequested && !isTerminal(next)) {
    next.cancelRequested = true;
    next.status = "cancelling";
  }
  return old
    ? tasks.map((t) => (t.id === next.id ? next : t))
    : [...tasks, next];
}
export const taskCommands: Record<string, TaskKind> = {
  install_modpack: "install",
  install_curseforge_pack: "install",
  create_instance: "install",
  import_mrpack: "install",
  prepare_instance: "repair",
  launch_instance: "launch",
  install_content: "install",
  bulk_install_content: "install",
  import_content_files: "install",
  apply_pack_update: "update",
};
export function startingTask(
  command: string,
  args: Record<string, unknown>,
  title: string,
): ActivityTask {
  const id = crypto.randomUUID();
  const operationId = String(
    args.requestId ??
      args.id ??
      (command === "install_curseforge_pack"
        ? `curseforge-${args.projectId}-${args.fileId}`
        : `${args.projectId}-${args.versionId}`),
  );
  return {
    id,
    operationId,
    instanceId: operationId,
    kind: taskCommands[command],
    title,
    status: "running",
    stage: "preparing",
    startedAt: Date.now() / 1000,
    updatedAt: Date.now() / 1000,
    revision: 0,
    cancellable: true,
    cancelRequested: false,
    completed: 0,
    total: 0,
    downloaded: 0,
    bytesTotal: 0,
    percent: 0,
    speed: 0,
    currentFile: "",
  };
}

export interface GameSession {
  instanceId: string;
  title: string;
  minecraft: string;
  loader: string;
  startedAt: number;
  status: "playing" | "stopping";
}
