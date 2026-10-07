import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from "react";
import "./Stabilization.css";
export function StartupSplash({children}:{children:ReactNode}){
 const [active,setActive]=useState(true);const group=useRef<HTMLDivElement>(null);const overlay=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const node=group.current;if(!node)return;
  const measure=()=>{const logo=node.querySelector("img");if(logo)node.style.setProperty("--logo-start-offset",((node.offsetWidth-logo.offsetWidth)/2)+"px");};
  measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  if(!active)return;
  const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches||document.documentElement.dataset.motion==="reduced";
  if(reduce)overlay.current?.classList.add("reduced");
  const timer=setTimeout(()=>setActive(false),reduce?650:2450);return()=>clearTimeout(timer);
 },[active]);
 return <><div className="startup-app" inert={active}>{children}</div>{active&&<div className="startup-splash" ref={overlay} aria-label="Canary" role="status" onAnimationEnd={e=>{if(e.target===e.currentTarget)setActive(false);}}>
 <div className="startup-brand" ref={group}><img className="startup-logo" src="/branding/canary-bird-white.png" alt=""/><div className="startup-word-mask"><span className="startup-wordmark">CANARY</span></div></div></div>}</>;
}
