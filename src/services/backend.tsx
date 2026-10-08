import {normalizeError} from "./errors";
import {taskStore,useTaskLifecycle} from "./taskStore";
import {gameLogStore} from "./gameLogStore";
import {availableProviders,configureProviders} from "./providers";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
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
  last_server?: {address:string;joined_at:number};
  playtime: number;
  favorite: boolean;
  update_available?: boolean;
  status: string;
  error?: { code: string; message: string };
  overrides: {
    memory_mode?: "auto" | "manual";
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
  memory_mode?: "auto" | "manual";
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
export interface RunOptions {
  reportError?: boolean;
  prepare?: (signal:AbortSignal)=>Promise<Record<string,unknown>>;
}
interface ContextValue {
  sessions: GameSession[];
  tasks: ActivityTask[];
  cancelTask: (id: string) => Promise<void>;
  snapshot: Snapshot | null;
  progress: BackendProgress | null;
  error: unknown;
  clearError: () => void;
  retryError: () => Promise<unknown>;
  refresh: () => Promise<void>;
  run: <T>(
    command: string,
    args?: Record<string, unknown>,
    options?: RunOptions,
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
  retryError: async () => {},
  refresh: async () => {},
  run: async () => {
    throw Error("Desktop application required");
  },
  logs: [],
});
export function BackendProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const setTasks=(tasks:ActivityTask[])=>taskStore.set(tasks);
  const taskRef = useRef<ActivityTask[]>([]);
  const preparing = useRef(new Map<string,AbortController>());
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
  const [error, setError] = useState<unknown>(null);
  const retryRef=useRef<(()=>Promise<unknown>)|null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const updateChecked = useRef(false);
  const refreshSequence = useRef(0);
  const refresh = useCallback(async () => {
    if (isTauri()) {
      const sequence = ++refreshSequence.current;
      const value = await invoke<Snapshot>("backend_snapshot");
      if (sequence === refreshSequence.current) {
        configureProviders(value.providers);
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
        const controller=preparing.current.get(id);
        if(controller)controller.abort();
        else await invoke("cancel_operation", { id });
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
      options?: RunOptions,
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
      if(task?.projectId && taskRef.current.some(current=>current.projectId&&!isTerminal(current)&&current.kind==='install'))
        throw {code:'operation_active',message:'A modpack installation is already active'};
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
      const controller=task&&options?.prepare?new AbortController():null;
      if(task&&controller)preparing.current.set(task.id,controller);
      try {
        if(options?.prepare&&controller&&task){
          const prepared=await options.prepare(controller.signal);
          if(controller.signal.aborted)throw {code:'cancelled',message:'Operation cancelled'};
          args={...args,...prepared};
          const resolved=startingTask(command,args,task.title);
          updateTask({...task,operationId:resolved.operationId,instanceId:resolved.instanceId,versionId:resolved.versionId});
        }
        if(task)preparing.current.delete(task.id);
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
            "game_log_sessions","read_game_log","open_game_log",
            "scan_screenshots",
            "content_inventory",
            "content_worlds",
            "content_search",
            "content_project",
            "content_versions",
            "content_preview","bulk_content_preview",
            "choose_mrpack_file",
            "choose_content_files",
            "inspect_content_files",
            "pack_update_preview",
            "storage_usage",
            "choose_storage_folder",
            "catalog_search","catalog_filters",
            "catalog_versions",
            "cancel_operation",
          ].includes(command)
        )
          await refresh();
        return result;
      } catch (caught) {
        if(task)preparing.current.delete(task.id);
        const error=normalizeError(controller?.signal.aborted?{code:"cancelled",message:"Operation cancelled"}:caught);
        finish(error);
        const code =
          (error as { code?: string; stage?: string })?.code ??
          (error as { stage?: string })?.stage;
        if (code !== "cancelled" && options?.reportError !== false){
          const retryAvailable=error.retryable===true&&["install_modpack","install_curseforge_pack","prepare_instance","launch_instance","install_content","bulk_install_content","create_instance","import_mrpack"].includes(command);
          retryRef.current=retryAvailable?()=>run(command,args,options):null;
          setError({...error,command,task_id:task?.id,instance_id:task?.instanceId??args?.id,retry_available:retryAvailable});
        }
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
          e => {if(event==="process-exited"){const exit=e.payload as {id:string;status:string};gameLogStore.finish(exit.id,exit.status);}void refresh().catch(setError);},
        );
        if (cancelled) unlisten();
        else disposers.push(unlisten);
      }
      for (const [event, handler] of [
        ["backend-error", (payload: unknown) => {retryRef.current=null;setError(normalizeError(payload));}],
        ["memory-adjusted",(payload:unknown)=>setError({code:"memory_adjusted",...(payload as object)})],
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
        ["process-output-batch",(payload:unknown)=>{const batch=payload as {id:string;session?:string;lines:string[]};gameLogStore.pushBatch(batch,snapshotRef.current?.instances.find(i=>i.id===batch.id));}],
        [
          "process-output",
          (payload: unknown) => {
            const line=payload as {id:string;session?:string;line:string};
            gameLogStore.push(line,snapshotRef.current?.instances.find(i=>i.id===line.id));
          },
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
      taskStore.flush();gameLogStore.dispose();
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
    void invoke("check_modpack_updates",{allowedProviders:availableProviders})
      .then(refresh)
      .catch(() => {});
  }, [snapshot?.settings.update_checks, refresh]);
  const clearError=useCallback(()=>{setError(null);retryRef.current=null;},[]);
  const retryError=useCallback(async()=>{const retry=retryRef.current;setError(null);retryRef.current=null;return retry?.();},[]);
  const context=useMemo(()=>({tasks:[],sessions,cancelTask,snapshot,progress:null,error,clearError,retryError,refresh,run,logs:[]}),[snapshot,error,cancelTask,clearError,retryError,refresh,run]);
  return <Context.Provider value={context}>{children}</Context.Provider>;
}

export const useBackend = () => {
  const base=useContext(Context);const tasks=useTaskLifecycle();
  const task=[...tasks].reverse().find(t=>!isTerminal(t));
  const progress:BackendProgress|null=task?{id:task.operationId,stage:task.stage,status:"running",file:task.currentFile,completed:task.completed,total:task.total,downloaded:task.downloaded,bytes_total:task.bytesTotal,percent:task.percent,speed:task.speed}:null;
  return {...base,tasks,progress};
};
