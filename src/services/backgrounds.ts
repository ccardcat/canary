export type AmbientEffect="off"|"sakura"|"snow"|"autumn"|"embers";
export interface Background {id:string;name:string;ambient:AmbientEffect;app?:string;sidebar?:string;thumbnail?:string;custom?:boolean}
export const defaultAppBackground="meadow";
export const defaultSidebarImage="/backgrounds/meadow.webp";
export const backgrounds:Background[]=[
 {"id": "meadow", "name": "Sunny Meadow", "ambient": "off", "app": "/backgrounds/meadow.webp", "sidebar": "/backgrounds/meadow.webp", "thumbnail": "/backgrounds/thumbnails/meadow.webp"},
 {"id": "winter-island", "name": "Winter Island", "ambient": "snow", "app": "/backgrounds/winter-island.webp", "sidebar": "/backgrounds/winter-island.webp", "thumbnail": "/backgrounds/thumbnails/winter-island.webp"},
 {"id": "frozen-lake", "name": "Frozen Lake", "ambient": "snow", "app": "/backgrounds/frozen-lake.webp", "sidebar": "/backgrounds/frozen-lake.webp", "thumbnail": "/backgrounds/thumbnails/frozen-lake.webp"},
 {"id": "night-island", "name": "Night Island", "ambient": "snow", "app": "/backgrounds/night-island.webp", "sidebar": "/backgrounds/night-island.webp", "thumbnail": "/backgrounds/thumbnails/night-island.webp"},
 {"id": "amethyst-cave", "name": "Amethyst Cave", "ambient": "sakura", "app": "/backgrounds/amethyst-cave.webp", "sidebar": "/backgrounds/amethyst-cave.webp", "thumbnail": "/backgrounds/thumbnails/amethyst-cave.webp"},
 {"id": "end-eclipse", "name": "End Eclipse", "ambient": "sakura", "app": "/backgrounds/end-eclipse.webp", "sidebar": "/backgrounds/end-eclipse.webp", "thumbnail": "/backgrounds/thumbnails/end-eclipse.webp"},
 {"id": "golden-mines", "name": "Golden Mines", "ambient": "autumn", "app": "/backgrounds/golden-mines.webp", "sidebar": "/backgrounds/golden-mines.webp", "thumbnail": "/backgrounds/thumbnails/golden-mines.webp"},
 {"id": "diamond-cave", "name": "Diamond Cave", "ambient": "off", "app": "/backgrounds/diamond-cave.webp", "sidebar": "/backgrounds/diamond-cave.webp", "thumbnail": "/backgrounds/thumbnails/diamond-cave.webp"},
 {"id": "portal-hall", "name": "Portal Hall", "ambient": "sakura", "app": "/backgrounds/portal-hall.webp", "sidebar": "/backgrounds/portal-hall.webp", "thumbnail": "/backgrounds/thumbnails/portal-hall.webp"},
 {"id": "lush-cave", "name": "Lush Cave", "ambient": "autumn", "app": "/backgrounds/lush-cave.webp", "sidebar": "/backgrounds/lush-cave.webp", "thumbnail": "/backgrounds/thumbnails/lush-cave.webp"},
 {"id": "crimson-fortress", "name": "Crimson Fortress", "ambient": "embers", "app": "/backgrounds/crimson-fortress.webp", "sidebar": "/backgrounds/crimson-fortress.webp", "thumbnail": "/backgrounds/thumbnails/crimson-fortress.webp"},
 {"id": "deep-dungeon", "name": "Deep Dungeon", "ambient": "off", "app": "/backgrounds/deep-dungeon.webp", "sidebar": "/backgrounds/deep-dungeon.webp", "thumbnail": "/backgrounds/thumbnails/deep-dungeon.webp"},
 {"id": "nether-depths", "name": "Nether Depths", "ambient": "embers", "app": "/backgrounds/nether-depths.webp", "sidebar": "/backgrounds/nether-depths.webp", "thumbnail": "/backgrounds/thumbnails/nether-depths.webp"},
 {"id": "ashen-horizon", "name": "Ashen Horizon", "ambient": "snow", "app": "/backgrounds/ashen-horizon.webp", "sidebar": "/backgrounds/ashen-horizon.webp", "thumbnail": "/backgrounds/thumbnails/ashen-horizon.webp"},
 {"id": "crimson-horizon", "name": "Crimson Horizon", "ambient": "embers", "app": "/backgrounds/crimson-horizon.webp", "sidebar": "/backgrounds/crimson-horizon.webp", "thumbnail": "/backgrounds/thumbnails/crimson-horizon.webp"},
 {"id": "starlit-castle", "name": "Starlit Castle", "ambient": "snow", "app": "/backgrounds/starlit-castle.webp", "sidebar": "/backgrounds/starlit-castle.webp", "thumbnail": "/backgrounds/thumbnails/starlit-castle.webp"},
 {id:"garden",name:"Garden Awakens",ambient:"autumn",app:"/backgrounds/gardenawakens-background.png",sidebar:"/backgrounds/gardenawakens-background.png"},
 {id:"newyear",name:"Minecraft New Year",ambient:"snow",app:"/backgrounds/minecraftnewyear-background.png",sidebar:"/backgrounds/minecraftnewyear-background.png"},
];
// Retired built-in selections migrate once; imported IDs and retained backgrounds stay intact.
const retired=new Set(["normal","darkblue","gray","green","sakura1","sakura2","axolotl","bees","pink","green2"]);
export function migrateBackgroundId(id:string,target:"app"|"sidebar"):string {
 return retired.has(id)||(target==="sidebar"&&id==="default")?defaultAppBackground:id;
}
