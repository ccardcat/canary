import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from "react";
import {invoke,isTauri} from "@tauri-apps/api/core";
import {useBackend} from "../services/backend";
import {useVisualAppearance} from "./VisualAppearance";
import {finishStartup} from "../services/startup";
import "./Stabilization.css";
export function StartupSplash({children}:{children:ReactNode}){
 const [active,setActive]=useState(true);const [leaving,setLeaving]=useState(false);const [elapsed,setElapsed]=useState(false);const [decodedKey,setDecodedKey]=useState<string|null>(null);const [expired,setExpired]=useState(false);
 const group=useRef<HTMLDivElement>(null);const overlay=useRef<HTMLDivElement>(null);
 const {snapshot,error}=useBackend();const {value,native,registry,wallpapersReady}=useVisualAppearance();
 const settled=!isTauri()||!!snapshot||!!error;
 useLayoutEffect(()=>{document.documentElement.dataset.startup="loading";},[]);
 useLayoutEffect(()=>{
  const node=group.current;if(!node)return;
  const measure=()=>{const logo=node.querySelector("img");if(logo)node.style.setProperty("--logo-start-offset",((node.offsetWidth-logo.offsetWidth)/2)+"px");};
  measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches||document.documentElement.dataset.motion==="reduced";
  if(reduce)overlay.current?.classList.add("reduced");
  const minimum=setTimeout(()=>setElapsed(true),reduce?900:2850);const maximum=setTimeout(()=>setExpired(true),12000);
  let frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{if(isTauri())void invoke("show_main_window").catch(()=>{});});});
  return()=>{clearTimeout(minimum);clearTimeout(maximum);cancelAnimationFrame(frame);};
 },[]);
 const appImage=value.backgroundSource==="canary"?registry.find(p=>p.id===value.app)?.app:undefined;
 const sidebarImage=(value.materialLinked?value.materialStyle:value.materialCategories.sidebar)!=="solid"?registry.find(p=>p.id===value.sidebar)?.sidebar:undefined;
 const assetKey=JSON.stringify([appImage,sidebarImage]);const assetsReady=wallpapersReady&&decodedKey===assetKey;
 useEffect(()=>{let live=true;
  const decode=(source?:string)=>source?new Promise<void>(resolve=>{const image=new Image();image.onload=()=>{void image.decode().catch(()=>{}).then(()=>resolve());};image.onerror=()=>resolve();image.src=source;}):Promise.resolve();
  void Promise.all([document.fonts.ready,decode(appImage),decode(sidebarImage)]).then(()=>{if(live)setDecodedKey(assetKey);});return()=>{live=false;};
 },[appImage,sidebarImage,assetKey]);
 useEffect(()=>{if(elapsed&&((settled&&assetsReady&&native?.ready)||expired))setLeaving(true);},[elapsed,settled,assetsReady,native?.ready,expired]);
 useEffect(()=>{if(!leaving)return;document.documentElement.dataset.startup="revealing";const timer=setTimeout(()=>{setActive(false);finishStartup();},220);return()=>clearTimeout(timer);},[leaving]);
 return <><div className="startup-app" inert={active}>{children}</div>{active&&<div className={`startup-splash${leaving?" leaving":""}`} ref={overlay} aria-label="Canary" role="status">
 <div className="startup-brand" ref={group}><img className="startup-logo" src="/branding/canary-bird-white.png" alt=""/><div className="startup-word-mask"><span className="startup-wordmark">CANARY</span></div></div></div>}</>;
}
