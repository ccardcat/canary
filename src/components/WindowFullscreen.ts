import {useEffect} from "react";
import {isTauri} from "@tauri-apps/api/core";
import {getCurrentWindow,type PhysicalPosition,type PhysicalSize} from "@tauri-apps/api/window";
export function useWindowFullscreen(onError:()=>void){
 useEffect(()=>{if(!isTauri())return;const win=getCurrentWindow();let queue=Promise.resolve();let previous:{maximized:boolean;position:PhysicalPosition;size:PhysicalSize}|null=null;let mounted=true;let operations=0;
 const setFullscreen=async(value:boolean)=>{await win.setFullscreen(value);for(let attempt=0;attempt<40;attempt++){if(await win.isFullscreen()===value)return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error("Fullscreen transition was not acknowledged");};
 const toggle=async()=>{const fullscreen=await win.isFullscreen();if(!fullscreen){previous={maximized:await win.isMaximized(),position:await win.outerPosition(),size:await win.innerSize()};await setFullscreen(true);}else{await setFullscreen(false);if(previous){if(previous.maximized)await win.maximize();else{await win.unmaximize();await win.setSize(previous.size);await win.setPosition(previous.position);}}}document.documentElement.dataset.windowFullscreen=String(await win.isFullscreen());};
 const key=(event:KeyboardEvent)=>{if(event.repeat)return;if(event.key==="F11"){operations++;event.preventDefault();queue=queue.then(()=>mounted?toggle():undefined).catch(onError);}else if(event.key==="Escape"&&!event.defaultPrevented&&!document.querySelector('dialog[open],.settings-modal,.instance-surface,.popover,.detail-page,.runtime-error')){queue=queue.then(async()=>{if(mounted&&await win.isFullscreen())await toggle();}).catch(onError);}};
 document.addEventListener("keydown",key);void win.isFullscreen().then(value=>{if(mounted&&operations===0)document.documentElement.dataset.windowFullscreen=String(value);});return()=>{mounted=false;document.removeEventListener("keydown",key);};
 },[]);
}
