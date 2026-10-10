import {test,expect} from "@playwright/test";
import {mockIPC,mockWindows,clearMocks} from "@tauri-apps/api/mocks";
import {observeWindowVisibility} from "../src/services/windowVisibility";

let stop=()=>{};
let saved:Record<string,PropertyDescriptor|undefined>;
test.beforeEach(()=>{
 saved=Object.fromEntries(["window","document","isTauri"].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const [key,value] of Object.entries({window:new EventTarget(),document:Object.assign(new EventTarget(),{hidden:true}),isTauri:true}))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 mockWindows("main");
});
test.afterEach(()=>{
 stop();stop=()=>{};clearMocks();
 for(const [key,descriptor] of Object.entries(saved)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
});

test("A shown native window overrides stale WebView visibility and resumes after lost restore events",async()=>{
 let visible=true,minimized=false;const states:boolean[]=[];
 mockIPC(command=>command==="plugin:window|is_visible"?visible:command==="plugin:window|is_minimized"?minimized:null,{shouldMockEvents:true});
 stop=observeWindowVisibility(value=>states.push(value));
 await expect.poll(()=>states.at(-1)).toBe(true);expect(document.hidden).toBe(true);
 minimized=true;window.dispatchEvent(new Event("focus"));await expect.poll(()=>states.at(-1)).toBe(false);
 // A lost focus/visibility event must not leave restored windows frozen.
 await new Promise(resolve=>setTimeout(resolve,200));expect(states.at(-1)).toBe(false);
 minimized=false;await expect.poll(()=>states.at(-1),{timeout:4000}).toBe(true);
 visible=false;window.dispatchEvent(new Event("focus"));await expect.poll(()=>states.at(-1)).toBe(false);
});

test("A late hidden-window response cannot pause a newer visible-window result",async()=>{
 let first=true,release:(visible:boolean)=>void=()=>{};const states:boolean[]=[];
 mockIPC(command=>{
  if(command==="plugin:window|is_visible"){if(first){first=false;return new Promise<boolean>(resolve=>release=resolve);}return true;}
  if(command==="plugin:window|is_minimized")return false;
  return null;
 },{shouldMockEvents:true});
 stop=observeWindowVisibility(value=>states.push(value));
 window.dispatchEvent(new Event("focus"));await expect.poll(()=>states.at(-1)).toBe(true);
 release(false);await new Promise(resolve=>setTimeout(resolve,30));expect(states).not.toContain(false);
});

test("Unmount ignores pending native results and removes polling and browser listeners",async()=>{
 let release:(visible:boolean)=>void=()=>{},calls=0;const states:boolean[]=[];
 mockIPC(command=>{
  if(command==="plugin:window|is_visible"){calls++;return new Promise<boolean>(resolve=>release=resolve);}
  if(command==="plugin:window|is_minimized")return false;
  return null;
 },{shouldMockEvents:true});
 stop=observeWindowVisibility(value=>states.push(value));stop();
 const initial=calls;release(true);window.dispatchEvent(new Event("focus"));document.dispatchEvent(new Event("visibilitychange"));
 await new Promise(resolve=>setTimeout(resolve,2100));expect(states).toEqual([]);expect(calls).toBe(initial);
});

test("Browser previews retain ordinary document visibility without native IPC",()=>{
 Object.defineProperty(globalThis,"isTauri",{value:false,writable:true,configurable:true});const states:boolean[]=[];
 stop=observeWindowVisibility(value=>states.push(value));expect(states.at(-1)).toBe(false);
 Object.defineProperty(document,"hidden",{value:false,writable:true,configurable:true});document.dispatchEvent(new Event("visibilitychange"));expect(states.at(-1)).toBe(true);
});
