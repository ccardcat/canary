import type {AmbientEffect} from "./backgrounds";

export function particleTiming(effect:AmbientEffect,index:number,speed:number) {
 const rate=Number.isFinite(speed)?Math.max(40,Math.min(180,speed))/100:1;
 const duration=((effect==="embers"?10:22)+(index%5)*(effect==="embers"?1.5:4))/rate;
 // Begin within the animation so particles are visible immediately on mount.
 const phase=(.15+index*.61803398875)%1;
 return {animationDuration:`${duration}s`,animationDelay:`${-duration*phase}s`};
}
export function particleCount(density:number,quality:string) {
 const limit=quality==="low"?6:quality==="balanced"?16:24;
 return Math.min(limit,Math.max(4,Math.min(24,Number.isFinite(density)?Math.round(density):12)));
}
