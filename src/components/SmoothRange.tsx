import {memo,useEffect,useRef,useState} from "react";
import {particleCount,particleTiming} from "../services/particles";
import type {AmbientEffect} from "../services/backgrounds";
export function previewParticle(key:string,value:number){
 const layer=document.querySelector<HTMLElement>(".ambient-particles");if(!layer)return;
 layer.dataset[key]=String(value);
 const number=(name:string,fallback:number)=>Number(layer.dataset[name]??fallback);
 const quality=document.documentElement.dataset.quality;
 const count=particleCount(number("density",12),quality??"balanced");
 Array.from(layer.children).forEach((node,index)=>{
   const particle=node as HTMLElement;particle.style.visibility=index<count?"visible":"hidden";
   particle.style.opacity=String(number("particleOpacity",20)/100*(.75+(index%4)*.08));
   particle.style.setProperty("--particle-scale",String(number("particleSize",100)/100*(.8+(index%5)*.15)));
   particle.style.setProperty("--drift",String((index%2?65:-55)*number("particleWind",100)/100)+"px");
   if(key==="particleSpeed")Object.assign(particle.style,particleTiming(layer.dataset.effect as AmbientEffect,index,value));
 });
}
export const SmoothRange=memo(function SmoothRange({label,value,min,max,step=1,unit="",onCommit,onPreview,previewKey,disabled=false}:{label:string;value:number;min:number;max:number;step?:number;unit?:string;onCommit:(value:number)=>void;onPreview?:(value:number)=>void;previewKey?:string;disabled?:boolean}){
 const [draft,setDraft]=useState(value);const current=useRef(value);const committed=useRef(value);const dragging=useRef(false);const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);const commitRef=useRef(onCommit);commitRef.current=onCommit;const previewRef=useRef(onPreview);previewRef.current=onPreview;const external=useRef(value);external.current=value;
 useEffect(()=>{if(!dragging.current){current.current=value;committed.current=value;setDraft(value);}},[value]);
 useEffect(()=>()=>{if(dragging.current||timer.current){if(previewKey)previewParticle(previewKey,external.current);previewRef.current?.(external.current);}if(timer.current)clearTimeout(timer.current);},[previewKey]);
 const commit=()=>{dragging.current=false;if(timer.current)clearTimeout(timer.current);timer.current=undefined;if(current.current!==committed.current){committed.current=current.current;commitRef.current(current.current);}};
 return <label className="visual-range"><span>{label}<output>{draft}{unit}</output></span><input type="range" aria-label={label} disabled={disabled} min={min} max={max} step={step} value={draft} onPointerDown={e=>{dragging.current=true;e.currentTarget.setPointerCapture(e.pointerId);}} onPointerUp={commit} onPointerCancel={()=>{current.current=value;setDraft(value);if(previewKey)previewParticle(previewKey,value);previewRef.current?.(value);if(timer.current)clearTimeout(timer.current);timer.current=undefined;dragging.current=false;}} onLostPointerCapture={commit} onBlur={commit} onKeyUp={commit} onChange={e=>{const next=Number(e.target.value);current.current=next;setDraft(next);if(previewKey)previewParticle(previewKey,next);previewRef.current?.(next);if(timer.current)clearTimeout(timer.current);if(!dragging.current)timer.current=setTimeout(commit,300);}}/></label>;
});
