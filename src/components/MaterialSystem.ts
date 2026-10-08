export const materialStyles = ['solid', 'soft', 'vibrancy', 'glass', 'clear', 'liquid', 'transparent'] as const;
export type SurfaceMaterial = typeof materialStyles[number];
export const materialCategories = ['cards', 'buttons', 'sidebar', 'popovers', 'dialogs', 'inputs', 'titlebar', 'floating'] as const;
export type MaterialCategory = typeof materialCategories[number];
export type MaterialPreferences = {
  materialPreset: MaterialPreset | 'custom'; materialLinked: boolean; materialStyle: SurfaceMaterial;
  materialCategories: Record<MaterialCategory, SurfaceMaterial>;
  materialIntensity: number; materialSaturation: number; materialBrightness: number;
  materialContrast: number; materialHighlight: number; materialBorder: number;
  materialShadow: number; materialAccent: boolean;
  sidebarMaterialIntensity: number; titlebarMaterialIntensity: number;
  reduceTransparency: boolean;
};
// Layout is persisted beside materials for compatibility, but never applied by a preset.
export type LayoutPreferences = {
  sidebarMode: 'attached' | 'floating'; materialRadius: number;
  instanceLayout: 'comfortable' | 'compact'; instanceArtwork: 'full' | 'ambient' | 'off';
  buttonDensity: 'comfortable' | 'compact';
};
export const layoutDefaults: LayoutPreferences = {
  sidebarMode:'attached', materialRadius:19, instanceLayout:'compact', instanceArtwork:'full', buttonDensity:'comfortable',
};
const categories: MaterialPreferences['materialCategories'] = {cards:'glass', buttons:'soft', sidebar:'vibrancy', popovers:'glass', dialogs:'glass', inputs:'soft', titlebar:'transparent', floating:'glass'};
export const materialDefaults: MaterialPreferences = {
  materialPreset:'canary', materialLinked:false, materialStyle:'glass', materialCategories:categories,
  materialIntensity:50, materialSaturation:100, materialBrightness:100, materialContrast:100,
  materialHighlight:100, materialBorder:100, materialShadow:100,
  materialAccent:false, sidebarMaterialIntensity:100, titlebarMaterialIntensity:100, reduceTransparency:false,
};
export type MaterialValues = MaterialPreferences & {surfaceOpacity:number; surfaceBlur:number};
export const materialPresets = {
  canary:{materialCategories:{...categories}, surfaceOpacity:82, surfaceBlur:16},
  solid:{materialStyle:'solid',materialLinked:true,materialIntensity:40,surfaceOpacity:100,surfaceBlur:0},
  soft:{materialStyle:'soft',materialLinked:true,materialIntensity:40,surfaceOpacity:82,surfaceBlur:8},
  vibrancy:{materialStyle:'vibrancy',materialLinked:true,materialIntensity:60,surfaceOpacity:76,surfaceBlur:28},
  glass:{materialStyle:'glass',materialLinked:true,materialIntensity:50,surfaceOpacity:82,surfaceBlur:18},
  clear:{materialStyle:'clear',materialLinked:true,materialIntensity:50,surfaceOpacity:72,surfaceBlur:18},
  liquid:{materialStyle:'liquid',materialLinked:true,materialIntensity:55,surfaceOpacity:82,surfaceBlur:18},
  transparent:{materialStyle:'transparent',materialLinked:true,materialIntensity:40,surfaceOpacity:60,surfaceBlur:0},
  // Old preset IDs remain valid; loading never reapplies them over a user's settings.
  graphite:{materialStyle:'soft',materialLinked:true,materialIntensity:40,surfaceOpacity:82,surfaceBlur:8},
  minimal:{materialStyle:'solid',materialLinked:true,materialIntensity:40,surfaceOpacity:100,surfaceBlur:0},
  amoled:{materialStyle:'liquid',materialLinked:true,materialIntensity:55,materialHighlight:80,materialBorder:90,surfaceOpacity:90,surfaceBlur:18},
} satisfies Record<string,Partial<MaterialValues>>;
export type MaterialPreset = keyof typeof materialPresets;
export const primaryMaterialPresets = ['solid','soft','vibrancy','glass','clear','liquid','transparent'] as const;
export function materialPresetPatch(preset: MaterialPreset = 'canary'): MaterialValues {
  // Only this typed material object crosses into Appearance; no defaults from layout/background/theme.
  return {...materialDefaults, materialCategories:{...categories},
    ...materialPresets[preset], materialPreset:preset};
}
export function normalizeLayout(saved:Record<string,unknown>):LayoutPreferences {
  const result={...layoutDefaults};
  for (const key of ['sidebarMode','instanceLayout','instanceArtwork','buttonDensity'] as const) {
    const allowed={sidebarMode:['attached','floating'],instanceLayout:['comfortable','compact'],instanceArtwork:['full','ambient','off'],buttonDensity:['comfortable','compact']}[key];
    if (allowed.includes(String(saved[key]))) (result as unknown as Record<string,unknown>)[key]=saved[key];
  }
  if(typeof saved.materialRadius==='number'&&Number.isFinite(saved.materialRadius))result.materialRadius=Math.min(28,Math.max(8,saved.materialRadius));
  return result;
}
const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
export function normalizeMaterials(saved:Record<string,unknown>):MaterialPreferences {
  const result={...materialDefaults,materialCategories:{...categories}};
  const fields=result as unknown as Record<string,unknown>;
  for(const key of Object.keys(result))if(typeof saved[key]===typeof fields[key]&&key!=='materialCategories')fields[key]=saved[key];
  const valid=(s:unknown):s is SurfaceMaterial=>materialStyles.includes(s as SurfaceMaterial);
  if(!valid(result.materialStyle))result.materialStyle='glass';
  const input=saved.materialCategories&&typeof saved.materialCategories==='object'?saved.materialCategories as Record<string,unknown>:{};
  for(const key of materialCategories)if(valid(input[key]))result.materialCategories[key]=input[key];
  for(const [key,[min,max]] of Object.entries({materialIntensity:[0,100],materialSaturation:[50,160],materialBrightness:[80,120],materialContrast:[80,120],materialHighlight:[0,160],materialBorder:[30,160],materialShadow:[0,160],sidebarMaterialIntensity:[0,150],titlebarMaterialIntensity:[0,150]})){
    const n=fields[key];fields[key]=typeof n==='number'&&Number.isFinite(n)?clamp(n,min,max):(materialDefaults as unknown as Record<string,unknown>)[key];
  }
  if(result.materialPreset!=='custom'&&!(result.materialPreset in materialPresets))result.materialPreset='canary';
  // Clear Glass used to be a lower-opacity Glass preset. Preserve explicit layout and artwork.
  if(result.materialPreset==='clear'&&result.materialLinked&&result.materialStyle==='glass')result.materialStyle='clear';
  return result;
}
export type TokenPreferences=MaterialPreferences & {surfaceOpacity:number;surfaceBlur:number;glassIntensity:number;quality:string;focus:boolean;backgroundSource?:string};
// Profiles share one token pipeline. Depth belongs to the semantic category,
// not the page. Controls use a foreground variant to avoid nested backdrop work.
export const materialProfiles:Record<SurfaceMaterial,{opacity:number;blur:number;saturation:number;light:number;edge:number;shadow:number;influence:number}>={
  solid:{opacity:100,blur:0,saturation:1,light:0,edge:.16,shadow:.035,influence:0},
  soft:{opacity:90,blur:.12,saturation:1,light:.012,edge:.08,shadow:.055,influence:.16},
  vibrancy:{opacity:70,blur:1.3,saturation:1.18,light:0,edge:.018,shadow:.07,influence:.88},
  glass:{opacity:76,blur:1,saturation:1,light:.045,edge:.15,shadow:.09,influence:.55},
  clear:{opacity:48,blur:1,saturation:1,light:.018,edge:.075,shadow:.055,influence:.92},
  liquid:{opacity:58,blur:.9,saturation:1.08,light:.075,edge:.13,shadow:.1,influence:.72},
  transparent:{opacity:8,blur:0,saturation:1,light:0,edge:.025,shadow:0,influence:1},
};
const depth:Record<MaterialCategory,number>={cards:1,buttons:.55,sidebar:1.1,popovers:1.25,dialogs:1.3,inputs:.35,titlebar:.4,floating:1.15};
export function applyMaterialTokens(root:HTMLElement,value:TokenPreferences){
  root.dataset.materialPreset=value.materialPreset;
  root.dataset.reduceTransparency=String(value.reduceTransparency);
  for(const category of materialCategories){
    const style=value.materialLinked?value.materialStyle:value.materialCategories[category];
    root.dataset[`material${category[0].toUpperCase()}${category.slice(1)}`]=style;
    const p=materialProfiles[style],d=depth[category];
    const multiplier=category==='sidebar'?value.sidebarMaterialIntensity/100:category==='titlebar'?value.titlebarMaterialIntensity/100:1;
    const strength=clamp(value.materialIntensity/100*multiplier,0,1.5);
    const fallback=value.quality==='low'||value.reduceTransparency||value.focus;
    const foreground=category==='buttons'||category==='inputs';
    // Native desktop material already supplies depth below the WebView. Keep
    // foreground surfaces translucent instead of masking it with a second veil.
    const desktop=value.backgroundSource==='desktop';
    const transparencyScale=desktop?.72:1;
    const opacity=fallback?100:style==='solid'?100:clamp((p.opacity*value.surfaceOpacity/82+(0.5-strength)*8)*transparencyScale,4,98);
    const blur=fallback||foreground?0:clamp(value.surfaceBlur*p.blur*d*(.75+strength*.5),0,32);
    const light=clamp(p.light*(.65+strength)*value.materialHighlight/100*(.7+value.glassIntensity/70),0,.14);
    const shadow=clamp(p.shadow*(.4+strength)*d*value.materialShadow/100,0,.18);
    const edge=clamp(Math.max(p.edge,desktop?.075:0)*(.7+strength*.4)*value.materialBorder/100,0,.22);
    const prefix=`--mat-${category}-`;
    const token=(key:string,v:string)=>root.style.setProperty(prefix+key,v);
    // Readable control tints follow user opacity instead of imposing opaque fills.
    const floor=category==='popovers'?clamp(value.surfaceOpacity+10,68,98):
      category==='dialogs'?clamp(value.surfaceOpacity+6,46,96):
      category==='floating'?clamp(value.surfaceOpacity+2,38,94):
      foreground?clamp(value.surfaceOpacity-6,24,92):0;
    const effective=Math.max(opacity,fallback?100:style==='solid'?100:floor*transparencyScale);
    token('opacity',effective.toFixed(1)+'%');
    const base=category==='inputs'?'input':category==='sidebar'?'sidebar':category==='dialogs'?'modal':category==='popovers'?'elevated':'primary';
    token('fill',`color-mix(in srgb, var(--surface-${base}) var(${prefix}opacity), transparent)`);
    token('readable-fill','transparent');
    token('blur',`${blur.toFixed(1)}px`);
    token('saturation',`${(p.saturation*value.materialSaturation/100*(.85+strength*.3)).toFixed(2)}`);
    token('filter',blur===0?'none':`blur(var(${prefix}blur)) saturate(var(${prefix}saturation)) brightness(${value.materialBrightness/100}) contrast(${value.materialContrast/100})`);
    token('background-influence',String(fallback?0:p.influence));
    token('glow',`rgb(255 255 255 / ${(light*.45).toFixed(3)})`);
    token('light',`rgb(255 255 255 / ${light.toFixed(3)})`);
    token('edge',`color-mix(in srgb, var(--text) ${(edge*100).toFixed(1)}%, transparent)`);
    const outer=`0 ${Math.round((style==='soft'?4:8)*d)}px ${Math.round((style==='soft'?20:28)*d)}px rgb(0 0 0 / calc(${shadow.toFixed(3)} * var(--material-shadow-strength)))`;
    token('shadow',style==='transparent'?'none':style==='liquid'?`inset 0 1px 0 var(${prefix}light), ${outer}`:outer);
    token('tint',value.materialAccent?'color-mix(in srgb, var(--accent) 6%, transparent)':style==='vibrancy'?'color-mix(in srgb, var(--surface-secondary) 8%, transparent)':'transparent');
    token('sheen',style==='liquid'?`linear-gradient(155deg, var(${prefix}glow), transparent 38%, rgb(255 255 255 / ${(light*.16).toFixed(3)}) 76%, transparent)`:
      style==='glass'||style==='clear'?`linear-gradient(180deg, var(${prefix}glow), transparent 28%)`:'linear-gradient(transparent,transparent)');
  }
}

export function applyLayoutTokens(root:HTMLElement,value:LayoutPreferences) {
  root.dataset.sidebarMode=value.sidebarMode;root.dataset.instanceLayout=value.instanceLayout;
  root.dataset.instanceArtwork=value.instanceArtwork;root.dataset.buttonDensity=value.buttonDensity;
  for(const category of materialCategories){
    const foreground=category==='buttons'||category==='inputs';
    root.style.setProperty(`--mat-${category}-radius`,`${foreground?clamp(value.materialRadius*.55,8,16):category==='titlebar'?0:clamp(value.materialRadius*depth[category],8,32)}px`);
  }
}
