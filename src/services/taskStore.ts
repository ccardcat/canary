import {useSyncExternalStore} from "react";
import type {ActivityTask} from "./activity";
class TaskStore {
  live:ActivityTask[]=[]; lifecycle:ActivityTask[]=[];
  private listeners=new Set<()=>void>();private lifecycleListeners=new Set<()=>void>();private timer:ReturnType<typeof setTimeout>|undefined;
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
  subscribeLifecycle=(fn:()=>void)=>{this.lifecycleListeners.add(fn);return()=>{this.lifecycleListeners.delete(fn);};};
  get=()=>this.live;getLifecycle=()=>this.lifecycle;
  set(tasks:ActivityTask[]){
    this.live=tasks;
    const key=(values:ActivityTask[])=>values.map(t=>[t.id,t.operationId,t.instanceId,t.projectId,t.versionId,t.title,t.status,t.cancellable,t.cancelRequested].join("|")).join(";");
    if(key(tasks)!==key(this.lifecycle)){this.lifecycle=tasks;this.lifecycleListeners.forEach(fn=>fn());}
    if(!this.timer)this.timer=setTimeout(()=>{this.timer=undefined;this.listeners.forEach(fn=>fn());},80);
  }
  flush(){if(this.timer)clearTimeout(this.timer);this.timer=undefined;}
}
export const taskStore=new TaskStore();
export const useLiveTasks=()=>useSyncExternalStore(taskStore.subscribe,taskStore.get);
export const useTaskLifecycle=()=>useSyncExternalStore(taskStore.subscribeLifecycle,taskStore.getLifecycle);
