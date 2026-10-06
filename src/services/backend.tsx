import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  mergeTask,
  isTerminal,
  startingTask,
  taskCommands,
  type ActivityTask,
  type GameSession,
} from "./activity";
import { listen } from "@tauri-apps/api/event";
export interface Account {
  id: string;
  provider: string;
  uuid: string;
  username: string;
  status: string;
  avatar?: string;
  last_used?: number;
}
export interface RuntimeInstance {
  internal?: boolean;
  id: string;
  name: string;
  provider: string;
  project_id?: string;
  version_id?: string;
  version_name: string;
  minecraft: string;
  loader: string;
  loader_version?: string;
  directory: string;
  icon?: string;
  installed: number;
  last_played?: number;
  playtime: number;
  favorite: boolean;
  update_available?: boolean;
  status: string;
  error?: { code: string; message: string };
  overrides: {
    java?: string;
    min_memory?: number;
    max_memory?: number;
    jvm_args?: string[];
    game_args?: string[];
    width?: number;
    height?: number;
    fullscreen?: boolean;
    account?: string;
  };
}
export interface RuntimeSettings {
  instances_path?: string;
  backup_before_changes: boolean;
  backup_retention: number;
  log_retention_days: number;
  update_checks: boolean;
  automatic_java: boolean;
  java_path?: string;
  min_memory: number;
  max_memory: number;
  jvm_args: string[];
  game_args: string[];
  width: number;
  height: number;
  fullscreen: boolean;
  concurrency: number;
  snapshots: boolean;
  active_account?: string;
}
export interface BackendProgress {
  id: string;
  stage: string;
  status: "running" | "success" | "failure";
  file: string;
  completed: number;
  total: number;
  downloaded: number;
  bytes_total: number;
  percent: number;
  speed: number;
}
export interface Snapshot {
  tasks?: ActivityTask[];
  instances: RuntimeInstance[];
  accounts: Account[];
  settings: RuntimeSettings;
  activity: {
    id?: string;
    timestamp: number;
    instance?: string;
    kind: string;
    message: string;
  }[];
  data_folder: string;
  physical_memory_mb?: number;
  providers: Record<string, { configured: boolean; requirement?: string }>;
}
export function defaultAccount(snapshot: Snapshot | null): Account | undefined {
  if (!snapshot) return undefined;
  const id = snapshot.settings.active_account;
  if (id) return snapshot.accounts.find((account) => account.id === id);
  return snapshot.accounts.reduce<Account | undefined>(
    (latest, account) =>
      !latest || (account.last_used ?? 0) >= (latest.last_used ?? 0)
        ? account
        : latest,
    undefined,
  );
}
export interface Java {
  path: string;
  version: string;
  major: number;
  vendor: string;
  architecture: string;
  managed: boolean;
}
interface ContextValue {
  sessions: GameSession[];
  tasks: ActivityTask[];
  cancelTask: (id: string) => Promise<void>;
  snapshot: Snapshot | null;
  progress: BackendProgress | null;
  error: unknown;
  clearError: () => void;
  refresh: () => Promise<void>;
  run: <T>(
    command: string,
    args?: Record<string, unknown>,
    options?: { reportError?: boolean },
  ) => Promise<T>;
  logs: string[];
}
const Context = createContext<ContextValue>({
  tasks: [],
  sessions: [],
  cancelTask: async () => {},
  snapshot: null,
  progress: null,
  error: null,
  clearError: () => {},
  refresh: async () => {},
  run: async () => {
    throw Error("Desktop application required");
  },
  logs: [],
});
export function BackendProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [tasks, setTasks] = useState<ActivityTask[]>([]);
  const taskRef = useRef<ActivityTask[]>([]);
  const updateTask = useCallback((task: ActivityTask) => {
    const next = mergeTask(taskRef.current, task);
    if (next !== taskRef.current) {
      taskRef.current = next;
      setTasks(next);
    }
  }, []);
  const sessions: GameSession[] = (snapshot?.instances ?? [])
    .filter((i) => i.status === "running" || i.status === "stopping")
    .map((i) => ({
      instanceId: i.id,
      title: i.name,
      minecraft: i.minecraft,
      loader: i.loader,
      startedAt: i.last_played ?? Date.now() / 1000,
      status: i.status === "stopping" ? "stopping" : "playing",
    }));
  const progressTask = [...tasks].reverse().find((t) => !isTerminal(t));
  const progress: BackendProgress | null = progressTask
    ? {
        id: progressTask.operationId,
        stage: progressTask.stage,
        status: "running",
        file: progressTask.currentFile,
        completed: progressTask.completed,
        total: progressTask.total,
        downloaded: progressTask.downloaded,
        bytes_total: progressTask.bytesTotal,
        percent: progressTask.percent,
        speed: progressTask.speed,
      }
    : null;
  const [error, setError] = useState<unknown>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const updateChecked = useRef(false);
  const refreshSequence = useRef(0);
  const refresh = useCallback(async () => {
    if (isTauri()) {
      const sequence = ++refreshSequence.current;
      const value = await invoke<Snapshot>("backend_snapshot");
      if (sequence === refreshSequence.current) {
        setSnapshot(value);
        value.tasks?.forEach(updateTask);
      }
    }
  }, [updateTask]);
  const cancelTask = useCallback(
    async (id: string) => {
      const task = taskRef.current.find((t) => t.id === id);
      if (
        !task ||
        isTerminal(task) ||
        task.cancelRequested ||
        !task.cancellable
      )
        return;
      updateTask({ ...task, status: "cancelling", cancelRequested: true });
      try {
        await invoke("cancel_operation", { id });
      } catch (error) {
        const current = taskRef.current.find((t) => t.id === id);
        if (current && !isTerminal(current)) {
          const reset = {
            ...current,
            status: "running" as const,
            cancelRequested: false,
          };
          taskRef.current = taskRef.current.map((t) =>
            t.id === id ? reset : t,
          );
          setTasks(taskRef.current);
        }
        setError(error);
        throw error;
      }
    },
    [updateTask],
  );
  const run = useCallback(
    async <T,>(
      command: string,
      args?: Record<string, unknown>,
      options?: { reportError?: boolean },
    ) => {
      if (command === "cancel_operation") {
        const task = [...taskRef.current]
          .reverse()
          .find(
            (t) =>
              (t.id === args?.id || t.operationId === args?.id) &&
              !isTerminal(t),
          );
        if (task) {
          await cancelTask(task.id);
          return undefined as T;
        }
      }
      const task = taskCommands[command]
        ? startingTask(
            command,
            args ?? {},
            String(
              args?.name ??
                snapshotRef.current?.instances.find((i) => i.id === args?.id)
                  ?.name ??
                args?.title ??
                "Minecraft",
            ),
          )
        : null;
      if (task) updateTask(task);
      const finish = (error?: unknown) => {
        if (!task) return;
        const current = taskRef.current.find((t) => t.id === task.id) ?? task;
        if (isTerminal(current)) return;
        const detail =
          typeof error === "object" && error !== null
            ? (error as { code?: string; stage?: string; message: string })
            : undefined;
        updateTask({
          ...current,
          updatedAt: Date.now() / 1000,
          status: error
            ? detail?.code === "cancelled" || detail?.stage === "cancelled"
              ? "cancelled"
              : "failed"
            : "completed",
          cancellable: false,
          currentFile: "",
          speed: 0,
          error: error
            ? { code: detail?.code, message: detail?.message ?? String(error) }
            : undefined,
        });
      };
      try {
        const result = await invoke<T>(
          command,
          task ? { ...args, taskId: task.id } : args,
        );
        finish();
        if (
          ![
            "loader_versions",
            "minecraft_versions",
            "detect_java",
            "test_java",
            "game_logs",
            "scan_screenshots",
            "content_inventory",
            "content_worlds",
            "content_search",
            "content_project",
            "content_versions",
            "content_preview",
            "choose_mrpack_file",
            "choose_content_files",
            "inspect_content_files",
            "pack_update_preview",
            "storage_usage",
            "choose_storage_folder",
            "catalog_search",
            "catalog_versions",
            "cancel_operation",
          ].includes(command)
        )
          await refresh();
        return result;
      } catch (error) {
        finish(error);
        const code =
          (error as { code?: string; stage?: string })?.code ??
          (error as { stage?: string })?.stage;
        if (code !== "cancelled" && options?.reportError !== false)
          setError(
            typeof error === "object" && error !== null
              ? { ...error, instance_id: args?.id }
              : error,
          );
        await refresh().catch(() => {});
        throw error;
      }
    },
    [refresh, updateTask, cancelTask],
  );
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    const disposers: (() => void)[] = [];
    const subscribe = async () => {
      for (const event of [
        "instances-changed",
        "process-exited",
        "content-changed",
      ]) {
        const unlisten = await listen(
          event,
          () => void refresh().catch(setError),
        );
        if (cancelled) unlisten();
        else disposers.push(unlisten);
      }
      for (const [event, handler] of [
        ["backend-error", (payload: unknown) => setError(payload)],
        [
          "activity-task",
          (payload: unknown) => updateTask(payload as ActivityTask),
        ],
        [
          "backend-progress",
          (payload: unknown) => {
            const p = payload as BackendProgress;
            const task = [...taskRef.current]
              .reverse()
              .find((t) => t.operationId === p.id && !isTerminal(t));
            if (task && task.revision === 0)
              updateTask({
                ...task,
                stage: p.stage,
                currentFile: p.file,
                completed: p.completed,
                total: p.total,
                downloaded: p.downloaded,
                bytesTotal: p.bytes_total,
                percent: p.percent,
                speed: p.speed,
              });
          },
        ],
        [
          "process-output",
          (payload: unknown) =>
            setLogs((lines) =>
              [...lines, (payload as { line: string }).line].slice(-500),
            ),
        ],
      ] as const) {
        const unlisten = await listen(event, (e) => handler(e.payload));
        if (cancelled) unlisten();
        else disposers.push(unlisten);
      }
      if (!cancelled) {
        await refresh();
        void invoke("restore_accounts")
          .then(refresh)
          .catch(() => {});
      }
    };
    void subscribe().catch(setError);
    return () => {
      cancelled = true;
      disposers.forEach((fn) => fn());
    };
  }, [refresh, updateTask]);
  useEffect(() => {
    if (
      !isTauri() ||
      !snapshot?.settings.update_checks ||
      updateChecked.current
    )
      return;
    updateChecked.current = true;
    void invoke("check_modpack_updates")
      .then(refresh)
      .catch(() => {});
  }, [snapshot?.settings.update_checks, refresh]);
  return (
    <Context.Provider
      value={{
        tasks,
        sessions,
        cancelTask,
        snapshot,
        progress,
        error,
        clearError: () => setError(null),
        refresh,
        run,
        logs,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useBackend = () => useContext(Context);
