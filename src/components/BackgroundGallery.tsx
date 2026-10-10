import {useId,useLayoutEffect,useRef,useState} from "react";
import {ChevronDown} from "lucide-react";
import type {Background} from "../services/backgrounds";

export function BackgroundGallery({images,selected,onSelect,russian}:{images:Background[];selected:string;onSelect:(id:string)=>void;russian:boolean}) {
 const [expanded,setExpanded]=useState(false),[height,setHeight]=useState<number>();
 const grid=useRef<HTMLDivElement>(null),viewport=useRef<HTMLDivElement>(null),id=useId();
 useLayoutEffect(()=>{
  const element=grid.current;if(!element)return;
  const measure=()=>{const next=element.getBoundingClientRect().height;if(next>0)setHeight(next+8);};measure();
  const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();
 },[images.length]);
 useLayoutEffect(()=>{
  const area=viewport.current,button=grid.current?.querySelector<HTMLElement>('[aria-pressed="true"]');if(!area||!button)return;
  if(button.offsetTop<area.scrollTop)area.scrollTop=button.offsetTop;
  else if(button.offsetTop+button.offsetHeight>area.scrollTop+area.clientHeight)area.scrollTop=button.offsetTop+button.offsetHeight-area.clientHeight;
 },[selected,expanded,height]);
 const label=russian?"Галерея фонов":"Wallpaper gallery";
 return <div className="background-gallery" data-expanded={expanded}>
  <div ref={viewport} id={id} className="background-gallery-scroll" role="region" aria-label={label} tabIndex={0} style={height?{height:expanded?height:Math.min(height,236)}:{}}>
   <div ref={grid} className="background-options">{images.map(image=><button type="button" key={image.id} aria-label={image.name} data-tooltip={image.name} aria-pressed={selected===image.id} onClick={()=>onSelect(image.id)}>
    <span className="background-preview" style={{backgroundImage:`url("${image.thumbnail||image.app||image.sidebar}")`}}/>
   </button>)}</div>
  </div>
  {images.length>8&&<button type="button" className="quiet-button background-gallery-toggle" aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(value=>!value)}><span>{expanded?(russian?"Свернуть галерею":"Collapse gallery"):(russian?"Показать все фоны":"Show all wallpapers")}</span><ChevronDown size={15}/></button>}
 </div>;
}
