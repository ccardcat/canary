import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from "react";
import {invoke,isTauri} from "@tauri-apps/api/core";
import {useBackend} from "../services/backend";
import {useVisualAppearance} from "./VisualAppearance";
import {finishStartup} from "../services/startup";
import "./Stabilization.css";
export function StartupSplash({children}:{children:ReactNode}){
 const [active,setActive]=useState(true);const [leaving,setLeaving]=useState(false);const [elapsed,setElapsed]=useState(false);const [decodedKey,setDecodedKey]=useState<string|null>(null);const [expired,setExpired]=useState(false);
 const group=useRef<HTMLDivElement>(null);const [reduced,setReduced]=useState(false);
 const exitDuration=useRef(1000);
 const windowShown=useRef(false);
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
  setReduced(reduce);
  exitDuration.current=reduce?220:1000;document.documentElement.style.setProperty("--startup-exit-duration",exitDuration.current+"ms");
  const minimum=setTimeout(()=>setElapsed(true),reduce?900:2850);const maximum=setTimeout(()=>setExpired(true),12000);
  return()=>{clearTimeout(minimum);clearTimeout(maximum);};
 },[]);
 const appImage=value.backgroundSource==="canary"?registry.find(p=>p.id===value.app)?.app:undefined;
 const sidebarImage=(value.materialLinked?value.materialStyle:value.materialCategories.sidebar)!=="solid"?registry.find(p=>p.id===value.sidebar)?.sidebar:undefined;
 const assetKey=JSON.stringify([appImage,sidebarImage]);const assetsReady=wallpapersReady&&decodedKey===assetKey;
 useEffect(()=>{let live=true;
  const decode=(source?:string)=>source?new Promise<void>(resolve=>{const image=new Image();image.onload=()=>{void image.decode().catch(()=>{}).then(()=>resolve());};image.onerror=()=>resolve();image.src=source;}):Promise.resolve();
  void Promise.all([document.fonts.ready,decode(appImage),decode(sidebarImage)]).then(()=>{if(live)setDecodedKey(assetKey);});return()=>{live=false;};
 },[appImage,sidebarImage,assetKey]);
 useEffect(()=>{
  // The startup deadline must also reveal the native window. A stalled asset
  // decode or capability call must not leave an invisible process running.
  if(windowShown.current||!isTauri()||(!expired&&(!active||!native?.ready||!assetsReady)))return;
  let frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{windowShown.current=true;void invoke("show_main_window").catch(()=>{});});});
  return()=>cancelAnimationFrame(frame);
 },[active,native?.ready,assetsReady,expired]);
 useEffect(()=>{if(elapsed&&((settled&&assetsReady&&native?.ready)||expired))setLeaving(true);},[elapsed,settled,assetsReady,native?.ready,expired]);
 useEffect(()=>{
  if(!leaving)return;document.documentElement.dataset.startup="revealing";
  const app=document.querySelector(".startup-app>.canary-app");let finished=false;let timer:ReturnType<typeof setTimeout>;
  const cleanup=()=>{clearTimeout(timer);app?.removeEventListener("animationend",end);app?.removeEventListener("animationcancel",end);};
  const complete=()=>{if(finished)return;finished=true;cleanup();setActive(false);finishStartup();};
  const end=(event:Event)=>{const animation=event as AnimationEvent;if(event.target===app&&animation.animationName==="startup-ui-in")complete();};
  app?.addEventListener("animationend",end);app?.addEventListener("animationcancel",end);
  // CSS starts on its first rendered frame; a wall-clock timer can otherwise
  // cut the reveal short on a busy machine. Keep a bound if rendering fails.
  timer=setTimeout(complete,reduced?exitDuration.current:3000);
  return cleanup;
 },[leaving,reduced]);
 return <><div className="startup-app" inert={active}>{children}</div>{active&&<div className={`startup-splash${leaving?" leaving":""}${reduced?" reduced":""}`} aria-label="Canary" role="status">
 <div className="startup-brand" ref={group}><img className="startup-logo" src="/branding/canary-bird-white.png" alt=""/><div className="startup-word-mask"><span className="startup-wordmark">CANARY</span></div></div></div>}</>;
}

