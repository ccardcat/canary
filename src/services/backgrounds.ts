export interface Background {id:string;name:string;ambient:"sakura"|"off";app?:string;sidebar?:string;thumbnail?:string;custom?:boolean}
// Deliberate pairs only. Pink and Green 2 are independent sidebar artwork.
export const backgrounds:Background[]=[
 {id:"darkblue",name:"Dark Blue",ambient:"off",app:"/backgrounds/darkblue-bg.jpg",sidebar:"/backgrounds/darkblue-sidebar.png"},
 {id:"gray",name:"Gray",ambient:"off",app:"/backgrounds/gray-bg.png",sidebar:"/backgrounds/gray-sidebar.jpg"},
 {id:"green",name:"Green",ambient:"off",app:"/backgrounds/green-bg.webp",sidebar:"/backgrounds/green-sidebar.webp"},
 {id:"sakura1",name:"Sakura 1",ambient:"sakura",app:"/backgrounds/sakura1-bg.jpg",sidebar:"/backgrounds/sakura1-sidebar.jpg"},
 {id:"sakura2",name:"Sakura 2",ambient:"sakura",app:"/backgrounds/sakura2-bg.jpg",sidebar:"/backgrounds/sakura2-sidebar.jpg"},
 {id:"axolotl",name:"Axolotl Pink",ambient:"off",app:"/backgrounds/axolotl-pink-background.png"},
 {id:"bees",name:"Bees Green",ambient:"off",app:"/backgrounds/bees-green-background.png"},
 {id:"garden",name:"Garden Awakens",ambient:"off",app:"/backgrounds/gardenawakens-background.png"},
 {id:"newyear",name:"Minecraft New Year",ambient:"off",app:"/backgrounds/minecraftnewyear-background.png"},
 {id:"pink",name:"Pink",ambient:"off",sidebar:"/backgrounds/pink-sidebar.jpg"},
 {id:"green2",name:"Green 2",ambient:"off",sidebar:"/backgrounds/green2sidebar.jpg"},
];
// New unpaired assets still appear. Adding one explicit entry defines any intended pairing.
const known=new Set(backgrounds.flatMap(p=>[p.app,p.sidebar]).filter(Boolean));
for(const file of Object.keys(import.meta.glob("/public/backgrounds/*.{png,jpg,jpeg,webp}"))){const path=file.replace("/public","");if(known.has(path)||path==="/backgrounds/sidebar-bg.webp")continue;const name=path.split("/").pop()!.replace(/\.[^.]+$/,"");backgrounds.push({id:`asset-${name}`,name:name.replace(/[-_]/g," "),ambient:"off",...(name.includes("sidebar")?{sidebar:path}:{app:path})});}
