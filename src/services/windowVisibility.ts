import {isTauri} from "@tauri-apps/api/core";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {startupReadyEvent} from "./startup";

export function observeWindowVisibility(onVisible:(visible:boolean)=>void) {
 const native=isTauri()?getCurrentWindow():null;
 let disposed=false,sequence=0,lastNative:boolean|undefined;
 let settle:ReturnType<typeof setTimeout>|undefined;
 const unlisten:Array<()=>void>=[];
 const sync=async()=>{
  const current=++sequence;let visible=!document.hidden;
  if(native){
   try {
    const [shown,minimized]=await Promise.all([native.isVisible(),native.isMinimized()]);
    if(typeof shown!=="boolean"||typeof minimized!=="boolean")throw Error("Window state unavailable");
    visible=shown&&!minimized;
    if(!disposed&&current===sequence)lastNative=visible;
   }catch{visible=lastNative??visible;}
  }
  if(!disposed&&current===sequence)onVisible(visible);
 };
 const refresh=()=>{void sync();clearTimeout(settle);settle=setTimeout(()=>void sync(),150);};
 const events=["focus","pageshow",startupReadyEvent];
 document.addEventListener("visibilitychange",refresh);events.forEach(event=>window.addEventListener(event,refresh));
 if(native){
  // Some native WebViews keep document.hidden stale after show/restore. Read the
  // actual window, including minimization; missed platform events recover too.
  for(const subscribe of [()=>native.onFocusChanged(refresh),()=>native.onResized(refresh)]){
   void subscribe().then(stop=>{if(disposed)stop();else unlisten.push(stop);}).catch(()=>{});
  }
 }
 const poll=native?setInterval(()=>void sync(),2000):undefined;
 void sync();
 return()=>{disposed=true;sequence++;clearTimeout(settle);clearInterval(poll);document.removeEventListener("visibilitychange",refresh);events.forEach(event=>window.removeEventListener(event,refresh));unlisten.forEach(stop=>stop());};
}
