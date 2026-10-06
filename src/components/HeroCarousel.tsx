import {useEffect,useState,type ReactNode} from "react";
import {ChevronLeft,ChevronRight} from "lucide-react";
import {backgrounds,useVisualAppearance} from "./VisualAppearance";
import ArtworkFade from "./ArtworkFade";
export function HeroCarousel({children,russian}:{children:ReactNode|((index:number)=>ReactNode);russian:boolean}){
 const {registry,value}=useVisualAppearance();const images=registry.filter(p=>p.app);
 const [selected,setSelected]=useState(()=>{const list=backgrounds.filter(p=>p.app);return list[Math.floor(Math.random()*list.length)]?.id;});
 const [hover,setHover]=useState(false);const [focus,setFocus]=useState(false);const [visible,setVisible]=useState(!document.hidden);const [reduced,setReduced]=useState(false);
 const index=Math.max(0,images.findIndex(p=>p.id===selected));const next=images[(index+1)%images.length];const ids=images.map(p=>p.id).join("|");
 const paused=hover||focus||!visible||reduced||value.focus||!value.heroRotation;
 useEffect(()=>{const media=matchMedia("(prefers-reduced-motion: reduce)");const sync=()=>setReduced(media.matches||document.documentElement.dataset.motion==="reduced");const visibility=()=>setVisible(!document.hidden);const observer=new MutationObserver(sync);observer.observe(document.documentElement,{attributes:true,attributeFilter:["data-motion"]});media.addEventListener("change",sync);document.addEventListener("visibilitychange",visibility);sync();return()=>{observer.disconnect();media.removeEventListener("change",sync);document.removeEventListener("visibilitychange",visibility);};},[]);
 useEffect(()=>{if(next?.app){const image=new Image();image.src=next.app;}},[next?.app]);
 useEffect(()=>{if(paused||images.length<2)return;const timer=setInterval(()=>setSelected(current=>{const n=Math.max(0,images.findIndex(p=>p.id===current));return images[(n+1)%images.length].id;}),Math.max(7,Math.min(20,value.heroSpeed))*1000);return()=>clearInterval(timer);},[paused,value.heroSpeed,ids]);
 const move=(offset:number)=>setSelected(images[(index+offset+images.length)%images.length]?.id);
 return <div className={`home-hero ${paused?"hero-paused":""}`} onPointerEnter={()=>setHover(true)} onPointerLeave={()=>setHover(false)} onFocusCapture={()=>setFocus(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setFocus(false);}}>
  <ArtworkFade source={images[index]?.app} className="hero-art" duration={880}/>{typeof children==="function"?children(index):children}
  <div className="hero-carousel-controls" role="group" aria-label={russian?"Фон главной страницы":"Home background"}>
   <button className="hero-arrow" aria-label={russian?"Предыдущий фон":"Previous background"} disabled={images.length<2} onClick={()=>move(-1)}><ChevronLeft size={15}/></button>
   {images.map((image,n)=><button key={image.id} aria-label={`${russian?"Показать фон":"Show background"}: ${image.name}`} aria-pressed={index===n} onClick={()=>setSelected(image.id)}/>)}
   <button className="hero-arrow" aria-label={russian?"Следующий фон":"Next background"} disabled={images.length<2} onClick={()=>move(1)}><ChevronRight size={15}/></button>
  </div>
 </div>;
}
export function HeroSettings({russian}:{russian:boolean}){
 const {value,update}=useVisualAppearance();const label=russian?"Менять фоны главной страницы":"Rotate Home backgrounds";
 return <section className="visual-preferences"><h4>{russian?"Главная страница":"Home"}</h4><div className="toggle-setting"><b>{label}</b><button className={value.heroRotation?"toggle on":"toggle"} role="switch" aria-label={label} aria-checked={value.heroRotation} onClick={()=>update({heroRotation:!value.heroRotation})}><i/></button></div><label className="visual-range"><span>{russian?"Интервал смены":"Rotation speed"}<output>{value.heroSpeed}s</output></span><input type="range" aria-label={russian?"Интервал смены":"Rotation speed"} min={7} max={20} value={value.heroSpeed} onChange={e=>update({heroSpeed:Number(e.target.value)})}/></label></section>;
}
