export type SidebarPreferences = {sidebarBackgroundSource:"picture"|"theme"|"color";sidebarColor:string;sidebarColorOpacity:number};
export const sidebarDefaults:SidebarPreferences={sidebarBackgroundSource:"picture",sidebarColor:"#273343",sidebarColorOpacity:100};
export function normalizeSidebar(saved:Record<string,unknown>):SidebarPreferences {
  return {
    sidebarBackgroundSource:typeof saved.sidebarBackgroundSource==="string"&&["picture","theme","color"].includes(saved.sidebarBackgroundSource)?saved.sidebarBackgroundSource as SidebarPreferences["sidebarBackgroundSource"]:"picture",
    sidebarColor:typeof saved.sidebarColor==="string"&&/^#[\da-f]{6}$/i.test(saved.sidebarColor)?saved.sidebarColor.toLowerCase():sidebarDefaults.sidebarColor,
    sidebarColorOpacity:typeof saved.sidebarColorOpacity==="number"&&Number.isFinite(saved.sidebarColorOpacity)?Math.min(100,Math.max(20,saved.sidebarColorOpacity)):100,
  };
}
const luminance=(color:string)=>{
  const channels=[1,3,5].map(start=>parseInt(color.slice(start,start+2),16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
};
export function sidebarInk(color:string) {
  if(!/^#[\da-f]{6}$/i.test(color))return "#ffffff";
  const light=luminance(color),dark=luminance("#111111");
  return (light+.05)/(dark+.05)>1.05/(light+.05)?"#111111":"#ffffff";
}
export function applySidebarTokens(root:HTMLElement,value:SidebarPreferences) {
  root.dataset.sidebarBackground=value.sidebarBackgroundSource;
  root.style.setProperty("--sidebar-color",value.sidebarColor);
  root.style.setProperty("--sidebar-color-opacity",value.sidebarColorOpacity+"%");
  root.style.setProperty("--sidebar-color-ink",sidebarInk(value.sidebarColor));
  root.dataset.sidebarColorInk=sidebarInk(value.sidebarColor)==="#111111"?"dark":"light";
}
