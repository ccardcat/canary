import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
export interface Account { id:string; provider:string; uuid:string; username:string; status:string; avatar?:string; }
export interface RuntimeInstance { id:string; name:string; provider:string; project_id?:string; version_id?:string; version_name:string; minecraft:string; loader:string; loader_version?:string; directory:string; icon?:string; installed:number; last_played?:number; playtime:number; favorite:boolean; update_available?:boolean; status:string; error?:{code:string;message:string}; overrides: {java?:string;min_memory?:number;max_memory?:number;jvm_args?:string[];game_args?:string[];width?:number;height?:number;account?:string}; }
export interface RuntimeSettings {automatic_java:boolean;java_path?:string;min_memory:number;max_memory:number;jvm_args:string[];game_args:string[];width:number;height:number;fullscreen:boolean;concurrency:number;snapshots:boolean;active_account?:string}
export interface BackendProgress {id:string;stage:string;status:string;file:string;completed:number;total:number;downloaded:number;bytes_total:number;percent:number;speed:number}
export interface Snapshot {instances:RuntimeInstance[];accounts:Account[];settings:RuntimeSettings;activity:{timestamp:number;instance?:string;kind:string;message:string}[];data_folder:string;physical_memory_mb?:number;providers:Record<string,{configured:boolean;requirement?:string}>}
export interface Java {path:string;version:string;major:number;vendor:string;architecture:string;managed:boolean}
interface ContextValue {snapshot:Snapshot|null;progress:BackendProgress|null;error:unknown;clearError:()=>void;refresh:()=>Promise<void>;run:<T>(command:string,args?:Record<string,unknown>)=>Promise<T>;logs:string[]}
const Context=createContext<ContextValue>({snapshot:null,progress:null,error:null,clearError:()=>{},refresh:async()=>{},run:async()=>{throw Error("Desktop application required")},logs:[]});
export function BackendProvider({children}:{children:ReactNode}) {
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);const [progress,setProgress]=useState<BackendProgress|null>(null);const [error,setError]=useState<unknown>(null);const [logs,setLogs]=useState<string[]>([]);
  const refresh=useCallback(async()=>{if(isTauri())setSnapshot(await invoke<Snapshot>("backend_snapshot"));},[]);
  const run=useCallback(async<T,>(command:string,args?:Record<string,unknown>)=>{try{const result=await invoke<T>(command,args);if(!["loader_versions","minecraft_versions","detect_java","test_java","game_logs","scan_screenshots","content_inventory","content_worlds","content_search","content_project","content_versions","content_preview","choose_content_files","inspect_content_files","pack_update_preview"].includes(command))await refresh();return result;}catch(error){setError(typeof error === "object" && error !== null ? {...error,instance_id:args?.id} : error);await refresh().catch(()=>{});throw error;}},[refresh]);
  useEffect(()=>{if(!isTauri())return;let cancelled=false;const disposers:(()=>void)[]=[];
    const subscribe=async()=>{for(const event of ["instances-changed","process-exited"]){const unlisten=await listen(event,()=>void refresh().catch(setError));if(cancelled)unlisten();else disposers.push(unlisten);}
      for(const [event,handler] of [["backend-error",(payload:unknown)=>setError(payload)],["backend-progress",(payload:unknown)=>setProgress(payload as BackendProgress)],["process-output",(payload:unknown)=>setLogs(lines=>[...lines,(payload as {line:string}).line].slice(-500))]] as const){const unlisten=await listen(event,e=>handler(e.payload));if(cancelled)unlisten();else disposers.push(unlisten);}
      if(!cancelled){await refresh(); void invoke("restore_accounts").then(refresh).catch(()=>{});}};void subscribe().catch(setError);return()=>{cancelled=true;disposers.forEach(fn=>fn());};},[refresh]);
  return <Context.Provider value={{snapshot,progress,error,clearError:()=>setError(null),refresh,run,logs}}>{children}</Context.Provider>;
}
export const useBackend=()=>useContext(Context);
