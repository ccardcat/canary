import {useSyncExternalStore} from "react";
export const startupReadyEvent="canary-startup-ready";
const subscribe=(notify:()=>void)=>{window.addEventListener(startupReadyEvent,notify);return()=>window.removeEventListener(startupReadyEvent,notify);};
export const useStartupReady=()=>useSyncExternalStore(subscribe,()=>document.documentElement.dataset.startup==="ready",()=>false);
export function finishStartup(){document.documentElement.dataset.startup="ready";window.dispatchEvent(new Event(startupReadyEvent));}
