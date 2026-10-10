import {test,expect} from "@playwright/test";
import {backgrounds,migrateBackgroundId} from "../src/services/backgrounds";
import {resolveAmbient} from "../src/services/ambient";

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
 for(const selected of ["snow","sakura","autumn","off"] as const)for(const app of ["snow","sakura","autumn","off"] as const)expect(resolveAmbient(selected,app)).toBe(selected);
 expect(resolveAmbient("automatic","off","off")).toBe("snow");expect(resolveAmbient("automatic","sakura","snow")).toBe("sakura");expect(resolveAmbient("automatic","autumn")).toBe("autumn");expect(resolveAmbient("automatic","snow")).toBe("snow");
});
