import {test,expect} from "@playwright/test";
import {normalizeSidebar,sidebarInk,sidebarDefaults,applySidebarTokens} from "../src/services/sidebarAppearance";

test("Existing sidebar preferences retain picture behavior without applying a new preset",()=>{
  expect(normalizeSidebar({sidebar:"amethyst-cave",sidebarIntensity:37})).toEqual(sidebarDefaults);
});
test("Invalid colors and source values cannot reach CSS, opacity is finite and bounded",()=>{
  expect(normalizeSidebar({sidebarBackgroundSource:"broken",sidebarColor:"url(secret)",sidebarColorOpacity:NaN})).toEqual(sidebarDefaults);
  expect(normalizeSidebar({sidebarBackgroundSource:["color"]})).toEqual(sidebarDefaults);
  expect(normalizeSidebar({sidebarBackgroundSource:"color",sidebarColor:"#ABCDEF",sidebarColorOpacity:999})).toEqual({sidebarBackgroundSource:"color",sidebarColor:"#abcdef",sidebarColorOpacity:100});
  expect(normalizeSidebar({sidebarColorOpacity:-50}).sidebarColorOpacity).toBe(20);
});
test("Custom colors choose readable ink at both light and dark extremes",()=>{
  expect(sidebarInk("#ffffff")).toBe("#111111");
  expect(sidebarInk("#001122")).toBe("#ffffff");
  expect(sidebarInk("#ffcc00")).toBe("#111111");
});
test("Sidebar tokens stay separate from launcher background and global text tokens",()=>{
  const tokens=new Map<string,string>();const root={dataset:{backgroundSource:"canary"},style:{setProperty:(key:string,value:string)=>tokens.set(key,value)}} as unknown as HTMLElement;
  applySidebarTokens(root,{sidebarBackgroundSource:"color",sidebarColor:"#ffffff",sidebarColorOpacity:65});
  expect(root.dataset).toMatchObject({backgroundSource:"canary",sidebarBackground:"color",sidebarColorInk:"dark"});
  expect(tokens.get("--sidebar-color-opacity")).toBe("65%");expect(tokens.has("--text")).toBe(false);expect(tokens.has("--wallpaper-opacity")).toBe(false);
});
