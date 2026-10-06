import {useEffect,useSyncExternalStore} from "react";

export const discordDefaults = {
  discordEnabled: true,
  discordInstanceNames: true,
  discordProjectNames: true,
  discordDownloads: true,
  discordCurrentPage: true,
};
export type DiscordPreferences = typeof discordDefaults;
export type DiscordStatus = "disabled" | "unavailable" | "connected" | "preview";

export interface ViewedProject {name:string;provider:string;category:string}
let project:ViewedProject|null=null;
let owner:symbol|null=null;
const listeners=new Set<()=>void>();
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
const snapshot=()=>project;
/** Share a content-project overlay with the single root navigation bridge. */
export function usePresenceProject(view:ViewedProject|null){
  useEffect(()=>{
    if(!view)return;
    const lease=Symbol();owner=lease;project=view;listeners.forEach(f=>f());
    return()=>{if(owner===lease){owner=null;project=null;listeners.forEach(f=>f());}};
  },[view?.name,view?.provider,view?.category]);
}
export const useViewedProject=()=>useSyncExternalStore(subscribe,snapshot,()=>null);
