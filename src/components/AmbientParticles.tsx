import {memo,type CSSProperties} from "react";
import {Snowflake} from "lucide-react";
import type {AmbientEffect} from "../services/backgrounds";
import {particleCount,particleTiming} from "../services/particles";

export const AmbientParticles=memo(function AmbientParticles({effect,density,speed,opacity,size,wind,quality}:{effect:Exclude<AmbientEffect,"off">;density:number;speed:number;opacity:number;size:number;wind:number;quality:string}) {
 const count=particleCount(density,quality);
 return <div className={`ambient-particles ${effect}`} data-effect={effect} data-density={density} data-particle-speed={speed} data-particle-opacity={opacity} data-particle-size={size} data-particle-wind={wind} aria-hidden="true">
  {Array.from({length:24},(_,index)=><i key={index} style={{
   left:`${(index*37+9)%100}%`,...particleTiming(effect,index,speed),visibility:index<count?"visible":"hidden",
   opacity:opacity/100*(.75+(index%4)*.08),"--particle-scale":size/100*(.8+(index%5)*.15),
   "--drift":`${(index%2?65:-55)*wind/100}px`,"--sway":`${(index%3+1)*9}px`,
   "--leaf-color":["#dca14a","#e0b358","#c97938"][index%3],"--ember-color":["#ffad42","#ff6c28","#ffd77a"][index%3]
  } as CSSProperties}>{effect==="snow"&&<Snowflake aria-hidden="true" strokeWidth={1.65}/>}</i>)}
 </div>;
});
