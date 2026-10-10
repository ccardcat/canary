import {test,expect} from "@playwright/test";
import {backgrounds,migrateBackgroundId} from "../src/services/backgrounds";
import {resolveAmbient} from "../src/services/ambient";
import {particleCount,particleTiming} from "../src/services/particles";

test("Replacement collection has 16 unique new scenes and retains Garden/New Year for both areas",()=>{
 expect(backgrounds).toHaveLength(18);expect(new Set(backgrounds.map(image=>image.id)).size).toBe(18);
 expect(backgrounds.filter(image=>image.id==="garden"||image.id==="newyear").map(image=>image.app)).toEqual(["/backgrounds/gardenawakens-background.png","/backgrounds/minecraftnewyear-background.png"]);
 for(const image of backgrounds){expect(image.sidebar).toBe(image.app);if(!["garden","newyear"].includes(image.id))expect(image.thumbnail).toBe(`/backgrounds/thumbnails/${image.id}.webp`);}
});
test("Retired selections migrate without losing custom imports or retained selections",()=>{
 for(const id of ["normal","green","gray","darkblue","sakura1","sakura2","axolotl","bees","pink","green2"]){expect(migrateBackgroundId(id,"app")).toBe("meadow");expect(migrateBackgroundId(id,"sidebar")).toBe("meadow");}
 expect(migrateBackgroundId("default","sidebar")).toBe("meadow");
 for(const id of ["garden","newyear","meadow","wallpaper-custom-id"]){expect(migrateBackgroundId(id,"app")).toBe(id);expect(migrateBackgroundId(id,"sidebar")).toBe(id);}
});
test("Manual effects survive any wallpaper, while Automatic never disappears on an import",()=>{
 for(const selected of ["snow","sakura","autumn","embers","off"] as const)for(const image of backgrounds)expect(resolveAmbient(selected,image.ambient)).toBe(selected);
 expect(resolveAmbient("automatic","off","off")).toBe("snow");expect(resolveAmbient("automatic","sakura","snow")).toBe("sakura");expect(resolveAmbient("automatic","autumn")).toBe("autumn");expect(resolveAmbient("automatic","snow")).toBe("snow");
 for(const id of ["crimson-fortress","nether-depths","crimson-horizon"])expect(resolveAmbient("automatic",backgrounds.find(image=>image.id===id)!.ambient)).toBe("embers");
 expect(resolveAmbient("automatic","off","embers")).toBe("embers");
});

test("Particles begin within their cycle and speed changes retain each phase",()=>{
 for(const effect of ["snow","sakura","autumn","embers"] as const){
  const phases=[];
  for(let index=0;index<24;index++){
   const slow=particleTiming(effect,index,50),fast=particleTiming(effect,index,150);
   const duration=parseFloat(slow.animationDuration),delay=parseFloat(slow.animationDelay);
   expect(duration).toBeGreaterThan(0);expect(delay).toBeLessThan(0);expect(delay).toBeGreaterThan(-duration);
   expect(parseFloat(fast.animationDuration)).toBeCloseTo(duration/3);
   expect(parseFloat(fast.animationDelay)/parseFloat(fast.animationDuration)).toBeCloseTo(delay/duration);
   phases.push(delay/duration);
  }
  expect(new Set(phases).size).toBe(24);
 }
});

test("Particle settings bound invalid speeds and enforce the selected quality budget",()=>{
 for(const invalid of [NaN,Infinity,-Infinity])expect(particleTiming("embers",0,invalid)).toEqual(particleTiming("embers",0,100));
 expect(particleTiming("snow",0,-100)).toEqual(particleTiming("snow",0,40));
 expect(particleTiming("snow",0,1000)).toEqual(particleTiming("snow",0,180));
 expect(particleCount(24,"low")).toBe(6);expect(particleCount(24,"balanced")).toBe(16);expect(particleCount(24,"high")).toBe(24);
 expect(particleCount(-10,"high")).toBe(4);expect(particleCount(100,"high")).toBe(24);expect(particleCount(NaN,"high")).toBe(12);
});
