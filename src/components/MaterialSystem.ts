export const materialStyles = ['solid', 'soft', 'vibrancy', 'glass', 'liquid', 'transparent'] as const;
export type SurfaceMaterial = typeof materialStyles[number];
export const materialCategories = ['cards', 'buttons', 'sidebar', 'popovers', 'dialogs', 'inputs', 'titlebar', 'floating'] as const;
export type MaterialCategory = typeof materialCategories[number];
export type MaterialPreferences = {
  materialPreset: string; materialLinked: boolean; materialStyle: SurfaceMaterial;
  materialCategories: Record<MaterialCategory, SurfaceMaterial>;
  materialIntensity: number; materialSaturation: number; materialBrightness: number;
  materialContrast: number; materialHighlight: number; materialBorder: number;
  materialShadow: number; materialRadius: number; materialAccent: boolean;
  sidebarMaterialIntensity: number; titlebarMaterialIntensity: number;
  reduceTransparency: boolean; sidebarMode: 'attached' | 'floating';
  instanceLayout: 'comfortable' | 'compact'; instanceArtwork: 'full' | 'ambient' | 'off';
  buttonDensity: 'comfortable' | 'compact';
};
const categories: MaterialPreferences['materialCategories'] = {cards:'glass', buttons:'soft', sidebar:'vibrancy', popovers:'glass', dialogs:'glass', inputs:'soft', titlebar:'transparent', floating:'glass'};
export const materialDefaults: MaterialPreferences = {
  materialPreset:'canary', materialLinked:false, materialStyle:'glass', materialCategories:categories,
  materialIntensity:50, materialSaturation:100, materialBrightness:100, materialContrast:100,
  materialHighlight:100, materialBorder:100, materialShadow:100, materialRadius:19,
  materialAccent:false, sidebarMaterialIntensity:100, titlebarMaterialIntensity:100,
  reduceTransparency:false, sidebarMode:'attached', instanceLayout:'comfortable', instanceArtwork:'full', buttonDensity:'comfortable',
};
export const materialPresets: Record<string, Partial<MaterialPreferences> & {surfaceOpacity:number; surfaceBlur:number}> = {
  canary:{...materialDefaults, materialCategories:{...categories}, surfaceOpacity:82, surfaceBlur:16},
  graphite:{materialStyle:'soft', materialLinked:true, materialIntensity:40, surfaceOpacity:90, surfaceBlur:10},
  vibrancy:{materialStyle:'vibrancy', materialLinked:true, materialIntensity:60, surfaceOpacity:82, surfaceBlur:20},
  clear:{materialStyle:'glass', materialLinked:true, materialIntensity:55, surfaceOpacity:72, surfaceBlur:20},
  liquid:{materialStyle:'liquid', materialLinked:true, materialIntensity:70, sidebarMode:'floating', surfaceOpacity:78, surfaceBlur:26},
  minimal:{materialStyle:'solid', materialLinked:true, materialIntensity:25, surfaceOpacity:100, surfaceBlur:0},
  transparent:{materialStyle:'transparent', materialLinked:true, materialIntensity:40, sidebarMode:'floating', surfaceOpacity:82, surfaceBlur:4},
  amoled:{materialStyle:'liquid', materialLinked:true, materialIntensity:65, materialHighlight:125, materialBorder:120, surfaceOpacity:90, surfaceBlur:24},
};
const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
export function normalizeMaterials(saved:Record<string,unknown>):MaterialPreferences {
  const result={...materialDefaults,materialCategories:{...categories}};
  const fields=result as unknown as Record<string,unknown>;
  for(const key of Object.keys(result))if(typeof saved[key]===typeof fields[key]&&key!=='materialCategories')fields[key]=saved[key];
  const valid=(s:unknown):s is SurfaceMaterial=>materialStyles.includes(s as SurfaceMaterial);
  if(!valid(result.materialStyle))result.materialStyle='glass';
  const input=saved.materialCategories&&typeof saved.materialCategories==='object'?saved.materialCategories as Record<string,unknown>:{};
  for(const key of materialCategories)if(valid(input[key]))result.materialCategories[key]=input[key];
  for(const [key,allowed] of Object.entries({sidebarMode:['attached','floating'],instanceLayout:['comfortable','compact'],instanceArtwork:['full','ambient','off'],buttonDensity:['comfortable','compact']}))if(!allowed.includes(String(fields[key])))fields[key]=(materialDefaults as unknown as Record<string,unknown>)[key];
  for(const [key,[min,max]] of Object.entries({materialIntensity:[0,100],materialSaturation:[50,160],materialBrightness:[80,120],materialContrast:[80,120],materialHighlight:[0,160],materialBorder:[30,160],materialShadow:[0,160],materialRadius:[8,28],sidebarMaterialIntensity:[0,150],titlebarMaterialIntensity:[0,150]})){
    const n=fields[key];fields[key]=typeof n==='number'&&Number.isFinite(n)?clamp(n,min,max):(materialDefaults as unknown as Record<string,unknown>)[key];
  }
  if(result.materialPreset!=='custom'&&!materialPresets[result.materialPreset])result.materialPreset='canary';
  return result;
}
type TokenPreferences=MaterialPreferences & {surfaceOpacity:number;surfaceBlur:number;glassIntensity:number;quality:string;focus:boolean};
// Profiles share one token pipeline. Depth belongs to the semantic category,
// not the page. Controls use a foreground variant to avoid nested backdrop work.
const profiles:Record<SurfaceMaterial,{opacity:number;blur:number;saturation:number;light:number;edge:number;shadow:number}>={
  solid:{opacity:100,blur:0,saturation:1,light:.02,edge:.12,shadow:.04},
  soft:{opacity:92,blur:.15,saturation:1.05,light:.045,edge:.12,shadow:.08},
  vibrancy:{opacity:65,blur:.75,saturation:1.45,light:.075,edge:.15,shadow:.13},
  glass:{opacity:55,blur:1,saturation:1.2,light:.13,edge:.2,shadow:.18},
  liquid:{opacity:48,blur:1.35,saturation:1.4,light:.3,edge:.28,shadow:.25},
  transparent:{opacity:24,blur:.08,saturation:1,light:.07,edge:.13,shadow:.08},
};
const depth:Record<MaterialCategory,number>={cards:1,buttons:.55,sidebar:1.1,popovers:1.35,dialogs:1.6,inputs:.35,titlebar:.4,floating:1.15};
export function applyMaterialTokens(root:HTMLElement,value:TokenPreferences){
  root.dataset.materialPreset=value.materialPreset;
  root.dataset.sidebarMode=value.sidebarMode;root.dataset.instanceLayout=value.instanceLayout;
  root.dataset.instanceArtwork=value.instanceArtwork;root.dataset.buttonDensity=value.buttonDensity;
  root.dataset.reduceTransparency=String(value.reduceTransparency);
  for(const category of materialCategories){
    const style=value.materialLinked?value.materialStyle:value.materialCategories[category];
    root.dataset[`material${category[0].toUpperCase()}${category.slice(1)}`]=style;
    const p=profiles[style],d=depth[category];
    const multiplier=category==='sidebar'?value.sidebarMaterialIntensity/100:category==='titlebar'?value.titlebarMaterialIntensity/100:1;
    const strength=clamp(value.materialIntensity/100*multiplier,0,1.5);
    const fallback=value.quality==='low'||value.reduceTransparency||value.focus;
    const foreground=category==='buttons'||category==='inputs';
    const opacity=fallback?100:style==='solid'?100:clamp(p.opacity*value.surfaceOpacity/82+(0.5-strength)*14+(category==='inputs'?5:0),18,98);
    const blur=fallback||foreground?0:clamp(value.surfaceBlur*p.blur*d*(.65+strength*.7),0,48);
    const light=p.light*(.55+strength)*(value.materialHighlight/100)*(0.7+value.glassIntensity/70);
    const shadow=p.shadow*(.4+strength)*d*value.materialShadow/100;
    const edge=p.edge*(.7+strength*.4)*value.materialBorder/100;
    const prefix=`--mat-${category}-`;
    const token=(key:string,v:string)=>root.style.setProperty(prefix+key,v);
    token('opacity',`max(${opacity.toFixed(1)}%, var(--surface-floor-${category}))`);
    const base=category==='inputs'?'input':category==='sidebar'?'sidebar':category==='dialogs'?'modal':category==='popovers'?'elevated':'primary';
    token('fill',`color-mix(in srgb, var(--surface-${base}) var(${prefix}opacity), transparent)`);
    token('filter',blur===0?'none':`blur(${blur.toFixed(1)}px) saturate(${(p.saturation*value.materialSaturation/100*(.7+strength*.6)).toFixed(2)}) brightness(${value.materialBrightness/100}) contrast(${value.materialContrast/100})`);
    token('glow',`color-mix(in srgb, var(--highlight) ${(clamp(light,0,.65)*50).toFixed(1)}%, transparent)`);
    token('light',`rgb(255 255 255 / ${clamp(light,0,.65).toFixed(3)})`);
    token('edge',`color-mix(in srgb, var(--border-default) 65%, color-mix(in srgb, var(--text) ${(edge*100).toFixed(1)}%, transparent))`);
    token('shadow',`inset 0 1px 0 var(${prefix}light), inset 1px 0 0 rgb(255 255 255 / ${(light*.3).toFixed(3)}), inset 0 -1px ${style==='liquid'?3:0}px rgb(0 0 0 / ${(edge*.55).toFixed(3)}), 0 0 0 1px rgb(0 0 0 / ${(edge*.35).toFixed(3)}), 0 ${Math.round(4*d)}px ${Math.round(10*d)}px rgb(0 0 0 / ${(shadow*.7).toFixed(3)}), 0 ${Math.round(15*d)}px ${Math.round(34*d)}px rgb(0 0 0 / ${shadow.toFixed(3)})`);
    token('radius',`${foreground?clamp(value.materialRadius*.55,8,16):category==='titlebar'?0:clamp(value.materialRadius*d,8,32)}px`);
    token('tint',value.materialAccent?'color-mix(in srgb, var(--accent) 6%, transparent)':'transparent');
    token('sheen',style==='liquid'?`radial-gradient(ellipse at 10% 0%, var(${prefix}glow), transparent 48%), linear-gradient(155deg, var(${prefix}glow), transparent 27%, rgb(0 0 0 / .035) 74%, var(${prefix}glow))`:`linear-gradient(145deg, var(${prefix}glow), transparent 42%)`);
  }
}
